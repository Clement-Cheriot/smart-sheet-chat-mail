import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const sendSummaryViaOptions = async (
      summaryMessage: string, 
      userId: string, 
      sendText: boolean, 
      sendAudio: boolean
    ) => {
      try {
        if (sendText) {
          await supabase.functions.invoke('telegram-sender', {
            body: {
              userId,
              message: summaryMessage,
            }
          });
        }

        if (sendAudio) {
          // Generate audio from summary
          const { data: audioData, error: audioError } = await supabase.functions.invoke('text-to-speech', {
            body: { summaryText: summaryMessage }
          });

          if (audioError) {
            console.error('Error generating audio:', audioError);
          } else {
            // Send audio via Telegram
            await supabase.functions.invoke('telegram-sender', {
              body: { 
                userId,
                message: "🎧 Résumé audio de vos emails",
                audioBase64: audioData.audioBase64
              }
            });
          }
        }
      } catch (error) {
        console.error('Error sending summary via options:', error);
      }
    };

    const { userId, period, startDate, endDate, sendTelegramText, sendTelegramAudio } = await req.json();
    console.log(`Generating ${period} summary for user:`, userId);

    // Determine time range based on period
    let startTime: Date;
    let endTime: Date;

    if (period === 'custom' && startDate && endDate) {
      startTime = new Date(startDate);
      endTime = new Date(endDate);
    } else if (period === 'daily') {
      startTime = new Date();
      startTime.setHours(0, 0, 0, 0);
      endTime = new Date();
    } else if (period === 'weekly') {
      startTime = new Date();
      startTime.setDate(startTime.getDate() - 7);
      endTime = new Date();
    } else {
      throw new Error('Invalid period. Use "daily", "weekly", or "custom" with dates');
    }

    // Get email history for period
    const { data: emails, error: emailsError } = await supabase
      .from('email_history')
      .select('*')
      .eq('user_id', userId)
      .gte('processed_at', startTime.toISOString())
      .lte('processed_at', endTime.toISOString())
      .order('processed_at', { ascending: false });

    if (emailsError) throw emailsError;

    // Calculate statistics with richer breakdowns
    const totalEmails = emails?.length || 0;

    // Count by action labels
    const actionsToReply = (emails || []).filter((e: any) => {
      const labels = Array.isArray(e.applied_label) ? e.applied_label : [];
      return labels.some((l: string) => l.includes('Actions/A répondre'));
    }).length;

    const actionsToDelete = (emails || []).filter((e: any) => {
      const labels = Array.isArray(e.applied_label) ? e.applied_label : [];
      return labels.some((l: string) => l.includes('Actions/A supprimer'));
    }).length;

    const actionsManualReview = (emails || []).filter((e: any) => {
      const labels = Array.isArray(e.applied_label) ? e.applied_label : [];
      return labels.some((l: string) => l.includes('Actions/Revue Manuelle'));
    }).length;

    const actionsNothing = (emails || []).filter((e: any) => {
      const labels = Array.isArray(e.applied_label) ? e.applied_label : [];
      return labels.some((l: string) => l.includes('Actions/Rien à faire'));
    }).length;

    const draftsCreated = (emails || []).filter((e: any) => e.draft_created).length;
    const autoReplies = (emails || []).filter((e: any) =>
      (e.ai_analysis?.response_type === 'auto') ||
      (Array.isArray(e.actions_taken) && e.actions_taken.some((a: any) => a.type === 'auto_reply'))
    ).length;
    const notificationsSent = (emails || []).filter((e: any) => e.telegram_notified).length;
    const calendarActions = (emails || []).filter((e: any) => e.ai_analysis?.needs_calendar_action).length;

    // Count by categories (excluding Actions/ labels)
    const categoryCounts: Record<string, number> = {};
    (emails || []).forEach((e: any) => {
      const labels = Array.isArray(e.applied_label) ? e.applied_label : [];
      labels.forEach((label: string) => {
        if (!label.startsWith('Actions/')) {
          categoryCounts[label] = (categoryCounts[label] || 0) + 1;
        }
      });
    });

    // Suggested new labels and rule reinforcements
    const proposedLabels = Array.from(new Set((emails || [])
      .map((e: any) => e.suggested_new_label || e.ai_analysis?.suggested_label)
      .filter((v: any) => !!v))) as string[];

    const ruleReinforcements = (emails || [])
      .map((e: any) => e.rule_reinforcement_suggestion)
      .filter((v: any) => !!v) as string[];

    // Build summary in requested format (FR)
    const formatFR = (d: Date) => d.toLocaleString('fr-FR', { 
      dateStyle: 'medium', 
      timeStyle: 'short',
      timeZone: 'Europe/Paris'
    });

    const lines: string[] = [];
    lines.push(`Résumé du ${formatFR(startTime)} au ${formatFR(endTime)}:`);
    lines.push(`📊 Total emails traités : ${totalEmails}`);
    lines.push(`⚠️ En attente de revue manuelle : ${actionsManualReview}`);
    lines.push(`🗑️ À supprimer : ${actionsToDelete}`);
    lines.push(`📧 À répondre : ${actionsToReply}`);
    lines.push(`✅ Rien à faire : ${actionsNothing}`);
    lines.push(`📝 Brouillons écrits : ${draftsCreated}`);
    lines.push(`🤖 Réponses automatiques : ${autoReplies}`);
    lines.push(`🔔 Notifications envoyées : ${notificationsSent}`);
    lines.push(`📅 Calendar : ${calendarActions}`);
    lines.push('');

    // Show categories
    if (Object.keys(categoryCounts).length > 0) {
      lines.push('📂 Catégories :');
      const sortedCategories = Object.entries(categoryCounts)
        .sort((a, b) => b[1] - a[1]);
      sortedCategories.forEach(([cat, count]) => {
        lines.push(`• ${cat}: ${count}`);
      });
      lines.push('');
    }

    if (proposedLabels.length > 0) {
      lines.push('💡 Nouveaux labels proposés :');
      proposedLabels.slice(0, 3).forEach((label, idx) => {
        lines.push(`${idx + 1}. ${label} (à valider dans l'application)`);
      });
      lines.push('');
    }

    if (ruleReinforcements.length > 0) {
      lines.push(`Renforcement de ${ruleReinforcements.length} règle${ruleReinforcements.length > 1 ? 's' : ''} proposé${ruleReinforcements.length > 1 ? 's' : ''} :`);
      ruleReinforcements.slice(0, 5).forEach((r) => lines.push(`${r} (à valider dans l'application)`));
      lines.push('');
    }

    lines.push('🔄 Action :');
    if (actionsManualReview > 0) lines.push(`Revoir les ${actionsManualReview} email${actionsManualReview > 1 ? 's' : ''} manuellement.`);
    if (actionsToReply > 0) lines.push(`Répondre à ${actionsToReply} email${actionsToReply > 1 ? 's' : ''}.`);
    if (draftsCreated > 0) lines.push('Voir les brouillons proposés.');
    if (notificationsSent > 0) lines.push('Vérifier les notifications envoyées.');

    const summaryMessage = lines.join('\n');

    // Send via Telegram based on options
    // If neither is explicitly set, default to sending text only
    const shouldSendText = sendTelegramText !== false; // true if undefined or true
    const shouldSendAudio = sendTelegramAudio === true; // only true if explicitly true
    
    await sendSummaryViaOptions(
      summaryMessage, 
      userId, 
      shouldSendText, 
      shouldSendAudio
    );

    // Log activity
    await supabase.from('activity_logs').insert({
      user_id: userId,
      action_type: 'summary_sent',
      action_details: { 
        period, 
        totalEmails, 
        actionsManualReview,
        actionsToDelete,
        actionsToReply,
        actionsNothing,
        draftsCreated, 
        autoReplies, 
        notificationsSent, 
        calendarActions 
      },
      status: 'success'
    });

    return new Response(
      JSON.stringify({ 
        success: true,
        summary: summaryMessage,
        stats: {
          totalEmails,
          actionsManualReview,
          actionsToDelete,
          actionsToReply,
          actionsNothing,
          draftsCreated,
          autoReplies,
          notificationsSent,
          calendarActions
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error generating summary:', error);

    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

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

    const { userId, period, startDate, endDate } = await req.json();
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

    const pendingReviewList = (emails || []).filter((e: any) => {
      const hasLabel = Array.isArray(e.applied_label) ? e.applied_label.length > 0 : !!e.applied_label;
      const hasActions = Array.isArray(e.actions_taken) ? e.actions_taken.length > 0 : false;
      return !hasLabel && !e.draft_created && !hasActions; // nothing applied/generated yet
    });
    const pendingReview = pendingReviewList.length;

    const draftsCreated = (emails || []).filter((e: any) => e.draft_created).length;
    const autoReplies = (emails || []).filter((e: any) =>
      (e.ai_analysis?.response_type === 'auto') ||
      (Array.isArray(e.actions_taken) && e.actions_taken.some((a: any) => a.type === 'auto_reply'))
    ).length;
    const notificationsSent = (emails || []).filter((e: any) => e.whatsapp_notified).length;
    const calendarActions = (emails || []).filter((e: any) => e.ai_analysis?.needs_calendar_action).length;

    // Group pending review by sender and category
    const bySender: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    pendingReviewList.forEach((e: any) => {
      const sender = e.sender || 'Expéditeur inconnu';
      bySender[sender] = (bySender[sender] || 0) + 1;
      const cat = e.ai_analysis?.category || 'divers';
      byCategory[cat] = (byCategory[cat] || 0) + 1;
    });

    // Suggested new labels and rule reinforcements
    const proposedLabels = Array.from(new Set((emails || [])
      .map((e: any) => e.suggested_new_label || e.ai_analysis?.suggested_label)
      .filter((v: any) => !!v))) as string[];

    const ruleReinforcements = (emails || [])
      .map((e: any) => e.rule_reinforcement_suggestion)
      .filter((v: any) => !!v) as string[];

    // Build summary in requested format (FR)
    const formatFR = (d: Date) => d.toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

    const lines: string[] = [];
    lines.push(`Résumé du ${formatFR(startTime)} au ${formatFR(endTime)}:`);
    lines.push(`📊 Total emails traités : ${totalEmails}`);
    lines.push(`⚠️ En attente de revue manuelle : ${pendingReview}`);
    lines.push(`📝 Brouillons écrits : ${draftsCreated}`);
    lines.push(`🤖 Réponses automatiques : ${autoReplies}`);
    lines.push(`🔔 Notifications envoyées : ${notificationsSent}`);
    lines.push(`📅 Calendar : ${calendarActions}`);
    lines.push('');

    if (pendingReview > 0) {
      lines.push(`📁 Détails des emails à revoir :`);
      // Top senders (up to 3)
      const topSenders = Object.entries(bySender)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);
      topSenders.forEach(([sender, count]) => {
        const catText = Object.entries(byCategory)
          .sort((a, b) => b[1] - a[1])
          .map(([c, n]) => `- ${n} email${n > 1 ? 's' : ''} dans la catégorie ${c}`)
          .slice(0, 2);
        lines.push(`• ${count} email${count > 1 ? 's' : ''} de ${sender} nécessitent une revue manuelle, car ils n'ont pas de règles existantes.`);
        catText.forEach((t) => lines.push(t));
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
    if (pendingReview > 0) lines.push(`Revoir les ${pendingReview} email${pendingReview > 1 ? 's' : ''} manuellement.`);
    if (draftsCreated > 0) lines.push('Voir les brouillons proposés.');
    if (notificationsSent > 0) lines.push('Vérifier les notifications envoyées.');

    const summaryMessage = lines.join('\n');

    // Send via WhatsApp
    await supabase.functions.invoke('whatsapp-sender', {
      body: {
        userId,
        type: 'summary',
        message: summaryMessage,
      }
    });

    // Log activity
    await supabase.from('activity_logs').insert({
      user_id: userId,
      action_type: 'summary_sent',
      action_details: { period, totalEmails, pendingReview, draftsCreated, autoReplies, notificationsSent, calendarActions },
      status: 'success'
    });

    return new Response(
      JSON.stringify({ 
        success: true,
        summary: summaryMessage,
        stats: {
          totalEmails,
          pendingReview,
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

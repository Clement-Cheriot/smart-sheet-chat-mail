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

    const { userId, period } = await req.json();
    console.log(`Generating ${period} summary for user:`, userId);

    // Get time range based on period
    const now = new Date();
    let startTime: Date;
    
    if (period === 'daily') {
      startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    } else if (period === 'weekly') {
      startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else {
      startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    // Get email history for period
    const { data: emails, error: emailsError } = await supabase
      .from('email_history')
      .select('*')
      .eq('user_id', userId)
      .gte('processed_at', startTime.toISOString())
      .order('processed_at', { ascending: false });

    if (emailsError) throw emailsError;

    // Calculate statistics
    const totalEmails = emails?.length || 0;
    const highPriority = emails?.filter(e => e.priority_score >= 7).length || 0;
    const draftsCreated = emails?.filter(e => e.draft_created).length || 0;
    
    // Group by label
    const labelCounts: Record<string, number> = {};
    emails?.forEach(email => {
      if (email.applied_label) {
        labelCounts[email.applied_label] = (labelCounts[email.applied_label] || 0) + 1;
      }
    });

    // Generate summary message
    const summaryLines = [
      `📊 Résumé ${period === 'daily' ? 'quotidien' : 'hebdomadaire'}`,
      '',
      `📧 Total: ${totalEmails} emails traités`,
      `🚨 Urgents: ${highPriority} emails`,
      `📝 Brouillons: ${draftsCreated} créés`,
      '',
      '🏷️ Par catégorie:',
    ];

    Object.entries(labelCounts).forEach(([label, count]) => {
      summaryLines.push(`  • ${label}: ${count}`);
    });

    if (highPriority > 0) {
      summaryLines.push('', '⚠️ Emails urgents à traiter:');
      const urgentEmails = emails?.filter(e => e.priority_score >= 7).slice(0, 5);
      urgentEmails?.forEach(email => {
        summaryLines.push(`  • ${email.sender}: ${email.subject}`);
      });
    }

    const summaryMessage = summaryLines.join('\n');

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
      action_details: { period, totalEmails, highPriority },
      status: 'success'
    });

    return new Response(
      JSON.stringify({ 
        success: true,
        summary: {
          totalEmails,
          highPriority,
          draftsCreated,
          labels: labelCounts
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

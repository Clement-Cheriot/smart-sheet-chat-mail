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

    const { userId } = await req.json();
    console.log('Syncing rules from Google Sheets for user:', userId);

    // Get user's Google Sheets ID
    const { data: config, error: configError } = await supabase
      .from('user_api_configs')
      .select('google_sheets_id, gmail_credentials')
      .eq('user_id', userId)
      .single();

    if (configError || !config?.google_sheets_id) {
      throw new Error('Google Sheets ID not configured for user');
    }

    // Fetch rules from Google Sheets
    // In production, use Google Sheets API with OAuth credentials
    const rules = await fetchRulesFromSheets(
      config.google_sheets_id,
      config.gmail_credentials
    );

    console.log(`Fetched ${rules.length} rules from Google Sheets`);

    // Delete existing rules for this user
    const { error: deleteError } = await supabase
      .from('email_rules')
      .delete()
      .eq('user_id', userId);

    if (deleteError) throw deleteError;

    // Insert new rules
    if (rules.length > 0) {
      const rulesWithUserId = rules.map((rule, index) => ({
        ...rule,
        user_id: userId,
        rule_order: index,
      }));

      const { error: insertError } = await supabase
        .from('email_rules')
        .insert(rulesWithUserId);

      if (insertError) throw insertError;
    }

    // Log activity
    await supabase.from('activity_logs').insert({
      user_id: userId,
      action_type: 'rules_synced',
      action_details: { rulesCount: rules.length },
      status: 'success'
    });

    return new Response(
      JSON.stringify({ 
        success: true,
        syncedRules: rules.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error syncing rules:', error);

    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

async function fetchRulesFromSheets(sheetsId: string, credentials: any): Promise<any[]> {
  // Mock implementation - in production, use Google Sheets API
  console.log(`Fetching rules from sheet: ${sheetsId}`);
  
  // Example structure of rules from Google Sheets:
  // Column A: sender_pattern
  // Column B: keywords (comma-separated)
  // Column C: label_to_apply
  // Column D: priority (low/medium/high)
  // Column E: auto_action
  // Column F: response_template
  
  // Example Google Sheets API call:
  // const response = await fetch(
  //   `https://sheets.googleapis.com/v4/spreadsheets/${sheetsId}/values/Rules!A2:F100`,
  //   {
  //     headers: {
  //       'Authorization': `Bearer ${credentials.access_token}`,
  //     }
  //   }
  // );
  // const data = await response.json();
  // return data.values.map(row => ({
  //   sender_pattern: row[0],
  //   keywords: row[1] ? row[1].split(',').map(k => k.trim()) : [],
  //   label_to_apply: row[2],
  //   priority: row[3] || 'medium',
  //   auto_action: row[4],
  //   response_template: row[5],
  //   is_active: true,
  // }));
  
  // Return mock data for now
  return [
    {
      sender_pattern: '.*@example\\.com',
      keywords: ['urgent', 'important'],
      label_to_apply: 'Work',
      priority: 'high',
      auto_action: 'create_draft',
      response_template: 'Merci pour votre message. Je reviendrai vers vous rapidement.',
      is_active: true,
    }
  ];
}

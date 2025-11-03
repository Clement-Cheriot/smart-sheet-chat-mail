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

async function fetchRulesFromSheets(
  sheetsId: string,
  credentials: any
): Promise<any[]> {
  try {
    // Extract the actual spreadsheet ID from the URL if needed
    const spreadsheetId = sheetsId.includes('/') 
      ? sheetsId.match(/\/d\/([a-zA-Z0-9-_]+)/)?.[1] || sheetsId
      : sheetsId;
    
    console.log('Fetching rules from Google Sheets:', spreadsheetId);

    // Get access token from credentials
    const accessToken = credentials.access_token;
    if (!accessToken) {
      throw new Error('No access token available');
    }

    // Fetch data from Google Sheets
    // Expecting columns: Label, Sender Pattern, Keywords, Priority, Auto Action, Response Template
    const range = 'A2:F100'; // Skip header row, fetch up to 100 rules
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Google Sheets API error:', error);
      throw new Error(`Failed to fetch from Google Sheets: ${response.status}`);
    }

    const data = await response.json();
    const rows = data.values || [];

    console.log(`Found ${rows.length} rules in Google Sheets`);

    // Transform rows into rule objects
    return rows
      .filter((row: string[]) => row[0]) // Must have a label
      .map((row: string[]) => ({
        label_to_apply: row[0] || '',
        sender_pattern: row[1] || null,
        keywords: row[2] ? row[2].split(',').map((k: string) => k.trim()) : [],
        priority: row[3] || 'medium',
        auto_action: row[4] || 'label',
        response_template: row[5] || null,
      }));
  } catch (error) {
    console.error('Error fetching from Google Sheets:', error);
    throw error;
  }
}

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

async function refreshAccessToken(credentials: any): Promise<string> {
  const clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET');
  
  if (!credentials.refresh_token) {
    throw new Error('No refresh token available');
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId!,
      client_secret: clientSecret!,
      refresh_token: credentials.refresh_token,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to refresh access token');
  }

  const data = await response.json();
  return data.access_token;
}

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

    // Try with current access token, refresh if needed
    let accessToken = credentials.access_token;
    if (!accessToken) {
      throw new Error('No access token available');
    }

    // Fetch data from Google Sheets
    // Format: rule_id | classification | priority | enables | conditions | description
    const range = 'A2:F100'; // Skip header row, fetch up to 100 rules
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;
    
    let response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    // If 401/403, try refreshing token
    if (!response.ok && (response.status === 401 || response.status === 403)) {
      console.log('Access token expired, refreshing...');
      accessToken = await refreshAccessToken(credentials);
      
      response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });
    }

    if (!response.ok) {
      const error = await response.text();
      console.error('Google Sheets API error:', error);
      throw new Error(`Failed to fetch from Google Sheets: ${response.status}`);
    }

    const data = await response.json();
    const rows = data.values || [];

    console.log(`Found ${rows.length} rules in Google Sheets`);

    // Transform rows: rule_id | classification | priority | enables | conditions | description
    return rows
      .filter((row: string[]) => row[0] && row[1]) // Must have rule_id and classification
      .map((row: string[]) => {
        // Parse conditions JSON (should contain sender_pattern, keywords, etc.)
        let parsedConditions: any = {};
        try {
          parsedConditions = row[4] ? JSON.parse(row[4]) : {};
        } catch (e) {
          console.warn(`Failed to parse conditions for rule ${row[0]}:`, e);
        }

        return {
          label_to_apply: row[1] || '', // classification
          sender_pattern: parsedConditions.sender_pattern || null,
          keywords: parsedConditions.keywords || [],
          priority: row[2]?.toLowerCase() || 'medium', // priority
          auto_action: parsedConditions.auto_action || 'label',
          response_template: row[5] || null, // description
          is_active: row[3]?.toLowerCase() === 'true' || row[3] === '1' || true, // enables
        };
      });
  } catch (error) {
    console.error('Error fetching from Google Sheets:', error);
    throw error;
  }
}

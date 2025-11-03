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
    console.log('Syncing emails for user:', userId);

    // Get user's Gmail credentials
    const { data: config, error: configError } = await supabase
      .from('user_api_configs')
      .select('gmail_credentials')
      .eq('user_id', userId)
      .single();

    if (configError || !config?.gmail_credentials) {
      throw new Error('Gmail not connected for user');
    }

    const credentials = config.gmail_credentials;
    let accessToken = credentials.access_token;

    // Get the last processed message ID to avoid duplicates
    const { data: lastEmail } = await supabase
      .from('email_history')
      .select('gmail_message_id')
      .eq('user_id', userId)
      .order('received_at', { ascending: false })
      .limit(1)
      .single();

    // Fetch new messages from Gmail
    const gmailUrl = lastEmail?.gmail_message_id
      ? `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=after:${Math.floor(Date.now() / 1000) - 3600}`
      : `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10`;

    let response = await fetch(gmailUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    // Refresh token if expired
    if (!response.ok && (response.status === 401 || response.status === 403)) {
      console.log('Refreshing access token...');
      accessToken = await refreshAccessToken(credentials);
      response = await fetch(gmailUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });
    }

    if (!response.ok) {
      throw new Error(`Gmail API error: ${response.status}`);
    }

    const data = await response.json();
    const messages = data.messages || [];

    console.log(`Found ${messages.length} new messages`);

    // Process each message through email-processor
    for (const message of messages) {
      try {
        // Fetch full message details
        const msgResponse = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}`,
          { headers: { 'Authorization': `Bearer ${accessToken}` } }
        );
        
        if (!msgResponse.ok) {
          console.error(`Failed to fetch message ${message.id}: ${msgResponse.status}`);
          continue;
        }

        const fullMessage = await msgResponse.json();
        
        // Extract headers
        const headers = fullMessage.payload?.headers || [];
        const getHeader = (name: string) => headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || '';
        
        const sender = getHeader('from');
        const subject = getHeader('subject');
        const date = getHeader('date');
        
        // Extract body
        let body = '';
        if (fullMessage.payload?.body?.data) {
          body = atob(fullMessage.payload.body.data.replace(/-/g, '+').replace(/_/g, '/'));
        } else if (fullMessage.payload?.parts) {
          for (const part of fullMessage.payload.parts) {
            if (part.mimeType === 'text/plain' && part.body?.data) {
              body = atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));
              break;
            }
          }
        }

        // Process email
        const { data: msgData, error: processError } = await supabase.functions.invoke('email-processor', {
          body: {
            userId,
            messageId: message.id,
            sender,
            subject,
            body,
            receivedAt: date || new Date().toISOString(),
          }
        });
        
        if (processError) {
          console.error(`Error processing message ${message.id}:`, processError);
        } else {
          console.log(`Processed message ${message.id}:`, msgData);
        }
      } catch (err) {
        console.error(`Exception processing message ${message.id}:`, err);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        processedCount: messages.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error syncing emails:', error);
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

  const { access_token } = await response.json();
  return access_token;
}

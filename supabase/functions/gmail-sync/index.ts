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

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  let userId: string | null = null;

  try {
    const body = await req.json();
    userId = body.userId;
    const forceReset: boolean = Boolean(body.forceReset);
    const fullSync: boolean = Boolean(body.fullSync);
    console.log('Syncing emails for user:', userId, 'forceReset:', forceReset, 'fullSync:', fullSync);

    // Load existing state first to avoid setting last_synced_at prematurely
    const { data: stateRow } = await supabase
      .from('gmail_sync_state')
      .select('last_synced_at, sync_in_progress, updated_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (stateRow?.sync_in_progress) {
      if (forceReset) {
        console.log('Force reset requested. Clearing sync flag for user:', userId);
        await supabase
          .from('gmail_sync_state')
          .update({ sync_in_progress: false, updated_at: new Date().toISOString() })
          .eq('user_id', userId);
      } else {
        const updatedAtMs = stateRow.updated_at ? new Date(stateRow.updated_at as string).getTime() : 0;
        const isStale = !updatedAtMs || (Date.now() - updatedAtMs) > 20 * 1000; // >20s
        if (isStale) {
          console.log('Stale sync flag detected. Resetting and continuing for user:', userId);
          await supabase
            .from('gmail_sync_state')
            .update({ sync_in_progress: false, updated_at: new Date().toISOString() })
            .eq('user_id', userId);
        } else {
          console.log('Sync already in progress for user:', userId);
          return new Response(
            JSON.stringify({ 
              success: false, 
              reason: 'sync_already_in_progress',
              message: 'Une synchronisation est déjà en cours'
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    }

    // Prepare sync window
    let lastSyncedAt: string | null = fullSync ? null : (stateRow?.last_synced_at ?? null);
    let firstSync = !stateRow || fullSync;

    // Now set sync_in_progress to true (will insert row if missing)
    await supabase
      .from('gmail_sync_state')
      .upsert(
        { user_id: userId, sync_in_progress: true, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      );

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

    // Sanity check: fetch Gmail profile to confirm access and get mailbox size
    let messagesTotalEstimate: number | null = null;
    let profileRes: Response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    if (!profileRes.ok && (profileRes.status === 401 || profileRes.status === 403)) {
      accessToken = await refreshAccessToken(credentials);
      await supabase
        .from('user_api_configs')
        .update({ gmail_credentials: { ...credentials, access_token: accessToken } })
        .eq('user_id', userId);
      profileRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
    }
    if (profileRes.ok) {
      const profile: any = await profileRes.json();
      console.log('Gmail profile:', { emailAddress: profile.emailAddress, messagesTotal: profile.messagesTotal });
      messagesTotalEstimate = typeof profile.messagesTotal === 'number' ? profile.messagesTotal : null;
    } else {
      console.warn('Failed to load Gmail profile:', profileRes.status);
    }

    // Determine first sync if an existing state row was created previously but no emails processed yet
    if (!firstSync && lastSyncedAt) {
      const { count } = await supabase
        .from('email_history')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId);
      if ((count ?? 0) === 0) {
        firstSync = true;
        lastSyncedAt = null; // Ensure we fetch a meaningful initial batch
      }
    }

    // Get all processed message IDs to avoid duplicates
    const { data: processedEmails } = await supabase
      .from('email_history')
      .select('gmail_message_id')
      .eq('user_id', userId);

    const processedIds = new Set(processedEmails?.map(e => e.gmail_message_id) || []);

    // Build Gmail query (prefer labelIds=INBOX and minimal q to avoid over-filtering)
    const baseQuery = '-in:drafts -in:spam';
    let query = baseQuery;
    if (!firstSync && lastSyncedAt) {
      const afterEpoch = Math.floor(new Date(lastSyncedAt).getTime() / 1000);
      query += ` after:${afterEpoch}`;
    }

    // Fetch messages with adaptive pagination
    const maxMessages = fullSync ? 200 : 100;
    const maxPages = fullSync ? 4 : 2;
    let allMessages: any[] = [];
    let pageToken: string | undefined = undefined;
    let pagesFetched = 0;
    do {
      const url: string = `https://gmail.googleapis.com/gmail/v1/users/me/messages?labelIds=INBOX&q=${encodeURIComponent(query)}&maxResults=50${pageToken ? `&pageToken=${pageToken}` : ''}`;
      let response: Response = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });

      // Refresh token if expired
      if (!response.ok && (response.status === 401 || response.status === 403)) {
        console.log('Refreshing access token...');
        accessToken = await refreshAccessToken(credentials);
        await supabase
          .from('user_api_configs')
          .update({
            gmail_credentials: { ...credentials, access_token: accessToken }
          })
          .eq('user_id', userId);
        response = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
      }

      if (!response.ok) {
        throw new Error(`Gmail API error: ${response.status}`);
      }

      const page: any = await response.json();
      const batch = page.messages || [];
      allMessages.push(...batch);
      pageToken = page.nextPageToken;
      pagesFetched++;
    } while (pageToken && allMessages.length < maxMessages && pagesFetched < maxPages);
    // Fallback if nothing found on first sync: fetch latest INBOX without query
    if (allMessages.length === 0 && firstSync) {
      pageToken = undefined;
      pagesFetched = 0;
      do {
        const url2: string = `https://gmail.googleapis.com/gmail/v1/users/me/messages?labelIds=INBOX&maxResults=50${pageToken ? `&pageToken=${pageToken}` : ''}`;
        let response2: Response = await fetch(url2, { headers: { 'Authorization': `Bearer ${accessToken}` } });
        if (!response2.ok && (response2.status === 401 || response2.status === 403)) {
          accessToken = await refreshAccessToken(credentials);
          await supabase
            .from('user_api_configs')
            .update({ gmail_credentials: { ...credentials, access_token: accessToken } })
            .eq('user_id', userId);
          response2 = await fetch(url2, { headers: { 'Authorization': `Bearer ${accessToken}` } });
        }
        if (!response2.ok) throw new Error(`Gmail API error: ${response2.status}`);
        const page2: any = await response2.json();
        const batch2 = page2.messages || [];
        allMessages.push(...batch2);
        pageToken = page2.nextPageToken;
        pagesFetched++;
      } while (pageToken && allMessages.length < 100 && pagesFetched < 2);
    }

    // Filter out already processed messages
    const messages = allMessages.filter((msg: any) => !processedIds.has(msg.id));

    console.log(`Found ${messages.length} new messages out of ${allMessages.length} total`);
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
        const receivedAtISO = date ? new Date(date).toISOString() : new Date().toISOString();
        
        // Extract body with proper UTF-8 decoding
        const decodeBase64 = (base64: string): string => {
          try {
            const binaryString = atob(base64.replace(/-/g, '+').replace(/_/g, '/'));
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            return new TextDecoder('utf-8').decode(bytes);
          } catch (e) {
            console.error('Error decoding base64:', e);
            return atob(base64.replace(/-/g, '+').replace(/_/g, '/')); // Fallback
          }
        };
        
        let body = '';
        if (fullMessage.payload?.body?.data) {
          body = decodeBase64(fullMessage.payload.body.data);
        } else if (fullMessage.payload?.parts) {
          for (const part of fullMessage.payload.parts) {
            if (part.mimeType === 'text/plain' && part.body?.data) {
              body = decodeBase64(part.body.data);
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
            receivedAt: receivedAtISO,
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
    // Update sync checkpoint and clear sync_in_progress
    await supabase
      .from('gmail_sync_state')
      .upsert(
        { 
          user_id: userId, 
          last_synced_at: new Date().toISOString(),
          sync_in_progress: false,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'user_id' }
      );

    return new Response(
      JSON.stringify({ 
        success: true,
        processedCount: messages.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error syncing emails:', error);
    
    // Clear sync_in_progress on error if we have userId
    if (userId) {
      try {
        await supabase
          .from('gmail_sync_state')
          .update({ sync_in_progress: false, updated_at: new Date().toISOString() })
          .eq('user_id', userId);
      } catch (clearError) {
        console.error('Error clearing sync flag:', clearError);
      }
    }
    
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

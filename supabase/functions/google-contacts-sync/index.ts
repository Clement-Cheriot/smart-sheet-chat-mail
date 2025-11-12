import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      throw new Error('Not authenticated');
    }

    // Get Gmail tokens
    const { data: tokens } = await supabaseClient
      .from('gmail_tokens')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (!tokens) {
      throw new Error('Gmail not connected');
    }

    // Fetch contacts from Google People API
    const contactsResponse = await fetch(
      'https://people.googleapis.com/v1/people/me/connections?personFields=names,emailAddresses,phoneNumbers,organizations,userDefined&pageSize=1000',
      {
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`,
        },
      }
    );

    if (!contactsResponse.ok) {
      // Try to refresh token if expired
      if (contactsResponse.status === 401) {
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: Deno.env.get('GMAIL_CLIENT_ID') || '',
            client_secret: Deno.env.get('GMAIL_CLIENT_SECRET') || '',
            refresh_token: tokens.refresh_token,
            grant_type: 'refresh_token',
          }),
        });

        const newTokens = await tokenResponse.json();
        
        // Update tokens
        await supabaseClient
          .from('gmail_tokens')
          .update({ access_token: newTokens.access_token })
          .eq('user_id', user.id);

        // Retry with new token
        const retryResponse = await fetch(
          'https://people.googleapis.com/v1/people/me/connections?personFields=names,emailAddresses,phoneNumbers,organizations,userDefined&pageSize=1000',
          {
            headers: {
              'Authorization': `Bearer ${newTokens.access_token}`,
            },
          }
        );
        
        if (!retryResponse.ok) {
          throw new Error('Failed to fetch contacts after token refresh');
        }
        
        const contactsData = await retryResponse.json();
        await syncContacts(supabaseClient, user.id, contactsData.connections || []);
      } else {
        throw new Error('Failed to fetch contacts');
      }
    } else {
      const contactsData = await contactsResponse.json();
      await syncContacts(supabaseClient, user.id, contactsData.connections || []);
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Contacts synchronized' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error syncing contacts:', error);
    return new Response(
      JSON.stringify({ error: error?.message || 'Unknown error' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function syncContacts(supabaseClient: any, userId: string, connections: any[]) {
  const contactsToUpsert = [];

  for (const connection of connections) {
    const emails = connection.emailAddresses || [];
    const names = connection.names || [];
    const phones = connection.phoneNumbers || [];
    const orgs = connection.organizations || [];
    const userDefined = connection.userDefined || [];

    // Extract labels from userDefined fields
    const labels = userDefined
      .filter((field: any) => field.key === 'label')
      .map((field: any) => field.value);

    if (emails.length > 0) {
      contactsToUpsert.push({
        user_id: userId,
        contact_id: connection.resourceName,
        email: emails[0].value,
        name: names.length > 0 ? names[0].displayName : null,
        phone: phones.length > 0 ? phones[0].value : null,
        labels: labels.length > 0 ? labels : null,
        notes: orgs.length > 0 ? orgs[0].name : null,
        last_synced_at: new Date().toISOString(),
      });
    }
  }

  // Batch upsert contacts
  if (contactsToUpsert.length > 0) {
    const { error } = await supabaseClient
      .from('google_contacts')
      .upsert(contactsToUpsert, {
        onConflict: 'user_id,contact_id',
        ignoreDuplicates: false,
      });

    if (error) {
      console.error('Error upserting contacts:', error);
      throw error;
    }
  }
}
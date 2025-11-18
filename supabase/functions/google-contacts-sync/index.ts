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

    // Get Gmail credentials from user_api_configs
    const { data: config } = await supabaseClient
      .from('user_api_configs')
      .select('gmail_credentials')
      .eq('user_id', user.id)
      .single();

    if (!config?.gmail_credentials) {
      throw new Error('Gmail not connected');
    }

    const tokens = config.gmail_credentials as any;

    // Fetch contacts from Google People API
    console.log('Fetching contacts from Google People API...');
    const contactsResponse = await fetch(
      'https://people.googleapis.com/v1/people/me/connections?personFields=names,emailAddresses,phoneNumbers,organizations,userDefined&pageSize=1000',
      {
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`,
        },
      }
    );

    console.log('Contacts API response status:', contactsResponse.status);
    
    if (!contactsResponse.ok) {
      const errorBody = await contactsResponse.text();
      console.error('Contacts API error:', contactsResponse.status, errorBody);
      
      // Check for People API not enabled error
      if (contactsResponse.status === 403 && errorBody.includes('People API has not been used')) {
        throw new Error(
          'L\'API Google People n\'est pas activée dans votre projet Google Cloud. ' +
          'Activez-la ici : https://console.developers.google.com/apis/api/people.googleapis.com/overview?project=868541832935 ' +
          'puis attendez 2-3 minutes avant de réessayer.'
        );
      }
      
      // Try to refresh token if expired or insufficient permissions
      if (contactsResponse.status === 401 || contactsResponse.status === 403) {
        console.log('Attempting to refresh access token...');
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: Deno.env.get('GOOGLE_OAUTH_CLIENT_ID') || '',
            client_secret: Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET') || '',
            refresh_token: tokens.refresh_token,
            grant_type: 'refresh_token',
          }),
        });

        if (!tokenResponse.ok) {
          const errorBody = await tokenResponse.text();
          console.error('Token refresh failed:', tokenResponse.status, errorBody);
          throw new Error(`Failed to refresh token: ${errorBody}`);
        }

        const newTokens = await tokenResponse.json();
        console.log('Token refreshed successfully');
        
        // Update tokens in user_api_configs
        const updatedCredentials = {
          ...tokens,
          access_token: newTokens.access_token,
          expires_at: Date.now() + (newTokens.expires_in * 1000)
        };
        
        await supabaseClient
          .from('user_api_configs')
          .update({ gmail_credentials: updatedCredentials })
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
          const retryError = await retryResponse.text();
          console.error('Retry failed:', retryResponse.status, retryError);
          throw new Error(`Failed to fetch contacts after token refresh: ${retryError}`);
        }
        
        const contactsData = await retryResponse.json();
        console.log(`Successfully fetched ${contactsData.connections?.length || 0} contacts`);
        await syncContacts(supabaseClient, user.id, contactsData.connections || []);
      } else {
        throw new Error(`Failed to fetch contacts: ${errorBody}`);
      }
    } else {
      const contactsData = await contactsResponse.json();
      console.log(`Successfully fetched ${contactsData.connections?.length || 0} contacts`);
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
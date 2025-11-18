import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

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

    const authHeader = req.headers.get('Authorization')!;
    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    // Get user's Gmail credentials
    const { data: config, error: configError } = await supabase
      .from('user_api_configs')
      .select('gmail_credentials')
      .eq('user_id', user.id)
      .single();

    if (configError || !config?.gmail_credentials) {
      throw new Error('Credentials Gmail non trouvées');
    }

    const credentials = config.gmail_credentials as any;
    let accessToken = credentials.access_token;

    // Fetch contact groups from Google People API
    const groupsResponse = await fetch(
      'https://people.googleapis.com/v1/contactGroups?pageSize=1000',
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );

    if (groupsResponse.status === 401 || groupsResponse.status === 403) {
      // Try to refresh token
      const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: Deno.env.get('GOOGLE_OAUTH_CLIENT_ID')!,
          client_secret: Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET')!,
          refresh_token: credentials.refresh_token,
          grant_type: 'refresh_token',
        }),
      });

      if (!refreshResponse.ok) {
        throw new Error('Impossible de rafraîchir le token');
      }

      const refreshData = await refreshResponse.json();
      accessToken = refreshData.access_token;

      // Update stored credentials
      await supabase
        .from('user_api_configs')
        .update({
          gmail_credentials: {
            ...credentials,
            access_token: accessToken,
          }
        })
        .eq('user_id', user.id);

      // Retry fetching groups
      const retryResponse = await fetch(
        'https://people.googleapis.com/v1/contactGroups?pageSize=1000',
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      if (!retryResponse.ok) {
        const errorText = await retryResponse.text();
        console.error('Error fetching groups after refresh:', errorText);
        throw new Error(`Erreur récupération groupes: ${retryResponse.status}`);
      }

      const groupsData = await retryResponse.json();
      await syncGroups(supabase, user.id, groupsData.contactGroups || []);

      return new Response(
        JSON.stringify({ success: true, count: groupsData.contactGroups?.length || 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!groupsResponse.ok) {
      const errorText = await groupsResponse.text();
      console.error('Error fetching groups:', errorText);
      
      // Check for People API not enabled error
      if (groupsResponse.status === 403 && errorText.includes('People API has not been used')) {
        throw new Error(
          'L\'API Google People n\'est pas activée dans votre projet Google Cloud. ' +
          'Activez-la ici : https://console.developers.google.com/apis/api/people.googleapis.com/overview?project=868541832935 ' +
          'puis attendez 2-3 minutes avant de réessayer.'
        );
      }
      
      throw new Error(`Erreur récupération groupes: ${groupsResponse.status}`);
    }

    const groupsData = await groupsResponse.json();
    console.log(`Found ${groupsData.contactGroups?.length || 0} contact groups`);

    await syncGroups(supabase, user.id, groupsData.contactGroups || []);

    return new Response(
      JSON.stringify({ success: true, count: groupsData.contactGroups?.length || 0 }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error in google-contact-groups-sync:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function syncGroups(supabaseClient: any, userId: string, groups: any[]) {
  // Filter out system groups (myContacts, starred, etc.) and only keep user-created groups
  const userGroups = groups.filter(g => 
    g.groupType === 'USER_CONTACT_GROUP' && 
    g.name && 
    g.resourceName
  );

  console.log(`Syncing ${userGroups.length} user-created groups`);

  const groupsToUpsert = userGroups.map(group => ({
    user_id: userId,
    google_group_id: group.resourceName,
    name: group.name,
    description: group.formattedName || null,
  }));

  if (groupsToUpsert.length > 0) {
    // Upsert groups
    const { error } = await supabaseClient
      .from('contact_groups')
      .upsert(groupsToUpsert, {
        onConflict: 'google_group_id',
        ignoreDuplicates: false,
      });

    if (error) {
      console.error('Error upserting contact groups:', error);
      throw error;
    }

    console.log(`Successfully synced ${groupsToUpsert.length} contact groups`);
  }
}

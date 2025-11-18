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

    const { contactEmail, groupId } = await req.json();

    if (!contactEmail || !groupId) {
      throw new Error('Email et groupe requis');
    }

    // Get group info
    const { data: group, error: groupError } = await supabase
      .from('contact_groups')
      .select('google_group_id')
      .eq('id', groupId)
      .eq('user_id', user.id)
      .single();

    if (groupError || !group?.google_group_id) {
      throw new Error('Groupe non trouvé');
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

    // Search for the contact by email
    const searchResponse = await fetch(
      `https://people.googleapis.com/v1/people:searchContacts?query=${encodeURIComponent(contactEmail)}&readMask=names,emailAddresses`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );

    if (searchResponse.status === 401 || searchResponse.status === 403) {
      // Refresh token
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

      await supabase
        .from('user_api_configs')
        .update({
          gmail_credentials: {
            ...credentials,
            access_token: accessToken,
          }
        })
        .eq('user_id', user.id);
    }

    const searchData = await searchResponse.json();
    
    if (!searchData.results || searchData.results.length === 0) {
      throw new Error('Contact non trouvé dans Google Contacts');
    }

    const contactResourceName = searchData.results[0].person.resourceName;

    // Add contact to group
    const addToGroupResponse = await fetch(
      `https://people.googleapis.com/v1/${group.google_group_id}/members:modify`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          resourceNamesToAdd: [contactResourceName],
        })
      }
    );

    if (!addToGroupResponse.ok) {
      const errorText = await addToGroupResponse.text();
      console.error('Error adding to group:', errorText);
      throw new Error(`Erreur ajout au groupe: ${addToGroupResponse.status}`);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error in google-contact-add-to-group:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

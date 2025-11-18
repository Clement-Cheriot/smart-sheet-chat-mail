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

    const { groupName, description } = await req.json();

    if (!groupName?.trim()) {
      throw new Error('Le nom du groupe est requis');
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

    // Create contact group in Google
    const createGroupResponse = await fetch('https://people.googleapis.com/v1/contactGroups', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contactGroup: {
          name: groupName.trim(),
        }
      })
    });

    if (createGroupResponse.status === 401 || createGroupResponse.status === 403) {
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

      // Retry creating the group
      const retryResponse = await fetch('https://people.googleapis.com/v1/contactGroups', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contactGroup: {
            name: groupName.trim(),
          }
        })
      });

      if (!retryResponse.ok) {
        const errorText = await retryResponse.text();
        console.error('Error creating group:', errorText);
        throw new Error(`Erreur création groupe: ${retryResponse.status}`);
      }

      const groupData = await retryResponse.json();

      // Store group in database
      const { data: newGroup, error: insertError } = await supabase
        .from('contact_groups')
        .insert({
          user_id: user.id,
          name: groupName.trim(),
          google_group_id: groupData.resourceName,
          description: description?.trim() || null,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      return new Response(JSON.stringify(newGroup), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!createGroupResponse.ok) {
      const errorText = await createGroupResponse.text();
      console.error('Error creating group:', errorText);
      throw new Error(`Erreur création groupe: ${createGroupResponse.status}`);
    }

    const groupData = await createGroupResponse.json();

    // Store group in database
    const { data: newGroup, error: insertError } = await supabase
      .from('contact_groups')
      .insert({
        user_id: user.id,
        name: groupName.trim(),
        google_group_id: groupData.resourceName,
        description: description?.trim() || null,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    return new Response(JSON.stringify(newGroup), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error in google-contact-group-create:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    if (error) {
      console.error('OAuth error:', error);
      return new Response(
        `<html><body><h1>Erreur d'autorisation</h1><p>${error}</p><script>window.close();</script></body></html>`,
        { headers: { 'Content-Type': 'text/html' } }
      );
    }

    if (!code || !state) {
      throw new Error('Missing code or state parameter');
    }

    const clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID');
    const clientSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!clientId || !clientSecret || !supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing required environment variables');
    }

    // Exchange code for tokens
    const redirectUri = `${supabaseUrl}/functions/v1/gmail-oauth-callback`;
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Token exchange failed:', errorText);
      throw new Error('Failed to exchange code for tokens');
    }

    const tokens = await tokenResponse.json();
    console.log('Tokens obtained successfully');

    // Decode state to get user token
    const userToken = decodeURIComponent(state);
    
    // Create Supabase client with service role
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from token
    const { data: { user }, error: userError } = await supabase.auth.getUser(userToken);
    
    if (userError || !user) {
      console.error('Failed to get user:', userError);
      throw new Error('Invalid user token');
    }

    console.log('Saving credentials for user:', user.id);

    // Store credentials in user_api_configs
    const { error: upsertError } = await supabase
      .from('user_api_configs')
      .upsert({
        user_id: user.id,
        gmail_credentials: {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: Date.now() + (tokens.expires_in * 1000),
          scope: tokens.scope,
        },
      }, {
        onConflict: 'user_id'
      });

    if (upsertError) {
      console.error('Failed to save credentials:', upsertError);
      throw new Error('Failed to save Gmail credentials');
    }

    console.log('Gmail credentials saved successfully');

    // Return success page that closes the popup
    return new Response(
      `<html>
        <body>
          <h1>Gmail connecté avec succès ! ✅</h1>
          <p>Vous pouvez fermer cette fenêtre.</p>
          <script>
            window.opener?.postMessage({ type: 'gmail-auth-success' }, '*');
            setTimeout(() => window.close(), 2000);
          </script>
        </body>
      </html>`,
      { headers: { 'Content-Type': 'text/html' } }
    );
  } catch (error) {
    console.error('Error in gmail-oauth-callback:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      `<html>
        <body>
          <h1>Erreur</h1>
          <p>${errorMessage}</p>
          <script>
            window.opener?.postMessage({ type: 'gmail-auth-error', error: '${errorMessage}' }, '*');
            setTimeout(() => window.close(), 3000);
          </script>
        </body>
      </html>`,
      { headers: { 'Content-Type': 'text/html' } }
    );
  }
});

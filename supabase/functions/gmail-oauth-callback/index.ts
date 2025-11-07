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
      const dashboardUrl = `${Deno.env.get('VITE_APP_URL') || 'https://23d8b18a-dadc-4393-ac5e-daf9605cdc3d.lovableproject.com'}/#/dashboard?gmail_success=false`;
      const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8" /><title>Erreur d'autorisation</title></head><body>
        <p>Erreur d'autorisation: ${error}. Vous pouvez fermer cette fenêtre.</p>
        <script>
          (function(){
            try { if (window.opener) { window.opener.postMessage({ type: 'gmail_oauth_complete', success: false }, '*'); } } catch(_) {}
            setTimeout(function(){ window.close(); }, 1200);
            setTimeout(function(){ window.location.href = '${dashboardUrl}'; }, 1500);
          })();
        </script>
      </body></html>`;
      return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
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

    // Decode state to get user token (JWT)
    const userToken = decodeURIComponent(state);
    
    // Decode JWT to extract user_id (without verification since we trust our own token)
    const jwtParts = userToken.split('.');
    if (jwtParts.length !== 3) {
      throw new Error('Invalid JWT format in state');
    }
    
    const payload = JSON.parse(atob(jwtParts[1].replace(/-/g, '+').replace(/_/g, '/')));
    const userId = payload.sub;
    
    if (!userId) {
      throw new Error('No user ID in token');
    }
    
    console.log('Extracted user ID:', userId);
    
    // Create Supabase client with service role
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Saving credentials for user:', userId);

    // Store credentials in user_api_configs
    const { error: upsertError } = await supabase
      .from('user_api_configs')
      .upsert({
        user_id: userId,
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

    // Redirect back to dashboard with success parameter (HashRouter friendly)
    const dashboardUrl = `${Deno.env.get('VITE_APP_URL') || 'https://23d8b18a-dadc-4393-ac5e-daf9605cdc3d.lovableproject.com'}/#/dashboard?gmail_success=true`;
    
    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8" /><title>Connexion Gmail réussie</title></head><body>
      <p>Connexion réussie. Vous pouvez fermer cette fenêtre.</p>
      <script>
        (function(){
          try { if (window.opener) { window.opener.postMessage({ type: 'gmail_oauth_complete', success: true }, '*'); } } catch(_) {}
           setTimeout(function(){ window.close(); }, 1200);
           setTimeout(function(){ window.location.href = '${dashboardUrl}'; }, 1500);
        })();
      </script>
    </body></html>`;
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  } catch (error) {
    console.error('Error in gmail-oauth-callback:', error);
    
    // Redirect back to dashboard with error parameter (HashRouter friendly)
    const dashboardUrl = `${Deno.env.get('VITE_APP_URL') || 'https://23d8b18a-dadc-4393-ac5e-daf9605cdc3d.lovableproject.com'}/#/dashboard?gmail_success=false`;
    
    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8" /><title>Connexion Gmail échouée</title></head><body>
      <p>Une erreur est survenue. Vous pouvez fermer cette fenêtre.</p>
      <script>
        (function(){
          try { if (window.opener) { window.opener.postMessage({ type: 'gmail_oauth_complete', success: false }, '*'); } } catch(_) {}
           setTimeout(function(){ window.close(); }, 1200);
          setTimeout(function(){ window.location.href = '${dashboardUrl}'; }, 500);
        })();
      </script>
    </body></html>`;
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
});

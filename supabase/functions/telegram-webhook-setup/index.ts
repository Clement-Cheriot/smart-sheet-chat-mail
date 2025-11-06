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

    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    // Get user from auth header
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    // Get user's Telegram config
    const { data: config, error: configError } = await supabase
      .from('user_api_configs')
      .select('telegram_bot_token')
      .eq('user_id', user.id)
      .single();

    if (configError || !config?.telegram_bot_token) {
      throw new Error('Telegram bot token not configured');
    }

    const botToken = config.telegram_bot_token;
    const webhookUrl = `${supabaseUrl}/functions/v1/telegram-webhook`;

    // Configure webhook via Telegram API
    const telegramResponse = await fetch(
      `https://api.telegram.org/bot${botToken}/setWebhook?url=${encodeURIComponent(webhookUrl)}`,
      { method: 'GET' }
    );

    const result = await telegramResponse.json();

    if (!result.ok) {
      throw new Error(result.description || 'Failed to set webhook');
    }

    console.log('Webhook configured successfully:', result);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Webhook configuré avec succès',
        webhookUrl 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error: any) {
    console.error('Error configuring webhook:', error);

    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

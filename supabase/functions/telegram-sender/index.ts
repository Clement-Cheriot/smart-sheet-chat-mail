import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TelegramMessage {
  userId: string;
  message: string;
  audioBase64?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { userId, message, audioBase64 }: TelegramMessage = await req.json();
    console.log('Sending Telegram message to user:', userId, audioBase64 ? '(with audio)' : '');

    // Get user's Telegram config
    const { data: config, error: configError } = await supabase
      .from('user_api_configs')
      .select('telegram_bot_token, telegram_chat_id')
      .eq('user_id', userId)
      .single();

    if (configError || !config) {
      throw new Error('Configuration Telegram introuvable pour cet utilisateur');
    }

    if (!config.telegram_bot_token || !config.telegram_chat_id) {
      console.log('Telegram non configuré, notification ignorée');
      return new Response(
        JSON.stringify({ success: false, reason: 'telegram_not_configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Send text message via Telegram Bot API
    const telegramResponse = await fetch(
      `https://api.telegram.org/bot${config.telegram_bot_token}/sendMessage`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: config.telegram_chat_id,
          text: message,
          parse_mode: 'Markdown',
        })
      }
    );

    if (!telegramResponse.ok) {
      const errorText = await telegramResponse.text();
      let errorMessage = errorText;
      
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.description) {
          errorMessage = errorJson.description;
        }
      } catch {}
      
      console.error(`Telegram API error: ${errorMessage}`);
      
      // Log error
      await supabase.from('activity_logs').insert({
        user_id: userId,
        action_type: 'telegram_error',
        action_details: { errorMessage },
        status: 'error',
        error_message: `Erreur Telegram: ${errorMessage}`
      });
      
      throw new Error(`Erreur API Telegram: ${errorMessage}`);
    }

    const result = await telegramResponse.json();
    console.log('Message Telegram envoyé:', result);

    // Send audio if provided
    if (audioBase64) {
      console.log('Sending audio to Telegram...');
      
      // Convert base64 to binary
      const binaryAudio = Uint8Array.from(atob(audioBase64), c => c.charCodeAt(0));
      const audioBlob = new Blob([binaryAudio], { type: 'audio/mpeg' });
      
      // Create form data
      const formData = new FormData();
      formData.append('chat_id', config.telegram_chat_id);
      formData.append('audio', audioBlob, 'resume_audio.mp3');
      formData.append('caption', '🎧 Résumé audio de vos emails');
      
      const audioUrl = `https://api.telegram.org/bot${config.telegram_bot_token}/sendAudio`;
      const audioResponse = await fetch(audioUrl, {
        method: 'POST',
        body: formData,
      });

      if (!audioResponse.ok) {
        const errorText = await audioResponse.text();
        console.error('Telegram audio error:', errorText);
        throw new Error(`Erreur envoi audio: ${errorText}`);
      }

      const audioResult = await audioResponse.json();
      console.log('Audio Telegram envoyé:', audioResult);
    }

    // Log activity
    await supabase.from('activity_logs').insert({
      user_id: userId,
      action_type: 'telegram_sent',
      action_details: { messageId: result.result?.message_id },
      status: 'success'
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        messageId: result.result?.message_id 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error sending Telegram:', error);

    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
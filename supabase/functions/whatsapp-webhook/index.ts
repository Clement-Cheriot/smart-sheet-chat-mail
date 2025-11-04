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

    // Handle GET request for webhook verification
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const mode = url.searchParams.get('hub.mode');
      const token = url.searchParams.get('hub.verify_token');
      const challenge = url.searchParams.get('hub.challenge');

      // WhatsApp webhook verification - use a fixed token for now
      const VERIFY_TOKEN = 'lovable_email_assistant_2025';
      
      if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log('Webhook verified successfully');
        return new Response(challenge, { status: 200 });
      }
      
      return new Response('Verification failed', { status: 403 });
    }

    // Handle POST request with incoming WhatsApp messages
    const body = await req.json();
    console.log('Received WhatsApp webhook:', JSON.stringify(body, null, 2));

    // Extract message from webhook payload
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const messages = value?.messages;

    if (!messages || messages.length === 0) {
      // No messages, might be a status update
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const message = messages[0];
    const fromNumber = message.from;
    const messageText = message.text?.body?.toLowerCase().trim();

    console.log(`Message from ${fromNumber}: "${messageText}"`);

    // Find user by WhatsApp number
    const { data: configs, error: configError } = await supabase
      .from('user_api_configs')
      .select('user_id, whatsapp_recipient_number')
      .eq('whatsapp_recipient_number', fromNumber);

    if (configError || !configs || configs.length === 0) {
      console.log('No user found for WhatsApp number:', fromNumber);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const userId = configs[0].user_id;
    console.log('Found user:', userId);

    // Parse command
    if (messageText?.includes('résumé') || messageText?.includes('resume')) {
      // User is requesting a summary
      console.log('Triggering email summary for user:', userId);
      
      // Determine period - last 24h by default
      const now = new Date();
      const startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      // Call email-summary function
      const { data, error } = await supabase.functions.invoke('email-summary', {
        body: {
          userId,
          period: 'custom',
          startDate: startTime.toISOString(),
          endDate: now.toISOString(),
        }
      });

      if (error) {
        console.error('Error generating summary:', error);
        // Send error message back to user
        await supabase.functions.invoke('whatsapp-sender', {
          body: {
            userId,
            type: 'alert',
            message: `❌ Erreur lors de la génération du résumé: ${error.message}`,
            useTemplate: false,
          }
        });
      } else {
        console.log('Summary sent successfully');
        // Save summary to database
        await supabase.from('email_summaries').insert({
          user_id: userId,
          period_start: startTime.toISOString(),
          period_end: now.toISOString(),
          summary_content: data?.summary || '',
        });
      }
    } else if (messageText?.includes('aide') || messageText?.includes('help')) {
      // Send help message
      await supabase.functions.invoke('whatsapp-sender', {
        body: {
          userId,
          type: 'alert',
          message: `🤖 Commandes disponibles:\n\n📊 "résumé" - Obtenir un résumé des emails des dernières 24h\n❓ "aide" - Afficher ce message d'aide`,
          useTemplate: false,
        }
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error processing webhook:', error);

    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WhatsAppMessage {
  userId: string;
  type: 'alert' | 'summary';
  message: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { userId, type, message }: WhatsAppMessage = await req.json();
    console.log(`Sending WhatsApp ${type} to user:`, userId);

    // Get user's WhatsApp config
    const { data: config, error: configError } = await supabase
      .from('user_api_configs')
      .select('whatsapp_api_token, whatsapp_phone_number_id, whatsapp_recipient_number')
      .eq('user_id', userId)
      .single();

    if (configError || !config) {
      throw new Error('WhatsApp configuration not found for user');
    }

    if (!config.whatsapp_api_token || !config.whatsapp_phone_number_id || !config.whatsapp_recipient_number) {
      console.log('WhatsApp not fully configured, skipping notification');
      return new Response(
        JSON.stringify({ success: false, reason: 'whatsapp_not_configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Send WhatsApp message using WhatsApp Business API
    const whatsappResponse = await fetch(
      `https://graph.facebook.com/v18.0/${config.whatsapp_phone_number_id}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.whatsapp_api_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: config.whatsapp_recipient_number,
          type: 'text',
          text: {
            body: message
          }
        })
      }
    );

    if (!whatsappResponse.ok) {
      const errorData = await whatsappResponse.text();
      throw new Error(`WhatsApp API error: ${errorData}`);
    }

    const result = await whatsappResponse.json();
    console.log('WhatsApp message sent:', result);

    // Log activity
    await supabase.from('activity_logs').insert({
      user_id: userId,
      action_type: 'whatsapp_sent',
      action_details: { type, messageId: result.messages?.[0]?.id },
      status: 'success'
    });

    // Update email history if this was an alert
    if (type === 'alert') {
      // Mark as notified in the most recent email
      await supabase
        .from('email_history')
        .update({ whatsapp_notified: true })
        .eq('user_id', userId)
        .order('processed_at', { ascending: false })
        .limit(1);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        messageId: result.messages?.[0]?.id 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error sending WhatsApp:', error);

    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

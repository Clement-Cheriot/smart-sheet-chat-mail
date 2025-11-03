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

    const { userId, sendTest } = await req.json();
    console.log(`WhatsApp healthcheck for user: ${userId}, sendTest: ${sendTest}`);

    // Get user's WhatsApp config
    const { data: config, error: configError } = await supabase
      .from('user_api_configs')
      .select('whatsapp_api_token, whatsapp_phone_number_id, whatsapp_recipient_number')
      .eq('user_id', userId)
      .single();

    if (configError || !config) {
      return new Response(
        JSON.stringify({ 
          valid: false, 
          error: 'Configuration WhatsApp non trouvée' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!config.whatsapp_api_token || !config.whatsapp_phone_number_id || !config.whatsapp_recipient_number) {
      return new Response(
        JSON.stringify({ 
          valid: false, 
          error: 'Configuration WhatsApp incomplète (token, phone_number_id ou recipient manquant)' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify Phone Number ID via Graph API
    const verifyResponse = await fetch(
      `https://graph.facebook.com/v18.0/${config.whatsapp_phone_number_id}`,
      {
        headers: {
          'Authorization': `Bearer ${config.whatsapp_api_token}`,
        }
      }
    );

    if (!verifyResponse.ok) {
      const errorData = await verifyResponse.text();
      let errorMessage = 'Erreur lors de la vérification du Phone Number ID';
      
      try {
        const errorJson = JSON.parse(errorData);
        if (errorJson.error?.message) {
          errorMessage = errorJson.error.message;
        }
      } catch {}

      console.error('Phone Number ID verification failed:', errorData);
      return new Response(
        JSON.stringify({ 
          valid: false, 
          error: errorMessage,
          details: errorData
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const phoneData = await verifyResponse.json();
    console.log('Phone verified:', phoneData);

    // Send test message if requested
    let testResult = null;
    if (sendTest) {
      console.log('Sending test message via template hello_world');
      const testResponse = await fetch(
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
            type: 'template',
            template: {
              name: 'hello_world',
              language: {
                code: 'en_US'
              }
            }
          })
        }
      );

      if (!testResponse.ok) {
        const testErrorData = await testResponse.text();
        console.error('Test message failed:', testErrorData);
        testResult = { success: false, error: testErrorData };
      } else {
        const testData = await testResponse.json();
        console.log('Test message sent:', testData);
        testResult = { success: true, messageId: testData.messages?.[0]?.id };
      }
    }

    return new Response(
      JSON.stringify({ 
        valid: true,
        details: {
          display_phone_number: phoneData.display_phone_number || 'N/A',
          verified_name: phoneData.verified_name || 'N/A',
          quality_rating: phoneData.quality_rating || 'N/A'
        },
        testResult
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in healthcheck:', error);
    return new Response(
      JSON.stringify({ 
        valid: false,
        error: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

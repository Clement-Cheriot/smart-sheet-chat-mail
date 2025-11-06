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

    const body = await req.json();
    console.log('Received Telegram webhook:', JSON.stringify(body, null, 2));

    // Extract message from webhook payload
    const message = body.message;
    
    if (!message || !message.text) {
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const chatId = message.chat.id.toString();
    const messageText = message.text.toLowerCase().trim();

    console.log(`Message from chat ${chatId}: "${messageText}"`);

    // Find user by Telegram chat ID
    const { data: configs, error: configError } = await supabase
      .from('user_api_configs')
      .select('user_id, telegram_chat_id')
      .eq('telegram_chat_id', chatId);

    if (configError || !configs || configs.length === 0) {
      console.log('No user found for Telegram chat ID:', chatId);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const userId = configs[0].user_id;
    console.log('Found user:', userId);

    // Parse command and period
    if (messageText.includes('résumé') || messageText.includes('resume') || messageText.includes('/summary')) {
      console.log('Triggering email summary for user:', userId);
      
      const now = new Date();
      let startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000); // default: 24h
      
      // Parse period from message (e.g., "résumé 3 jours", "résumé 1 semaine", "résumé 48h")
      const daysMatch = messageText.match(/(\d+)\s*(jours?|days?)/i);
      const weeksMatch = messageText.match(/(\d+)\s*(semaines?|weeks?)/i);
      const hoursMatch = messageText.match(/(\d+)\s*h(eures?)?/i);
      
      if (daysMatch) {
        const days = parseInt(daysMatch[1]);
        startTime = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      } else if (weeksMatch) {
        const weeks = parseInt(weeksMatch[1]);
        startTime = new Date(now.getTime() - weeks * 7 * 24 * 60 * 60 * 1000);
      } else if (hoursMatch) {
        const hours = parseInt(hoursMatch[1]);
        startTime = new Date(now.getTime() - hours * 60 * 60 * 1000);
      }

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
        await supabase.functions.invoke('telegram-sender', {
          body: {
            userId,
            message: `❌ Erreur lors de la génération du résumé: ${error.message}`,
          }
        });
      } else {
        console.log('Summary generated, now creating audio...');
        
        // Save summary to database
        await supabase.from('email_summaries').insert({
          user_id: userId,
          period_start: startTime.toISOString(),
          period_end: now.toISOString(),
          summary_content: data?.summary || '',
        });

        // Generate audio from summary
        const { data: audioData, error: audioError } = await supabase.functions.invoke('text-to-speech', {
          body: { summaryText: data?.summary || '' }
        });

        if (audioError) {
          console.error('Error generating audio:', audioError);
          // Send text-only version if audio fails
          await supabase.functions.invoke('telegram-sender', {
            body: { 
              userId,
              message: `📊 *Résumé emails (24h)*\n\n${data?.summary}\n\n⚠️ Audio non disponible`
            }
          });
        } else {
          // Send both text and audio via Telegram
          await supabase.functions.invoke('telegram-sender', {
            body: { 
              userId,
              message: "📊 Résumé emails (24h)",
              audioBase64: audioData.audioBase64
            }
          });
        }
      }
    } else if (messageText.includes('aide') || messageText.includes('help') || messageText.includes('/help') || messageText.includes('/start')) {
      await supabase.functions.invoke('telegram-sender', {
        body: {
          userId,
          message: `🤖 *Commandes disponibles:*\n\n📊 \`résumé\` ou \`/summary\` - Résumé emails dernières 24h\n📊 \`résumé 3 jours\` - Résumé emails des 3 derniers jours\n📊 \`résumé 1 semaine\` - Résumé emails de la dernière semaine\n📊 \`résumé 48h\` - Résumé emails des 48 dernières heures\n❓ \`/help\` ou \`aide\` - Afficher ce message`,
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
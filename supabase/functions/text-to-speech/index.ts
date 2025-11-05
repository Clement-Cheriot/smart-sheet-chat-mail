import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { summaryText } = await req.json();
    
    if (!summaryText) {
      throw new Error('Le texte du résumé est requis');
    }

    // Get OpenAI API key
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      throw new Error('OPENAI_API_KEY n\'est pas configurée');
    }

    console.log('Converting summary to natural speech format...');

    // First, use LLM to make the summary more natural for speech
    const llmResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5-mini-2025-08-07',
        max_completion_tokens: 1000,
        messages: [
          { 
            role: 'system', 
            content: 'Tu es un assistant qui transforme des résumés d\'emails structurés en texte naturel pour lecture audio. Rends le texte fluide, conversationnel et agréable à écouter. Évite les listes à puces, les symboles emoji et les formats structurés. Parle comme un assistant vocal professionnel.' 
          },
          { 
            role: 'user', 
            content: `Transforme ce résumé d'emails en un texte naturel et fluide pour une lecture audio :\n\n${summaryText}` 
          }
        ],
      }),
    });

    if (!llmResponse.ok) {
      const errorText = await llmResponse.text();
      console.error('LLM error:', llmResponse.status, errorText);
      throw new Error(`Échec de la conversion du texte: ${llmResponse.status}`);
    }

    const llmData = await llmResponse.json();
    const naturalText = llmData.choices[0].message.content;

    console.log('Generating audio with OpenAI TTS...');

    // Then, generate audio with OpenAI TTS
    const ttsResponse = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1-hd',
        voice: 'alloy', // Options: alloy, echo, fable, onyx, nova, shimmer
        input: naturalText,
        response_format: 'mp3',
      }),
    });

    if (!ttsResponse.ok) {
      const errorText = await ttsResponse.text();
      console.error('TTS error:', ttsResponse.status, errorText);
      throw new Error(`Échec de la génération audio: ${ttsResponse.status}`);
    }

    // Get audio as blob and convert to base64 (chunked to avoid call stack overflow)
    const audioBlob = await ttsResponse.blob();
    const arrayBuffer = await audioBlob.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    // Convert to base64 safely
    let binary = '';
    const chunkSize = 0x8000; // 32KB per chunk
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.subarray(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    const base64Audio = btoa(binary);

    console.log('Audio generated successfully');

    return new Response(
      JSON.stringify({ 
        success: true,
        audioBase64: base64Audio,
        naturalText: naturalText
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in text-to-speech function:', error);

    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

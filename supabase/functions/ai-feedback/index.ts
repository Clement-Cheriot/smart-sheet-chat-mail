import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      throw new Error('User not authenticated');
    }

    const { email_id, email_subject, email_sender, old_label, new_label, user_reason } = await req.json();

    console.log('AI Feedback request:', { email_id, old_label, new_label });

    // Appel à l'IA pour interpréter le feedback
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const systemPrompt = `Tu interprètes les corrections utilisateur sur les labels pour enrichir automatiquement les règles.

TON RÔLE :
Analyser user_reason et extraire :
1. Phrase concise à ajouter dans la description de la règle (format: "[DATE] User: ...")
2. Nouveaux mots-clés suggérés
3. Nouveaux domaines suggérés

OUTPUT JSON :
{
  "label_to_update": string,
  "description_addition": string,
  "suggested_keywords": string[],
  "suggested_domains": string[]
}

EXEMPLE :
Input: {
  "old_label": "INSPI",
  "new_label": "PRO",
  "user_reason": "Les notifications Slack avec 'urgent' sont toujours professionnelles"
}

Output: {
  "label_to_update": "PRO",
  "description_addition": "[2025-11-06] User: Appliquer PRO aux notifications Slack contenant 'urgent'",
  "suggested_keywords": ["urgent", "slack"],
  "suggested_domains": ["slack.com"]
}`;

    const userPrompt = `Analyse ce feedback utilisateur et génère les suggestions d'enrichissement de règle.

Email: "${email_subject}"
Expéditeur: ${email_sender}
Ancien label: ${old_label}
Nouveau label: ${new_label}
Raison utilisateur: "${user_reason}"

Génère le JSON de sortie.`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: "json_object" }
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const feedbackJson = JSON.parse(aiData.choices[0].message.content);

    console.log('AI Feedback result:', feedbackJson);

    // Mettre à jour la règle correspondante
    const { data: existingRule, error: fetchError } = await supabaseClient
      .from('email_rules')
      .select('*')
      .eq('user_id', user.id)
      .eq('label_to_apply', feedbackJson.label_to_update)
      .maybeSingle();

    if (fetchError) {
      console.error('Error fetching rule:', fetchError);
      throw fetchError;
    }

    if (existingRule) {
      // Enrichir la règle existante
      const updatedDescription = existingRule.description 
        ? `${existingRule.description}\n${feedbackJson.description_addition}`
        : feedbackJson.description_addition;

      const updatedKeywords = existingRule.keywords 
        ? [...new Set([...existingRule.keywords, ...feedbackJson.suggested_keywords])]
        : feedbackJson.suggested_keywords;

      const updatedDomains = existingRule.sender_pattern
        ? existingRule.sender_pattern
        : feedbackJson.suggested_domains.length > 0 
          ? feedbackJson.suggested_domains.join('|')
          : null;

      const { error: updateError } = await supabaseClient
        .from('email_rules')
        .update({
          description: updatedDescription,
          keywords: updatedKeywords,
          sender_pattern: updatedDomains,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingRule.id);

      if (updateError) {
        console.error('Error updating rule:', updateError);
        throw updateError;
      }
    } else {
      // Créer une nouvelle règle si elle n'existe pas
      const { error: insertError } = await supabaseClient
        .from('email_rules')
        .insert({
          user_id: user.id,
          label_to_apply: feedbackJson.label_to_update,
          description: feedbackJson.description_addition,
          keywords: feedbackJson.suggested_keywords,
          sender_pattern: feedbackJson.suggested_domains.length > 0 
            ? feedbackJson.suggested_domains.join('|')
            : null,
          priority: 'medium',
          is_active: true
        });

      if (insertError) {
        console.error('Error creating rule:', insertError);
        throw insertError;
      }
    }

    // Mettre à jour l'email avec le nouveau label et le feedback
    const { error: emailUpdateError } = await supabaseClient
      .from('email_history')
      .update({
        applied_label: [new_label],
        label_validation_status: 'corrected',
        label_validation_notes: user_reason,
        rule_reinforcement_suggestion: JSON.stringify(feedbackJson),
        updated_at: new Date().toISOString()
      })
      .eq('id', email_id);

    if (emailUpdateError) {
      console.error('Error updating email:', emailUpdateError);
      throw emailUpdateError;
    }

    return new Response(JSON.stringify({ 
      success: true, 
      feedback: feedbackJson 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Error in ai-feedback function:', error);
    return new Response(JSON.stringify({ error: error?.message || 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
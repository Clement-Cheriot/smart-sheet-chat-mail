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

    const { emailHistoryId, userId } = await req.json();
    
    console.log('Processing rule reinforcement for email:', emailHistoryId);

    // Récupérer l'email corrigé
    const { data: email, error: emailError } = await supabase
      .from('email_history')
      .select('*')
      .eq('id', emailHistoryId)
      .eq('user_id', userId)
      .single();

    if (emailError || !email) {
      throw new Error('Email not found');
    }

    // Vérifier qu'il y a une correction
    if (!email.applied_label || !email.label_validation_notes) {
      console.log('No correction found, skipping reinforcement');
      return new Response(
        JSON.stringify({ success: true, message: 'No correction to process' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const labels = Array.isArray(email.applied_label) ? email.applied_label : [email.applied_label];
    const categoryLabel = labels.find((l: string) => !l.startsWith('Actions/'));
    
    if (!categoryLabel) {
      console.log('No category label found');
      return new Response(
        JSON.stringify({ success: true, message: 'No category label to reinforce' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Trouver ou créer la règle correspondante
    const { data: existingRule } = await supabase
      .from('email_rules')
      .select('*')
      .eq('user_id', userId)
      .eq('label_to_apply', categoryLabel)
      .maybeSingle();

    const feedbackEntry = `[${new Date().toISOString().split('T')[0]}] ${email.label_validation_notes}`;

    if (existingRule) {
      // Enrichir la description existante
      const currentDesc = existingRule.description || '';
      const newDesc = currentDesc 
        ? `${currentDesc}\n${feedbackEntry}`
        : feedbackEntry;

      const { error: updateError } = await supabase
        .from('email_rules')
        .update({ 
          description: newDesc,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingRule.id);

      if (updateError) throw updateError;

      console.log(`Enriched rule ${existingRule.id} with feedback`);

      // Marquer le renforcement comme fait
      await supabase
        .from('email_history')
        .update({ 
          rule_reinforcement_status: 'applied',
          rule_reinforcement_suggestion: `Règle "${categoryLabel}" enrichie avec: ${email.label_validation_notes}`
        })
        .eq('id', emailHistoryId);

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Rule enriched successfully',
          ruleId: existingRule.id,
          label: categoryLabel
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      // Créer une nouvelle règle avec la description
      const { data: newRule, error: createError } = await supabase
        .from('email_rules')
        .insert({
          user_id: userId,
          label_to_apply: categoryLabel,
          description: feedbackEntry,
          is_active: true,
          rule_order: 999, // Mettre en dernier par défaut
        })
        .select()
        .single();

      if (createError) throw createError;

      console.log(`Created new rule with label ${categoryLabel}`);

      // Marquer le renforcement comme fait
      await supabase
        .from('email_history')
        .update({ 
          rule_reinforcement_status: 'applied',
          rule_reinforcement_suggestion: `Nouvelle règle créée: "${categoryLabel}" avec: ${email.label_validation_notes}`
        })
        .eq('id', emailHistoryId);

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'New rule created successfully',
          ruleId: newRule.id,
          label: categoryLabel
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error: any) {
    console.error('Error in rule reinforcement:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

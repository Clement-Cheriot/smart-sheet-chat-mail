import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EmailData {
  userId: string;
  messageId: string;
  sender: string;
  subject: string;
  body: string;
  receivedAt: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    const emailData: EmailData = await req.json();
    console.log('Processing email from:', emailData.sender);

    // Log activity
    await supabase.from('activity_logs').insert({
      user_id: emailData.userId,
      action_type: 'email_received',
      action_details: { sender: emailData.sender, subject: emailData.subject },
      status: 'pending'
    });

    // Get user's rules
    const { data: rules, error: rulesError } = await supabase
      .from('email_rules')
      .select('*')
      .eq('user_id', emailData.userId)
      .eq('is_active', true)
      .order('rule_order', { ascending: true });

    if (rulesError) throw rulesError;

    // Analyze email with AI
    const aiAnalysis = await analyzeEmailWithAI(
      emailData.sender,
      emailData.subject,
      emailData.body,
      lovableApiKey
    );

    console.log('AI Analysis:', aiAnalysis);

    // Match rules
    const matchedRules = (rules || []).filter((rule: any) => matchesRule(emailData, rule));
    
    let shouldCreateDraft = false;
    let shouldAutoReply = false;
    let appliedLabels: string[] = [];
    let appliedRuleId: any = null;
    let shouldNotifyUrgent = false;
    
    if (matchedRules.length > 0) {
      // Sort by rule_order and take the first matching rule for primary action
      const sortedRules = matchedRules.sort((a: any, b: any) => a.rule_order - b.rule_order);
      const primaryRule = sortedRules[0];
      
      appliedRuleId = primaryRule;
      
      // Only apply label from primary rule (highest priority)
      if (primaryRule.label_to_apply) {
        appliedLabels = [primaryRule.label_to_apply];
        console.log(`Applying label "${primaryRule.label_to_apply}" from primary rule (priority ${primaryRule.rule_order})`);
      }
      
      // Check if any rule has notify_urgent
      shouldNotifyUrgent = matchedRules.some((rule: any) => rule.notify_urgent);
    }

    // Calculate priority score using primary rule
    const priorityScore = calculatePriorityScore(aiAnalysis, appliedRuleId);
    
    // AI-driven response decision (primary)
    if (aiAnalysis.needs_response && aiAnalysis.response_type !== 'none') {
      const isNewsletter = aiAnalysis.category === 'newsletter';
      const isMarketing = aiAnalysis.category === 'marketing';
      
      // Check if rule allows it
      if (appliedRuleId) {
        // Rule can override AI decision
        if (aiAnalysis.response_type === 'draft' && appliedRuleId.create_draft !== false) {
          if (isNewsletter && appliedRuleId.exclude_newsletters) {
            console.log('Skipping draft: newsletter excluded by rule');
          } else if (isMarketing && appliedRuleId.exclude_marketing) {
            console.log('Skipping draft: marketing excluded by rule');
          } else {
            shouldCreateDraft = true;
          }
        } else if (aiAnalysis.response_type === 'auto_reply' && appliedRuleId.auto_reply) {
          if (isNewsletter && appliedRuleId.exclude_newsletters) {
            console.log('Skipping auto-reply: newsletter excluded by rule');
          } else if (isMarketing && appliedRuleId.exclude_marketing) {
            console.log('Skipping auto-reply: marketing excluded by rule');
          } else {
            shouldAutoReply = true;
          }
        }
      } else {
        // No rule, use AI decision directly (but still exclude newsletters/marketing)
        if (!isNewsletter && !isMarketing) {
          if (aiAnalysis.response_type === 'draft') {
            shouldCreateDraft = true;
          } else if (aiAnalysis.response_type === 'auto_reply') {
            shouldAutoReply = true;
          }
        }
      }
    }
    
    // Rule can also force draft creation even if AI says no (backwards compatibility)
    if (appliedRuleId?.create_draft && !shouldCreateDraft && !shouldAutoReply) {
      const isNewsletter = aiAnalysis.category === 'newsletter';
      const isMarketing = aiAnalysis.category === 'marketing';
      
      if (!(isNewsletter && appliedRuleId.exclude_newsletters) && 
          !(isMarketing && appliedRuleId.exclude_marketing)) {
        shouldCreateDraft = true;
        console.log('Draft forced by rule override');
      }
    }
    
    console.log('Response decision:', { 
      aiNeedsResponse: aiAnalysis.needs_response,
      aiResponseType: aiAnalysis.response_type,
      aiReasoning: aiAnalysis.response_reasoning,
      shouldCreateDraft,
      shouldAutoReply 
    });

    // Determine actions taken
    const actionsTaken = [];
    
    if (appliedLabels.length > 0) {
      actionsTaken.push({ type: 'label', value: appliedLabels });
    }
    if (appliedLabels.length === 0 && !shouldCreateDraft) {
      actionsTaken.push({ type: 'manual_review', value: 'Needs Manual Review' });
      appliedLabels.push('Needs Manual Review');
    }

    // Determine rule reinforcement suggestion (only if no rule matched)
    let ruleReinforcement = null;
    const knownCategories = ['work','personal','newsletter','spam','billing','support','marketing','other'];
    const suggestedLabel = (
      matchedRules.length === 0 &&
      (!knownCategories.includes(aiAnalysis.category) || aiAnalysis.category === 'other') &&
      aiAnalysis.suggested_label
    ) ? aiAnalysis.suggested_label : null;
    if (suggestedLabel && matchedRules.length === 0) {
      ruleReinforcement = `Consider adding rule for label "${suggestedLabel}" based on similar patterns`;
    }

    // Save to email history with upsert to avoid duplicates
    const { data: historyRecord, error: historyError } = await supabase
      .from('email_history')
      .upsert({
        user_id: emailData.userId,
        gmail_message_id: emailData.messageId,
        sender: emailData.sender,
        subject: emailData.subject,
        received_at: emailData.receivedAt,
        applied_label: appliedLabels.length > 0 ? appliedLabels : null,
        priority_score: priorityScore,
        ai_analysis: aiAnalysis,
        draft_created: false,
        body_summary: aiAnalysis.body_summary || emailData.body?.substring(0, 200),
        ai_reasoning: aiAnalysis.reasoning,
        suggested_new_label: suggestedLabel,
        rule_reinforcement_suggestion: ruleReinforcement,
        actions_taken: actionsTaken,
      }, { onConflict: 'user_id,gmail_message_id' })
      .select()
      .single();

    if (historyError) throw historyError;

    // Apply Gmail labels if rules matched
    if (appliedLabels.length > 0) {
      for (const label of appliedLabels) {
        if (label !== 'Needs Manual Review') {
          console.log('Applying label:', label);
          await supabase.functions.invoke('gmail-actions', {
            body: {
              action: 'apply_label',
              userId: emailData.userId,
              messageId: emailData.messageId,
              label: label,
            }
          });
        }
      }
    }

    // Generate draft or auto-reply if needed
    let draftResult = null;
    if (shouldCreateDraft || shouldAutoReply) {
      const actionType = shouldAutoReply ? 'send_reply' : 'create_draft';
      console.log(`Generating ${actionType}`);
      
      const { data: draftData } = await supabase.functions.invoke('gmail-actions', {
        body: {
          action: actionType,
          userId: emailData.userId,
          messageId: emailData.messageId,
          emailContext: {
            sender: emailData.sender,
            subject: emailData.subject,
            body: emailData.body,
            aiResponseReasoning: aiAnalysis.response_reasoning,
          },
          template: appliedRuleId?.response_template,
        }
      });

      if (draftData?.draftId || draftData?.sent) {
        draftResult = draftData;
        await supabase
          .from('email_history')
          .update({ 
            draft_created: shouldCreateDraft,
            draft_id: draftData.draftId,
            actions_taken: [...actionsTaken, { 
              type: shouldAutoReply ? 'auto_reply_sent' : 'draft_created', 
              value: true,
              reasoning: aiAnalysis.response_reasoning 
            }]
          })
          .eq('id', historyRecord.id);
      }
    }

    // Update actions for calendar if needed
    if (aiAnalysis.needs_calendar_action) {
      await supabase
        .from('email_history')
        .update({ 
          actions_taken: [...actionsTaken, { type: 'calendar_needed', value: true }]
        })
        .eq('id', historyRecord.id);
    }

    // Get user's WhatsApp threshold (default to 8)
    const { data: userConfig } = await supabase
      .from('user_api_configs')
      .select('whatsapp_threshold')
      .eq('user_id', emailData.userId)
      .maybeSingle();
    
    const threshold = userConfig?.whatsapp_threshold || 8;
    
    // Send WhatsApp notification if priority exceeds threshold or urgent rule matches
    if (priorityScore >= threshold || shouldNotifyUrgent || aiAnalysis.is_urgent_whatsapp) {
      console.log('Sending WhatsApp notification');
      
      // Build suggested action message
      let actionText = 'Consulter le mail';
      if (aiAnalysis.suggested_action === 'urgent_response') {
        actionText = 'Répondre de manière urgente';
      } else if (aiAnalysis.suggested_action === 'reply') {
        actionText = 'Répondre au mail';
      } else if (aiAnalysis.needs_calendar_action) {
        actionText = 'Ajouter l\'événement au calendrier';
      }
      
      await supabase.functions.invoke('whatsapp-sender', {
        body: {
          userId: emailData.userId,
          type: 'alert',
          message: `🚨 Email ${shouldNotifyUrgent ? 'urgent' : 'prioritaire'} détecté!\n\nDe: ${emailData.sender}\nSujet: ${emailData.subject}\nPriorité: ${priorityScore}/10\n${appliedLabels.length > 0 ? `Labels: ${appliedLabels.join(', ')}\n` : ''}\n📋 Résumé: ${aiAnalysis.body_summary}\n\n💡 Action suggérée: ${actionText}`,
        }
      });

      // Mark as WhatsApp sent
      await supabase
        .from('email_history')
        .update({ 
          whatsapp_notified: true,
          actions_taken: [...actionsTaken, { type: 'whatsapp_urgent', value: true }]
        })
        .eq('id', historyRecord.id);
    }

    // Log success
    await supabase.from('activity_logs').insert({
      user_id: emailData.userId,
      action_type: 'email_processed',
      action_details: { 
        messageId: emailData.messageId,
        labels: appliedLabels,
        priority: priorityScore 
      },
      status: 'success'
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        appliedLabels,
        priorityScore,
        draftCreated: shouldCreateDraft,
        autoReplySent: shouldAutoReply
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error processing email:', error);
    
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

async function analyzeEmailWithAI(
  sender: string,
  subject: string,
  body: string,
  apiKey: string
): Promise<any> {
  try {
    const prompt = `Analyse cet email et fournis des informations structurées détaillées EN FRANÇAIS:

De: ${sender}
Sujet: ${subject}
Corps: ${body.substring(0, 1000)}

Fournis une réponse JSON avec:
1. sentiment: positive/neutral/negative
2. urgency: échelle de 1 à 10
3. category: work/personal/newsletter/spam/billing/support/marketing/other
4. key_entities: tableau des noms importants, dates, montants mentionnés
5. suggested_action: reply/forward/archive/review/urgent_response
6. body_summary: Résumé bref en 2-3 phrases du contenu de l'email EN FRANÇAIS
7. reasoning: Explique ton analyse et pourquoi tu as choisi ces classifications EN FRANÇAIS
8. suggested_label: Si cela ne correspond à AUCUNE catégorie existante, suggère un nouveau label THÉMATIQUE/CATÉGORIEL générique (ex: "Devis clients", "RDV médicaux", "Formation", "Comptabilité"). NE JAMAIS suggérer des noms de personnes, d'entreprises spécifiques ou de produits. Le label doit être réutilisable pour des emails similaires futurs. Si l'email correspond déjà à une catégorie standard (work/personal/newsletter/spam/billing/support/marketing), retourne null.
9. needs_calendar_action: boolean - est-ce que cela mentionne une réunion/événement à mettre au calendrier?
10. calendar_details: Si needs_calendar_action=true, extraire {title: string, date: string (ISO), duration_minutes: number, location?: string, attendees?: string[]}
11. is_urgent_whatsapp: boolean - est-ce suffisamment urgent pour justifier une notification WhatsApp immédiate?
12. needs_response: boolean - est-ce que cet email nécessite une réponse? (false pour newsletters, pubs, notifications automatiques, etc.)
13. response_type: "none" | "draft" | "auto_reply" - quel type de réponse serait approprié? "draft" = brouillon à personnaliser, "auto_reply" = réponse simple et automatique, "none" = pas de réponse nécessaire
14. response_reasoning: string - explique pourquoi tu recommandes ce type de réponse EN FRANÇAIS`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: 'Tu es un assistant d\'analyse d\'emails. Réponds toujours en français avec du JSON valide.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      throw new Error('No response from AI');
    }

    // Try to parse JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    throw new Error('Could not parse AI response as JSON');
  } catch (error) {
    console.error('AI analysis error:', error);
    // Return default analysis
    return {
      sentiment: 'neutral',
      urgency: 5,
      category: 'general',
      key_entities: [],
      suggested_action: 'review',
      body_summary: body.substring(0, 200),
      reasoning: 'AI analysis unavailable, using defaults',
      suggested_label: null,
      needs_calendar_action: false,
      is_urgent_whatsapp: false,
      needs_response: false,
      response_type: 'none',
      response_reasoning: 'AI analysis unavailable',
    };
  }
}

function matchesRule(email: EmailData, rule: any): boolean {
  // Check sender pattern
  if (rule.sender_pattern) {
    const pattern = new RegExp(rule.sender_pattern, 'i');
    if (!pattern.test(email.sender)) {
      return false;
    }
  }

  // Check keywords (with negative keywords support)
  if (rule.keywords && rule.keywords.length > 0) {
    const emailText = `${email.subject} ${email.body}`.toLowerCase();
    
    // Separate positive and negative keywords
    const positiveKeywords = rule.keywords.filter((k: string) => !k.startsWith('-'));
    const negativeKeywords = rule.keywords
      .filter((k: string) => k.startsWith('-'))
      .map((k: string) => k.substring(1)); // Remove the "-" prefix
    
    // Check negative keywords first (exclusions)
    if (negativeKeywords.length > 0) {
      const hasExcludedKeyword = negativeKeywords.some((keyword: string) => 
        emailText.includes(keyword.toLowerCase())
      );
      if (hasExcludedKeyword) {
        console.log(`Rule excluded due to negative keyword match`);
        return false;
      }
    }
    
    // Check positive keywords (at least one must match)
    if (positiveKeywords.length > 0) {
      const hasKeyword = positiveKeywords.some((keyword: string) => 
        emailText.includes(keyword.toLowerCase())
      );
      if (!hasKeyword) {
        return false;
      }
    }
  }

  return true;
}

function calculatePriorityScore(aiAnalysis: any, rule: any): number {
  let score = 5; // Default medium priority

  // Adjust based on AI urgency
  if (aiAnalysis.urgency === 'high') score += 3;
  else if (aiAnalysis.urgency === 'low') score -= 2;

  // Adjust based on rule priority
  if (rule?.priority === 'high') score += 2;
  else if (rule?.priority === 'low') score -= 2;

  // Adjust based on sentiment
  if (aiAnalysis.sentiment === 'negative') score += 1;

  return Math.max(1, Math.min(10, score));
}

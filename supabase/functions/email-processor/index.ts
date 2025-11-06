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

    // Analyze email with AI - pass existing rules for better matching
    // Build existing labels from rules + user history
    const ruleLabels = (rules || [])
      .map((r: any) => r.label_to_apply)
      .filter((label: string | null) => label != null);

    const { data: historyRows, error: historyLabelsError } = await supabase
      .from('email_history')
      .select('applied_label')
      .eq('user_id', emailData.userId)
      .not('applied_label', 'is', null)
      .limit(1000);
    if (historyLabelsError) {
      console.error('Failed to fetch history labels:', historyLabelsError);
    }
    const historyLabels = Array.from(
      new Set(
        (historyRows || [])
          .flatMap((r: any) => Array.isArray(r.applied_label) ? r.applied_label : [])
          .filter((l: any) => typeof l === 'string')
      )
    );

    const existingLabels = Array.from(new Set([...(ruleLabels as string[]), ...historyLabels]));
    
    const aiAnalysis = await analyzeEmailWithAI(
      emailData.sender,
      emailData.subject,
      emailData.body,
      lovableApiKey,
      existingLabels,
      emailData.userId,
      supabase
    );

    console.log('AI Analysis:', aiAnalysis);

    // Match rules
    const matchedRules = (rules || []).filter((rule: any) => matchesRule(emailData, rule));
    
    let shouldCreateDraft = false;
    let shouldAutoReply = false;
    let appliedLabels: string[] = [];
    let appliedRuleId: any = null;
    let shouldNotifyUrgent = false;
    // Prefer AI-selected existing label; only fallback to rules if AI didn't pick one
    let categoryLabel: string | null = null;
    const aiMatchedLabel: string | null = aiAnalysis?.matched_label ?? null;
    if (aiMatchedLabel && existingLabels.includes(aiMatchedLabel)) {
      categoryLabel = aiMatchedLabel;
    } else if (aiAnalysis?.category_label && existingLabels.includes(aiAnalysis.category_label)) {
      categoryLabel = aiAnalysis.category_label;
    }
    let actionLabel: string | null = aiAnalysis.action_label || null;
    
    if (matchedRules.length > 0) {
      // Sort by rule_order and take the first matching rule for primary action
      const sortedRules = matchedRules.sort((a: any, b: any) => a.rule_order - b.rule_order);
      const primaryRule = sortedRules[0];
      
      appliedRuleId = primaryRule;
      
      // Use rule's label as category label (overrides AI suggestion)
      if (primaryRule.label_to_apply && !categoryLabel) {
        categoryLabel = primaryRule.label_to_apply;
        console.log(`Using label "${primaryRule.label_to_apply}" from matched rule (priority ${primaryRule.rule_order}) as fallback`);
      } else if (categoryLabel) {
        console.log(`Using AI-selected existing label: "${categoryLabel}"`);
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

    // Infer action label from suggested_action if missing
    const actionMap: Record<string, string> = {
      reply: 'Actions/A répondre',
      urgent_response: 'Actions/A répondre',
      review: 'Actions/Revue Manuelle',
      archive: 'Actions/Rien à faire',
      forward: 'Actions/Revue Manuelle',
    };
    if (!actionLabel && aiAnalysis?.suggested_action) {
      actionLabel = actionMap[aiAnalysis.suggested_action] || 'Actions/Revue Manuelle';
    }

    // Build final labels: category + action
    appliedLabels = [];
    
    // Add category label (from AI or rule fallback)
    if (categoryLabel) {
      appliedLabels.push(categoryLabel);
    }
    
    // Add action label (from AI or inferred)
    if (actionLabel) {
      appliedLabels.push(actionLabel);
    }
    
    // Fallback if no labels at all
    if (appliedLabels.length === 0) {
      appliedLabels.push('Actions/Revue Manuelle');
      actionLabel = 'Actions/Revue Manuelle';
    }

    // Determine actions taken
    const actionsTaken = [{ type: 'label', value: appliedLabels }];
    
    // Suggest new rule if no rule matched and AI provided a category
    let ruleReinforcement = null;
    let suggestedNewLabel = null;
    
    if (matchedRules.length === 0 && !categoryLabel && aiAnalysis?.suggested_label) {
      ruleReinforcement = `Considérer l'ajout d'une règle pour le label "${aiAnalysis.suggested_label}"`;
      suggestedNewLabel = aiAnalysis.suggested_label;
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
        suggested_new_label: suggestedNewLabel,
        rule_reinforcement_suggestion: ruleReinforcement,
        actions_taken: actionsTaken,
        telegram_notified: false,
      }, { onConflict: 'user_id,gmail_message_id' })
      .select()
      .single();

    if (historyError) throw historyError;

    // Apply Gmail labels (excluding action labels that start with "Actions/")
    if (appliedLabels.length > 0) {
      for (const label of appliedLabels) {
        // Only apply category labels to Gmail, not action labels
        if (!label.startsWith('Actions/')) {
          console.log('Applying Gmail label:', label);
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

    // Automatically create calendar event if needed
    if (aiAnalysis.needs_calendar_action && aiAnalysis.calendar_details) {
      console.log('Creating calendar event automatically:', aiAnalysis.calendar_details);
      
      try {
        const { data: calendarData, error: calendarError } = await supabase.functions.invoke('gmail-calendar', {
          body: {
            userId: emailData.userId,
            eventDetails: {
              title: aiAnalysis.calendar_details.title || emailData.subject,
              date: aiAnalysis.calendar_details.date,
              duration_minutes: aiAnalysis.calendar_details.duration_minutes || 60,
              location: aiAnalysis.calendar_details.location,
              attendees: aiAnalysis.calendar_details.attendees,
              description: aiAnalysis.calendar_details.description || aiAnalysis.body_summary,
            }
          }
        });

        if (calendarError) {
          console.error('Error creating calendar event:', calendarError);
          await supabase
            .from('email_history')
            .update({ 
              actions_taken: [...actionsTaken, { type: 'calendar_failed', value: true, error: calendarError.message }]
            })
            .eq('id', historyRecord.id);
        } else {
          console.log('Calendar event created successfully:', calendarData?.eventId);
          await supabase
            .from('email_history')
            .update({ 
              actions_taken: [...actionsTaken, { type: 'calendar_created', value: true, eventId: calendarData?.eventId }]
            })
            .eq('id', historyRecord.id);
        }
      } catch (calErr: any) {
        console.error('Exception creating calendar event:', calErr);
        await supabase
          .from('email_history')
          .update({ 
            actions_taken: [...actionsTaken, { type: 'calendar_error', value: true, error: calErr.message }]
          })
          .eq('id', historyRecord.id);
      }
    }

    // Get user's Telegram threshold (default to 8)
    const { data: userConfig } = await supabase
      .from('user_api_configs')
      .select('telegram_threshold')
      .eq('user_id', emailData.userId)
      .maybeSingle();
    
    const threshold = userConfig?.telegram_threshold || 8;
    
    // Send Telegram notification if priority exceeds threshold or urgent rule matches
    if (priorityScore >= threshold || shouldNotifyUrgent || aiAnalysis.is_urgent_whatsapp) {
      console.log('Sending Telegram notification');
      
      // Build suggested action message
      let actionText = 'Consulter le mail';
      if (aiAnalysis.suggested_action === 'urgent_response') {
        actionText = 'Répondre de manière urgente';
      } else if (aiAnalysis.suggested_action === 'reply') {
        actionText = 'Répondre au mail';
      } else if (aiAnalysis.needs_calendar_action) {
        actionText = 'Ajouter l\'événement au calendrier';
      }
      
      await supabase.functions.invoke('telegram-sender', {
        body: {
          userId: emailData.userId,
          message: `🚨 *Email ${shouldNotifyUrgent ? 'urgent' : 'prioritaire'} détecté!*\n\n*De:* ${emailData.sender}\n*Sujet:* ${emailData.subject}\n*Priorité:* ${priorityScore}/10\n${appliedLabels.length > 0 ? `*Labels:* ${appliedLabels.join(', ')}\n` : ''}\n📋 *Résumé:* ${aiAnalysis.body_summary}\n\n💡 *Action suggérée:* ${actionText}`,
        }
      });

      // Mark as Telegram sent
      await supabase
        .from('email_history')
        .update({ 
          telegram_notified: true,
          actions_taken: [...actionsTaken, { type: 'telegram_urgent', value: true }]
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
  apiKey: string,
  existingLabels: string[],
  userId: string,
  supabase: any
): Promise<any> {
  try {
    // Récupérer le prompt système personnalisé
    const { data: userConfig } = await supabase
      .from('user_api_configs')
      .select('ai_system_prompt')
      .eq('user_id', userId)
      .maybeSingle();
    
    const systemPrompt = userConfig?.ai_system_prompt || 
      'Tu es un assistant IA spécialisé dans l\'analyse d\'emails. Tu dois être précis, professionnel et toujours vérifier les domaines d\'expéditeur pour détecter le phishing.';
    
    // Récupérer les corrections passées pour l'apprentissage
    const { data: corrections } = await supabase
      .from('email_history')
      .select('sender, subject, applied_label, label_validation_notes')
      .eq('user_id', userId)
      .eq('label_validation_status', 'corrected')
      .order('updated_at', { ascending: false })
      .limit(10);
    
    let learningContext = '';
    if (corrections && corrections.length > 0) {
      learningContext = `\n\n📚 CORRECTIONS PASSÉES (apprends de ces exemples):`;
      corrections.forEach((corr: any, idx: number) => {
        learningContext += `\n${idx + 1}. Email: "${corr.subject}" de ${corr.sender}`;
        if (corr.applied_label) {
          const labels = Array.isArray(corr.applied_label) ? corr.applied_label : [corr.applied_label];
          learningContext += `\n   Labels corrects: ${labels.join(', ')}`;
        }
        if (corr.label_validation_notes) {
          learningContext += `\n   Explication: ${corr.label_validation_notes}`;
        }
      });
    }
    
    const labelsContext = existingLabels.length > 0 
      ? `\n\nLABELS EXISTANTS (à privilégier): ${existingLabels.join(', ')}`
      : '';
    
    const prompt = `Analyse cet email et fournis des informations structurées EN FRANÇAIS:

De: ${sender}
Sujet: ${subject}
Corps: ${body.substring(0, 1000)}${labelsContext}${learningContext}

INSTRUCTIONS CRITIQUES:

1. DÉTECTION PHISHING/SPAM (prioritaire):
   - Vérifie TOUJOURS l'adresse de l'expéditeur
   - Si l'adresse semble suspecte (domaine inhabituel, caractères aléatoires), c'est probablement du phishing ou spam
   - Exemple: maynie.shirishyz@mails.growthinsighte.site = PHISHING (domaine non officiel)
   - Si phishing détecté: category_label = "Secu/Phishing", action_label = "Actions/A supprimer"
   - Si spam détecté: category_label = "Secu/Spam", action_label = "Actions/A supprimer"

2. LABEL DE CATÉGORIE (category_label - obligatoire):
   - D'ABORD, vérifie si c'est du phishing/spam (voir point 1)
   - ENSUITE, vérifie si l'email correspond à un des LABELS EXISTANTS ci-dessus
   - Si OUI, utilise CE label exact (même orthographe) et mets matched_label = ce label
   - Si NON, suggère un nouveau label THÉMATIQUE:
     * Secu/Phishing - Emails suspects, tentatives de phishing, adresses non officielles
     * Secu/Spam - Spam, publicités non sollicitées
     * Secu/Alerte - Alertes de sécurité légitimes
     * Newsletter - Newsletters d'entreprises reconnues
     * Admin/* - Emails administratifs
     * Commande/* - Confirmations de commande
     * etc.

3. LABEL D'ACTION (action_label - obligatoire, toujours préfixer par "Actions/"):
   - Actions/A répondre - Email légitime nécessitant une réponse
   - Actions/Automatique - Réponse automatique déjà envoyée ou prévue
   - Actions/A supprimer - Email à supprimer (spam, phishing, indésirable)
   - Actions/Revue Manuelle - Email nécessitant vérification manuelle
   - Actions/Rien à faire - Email informatif légitime, aucune action requise

4. RAISONNEMENT (reasoning - obligatoire):
   - Explique EN FRANÇAIS pourquoi tu as choisi CES DEUX LABELS
   - Si c'est du phishing/spam, MENTIONNE-LE explicitement
   - Si tu as utilisé un label existant, dis lequel
   - Si tu proposes un nouveau label, explique pourquoi

Fournis une réponse JSON avec:
1. urgency: échelle de 1 à 10
2. key_entities: tableau des noms importants, dates, montants
3. suggested_action: reply/forward/archive/review/urgent_response
4. body_summary: Résumé bref en 2-3 phrases EN FRANÇAIS (mentionne si c'est du phishing/spam)
5. reasoning: Explique pourquoi tu as choisi ces 2 labels EN FRANÇAIS
6. category_label: Le label de catégorie choisi (OBLIGATOIRE)
7. action_label: Le label d'action choisi avec préfixe "Actions/" (OBLIGATOIRE)
8. is_phishing: boolean - true si c'est du phishing détecté
9. is_spam: boolean - true si c'est du spam
10. matched_label: Si un label existant correspond, mets-le ici (sinon null)
11. suggested_label: Si matched_label est null, suggère un nouveau label thématique
12. needs_calendar_action: boolean
13. calendar_details: Si needs_calendar_action=true, {title, date (ISO), duration_minutes, location?, attendees?}
14. is_urgent_whatsapp: boolean
15. needs_response: boolean
16. response_type: "none" | "draft" | "auto_reply"
17. response_reasoning: string EN FRANÇAIS`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-5-mini',
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
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
      urgency: 5,
      key_entities: [],
      suggested_action: 'review',
      body_summary: body.substring(0, 200),
      reasoning: 'AI analysis unavailable, using defaults',
      category_label: 'Needs Manual Review',
      action_label: 'Actions/Revue Manuelle',
      is_phishing: false,
      is_spam: false,
      matched_label: null,
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

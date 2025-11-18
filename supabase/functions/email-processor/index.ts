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
    
    // Get user configuration for AI prompts
    const { data: userConfig } = await supabase
      .from('user_api_configs')
      .select('ai_system_prompt, ai_categorization_rules')
      .eq('user_id', emailData.userId)
      .maybeSingle();
    
    const aiAnalysis = await analyzeEmailWithAI(
      emailData.sender,
      emailData.subject,
      emailData.body,
      lovableApiKey,
      existingLabels,
      emailData.userId,
      supabase,
      userConfig?.ai_system_prompt,
      userConfig?.ai_categorization_rules
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
    
    // CRITICAL FIX: Only create draft if AI explicitly recommends it AND rule allows it
    // Never force draft creation just because a rule has create_draft=true
    // The create_draft flag should only ALLOW, not FORCE draft creation
    
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

    // Build final labels: category + action (VALIDATION: must have exactly 1 category + 1 action)
    appliedLabels = [];
    
    // Add category label (from AI or rule fallback)
    if (categoryLabel) {
      appliedLabels.push(categoryLabel);
    }
    
    // Add action label (from AI or inferred)
    if (actionLabel) {
      appliedLabels.push(actionLabel);
    }
    
    // CRITICAL VALIDATION: Must have at least 1 category and 1 action
    const hasCategory = appliedLabels.some(label => !label.startsWith('Actions/'));
    const hasAction = appliedLabels.some(label => label.startsWith('Actions/'));
    
    // Track if manual review is needed (as a flag, not a label)
    let needsManualReview = false;
    
    // Fix: If missing category, flag for manual review but don't add label
    if (!hasCategory) {
      console.warn('Missing category label, flagging for manual review');
      needsManualReview = true;
    }
    
    // Fix: If missing action, add a default one
    if (!hasAction) {
      console.warn('Missing action label, adding default "Actions/Revue Manuelle"');
      appliedLabels.push('Actions/Revue Manuelle');
      actionLabel = 'Actions/Revue Manuelle';
      needsManualReview = true;
    }
    
    // Fix: If we have multiple action labels, keep only the first one
    const actionLabels = appliedLabels.filter(label => label.startsWith('Actions/'));
    if (actionLabels.length > 1) {
      console.warn(`Multiple action labels detected (${actionLabels.join(', ')}), keeping only the first one`);
      appliedLabels = appliedLabels.filter(label => !label.startsWith('Actions/') || label === actionLabels[0]);
      actionLabel = actionLabels[0];
    }
    
    // Fix: If we have multiple category labels, keep only the first one
    const categoryLabels = appliedLabels.filter(label => !label.startsWith('Actions/'));
    if (categoryLabels.length > 1) {
      console.warn(`Multiple category labels detected (${categoryLabels.join(', ')}), keeping only the first one`);
      appliedLabels = [categoryLabels[0], ...appliedLabels.filter(label => label.startsWith('Actions/'))];
      categoryLabel = categoryLabels[0];
    }
    
    console.log('Final labels (validated):', { category: categoryLabel, action: actionLabel, all: appliedLabels, needsManualReview });

    // Determine actions taken with manual review flag
    const actionsTaken = [
      { type: 'label', value: appliedLabels },
      ...(needsManualReview ? [{ type: 'needs_manual_review', value: true }] : [])
    ];
    
    // AI can always suggest new labels if it thinks they would be useful
    let ruleReinforcement = null;
    let suggestedNewLabel = null;
    
    // Suggest new label if AI provided one, regardless of whether rules matched
    if (aiAnalysis?.suggested_label && !existingLabels.includes(aiAnalysis.suggested_label)) {
      suggestedNewLabel = aiAnalysis.suggested_label;
      ruleReinforcement = `Nouveau label proposé : "${aiAnalysis.suggested_label}" - Valider pour créer une règle automatique`;
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
        confidence: aiAnalysis.confidence || 50,
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

    // Automatically create calendar event if needed and filters pass
    if (aiAnalysis.needs_calendar_action && aiAnalysis.calendar_details) {
      console.log('Calendar event candidate:', aiAnalysis.calendar_details);
      
      // Get user's calendar rules to check filters
      const { data: calendarRules } = await supabase
        .from('calendar_rules')
        .select('sender_patterns_exclude, keywords_exclude, auto_create_events')
        .eq('user_id', emailData.userId)
        .limit(1)
        .maybeSingle();

      let shouldCreateEvent = true;
      const excludeReasons: string[] = [];

      // Check if it's a Google Calendar notification (to prevent loops)
      if (emailData.sender.toLowerCase().includes('calendar-notification@google.com') ||
          emailData.sender.toLowerCase().includes('calendar@google.com')) {
        shouldCreateEvent = false;
        excludeReasons.push('Google Calendar notification detected');
      }

      // Apply user-defined filters if calendar rules exist
      if (calendarRules) {
        const senderLower = emailData.sender.toLowerCase();
        const subjectLower = emailData.subject?.toLowerCase() || '';
        const bodyLower = emailData.body?.toLowerCase() || '';

        // Check sender exclusions
        if (calendarRules.sender_patterns_exclude?.length > 0) {
          for (const pattern of calendarRules.sender_patterns_exclude) {
            if (senderLower.includes(pattern.toLowerCase())) {
              shouldCreateEvent = false;
              excludeReasons.push(`Sender matches exclude pattern: ${pattern}`);
              break;
            }
          }
        }

        // Check keyword exclusions
        if (shouldCreateEvent && calendarRules.keywords_exclude?.length > 0) {
          for (const keyword of calendarRules.keywords_exclude) {
            const keywordLower = keyword.toLowerCase();
            if (subjectLower.includes(keywordLower) || bodyLower.includes(keywordLower)) {
              shouldCreateEvent = false;
              excludeReasons.push(`Contains excluded keyword: ${keyword}`);
              break;
            }
          }
        }
      }

      if (!shouldCreateEvent) {
        console.log('Calendar event creation skipped:', excludeReasons);
        await supabase
          .from('email_history')
          .update({ 
            needs_calendar_action: true,
            calendar_details: aiAnalysis.calendar_details,
            actions_taken: [...actionsTaken, { 
              type: 'calendar_skipped', 
              value: true, 
              reasons: excludeReasons 
            }]
          })
          .eq('id', historyRecord.id);
      } else if (calendarRules?.auto_create_events) {
        // Auto-create only if enabled in rules
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
                needs_calendar_action: true,
                calendar_details: aiAnalysis.calendar_details,
                actions_taken: [...actionsTaken, { type: 'calendar_failed', value: true, error: calendarError.message }]
              })
              .eq('id', historyRecord.id);
          } else {
            console.log('Calendar event created successfully:', calendarData?.eventId);
            await supabase
              .from('email_history')
              .update({ 
                needs_calendar_action: false,
                calendar_details: aiAnalysis.calendar_details,
                actions_taken: [...actionsTaken, { type: 'calendar_created', value: true, eventId: calendarData?.eventId }]
              })
              .eq('id', historyRecord.id);
          }
        } catch (calErr: any) {
          console.error('Exception creating calendar event:', calErr);
          await supabase
            .from('email_history')
            .update({ 
              needs_calendar_action: true,
              calendar_details: aiAnalysis.calendar_details,
              actions_taken: [...actionsTaken, { type: 'calendar_error', value: true, error: calErr.message }]
            })
            .eq('id', historyRecord.id);
        }
      } else {
        // Store for manual action
        console.log('Calendar event needs manual confirmation');
        await supabase
          .from('email_history')
          .update({ 
            needs_calendar_action: true,
            calendar_details: aiAnalysis.calendar_details
          })
          .eq('id', historyRecord.id);
      }
    }

    // Get user's Telegram threshold (default to 8)
    const { data: userNotifyConfig } = await supabase
      .from('user_api_configs')
      .select('telegram_threshold')
      .eq('user_id', emailData.userId)
      .maybeSingle();
    
    const threshold = userNotifyConfig?.telegram_threshold || 8;
    
    // Check if the category label has notify_urgent in its rule
    const categoryRule = (rules || []).find((r: any) => r.label_to_apply === categoryLabel);
    const shouldNotifyForCategoryLabel = categoryRule?.notify_urgent || false;
    
    // Send Telegram notification if:
    // 1. Priority exceeds threshold
    // 2. A matched rule has notify_urgent flag
    // 3. The category label's rule has notify_urgent flag
    // 4. AI marked it as urgent for WhatsApp
    // 5. AI analysis failed and needs attention (but not urgent notification)
    const isAiAnalysisFailed = aiAnalysis.reasoning === 'AI analysis unavailable, using defaults';
    const shouldNotify = priorityScore >= threshold || shouldNotifyUrgent || shouldNotifyForCategoryLabel || aiAnalysis.is_urgent_whatsapp;
    
    // Special handling for AI analysis failures: notify but mark as error, not urgent
    if (isAiAnalysisFailed && !shouldNotify) {
      console.log('AI analysis failed - sending error notification');
      await supabase.functions.invoke('telegram-sender', {
        body: {
          userId: emailData.userId,
          message: `⚠️ *Erreur d'analyse IA*\n\n*De:* ${emailData.sender}\n*Sujet:* ${emailData.subject}\n\n❌ L'analyse IA a échoué pour cet email. Veuillez le vérifier manuellement.\n\n📧 Consultez l'application pour plus de détails.`,
        }
      });
      await supabase
        .from('email_history')
        .update({ 
          telegram_notified: true,
          actions_taken: [...actionsTaken, { type: 'telegram_error', value: true, reasoning: 'AI analysis failed' }]
        })
        .eq('id', historyRecord.id);
    } else if (shouldNotify) {
      console.log('Sending Telegram notification', { 
        reason: {
          priorityExceedsThreshold: priorityScore >= threshold,
          ruleNotifyUrgent: shouldNotifyUrgent,
          categoryLabelNotifyUrgent: shouldNotifyForCategoryLabel,
          aiUrgentWhatsapp: aiAnalysis.is_urgent_whatsapp
        }
      });
      
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
  supabase: any,
  customSystemPrompt?: string,
  customCategorizationRules?: string
): Promise<any> {
  try {
    const systemPrompt = customSystemPrompt || 
      `Tu es un assistant de classification d'emails. Tu DOIS appliquer exactement 2 labels :
1. UN label de CATÉGORIE
2. UN label d'ACTION

Tu as accès à la database complète des règles avec :
- Label à appliquer
- Priorité
- Domaines expéditeurs
- Mots-clés
- Description (contient l'historique des feedbacks utilisateur)

Analyse l'email reçu et choisis les 2 labels les plus pertinents en te basant sur :
1. Correspondance domaine expéditeur
2. Présence mots-clés
3. Priorité du label
4. Feedbacks utilisateur dans les descriptions (éléments les plus récents = plus importants)

Sois précis et cohérent avec les apprentissages passés stockés dans les descriptions.`;
    
    const categorizationRules = customCategorizationRules || 
      `## Instructions de Catégorisation

Tu dois OBLIGATOIREMENT attribuer exactement 2 labels à chaque email :
1. **UN label de catégorie** (ex: "Travail/Projets", "Personnel/Famille", "Finance/Banque")
2. **UN label d'action** qui commence par "Actions/" (ex: "Actions/À Répondre", "Actions/À Lire", "Actions/Archiver")

### Labels d'Action Disponibles
- Actions/A répondre - Email légitime nécessitant une réponse
- Actions/Automatique - Réponse automatique déjà envoyée ou prévue
- Actions/A supprimer - Email à supprimer (spam, phishing, indésirable)
- Actions/Revue Manuelle - Email nécessitant vérification manuelle
- Actions/Rien à faire - Email informatif légitime, aucune action requise

### Règles de Priorité (influencées par l'action requise)
- Score 9-10 : Urgent ET important (facture impayée, deadline proche, problème critique) → Actions/A répondre
- Score 7-8 : Important mais pas urgent (projet en cours, information importante) → Actions/A répondre
- Score 5-6 : Normal (emails quotidiens, confirmations) → Actions/Revue Manuelle
- Score 3-4 : Faible priorité (newsletters, promotions) → Actions/Rien à faire
- Score 1-2 : Très faible (spam, marketing non sollicité) → Actions/A supprimer

### Validation
- Si aucune catégorie ne correspond → flag "needs_manual_review" (pas de label)
- Si aucune action ne correspond → "Actions/Revue Manuelle"
- TOUJOURS retourner exactement 2 labels (1 catégorie + 1 action)

### Proposition de nouveaux labels
- Si tu identifies une thématique récurrente qui n'existe pas encore dans les labels, propose-la dans "suggested_label"
- Exemples : "Immobilier", "RDV Médicaux", "Voyages", "Famille", etc.`;
    
    // Récupérer TOUTES les règles actives avec leurs descriptions enrichies
    const { data: rules } = await supabase
      .from('email_rules')
      .select('label_to_apply, priority, sender_pattern, keywords, description')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('rule_order', { ascending: true });
    
    let rulesContext = '';
    if (rules && rules.length > 0) {
      rulesContext = `\n\n📋 BASE DE DONNÉES DES RÈGLES (avec historique des feedbacks):`;
      rules.forEach((rule: any, idx: number) => {
        rulesContext += `\n\n${idx + 1}. Label: "${rule.label_to_apply}"`;
        if (rule.priority) rulesContext += ` | Priorité: ${rule.priority}`;
        if (rule.sender_pattern) rulesContext += ` | Domaine: ${rule.sender_pattern}`;
        if (rule.keywords && rule.keywords.length > 0) {
          rulesContext += ` | Mots-clés: ${rule.keywords.join(', ')}`;
        }
        if (rule.description && rule.description.trim()) {
          rulesContext += `\n   📚 Feedbacks utilisateur:\n   ${rule.description.split('\n').join('\n   ')}`;
        }
      });
    }
    
    const labelsContext = existingLabels.length > 0 
      ? `\n\nLABELS EXISTANTS: ${existingLabels.join(', ')}`
      : '';
    
    const prompt = `Analyse cet email et fournis des informations structurées EN FRANÇAIS:

De: ${sender}
Sujet: ${subject}
Corps: ${body.substring(0, 1000)}${labelsContext}${rulesContext}

${categorizationRules}

Fournis une réponse JSON avec:
1. urgency: échelle de 1 à 10
2. key_entities: tableau des noms importants, dates, montants
3. suggested_action: reply/forward/archive/review/urgent_response
4. body_summary: Résumé bref en 2-3 phrases EN FRANÇAIS
5. reasoning: Explique BRIÈVEMENT pourquoi tu as choisi ces 2 labels EN FRANÇAIS (1-2 phrases maximum, sois concis)
6. confidence: échelle de 0 à 100 représentant ta confiance dans le choix des labels
7. category_label: Le label de catégorie choisi (OBLIGATOIRE)
8. action_label: Le label d'action choisi avec préfixe "Actions/" (OBLIGATOIRE)
9. is_phishing: boolean - true si c'est du phishing détecté
10. is_spam: boolean - true si c'est du spam
11. matched_label: Si une règle existante correspond, mets son label ici (sinon null)
12. suggested_label: Si matched_label est null, suggère un nouveau label thématique
13. needs_calendar_action: boolean
14. calendar_details: Si needs_calendar_action=true, {title, date (ISO), duration_minutes, location?, attendees?}
15. is_urgent_whatsapp: boolean
16. needs_response: boolean
17. response_type: "none" | "draft" | "auto_reply"
18. response_reasoning: string EN FRANÇAIS`;

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
    // Return default analysis with low priority to avoid false urgent notifications
    return {
      urgency: 3, // Low urgency to avoid triggering notifications
      key_entities: [],
      suggested_action: 'review',
      body_summary: body.substring(0, 200),
      reasoning: 'AI analysis unavailable, using defaults',
      confidence: 30,
      category_label: null, // No category when AI fails
      action_label: 'Actions/Revue Manuelle', // Manual review required
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
    try {
      const raw = String(rule.sender_pattern);
      // Escape all regex metacharacters, then re-introduce wildcard support: * => .*, ? => .
      const escaped = raw
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\\\*/g, '.*')
        .replace(/\\\?/g, '.');
      const pattern = new RegExp(`^${escaped}$`, 'i');
      if (!pattern.test(email.sender)) {
        return false;
      }
    } catch (e) {
      console.warn('Invalid sender_pattern, skipping rule match:', rule.sender_pattern, e);
      // If pattern is invalid, treat as non-match rather than throwing
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

  // CRITICAL: Adjust based on action label - responding is more important than nothing
  const actionLabel = aiAnalysis.action_label || '';
  if (actionLabel.includes('A répondre')) score += 3;
  else if (actionLabel.includes('Revue Manuelle')) score += 1;
  else if (actionLabel.includes('Rien à faire')) score -= 2;
  else if (actionLabel.includes('A supprimer')) score -= 3;

  // Adjust based on sentiment
  if (aiAnalysis.sentiment === 'negative') score += 1;

  return Math.max(1, Math.min(10, score));
}

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
    let appliedRule = null;
    let appliedLabel = null;

    for (const rule of rules || []) {
      if (matchesRule(emailData, rule)) {
        appliedRule = rule;
        appliedLabel = rule.label_to_apply;
        break;
      }
    }

    // Calculate priority score
    const priorityScore = calculatePriorityScore(aiAnalysis, appliedRule);

    // Determine actions taken
    const actionsTaken = [];
    let shouldCreateDraft = appliedRule?.auto_action === 'create_draft';
    
    if (appliedLabel) actionsTaken.push({ type: 'label', value: appliedLabel });
    if (!appliedLabel && !shouldCreateDraft) {
      actionsTaken.push({ type: 'manual_review', value: 'Needs Manual Review' });
      appliedLabel = 'Needs Manual Review';
    }

    // Determine rule reinforcement suggestion
    let ruleReinforcement = null;
    if (appliedRule && aiAnalysis.suggested_label && aiAnalysis.suggested_label !== appliedLabel) {
      ruleReinforcement = `Consider adding rule for label "${aiAnalysis.suggested_label}" based on similar patterns`;
    }

    // Save to email history with enriched data
    const { data: historyRecord, error: historyError } = await supabase
      .from('email_history')
      .insert({
        user_id: emailData.userId,
        gmail_message_id: emailData.messageId,
        sender: emailData.sender,
        subject: emailData.subject,
        received_at: emailData.receivedAt,
        applied_label: appliedLabel,
        priority_score: priorityScore,
        ai_analysis: aiAnalysis,
        draft_created: false,
        body_summary: aiAnalysis.body_summary || emailData.body?.substring(0, 200),
        ai_reasoning: aiAnalysis.reasoning,
        suggested_new_label: aiAnalysis.suggested_label,
        rule_reinforcement_suggestion: ruleReinforcement,
        actions_taken: actionsTaken,
      })
      .select()
      .single();

    if (historyError) throw historyError;

    // Apply Gmail label if rule matched
    if (appliedLabel) {
      console.log('Applying label:', appliedLabel);
      // Call gmail-actions function
      await supabase.functions.invoke('gmail-actions', {
        body: {
          action: 'apply_label',
          userId: emailData.userId,
          messageId: emailData.messageId,
          label: appliedLabel,
        }
      });
    }

    // Generate draft if needed
    let draftResult = null;
    if (shouldCreateDraft) {
      console.log('Generating draft response');
      const { data: draftData } = await supabase.functions.invoke('gmail-actions', {
        body: {
          action: 'create_draft',
          userId: emailData.userId,
          messageId: emailData.messageId,
          emailContext: {
            sender: emailData.sender,
            subject: emailData.subject,
            body: emailData.body,
          },
          template: appliedRule.response_template,
        }
      });

      if (draftData?.draftId) {
        draftResult = draftData;
        await supabase
          .from('email_history')
          .update({ 
            draft_created: true, 
            draft_id: draftData.draftId,
            actions_taken: [...actionsTaken, { type: 'draft_created', value: true }]
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

    // Send WhatsApp notification if high priority OR AI says it's urgent
    if (priorityScore >= 8 || aiAnalysis.is_urgent_whatsapp) {
      console.log('Sending WhatsApp notification');
      await supabase.functions.invoke('whatsapp-sender', {
        body: {
          userId: emailData.userId,
          type: 'alert',
          message: `🚨 Email urgent !\nDe: ${emailData.sender}\nSujet: ${emailData.subject}\nPriorité: ${priorityScore}/10\n\nRésumé: ${aiAnalysis.body_summary}`,
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
        label: appliedLabel,
        priority: priorityScore 
      },
      status: 'success'
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        appliedLabel,
        priorityScore,
        draftCreated: !!appliedRule?.auto_action 
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
    const prompt = `Analyze this email and provide detailed structured information:

From: ${sender}
Subject: ${subject}
Body: ${body.substring(0, 1000)}

Provide a JSON response with:
1. sentiment: positive/neutral/negative
2. urgency: 1-10 scale
3. category: work/personal/newsletter/spam/billing/support/other
4. key_entities: array of important names, dates, amounts mentioned
5. suggested_action: reply/forward/archive/review/urgent_response
6. body_summary: Brief 2-3 sentence summary of the email content
7. reasoning: Explain your analysis and why you chose these classifications
8. suggested_label: If this doesn't fit existing categories, suggest a new label name
9. needs_calendar_action: boolean - does this mention a meeting/event that should be calendared?
10. is_urgent_whatsapp: boolean - is this urgent enough to warrant immediate WhatsApp notification?`;

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
            content: 'You are an email analysis assistant. Always respond with valid JSON.',
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

  // Check keywords
  if (rule.keywords && rule.keywords.length > 0) {
    const emailText = `${email.subject} ${email.body}`.toLowerCase();
    const hasKeyword = rule.keywords.some((keyword: string) => 
      emailText.includes(keyword.toLowerCase())
    );
    if (!hasKeyword) {
      return false;
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

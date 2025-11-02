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

    // Save to email history
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
    if (appliedRule?.auto_action === 'create_draft') {
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
        await supabase
          .from('email_history')
          .update({ draft_created: true, draft_id: draftData.draftId })
          .eq('id', historyRecord.id);
      }
    }

    // Send WhatsApp notification if high priority
    if (priorityScore >= 7) {
      console.log('Sending WhatsApp notification');
      await supabase.functions.invoke('whatsapp-sender', {
        body: {
          userId: emailData.userId,
          type: 'alert',
          message: `🚨 Email urgent de ${emailData.sender}\n\n${emailData.subject}\n\nPriorité: ${priorityScore}/10`,
        }
      });
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

async function analyzeEmailWithAI(sender: string, subject: string, body: string, apiKey: string) {
  const prompt = `Analyse cet email et fournis une réponse JSON structurée:

Expéditeur: ${sender}
Sujet: ${subject}
Corps: ${body.substring(0, 500)}...

Fournis:
1. sentiment (positive/neutral/negative)
2. urgency (low/medium/high)
3. category (commercial/important/notification/spam)
4. keyEntities (array of important entities mentioned)
5. suggestedAction (string - action recommandée)

Réponds UNIQUEMENT avec un objet JSON valide.`;

  try {
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
            content: 'Tu es un assistant IA spécialisé dans l\'analyse d\'emails. Réponds toujours avec du JSON valide.' 
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    
    // Parse JSON from AI response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    return {
      sentiment: 'neutral',
      urgency: 'medium',
      category: 'notification',
      keyEntities: [],
      suggestedAction: 'review'
    };
  } catch (error) {
    console.error('AI analysis error:', error);
    return {
      sentiment: 'neutral',
      urgency: 'medium',
      category: 'notification',
      keyEntities: [],
      suggestedAction: 'review'
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

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GmailAction {
  action: 'apply_label' | 'create_draft';
  userId: string;
  messageId: string;
  label?: string;
  emailContext?: {
    sender: string;
    subject: string;
    body: string;
  };
  template?: string;
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

    const actionData: GmailAction = await req.json();
    console.log(`Gmail action: ${actionData.action} for message:`, actionData.messageId);

    // Get user's Gmail credentials
    const { data: config, error: configError } = await supabase
      .from('user_api_configs')
      .select('gmail_credentials')
      .eq('user_id', actionData.userId)
      .single();

    if (configError || !config?.gmail_credentials) {
      throw new Error('Gmail credentials not found for user');
    }

    const gmailCredentials = config.gmail_credentials as any;

    if (actionData.action === 'apply_label') {
      // Apply label to Gmail message
      await applyGmailLabel(
        actionData.messageId,
        actionData.label!,
        gmailCredentials
      );

      await supabase.from('activity_logs').insert({
        user_id: actionData.userId,
        action_type: 'gmail_label_applied',
        action_details: { messageId: actionData.messageId, label: actionData.label },
        status: 'success'
      });

      return new Response(
        JSON.stringify({ success: true, action: 'label_applied' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else if (actionData.action === 'create_draft') {
      // Generate draft with AI
      const draftContent = await generateDraftWithAI(
        actionData.emailContext!,
        actionData.template,
        lovableApiKey
      );

      // Create draft in Gmail
      const draftId = await createGmailDraft(
        actionData.messageId,
        actionData.emailContext!.sender,
        actionData.emailContext!.subject,
        draftContent,
        gmailCredentials
      );

      await supabase.from('activity_logs').insert({
        user_id: actionData.userId,
        action_type: 'gmail_draft_created',
        action_details: { messageId: actionData.messageId, draftId },
        status: 'success'
      });

      return new Response(
        JSON.stringify({ 
          success: true, 
          action: 'draft_created',
          draftId,
          content: draftContent
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    throw new Error('Unknown action type');

  } catch (error: any) {
    console.error('Error executing Gmail action:', error);

    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

async function applyGmailLabel(messageId: string, label: string, credentials: any) {
  // Mock implementation - in production, use Gmail API
  console.log(`Applying label "${label}" to message ${messageId}`);
  
  // Example Gmail API call structure:
  // const response = await fetch(
  //   `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`,
  //   {
  //     method: 'POST',
  //     headers: {
  //       'Authorization': `Bearer ${credentials.access_token}`,
  //       'Content-Type': 'application/json',
  //     },
  //     body: JSON.stringify({
  //       addLabelIds: [label]
  //     })
  //   }
  // );
  
  return { success: true };
}

async function createGmailDraft(
  messageId: string,
  recipient: string,
  subject: string,
  content: string,
  credentials: any
): Promise<string> {
  // Mock implementation - in production, use Gmail API
  console.log(`Creating draft for message ${messageId}`);
  
  // Example Gmail API call structure:
  // const response = await fetch(
  //   'https://gmail.googleapis.com/gmail/v1/users/me/drafts',
  //   {
  //     method: 'POST',
  //     headers: {
  //       'Authorization': `Bearer ${credentials.access_token}`,
  //       'Content-Type': 'application/json',
  //     },
  //     body: JSON.stringify({
  //       message: {
  //         threadId: messageId,
  //         raw: btoa(`To: ${recipient}\nSubject: Re: ${subject}\n\n${content}`)
  //       }
  //     })
  //   }
  // );
  
  return `draft_${Date.now()}`;
}

async function generateDraftWithAI(
  emailContext: { sender: string; subject: string; body: string },
  template: string | undefined,
  apiKey: string
): Promise<string> {
  const prompt = template 
    ? `En utilisant ce template: "${template}"\n\nGénère une réponse pour cet email:\nDe: ${emailContext.sender}\nSujet: ${emailContext.subject}\nContenu: ${emailContext.body.substring(0, 300)}...`
    : `Génère une réponse professionnelle et polie pour cet email:\nDe: ${emailContext.sender}\nSujet: ${emailContext.subject}\nContenu: ${emailContext.body.substring(0, 300)}...`;

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
            content: 'Tu es un assistant qui génère des réponses d\'emails professionnelles en français.' 
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;

  } catch (error) {
    console.error('AI draft generation error:', error);
    return `Bonjour,\n\nMerci pour votre message. Je reviendrai vers vous prochainement.\n\nCordialement`;
  }
}

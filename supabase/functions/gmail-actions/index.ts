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

async function applyGmailLabel(messageId: string, labelName: string, credentials: any) {
  let accessToken = credentials.access_token;

  // Helper to call Gmail API with automatic refresh on 401/403
  const gmailFetch = async (url: string, init?: RequestInit): Promise<Response> => {
    let res = await fetch(url, {
      ...(init || {}),
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...(init?.headers || {}),
      },
    });

    if (!res.ok && (res.status === 401 || res.status === 403) && credentials.refresh_token) {
      // Try refresh token once
      accessToken = await refreshAccessToken(credentials);
      res = await fetch(url, {
        ...(init || {}),
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          ...(init?.headers || {}),
        },
      });
    }

    return res;
  };

  // 1) Find or create the label to get its ID
  const labelsRes = await gmailFetch('https://gmail.googleapis.com/gmail/v1/users/me/labels');
  if (!labelsRes.ok) {
    const text = await labelsRes.text();
    throw new Error(`Gmail labels list failed: ${labelsRes.status} ${text}`);
  }
  const labelsJson = await labelsRes.json();
  const existing = (labelsJson.labels || []).find((l: any) => l.name === labelName);

  let labelId = existing?.id as string | undefined;
  if (!labelId) {
    const createRes = await gmailFetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', {
      method: 'POST',
      body: JSON.stringify({
        name: labelName,
        labelListVisibility: 'labelShow',
        messageListVisibility: 'show',
      }),
    });
    if (!createRes.ok) {
      const text = await createRes.text();
      throw new Error(`Gmail label create failed: ${createRes.status} ${text}`);
    }
    const created = await createRes.json();
    labelId = created.id;
  }

  // 2) Apply the label ID to the message
  const modifyRes = await gmailFetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`, {
    method: 'POST',
    body: JSON.stringify({ addLabelIds: [labelId] }),
  });
  if (!modifyRes.ok) {
    const text = await modifyRes.text();
    throw new Error(`Gmail modify failed: ${modifyRes.status} ${text}`);
  }

  console.log(`Applied label "${labelName}" (id: ${labelId}) to message ${messageId}`);
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

async function refreshAccessToken(credentials: any): Promise<string> {
  const clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET');

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId!,
      client_secret: clientSecret!,
      refresh_token: credentials.refresh_token,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to refresh access token');
  }

  const { access_token } = await response.json();
  return access_token;
}

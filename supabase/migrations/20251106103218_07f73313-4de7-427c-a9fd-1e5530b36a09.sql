-- Add system prompt configuration to user_api_configs
ALTER TABLE public.user_api_configs 
ADD COLUMN IF NOT EXISTS ai_system_prompt TEXT DEFAULT 'Tu es un assistant IA spécialisé dans l''analyse d''emails. Tu dois être précis, professionnel et toujours vérifier les domaines d''expéditeur pour détecter le phishing.';

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_email_history_corrections 
ON public.email_history(user_id, label_validation_status) 
WHERE label_validation_status = 'corrected';
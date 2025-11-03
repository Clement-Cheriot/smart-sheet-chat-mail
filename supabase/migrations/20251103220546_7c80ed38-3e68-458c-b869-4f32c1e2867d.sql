-- Add sync_in_progress flag to prevent concurrent synchronizations
ALTER TABLE public.gmail_sync_state 
ADD COLUMN IF NOT EXISTS sync_in_progress BOOLEAN DEFAULT false;

-- Add whatsapp_threshold to control when alerts are sent
ALTER TABLE public.user_api_configs 
ADD COLUMN IF NOT EXISTS whatsapp_threshold INTEGER DEFAULT 8 CHECK (whatsapp_threshold >= 1 AND whatsapp_threshold <= 10);
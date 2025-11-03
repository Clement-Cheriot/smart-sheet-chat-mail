-- Add new columns to email_rules for better control
ALTER TABLE public.email_rules 
ADD COLUMN IF NOT EXISTS create_draft boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS auto_reply boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS exclude_newsletters boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS exclude_marketing boolean DEFAULT true;

-- Update existing rules: disable draft creation by default
UPDATE public.email_rules SET create_draft = false WHERE create_draft IS NULL;
UPDATE public.email_rules SET auto_reply = false WHERE auto_reply IS NULL;
UPDATE public.email_rules SET exclude_newsletters = true WHERE exclude_newsletters IS NULL;
UPDATE public.email_rules SET exclude_marketing = true WHERE exclude_marketing IS NULL;
-- Add label_validation_notes column to email_history table
ALTER TABLE public.email_history 
ADD COLUMN IF NOT EXISTS label_validation_notes text;
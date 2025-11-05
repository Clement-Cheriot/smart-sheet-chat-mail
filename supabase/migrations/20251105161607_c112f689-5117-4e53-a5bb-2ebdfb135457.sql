-- Migration: Ajouter telegram_notified à email_history

ALTER TABLE public.email_history 
ADD COLUMN IF NOT EXISTS telegram_notified BOOLEAN DEFAULT false;
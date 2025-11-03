-- Add unique index to prevent duplicate emails per user
CREATE UNIQUE INDEX IF NOT EXISTS email_history_user_message_uidx
ON public.email_history (user_id, gmail_message_id);
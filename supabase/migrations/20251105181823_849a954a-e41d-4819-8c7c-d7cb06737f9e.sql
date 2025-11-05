-- Add Telegram preferences to email_summary_schedules
ALTER TABLE email_summary_schedules 
ADD COLUMN IF NOT EXISTS telegram_text boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS telegram_audio boolean DEFAULT false;
-- Add telegram default preferences to user_api_configs
ALTER TABLE user_api_configs 
ADD COLUMN IF NOT EXISTS telegram_text_default BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS telegram_audio_default BOOLEAN DEFAULT false;
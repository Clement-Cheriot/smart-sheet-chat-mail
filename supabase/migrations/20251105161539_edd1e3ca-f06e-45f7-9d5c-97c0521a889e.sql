-- Migration: Remplacer WhatsApp par Telegram dans user_api_configs

-- Ajouter les colonnes Telegram
ALTER TABLE public.user_api_configs 
ADD COLUMN IF NOT EXISTS telegram_bot_token TEXT,
ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT,
ADD COLUMN IF NOT EXISTS telegram_threshold INTEGER DEFAULT 8;
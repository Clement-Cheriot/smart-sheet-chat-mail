-- Add recipient phone number field to user_api_configs
ALTER TABLE public.user_api_configs 
ADD COLUMN whatsapp_recipient_number text;
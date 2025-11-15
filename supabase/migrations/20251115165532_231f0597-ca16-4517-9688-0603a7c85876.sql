-- Add auto_reply_enabled column to contact_rules table
ALTER TABLE contact_rules 
ADD COLUMN IF NOT EXISTS auto_reply_enabled boolean DEFAULT false;

COMMENT ON COLUMN contact_rules.auto_reply_enabled IS 'Si true, les réponses automatiques sont activées pour ce contact';
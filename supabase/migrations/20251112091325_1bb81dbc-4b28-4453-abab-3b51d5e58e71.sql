-- Add filtering columns to calendar_rules
ALTER TABLE calendar_rules 
ADD COLUMN IF NOT EXISTS sender_patterns_exclude text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS keywords_exclude text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS auto_create_events boolean DEFAULT false;

-- Add comment for clarity
COMMENT ON COLUMN calendar_rules.sender_patterns_exclude IS 'Email sender patterns to exclude from calendar events (e.g., netflix.com, notifications@google.com)';
COMMENT ON COLUMN calendar_rules.keywords_exclude IS 'Keywords in subject/body to exclude from calendar events (e.g., promotion, newsletter)';
COMMENT ON COLUMN calendar_rules.auto_create_events IS 'Whether to automatically create calendar events without user confirmation';
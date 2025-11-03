-- Add columns to email_history for detailed AI analysis and suggestions
ALTER TABLE email_history
ADD COLUMN IF NOT EXISTS body_summary text,
ADD COLUMN IF NOT EXISTS ai_reasoning text,
ADD COLUMN IF NOT EXISTS suggested_new_label text,
ADD COLUMN IF NOT EXISTS rule_reinforcement_suggestion text,
ADD COLUMN IF NOT EXISTS actions_taken jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS label_validation_status text DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS rule_reinforcement_status text DEFAULT 'pending';

-- Create table for email summaries schedule
CREATE TABLE IF NOT EXISTS email_summary_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  schedule_times text[] NOT NULL DEFAULT '{}',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE email_summary_schedules ENABLE ROW LEVEL SECURITY;

-- RLS policies for email_summary_schedules
CREATE POLICY "Users can manage their own schedules"
ON email_summary_schedules
FOR ALL
USING (auth.uid() = user_id);

-- Create table for manual summary requests
CREATE TABLE IF NOT EXISTS email_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  summary_content text,
  sent_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE email_summaries ENABLE ROW LEVEL SECURITY;

-- RLS policies for email_summaries
CREATE POLICY "Users can view their own summaries"
ON email_summaries
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own summaries"
ON email_summaries
FOR INSERT
WITH CHECK (auth.uid() = user_id);
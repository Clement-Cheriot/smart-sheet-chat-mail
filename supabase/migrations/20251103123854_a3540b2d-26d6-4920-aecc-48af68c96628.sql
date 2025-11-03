-- Create sync state table to prevent reimporting old emails after clearing history
CREATE TABLE IF NOT EXISTS public.gmail_sync_state (
  user_id uuid PRIMARY KEY,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.gmail_sync_state ENABLE ROW LEVEL SECURITY;

-- Recreate policies safely
DROP POLICY IF EXISTS "Users can view their own gmail sync state" ON public.gmail_sync_state;
DROP POLICY IF EXISTS "Users can insert their own gmail sync state" ON public.gmail_sync_state;
DROP POLICY IF EXISTS "Users can update their own gmail sync state" ON public.gmail_sync_state;

CREATE POLICY "Users can view their own gmail sync state"
ON public.gmail_sync_state
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own gmail sync state"
ON public.gmail_sync_state
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own gmail sync state"
ON public.gmail_sync_state
FOR UPDATE
USING (auth.uid() = user_id);

-- Trigger to maintain updated_at
DROP TRIGGER IF EXISTS update_gmail_sync_state_updated_at ON public.gmail_sync_state;
CREATE TRIGGER update_gmail_sync_state_updated_at
BEFORE UPDATE ON public.gmail_sync_state
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();
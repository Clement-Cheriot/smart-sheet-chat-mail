-- Create google_contacts table for syncing Google Contacts
CREATE TABLE IF NOT EXISTS public.google_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  contact_id TEXT NOT NULL,
  email TEXT NOT NULL,
  name TEXT,
  phone TEXT,
  labels TEXT[],
  notes TEXT,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, contact_id)
);

-- Enable RLS
ALTER TABLE public.google_contacts ENABLE ROW LEVEL SECURITY;

-- Policy: users can only see their own contacts
CREATE POLICY "Users can view their own contacts"
  ON public.google_contacts
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: users can insert their own contacts
CREATE POLICY "Users can insert their own contacts"
  ON public.google_contacts
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: users can update their own contacts
CREATE POLICY "Users can update their own contacts"
  ON public.google_contacts
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Policy: users can delete their own contacts
CREATE POLICY "Users can delete their own contacts"
  ON public.google_contacts
  FOR DELETE
  USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_google_contacts_updated_at
  BEFORE UPDATE ON public.google_contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Create index for faster queries
CREATE INDEX idx_google_contacts_user_id ON public.google_contacts(user_id);
CREATE INDEX idx_google_contacts_email ON public.google_contacts(email);
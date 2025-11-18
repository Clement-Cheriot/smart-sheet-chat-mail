-- Create contact_groups table to manage Google Contact groups
CREATE TABLE IF NOT EXISTS public.contact_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  google_group_id TEXT UNIQUE,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.contact_groups ENABLE ROW LEVEL SECURITY;

-- RLS policies for contact_groups
CREATE POLICY "Users can manage their own contact groups"
  ON public.contact_groups
  FOR ALL
  USING (auth.uid() = user_id);

-- Add contact_group_id and google_contact_id fields to email_rules
ALTER TABLE public.email_rules 
ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES public.contact_rules(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS contact_group_id UUID REFERENCES public.contact_groups(id) ON DELETE SET NULL;

-- Add contact_group_id and google_contact_id fields to draft_rules
ALTER TABLE public.draft_rules
ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES public.contact_rules(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS contact_group_id UUID REFERENCES public.contact_groups(id) ON DELETE SET NULL;

-- Create trigger for contact_groups updated_at
CREATE TRIGGER update_contact_groups_updated_at
  BEFORE UPDATE ON public.contact_groups
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();
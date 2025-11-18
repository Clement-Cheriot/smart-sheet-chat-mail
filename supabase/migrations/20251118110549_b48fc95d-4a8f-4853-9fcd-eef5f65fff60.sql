-- Remove old contact_id columns and replace with google_contact_id
ALTER TABLE public.email_rules 
DROP COLUMN IF EXISTS contact_id;

ALTER TABLE public.email_rules
ADD COLUMN IF NOT EXISTS google_contact_id UUID REFERENCES public.google_contacts(id) ON DELETE SET NULL;

ALTER TABLE public.draft_rules
DROP COLUMN IF EXISTS contact_id;

ALTER TABLE public.draft_rules
ADD COLUMN IF NOT EXISTS google_contact_id UUID REFERENCES public.google_contacts(id) ON DELETE SET NULL;
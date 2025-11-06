-- Ajouter colonne description aux règles pour l'enrichissement automatique
ALTER TABLE public.email_rules 
ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';

-- Créer un index pour améliorer les performances de récupération des règles
CREATE INDEX IF NOT EXISTS idx_email_rules_user_active 
ON public.email_rules(user_id, is_active) 
WHERE is_active = true;

COMMENT ON COLUMN public.email_rules.description IS 'Description enrichie automatiquement avec les feedbacks utilisateur pour l''apprentissage de l''IA';
-- Modifier email_history pour supporter plusieurs labels
ALTER TABLE email_history 
ALTER COLUMN applied_label TYPE text[] USING CASE 
  WHEN applied_label IS NULL THEN NULL 
  ELSE ARRAY[applied_label]::text[] 
END;

-- Rendre label_to_apply nullable dans email_rules pour les règles de brouillon/réponse auto
ALTER TABLE email_rules 
ALTER COLUMN label_to_apply DROP NOT NULL;

-- Ajouter une colonne pour la notification urgente
ALTER TABLE email_rules 
ADD COLUMN notify_urgent boolean DEFAULT false;
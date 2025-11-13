-- Insert default signature rules for all users
INSERT INTO signature_rules (user_id, name, content, conditions)
SELECT 
  id,
  'Signature Professionnelle',
  E'Cordialement,\n[Votre Nom]\n[Votre Fonction]',
  '{"default": true}'::jsonb
FROM auth.users
ON CONFLICT DO NOTHING;

INSERT INTO signature_rules (user_id, name, content, conditions)
SELECT 
  id,
  'Signature Informelle',
  E'Bien à toi,\n[Votre Nom]',
  '{"casual": true}'::jsonb
FROM auth.users
ON CONFLICT DO NOTHING;

-- Insert default draft rules for all users
INSERT INTO draft_rules (user_id, name, template, signature_id, conditions)
SELECT 
  id,
  'Réponse Standard',
  'Bonjour,\n\nMerci pour votre message. Je reviens vers vous concernant {{subject}}.\n\n',
  NULL,
  '{"type": "standard"}'::jsonb
FROM auth.users
ON CONFLICT DO NOTHING;

INSERT INTO draft_rules (user_id, name, template, signature_id, conditions)
SELECT 
  id,
  'Réponse Urgente',
  'Bonjour,\n\nJ''ai bien reçu votre message urgent. Je traite votre demande en priorité.\n\n',
  NULL,
  '{"type": "urgent"}'::jsonb
FROM auth.users
ON CONFLICT DO NOTHING;

-- Insert default auto-response rules for all users
INSERT INTO auto_response_rules (user_id, name, template, delay_minutes, conditions)
SELECT 
  id,
  'Accusé de Réception',
  'Bonjour,\n\nMerci pour votre message. Je vous confirme sa bonne réception et vous répondrai dans les plus brefs délais.\n\nCordialement',
  0,
  '{"type": "acknowledgment"}'::jsonb
FROM auth.users
ON CONFLICT DO NOTHING;

-- Insert default calendar rules for all users
INSERT INTO calendar_rules (user_id, name, action_type, auto_create_events, keywords_exclude, sender_patterns_exclude, conditions)
SELECT 
  id,
  'Filtrage Calendrier Standard',
  'create_event',
  false,
  ARRAY['netflix', 'promotion', 'offre', 'promo', 'deal', 'sale', 'discount', 'marketing']::text[],
  ARRAY['%@calendar.google.com%', '%noreply%', '%no-reply%']::text[],
  '{"default": true}'::jsonb
FROM auth.users
ON CONFLICT DO NOTHING;

-- Insert default contact rules for all users (without preferred_tone to avoid constraint issues)
INSERT INTO contact_rules (user_id, name, email, notes)
SELECT 
  u.id,
  'Contact Exemple',
  'exemple@domain.com',
  'Ceci est un exemple de contact. Modifiez ou supprimez cette entrée.'
FROM auth.users u
ON CONFLICT DO NOTHING;
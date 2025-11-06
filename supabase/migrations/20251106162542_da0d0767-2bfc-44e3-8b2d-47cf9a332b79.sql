-- Créer les 5 nouvelles tables pour l'architecture d'analyse d'emails

-- Table signature_rules : Gestion des signatures email
CREATE TABLE signature_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  conditions JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table draft_rules : Règles de génération de brouillons
CREATE TABLE draft_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  template TEXT NOT NULL,
  signature_id UUID REFERENCES signature_rules(id) ON DELETE SET NULL,
  conditions JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table auto_response_rules : Règles de réponses automatiques
CREATE TABLE auto_response_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  template TEXT NOT NULL,
  signature_id UUID REFERENCES signature_rules(id) ON DELETE SET NULL,
  conditions JSONB,
  delay_minutes INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table calendar_rules : Règles d'actions calendrier
CREATE TABLE calendar_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  action_type TEXT CHECK (action_type IN ('create_event', 'remind', 'decline')),
  conditions JSONB,
  exclude_noreply BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table contact_rules : Règles par contact
CREATE TABLE contact_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  preferred_signature_id UUID REFERENCES signature_rules(id) ON DELETE SET NULL,
  preferred_tone TEXT CHECK (preferred_tone IN ('formel', 'casual')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, email)
);

-- Enable RLS sur toutes les tables
ALTER TABLE signature_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE draft_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE auto_response_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_rules ENABLE ROW LEVEL SECURITY;

-- Policies pour signature_rules
CREATE POLICY "Users can manage their own signatures"
ON signature_rules FOR ALL
USING (auth.uid() = user_id);

-- Policies pour draft_rules
CREATE POLICY "Users can manage their own draft rules"
ON draft_rules FOR ALL
USING (auth.uid() = user_id);

-- Policies pour auto_response_rules
CREATE POLICY "Users can manage their own auto response rules"
ON auto_response_rules FOR ALL
USING (auth.uid() = user_id);

-- Policies pour calendar_rules
CREATE POLICY "Users can manage their own calendar rules"
ON calendar_rules FOR ALL
USING (auth.uid() = user_id);

-- Policies pour contact_rules
CREATE POLICY "Users can manage their own contact rules"
ON contact_rules FOR ALL
USING (auth.uid() = user_id);

-- Trigger pour updated_at sur toutes les tables
CREATE TRIGGER update_signature_rules_updated_at
BEFORE UPDATE ON signature_rules
FOR EACH ROW
EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER update_draft_rules_updated_at
BEFORE UPDATE ON draft_rules
FOR EACH ROW
EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER update_auto_response_rules_updated_at
BEFORE UPDATE ON auto_response_rules
FOR EACH ROW
EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER update_calendar_rules_updated_at
BEFORE UPDATE ON calendar_rules
FOR EACH ROW
EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER update_contact_rules_updated_at
BEFORE UPDATE ON contact_rules
FOR EACH ROW
EXECUTE FUNCTION handle_updated_at();

-- Ajouter les nouveaux champs à email_history pour la nouvelle structure JSON
ALTER TABLE email_history 
ADD COLUMN IF NOT EXISTS confidence INTEGER,
ADD COLUMN IF NOT EXISTS draft_content TEXT,
ADD COLUMN IF NOT EXISTS auto_response_content TEXT,
ADD COLUMN IF NOT EXISTS rule_reinforcement JSONB,
ADD COLUMN IF NOT EXISTS calendar_details JSONB,
ADD COLUMN IF NOT EXISTS needs_response BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS needs_calendar_action BOOLEAN DEFAULT false;
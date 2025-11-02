-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- Create profiles table for user information
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create user_roles table (separate from profiles for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, role)
);

-- Create user_api_configs table to store API keys per user
CREATE TABLE public.user_api_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  whatsapp_api_token TEXT,
  whatsapp_phone_number_id TEXT,
  gmail_credentials JSONB,
  google_sheets_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create email_rules table for user-specific rules
CREATE TABLE public.email_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_pattern TEXT,
  keywords TEXT[],
  label_to_apply TEXT NOT NULL,
  priority TEXT CHECK (priority IN ('low', 'medium', 'high')),
  auto_action TEXT,
  response_template TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  rule_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create email_history table to track processed emails
CREATE TABLE public.email_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gmail_message_id TEXT NOT NULL,
  sender TEXT NOT NULL,
  subject TEXT,
  received_at TIMESTAMPTZ NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applied_label TEXT,
  priority_score INTEGER,
  ai_analysis JSONB,
  draft_created BOOLEAN DEFAULT false,
  draft_id TEXT,
  whatsapp_notified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create activity_logs table for admin debugging
CREATE TABLE public.activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  action_details JSONB,
  status TEXT NOT NULL CHECK (status IN ('success', 'error', 'pending')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_api_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check user roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Create function to handle new user registration
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Create profile
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name');
  
  -- Assign default 'user' role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');
  
  RETURN NEW;
END;
$$;

-- Create triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_user_api_configs_updated_at
  BEFORE UPDATE ON public.user_api_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_email_rules_updated_at
  BEFORE UPDATE ON public.email_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Create trigger for new user registration
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- RLS Policies for profiles
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for user_roles
CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage all roles"
  ON public.user_roles FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for user_api_configs
CREATE POLICY "Users can view their own API configs"
  ON public.user_api_configs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own API configs"
  ON public.user_api_configs FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own API configs"
  ON public.user_api_configs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all API configs"
  ON public.user_api_configs FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for email_rules
CREATE POLICY "Users can view their own rules"
  ON public.email_rules FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own rules"
  ON public.email_rules FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all rules"
  ON public.email_rules FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for email_history
CREATE POLICY "Users can view their own email history"
  ON public.email_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own email history"
  ON public.email_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all email history"
  ON public.email_history FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for activity_logs
CREATE POLICY "Users can view their own activity logs"
  ON public.activity_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all activity logs"
  ON public.activity_logs FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "System can insert activity logs"
  ON public.activity_logs FOR INSERT
  WITH CHECK (true);

-- Create indexes for better performance
CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX idx_email_rules_user_id ON public.email_rules(user_id);
CREATE INDEX idx_email_rules_active ON public.email_rules(user_id, is_active);
CREATE INDEX idx_email_history_user_id ON public.email_history(user_id);
CREATE INDEX idx_email_history_processed_at ON public.email_history(user_id, processed_at DESC);
CREATE INDEX idx_activity_logs_user_id ON public.activity_logs(user_id);
CREATE INDEX idx_activity_logs_created_at ON public.activity_logs(created_at DESC);
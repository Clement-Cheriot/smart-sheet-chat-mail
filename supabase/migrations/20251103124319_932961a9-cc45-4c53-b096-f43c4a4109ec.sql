-- Allow users to UPDATE and DELETE their own email_history records
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'email_history' AND policyname = 'Users can update their own email history'
  ) THEN
    CREATE POLICY "Users can update their own email history"
    ON public.email_history
    FOR UPDATE
    USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'email_history' AND policyname = 'Users can delete their own email history'
  ) THEN
    CREATE POLICY "Users can delete their own email history"
    ON public.email_history
    FOR DELETE
    USING (auth.uid() = user_id);
  END IF;
END $$;
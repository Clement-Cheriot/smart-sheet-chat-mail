-- Delete duplicates per user_id, keep one arbitrary row (highest ctid)
DELETE FROM public.email_summary_schedules s
USING (
  SELECT ctid
  FROM (
    SELECT ctid,
           row_number() OVER (PARTITION BY user_id ORDER BY ctid DESC) AS rn
    FROM public.email_summary_schedules
  ) x
  WHERE x.rn > 1
) d
WHERE s.ctid = d.ctid;

-- Add unique constraint to prevent future duplicates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'email_summary_schedules_user_id_key'
  ) THEN
    ALTER TABLE public.email_summary_schedules
    ADD CONSTRAINT email_summary_schedules_user_id_key UNIQUE (user_id);
  END IF;
END $$;
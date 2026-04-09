CREATE TABLE public.mbr_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  cliente text NOT NULL,
  periodo text NOT NULL,
  csm_nombre text NOT NULL,
  csm_email text,
  csm_telefono text,
  sheets_url text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'en_proceso',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mbr_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view all jobs"
  ON public.mbr_jobs FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert own jobs"
  ON public.mbr_jobs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_mbr_jobs_updated_at
  BEFORE UPDATE ON public.mbr_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.mbr_jobs;
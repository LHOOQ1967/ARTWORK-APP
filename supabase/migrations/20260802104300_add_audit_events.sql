CREATE TABLE public.audit_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('success', 'failure')),
  subject_type text,
  subject_id uuid,
  error_message text,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  CONSTRAINT audit_events_pkey PRIMARY KEY (id)
);

ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.audit_events FROM anon, authenticated;
GRANT SELECT ON public.audit_events TO authenticated;
GRANT ALL ON public.audit_events TO service_role;

CREATE INDEX audit_events_created_at_idx ON public.audit_events (created_at DESC);
CREATE INDEX audit_events_actor_id_idx ON public.audit_events (actor_id);
CREATE INDEX audit_events_action_created_at_idx ON public.audit_events (action, created_at DESC);

CREATE POLICY audit_events_select_administrators ON public.audit_events
  FOR SELECT
  TO authenticated
  USING (security.is_admin());

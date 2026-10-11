CREATE TABLE public.client_insurance_policies (
  client_id uuid PRIMARY KEY REFERENCES public.contacts(id) ON DELETE CASCADE,
  annual_rate_percent numeric(8, 5)
    CHECK (annual_rate_percent IS NULL OR annual_rate_percent BETWEEN 0 AND 100),
  policy_start_date date,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.client_insurance_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_insurance_policies FORCE ROW LEVEL SECURITY;

CREATE TRIGGER set_client_insurance_policies_updated_at
  BEFORE UPDATE ON public.client_insurance_policies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT ALL ON public.client_insurance_policies TO authenticated;
GRANT ALL ON public.client_insurance_policies TO service_role;

CREATE POLICY client_insurance_policies_editor_access
  ON public.client_insurance_policies
  FOR ALL
  TO authenticated
  USING (
    security.is_admin_or_editor()
    AND EXISTS (
      SELECT 1
      FROM public.contacts
      WHERE contacts.id = client_insurance_policies.client_id
        AND contacts.is_client
    )
  )
  WITH CHECK (
    security.is_admin_or_editor()
    AND EXISTS (
      SELECT 1
      FROM public.contacts
      WHERE contacts.id = client_insurance_policies.client_id
        AND contacts.is_client
    )
  );

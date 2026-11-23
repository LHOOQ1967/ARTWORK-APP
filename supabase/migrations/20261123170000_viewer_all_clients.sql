CREATE TABLE public.viewer_all_clients (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE
);

ALTER TABLE public.viewer_all_clients ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.viewer_all_clients FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.viewer_all_clients TO authenticated;
CREATE POLICY viewer_all_clients_select ON public.viewer_all_clients
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR security.is_admin());

CREATE OR REPLACE FUNCTION public.user_has_any_access()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('Administrator', 'Editor'))
    OR EXISTS (SELECT 1 FROM public.contact_users
      WHERE user_id = auth.uid() AND invited)
    OR EXISTS (SELECT 1 FROM public.viewer_all_clients v
      JOIN public.profiles p ON p.id = v.user_id
      WHERE v.user_id = auth.uid() AND p.role = 'Viewer');
$$;

CREATE FUNCTION public.set_viewer_client_access(p_user_id uuid, p_all_clients boolean, p_contact_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT security.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_all_clients IS NULL OR (p_all_clients AND p_contact_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Invalid client access selection';
  END IF;
  PERFORM pg_advisory_xact_lock(20261123, 1);
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id AND role = 'Viewer') THEN
    RAISE EXCEPTION 'The selected user is not a Viewer';
  END IF;
  IF p_contact_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.contacts WHERE id = p_contact_id) THEN
    RAISE EXCEPTION 'The selected contact does not exist';
  END IF;

  DELETE FROM public.viewer_all_clients WHERE user_id = p_user_id;
  DELETE FROM public.contact_users WHERE user_id = p_user_id;
  IF p_all_clients THEN
    INSERT INTO public.viewer_all_clients (user_id) VALUES (p_user_id);
    INSERT INTO public.contact_users (user_id, contact_id, invited, granted_by)
    SELECT p_user_id, id, true, auth.uid() FROM public.contacts WHERE is_client;
  ELSIF p_contact_id IS NOT NULL THEN
    INSERT INTO public.contact_users (user_id, contact_id, invited, granted_by)
    VALUES (p_user_id, p_contact_id, true, auth.uid());
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.set_viewer_client_access(uuid, boolean, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_viewer_client_access(uuid, boolean, uuid) TO authenticated;

CREATE FUNCTION public.sync_all_viewer_client_access()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(20261123, 1);
  IF NEW.is_client THEN
    INSERT INTO public.contact_users (user_id, contact_id, invited)
    SELECT user_id, NEW.id, true FROM public.viewer_all_clients
    ON CONFLICT (contact_id, user_id) DO UPDATE SET invited = true;
  ELSIF TG_OP = 'UPDATE' AND OLD.is_client THEN
    DELETE FROM public.contact_users
    WHERE contact_id = NEW.id
      AND user_id IN (SELECT user_id FROM public.viewer_all_clients);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_all_viewer_client_access() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER sync_all_viewer_client_access
  AFTER INSERT OR UPDATE OF is_client ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.sync_all_viewer_client_access();

CREATE FUNCTION public.clear_all_viewer_access_on_role_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD.role = 'Viewer' AND NEW.role IS DISTINCT FROM 'Viewer' THEN
    PERFORM pg_advisory_xact_lock(20261123, 1);
    IF EXISTS (SELECT 1 FROM public.viewer_all_clients WHERE user_id = NEW.id) THEN
      DELETE FROM public.viewer_all_clients WHERE user_id = NEW.id;
      DELETE FROM public.contact_users WHERE user_id = NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.clear_all_viewer_access_on_role_change() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER clear_all_viewer_access_on_role_change
  AFTER UPDATE OF role ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.clear_all_viewer_access_on_role_change();

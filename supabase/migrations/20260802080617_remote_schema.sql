-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

DROP EXTENSION pg_net;

DROP EXTENSION pg_graphql;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, USAGE ON SEQUENCES TO anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, USAGE ON SEQUENCES TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, USAGE ON SEQUENCES TO service_role;

CREATE SEQUENCE public.artworks_change_log_id_seq;

CREATE FUNCTION public.current_profile_role()
  RETURNS text
  LANGUAGE sql
  STABLE
  SET search_path TO 'public'
  AS $function$
  select security.current_profile_role()
$function$;

REVOKE ALL ON FUNCTION public.current_profile_role() FROM PUBLIC;

GRANT ALL ON FUNCTION public.current_profile_role() TO authenticated;

GRANT ALL ON FUNCTION public.current_profile_role() TO service_role;

CREATE FUNCTION public.handle_new_user()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'Viewer');
  return new;
end;
$function$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;

GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;

CREATE FUNCTION public.log_artworks_update_changes()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  old_clean jsonb;
  new_clean jsonb;
  diff jsonb := '{}'::jsonb;
  changed_cols text[] := '{}'::text[];
  k text;
  oldv jsonb;
  newv jsonb;
  v_actor_text text;
  v_actor uuid;
begin
  begin
    old_clean := to_jsonb(OLD) - array['updated_at', 'created_at'];
    new_clean := to_jsonb(NEW) - array['updated_at', 'created_at'];

    v_actor_text := nullif(current_setting('request.jwt.claim.sub', true), '');

    if v_actor_text is null then
      begin
        v_actor_text := nullif((current_setting('request.jwt.claims', true)::jsonb ->> 'sub'), '');
      exception
        when others then
          v_actor_text := null;
      end;
    end if;

    if v_actor_text is not null then
      begin
        v_actor := v_actor_text::uuid;
      exception
        when others then
          v_actor := null;
      end;
    else
      v_actor := null;
    end if;

    for k in
      select key
      from jsonb_object_keys(coalesce(new_clean, '{}'::jsonb)) as t(key)
      union
      select key
      from jsonb_object_keys(coalesce(old_clean, '{}'::jsonb)) as t(key)
    loop
      oldv := old_clean -> k;
      newv := new_clean -> k;

      if oldv is distinct from newv then
        changed_cols := array_append(changed_cols, k);

        diff := diff || jsonb_build_object(
          k,
          jsonb_build_object(
            'old', oldv,
            'new', newv
          )
        );
      end if;
    end loop;

    if array_length(changed_cols, 1) is not null then
      insert into public.artworks_change_log (
        artwork_id,
        changed_at,
        changed_by,
        operation,
        changed_fields,
        diff
      )
      values (
        NEW.id,
        now(),
        v_actor,
        'UPDATE',
        changed_cols,
        diff
      );
    end if;

  exception
    when others then
      raise notice 'log_artworks_update_changes failed for artwork %: [%] %', NEW.id, SQLSTATE, SQLERRM;
  end;

  return NEW;
end;
$function$;

REVOKE ALL ON FUNCTION public.log_artworks_update_changes() FROM PUBLIC;

GRANT ALL ON FUNCTION public.log_artworks_update_changes() TO service_role;

CREATE FUNCTION public.rls_auto_enable()
  RETURNS event_trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog'
  AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC;

GRANT ALL ON FUNCTION public.rls_auto_enable() TO service_role;

CREATE FUNCTION public.set_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC;

GRANT ALL ON FUNCTION public.set_updated_at() TO service_role;

CREATE FUNCTION public.user_has_any_access()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('Administrator', 'Editor')
    )
    or
    exists (
      select 1
      from public.contact_users cu
      where cu.user_id = auth.uid()
        and cu.invited = true
    );
$function$;

GRANT ALL ON FUNCTION public.user_has_any_access() TO authenticated;

CREATE TABLE public.artists (
  id             uuid                        DEFAULT gen_random_uuid() NOT NULL,
  first_name     text,
  last_name      text                        NOT NULL,
  year_of_birth  integer,
  year_of_death  integer,
  place_of_birth text,
  place_of_death text,
  notes          text,
  created_at     timestamp without time zone DEFAULT now()
);

ALTER TABLE public.artists
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.artists
  ADD CONSTRAINT artists_pkey PRIMARY KEY (id);

GRANT ALL ON public.artists TO anon;

GRANT ALL ON public.artists TO authenticated;

GRANT ALL ON public.artists TO service_role;

CREATE TABLE public.artwork_imports (
  id              uuid                     DEFAULT gen_random_uuid() NOT NULL,
  created_at      timestamp with time zone DEFAULT now() NOT NULL,
  updated_at      timestamp with time zone DEFAULT now() NOT NULL,
  created_by      uuid,
  status          text                     DEFAULT 'pending'::text NOT NULL,
  source_type     text                     DEFAULT 'label_photo'::text NOT NULL,
  image_path      text,
  image_url       text,
  ocr_provider    text,
  ocr_text        text,
  ocr_language    text[]                   DEFAULT '{}'::text[] NOT NULL,
  parsed_data     jsonb                    DEFAULT '{}'::jsonb NOT NULL,
  confidence      jsonb                    DEFAULT '{}'::jsonb NOT NULL,
  artist_match_id uuid,
  artwork_id      uuid,
  error_message   text
);

ALTER TABLE public.artwork_imports
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.artwork_imports
  ADD CONSTRAINT artwork_imports_artist_match_id_fkey FOREIGN KEY (artist_match_id) REFERENCES public.artists(id) ON DELETE SET NULL;

ALTER TABLE public.artwork_imports
  ADD CONSTRAINT artwork_imports_pkey PRIMARY KEY (id);

ALTER TABLE public.artwork_imports
  ADD CONSTRAINT artwork_imports_source_type_check CHECK (source_type = 'label_photo'::text);

ALTER TABLE public.artwork_imports
  ADD CONSTRAINT artwork_imports_status_check
    CHECK (status = ANY (ARRAY['pending'::text, 'uploaded'::text, 'processing'::text, 'parsed'::text, 'validated'::text, 'converted'::text, 'failed'::text, 'rejected'::text]));

GRANT ALL ON public.artwork_imports TO anon;

GRANT ALL ON public.artwork_imports TO authenticated;

GRANT ALL ON public.artwork_imports TO service_role;

CREATE INDEX artwork_imports_status_idx ON public.artwork_imports (status);

CREATE INDEX artwork_imports_created_at_idx ON public.artwork_imports (created_at DESC);

CREATE INDEX artwork_imports_created_by_idx ON public.artwork_imports (created_by);

CREATE INDEX artwork_imports_artist_match_id_idx ON public.artwork_imports (artist_match_id);

CREATE INDEX artwork_imports_artwork_id_idx ON public.artwork_imports (artwork_id);

CREATE TRIGGER trg_artwork_imports_updated_at
  BEFORE UPDATE ON public.artwork_imports
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY artwork_imports_owner ON public.artwork_imports
  USING ((created_by = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((created_by = ( SELECT auth.uid() AS uid)));

CREATE TABLE public.artwork_proposals (
  id          uuid                     DEFAULT gen_random_uuid() NOT NULL,
  artwork_id  uuid                     NOT NULL,
  contact_id  uuid                     NOT NULL,
  proposed_at date                     DEFAULT CURRENT_DATE NOT NULL,
  created_at  timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.artwork_proposals
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.artwork_proposals
  FORCE ROW LEVEL SECURITY;

ALTER TABLE public.artwork_proposals
  ADD CONSTRAINT artwork_proposals_artwork_id_contact_id_key UNIQUE (artwork_id, contact_id);

ALTER TABLE public.artwork_proposals
  ADD CONSTRAINT artwork_proposals_pkey PRIMARY KEY (id);

GRANT ALL ON public.artwork_proposals TO anon;

GRANT ALL ON public.artwork_proposals TO authenticated;

GRANT ALL ON public.artwork_proposals TO service_role;

CREATE INDEX artwork_proposals_artwork_id_idx ON public.artwork_proposals (artwork_id);

CREATE INDEX artwork_proposals_contact_id_idx ON public.artwork_proposals (contact_id);

CREATE TABLE public.artwork_viewer_comments (
  id         uuid                     DEFAULT gen_random_uuid() NOT NULL,
  artwork_id uuid                     NOT NULL,
  user_id    uuid                     NOT NULL,
  comment    text                     NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_by uuid
);

ALTER TABLE public.artwork_viewer_comments
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.artwork_viewer_comments
  ADD CONSTRAINT artwork_viewer_comments_pkey PRIMARY KEY (id);

GRANT ALL ON public.artwork_viewer_comments TO authenticated;

GRANT ALL ON public.artwork_viewer_comments TO service_role;

CREATE INDEX idx_artwork_viewer_comments_artwork_id ON public.artwork_viewer_comments (artwork_id);

CREATE UNIQUE INDEX uq_artwork_viewer_comments_artwork_user ON public.artwork_viewer_comments (artwork_id, user_id);

CREATE INDEX idx_artwork_viewer_comments_user_id ON public.artwork_viewer_comments (user_id);

CREATE TRIGGER trg_artwork_viewer_comments_updated_at
  BEFORE UPDATE ON public.artwork_viewer_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.artworks (
  id                              uuid                        DEFAULT gen_random_uuid() NOT NULL,
  date_proposition                date,
  artist_id                       uuid,
  proposed_by_id                  uuid,
  title                           text,
  medium                          text,
  year_execution                  integer,
  height_cm                       numeric,
  width_cm                        numeric,
  depth_cm                        numeric,
  condition                       text,
  provenance                      text,
  exhibition_literature           text,
  certificate                     boolean,
  certificate_location            text,
  asking_price                    numeric,
  currency                        text                        DEFAULT 'CHF'::text,
  location_of_work                text,
  check_seller                    boolean,
  priority                        text,
  status                          text,
  view_date                       date,
  notes                           text,
  created_at                      timestamp without time zone DEFAULT now(),
  updated_at                      timestamp without time zone DEFAULT now(),
  auctions                        boolean                     DEFAULT false,
  sale_date                       date,
  sale_time                       time without time zone,
  auction_link                    text,
  estimate_low                    numeric,
  estimate_high                   numeric,
  guarantee                       boolean                     DEFAULT false,
  auction_contact_id              uuid,
  auction_currency                text,
  buyer_contact_id                uuid,
  cost_amount                     numeric,
  cost_currency                   text,
  insurance_value                 numeric,
  insurance_currency              text,
  destination_contact_id          uuid,
  created_by                      uuid,
  location_contact_id             uuid,
  certificate_location_contact_id uuid,
  sold_hammer                     numeric,
  sold_premium                    numeric,
  underbidder                     boolean                     DEFAULT false,
  signature                       text,
  lot                             text,
  date_acquisition                date,
  commission_blondeau             numeric,
  auction_max_hammer              numeric,
  auction_max_premium             numeric,
  acquired                        boolean                     DEFAULT false NOT NULL,
  rapport_heritier                boolean                     DEFAULT false,
  rapport_heritier_document_id    uuid,
  purchase_cost                   numeric(12,2)
);

ALTER TABLE public.artworks
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.artworks
  FORCE ROW LEVEL SECURITY;

ALTER TABLE public.artworks
  ADD CONSTRAINT artworks_artist_id_fkey FOREIGN KEY (artist_id) REFERENCES public.artists(id);

ALTER TABLE public.artworks
  ADD CONSTRAINT artworks_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE public.artworks
  ADD CONSTRAINT artworks_pkey PRIMARY KEY (id);

ALTER TABLE public.artwork_imports
  ADD CONSTRAINT artwork_imports_artwork_id_fkey FOREIGN KEY (artwork_id) REFERENCES public.artworks(id) ON DELETE SET NULL;

ALTER TABLE public.artwork_proposals
  ADD CONSTRAINT artwork_proposals_artwork_id_fkey FOREIGN KEY (artwork_id) REFERENCES public.artworks(id) ON DELETE CASCADE;

ALTER TABLE public.artwork_viewer_comments
  ADD CONSTRAINT artwork_viewer_comments_artwork_id_fkey FOREIGN KEY (artwork_id) REFERENCES public.artworks(id) ON DELETE CASCADE;

GRANT ALL ON public.artworks TO anon;

GRANT ALL ON public.artworks TO authenticated;

GRANT ALL ON public.artworks TO service_role;

CREATE INDEX idx_artworks_acquired ON public.artworks (acquired);

CREATE INDEX idx_artworks_destination_contact_id ON public.artworks (destination_contact_id);

CREATE INDEX artworks_lot_idx ON public.artworks (lot);

CREATE INDEX idx_artworks_artist_id ON public.artworks (artist_id);

CREATE INDEX idx_artworks_proposed_by_id ON public.artworks (proposed_by_id);

CREATE INDEX idx_artworks_created_by ON public.artworks (created_by);

CREATE INDEX idx_artworks_auction_contact_id ON public.artworks (auction_contact_id);

CREATE INDEX idx_artworks_buyer_contact_id ON public.artworks (buyer_contact_id);

CREATE INDEX idx_artworks_rapport_heritier_document_id_fk ON public.artworks (rapport_heritier_document_id);

CREATE INDEX idx_artworks_location_contact_id ON public.artworks (location_contact_id);

CREATE INDEX idx_artworks_certificate_location_contact_id_fk ON public.artworks (certificate_location_contact_id);

CREATE TRIGGER trg_artworks_update_changes
  AFTER UPDATE ON public.artworks
  FOR EACH ROW
  EXECUTE FUNCTION public.log_artworks_update_changes();

CREATE TABLE public.artworks_change_log (
  id             bigint                   DEFAULT nextval('public.artworks_change_log_id_seq'::regclass) NOT NULL,
  artwork_id     uuid,
  changed_at     timestamp with time zone DEFAULT now() NOT NULL,
  changed_by     uuid,
  operation      text                     NOT NULL,
  changed_fields text[]                   DEFAULT '{}'::text[] NOT NULL,
  diff           jsonb                    DEFAULT '{}'::jsonb NOT NULL
);

ALTER SEQUENCE public.artworks_change_log_id_seq OWNED BY public.artworks_change_log.id;

GRANT ALL ON SEQUENCE public.artworks_change_log_id_seq TO anon;

GRANT ALL ON SEQUENCE public.artworks_change_log_id_seq TO authenticated;

GRANT ALL ON SEQUENCE public.artworks_change_log_id_seq TO service_role;

ALTER TABLE public.artworks_change_log
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.artworks_change_log
  ADD CONSTRAINT artworks_change_log_operation_check
    CHECK (operation = ANY (ARRAY['UPDATE'::text, 'INSERT'::text, 'DELETE'::text, 'DOCUMENT_INSERT'::text, 'DOCUMENT_UPDATE'::text, 'DOCUMENT_DELETE'::text]));

ALTER TABLE public.artworks_change_log
  ADD CONSTRAINT artworks_change_log_pkey PRIMARY KEY (id);

GRANT ALL ON public.artworks_change_log TO anon;

GRANT ALL ON public.artworks_change_log TO authenticated;

GRANT ALL ON public.artworks_change_log TO service_role;

CREATE INDEX idx_artworks_change_log_changed_at ON public.artworks_change_log (changed_at DESC);

CREATE INDEX idx_artworks_change_log_artwork_id ON public.artworks_change_log (artwork_id);

CREATE TABLE public.contact_invitations (
  id         uuid                     DEFAULT gen_random_uuid() NOT NULL,
  contact_id uuid                     NOT NULL,
  email      text                     NOT NULL,
  role       text                     DEFAULT 'viewer'::text,
  created_at timestamp with time zone DEFAULT now(),
  accepted   boolean                  DEFAULT false
);

ALTER TABLE public.contact_invitations
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.contact_invitations
  ADD CONSTRAINT contact_invitations_pkey PRIMARY KEY (id);

GRANT ALL ON public.contact_invitations TO anon;

GRANT ALL ON public.contact_invitations TO authenticated;

GRANT ALL ON public.contact_invitations TO service_role;

CREATE INDEX idx_contact_invitations_contact_id ON public.contact_invitations (contact_id);

CREATE TABLE public.contact_users (
  id         uuid                     DEFAULT gen_random_uuid() NOT NULL,
  contact_id uuid                     NOT NULL,
  user_id    uuid                     NOT NULL,
  invited    boolean                  DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  granted_by uuid
);

ALTER TABLE public.contact_users
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.contact_users
  ADD CONSTRAINT contact_users_contact_id_user_id_key UNIQUE (contact_id, user_id);

ALTER TABLE public.contact_users
  ADD CONSTRAINT contact_users_pkey PRIMARY KEY (id);

GRANT ALL ON public.contact_users TO anon;

GRANT ALL ON public.contact_users TO authenticated;

GRANT ALL ON public.contact_users TO service_role;

CREATE INDEX idx_contact_users_user_id ON public.contact_users (user_id);

CREATE INDEX idx_contact_users_contact_invited ON public.contact_users (contact_id, invited);

CREATE INDEX idx_contact_users_contact_id ON public.contact_users (contact_id);

CREATE INDEX idx_contact_users_user_invited ON public.contact_users (user_id, invited);

CREATE INDEX idx_contact_users_granted_by ON public.contact_users (granted_by);

CREATE TABLE public.contacts (
  id           uuid                        DEFAULT gen_random_uuid() NOT NULL,
  company_name text,
  first_name   text,
  city         text,
  telephone    text,
  email        text,
  role         text,
  notes        text,
  created_at   timestamp without time zone DEFAULT now(),
  last_name    text,
  invited      boolean                     DEFAULT false NOT NULL,
  invited_at   timestamp with time zone,
  user_id      uuid
);

ALTER TABLE public.contacts
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.contacts
  FORCE ROW LEVEL SECURITY;

ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_pkey PRIMARY KEY (id);

ALTER TABLE public.artwork_proposals
  ADD CONSTRAINT artwork_proposals_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;

ALTER TABLE public.artworks
  ADD CONSTRAINT artworks_auction_contact_id_fkey FOREIGN KEY (auction_contact_id) REFERENCES public.contacts(id);

ALTER TABLE public.artworks
  ADD CONSTRAINT artworks_buyer_contact_id_fkey FOREIGN KEY (buyer_contact_id) REFERENCES public.contacts(id);

ALTER TABLE public.artworks
  ADD CONSTRAINT artworks_certificate_location_contact_id_fkey FOREIGN KEY (certificate_location_contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;

ALTER TABLE public.artworks
  ADD CONSTRAINT artworks_destination_contact_id_fkey FOREIGN KEY (destination_contact_id) REFERENCES public.contacts(id);

ALTER TABLE public.artworks
  ADD CONSTRAINT artworks_location_contact_fkey FOREIGN KEY (location_contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;

ALTER TABLE public.artworks
  ADD CONSTRAINT artworks_proposed_by_id_fkey FOREIGN KEY (proposed_by_id) REFERENCES public.contacts(id);

ALTER TABLE public.contact_invitations
  ADD CONSTRAINT contact_invitations_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;

ALTER TABLE public.contact_users
  ADD CONSTRAINT contact_users_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;

GRANT ALL ON public.contacts TO anon;

GRANT ALL ON public.contacts TO authenticated;

GRANT ALL ON public.contacts TO service_role;

CREATE TABLE public.documents (
  id                     uuid                     DEFAULT gen_random_uuid() NOT NULL,
  artwork_id             uuid,
  document_type          text                     NOT NULL,
  label                  text,
  url                    text                     NOT NULL,
  created_at             timestamp with time zone DEFAULT now(),
  "position"             integer,
  market_section_item_id uuid
);

ALTER TABLE public.documents
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.documents
  ADD CONSTRAINT documents_artwork_id_fkey FOREIGN KEY (artwork_id) REFERENCES public.artworks(id) ON DELETE CASCADE;

ALTER TABLE public.documents
  ADD CONSTRAINT documents_pkey PRIMARY KEY (id);

ALTER TABLE public.artworks
  ADD CONSTRAINT artworks_rapport_heritier_doc_fk FOREIGN KEY (rapport_heritier_document_id) REFERENCES public.documents(id) ON DELETE SET NULL;

GRANT ALL ON public.documents TO anon;

GRANT ALL ON public.documents TO authenticated;

GRANT ALL ON public.documents TO service_role;

CREATE INDEX documents_market_section_item_id_idx ON public.documents (market_section_item_id);

CREATE INDEX idx_documents_artwork_id ON public.documents (artwork_id);

CREATE TABLE public.fx_rates_history (
  rate_date     date                     NOT NULL,
  from_currency text                     NOT NULL,
  to_currency   text                     DEFAULT 'EUR'::text NOT NULL,
  rate          numeric(18,8)            NOT NULL,
  created_at    timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.fx_rates_history
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.fx_rates_history
  ADD CONSTRAINT fx_rates_history_pkey PRIMARY KEY (rate_date, from_currency, to_currency);

GRANT ALL ON public.fx_rates_history TO anon;

GRANT ALL ON public.fx_rates_history TO authenticated;

GRANT ALL ON public.fx_rates_history TO service_role;

CREATE TABLE public.market_section_items (
  id               uuid                     DEFAULT gen_random_uuid() NOT NULL,
  section_id       uuid                     NOT NULL,
  item_type        text                     NOT NULL,
  label            text                     NOT NULL,
  url              text,
  added_at         date                     DEFAULT CURRENT_DATE NOT NULL,
  notes            text,
  "position"       integer                  DEFAULT 0 NOT NULL,
  created_at       timestamp with time zone DEFAULT now() NOT NULL,
  updated_at       timestamp with time zone DEFAULT now() NOT NULL,
  auction_house    text,
  auction_datetime timestamp with time zone
);

ALTER TABLE public.market_section_items
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.market_section_items
  ADD CONSTRAINT market_section_items_item_type_check CHECK (item_type = ANY (ARRAY['web_link'::text, 'document'::text]));

ALTER TABLE public.market_section_items
  ADD CONSTRAINT market_section_items_pkey PRIMARY KEY (id);

ALTER TABLE public.documents
  ADD CONSTRAINT documents_market_section_item_id_fkey FOREIGN KEY (market_section_item_id) REFERENCES public.market_section_items(id) ON DELETE CASCADE;

ALTER TABLE public.market_section_items
  ADD CONSTRAINT market_section_items_web_link_check CHECK (item_type = 'web_link'::text AND url IS NOT NULL OR item_type = 'document'::text);

GRANT ALL ON public.market_section_items TO anon;

GRANT ALL ON public.market_section_items TO authenticated;

GRANT ALL ON public.market_section_items TO service_role;

CREATE INDEX market_section_items_section_id_idx ON public.market_section_items (section_id);

CREATE INDEX market_section_items_added_at_idx ON public.market_section_items (added_at);

CREATE INDEX market_section_items_auction_datetime_idx ON public.market_section_items (auction_datetime);

CREATE INDEX market_section_items_item_type_idx ON public.market_section_items (item_type);

CREATE TRIGGER trg_market_section_items_updated_at
  BEFORE UPDATE ON public.market_section_items
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY market_section_items_select_authenticated ON public.market_section_items
  FOR SELECT
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) IS NOT NULL));

CREATE TABLE public.market_sections (
  id         uuid                     DEFAULT gen_random_uuid() NOT NULL,
  title      text                     NOT NULL,
  category   text                     NOT NULL,
  start_date date,
  end_date   date,
  notes      text,
  "position" integer                  DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.market_sections
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.market_sections
  ADD CONSTRAINT market_sections_category_check CHECK (category = ANY (ARRAY['Foire'::text, 'Ventes aux enchères'::text, 'Autre'::text]));

ALTER TABLE public.market_sections
  ADD CONSTRAINT market_sections_pkey PRIMARY KEY (id);

ALTER TABLE public.market_section_items
  ADD CONSTRAINT market_section_items_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.market_sections(id) ON DELETE CASCADE;

GRANT ALL ON public.market_sections TO anon;

GRANT ALL ON public.market_sections TO authenticated;

GRANT ALL ON public.market_sections TO service_role;

CREATE INDEX market_sections_start_date_idx ON public.market_sections (start_date);

CREATE INDEX market_sections_category_idx ON public.market_sections (category);

CREATE TRIGGER trg_market_sections_updated_at
  BEFORE UPDATE ON public.market_sections
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY market_sections_select_authenticated ON public.market_sections
  FOR SELECT
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) IS NOT NULL));

CREATE TABLE public.profiles (
  id               uuid                        NOT NULL,
  role             text                        DEFAULT 'Viewer'::text,
  created_at       timestamp without time zone DEFAULT now(),
  email            text                        NOT NULL,
  is_active        boolean                     DEFAULT true NOT NULL,
  last_activity_at timestamp with time zone
);

CREATE POLICY artists_insert_authenticated ON public.artists
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['Administrator'::text, 'Editor'::text]))))));

CREATE POLICY artworks_delete_admin_editor ON public.artworks
  FOR DELETE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['Administrator'::text, 'Editor'::text]))))));

CREATE POLICY artworks_insert ON public.artworks
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['Administrator'::text, 'Editor'::text]))))));

CREATE POLICY artworks_select_combined ON public.artworks
  FOR SELECT
  USING (((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT ( SELECT auth.uid() AS uid) AS uid)) AND (p.role = ANY (ARRAY['Administrator'::text, 'Editor'::text]))))) OR (EXISTS ( SELECT 1
   FROM (public.artwork_proposals ap
     JOIN public.contact_users cu ON ((cu.contact_id = ap.contact_id)))
  WHERE ((ap.artwork_id = artworks.id) AND (cu.user_id = ( SELECT ( SELECT auth.uid() AS uid) AS uid)))))));

CREATE POLICY artworks_update ON public.artworks
  FOR UPDATE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['Administrator'::text, 'Editor'::text]))))));

CREATE POLICY artworks_change_log_select_combined ON public.artworks_change_log
  FOR SELECT
  TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['Administrator'::text, 'Editor'::text]))))) OR (EXISTS ( SELECT 1
   FROM (public.artwork_proposals ap
     JOIN public.contact_users cu ON ((cu.contact_id = ap.contact_id)))
  WHERE ((ap.artwork_id = artworks_change_log.artwork_id) AND (cu.user_id = ( SELECT auth.uid() AS uid)))))));

CREATE POLICY documents_delete ON public.documents
  FOR DELETE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['Administrator'::text, 'Editor'::text]))))));

CREATE POLICY documents_insert ON public.documents
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['Administrator'::text, 'Editor'::text]))))));

CREATE POLICY documents_select_combined ON public.documents
  FOR SELECT
  TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['Administrator'::text, 'Editor'::text]))))) OR (market_section_item_id IS NOT NULL) OR (EXISTS ( SELECT 1
   FROM (public.artwork_proposals ap
     JOIN public.contact_users cu ON ((cu.contact_id = ap.contact_id)))
  WHERE ((ap.artwork_id = documents.artwork_id) AND (cu.user_id = ( SELECT auth.uid() AS uid)))))));

CREATE POLICY documents_update ON public.documents
  FOR UPDATE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['Administrator'::text, 'Editor'::text]))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['Administrator'::text, 'Editor'::text]))))));

ALTER TABLE public.profiles
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);

ALTER TABLE public.artwork_viewer_comments
  ADD CONSTRAINT artwork_viewer_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.contact_users
  ADD CONSTRAINT contact_users_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.contact_users
  ADD CONSTRAINT contact_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.profiles
  ADD CONSTRAINT role_check CHECK (role = ANY (ARRAY['Administrator'::text, 'Editor'::text, 'Viewer'::text]));

GRANT ALL ON public.profiles TO anon;

GRANT ALL ON public.profiles TO authenticated;

GRANT ALL ON public.profiles TO service_role;

CREATE UNIQUE INDEX profiles_email_unique ON public.profiles (email);

CREATE POLICY profiles_select ON public.profiles
  FOR SELECT
  TO authenticated
  USING (true);

CREATE VIEW public.artworks_last_change WITH (security_invoker=true) AS SELECT DISTINCT ON (artwork_id) artwork_id,
    changed_at AS last_changed_at,
    changed_by,
    changed_fields,
    diff
   FROM public.artworks_change_log
  ORDER BY artwork_id, changed_at DESC, id DESC;

CREATE VIEW public.artworks_full_admin WITH (security_invoker=true) AS SELECT a.id,
    a.date_proposition,
    a.artist_id,
    a.proposed_by_id,
    a.title,
    a.medium,
    a.year_execution,
    a.height_cm,
    a.width_cm,
    a.depth_cm,
    a.condition,
    a.provenance,
    a.exhibition_literature,
    a.certificate,
    a.certificate_location,
    a.asking_price,
    a.currency,
    a.location_of_work,
    a.check_seller,
    a.priority,
    a.status,
    a.view_date,
    a.notes,
    a.created_at,
    a.updated_at,
    a.auctions,
    a.sale_date,
    a.sale_time,
    a.auction_link,
    a.estimate_low,
    a.estimate_high,
    a.guarantee,
    a.auction_contact_id,
    a.auction_currency,
    a.buyer_contact_id,
    a.cost_amount,
    a.cost_currency,
    a.insurance_value,
    a.insurance_currency,
    a.destination_contact_id,
    a.created_by,
    a.location_contact_id,
    a.certificate_location_contact_id,
    a.sold_hammer,
    a.sold_premium,
    a.underbidder,
    a.signature,
    a.lot,
    a.date_acquisition,
    a.commission_blondeau,
    a.auction_max_hammer,
    a.auction_max_premium,
    a.rapport_heritier,
    a.rapport_heritier_document_id,
        CASE
            WHEN (ar.id IS NOT NULL) THEN jsonb_build_object('id', ar.id, 'first_name', ar.first_name, 'last_name', ar.last_name, 'name', concat_ws(' '::text, ar.first_name, ar.last_name), 'place_of_birth', ar.place_of_birth, 'year_of_birth', ar.year_of_birth, 'place_of_death', ar.place_of_death, 'year_of_death', ar.year_of_death)
            ELSE NULL::jsonb
        END AS artist,
        CASE
            WHEN (proposed.id IS NOT NULL) THEN jsonb_build_object('id', proposed.id, 'company_name', proposed.company_name, 'first_name', proposed.first_name, 'last_name', proposed.last_name)
            ELSE NULL::jsonb
        END AS "proposedBy",
        CASE
            WHEN (buyer.id IS NOT NULL) THEN jsonb_build_object('id', buyer.id, 'company_name', buyer.company_name, 'first_name', buyer.first_name, 'last_name', buyer.last_name)
            ELSE NULL::jsonb
        END AS buyer,
    COALESCE(prop.proposals, '[]'::jsonb) AS proposals,
    COALESCE(doc.documents, '[]'::jsonb) AS documents,
    COALESCE(img.images, '[]'::jsonb) AS images,
    COALESCE(NULLIF(TRIM(BOTH FROM proposed.company_name), ''::text), NULLIF(TRIM(BOTH FROM concat_ws(' '::text, proposed.first_name, proposed.last_name)), ''::text), '—'::text) AS proposed_by_name,
    a.buyer_contact_id AS buyer_id,
    a.acquired,
    alc.last_changed_at,
    alc.changed_fields,
    alc.diff AS changed_diff,
        CASE
            WHEN (location_c.id IS NOT NULL) THEN jsonb_build_object('id', location_c.id, 'company_name', location_c.company_name, 'first_name', location_c.first_name, 'last_name', location_c.last_name)
            ELSE NULL::jsonb
        END AS location,
        CASE
            WHEN (cert_loc.id IS NOT NULL) THEN jsonb_build_object('id', cert_loc.id, 'company_name', cert_loc.company_name, 'first_name', cert_loc.first_name, 'last_name', cert_loc.last_name)
            ELSE NULL::jsonb
        END AS "certificateLocation",
        CASE
            WHEN (destination_c.id IS NOT NULL) THEN jsonb_build_object('id', destination_c.id, 'company_name', destination_c.company_name, 'first_name', destination_c.first_name, 'last_name', destination_c.last_name)
            ELSE NULL::jsonb
        END AS destination,
        CASE
            WHEN (auction_c.id IS NOT NULL) THEN jsonb_build_object('id', auction_c.id, 'company_name', auction_c.company_name, 'first_name', auction_c.first_name, 'last_name', auction_c.last_name)
            ELSE NULL::jsonb
        END AS "auctionContact",
        CASE
            WHEN (doc_rh.id IS NOT NULL) THEN jsonb_build_object('id', doc_rh.id, 'artwork_id', doc_rh.artwork_id, 'document_type', doc_rh.document_type, 'label', doc_rh.label, 'url', doc_rh.url, 'position', doc_rh."position", 'created_at', doc_rh.created_at)
            ELSE NULL::jsonb
        END AS rapport_heritier_document
   FROM ((((((((((((public.artworks a
     LEFT JOIN public.artworks_last_change alc ON ((alc.artwork_id = a.id)))
     LEFT JOIN public.artists ar ON ((ar.id = a.artist_id)))
     LEFT JOIN public.contacts proposed ON ((proposed.id = a.proposed_by_id)))
     LEFT JOIN public.contacts buyer ON ((buyer.id = a.buyer_contact_id)))
     LEFT JOIN public.contacts location_c ON ((location_c.id = a.location_contact_id)))
     LEFT JOIN public.contacts cert_loc ON ((cert_loc.id = a.certificate_location_contact_id)))
     LEFT JOIN public.contacts destination_c ON ((destination_c.id = a.destination_contact_id)))
     LEFT JOIN public.contacts auction_c ON ((auction_c.id = a.auction_contact_id)))
     LEFT JOIN public.documents doc_rh ON ((doc_rh.id = a.rapport_heritier_document_id)))
     LEFT JOIN LATERAL ( SELECT jsonb_agg(jsonb_build_object('id', ap.id, 'contact_id', ap.contact_id, 'proposed_at', ap.proposed_at, 'contact_label', COALESCE(NULLIF(TRIM(BOTH FROM c.company_name), ''::text), NULLIF(TRIM(BOTH FROM concat_ws(' '::text, c.first_name, c.last_name)), ''::text), '—'::text))) AS proposals
           FROM (public.artwork_proposals ap
             LEFT JOIN public.contacts c ON ((c.id = ap.contact_id)))
          WHERE (ap.artwork_id = a.id)) prop ON (true))
     LEFT JOIN LATERAL ( SELECT jsonb_agg(to_jsonb(d.*)) AS documents
           FROM public.documents d
          WHERE (d.artwork_id = a.id)) doc ON (true))
     LEFT JOIN LATERAL ( SELECT jsonb_agg(to_jsonb(d.*)) AS images
           FROM public.documents d
          WHERE ((d.artwork_id = a.id) AND (d.document_type = 'image'::text))) img ON (true));

GRANT ALL ON public.artworks_full_admin TO anon;

GRANT ALL ON public.artworks_full_admin TO authenticated;

GRANT ALL ON public.artworks_full_admin TO service_role;

GRANT SELECT ON public.artworks_last_change TO authenticated;

GRANT ALL ON public.artworks_last_change TO service_role;

CREATE VIEW public.v_inventory_bought_florac WITH (security_invoker=true) AS SELECT aw.id,
    d.image_url,
    aw.title,
    aw.year_execution,
    aw.date_acquisition,
    aw.buyer_contact_id,
    aw.insurance_currency,
    aw.insurance_value,
    ar.first_name,
    ar.last_name,
    c.company_name,
    aw.cost_amount,
    aw.cost_currency,
    aw.purchase_cost,
    aw.commission_blondeau,
    ((COALESCE(aw.cost_amount, (0)::numeric) + COALESCE(aw.purchase_cost, (0)::numeric)) + COALESCE(aw.commission_blondeau, (0)::numeric)) AS total_foreign_currency,
    fx.rate AS fx_rate_to_eur,
    round((((COALESCE(aw.cost_amount, (0)::numeric) + COALESCE(aw.purchase_cost, (0)::numeric)) + COALESCE(aw.commission_blondeau, (0)::numeric)) * COALESCE(fx.rate, (0)::numeric)), 2) AS total_eur
   FROM ((((public.artworks aw
     LEFT JOIN public.artists ar ON ((ar.id = aw.artist_id)))
     LEFT JOIN public.contacts c ON ((c.id = aw.buyer_contact_id)))
     LEFT JOIN ( SELECT DISTINCT ON (documents.artwork_id) documents.artwork_id,
            documents.url AS image_url
           FROM public.documents
          WHERE (documents.document_type = 'image'::text)
          ORDER BY documents.artwork_id, documents."position") d ON ((d.artwork_id = aw.id)))
     LEFT JOIN public.fx_rates_history fx ON (((fx.rate_date = aw.date_acquisition) AND (fx.from_currency = aw.cost_currency) AND (fx.to_currency = 'EUR'::text))))
  WHERE ((aw.status = 'Bought'::text) AND (aw.buyer_contact_id = 'abbcf211-f94e-4435-918e-775390164cb2'::uuid));

GRANT ALL ON public.v_inventory_bought_florac TO anon;

GRANT ALL ON public.v_inventory_bought_florac TO authenticated;

GRANT ALL ON public.v_inventory_bought_florac TO service_role;

CREATE VIEW public.v_market_section_items WITH (security_invoker=true) AS SELECT msi.id,
    msi.section_id,
    msi.item_type,
    msi.label,
    msi.url AS web_url,
    msi.added_at,
    msi.notes,
    msi."position",
    msi.created_at,
    msi.updated_at,
    msi.auction_house,
    msi.auction_datetime,
    d.id AS document_id,
    d.url AS document_url,
    d.document_type
   FROM (public.market_section_items msi
     LEFT JOIN LATERAL ( SELECT d1.id,
            d1.url,
            d1.document_type
           FROM public.documents d1
          WHERE (d1.market_section_item_id = msi.id)
          ORDER BY d1."position", d1.created_at
         LIMIT 1) d ON (true));

GRANT ALL ON public.v_market_section_items TO anon;

GRANT ALL ON public.v_market_section_items TO authenticated;

GRANT ALL ON public.v_market_section_items TO service_role;

CREATE VIEW public.viewer_artists WITH (security_barrier=true, security_invoker=true) AS SELECT DISTINCT ar.id,
    ar.first_name,
    ar.last_name,
    ar.year_of_birth,
    ar.year_of_death,
    ar.place_of_birth,
    ar.place_of_death,
    ar.notes,
    ar.created_at
   FROM (public.artists ar
     JOIN public.artworks a ON ((a.artist_id = ar.id)));

GRANT ALL ON public.viewer_artists TO authenticated;

GRANT ALL ON public.viewer_artists TO service_role;

CREATE VIEW public.viewer_artworks_full_secure WITH (security_invoker=true) AS SELECT id,
    date_proposition,
    artist_id,
    proposed_by_id,
    title,
    medium,
    year_execution,
    height_cm,
    width_cm,
    depth_cm,
    condition,
    provenance,
    exhibition_literature,
    certificate,
    certificate_location,
    asking_price,
    currency,
    location_of_work,
    check_seller,
    priority,
    status,
    view_date,
    notes,
    created_at,
    updated_at,
    auctions,
    sale_date,
    sale_time,
    auction_link,
    estimate_low,
    estimate_high,
    guarantee,
    auction_contact_id,
    auction_currency,
    buyer_contact_id,
    cost_amount,
    cost_currency,
    insurance_value,
    insurance_currency,
    destination_contact_id,
    created_by,
    location_contact_id,
    certificate_location_contact_id,
    sold_hammer,
    sold_premium,
    underbidder,
    signature,
    lot,
    date_acquisition,
    commission_blondeau,
    auction_max_hammer,
    auction_max_premium,
    rapport_heritier,
    rapport_heritier_document_id,
    rapport_heritier_document,
    artist,
    "proposedBy",
    buyer,
    proposals,
    documents,
    images,
    proposed_by_name,
    buyer_id,
    acquired,
    last_changed_at,
    changed_fields,
    changed_diff,
    location,
    "certificateLocation",
    destination,
    "auctionContact"
   FROM public.artworks_full_admin v
  WHERE (EXISTS ( SELECT 1
           FROM (public.artwork_proposals ap
             JOIN public.contact_users cu ON ((cu.contact_id = ap.contact_id)))
          WHERE ((ap.artwork_id = v.id) AND (cu.user_id = auth.uid()))));

GRANT ALL ON public.viewer_artworks_full_secure TO anon;

GRANT ALL ON public.viewer_artworks_full_secure TO authenticated;

GRANT ALL ON public.viewer_artworks_full_secure TO service_role;

CREATE VIEW public.viewer_documents WITH (security_barrier=true, security_invoker=true) AS SELECT d.id,
    d.artwork_id,
    d.document_type,
    d.label,
    d.url,
    d.created_at,
    d."position"
   FROM (public.documents d
     JOIN public.artworks a ON ((a.id = d.artwork_id)));

GRANT ALL ON public.viewer_documents TO authenticated;

GRANT ALL ON public.viewer_documents TO service_role;

CREATE EVENT TRIGGER ensure_rls
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  EXECUTE FUNCTION public.rls_auto_enable();

CREATE SCHEMA security AUTHORIZATION postgres;

GRANT USAGE ON SCHEMA SECURITY TO anon;

GRANT USAGE ON SCHEMA SECURITY TO authenticated;

GRANT USAGE ON SCHEMA SECURITY TO service_role;

CREATE FUNCTION security.can_view_artwork (
  p_artwork_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select coalesce(
    exists (
      select 1
      from public.artworks a
      where a.id = p_artwork_id
        and security.is_admin()
    )
    or
    exists (
      select 1
      from public.artwork_proposals ap
      where ap.artwork_id = p_artwork_id
        and security.has_contact_access(ap.contact_id)
    ),
    false
  )
$function$;

CREATE POLICY artwork_viewer_comments_insert ON public.artwork_viewer_comments
  FOR INSERT
  TO authenticated
  WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND security.can_view_artwork(artwork_id)));

CREATE POLICY artwork_viewer_comments_select ON public.artwork_viewer_comments
  FOR SELECT
  TO authenticated
  USING (security.can_view_artwork(artwork_id));

REVOKE ALL ON FUNCTION security.can_view_artwork(uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION security.can_view_artwork(uuid) TO anon;

GRANT ALL ON FUNCTION security.can_view_artwork(uuid) TO authenticated;

GRANT ALL ON FUNCTION security.can_view_artwork(uuid) TO service_role;

CREATE FUNCTION security.current_profile_role()
  RETURNS text
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select p.role
  from public.profiles p
  where p.id = (select auth.uid())
  limit 1
$function$;

REVOKE ALL ON FUNCTION security.current_profile_role() FROM PUBLIC;

GRANT ALL ON FUNCTION security.current_profile_role() TO anon;

GRANT ALL ON FUNCTION security.current_profile_role() TO authenticated;

GRANT ALL ON FUNCTION security.current_profile_role() TO service_role;

CREATE FUNCTION security.has_contact_access (
  p_contact_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select coalesce(
    security.is_admin()
    or exists (
      select 1
      from public.contact_users cu
      where cu.contact_id = p_contact_id
        and cu.user_id = (select auth.uid())
        and cu.invited = true
    ),
    false
  )
$function$;

REVOKE ALL ON FUNCTION security.has_contact_access(uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION security.has_contact_access(uuid) TO anon;

GRANT ALL ON FUNCTION security.has_contact_access(uuid) TO authenticated;

GRANT ALL ON FUNCTION security.has_contact_access(uuid) TO service_role;

CREATE FUNCTION security.is_admin_or_editor()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select coalesce(security.current_profile_role() in ('Administrator', 'Editor'), false)
$function$;

CREATE POLICY artists_select ON public.artists
  FOR SELECT
  TO authenticated
  USING ((security.is_admin_or_editor() OR (EXISTS ( SELECT 1
   FROM public.artworks a
  WHERE ((a.artist_id = artists.id) AND security.can_view_artwork(a.id))))));

CREATE POLICY artwork_proposals_delete_admin_editor ON public.artwork_proposals
  FOR DELETE
  TO authenticated
  USING (security.is_admin_or_editor());

CREATE POLICY artwork_proposals_insert_admin_editor ON public.artwork_proposals
  FOR INSERT
  TO authenticated
  WITH CHECK (security.is_admin_or_editor());

CREATE POLICY artwork_proposals_select ON public.artwork_proposals
  FOR SELECT
  USING ((security.is_admin_or_editor() OR (EXISTS ( SELECT 1
   FROM public.contact_users cu
  WHERE ((cu.user_id = ( SELECT auth.uid() AS uid)) AND (cu.contact_id = artwork_proposals.contact_id))))));

CREATE POLICY artwork_proposals_update_admin_editor ON public.artwork_proposals
  FOR UPDATE
  TO authenticated
  USING (security.is_admin_or_editor())
  WITH CHECK (security.is_admin_or_editor());

CREATE POLICY artwork_viewer_comments_delete_combined ON public.artwork_viewer_comments
  FOR DELETE
  TO authenticated
  USING ((security.is_admin_or_editor() OR (user_id = ( SELECT ( SELECT auth.uid() AS uid) AS uid))));

CREATE POLICY artwork_viewer_comments_update_combined ON public.artwork_viewer_comments
  FOR UPDATE
  TO authenticated
  USING ((security.is_admin_or_editor() OR (user_id = ( SELECT ( SELECT auth.uid() AS uid) AS uid))))
  WITH CHECK ((security.is_admin_or_editor() OR ((user_id = ( SELECT ( SELECT auth.uid() AS uid) AS uid)) AND security.can_view_artwork(artwork_id))));

CREATE POLICY contact_users_insert ON public.contact_users
  FOR INSERT
  TO authenticated
  WITH CHECK (security.is_admin_or_editor());

CREATE POLICY contact_users_select ON public.contact_users
  FOR SELECT
  USING (((user_id = ( SELECT auth.uid() AS uid)) OR security.is_admin_or_editor()));

CREATE POLICY contact_users_update ON public.contact_users
  FOR UPDATE
  TO authenticated
  USING (security.is_admin_or_editor())
  WITH CHECK (security.is_admin_or_editor());

CREATE POLICY contacts_delete_admin_editor ON public.contacts
  FOR DELETE
  TO authenticated
  USING (security.is_admin_or_editor());

CREATE POLICY contacts_insert_admin_editor ON public.contacts
  FOR INSERT
  TO authenticated
  WITH CHECK (security.is_admin_or_editor());

CREATE POLICY contacts_select_if_access_or_admin_editor ON public.contacts
  FOR SELECT
  TO authenticated
  USING ((security.is_admin_or_editor() OR security.has_contact_access(id) OR (EXISTS ( SELECT 1
   FROM public.artworks a
  WHERE ((a.proposed_by_id = contacts.id) AND security.can_view_artwork(a.id)))) OR (EXISTS ( SELECT 1
   FROM public.artworks a
  WHERE ((a.buyer_contact_id = contacts.id) AND security.can_view_artwork(a.id)))) OR (EXISTS ( SELECT 1
   FROM public.artworks a
  WHERE ((a.location_contact_id = contacts.id) AND security.can_view_artwork(a.id)))) OR (EXISTS ( SELECT 1
   FROM public.artworks a
  WHERE ((a.certificate_location_contact_id = contacts.id) AND security.can_view_artwork(a.id)))) OR (EXISTS ( SELECT 1
   FROM public.artworks a
  WHERE ((a.auction_contact_id = contacts.id) AND security.can_view_artwork(a.id))))));

CREATE POLICY contacts_update_admin_editor ON public.contacts
  FOR UPDATE
  TO authenticated
  USING (security.is_admin_or_editor())
  WITH CHECK (security.is_admin_or_editor());

CREATE POLICY "fx admin/editor write" ON public.fx_rates_history
  TO authenticated
  USING (security.is_admin_or_editor())
  WITH CHECK (security.is_admin_or_editor());

CREATE POLICY market_section_items_delete_admin_editor ON public.market_section_items
  FOR DELETE
  TO authenticated
  USING (security.is_admin_or_editor());

CREATE POLICY market_section_items_insert_admin_editor ON public.market_section_items
  FOR INSERT
  TO authenticated
  WITH CHECK (security.is_admin_or_editor());

CREATE POLICY market_section_items_update_admin_editor ON public.market_section_items
  FOR UPDATE
  TO authenticated
  USING (security.is_admin_or_editor())
  WITH CHECK (security.is_admin_or_editor());

CREATE POLICY market_sections_delete_admin_editor ON public.market_sections
  FOR DELETE
  TO authenticated
  USING (security.is_admin_or_editor());

CREATE POLICY market_sections_insert_admin_editor ON public.market_sections
  FOR INSERT
  TO authenticated
  WITH CHECK (security.is_admin_or_editor());

CREATE POLICY market_sections_update_admin_editor ON public.market_sections
  FOR UPDATE
  TO authenticated
  USING (security.is_admin_or_editor())
  WITH CHECK (security.is_admin_or_editor());

REVOKE ALL ON FUNCTION security.is_admin_or_editor() FROM PUBLIC;

GRANT ALL ON FUNCTION security.is_admin_or_editor() TO anon;

GRANT ALL ON FUNCTION security.is_admin_or_editor() TO authenticated;

GRANT ALL ON FUNCTION security.is_admin_or_editor() TO service_role;

CREATE FUNCTION security.is_admin()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select coalesce(security.current_profile_role() = 'Administrator', false)
$function$;

CREATE POLICY contact_users_delete ON public.contact_users
  FOR DELETE
  TO authenticated
  USING (security.is_admin());

CREATE POLICY profiles_delete_admin_only ON public.profiles
  FOR DELETE
  TO authenticated
  USING (security.is_admin());

CREATE POLICY profiles_insert_self_or_admin ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (((id = ( SELECT auth.uid() AS uid)) OR security.is_admin()));

CREATE POLICY profiles_update_combined ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT ( SELECT auth.uid() AS uid) AS uid)) AND (p.role = 'Administrator'::text)))) OR
    ((id = ( SELECT ( SELECT auth.uid() AS uid) AS uid)) OR security.is_admin())))
  WITH CHECK (((id = ( SELECT ( SELECT auth.uid() AS uid) AS uid)) OR security.is_admin()));

REVOKE ALL ON FUNCTION security.is_admin() FROM PUBLIC;

GRANT ALL ON FUNCTION security.is_admin() TO anon;

GRANT ALL ON FUNCTION security.is_admin() TO authenticated;

GRANT ALL ON FUNCTION security.is_admin() TO service_role;

CREATE FUNCTION security.log_documents_changes()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  v_changed_by uuid;
  v_changed_fields text[];
  v_diff jsonb;
  v_artwork_id uuid;
begin
  v_changed_by := auth.uid();

  -- ---------------------------------------------------------
  -- INSERT
  -- ---------------------------------------------------------
  if tg_op = 'INSERT' then
    v_artwork_id := new.artwork_id;

    -- Si le document n'est pas lié à une oeuvre (ex: document de marché),
    -- on ne loggue pas dans artworks_change_log
    if v_artwork_id is null then
      return new;
    end if;

    v_changed_fields := array['documents'];
    v_diff := jsonb_build_object(
      'document', jsonb_build_object(
        'id', new.id,
        'action', 'insert',
        'document_type', new.document_type,
        'label', new.label,
        'url', new.url,
        'position', new.position
      )
    );

    insert into public.artworks_change_log (
      artwork_id,
      changed_at,
      changed_by,
      operation,
      changed_fields,
      diff
    )
    values (
      v_artwork_id,
      now(),
      v_changed_by,
      'DOCUMENT_INSERT',
      v_changed_fields,
      v_diff
    );

    return new;
  end if;

  -- ---------------------------------------------------------
  -- UPDATE
  -- ---------------------------------------------------------
  if tg_op = 'UPDATE' then
    v_artwork_id := coalesce(new.artwork_id, old.artwork_id);

    -- Si le document n'est lié à aucune oeuvre, on ignore le log artwork
    if v_artwork_id is null then
      return new;
    end if;

    v_changed_fields := array[]::text[];
    v_diff := '{}'::jsonb;

    if new.document_type is distinct from old.document_type then
      v_changed_fields := array_append(v_changed_fields, 'document_type');
      v_diff := v_diff || jsonb_build_object(
        'document_type', jsonb_build_object('old', old.document_type, 'new', new.document_type)
      );
    end if;

    if new.label is distinct from old.label then
      v_changed_fields := array_append(v_changed_fields, 'label');
      v_diff := v_diff || jsonb_build_object(
        'label', jsonb_build_object('old', old.label, 'new', new.label)
      );
    end if;

    if new.url is distinct from old.url then
      v_changed_fields := array_append(v_changed_fields, 'url');
      v_diff := v_diff || jsonb_build_object(
        'url', jsonb_build_object('old', old.url, 'new', new.url)
      );
    end if;

    if new.position is distinct from old.position then
      v_changed_fields := array_append(v_changed_fields, 'position');
      v_diff := v_diff || jsonb_build_object(
        'position', jsonb_build_object('old', old.position, 'new', new.position)
      );
    end if;

    if new.artwork_id is distinct from old.artwork_id then
      v_changed_fields := array_append(v_changed_fields, 'artwork_id');
      v_diff := v_diff || jsonb_build_object(
        'artwork_id', jsonb_build_object('old', old.artwork_id, 'new', new.artwork_id)
      );
    end if;

    if array_length(v_changed_fields, 1) is not null then
      v_diff := v_diff || jsonb_build_object(
        'document_id', new.id
      );

      insert into public.artworks_change_log (
        artwork_id,
        changed_at,
        changed_by,
        operation,
        changed_fields,
        diff
      )
      values (
        v_artwork_id,
        now(),
        v_changed_by,
        'DOCUMENT_UPDATE',
        v_changed_fields,
        v_diff
      );
    end if;

    return new;
  end if;

  -- ---------------------------------------------------------
  -- DELETE
  -- ---------------------------------------------------------
  if tg_op = 'DELETE' then
    v_artwork_id := old.artwork_id;

    -- Si le document n'était pas lié à une oeuvre, on ignore le log artwork
    if v_artwork_id is null then
      return old;
    end if;

    v_changed_fields := array['documents'];
    v_diff := jsonb_build_object(
      'document', jsonb_build_object(
        'id', old.id,
        'action', 'delete',
        'document_type', old.document_type,
        'label', old.label,
        'url', old.url,
        'position', old.position
      )
    );

    insert into public.artworks_change_log (
      artwork_id,
      changed_at,
      changed_by,
      operation,
      changed_fields,
      diff
    )
    values (
      v_artwork_id,
      now(),
      v_changed_by,
      'DOCUMENT_DELETE',
      v_changed_fields,
      v_diff
    );

    return old;
  end if;

  return null;
end;
$function$;

CREATE TRIGGER trg_documents_delete_changes
  AFTER DELETE ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION security.log_documents_changes();

CREATE TRIGGER trg_documents_insert_changes
  AFTER INSERT ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION security.log_documents_changes();

CREATE TRIGGER trg_documents_update_changes
  AFTER UPDATE ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION security.log_documents_changes();

REVOKE ALL ON FUNCTION security.log_documents_changes() FROM PUBLIC;

GRANT ALL ON FUNCTION security.log_documents_changes() TO service_role;

CREATE FUNCTION security.user_has_any_access()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select coalesce(
    security.is_admin()
    or exists (
      select 1
      from public.contact_users cu
      where cu.user_id = (select auth.uid())
        and cu.invited = true
    ),
    false
  )
$function$;

REVOKE ALL ON FUNCTION security.user_has_any_access() FROM PUBLIC;

GRANT ALL ON FUNCTION security.user_has_any_access() TO anon;

GRANT ALL ON FUNCTION security.user_has_any_access() TO authenticated;

GRANT ALL ON FUNCTION security.user_has_any_access() TO service_role;

SQL




```
-- Storage buckets captured from the production project.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values
  ('artwork-images', 'artwork-images', true, 10485760, null),
  ('artwork-imports', 'artwork-imports', true, null, null)
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Authenticated upload images"
on storage.objects
for insert
to public
with check (
  bucket_id = 'artwork-images'
  and auth.role() = 'authenticated'
);

create policy artwork_imports_storage_insert
on storage.objects
for insert
to authenticated
with check (bucket_id = 'artwork-imports');

create policy artwork_imports_storage_update
on storage.objects
for update
to authenticated
using (bucket_id = 'artwork-imports')
with check (bucket_id = 'artwork-imports');

create policy "public read by path"
on storage.objects
for select
to anon
using (
  bucket_id = 'artwork-images'
  and name like 'public/%'
);
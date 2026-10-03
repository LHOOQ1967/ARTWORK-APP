ALTER TABLE public.artwork_transports
  ADD COLUMN instruction_contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL;

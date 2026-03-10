-- RPC-Funktion: User-ID anhand der Email-Adresse nachschlagen
-- Wird fuer die Share-Funktion benoetigt (Email-Eingabe → User-ID Lookup)

CREATE OR REPLACE FUNCTION public.lookup_user_by_email(lookup_email text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id FROM auth.users WHERE email = lower(lookup_email) LIMIT 1;
$$;

-- Nur authentifizierte User duerfen die Funktion aufrufen
REVOKE ALL ON FUNCTION public.lookup_user_by_email FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_user_by_email TO authenticated;

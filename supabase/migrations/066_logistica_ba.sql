-- Acceso de la logística de la proveedora de Buenos Aires (link /logistica,
-- Edge Function logistica-ba): un PIN propio guardado en el vault (se genera
-- al azar; se cambia con vault.update_secret) con el mismo límite de intentos
-- que el PIN del dueño (5 fallidos en 15 minutos), y el token de TiendaNube
-- para que la función pida las órdenes en el momento. Solo service role.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'logistica_pin') THEN
    PERFORM vault.create_secret(lpad((floor(random() * 1000000))::int::text, 6, '0'), 'logistica_pin');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.logistica_verificar_pin(p_pin text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (SELECT count(*) FROM public.intentos_acceso_fallidos WHERE fecha > now() - interval '15 minutes') >= 5 THEN
    RETURN 'Demasiados intentos fallidos. Esperá 15 minutos y probá de nuevo.';
  END IF;
  IF p_pin IS NULL OR p_pin <> privado.secreto('logistica_pin') THEN
    INSERT INTO public.intentos_acceso_fallidos DEFAULT VALUES;
    RETURN 'PIN incorrecto';
  END IF;
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.logistica_verificar_pin(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.logistica_verificar_pin(text) TO service_role;

CREATE OR REPLACE FUNCTION public.logistica_token_tn()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$ SELECT privado.secreto('tiendanube_token') $$;
REVOKE EXECUTE ON FUNCTION public.logistica_token_tn() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.logistica_token_tn() TO service_role;

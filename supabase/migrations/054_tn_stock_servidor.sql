-- Stock a TiendaNube desde el servidor (cola con reintentos).
--
-- Hasta acá el stock lo mandaba a TiendaNube la compu o el celu que hacía la
-- venta. Si ese dispositivo no estaba habilitado, no tenía internet o falló el
-- pedido, la web quedaba con el número viejo y la sincronización (TN → app)
-- deshacía la venta: el par vendido "volvía" (pasó con 11 ventas del 21 al
-- 23/10). La app avisaba, pero dependía de que alguien lo corrigiera a mano.
--
-- Ahora cada cambio de stock hecho desde la app queda en esta cola y una
-- función del servidor (Edge Function tn-stock, cada minuto) lo manda a
-- TiendaNube con el token del servidor, reintentando hasta que llegue.
-- Mientras un talle está en la cola, la sincronización desde la web no puede
-- pisar su cantidad.

CREATE TABLE IF NOT EXISTS privado.tn_stock_cola (
  talle_id uuid PRIMARY KEY REFERENCES public.modelo_talles(id) ON DELETE CASCADE,
  encolado_at timestamptz NOT NULL DEFAULT now(),
  siguiente_intento timestamptz NOT NULL DEFAULT now(),
  en_proceso_at timestamptz,
  intentos int NOT NULL DEFAULT 0,
  ultimo_error text,
  avisado boolean NOT NULL DEFAULT false
);

-- Escrituras que vienen de copiar el stock de TiendaNube a la app (webhook y
-- resync, con la service role) — salvo la venta de una orden web, que resta
-- (registrar_venta_tn la marca con app.origen_stock).
CREATE OR REPLACE FUNCTION privado.tn_stock_es_sync()
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role'
     AND coalesce(current_setting('app.origen_stock', true), '') <> 'orden_tn'
$$;

-- Antes de escribir: si el talle tiene un cambio pendiente de llegar a la web,
-- la sincronización no lo pisa con el número viejo de la web.
CREATE OR REPLACE FUNCTION privado.tn_stock_proteger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.cantidad IS DISTINCT FROM OLD.cantidad
     AND privado.tn_stock_es_sync()
     AND EXISTS (SELECT 1 FROM privado.tn_stock_cola WHERE talle_id = NEW.id) THEN
    NEW.cantidad := OLD.cantidad;
  END IF;
  RETURN NEW;
END;
$$;

-- Después de escribir: todo cambio de stock hecho desde la app se encola.
CREATE OR REPLACE FUNCTION privado.tn_stock_encolar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.tn_variant_id IS NULL OR privado.tn_stock_es_sync() THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.cantidad IS NOT DISTINCT FROM OLD.cantidad THEN RETURN NEW; END IF;
  INSERT INTO privado.tn_stock_cola (talle_id) VALUES (NEW.id)
  ON CONFLICT (talle_id) DO UPDATE
    SET siguiente_intento = now(), intentos = 0, ultimo_error = NULL, avisado = false;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tn_stock_proteger ON public.modelo_talles;
CREATE TRIGGER tn_stock_proteger
  BEFORE UPDATE OF cantidad ON public.modelo_talles
  FOR EACH ROW EXECUTE FUNCTION privado.tn_stock_proteger();

DROP TRIGGER IF EXISTS tn_stock_encolar ON public.modelo_talles;
CREATE TRIGGER tn_stock_encolar
  AFTER INSERT OR UPDATE OF cantidad, tn_variant_id ON public.modelo_talles
  FOR EACH ROW EXECUTE FUNCTION privado.tn_stock_encolar();

-- La venta de una orden web resta en la app lo que TiendaNube ya restó: no se
-- reenvía, pero tampoco es una "sincronización" que haya que frenar.
CREATE OR REPLACE FUNCTION public.registrar_venta_tn(p_tn_order_id bigint, p_tn_order_line_id bigint, p_modelo_id uuid, p_talle_id uuid, p_talle_arg numeric, p_cantidad integer, p_precio_venta numeric, p_ganancia numeric)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inserted_id uuid;
BEGIN
  INSERT INTO ventas (modelo_id, talle_arg, fecha, precio_venta, medio_pago, ganancia, tn_order_id, tn_order_line_id)
  VALUES (p_modelo_id, p_talle_arg, now(), p_precio_venta, 'TiendaNube', p_ganancia, p_tn_order_id, p_tn_order_line_id)
  ON CONFLICT (tn_order_line_id) WHERE tn_order_line_id IS NOT NULL DO NOTHING
  RETURNING id INTO v_inserted_id;

  IF v_inserted_id IS NULL THEN
    RETURN false;
  END IF;

  PERFORM set_config('app.origen_stock', 'orden_tn', true);
  UPDATE modelo_talles
  SET cantidad = GREATEST(0, cantidad - p_cantidad)
  WHERE id = p_talle_id;
  PERFORM set_config('app.origen_stock', '', true);

  RETURN true;
END;
$function$;

-- ── Para la Edge Function tn-stock (solo service role) ──────────────────────

-- Toma hasta p_limite talles para mandar y los marca "en proceso" (5 minutos,
-- por si la función se corta a la mitad).
CREATE OR REPLACE FUNCTION public.tn_stock_tomar(p_limite int DEFAULT 30)
RETURNS TABLE (talle_id uuid, cantidad int, tn_variant_id bigint, tn_product_id bigint, nombre text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  WITH elegidos AS (
    SELECT c.talle_id FROM privado.tn_stock_cola c
    WHERE c.siguiente_intento <= now()
      AND (c.en_proceso_at IS NULL OR c.en_proceso_at < now() - interval '5 minutes')
    ORDER BY c.encolado_at
    LIMIT p_limite
    FOR UPDATE SKIP LOCKED
  ), marcados AS (
    UPDATE privado.tn_stock_cola c SET en_proceso_at = now()
    FROM elegidos e WHERE c.talle_id = e.talle_id
    RETURNING c.talle_id
  )
  SELECT t.id, t.cantidad::int, t.tn_variant_id::bigint, m.tn_product_id::bigint,
         m.marca || ' ' || m.modelo || ' talle ' || t.talle_arg
  FROM marcados x
  JOIN public.modelo_talles t ON t.id = x.talle_id
  JOIN public.modelos m ON m.id = t.modelo_id;
END;
$$;

-- Resultado de un envío. Si llegó y la cantidad no cambió mientras tanto, sale
-- de la cola; si cambió, se reenvía. Si falló, se reintenta cada vez más
-- espaciado (1, 2, 4… hasta 60 minutos) y al 5.º intento avisa en la campanita.
CREATE OR REPLACE FUNCTION public.tn_stock_resultado(p_talle_id uuid, p_cantidad_enviada int, p_ok boolean, p_error text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actual int;
  v_fila privado.tn_stock_cola;
  v_nombre text;
BEGIN
  SELECT cantidad INTO v_actual FROM public.modelo_talles WHERE id = p_talle_id;
  IF p_ok THEN
    IF v_actual IS NULL OR v_actual = p_cantidad_enviada THEN
      DELETE FROM privado.tn_stock_cola WHERE talle_id = p_talle_id;
    ELSE
      UPDATE privado.tn_stock_cola SET en_proceso_at = NULL, siguiente_intento = now() WHERE talle_id = p_talle_id;
    END IF;
    RETURN;
  END IF;

  UPDATE privado.tn_stock_cola
  SET en_proceso_at = NULL,
      intentos = intentos + 1,
      ultimo_error = left(p_error, 300),
      siguiente_intento = now() + make_interval(mins => least(60, power(2, intentos)::int))
  WHERE talle_id = p_talle_id
  RETURNING * INTO v_fila;

  IF v_fila.intentos >= 5 AND NOT v_fila.avisado THEN
    SELECT m.marca || ' ' || m.modelo || ' talle ' || t.talle_arg INTO v_nombre
    FROM public.modelo_talles t JOIN public.modelos m ON m.id = t.modelo_id WHERE t.id = p_talle_id;
    INSERT INTO public.devoluciones_cambios_fallos (empleado_id, mensaje)
    VALUES (NULL, 'El servidor no pudo actualizar ' || coalesce(v_nombre, 'un talle') || ' en TiendaNube (debería quedar en '
      || coalesce(v_actual::text, '?') || '). Sigue reintentando solo. Error: ' || coalesce(left(p_error, 120), '?'));
    UPDATE privado.tn_stock_cola SET avisado = true WHERE talle_id = p_talle_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.tn_stock_secreto(p_nombre text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE WHEN p_nombre IN ('tiendanube_token', 'tn_stock_cron') THEN privado.secreto(p_nombre) END
$$;

REVOKE EXECUTE ON FUNCTION public.tn_stock_tomar(int) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tn_stock_resultado(uuid, int, boolean, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tn_stock_secreto(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tn_stock_tomar(int) TO service_role;
GRANT EXECUTE ON FUNCTION public.tn_stock_resultado(uuid, int, boolean, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.tn_stock_secreto(text) TO service_role;

-- Clave para que solo el cron pueda llamar a la Edge Function.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'tn_stock_cron') THEN
    PERFORM vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'tn_stock_cron');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION privado.tn_stock_llamar()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_id bigint;
BEGIN
  -- Solo si hay algo para mandar (no gastar una llamada por minuto en vano).
  IF NOT EXISTS (SELECT 1 FROM privado.tn_stock_cola WHERE siguiente_intento <= now()
                 AND (en_proceso_at IS NULL OR en_proceso_at < now() - interval '5 minutes')) THEN
    RETURN NULL;
  END IF;
  SELECT net.http_post(
    url := 'https://xpzkotmxetyofbrizvny.supabase.co/functions/v1/tn-stock',
    headers := jsonb_build_object('Authorization', 'Bearer ' || privado.secreto('tn_stock_cron'), 'Content-Type', 'application/json'),
    body := '{}'::jsonb, timeout_milliseconds := 60000) INTO v_id;
  RETURN v_id;
END;
$$;

SELECT cron.unschedule('tn-stock') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'tn-stock');
SELECT cron.schedule('tn-stock', '* * * * *', 'select privado.tn_stock_llamar()');

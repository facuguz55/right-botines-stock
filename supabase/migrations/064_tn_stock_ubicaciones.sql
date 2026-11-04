-- Ubicaciones de TiendaNube (Showroom = local, Deposito CABA = proveedora).
-- Un talle que recién se asocia a su variante (lo acaba de crear la app) tiene
-- todo su stock en el local: se marca todo_local para que la Edge Function
-- tn-stock lo ponga entero en el Showroom. El resto de los cambios se reparte
-- en tn-stock (primero Showroom; CABA solo si el Showroom no alcanza).
ALTER TABLE privado.tn_stock_cola ADD COLUMN IF NOT EXISTS todo_local boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION privado.tn_stock_encolar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_nuevo boolean := TG_OP = 'UPDATE' AND OLD.tn_variant_id IS NULL AND NEW.tn_variant_id IS NOT NULL;
BEGIN
  IF NEW.tn_variant_id IS NULL OR privado.tn_stock_es_sync() THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.cantidad IS NOT DISTINCT FROM OLD.cantidad AND NOT v_nuevo THEN RETURN NEW; END IF;
  INSERT INTO privado.tn_stock_cola (talle_id, todo_local) VALUES (NEW.id, v_nuevo)
  ON CONFLICT (talle_id) DO UPDATE
    SET siguiente_intento = now(), intentos = 0, ultimo_error = NULL, avisado = false,
        todo_local = privado.tn_stock_cola.todo_local OR EXCLUDED.todo_local;
  RETURN NEW;
END;
$$;

DROP FUNCTION IF EXISTS public.tn_stock_tomar(int);
CREATE FUNCTION public.tn_stock_tomar(p_limite int DEFAULT 30)
RETURNS TABLE (talle_id uuid, cantidad int, tn_variant_id bigint, tn_product_id bigint, nombre text, todo_local boolean)
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
    RETURNING c.talle_id, c.todo_local
  )
  SELECT t.id, t.cantidad::int, t.tn_variant_id::bigint, m.tn_product_id::bigint,
         m.marca || ' ' || m.modelo || ' talle ' || t.talle_arg, x.todo_local
  FROM marcados x
  JOIN public.modelo_talles t ON t.id = x.talle_id
  JOIN public.modelos m ON m.id = t.modelo_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.tn_stock_tomar(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tn_stock_tomar(int) TO service_role;

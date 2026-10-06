-- Análisis por producto para la pantalla Tráfico:
--   1. Interés vs ventas (vistas, carrito, compras).
--   3. Talles agotados que la gente busca.
--   5. Abandono de carrito por producto.
--
-- Para el (3) se registra un evento nuevo, 'talle_select': la tienda muestra
-- todos los talles como botones (también los agotados) y LS.variants trae el
-- stock de cada uno, así que track.js sabe qué talle tocó la persona y si
-- estaba sin stock en ese momento.

ALTER TABLE web_eventos ADD COLUMN IF NOT EXISTS talle text;
ALTER TABLE web_eventos ADD COLUMN IF NOT EXISTS sin_stock boolean;

ALTER TABLE web_eventos DROP CONSTRAINT IF EXISTS web_eventos_tipo_check;
ALTER TABLE web_eventos ADD CONSTRAINT web_eventos_tipo_check
  CHECK (tipo IN ('page_view', 'product_view', 'add_to_cart', 'checkout_start', 'talle_select'));

CREATE INDEX IF NOT EXISTS idx_web_eventos_session ON web_eventos (session_id);

CREATE OR REPLACE FUNCTION web_registrar_eventos(p_eventos jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  IF jsonb_typeof(p_eventos) <> 'array' OR jsonb_array_length(p_eventos) > 20 THEN
    RAISE EXCEPTION 'Lote inválido';
  END IF;
  INSERT INTO web_eventos (visitor_id, session_id, tipo, path, tn_product_id, referrer,
                           utm_source, utm_medium, utm_campaign, dispositivo, ciudad, pais,
                           talle, sin_stock)
  SELECT left(e->>'visitor_id', 64), left(e->>'session_id', 64), e->>'tipo', left(e->>'path', 300),
         CASE WHEN (e->>'tn_product_id') ~ '^[0-9]{1,15}$' THEN (e->>'tn_product_id')::bigint END,
         left(e->>'referrer', 300), left(e->>'utm_source', 100), left(e->>'utm_medium', 100),
         left(e->>'utm_campaign', 150), e->>'dispositivo', left(e->>'ciudad', 100), left(e->>'pais', 10),
         left(e->>'talle', 60),
         CASE WHEN e->>'sin_stock' IN ('true', 'false') THEN (e->>'sin_stock')::boolean END
  FROM jsonb_array_elements(p_eventos) e
  WHERE e->>'tipo' IN ('page_view', 'product_view', 'add_to_cart', 'checkout_start', 'talle_select')
    AND coalesce(e->>'visitor_id', '') <> '' AND coalesce(e->>'session_id', '') <> ''
    AND coalesce(e->>'dispositivo', 'desktop') IN ('mobile', 'tablet', 'desktop');
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- Talle ARG desde el texto de TiendaNube ("41 arg / 8,5 us" → 41).
CREATE OR REPLACE FUNCTION web_talle_arg(p_talle text)
RETURNS numeric
LANGUAGE sql IMMUTABLE
AS $$
  SELECT replace((regexp_match(p_talle, '^\s*([0-9]{2}(?:[.,][0-9])?)'))[1], ',', '.')::numeric
$$;

-- Todo en sesiones (no en eventos sueltos), salvo las compras, que salen de
-- tn_ordenes porque TiendaNube no deja medir dentro del checkout. Las
-- compras se cuentan solo desde el primer evento registrado, igual que en
-- web_trafico_resumen, para no comparar ventas de días sin tracking.
CREATE OR REPLACE FUNCTION web_analisis_productos(p_desde date, p_hasta date)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = public
AS $$
WITH lim AS (
  SELECT (p_desde::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires') AS desde,
         ((p_hasta + 1)::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires') AS hasta,
         (SELECT min(created_at) FROM web_eventos) AS inicio_tracking
),
ev AS (
  SELECT e.* FROM web_eventos e, lim
  WHERE e.created_at >= lim.desde AND e.created_at < lim.hasta
),
vistas AS (
  SELECT tn_product_id, count(DISTINCT session_id) AS n
  FROM ev WHERE tipo = 'product_view' AND tn_product_id IS NOT NULL GROUP BY 1
),
carritos AS (
  SELECT tn_product_id, count(DISTINCT session_id) AS n
  FROM ev WHERE tipo = 'add_to_cart' AND tn_product_id IS NOT NULL GROUP BY 1
),
-- Sesiones que agregaron el producto y después, en la misma sesión, fueron
-- al checkout.
checkouts AS (
  SELECT a.tn_product_id, count(DISTINCT a.session_id) AS n
  FROM ev a
  JOIN ev c ON c.session_id = a.session_id AND c.tipo = 'checkout_start' AND c.created_at >= a.created_at
  WHERE a.tipo = 'add_to_cart' AND a.tn_product_id IS NOT NULL
  GROUP BY 1
),
ventas AS (
  SELECT (p->>'product_id')::bigint AS tn_product_id,
         sum(coalesce((p->>'quantity')::int, 1)) AS unidades,
         count(DISTINCT o.id) AS ordenes,
         max(p->>'name_without_variants') AS nombre
  FROM tn_ordenes o, lim, jsonb_array_elements(o.products) p
  WHERE lim.inicio_tracking IS NOT NULL
    AND o.tn_created_at >= greatest(lim.desde, lim.inicio_tracking)
    AND o.tn_created_at < lim.hasta
    AND coalesce(o.status, '') <> 'cancelled'
    AND (p->>'product_id') ~ '^[0-9]+$'
  GROUP BY 1
),
stock AS (
  SELECT m.tn_product_id, sum(t.cantidad) AS unidades
  FROM modelos m JOIN modelo_talles t ON t.modelo_id = m.id
  WHERE m.tn_product_id IS NOT NULL
  GROUP BY 1
),
ids AS (
  SELECT tn_product_id FROM vistas
  UNION SELECT tn_product_id FROM carritos
  UNION SELECT tn_product_id FROM ventas
),
productos AS (
  SELECT i.tn_product_id,
         coalesce(v.n, 0) AS vistas,
         coalesce(c.n, 0) AS carritos,
         coalesce(k.n, 0) AS checkouts,
         coalesce(ve.ordenes, 0) AS ordenes,
         coalesce(ve.unidades, 0) AS unidades,
         s.unidades AS stock,
         ve.nombre
  FROM ids i
  LEFT JOIN vistas v ON v.tn_product_id = i.tn_product_id
  LEFT JOIN carritos c ON c.tn_product_id = i.tn_product_id
  LEFT JOIN checkouts k ON k.tn_product_id = i.tn_product_id
  LEFT JOIN ventas ve ON ve.tn_product_id = i.tn_product_id
  LEFT JOIN stock s ON s.tn_product_id = i.tn_product_id
),
talles AS (
  SELECT ev.tn_product_id, ev.talle,
         count(DISTINCT ev.session_id) AS sesiones,
         (SELECT t.cantidad FROM modelos m JOIN modelo_talles t ON t.modelo_id = m.id
          WHERE m.tn_product_id = ev.tn_product_id AND t.talle_arg = web_talle_arg(ev.talle)
          LIMIT 1) AS stock_actual
  FROM ev
  WHERE ev.tipo = 'talle_select' AND ev.sin_stock AND ev.tn_product_id IS NOT NULL AND ev.talle IS NOT NULL
  GROUP BY 1, 2
)
SELECT jsonb_build_object(
  'productos', coalesce((
    SELECT jsonb_agg(to_jsonb(p) ORDER BY p.vistas DESC, p.unidades DESC)
    FROM (SELECT * FROM productos ORDER BY vistas DESC, unidades DESC LIMIT 60) p
  ), '[]'::jsonb),
  'talles_agotados', coalesce((
    SELECT jsonb_agg(to_jsonb(t) ORDER BY t.sesiones DESC)
    FROM (SELECT * FROM talles ORDER BY sesiones DESC LIMIT 40) t
  ), '[]'::jsonb)
);
$$;

GRANT EXECUTE ON FUNCTION web_analisis_productos(date, date) TO anon, authenticated;

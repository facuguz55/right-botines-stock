-- Tráfico de la tienda web (right.com.ar). Un script propio cargado vía
-- Google Tag Manager manda cada evento a /api/track, que inserta acá vía
-- la RPC web_registrar_eventos. TiendaNube no expone visitas por API, y bloquea scripts
-- propios dentro del checkout — por eso "compra" no es un evento de acá:
-- sale de tn_ordenes (webhook) en el resumen.
CREATE TABLE IF NOT EXISTS web_eventos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  visitor_id text NOT NULL,
  session_id text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('page_view', 'product_view', 'add_to_cart', 'checkout_start')),
  path text,
  tn_product_id bigint,
  referrer text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  dispositivo text CHECK (dispositivo IN ('mobile', 'tablet', 'desktop')),
  ciudad text,
  pais text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_web_eventos_created ON web_eventos (created_at);
CREATE INDEX IF NOT EXISTS idx_web_eventos_tipo_created ON web_eventos (tipo, created_at);

-- Solo lectura directa desde la app; no hay policy de INSERT. La escritura
-- entra únicamente por la RPC web_registrar_eventos (SECURITY DEFINER), que
-- valida tipo/dispositivo, recorta largos y limita el tamaño del lote. La
-- llama /api/track, que agrega geo (headers de Vercel) y filtra bots.
ALTER TABLE web_eventos ENABLE ROW LEVEL SECURITY;
CREATE POLICY web_eventos_select ON web_eventos FOR SELECT TO anon USING (true);

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
                           utm_source, utm_medium, utm_campaign, dispositivo, ciudad, pais)
  SELECT left(e->>'visitor_id', 64), left(e->>'session_id', 64), e->>'tipo', left(e->>'path', 300),
         CASE WHEN (e->>'tn_product_id') ~ '^[0-9]{1,15}$' THEN (e->>'tn_product_id')::bigint END,
         left(e->>'referrer', 300), left(e->>'utm_source', 100), left(e->>'utm_medium', 100),
         left(e->>'utm_campaign', 150), e->>'dispositivo', left(e->>'ciudad', 100), left(e->>'pais', 10)
  FROM jsonb_array_elements(p_eventos) e
  WHERE e->>'tipo' IN ('page_view', 'product_view', 'add_to_cart', 'checkout_start')
    AND coalesce(e->>'visitor_id', '') <> '' AND coalesce(e->>'session_id', '') <> ''
    AND coalesce(e->>'dispositivo', 'desktop') IN ('mobile', 'tablet', 'desktop');
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
GRANT EXECUTE ON FUNCTION web_registrar_eventos(jsonb) TO anon, authenticated;

-- Resumen agregado para la pantalla Tráfico: todo se calcula en la base
-- para no bajar miles de eventos crudos al navegador. Fechas en hora
-- Argentina; p_hasta es inclusivo.
CREATE OR REPLACE FUNCTION web_trafico_resumen(p_desde date, p_hasta date)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = public
AS $$
WITH ev AS (
  SELECT * FROM web_eventos
  WHERE created_at >= (p_desde::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')
    AND created_at <  ((p_hasta + 1)::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')
),
-- Órdenes solo desde que hay tracking: si no, el embudo compararía compras
-- de días en que las visitas todavía no se medían.
ordenes AS (
  SELECT count(*) AS n FROM tn_ordenes
  WHERE tn_created_at >= greatest(
          (p_desde::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires'),
          (SELECT min(created_at) FROM web_eventos))
    AND tn_created_at <  ((p_hasta + 1)::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')
    AND coalesce(status, '') <> 'cancelled'
    AND EXISTS (SELECT 1 FROM web_eventos) -- greatest() ignora NULL: sin eventos, 0 compras
)
SELECT jsonb_build_object(
  'visitantes', (SELECT count(DISTINCT visitor_id) FROM ev),
  'sesiones', (SELECT count(DISTINCT session_id) FROM ev),
  'paginas_vistas', (SELECT count(*) FROM ev WHERE tipo IN ('page_view', 'product_view')),
  'por_dia', coalesce((
    SELECT jsonb_agg(jsonb_build_object('dia', dia, 'visitantes', v, 'sesiones', s) ORDER BY dia)
    FROM (
      SELECT (created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS dia,
             count(DISTINCT visitor_id) AS v, count(DISTINCT session_id) AS s
      FROM ev GROUP BY 1
    ) d
  ), '[]'::jsonb),
  'dispositivos', coalesce((
    SELECT jsonb_agg(jsonb_build_object('dispositivo', dispositivo, 'sesiones', s) ORDER BY s DESC)
    FROM (
      SELECT coalesce(dispositivo, 'desktop') AS dispositivo, count(DISTINCT session_id) AS s
      FROM ev GROUP BY 1
    ) d
  ), '[]'::jsonb),
  'ciudades', coalesce((
    SELECT jsonb_agg(jsonb_build_object('ciudad', ciudad, 'sesiones', s) ORDER BY s DESC)
    FROM (
      SELECT ciudad, count(DISTINCT session_id) AS s
      FROM ev WHERE ciudad IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 10
    ) d
  ), '[]'::jsonb),
  'productos', coalesce((
    SELECT jsonb_agg(jsonb_build_object('tn_product_id', tn_product_id, 'vistas', vistas, 'carritos', carritos) ORDER BY vistas DESC)
    FROM (
      SELECT tn_product_id,
             count(*) FILTER (WHERE tipo = 'product_view') AS vistas,
             count(DISTINCT session_id) FILTER (WHERE tipo = 'add_to_cart') AS carritos
      FROM ev WHERE tn_product_id IS NOT NULL
      GROUP BY 1 ORDER BY 2 DESC LIMIT 20
    ) d
  ), '[]'::jsonb),
  'paginas', coalesce((
    SELECT jsonb_agg(jsonb_build_object('path', path, 'vistas', vistas) ORDER BY vistas DESC)
    FROM (
      SELECT path, count(*) AS vistas
      FROM ev WHERE tipo IN ('page_view', 'product_view') AND path IS NOT NULL
      GROUP BY 1 ORDER BY 2 DESC LIMIT 15
    ) d
  ), '[]'::jsonb),
  'embudo', jsonb_build_object(
    'sesiones', (SELECT count(DISTINCT session_id) FROM ev),
    'vieron_producto', (SELECT count(DISTINCT session_id) FROM ev WHERE tipo = 'product_view'),
    'agregaron_carrito', (SELECT count(DISTINCT session_id) FROM ev WHERE tipo = 'add_to_cart'),
    'iniciaron_checkout', (SELECT count(DISTINCT session_id) FROM ev WHERE tipo = 'checkout_start'),
    'compraron', (SELECT n FROM ordenes)
  ),
  'primer_evento', (SELECT min(created_at) FROM web_eventos)
);
$$;

GRANT EXECUTE ON FUNCTION web_trafico_resumen(date, date) TO anon, authenticated;

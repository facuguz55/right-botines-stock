-- Canales de tráfico: de dónde vienen las visitas y cuáles avanzan hacia la
-- compra. El canal de una sesión se decide con su PRIMER evento (track.js
-- solo manda UTM/referrer en ese), con esta prioridad:
--   1. UTM (utm_source/utm_medium), si el link estaba etiquetado.
--   2. ID de click: gclid → Google Ads; fbclid → Instagram/Facebook.
--   3. Navegador interno de la app (user-agent): Instagram, Facebook, TikTok
--      no siempre pasan referrer, pero sí se identifican en el user-agent.
--   4. Referrer: buscadores, redes, WhatsApp, otros sitios.
--   5. Nada de lo anterior → Directo (escribieron la dirección, favoritos,
--      o un link pegado en una app que no deja rastro, ej. WhatsApp).
--
-- Las compras no se pueden atribuir por canal: TiendaNube bloquea scripts
-- en el checkout, así que no hay forma de unir una orden con su visita. Lo
-- más profundo que se mide por canal es "llegó al checkout".

ALTER TABLE web_eventos ADD COLUMN IF NOT EXISTS click_id text;  -- 'gclid' | 'fbclid' | 'ttclid'
ALTER TABLE web_eventos ADD COLUMN IF NOT EXISTS app text;       -- 'instagram' | 'facebook' | 'tiktok'

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
                           talle, sin_stock, click_id, app)
  SELECT left(e->>'visitor_id', 64), left(e->>'session_id', 64), e->>'tipo', left(e->>'path', 300),
         CASE WHEN (e->>'tn_product_id') ~ '^[0-9]{1,15}$' THEN (e->>'tn_product_id')::bigint END,
         left(e->>'referrer', 300), left(e->>'utm_source', 100), left(e->>'utm_medium', 100),
         left(e->>'utm_campaign', 150), e->>'dispositivo', left(e->>'ciudad', 100), left(e->>'pais', 10),
         left(e->>'talle', 60),
         CASE WHEN e->>'sin_stock' IN ('true', 'false') THEN (e->>'sin_stock')::boolean END,
         CASE WHEN e->>'click_id' IN ('gclid', 'fbclid', 'ttclid') THEN e->>'click_id' END,
         CASE WHEN e->>'app' IN ('instagram', 'facebook', 'tiktok') THEN e->>'app' END
  FROM jsonb_array_elements(p_eventos) e
  WHERE e->>'tipo' IN ('page_view', 'product_view', 'add_to_cart', 'checkout_start', 'talle_select')
    AND coalesce(e->>'visitor_id', '') <> '' AND coalesce(e->>'session_id', '') <> ''
    AND coalesce(e->>'dispositivo', 'desktop') IN ('mobile', 'tablet', 'desktop');
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION web_canal(
  p_utm_source text, p_utm_medium text, p_referrer text, p_click_id text, p_app text
) RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  WITH n AS (
    SELECT lower(trim(coalesce(p_utm_source, ''))) AS src,
           lower(trim(coalesce(p_utm_medium, ''))) AS med,
           lower(coalesce(substring(p_referrer from '^https?://([^/:?#]+)'), '')) AS host
  ),
  pago AS (
    SELECT med IN ('cpc', 'ppc', 'paid', 'paid_social', 'paidsocial', 'ads', 'ad', 'cpm', 'display') AS es FROM n
  )
  SELECT CASE
    -- 1. UTM
    WHEN src <> '' THEN CASE
      WHEN src IN ('ig', 'instagram', 'fb', 'facebook', 'meta', 'an', 'msg') AND (SELECT es FROM pago) THEN 'Meta Ads'
      WHEN src IN ('google', 'adwords') AND ((SELECT es FROM pago) OR p_click_id = 'gclid') THEN 'Google Ads'
      WHEN src IN ('ig', 'instagram') THEN 'Instagram'
      WHEN src IN ('fb', 'facebook', 'meta') THEN 'Facebook'
      WHEN src IN ('wa', 'whatsapp') THEN 'WhatsApp'
      WHEN src IN ('tiktok', 'tt') THEN CASE WHEN (SELECT es FROM pago) THEN 'TikTok Ads' ELSE 'TikTok' END
      WHEN src IN ('google', 'bing', 'yahoo') THEN 'Google'
      WHEN src IN ('email', 'mail', 'newsletter', 'gmail', 'mailchimp') OR med = 'email' THEN 'Email'
      ELSE initcap(src)
    END
    -- 2. ID de click
    WHEN p_click_id = 'gclid' THEN 'Google Ads'
    WHEN p_click_id = 'ttclid' THEN 'TikTok Ads'
    -- 3. Navegador interno de la app
    WHEN p_app = 'instagram' THEN 'Instagram'
    WHEN p_app = 'facebook' THEN 'Facebook'
    WHEN p_app = 'tiktok' THEN 'TikTok'
    -- 4. Referrer
    WHEN host ~ '(^|\.)instagram\.com$' THEN 'Instagram'
    WHEN host ~ '(^|\.)(facebook\.com|fb\.com|fb\.me|messenger\.com)$' THEN 'Facebook'
    WHEN p_click_id = 'fbclid' THEN 'Instagram/Facebook'
    WHEN host ~ '(^|\.)tiktok\.com$' THEN 'TikTok'
    WHEN host ~ '(^|\.)(whatsapp\.com|wa\.me)$' THEN 'WhatsApp'
    WHEN host ~ '(^|\.)(google\.[a-z.]+|bing\.com|yahoo\.com|duckduckgo\.com)$' THEN 'Google'
    WHEN host ~ '(^|\.)(youtube\.com|youtu\.be)$' THEN 'YouTube'
    WHEN host ~ '(mitiendanube|tiendanube|right\.com\.ar)' THEN 'Directo'
    WHEN host <> '' THEN 'Otros sitios'
    ELSE 'Directo'
  END
  FROM n
$$;

CREATE OR REPLACE FUNCTION web_trafico_canales(p_desde date, p_hasta date)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = public
AS $$
WITH ev AS (
  SELECT * FROM web_eventos
  WHERE created_at >= (p_desde::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')
    AND created_at <  ((p_hasta + 1)::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')
),
primero AS (
  SELECT DISTINCT ON (session_id) session_id, visitor_id,
         web_canal(utm_source, utm_medium, referrer, click_id, app) AS canal,
         nullif(lower(trim(utm_source)), '') AS utm_source,
         nullif(lower(trim(utm_medium)), '') AS utm_medium,
         nullif(trim(utm_campaign), '') AS utm_campaign
  FROM ev ORDER BY session_id, created_at, id
),
sesion AS (
  SELECT p.*,
         bool_or(e.tipo = 'product_view') AS vio_producto,
         bool_or(e.tipo = 'add_to_cart') AS carrito,
         bool_or(e.tipo = 'checkout_start') AS checkout,
         count(*) FILTER (WHERE e.tipo IN ('page_view', 'product_view')) AS paginas
  FROM primero p JOIN ev e ON e.session_id = p.session_id
  GROUP BY p.session_id, p.visitor_id, p.canal, p.utm_source, p.utm_medium, p.utm_campaign
)
SELECT jsonb_build_object(
  'canales', coalesce((
    SELECT jsonb_agg(to_jsonb(c) ORDER BY c.sesiones DESC)
    FROM (
      SELECT canal,
             count(*) AS sesiones,
             count(DISTINCT visitor_id) AS visitantes,
             count(*) FILTER (WHERE vio_producto) AS vieron_producto,
             count(*) FILTER (WHERE carrito) AS carritos,
             count(*) FILTER (WHERE checkout) AS checkouts,
             round(avg(paginas), 1) AS paginas_por_visita
      FROM sesion GROUP BY canal
    ) c
  ), '[]'::jsonb),
  'campanas', coalesce((
    SELECT jsonb_agg(to_jsonb(c) ORDER BY c.sesiones DESC)
    FROM (
      SELECT utm_campaign AS campana, utm_source, utm_medium, canal,
             count(*) AS sesiones,
             count(*) FILTER (WHERE carrito) AS carritos,
             count(*) FILTER (WHERE checkout) AS checkouts
      FROM sesion WHERE utm_campaign IS NOT NULL
      GROUP BY 1, 2, 3, 4
      ORDER BY 5 DESC LIMIT 30
    ) c
  ), '[]'::jsonb)
);
$$;

GRANT EXECUTE ON FUNCTION web_trafico_canales(date, date) TO anon, authenticated;

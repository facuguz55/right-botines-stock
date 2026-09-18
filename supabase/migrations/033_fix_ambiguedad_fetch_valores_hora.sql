-- fetch_valores_hora declara RETURNS TABLE (id UUID, ...), lo que crea una
-- variable de salida llamada "id" visible en toda la función. El chequeo
-- del PIN hacía "WHERE id = 1" sin calificar, así que Postgres no podía
-- decidir si era esa variable de salida o app_settings.id — de ahí el
-- error "column reference id is ambiguous". Se soluciona calificando la
-- columna con el alias de la tabla.
CREATE OR REPLACE FUNCTION fetch_valores_hora(pin_input TEXT)
RETURNS TABLE (
  id UUID,
  empleado_id UUID,
  valor_hora NUMERIC,
  vigente_desde DATE,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_settings a WHERE a.id = 1 AND a.owner_pin = pin_input) THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT v.id, v.empleado_id, v.valor_hora, v.vigente_desde, v.created_at
    FROM valores_hora v
    ORDER BY v.vigente_desde DESC;
END;
$$;

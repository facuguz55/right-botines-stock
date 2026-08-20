-- Permite eliminar una venta (solo el dueño) devolviendo el stock vendido
-- al talle correspondiente. La verificación del pin es server-side, igual
-- que verify_owner_pin/set_app_lock, para que no alcance con falsear el rol
-- en el cliente (ej. editando localStorage) para borrar historial de ventas.

CREATE OR REPLACE FUNCTION delete_venta(pin_input TEXT, venta_id_input UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_modelo_id UUID;
  v_talle_arg NUMERIC;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_settings WHERE id = 1 AND owner_pin = pin_input) THEN
    RETURN FALSE;
  END IF;

  SELECT modelo_id, talle_arg INTO v_modelo_id, v_talle_arg
  FROM ventas WHERE id = venta_id_input;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Devuelve la unidad vendida al stock del talle (si el modelo no fue
  -- eliminado desde entonces).
  IF v_modelo_id IS NOT NULL THEN
    UPDATE modelo_talles
    SET cantidad = cantidad + 1
    WHERE modelo_id = v_modelo_id AND talle_arg = v_talle_arg;
  END IF;

  DELETE FROM ventas WHERE id = venta_id_input;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION delete_venta(TEXT, UUID) TO anon, authenticated;

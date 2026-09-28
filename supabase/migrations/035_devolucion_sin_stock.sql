-- Devolución/cambio sin devolver el producto al stock — pedido real: un
-- botín que se devuelve roto no puede volver a la venta, se desecha. Hasta
-- ahora registrar_devolucion_cambio SIEMPRE sumaba la unidad devuelta al
-- talle original, sin distinguir ese caso.
--
-- devuelto_a_stock se guarda en la fila igual (para poder ver después
-- cuántas unidades se dieron de baja por esto), pero solo afecta el UPDATE
-- de stock del talle ORIGINAL — el talle nuevo de un cambio (lo que el
-- cliente se lleva) sigue descontándose siempre, sea o no que lo devuelto
-- vuelva al stock.
ALTER TABLE devoluciones_cambios ADD COLUMN IF NOT EXISTS devuelto_a_stock boolean NOT NULL DEFAULT true;

-- El listado de parámetros cambia (se agrega p_devolver_a_stock), así que
-- hay que borrar la firma vieja de 9 parámetros antes de crear la nueva de
-- 10 — CREATE OR REPLACE no alcanza cuando cambia la firma (mismo motivo
-- que en 034_mixto_con_tarjeta.sql).
DROP FUNCTION IF EXISTS registrar_devolucion_cambio(
  text, uuid, uuid, integer, uuid, numeric, text, text, uuid
);

CREATE OR REPLACE FUNCTION registrar_devolucion_cambio(
  p_tipo text,
  p_venta_id uuid,
  p_talle_id_original uuid,
  p_cantidad integer,
  p_talle_id_nuevo uuid,
  p_monto_diferencia numeric,
  p_medio_pago_diferencia text,
  p_motivo text,
  p_empleado_id uuid,
  p_devolver_a_stock boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_modelo_id_original uuid;
  v_talle_arg_original numeric;
  v_modelo_id_nuevo uuid;
  v_talle_arg_nuevo numeric;
  v_afectadas integer;
BEGIN
  IF p_tipo NOT IN ('devolucion', 'cambio') THEN
    RAISE EXCEPTION 'Tipo inválido: %', p_tipo;
  END IF;
  IF v_motivo = '' THEN
    RAISE EXCEPTION 'El motivo es obligatorio';
  END IF;
  IF p_cantidad IS NULL OR p_cantidad < 1 THEN
    RAISE EXCEPTION 'Cantidad inválida';
  END IF;
  IF p_tipo = 'cambio' AND p_talle_id_nuevo IS NULL THEN
    RAISE EXCEPTION 'Falta elegir el talle nuevo para el cambio';
  END IF;

  IF p_empleado_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM caja_dias WHERE estado = 'abierta') THEN
      RAISE EXCEPTION 'No hay una caja abierta — abrila antes de hacer una devolución o un cambio.';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM fichajes WHERE empleado_id = p_empleado_id AND hora_salida IS NULL
    ) THEN
      RAISE EXCEPTION 'Fichá tu entrada antes de hacer una devolución o un cambio.';
    END IF;
  END IF;

  SELECT t.modelo_id, t.talle_arg INTO v_modelo_id_original, v_talle_arg_original
  FROM modelo_talles t WHERE t.id = p_talle_id_original;

  IF v_modelo_id_original IS NULL THEN
    RAISE EXCEPTION 'El talle a devolver ya no existe';
  END IF;

  -- Si no vuelve al stock (producto roto/desechado), no se toca cantidad ni
  -- cantidad_local del talle original — el par sale del negocio, no del
  -- depósito al local.
  IF p_devolver_a_stock THEN
    UPDATE modelo_talles
    SET cantidad = cantidad + p_cantidad,
        cantidad_local = cantidad_local + p_cantidad
    WHERE id = p_talle_id_original;
  END IF;

  IF p_tipo = 'cambio' THEN
    SELECT t.modelo_id, t.talle_arg INTO v_modelo_id_nuevo, v_talle_arg_nuevo
    FROM modelo_talles t WHERE t.id = p_talle_id_nuevo;

    IF v_modelo_id_nuevo IS NULL THEN
      RAISE EXCEPTION 'El talle nuevo ya no existe';
    END IF;

    UPDATE modelo_talles
    SET cantidad = cantidad - p_cantidad,
        cantidad_local = GREATEST(0, cantidad_local - p_cantidad)
    WHERE id = p_talle_id_nuevo AND cantidad >= p_cantidad;
    GET DIAGNOSTICS v_afectadas = ROW_COUNT;

    IF v_afectadas = 0 THEN
      RAISE EXCEPTION 'No hay stock suficiente del talle nuevo';
    END IF;
  END IF;

  INSERT INTO devoluciones_cambios (
    tipo, venta_id, modelo_id_original, talle_arg_original, cantidad,
    modelo_id_nuevo, talle_arg_nuevo, monto_diferencia, medio_pago_diferencia,
    motivo, empleado_id, devuelto_a_stock
  ) VALUES (
    p_tipo, p_venta_id, v_modelo_id_original, v_talle_arg_original, p_cantidad,
    CASE WHEN p_tipo = 'cambio' THEN v_modelo_id_nuevo ELSE NULL END,
    CASE WHEN p_tipo = 'cambio' THEN v_talle_arg_nuevo ELSE NULL END,
    p_monto_diferencia,
    CASE WHEN p_monto_diferencia <> 0 THEN p_medio_pago_diferencia ELSE NULL END,
    v_motivo, p_empleado_id, p_devolver_a_stock
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION registrar_devolucion_cambio(
  text, uuid, uuid, integer, uuid, numeric, text, text, uuid, boolean
) TO anon, authenticated;

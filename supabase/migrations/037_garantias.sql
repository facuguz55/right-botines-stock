-- Marca de "garantía de fábrica" en devoluciones/cambios (pedido de Cami):
-- cuando un par vuelve por un defecto de fábrica y se entrega otro modelo a
-- cambio (ej. F50 rosado roto → Phantom azul), esa entrega es una pérdida
-- real — no hay venta que la cubra — así que hay que poder verla en la
-- ganancia neta (Rentabilidad/Dashboard) y agruparla por modelo/proveedor
-- para detectar defectos recurrentes.
--
-- proveedor_id es opcional y lo elige el empleado a mano (no se puede
-- inferir de forma confiable: `modelos` no tiene proveedor propio, y un
-- mismo modelo puede haberse comprado a más de un proveedor en distintas
-- compras — no hay lote/serie por par para saber de cuál vino este).

ALTER TABLE devoluciones_cambios ADD COLUMN IF NOT EXISTS es_garantia boolean NOT NULL DEFAULT false;
ALTER TABLE devoluciones_cambios ADD COLUMN IF NOT EXISTS proveedor_id uuid REFERENCES proveedores(id);

DROP FUNCTION IF EXISTS registrar_devolucion_cambio(
  text, uuid, uuid, integer, uuid, numeric, text, text, uuid, boolean
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
  p_devolver_a_stock boolean DEFAULT true,
  p_es_garantia boolean DEFAULT false,
  p_proveedor_id uuid DEFAULT NULL
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
    motivo, empleado_id, devuelto_a_stock, es_garantia, proveedor_id
  ) VALUES (
    p_tipo, p_venta_id, v_modelo_id_original, v_talle_arg_original, p_cantidad,
    CASE WHEN p_tipo = 'cambio' THEN v_modelo_id_nuevo ELSE NULL END,
    CASE WHEN p_tipo = 'cambio' THEN v_talle_arg_nuevo ELSE NULL END,
    p_monto_diferencia,
    CASE WHEN p_monto_diferencia <> 0 THEN p_medio_pago_diferencia ELSE NULL END,
    v_motivo, p_empleado_id, p_devolver_a_stock, p_es_garantia, p_proveedor_id
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION registrar_devolucion_cambio(
  text, uuid, uuid, integer, uuid, numeric, text, text, uuid, boolean, boolean, uuid
) TO anon, authenticated;

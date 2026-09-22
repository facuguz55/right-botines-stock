-- "Mixto" solo admitía Efectivo + Transferencia (el cliente cargaba un
-- monto en efectivo y el resto se asumía transferencia siempre). No había
-- forma de registrar un pago que combinara Efectivo+Tarjeta o
-- Transferencia+Tarjeta, que es justo lo que reportó una empleada real:
-- se puede cobrar así en el mostrador, pero la app no lo deja guardar.
--
-- Se agrega monto_tarjeta (mismo patrón que monto_efectivo/monto_transferencia,
-- repetido en cada fila del venta_grupo) para la porción de un Mixto que se
-- cobró con tarjeta. Ese monto YA incluye el recargo de esa porción — igual
-- que precio_venta ya lo incluye en una venta 100% tarjeta — porque es lo
-- que de verdad entró por esa vía, no el precio de lista de esa parte.
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS monto_tarjeta numeric;

-- CREATE OR REPLACE no alcanza para "cambiar" una función: como el listado
-- de parámetros es distinto al de antes (se agrega p_monto_tarjeta en medio),
-- Postgres identifica esto como una función DISTINTA y dejaría las dos
-- superpuestas si no se borra primero la firma vieja de 11 parámetros.
DROP FUNCTION IF EXISTS registrar_venta_carrito(
  jsonb, text, uuid, text, integer, numeric, uuid, numeric, numeric, numeric, numeric
);

CREATE OR REPLACE FUNCTION registrar_venta_carrito(
  p_items jsonb,
  p_medio_pago text,
  p_cliente_id uuid,
  p_tarjeta text,
  p_cuotas integer,
  p_recargo_pct numeric,
  p_empleado_id uuid,
  p_monto_efectivo numeric DEFAULT NULL,
  p_monto_transferencia numeric DEFAULT NULL,
  p_monto_tarjeta numeric DEFAULT NULL,
  p_monto_recibido_efectivo numeric DEFAULT NULL,
  p_vuelto_efectivo numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_venta_grupo_id uuid := gen_random_uuid();
  v_es_tarjeta boolean := p_medio_pago = 'Tarjeta';
  v_es_mixto boolean := p_medio_pago = 'Mixto';
  v_es_efectivo boolean := p_medio_pago = 'Efectivo';
  -- Una porción tarjeta dentro de un Mixto también necesita tarjeta/cuotas
  -- para quedar registrada (aunque el recargo ya viene incluido en
  -- p_monto_tarjeta, calculado del lado del cliente).
  v_tiene_tarjeta boolean := v_es_tarjeta OR (v_es_mixto AND COALESCE(p_monto_tarjeta, 0) > 0);
  v_item jsonb;
  v_talle_id uuid;
  v_cantidad integer;
  v_precio_manual numeric;
  v_modelo_id uuid;
  v_precio_costo numeric;
  v_precio_venta_lista numeric;
  v_precio_promocional numeric;
  v_precio_efectivo numeric;
  v_precio_real numeric;
  v_precio_base numeric;
  v_precio_final numeric;
  v_recargo numeric;
  v_es_promo boolean;
  v_descuento_pct numeric;
  v_talle_arg numeric;
  v_afectadas integer;
  i integer;
BEGIN
  IF p_medio_pago NOT IN ('Efectivo', 'Transferencia', 'Tarjeta', 'Mixto') THEN
    RAISE EXCEPTION 'Medio de pago inválido: %', p_medio_pago;
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'El carrito está vacío';
  END IF;

  IF p_empleado_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM caja_dias WHERE estado = 'abierta') THEN
      RAISE EXCEPTION 'No hay una caja abierta — abrila antes de vender.';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM fichajes WHERE empleado_id = p_empleado_id AND hora_salida IS NULL
    ) THEN
      RAISE EXCEPTION 'Fichá tu entrada antes de vender.';
    END IF;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_talle_id := (v_item->>'talle_id')::uuid;
    v_cantidad := (v_item->>'cantidad')::integer;
    v_precio_manual := NULLIF(v_item->>'precio_manual', '')::numeric;

    IF v_cantidad IS NULL OR v_cantidad < 1 THEN
      RAISE EXCEPTION 'Cantidad inválida en el carrito';
    END IF;

    SELECT m.id, m.precio_costo, m.precio_venta, m.precio_promocional, m.precio_efectivo, t.talle_arg
      INTO v_modelo_id, v_precio_costo, v_precio_venta_lista, v_precio_promocional, v_precio_efectivo, v_talle_arg
    FROM modelo_talles t
    JOIN modelos m ON m.id = t.modelo_id
    WHERE t.id = v_talle_id;

    IF v_modelo_id IS NULL THEN
      RAISE EXCEPTION 'No encontramos uno de los productos del carrito';
    END IF;

    UPDATE modelo_talles
    SET cantidad = cantidad - v_cantidad,
        cantidad_local = GREATEST(0, cantidad_local - v_cantidad)
    WHERE id = v_talle_id AND cantidad >= v_cantidad;
    GET DIAGNOSTICS v_afectadas = ROW_COUNT;

    IF v_afectadas = 0 THEN
      RAISE EXCEPTION 'No hay stock suficiente (talle %)', v_talle_arg;
    END IF;

    v_precio_real := COALESCE(v_precio_efectivo, v_precio_promocional, v_precio_venta_lista);
    v_precio_base := COALESCE(v_precio_manual, v_precio_real);

    -- El recargo de una porción tarjeta dentro de un Mixto ya viene incluido
    -- en p_monto_tarjeta (lo calcula el cliente) — el precio POR UNIDAD acá
    -- se queda en precio de lista para Mixto, igual que ya pasaba antes de
    -- este cambio para la parte efectivo/transferencia. Solo una venta
    -- 100% Tarjeta lleva el recargo adentro de precio_venta por unidad.
    IF v_precio_manual IS NOT NULL THEN
      v_precio_final := v_precio_manual * (1 + COALESCE(p_recargo_pct, 0) / 100);
    ELSIF v_es_tarjeta AND p_tarjeta = 'Crédito' AND p_cuotas = 3 THEN
      v_precio_final := COALESCE(v_precio_promocional, v_precio_venta_lista);
    ELSIF v_es_tarjeta THEN
      v_precio_final := v_precio_real * (1 + COALESCE(p_recargo_pct, 0) / 100);
    ELSE
      v_precio_final := v_precio_base;
    END IF;

    v_recargo := CASE WHEN v_es_tarjeta THEN v_precio_final - v_precio_base ELSE NULL END;
    v_es_promo := v_precio_real < v_precio_venta_lista;
    v_descuento_pct := CASE
      WHEN v_es_promo AND v_precio_promocional IS NOT NULL AND v_precio_venta_lista > 0
        THEN round((1 - v_precio_promocional / v_precio_venta_lista) * 1000) / 10
      ELSE NULL
    END;

    FOR i IN 1..v_cantidad LOOP
      INSERT INTO ventas (
        modelo_id, talle_arg, precio_venta, medio_pago, recargo_tarjeta, ganancia,
        cliente_id, venta_grupo_id, precio_tipo, descuento_pct_aplicado, precio_editado,
        tarjeta, cuotas, empleado_id,
        monto_efectivo, monto_transferencia, monto_tarjeta, monto_recibido_efectivo, vuelto_efectivo
      ) VALUES (
        v_modelo_id, v_talle_arg, v_precio_final, p_medio_pago, v_recargo, v_precio_final - v_precio_costo,
        p_cliente_id, v_venta_grupo_id,
        CASE WHEN v_es_promo THEN 'promocional' ELSE 'lista' END, v_descuento_pct, v_precio_manual IS NOT NULL,
        CASE WHEN v_tiene_tarjeta THEN p_tarjeta ELSE NULL END, CASE WHEN v_tiene_tarjeta THEN p_cuotas ELSE NULL END, p_empleado_id,
        CASE WHEN v_es_mixto THEN p_monto_efectivo ELSE NULL END,
        CASE WHEN v_es_mixto THEN p_monto_transferencia ELSE NULL END,
        CASE WHEN v_es_mixto THEN p_monto_tarjeta ELSE NULL END,
        CASE WHEN v_es_efectivo OR v_es_mixto THEN p_monto_recibido_efectivo ELSE NULL END,
        CASE WHEN v_es_efectivo OR v_es_mixto THEN p_vuelto_efectivo ELSE NULL END
      );
    END LOOP;
  END LOOP;

  RETURN v_venta_grupo_id;
END;
$$;

GRANT EXECUTE ON FUNCTION registrar_venta_carrito(
  jsonb, text, uuid, text, integer, numeric, uuid, numeric, numeric, numeric, numeric, numeric
) TO anon, authenticated;

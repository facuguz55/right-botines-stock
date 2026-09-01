-- Mueve el descuento de stock al vender/devolver/cambiar, y el chequeo de
-- caja/fichaje, del cliente a dos funciones en la base.
--
-- Hasta acá sellCarrito y registrarDevolucionCambio leían la cantidad de un
-- talle en el navegador y mandaban un UPDATE con esa cuenta ya hecha
-- (`cantidad: talle.cantidad - cantidad`). Si dos ventas del mismo talle se
-- procesan casi al mismo tiempo (dos personas, dos pestañas, un doble clic),
-- las dos parten del mismo número leído y ninguna sabe de la otra — se puede
-- vender el último par dos veces, o dejar el stock en negativo.
--
-- Acá el UPDATE resta y valida en un solo paso (`WHERE cantidad >= cantidad`,
-- chequeando cuántas filas afectó), así que no hay ventana entre "leer" y
-- "escribir" donde otra operación se pueda colar.
--
-- De paso, "no se puede vender sin caja abierta" y "hay que haber fichado"
-- eran hasta ahora solo una condición de React (puedeVender, en App.tsx) que
-- se esquiva llamando derecho a la API. Estas funciones repiten la misma
-- regla adentro, pero calcada de puedeVender: SOLO un empleado con nombre
-- (empleado_id no nulo) necesita caja abierta y su propio fichaje. El dueño y
-- "Atención al público" venden siempre con empleado_id NULL, y la app nunca
-- les exigió ninguna de las dos cosas — esto no le suma una regla nueva a
-- ese camino, solo blinda la que ya existía para empleados.

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

    -- modelo_id y talle_arg salen del talle, no de lo que mande el cliente:
    -- así no hay forma de que un talle_id de un modelo llegue con el
    -- modelo_id de otro.
    SELECT m.id, m.precio_costo, m.precio_venta, m.precio_promocional, m.precio_efectivo, t.talle_arg
      INTO v_modelo_id, v_precio_costo, v_precio_venta_lista, v_precio_promocional, v_precio_efectivo, v_talle_arg
    FROM modelo_talles t
    JOIN modelos m ON m.id = t.modelo_id
    WHERE t.id = v_talle_id;

    IF v_modelo_id IS NULL THEN
      RAISE EXCEPTION 'No encontramos uno de los productos del carrito';
    END IF;

    UPDATE modelo_talles
    SET cantidad = cantidad - v_cantidad
    WHERE id = v_talle_id AND cantidad >= v_cantidad;
    GET DIAGNOSTICS v_afectadas = ROW_COUNT;

    IF v_afectadas = 0 THEN
      RAISE EXCEPTION 'No hay stock suficiente (talle %)', v_talle_arg;
    END IF;

    -- Misma fórmula que getPrecioReal / getPrecioConRecargo del cliente
    -- (src/utils/precios.ts) — se replica acá, no se reinventa.
    v_precio_real := COALESCE(v_precio_efectivo, v_precio_promocional, v_precio_venta_lista);
    v_precio_base := COALESCE(v_precio_manual, v_precio_real);

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

    -- Una fila por unidad vendida, igual que el Array.from(...) del cliente.
    FOR i IN 1..v_cantidad LOOP
      INSERT INTO ventas (
        modelo_id, talle_arg, precio_venta, medio_pago, recargo_tarjeta, ganancia,
        cliente_id, venta_grupo_id, precio_tipo, descuento_pct_aplicado, precio_editado,
        tarjeta, cuotas, empleado_id,
        monto_efectivo, monto_transferencia, monto_recibido_efectivo, vuelto_efectivo
      ) VALUES (
        v_modelo_id, v_talle_arg, v_precio_final, p_medio_pago, v_recargo, v_precio_final - v_precio_costo,
        p_cliente_id, v_venta_grupo_id,
        CASE WHEN v_es_promo THEN 'promocional' ELSE 'lista' END, v_descuento_pct, v_precio_manual IS NOT NULL,
        CASE WHEN v_es_tarjeta THEN p_tarjeta ELSE NULL END, CASE WHEN v_es_tarjeta THEN p_cuotas ELSE NULL END, p_empleado_id,
        CASE WHEN v_es_mixto THEN p_monto_efectivo ELSE NULL END,
        CASE WHEN v_es_mixto THEN p_monto_transferencia ELSE NULL END,
        CASE WHEN v_es_efectivo OR v_es_mixto THEN p_monto_recibido_efectivo ELSE NULL END,
        CASE WHEN v_es_efectivo OR v_es_mixto THEN p_vuelto_efectivo ELSE NULL END
      );
    END LOOP;
  END LOOP;

  RETURN v_venta_grupo_id;
END;
$$;

GRANT EXECUTE ON FUNCTION registrar_venta_carrito(
  jsonb, text, uuid, text, integer, numeric, uuid, numeric, numeric, numeric, numeric
) TO anon, authenticated;


-- Misma idea que arriba, para devoluciones y cambios: hoy no tenían NINGÚN
-- chequeo de caja/fichaje (ni siquiera en la pantalla), y el ajuste de stock
-- tenía la misma condición de carrera. Se suma acá la misma regla que en
-- registrar_venta_carrito — devolver o cambiar mercadería mueve stock y a
-- veces plata, es la misma categoría de operación que vender.
CREATE OR REPLACE FUNCTION registrar_devolucion_cambio(
  p_tipo text,
  p_venta_id uuid,
  p_talle_id_original uuid,
  p_cantidad integer,
  p_talle_id_nuevo uuid,
  p_monto_diferencia numeric,
  p_medio_pago_diferencia text,
  p_motivo text,
  p_empleado_id uuid
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

  -- Vuelve al stock: siempre suma, no necesita tope.
  UPDATE modelo_talles SET cantidad = cantidad + p_cantidad WHERE id = p_talle_id_original;

  IF p_tipo = 'cambio' THEN
    SELECT t.modelo_id, t.talle_arg INTO v_modelo_id_nuevo, v_talle_arg_nuevo
    FROM modelo_talles t WHERE t.id = p_talle_id_nuevo;

    IF v_modelo_id_nuevo IS NULL THEN
      RAISE EXCEPTION 'El talle nuevo ya no existe';
    END IF;

    -- Mismo UPDATE atómico que al vender.
    UPDATE modelo_talles
    SET cantidad = cantidad - p_cantidad
    WHERE id = p_talle_id_nuevo AND cantidad >= p_cantidad;
    GET DIAGNOSTICS v_afectadas = ROW_COUNT;

    IF v_afectadas = 0 THEN
      RAISE EXCEPTION 'No hay stock suficiente del talle nuevo';
    END IF;
  END IF;

  INSERT INTO devoluciones_cambios (
    tipo, venta_id, modelo_id_original, talle_arg_original, cantidad,
    modelo_id_nuevo, talle_arg_nuevo, monto_diferencia, medio_pago_diferencia,
    motivo, empleado_id
  ) VALUES (
    p_tipo, p_venta_id, v_modelo_id_original, v_talle_arg_original, p_cantidad,
    CASE WHEN p_tipo = 'cambio' THEN v_modelo_id_nuevo ELSE NULL END,
    CASE WHEN p_tipo = 'cambio' THEN v_talle_arg_nuevo ELSE NULL END,
    p_monto_diferencia,
    CASE WHEN p_monto_diferencia <> 0 THEN p_medio_pago_diferencia ELSE NULL END,
    v_motivo, p_empleado_id
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION registrar_devolucion_cambio(
  text, uuid, uuid, integer, uuid, numeric, text, text, uuid
) TO anon, authenticated;

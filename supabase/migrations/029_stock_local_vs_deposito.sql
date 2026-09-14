-- Stock del local físico vs. depósito.
--
-- Hasta ahora "cantidad" es un solo número: todo lo que hay del talle,
-- esté en el mostrador o guardado en el depósito. Eso alcanza para vender
-- (importa cuánto queda en total) y para TiendaNube (que también vende
-- sobre el total), pero no le dice a nadie en el local si ese par está a
-- mano o si hay que ir a buscarlo.
--
-- cantidad_local guarda cuánto de ese total está físicamente en el local
-- ahora mismo. El depósito no es una columna propia — es la resta
-- (cantidad - cantidad_local) — así que no hay dos números que puedan
-- desincronizarse entre sí.
--
-- A propósito NO lleva un CHECK que obligue cantidad_local <= cantidad:
-- todo lo que ya tocaba "cantidad" antes de hoy (bulkUpdateStockTalles,
-- los ingresos de mercadería nueva, el ajuste desde TiendaNube) lo sigue
-- haciendo exactamente igual, sin saber que cantidad_local existe. Un
-- CHECK duro rompería cualquiera de esos caminos el día que alguien fije
-- el total por debajo de lo que hay marcado como "en el local". La UI
-- muestra el depósito como GREATEST(0, cantidad - cantidad_local) así que
-- nunca se ve un número negativo aunque los dos queden momentáneamente
-- desalineados.
--
-- Vender sigue chequeando y descontando "cantidad" (el total) exactamente
-- como antes — cantidad_local se descuenta de paso, sin bloquear nada, y
-- sin bajar de 0. Si bloqueara la venta, el día que se active esto con
-- cantidad_local en 0 en todos los talles existentes, se frena TODA venta
-- hasta cargar el stock local par por par — cantidad_local es información
-- para reponer el local, no una condición para vender.
ALTER TABLE modelo_talles ADD COLUMN IF NOT EXISTS cantidad_local integer NOT NULL DEFAULT 0;

-- Igual que registrar_venta_carrito (028), con el descuento de
-- cantidad_local sumado al mismo UPDATE atómico.
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

    SELECT m.id, m.precio_costo, m.precio_venta, m.precio_promocional, m.precio_efectivo, t.talle_arg
      INTO v_modelo_id, v_precio_costo, v_precio_venta_lista, v_precio_promocional, v_precio_efectivo, v_talle_arg
    FROM modelo_talles t
    JOIN modelos m ON m.id = t.modelo_id
    WHERE t.id = v_talle_id;

    IF v_modelo_id IS NULL THEN
      RAISE EXCEPTION 'No encontramos uno de los productos del carrito';
    END IF;

    -- El chequeo de stock sigue siendo sobre el total (cantidad), no sobre
    -- lo que hay en el local — ver el comentario al principio del archivo.
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

-- Igual que registrar_devolucion_cambio (028): la unidad que vuelve entra
-- físicamente al local (el cliente la trajo al mostrador), así que también
-- suma a cantidad_local. La del cambio que sale se descuenta de los dos,
-- igual que al vender.
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

  UPDATE modelo_talles
  SET cantidad = cantidad + p_cantidad,
      cantidad_local = cantidad_local + p_cantidad
  WHERE id = p_talle_id_original;

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

-- Mueve pares del depósito al local ("reponer el mostrador"). Nunca deja
-- mover más de lo que hay en depósito (cantidad - cantidad_local) — el
-- FOR UPDATE evita que dos reposiciones del mismo talle al mismo tiempo
-- lean el mismo disponible y entre las dos muevan de más.
CREATE OR REPLACE FUNCTION reponer_stock_local(p_talle_id uuid, p_cantidad integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cantidad integer;
  v_cantidad_local integer;
  v_disponible_deposito integer;
  v_nuevo_local integer;
BEGIN
  IF p_cantidad IS NULL OR p_cantidad < 1 THEN
    RAISE EXCEPTION 'Cantidad inválida';
  END IF;

  SELECT cantidad, cantidad_local INTO v_cantidad, v_cantidad_local
  FROM modelo_talles WHERE id = p_talle_id
  FOR UPDATE;

  IF v_cantidad IS NULL THEN
    RAISE EXCEPTION 'Talle no encontrado';
  END IF;

  v_disponible_deposito := GREATEST(0, v_cantidad - v_cantidad_local);

  IF p_cantidad > v_disponible_deposito THEN
    RAISE EXCEPTION 'Solo quedan % pares en el depósito para este talle', v_disponible_deposito;
  END IF;

  UPDATE modelo_talles
  SET cantidad_local = cantidad_local + p_cantidad
  WHERE id = p_talle_id
  RETURNING cantidad_local INTO v_nuevo_local;

  RETURN v_nuevo_local;
END;
$$;

GRANT EXECUTE ON FUNCTION reponer_stock_local(uuid, integer) TO anon, authenticated;

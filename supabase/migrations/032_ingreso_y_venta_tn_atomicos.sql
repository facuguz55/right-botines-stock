-- Dos condiciones de carrera que quedaron afuera de 028_venta_y_devolucion_atomicas.sql:
--
-- 1) Ingreso de mercadería (addIngreso/addIngresoBatch): igual que la venta
--    antes de esa migración, leía `cantidad` del talle en el navegador y
--    mandaba un UPDATE con la suma ya hecha. Dos ingresos del mismo talle
--    casi al mismo tiempo (o un ingreso mientras se está vendiendo ese
--    talle) pueden pisarse y perder stock — y el registro en `ingresos`
--    (auditoría/costo) se insertaba en un paso aparte, así que si ese
--    insert fallaba quedaba el stock ajustado sin ningún rastro de por qué.
--
-- 2) Venta por TiendaNube (api/tn-webhook.ts, descontarStockPorOrden): el
--    chequeo de "ya procesada" miraba solo `tn_order_id` (el pedido
--    completo), no cada línea de producto. Un pedido con dos productos
--    donde la primera línea se procesa bien y la segunda falla (o el
--    webhook se reintenta a mitad de camino) hace que el reintento vea "ya
--    existe una venta con este tn_order_id" y descarte el pedido entero,
--    dejando la segunda línea sin procesar para siempre. Además el
--    descuento de stock ahí también era leer-en-cliente-y-escribir, mismo
--    riesgo de vender lo mismo dos veces si el webhook se dispara dos
--    veces en paralelo (Meta/TN sí reintenta webhooks que no responden 200
--    a tiempo).

-- ── 1) Ingreso de mercadería atómico ─────────────────────────────────────

CREATE OR REPLACE FUNCTION registrar_ingreso_stock(
  p_modelo_id uuid,
  p_items jsonb, -- [{talle_id: uuid|null, talle_arg: numeric, talle_us: numeric, cantidad_delta: integer, stock_minimo: integer}]
  p_costo_total numeric
)
RETURNS jsonb -- [{talle_arg, talle_id}] — el talle_id real de cada talle nuevo creado
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
  v_talle_id uuid;
  v_talle_arg numeric;
  v_talle_us numeric;
  v_cantidad_delta integer;
  v_stock_minimo integer;
  v_total_cantidad integer := 0;
  v_ref_talle_arg numeric;
  v_afectadas integer;
  v_resultado jsonb := '[]'::jsonb;
BEGIN
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'No hay talles para ingresar';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM modelos WHERE id = p_modelo_id) THEN
    RAISE EXCEPTION 'El producto ya no existe';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_talle_id := NULLIF(v_item->>'talle_id', '')::uuid;
    v_talle_arg := (v_item->>'talle_arg')::numeric;
    v_talle_us := (v_item->>'talle_us')::numeric;
    v_cantidad_delta := (v_item->>'cantidad_delta')::integer;
    v_stock_minimo := COALESCE(NULLIF(v_item->>'stock_minimo', '')::integer, 1);

    IF v_cantidad_delta IS NULL OR v_cantidad_delta = 0 THEN
      CONTINUE;
    END IF;

    IF v_ref_talle_arg IS NULL THEN
      v_ref_talle_arg := v_talle_arg;
    END IF;

    IF v_talle_id IS NOT NULL THEN
      -- Suma sobre lo que haya EN ESE MOMENTO en la base, no sobre un
      -- número leído antes en el navegador — así dos ingresos (o un
      -- ingreso y una venta) del mismo talle no se pisan.
      UPDATE modelo_talles
      SET cantidad = cantidad + v_cantidad_delta
      WHERE id = v_talle_id AND modelo_id = p_modelo_id;
      GET DIAGNOSTICS v_afectadas = ROW_COUNT;
      IF v_afectadas = 0 THEN
        RAISE EXCEPTION 'Uno de los talles ya no existe';
      END IF;
    ELSE
      INSERT INTO modelo_talles (modelo_id, talle_us, talle_arg, cantidad, stock_minimo)
      VALUES (p_modelo_id, v_talle_us, v_talle_arg, v_cantidad_delta, v_stock_minimo)
      RETURNING id INTO v_talle_id;
    END IF;

    v_total_cantidad := v_total_cantidad + v_cantidad_delta;
    v_resultado := v_resultado || jsonb_build_object('talle_arg', v_talle_arg, 'talle_id', v_talle_id);
  END LOOP;

  -- El registro de auditoría/costo vive en la MISMA transacción que el
  -- ajuste de stock: si algo de arriba falla, esto tampoco se inserta, y
  -- nunca queda un "ingreso" fantasma sin el stock correspondiente.
  IF v_total_cantidad > 0 THEN
    INSERT INTO ingresos (modelo_id, talle_arg, cantidad, costo_total)
    VALUES (p_modelo_id, v_ref_talle_arg, v_total_cantidad, p_costo_total);
  END IF;

  RETURN v_resultado;
END;
$$;

GRANT EXECUTE ON FUNCTION registrar_ingreso_stock(uuid, jsonb, numeric) TO anon, authenticated;


-- ── 2) Venta por TiendaNube atómica, idempotente por línea de producto ──

-- tn_order_id ya existía y sigue igual (varias líneas de un mismo pedido
-- comparten el mismo tn_order_id); esta columna nueva identifica la LÍNEA
-- puntual del pedido (item.id en la API de TN), única de verdad.
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS tn_order_line_id bigint;
CREATE UNIQUE INDEX IF NOT EXISTS idx_ventas_tn_order_line_id
  ON ventas (tn_order_line_id) WHERE tn_order_line_id IS NOT NULL;

CREATE OR REPLACE FUNCTION registrar_venta_tn(
  p_tn_order_id bigint,
  p_tn_order_line_id bigint,
  p_modelo_id uuid,
  p_talle_id uuid,
  p_talle_arg numeric,
  p_cantidad integer,
  p_precio_venta numeric,
  p_ganancia numeric
)
RETURNS boolean -- true si se registró ahora, false si esta línea ya estaba procesada
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted_id uuid;
BEGIN
  -- El INSERT con ON CONFLICT es lo que hace esto atómico de verdad: si dos
  -- invocaciones de la misma línea corren en paralelo (webhook reintentado
  -- por TN mientras el primero todavía no terminó), el índice único deja
  -- pasar una sola — no es una condición que se pueda perder por una
  -- carrera de milisegundos, la garantiza el motor de la base.
  INSERT INTO ventas (modelo_id, talle_arg, fecha, precio_venta, medio_pago, ganancia, tn_order_id, tn_order_line_id)
  VALUES (p_modelo_id, p_talle_arg, now(), p_precio_venta, 'TiendaNube', p_ganancia, p_tn_order_id, p_tn_order_line_id)
  ON CONFLICT (tn_order_line_id) WHERE tn_order_line_id IS NOT NULL DO NOTHING
  RETURNING id INTO v_inserted_id;

  IF v_inserted_id IS NULL THEN
    RETURN false; -- ya procesada: no se vuelve a tocar el stock
  END IF;

  UPDATE modelo_talles
  SET cantidad = GREATEST(0, cantidad - p_cantidad)
  WHERE id = p_talle_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION registrar_venta_tn(bigint, bigint, uuid, uuid, numeric, integer, numeric, numeric) TO anon, authenticated, service_role;

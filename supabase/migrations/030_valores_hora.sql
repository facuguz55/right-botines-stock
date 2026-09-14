-- Valor por hora de cada persona, con historial — y por qué esta tabla no
-- es la del esquema multi-tenant de nova-local (tienda_id / user_id contra
-- auth.users): este repo no tiene ninguna de las dos cosas. Es un solo
-- local, y nadie se autentica con Supabase Auth — "dueño" es un PIN
-- verificado server-side (verify_owner_pin / app_settings), no una fila ni
-- una sesión.
--
-- empleado_id sigue la misma convención que ya usan ventas.empleado_id y
-- caja_dias.abierta_por en este mismo repo: FK nullable a empleados, y
-- NULL significa el dueño (que nunca es una fila de empleados). No hay
-- tienda_id porque no hay más de un negocio.
--
-- vigente_desde es DATE por lo mismo que ya explicaba el pedido: un sueldo
-- se acuerda por día, no a una hora exacta.
CREATE TABLE IF NOT EXISTS valores_hora (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  empleado_id UUID REFERENCES empleados(id) ON DELETE CASCADE,
  valor_hora NUMERIC NOT NULL CHECK (valor_hora >= 0),
  vigente_desde DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Un UNIQUE(empleado_id, vigente_desde) normal no evita dos valores del
-- mismo día para el dueño: Postgres nunca considera dos NULL "iguales", así
-- que ese UNIQUE no vería duplicado. Dos índices parciales, uno para
-- empleados con nombre y otro para el caso NULL (el dueño, que por
-- definición es uno solo).
CREATE UNIQUE INDEX IF NOT EXISTS valores_hora_empleado_fecha_uq
  ON valores_hora (empleado_id, vigente_desde) WHERE empleado_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS valores_hora_dueno_fecha_uq
  ON valores_hora (vigente_desde) WHERE empleado_id IS NULL;

-- RLS habilitado y sin ninguna política para anon: a diferencia del resto
-- de las tablas de este repo (que son "allow_all" porque no hay sesión que
-- filtrar), esta no tiene ninguna vía de acceso directo. Todo pasa por las
-- funciones de abajo, que exigen el PIN del dueño — el único mecanismo de
-- este repo que de verdad ocurre en el servidor (igual que delete_venta).
-- Sin esto, "el empleado no ve los importes" sería otra vez solo una
-- pantalla que no los muestra, con el dato viajando igual en la respuesta.
ALTER TABLE valores_hora ENABLE ROW LEVEL SECURITY;

-- Asigna o corrige el valor por hora de una persona desde una fecha. Si ya
-- había un valor cargado para esa misma persona y fecha, lo reemplaza en
-- vez de duplicar (por eso el UPSERT contra los índices de arriba).
CREATE OR REPLACE FUNCTION asignar_valor_hora(
  pin_input TEXT,
  empleado_id_input UUID,
  valor_hora_input NUMERIC,
  vigente_desde_input DATE
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_settings WHERE id = 1 AND owner_pin = pin_input) THEN
    RETURN FALSE;
  END IF;

  IF valor_hora_input < 0 THEN
    RAISE EXCEPTION 'El valor por hora no puede ser negativo';
  END IF;
  IF vigente_desde_input IS NULL THEN
    RAISE EXCEPTION 'Falta la fecha desde la que rige';
  END IF;

  IF empleado_id_input IS NULL THEN
    INSERT INTO valores_hora (empleado_id, valor_hora, vigente_desde)
    VALUES (NULL, valor_hora_input, vigente_desde_input)
    ON CONFLICT (vigente_desde) WHERE empleado_id IS NULL
    DO UPDATE SET valor_hora = EXCLUDED.valor_hora;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM empleados WHERE id = empleado_id_input) THEN
      RAISE EXCEPTION 'Ese empleado no existe';
    END IF;
    INSERT INTO valores_hora (empleado_id, valor_hora, vigente_desde)
    VALUES (empleado_id_input, valor_hora_input, vigente_desde_input)
    ON CONFLICT (empleado_id, vigente_desde) WHERE empleado_id IS NOT NULL
    DO UPDATE SET valor_hora = EXCLUDED.valor_hora;
  END IF;

  RETURN TRUE;
END;
$$;

-- Trae el historial completo de valores por hora (de todas las personas) si
-- el PIN es correcto. Con un PIN incorrecto devuelve cero filas — no un
-- error que confirme "esto existe pero no podés verlo", directamente nada,
-- igual que pide el pedido original.
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
  IF NOT EXISTS (SELECT 1 FROM app_settings WHERE id = 1 AND owner_pin = pin_input) THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT v.id, v.empleado_id, v.valor_hora, v.vigente_desde, v.created_at
    FROM valores_hora v
    ORDER BY v.vigente_desde DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION asignar_valor_hora(TEXT, UUID, NUMERIC, DATE) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION fetch_valores_hora(TEXT) TO anon, authenticated;

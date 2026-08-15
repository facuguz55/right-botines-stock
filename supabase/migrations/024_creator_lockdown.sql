-- Bloqueo remoto de la app, solo para los creadores (right-botines-stock).
-- Permite apagar el acceso de todo el mundo (dueño y empleados incluidos)
-- sin tocar código ni depender de Vercel/Supabase dashboard.

CREATE TABLE IF NOT EXISTS app_lock (
  id SMALLINT PRIMARY KEY DEFAULT 1,
  locked BOOLEAN NOT NULL DEFAULT FALSE,
  mensaje TEXT NOT NULL DEFAULT 'La aplicación está temporalmente fuera de servicio.',
  creator_pin TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT app_lock_singleton CHECK (id = 1)
);

-- PIN inicial al azar (no queda "0000" por defecto expuesto en el repo).
-- Cambiarlo desde el panel apenas se despliega esta migración.
INSERT INTO app_lock (id, locked, creator_pin)
VALUES (1, FALSE, encode(gen_random_bytes(6), 'hex'))
ON CONFLICT (id) DO NOTHING;

-- RLS habilitado, sin políticas de SELECT/UPDATE directas: nadie lee
-- creator_pin ni puede togglear el lock sin pasar por las funciones de abajo.
ALTER TABLE app_lock ENABLE ROW LEVEL SECURITY;

-- Estado público del lock (sin exponer el pin). Lo consulta la app en cada
-- arranque para decidir si mostrar la pantalla de "app bloqueada".
CREATE OR REPLACE FUNCTION get_app_lock_status()
RETURNS TABLE(locked BOOLEAN, mensaje TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY SELECT app_lock.locked, app_lock.mensaje FROM app_lock WHERE id = 1;
END;
$$;

-- Verifica el pin de creador sin exponer su valor al cliente.
CREATE OR REPLACE FUNCTION verify_creator_pin(pin_input TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM app_lock WHERE id = 1 AND creator_pin = pin_input
  );
END;
$$;

-- Togglea el lock. Requiere el pin correcto en cada llamada (no alcanza con
-- haber entrado antes al panel), así que no depende únicamente del secreto
-- de la URL para estar protegido.
CREATE OR REPLACE FUNCTION set_app_lock(pin_input TEXT, new_locked BOOLEAN, new_mensaje TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_lock WHERE id = 1 AND creator_pin = pin_input) THEN
    RETURN FALSE;
  END IF;
  UPDATE app_lock
  SET locked = new_locked,
      mensaje = COALESCE(NULLIF(new_mensaje, ''), mensaje),
      updated_at = NOW()
  WHERE id = 1;
  RETURN TRUE;
END;
$$;

-- Cambia el pin de creador (requiere el pin actual).
CREATE OR REPLACE FUNCTION set_creator_pin(current_pin TEXT, new_pin TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF new_pin IS NULL OR length(new_pin) < 6 THEN
    RAISE EXCEPTION 'El pin de creador debe tener al menos 6 caracteres';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM app_lock WHERE id = 1 AND creator_pin = current_pin) THEN
    RETURN FALSE;
  END IF;
  UPDATE app_lock SET creator_pin = new_pin, updated_at = NOW() WHERE id = 1;
  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION get_app_lock_status() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION verify_creator_pin(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION set_app_lock(TEXT, BOOLEAN, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION set_creator_pin(TEXT, TEXT) TO anon, authenticated;

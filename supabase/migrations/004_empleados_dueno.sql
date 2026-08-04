-- Configuración de acceso (PIN del dueño)
CREATE TABLE IF NOT EXISTS app_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1,
  owner_pin TEXT NOT NULL DEFAULT '0000',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT app_settings_singleton CHECK (id = 1)
);

INSERT INTO app_settings (id, owner_pin) VALUES (1, '0000')
ON CONFLICT (id) DO NOTHING;

-- RLS habilitado, sin políticas: nadie puede leer/escribir owner_pin directo con la anon key
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- Verifica el PIN sin exponer su valor al cliente
CREATE OR REPLACE FUNCTION verify_owner_pin(pin_input TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM app_settings WHERE id = 1 AND owner_pin = pin_input
  );
END;
$$;

-- Cambia el PIN (validando formato de 4 dígitos)
CREATE OR REPLACE FUNCTION set_owner_pin(new_pin TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF new_pin !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'El PIN debe tener exactamente 4 dígitos';
  END IF;
  UPDATE app_settings SET owner_pin = new_pin, updated_at = NOW() WHERE id = 1;
END;
$$;

GRANT EXECUTE ON FUNCTION verify_owner_pin(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION set_owner_pin(TEXT) TO anon, authenticated;

-- Registro de intentos fallidos de acceso como dueño (para alertar en el panel)
CREATE TABLE IF NOT EXISTS intentos_acceso_fallidos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  fecha TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  visto BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_intentos_fallidos_visto ON intentos_acceso_fallidos(visto);

ALTER TABLE intentos_acceso_fallidos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_intentos_acceso_fallidos" ON intentos_acceso_fallidos
  FOR ALL TO anon USING (true) WITH CHECK (true);

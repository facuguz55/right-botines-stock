-- Hora límite para el auto-cierre de fichajes que quedaron abiertos de un
-- día anterior (alguien se olvidó de hacer logout). Singleton editable
-- desde Empleados, igual patrón que app_settings pero sin RLS restrictiva
-- porque no es sensible.
CREATE TABLE IF NOT EXISTS configuracion_fichajes (
  id smallint PRIMARY KEY DEFAULT 1,
  hora_limite_cierre time NOT NULL DEFAULT '20:00',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT configuracion_fichajes_singleton CHECK (id = 1)
);

INSERT INTO configuracion_fichajes (id, hora_limite_cierre) VALUES (1, '20:00')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE configuracion_fichajes ENABLE ROW LEVEL SECURITY;
CREATE POLICY allow_all ON configuracion_fichajes FOR ALL TO anon USING (true) WITH CHECK (true);

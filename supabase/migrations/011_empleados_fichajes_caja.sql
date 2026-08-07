-- Empleados del local (identidad simple para fichaje y trazabilidad, sin PIN individual)
CREATE TABLE IF NOT EXISTS empleados (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre text NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE empleados ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON empleados;
CREATE POLICY allow_all ON empleados FOR ALL TO anon USING (true) WITH CHECK (true);

-- Fichajes: entrada/salida de cada empleado. hora_salida NULL = turno en curso.
CREATE TABLE IF NOT EXISTS fichajes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  empleado_id uuid NOT NULL REFERENCES empleados(id),
  hora_entrada timestamptz NOT NULL DEFAULT now(),
  hora_salida timestamptz,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fichajes_empleado ON fichajes(empleado_id);
CREATE INDEX IF NOT EXISTS idx_fichajes_abiertos ON fichajes(empleado_id) WHERE hora_salida IS NULL;
ALTER TABLE fichajes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON fichajes;
CREATE POLICY allow_all ON fichajes FOR ALL TO anon USING (true) WITH CHECK (true);

-- Caja compartida por día natural: se abre una vez a la mañana, se cierra una vez al final del día.
CREATE TABLE IF NOT EXISTS caja_dias (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  fecha date NOT NULL UNIQUE,
  monto_apertura numeric NOT NULL DEFAULT 0,
  abierta_por uuid REFERENCES empleados(id),
  abierta_at timestamptz,
  estado text NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta', 'cerrada')),
  monto_cierre_contado numeric,
  monto_esperado_snapshot numeric,
  diferencia numeric,
  cerrada_por uuid REFERENCES empleados(id),
  cerrada_at timestamptz,
  notas text,
  created_at timestamptz DEFAULT now()
);
-- Evita dos cajas abiertas a la vez (constraint a nivel DB, no solo en la capa de servicio).
CREATE UNIQUE INDEX IF NOT EXISTS idx_caja_dias_unica_abierta ON caja_dias (estado) WHERE estado = 'abierta';
ALTER TABLE caja_dias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON caja_dias;
CREATE POLICY allow_all ON caja_dias FOR ALL TO anon USING (true) WITH CHECK (true);

-- Vínculo venta ↔ empleado (nullable: ventas históricas no lo tienen).
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS empleado_id uuid REFERENCES empleados(id);
CREATE INDEX IF NOT EXISTS idx_ventas_empleado ON ventas(empleado_id);

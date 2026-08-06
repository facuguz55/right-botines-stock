-- Costos configurables recurrentes: fijos mensuales y variables por venta.
CREATE TABLE IF NOT EXISTS costos_config (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('fijo_mensual','variable_venta')),
  canal text NOT NULL DEFAULT 'ambos' CHECK (canal IN ('local','web','ambos')),
  modo_valor text NOT NULL DEFAULT 'monto' CHECK (modo_valor IN ('monto','porcentaje')),
  valor numeric NOT NULL DEFAULT 0,
  categoria text,                          -- 'alquiler'|'sueldos'|'servicios'|'comision_pago'|'comision_tn'|'envio'|'otro', libre, solo agrupa en UI
  activo boolean NOT NULL DEFAULT true,
  vigente_desde date NOT NULL DEFAULT current_date,
  vigente_hasta date,                      -- null = sigue vigente
  prorateo_web_pct numeric,                -- 0-100, solo aplica si canal='ambos'; null = prorratea por facturación del período
  notas text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_costos_config_activo ON costos_config (activo, tipo);
ALTER TABLE costos_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON costos_config;
CREATE POLICY allow_all ON costos_config FOR ALL TO anon USING (true) WITH CHECK (true);

-- Costos únicos / eventuales: gastos puntuales no recurrentes (reparaciones, compras puntuales, etc).
-- Ledger append-only (como `ventas`), no una config con on/off.
CREATE TABLE IF NOT EXISTS costos_unicos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre text NOT NULL,
  canal text NOT NULL DEFAULT 'ambos' CHECK (canal IN ('local','web','ambos')),
  monto numeric NOT NULL DEFAULT 0,
  categoria text,
  fecha date NOT NULL DEFAULT current_date,
  notas text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_costos_unicos_fecha ON costos_unicos (fecha DESC);
ALTER TABLE costos_unicos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON costos_unicos;
CREATE POLICY allow_all ON costos_unicos FOR ALL TO anon USING (true) WITH CHECK (true);

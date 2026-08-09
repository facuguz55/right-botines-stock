-- Gastos/retiros de efectivo de caja durante el día (ej. compra de insumos,
-- viáticos, etc). Se descuentan del efectivo esperado al cerrar la caja.
CREATE TABLE IF NOT EXISTS caja_gastos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  caja_dia_id uuid NOT NULL REFERENCES caja_dias(id),
  monto numeric NOT NULL CHECK (monto > 0),
  motivo text NOT NULL,
  empleado_id uuid REFERENCES empleados(id),
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_caja_gastos_caja ON caja_gastos(caja_dia_id);
ALTER TABLE caja_gastos ENABLE ROW LEVEL SECURITY;
CREATE POLICY allow_all ON caja_gastos FOR ALL TO anon USING (true) WITH CHECK (true);

-- Snapshot del total de gastos al momento del cierre, igual que
-- monto_esperado_snapshot, para que el historial no cambie si después se
-- edita/borra un gasto retroactivamente.
ALTER TABLE caja_dias ADD COLUMN IF NOT EXISTS total_gastos_snapshot numeric;

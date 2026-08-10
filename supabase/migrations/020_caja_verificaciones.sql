-- Registro de "declaraciones" de efectivo cuando un empleado ficha salida
-- pero todavía queda otro empleado trabajando (la caja sigue abierta y solo
-- el último la cierra de verdad). Sirve como checkpoint para que el dueño
-- pueda comparar después quién dijo qué monto en cada momento del día —
-- no afecta el cierre real de la caja (caja_dias.diferencia).
CREATE TABLE IF NOT EXISTS caja_verificaciones (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  caja_dia_id uuid NOT NULL REFERENCES caja_dias(id),
  empleado_id uuid REFERENCES empleados(id),
  monto_declarado numeric NOT NULL,
  monto_esperado_en_momento numeric NOT NULL,
  diferencia numeric NOT NULL,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_caja_verificaciones_caja ON caja_verificaciones(caja_dia_id);
ALTER TABLE caja_verificaciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY allow_all ON caja_verificaciones FOR ALL TO anon USING (true) WITH CHECK (true);

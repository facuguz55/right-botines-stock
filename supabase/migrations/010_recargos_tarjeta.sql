-- Recargos configurables por tarjeta + cantidad de cuotas, para el local
-- físico (posnet). El % de recargo real varía por tarjeta y cuotas según el
-- contrato del comerciante — no hay forma de detectarlo automáticamente
-- (a diferencia del descuento por transferencia de TiendaNube, acá no hay
-- ningún dato externo del que inferirlo), así que se carga a mano.
CREATE TABLE IF NOT EXISTS recargos_tarjeta (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tarjeta text NOT NULL,
  cuotas integer NOT NULL,
  porcentaje numeric NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE (tarjeta, cuotas)
);
ALTER TABLE recargos_tarjeta ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON recargos_tarjeta;
CREATE POLICY allow_all ON recargos_tarjeta FOR ALL TO anon USING (true) WITH CHECK (true);

-- Auditoría: qué tarjeta/cuotas eligió el vendedor en cada venta con recargo.
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS tarjeta text;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS cuotas integer;

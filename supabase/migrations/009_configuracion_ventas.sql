-- Config global: % de descuento por transferencia que TiendaNube ya aplica
-- en el checkout (confirmado contra tn_ordenes: 100% de las órdenes con
-- payment_method='custom' traen el mismo % fijo de descuento sobre subtotal,
-- 0% en el resto). No es un campo por producto — se usa para calcular el
-- "precio promocional" al vender en el local físico.
CREATE TABLE IF NOT EXISTS configuracion_ventas (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  descuento_transferencia_pct numeric,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO configuracion_ventas (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
ALTER TABLE configuracion_ventas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON configuracion_ventas;
CREATE POLICY allow_all ON configuracion_ventas FOR ALL TO anon USING (true) WITH CHECK (true);

-- Auditoría de la venta: qué precio base eligió el vendedor y con qué % vigente,
-- para poder reconstruir el cálculo si el % configurado cambia más adelante.
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS precio_tipo text CHECK (precio_tipo IN ('lista', 'promocional'));
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS descuento_pct_aplicado numeric;

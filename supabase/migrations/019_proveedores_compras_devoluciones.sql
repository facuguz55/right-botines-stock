-- Proveedores
CREATE TABLE IF NOT EXISTS proveedores (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre text NOT NULL,
  contacto text,
  telefono text,
  notas text,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE proveedores ENABLE ROW LEVEL SECURITY;
CREATE POLICY allow_all ON proveedores FOR ALL TO anon USING (true) WITH CHECK (true);

-- Compras: una entrega/remito de un proveedor
CREATE TABLE IF NOT EXISTS compras (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  proveedor_id uuid NOT NULL REFERENCES proveedores(id),
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  numero_remito text,
  total numeric NOT NULL DEFAULT 0,
  notas text,
  empleado_id uuid REFERENCES empleados(id),
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_compras_proveedor ON compras(proveedor_id);
ALTER TABLE compras ENABLE ROW LEVEL SECURITY;
CREATE POLICY allow_all ON compras FOR ALL TO anon USING (true) WITH CHECK (true);

-- Ítems de una compra (vínculo a modelo opcional: puede ser mercadería aún no cargada como modelo)
CREATE TABLE IF NOT EXISTS compra_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  compra_id uuid NOT NULL REFERENCES compras(id) ON DELETE CASCADE,
  modelo_id uuid REFERENCES modelos(id),
  descripcion text NOT NULL,
  talle_arg numeric,
  cantidad integer NOT NULL DEFAULT 1,
  costo_unitario numeric NOT NULL DEFAULT 0,
  subtotal numeric NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_compra_items_compra ON compra_items(compra_id);
ALTER TABLE compra_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY allow_all ON compra_items FOR ALL TO anon USING (true) WITH CHECK (true);

-- Pagos parciales contra una compra (saldo = compras.total - sum(compra_pagos.monto), calculado, no guardado)
CREATE TABLE IF NOT EXISTS compra_pagos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  compra_id uuid NOT NULL REFERENCES compras(id) ON DELETE CASCADE,
  monto numeric NOT NULL,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  notas text,
  empleado_id uuid REFERENCES empleados(id),
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_compra_pagos_compra ON compra_pagos(compra_id);
ALTER TABLE compra_pagos ENABLE ROW LEVEL SECURITY;
CREATE POLICY allow_all ON compra_pagos FOR ALL TO anon USING (true) WITH CHECK (true);

-- Devoluciones y cambios
CREATE TABLE IF NOT EXISTS devoluciones_cambios (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo text NOT NULL CHECK (tipo IN ('devolucion','cambio')),
  venta_id uuid REFERENCES ventas(id),
  modelo_id_original uuid REFERENCES modelos(id),
  talle_arg_original numeric,
  cantidad integer NOT NULL DEFAULT 1,
  modelo_id_nuevo uuid REFERENCES modelos(id),
  talle_arg_nuevo numeric,
  monto_diferencia numeric NOT NULL DEFAULT 0,
  medio_pago_diferencia text,
  motivo text NOT NULL,
  empleado_id uuid REFERENCES empleados(id),
  fecha timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_devcambios_fecha ON devoluciones_cambios(fecha);
ALTER TABLE devoluciones_cambios ENABLE ROW LEVEL SECURITY;
CREATE POLICY allow_all ON devoluciones_cambios FOR ALL TO anon USING (true) WITH CHECK (true);

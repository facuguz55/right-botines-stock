-- Clientes del local físico
CREATE TABLE clientes_locales (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT NOT NULL,
  telefono TEXT,
  email TEXT,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_clientes_locales_telefono ON clientes_locales(telefono);
CREATE INDEX idx_clientes_locales_email ON clientes_locales(email);

ALTER TABLE clientes_locales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_clientes_locales" ON clientes_locales FOR ALL TO anon USING (true) WITH CHECK (true);

-- Vincular ventas a un cliente y agrupar ventas de un mismo carrito/ticket
ALTER TABLE ventas ADD COLUMN cliente_id UUID REFERENCES clientes_locales(id) ON DELETE SET NULL;
ALTER TABLE ventas ADD COLUMN venta_grupo_id UUID DEFAULT gen_random_uuid();

CREATE INDEX idx_ventas_cliente ON ventas(cliente_id);
CREATE INDEX idx_ventas_grupo ON ventas(venta_grupo_id);

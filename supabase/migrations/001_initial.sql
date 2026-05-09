-- Tabla productos
CREATE TABLE IF NOT EXISTS productos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  modelo TEXT NOT NULL,
  marca TEXT NOT NULL,
  talle_us NUMERIC NOT NULL,
  talle_arg NUMERIC NOT NULL,
  color TEXT NOT NULL DEFAULT 'Sin especificar',
  cantidad INTEGER NOT NULL DEFAULT 0,
  precio_costo NUMERIC NOT NULL DEFAULT 0,
  precio_venta NUMERIC NOT NULL DEFAULT 0,
  codigo_ref TEXT UNIQUE NOT NULL,
  foto_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla ventas
CREATE TABLE IF NOT EXISTS ventas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  producto_id UUID REFERENCES productos(id) ON DELETE SET NULL,
  fecha TIMESTAMPTZ DEFAULT NOW(),
  precio_venta NUMERIC NOT NULL,
  ganancia NUMERIC NOT NULL DEFAULT 0
);

-- Tabla ingresos
CREATE TABLE IF NOT EXISTS ingresos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  producto_id UUID REFERENCES productos(id) ON DELETE SET NULL,
  fecha TIMESTAMPTZ DEFAULT NOW(),
  cantidad INTEGER NOT NULL,
  costo_total NUMERIC NOT NULL DEFAULT 0
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_ventas_fecha ON ventas(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_ventas_producto ON ventas(producto_id);
CREATE INDEX IF NOT EXISTS idx_ingresos_producto ON ingresos(producto_id);
CREATE INDEX IF NOT EXISTS idx_productos_codigo ON productos(codigo_ref);

-- RLS
ALTER TABLE productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE ventas ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingresos ENABLE ROW LEVEL SECURITY;

-- Políticas permisivas para uso interno (sin login)
CREATE POLICY "allow_all_productos" ON productos FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_ventas" ON ventas FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_ingresos" ON ingresos FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS tn_ordenes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tn_order_id bigint UNIQUE NOT NULL,
  number integer,
  status text,
  payment_status text,
  shipping_status text,
  total numeric,
  subtotal numeric,
  total_shipping numeric,
  discount numeric,
  customer_tn_id bigint,
  customer_name text,
  customer_email text,
  payment_method text,
  payment_detail jsonb,
  coupon jsonb,
  note text,
  shipping_address jsonb,
  products jsonb,
  tn_created_at timestamptz,
  synced_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tn_ordenes_created ON tn_ordenes (tn_created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tn_ordenes_customer ON tn_ordenes (customer_tn_id);
ALTER TABLE tn_ordenes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON tn_ordenes;
CREATE POLICY allow_all ON tn_ordenes FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS tn_clientes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tn_customer_id bigint UNIQUE NOT NULL,
  name text,
  email text,
  phone text,
  total_spent numeric,
  orders_count integer,
  tn_created_at timestamptz,
  synced_at timestamptz DEFAULT now()
);
ALTER TABLE tn_clientes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON tn_clientes;
CREATE POLICY allow_all ON tn_clientes FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS tn_cupones (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tn_coupon_id bigint UNIQUE NOT NULL,
  code text,
  type text,
  value text,
  valid boolean,
  used_times integer,
  max_uses integer,
  valid_from timestamptz,
  valid_to timestamptz,
  tn_created_at timestamptz,
  synced_at timestamptz DEFAULT now()
);
ALTER TABLE tn_cupones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON tn_cupones;
CREATE POLICY allow_all ON tn_cupones FOR ALL TO anon USING (true) WITH CHECK (true);

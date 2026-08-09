-- Campo local para que el empleado marque una orden de TiendaNube como
-- preparada al armar el pedido en el local. No se sincroniza de vuelta a TN
-- (syncTNOrdenes/ordenRow no la tocan) — es puramente operativo interno.
ALTER TABLE tn_ordenes ADD COLUMN IF NOT EXISTS preparada boolean NOT NULL DEFAULT false;
ALTER TABLE tn_ordenes ADD COLUMN IF NOT EXISTS preparada_at timestamptz;
ALTER TABLE tn_ordenes ADD COLUMN IF NOT EXISTS preparada_por uuid REFERENCES empleados(id);

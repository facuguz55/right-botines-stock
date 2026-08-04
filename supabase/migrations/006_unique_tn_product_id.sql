-- Backstop contra duplicados: dos modelos locales no pueden apuntar al mismo
-- producto de TiendaNube. Ayuda a detectar (vía violación de constraint) una
-- carrera real entre dos webhooks concurrentes creando el mismo modelo.
CREATE UNIQUE INDEX IF NOT EXISTS uq_modelos_tn_product_id ON modelos (tn_product_id) WHERE tn_product_id IS NOT NULL;

ALTER TABLE modelos       ADD COLUMN IF NOT EXISTS tn_product_id  bigint;
ALTER TABLE modelos       ADD COLUMN IF NOT EXISTS tn_category_id bigint;
ALTER TABLE modelo_talles ADD COLUMN IF NOT EXISTS tn_variant_id  bigint;

CREATE INDEX IF NOT EXISTS idx_modelos_tn_product_id       ON modelos (tn_product_id);
CREATE INDEX IF NOT EXISTS idx_modelo_talles_tn_variant_id ON modelo_talles (tn_variant_id);

-- Backfill de modelos ya linkeados por la convención vieja codigo_base = 'tn_<id>'
UPDATE modelos
SET tn_product_id = substring(codigo_base from 4)::bigint
WHERE codigo_base LIKE 'tn\_%' ESCAPE '\'
  AND tn_product_id IS NULL
  AND substring(codigo_base from 4) ~ '^\d+$';

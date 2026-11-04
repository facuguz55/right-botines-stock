-- Pares de cada talle que están en el Deposito CABA de TiendaNube (proveedora
-- de Buenos Aires, solo envío). Están incluidos en `cantidad` (el total); en
-- el local hay cantidad - cantidad_ba. Lo escriben el webhook y el resync de
-- TiendaNube y la Edge Function tn-stock.
ALTER TABLE public.modelo_talles ADD COLUMN IF NOT EXISTS cantidad_ba int NOT NULL DEFAULT 0;
COMMENT ON COLUMN public.modelo_talles.cantidad_ba IS 'Pares de este talle en el Deposito CABA de TiendaNube (proveedora Bs As, solo envío). Incluidos en cantidad. Lo escriben el webhook/resync de TN y tn-stock.';

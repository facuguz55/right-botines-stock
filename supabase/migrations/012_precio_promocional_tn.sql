-- El precio "Promocional" de TiendaNube es un campo propio de cada producto
-- (variants[].promotional_price en la API), no un % fijo global — varía por
-- producto (confirmado contra el panel de TN: mismo producto con -8% en uno
-- y -10% en otro). Es el precio real que cobra el local (dato confirmado
-- por el dueño). Reemplaza el mecanismo anterior de configuracion_ventas
-- (descuento_transferencia_pct), que asumía incorrectamente un % fijo.
ALTER TABLE modelos ADD COLUMN IF NOT EXISTS precio_promocional numeric;

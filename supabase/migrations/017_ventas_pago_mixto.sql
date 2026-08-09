-- Pago mixto (parte efectivo + parte transferencia en la misma venta).
-- Se guardan en cada fila del venta_grupo_id (redundante entre filas del
-- mismo grupo, a propósito: al leer se dedupea por venta_grupo_id).
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS monto_efectivo numeric;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS monto_transferencia numeric;

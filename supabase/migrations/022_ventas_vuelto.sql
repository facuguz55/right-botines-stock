-- Vuelto entregado en ventas en efectivo (o en la porción en efectivo de un
-- pago mixto): cuánto entregó el cliente y cuánto vuelto se le dio.
-- No afecta el cálculo de efectivo esperado de la caja — precio_venta /
-- monto_efectivo ya reflejan el neto que queda en el cajón — se guarda
-- solo para trazabilidad y control del cajero al fichar salida.
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS monto_recibido_efectivo numeric;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS vuelto_efectivo numeric;

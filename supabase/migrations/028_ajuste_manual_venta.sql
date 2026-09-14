-- Permite registrar cuando se cobró un total distinto al de lista (ej. un
-- descuento negociado en efectivo). Separado de descuento_pct_aplicado
-- (que refleja el precio_promocional del producto) porque son dos motivos
-- de descuento independientes que pueden coexistir en la misma venta.
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS ajuste_manual_pct numeric;

-- El campo precio_promocional sincronizado desde TN (variants[].promotional_price)
-- resultó ser el precio CON TARJETA (confirmado por el dueño: coincide exacto
-- con la lista de precios efectivo→3 cuotas ya cargada en recargos_tarjeta,
-- ej. $105.000 efectivo -> $135.500 con tarjeta 3 cuotas). El precio real de
-- efectivo/transferencia del local se calcula dividiendo por ese mismo
-- recargo (Crédito, 3 cuotas, hoy 28.44%) en el momento del sync.
ALTER TABLE modelos ADD COLUMN IF NOT EXISTS precio_efectivo numeric;

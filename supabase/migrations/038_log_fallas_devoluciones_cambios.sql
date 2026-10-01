-- Cami reportó que ayer (30/9) una empleada intentó un cambio y "ni se
-- descontó ni se sumó nada" — revisando los datos reales se confirmó que
-- no es una corrupción parcial: no se guardó NINGÚN registro ese día pese a
-- que la tienda tuvo 13 ventas. registrar_devolucion_cambio es una sola
-- transacción atómica, así que si algo falla (sin caja abierta, sin
-- fichaje, stock insuficiente del talle nuevo, etc.) no queda nada a medio
-- hacer — pero tampoco queda ningún rastro de *qué* falló y *quién* lo
-- intentó, así que hay que inferirlo por ausencia de datos, como ahora.
--
-- Esta tabla guarda el mensaje de error real cada vez que el intento
-- rechaza, mismo patrón que `intentos_acceso_fallidos` (RLS allow-all, el
-- cliente inserta directo) para que la próxima vez se pueda ver la causa
-- exacta en vez de reconstruirla con fichajes/caja como ahora.

CREATE TABLE IF NOT EXISTS devoluciones_cambios_fallos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha timestamptz NOT NULL DEFAULT now(),
  empleado_id uuid REFERENCES empleados(id),
  mensaje text NOT NULL,
  visto boolean NOT NULL DEFAULT false
);

ALTER TABLE devoluciones_cambios_fallos ENABLE ROW LEVEL SECURITY;

CREATE POLICY allow_all_devoluciones_cambios_fallos ON devoluciones_cambios_fallos
  FOR ALL USING (true) WITH CHECK (true);

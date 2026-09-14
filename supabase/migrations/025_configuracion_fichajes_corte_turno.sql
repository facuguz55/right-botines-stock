-- Corte de turno (ej. mediodía): hasta ahora la caja solo cerraba de
-- verdad cuando el "último" fichaje abierto se cerraba manualmente. Si esa
-- persona se olvidaba de fichar salida, la caja seguía abierta hasta la
-- noche, mezclando en un solo cálculo la plata de la mañana y la tarde —
-- y si en el medio se retiraba efectivo (los dueños se llevan lo
-- recaudado), el arqueo de la noche daba mal sin que nadie hiciera nada
-- incorrecto.
--
-- Con esta hora configurada, tanto los fichajes de HOY que sigan abiertos
-- como la caja abierta se cortan solos apenas se pasa esa hora — sin pedir
-- que nadie cuente efectivo (el corte usa el monto calculado, diferencia
-- 0). Así el turno siguiente arranca con AperturaCajaGate pidiendo el
-- efectivo real que hay en ese momento, en vez de heredar el cálculo
-- acumulado de la mañana.
ALTER TABLE configuracion_fichajes
  ADD COLUMN IF NOT EXISTS hora_corte_turno time NULL DEFAULT '13:00';

-- Resultado del último envío de notificación a cada celular. Antes, si Apple o
-- Google rechazaban el envío (salvo 404/410, que borra la suscripción), no
-- quedaba rastro y no había forma de saber por qué a alguien no le llegaban.
ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS ultimo_envio_at timestamptz,
  ADD COLUMN IF NOT EXISTS ultimo_estado int,
  ADD COLUMN IF NOT EXISTS ultimo_error text;

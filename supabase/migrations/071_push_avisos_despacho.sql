-- Aviso de despachos de Bs As (api/logistica-push): solo a los celus que lo
-- activaron desde Órdenes → Depósito CABA (no a todos los del CRM).
ALTER TABLE public.push_subscriptions ADD COLUMN IF NOT EXISTS avisos_despacho boolean NOT NULL DEFAULT false;

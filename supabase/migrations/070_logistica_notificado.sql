-- Aviso al celu cuando la logística de Bs As despacha (api/logistica-push):
-- cada despacho se notifica una sola vez.
ALTER TABLE public.logistica_acciones ADD COLUMN IF NOT EXISTS notificado boolean NOT NULL DEFAULT false;

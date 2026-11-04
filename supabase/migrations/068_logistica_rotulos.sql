-- Rótulos del día (PDF de Andreani) que Right le sube a la logística de
-- Buenos Aires, en vez de mandarlos por WhatsApp. Los sube y los lista la
-- Edge Function logistica-ba (service_role); el bucket es privado y la
-- descarga es con link firmado.
INSERT INTO storage.buckets (id, name, public)
VALUES ('rotulos', 'rotulos', false)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.logistica_rotulos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  path text NOT NULL,
  nombre text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  descargado_at timestamptz
);
ALTER TABLE public.logistica_rotulos ENABLE ROW LEVEL SECURITY;

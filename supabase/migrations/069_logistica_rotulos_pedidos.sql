-- Cada PDF de rótulos se separa (en el navegador de quien lo sube) en un PDF
-- por pedido. Acá queda qué pedido y qué seguimiento trae cada uno.
CREATE TABLE IF NOT EXISTS public.logistica_rotulos_pedidos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rotulo_id uuid NOT NULL REFERENCES public.logistica_rotulos(id) ON DELETE CASCADE,
  orden_numero int NOT NULL,
  seguimiento text,
  path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS logistica_rotulos_pedidos_orden ON public.logistica_rotulos_pedidos (orden_numero, created_at DESC);
ALTER TABLE public.logistica_rotulos_pedidos ENABLE ROW LEVEL SECURITY;

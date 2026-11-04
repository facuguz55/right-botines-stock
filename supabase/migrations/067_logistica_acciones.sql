-- Registro de lo que se marca desde la vista de logística de Buenos Aires
-- (armado / despachado): quién (logística con PIN o Right desde la app),
-- cuándo y si TiendaNube lo aceptó. Lo escribe la Edge Function logistica-ba.
CREATE TABLE IF NOT EXISTS public.logistica_acciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_numero int NOT NULL,
  tn_order_id bigint NOT NULL,
  accion text NOT NULL,
  origen text NOT NULL,
  ok boolean NOT NULL,
  detalle text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.logistica_acciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY logistica_acciones_lectura ON public.logistica_acciones FOR SELECT USING (true);

-- Lo que aprende el bot: cada vez que una persona contesta a un cliente, queda la pregunta, lo que
-- sugirió el bot y lo que se mandó. Los dueños lo revisan y aprueban (o corrigen) la respuesta final;
-- las aprobadas se usan como guía para las próximas sugerencias.
create table if not exists public.crm_aprendizajes (
  id uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references public.wsp_conversaciones(id) on delete cascade,
  mensaje_cliente_id uuid not null unique references public.wsp_mensajes(id) on delete cascade,
  pregunta text not null,
  respuesta_bot text,
  respuesta_humano text,
  respuesta_aprobada text,
  origen text not null check (origen in ('usada', 'distinta', 'sin_sugerencia')),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aprobado', 'descartado')),
  revisado_en timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists crm_aprendizajes_estado_idx on public.crm_aprendizajes (estado, created_at desc);
alter table public.crm_aprendizajes enable row level security;
create policy crm_aprendizajes_all on public.crm_aprendizajes for all using (true) with check (true);

-- Ventas que el CRM detectó solo (comprobante + datos de envío).
alter table public.wsp_conversaciones add column if not exists venta_detectada_at timestamptz;
alter table public.wsp_conversaciones add column if not exists venta_detectada_motivo text;

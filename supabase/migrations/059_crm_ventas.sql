-- Una fila por cada venta que se concreta por WhatsApp (la detecta la IA o la
-- marca alguien a mano). Sirve para saber cuánto se vende por el CRM y cuánto
-- cierra el bot. wsp_conversaciones.venta_detectada_at queda con la última.
create table if not exists public.crm_ventas (
  id uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references public.wsp_conversaciones(id) on delete cascade,
  detectada_at timestamptz not null default now(),
  monto numeric,
  motivo text,
  -- 'ia': la detectó el CRM solo · 'manual': la marcó una persona
  origen text not null default 'ia' check (origen in ('ia', 'manual')),
  -- Quién la cerró: 'bot' si el bot contestó en esa charla (mensajes con automatico = 'bot'), si no 'humano'.
  atendio text not null default 'humano' check (atendio in ('bot', 'humano')),
  created_at timestamptz not null default now()
);
create index if not exists crm_ventas_fecha_idx on public.crm_ventas (detectada_at desc);
create index if not exists crm_ventas_conv_idx on public.crm_ventas (conversacion_id, detectada_at desc);
alter table public.crm_ventas enable row level security;
create policy crm_ventas_all on public.crm_ventas for all using (true) with check (true);

-- Las ventas que ya estaban marcadas.
insert into public.crm_ventas (conversacion_id, detectada_at, motivo, origen)
select id, venta_detectada_at, venta_detectada_motivo,
       case when venta_detectada_motivo = 'Marcada a mano' then 'manual' else 'ia' end
from public.wsp_conversaciones
where venta_detectada_at is not null
  and not exists (select 1 from public.crm_ventas v where v.conversacion_id = wsp_conversaciones.id);

insert into public.crm_ventas (conversacion_id, detectada_at, motivo, origen)
select id, coalesce(ultimo_mensaje_at, created_at), 'Marcada a mano', 'manual'
from public.wsp_conversaciones
where estado = 'Venta concretada' and venta_detectada_at is null
  and not exists (select 1 from public.crm_ventas v where v.conversacion_id = wsp_conversaciones.id);

-- CRM: etiquetas propias para clasificar chats. El equipo crea las que quiera
-- (nombre + color) y le pone varias a un mismo chat. Conviven con la categoría
-- fija que asigna la IA (wsp_conversaciones.categoria), no la reemplazan.

create table if not exists wsp_etiquetas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(trim(nombre)) > 0),
  color text not null default '#22D3EE',
  created_at timestamptz default now()
);
create unique index if not exists wsp_etiquetas_nombre_unico on wsp_etiquetas (lower(nombre));

create table if not exists wsp_conversacion_etiquetas (
  conversacion_id uuid not null references wsp_conversaciones(id) on delete cascade,
  etiqueta_id uuid not null references wsp_etiquetas(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (conversacion_id, etiqueta_id)
);
create index if not exists wsp_conv_etiquetas_etiqueta on wsp_conversacion_etiquetas (etiqueta_id);

-- Mismo criterio que el resto de las tablas wsp_ (políticas abiertas).
alter table wsp_etiquetas enable row level security;
alter table wsp_conversacion_etiquetas enable row level security;
create policy "wsp_etiquetas_all" on wsp_etiquetas for all using (true) with check (true);
create policy "wsp_conversacion_etiquetas_all" on wsp_conversacion_etiquetas for all using (true) with check (true);

-- Tiempo real: que lo que etiqueta una persona le aparezca a las demás.
alter publication supabase_realtime add table wsp_etiquetas;
alter publication supabase_realtime add table wsp_conversacion_etiquetas;

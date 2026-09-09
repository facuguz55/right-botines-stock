-- CRM de WhatsApp — tablas nuevas con prefijo wsp_/crm_
-- NO altera ni borra ninguna tabla existente del stock.

-- Clientes del CRM (pueden vincularse con clientes_locales por teléfono/DNI)
create table crm_clientes (
  id uuid primary key default gen_random_uuid(),
  wa_contact_id text not null unique,
  nombre text,
  telefono text,
  dni text,
  notas text,
  cliente_local_id uuid references clientes_locales(id) on delete set null,
  created_at timestamptz default now()
);

-- Conversaciones (un chat = un contacto de WhatsApp)
create table wsp_conversaciones (
  id uuid primary key default gen_random_uuid(),
  wa_contact_id text not null unique,
  crm_cliente_id uuid references crm_clientes(id) on delete set null,
  nombre text,
  telefono text,
  avatar_url text,
  categoria text default 'Normal'
    check (categoria in ('Urgente','Pedido de talles','Normal','Spam','Postventa/Reclamos','Mayorista')),
  estado text default 'Sin leer'
    check (estado in ('Sin leer','Respondido','Venta concretada','Cerrado')),
  asignado_a uuid references empleados(id) on delete set null,
  no_leidos int default 0,
  ultimo_mensaje text,
  ultimo_mensaje_at timestamptz default now(),
  created_at timestamptz default now()
);

create index wsp_conversaciones_ultimo on wsp_conversaciones(ultimo_mensaje_at desc);

-- Mensajes individuales
create table wsp_mensajes (
  id uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references wsp_conversaciones(id) on delete cascade,
  direccion text not null check (direccion in ('in','out')),
  tipo text not null default 'text'
    check (tipo in ('text','image','audio','video','document','sticker')),
  contenido text,
  transcripcion text,
  media_url text,
  wa_message_id text unique,
  enviado_por uuid references empleados(id) on delete set null,
  timestamp timestamptz default now()
);

create index wsp_mensajes_conv_ts on wsp_mensajes(conversacion_id, timestamp desc);

-- Sugerencias de la IA (clasificación + respuesta sugerida)
create table wsp_ia_sugerencias (
  id uuid primary key default gen_random_uuid(),
  mensaje_id uuid references wsp_mensajes(id) on delete cascade,
  conversacion_id uuid references wsp_conversaciones(id) on delete cascade,
  categoria_sugerida text,
  intencion text,
  tipo_detectado text,
  talle_detectado int,
  respuesta_sugerida text,
  usada boolean default false,
  created_at timestamptz default now()
);

-- Log de envíos de fotos de producto por el chat
create table wsp_envios_fotos (
  id uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references wsp_conversaciones(id) on delete cascade,
  modelo_id uuid references modelos(id) on delete set null,
  talle int,
  enviado_por uuid references empleados(id) on delete set null,
  created_at timestamptz default now()
);

-- Reclasificaciones manuales (auditoría para mejorar la IA)
create table wsp_reclasificaciones (
  id uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references wsp_conversaciones(id) on delete cascade,
  categoria_anterior text not null,
  categoria_nueva text not null,
  por uuid references empleados(id) on delete set null,
  created_at timestamptz default now()
);

-- RLS (mismo patrón que el stock: abierto para anon key, la app controla acceso vía roles en el cliente)
alter table crm_clientes enable row level security;
alter table wsp_conversaciones enable row level security;
alter table wsp_mensajes enable row level security;
alter table wsp_ia_sugerencias enable row level security;
alter table wsp_envios_fotos enable row level security;
alter table wsp_reclasificaciones enable row level security;

create policy "crm_clientes_all" on crm_clientes for all using (true) with check (true);
create policy "wsp_conversaciones_all" on wsp_conversaciones for all using (true) with check (true);
create policy "wsp_mensajes_all" on wsp_mensajes for all using (true) with check (true);
create policy "wsp_ia_sugerencias_all" on wsp_ia_sugerencias for all using (true) with check (true);
create policy "wsp_envios_fotos_all" on wsp_envios_fotos for all using (true) with check (true);
create policy "wsp_reclasificaciones_all" on wsp_reclasificaciones for all using (true) with check (true);

-- Realtime para que la bandeja se actualice sola
alter publication supabase_realtime add table wsp_conversaciones;
alter publication supabase_realtime add table wsp_mensajes;

-- Estado de la IA del bot (Anthropic), para que el CRM avise en pantalla cuando
-- deja de funcionar: el 04/11/2026 se terminó el saldo y durante horas el bot
-- sugirió "Hola buenas, contame en qué te puedo ayudar" en todos los chats sin
-- que nadie supiera por qué. Una sola fila (id = 1): la escribe el webhook.
create table if not exists crm_estado_ia (
  id smallint primary key default 1 check (id = 1),
  ultimo_error text,
  error_at timestamptz,
  ok_at timestamptz
);

alter table crm_estado_ia enable row level security;
create policy "crm_estado_ia_all" on crm_estado_ia for all using (true) with check (true);

alter publication supabase_realtime add table crm_estado_ia;

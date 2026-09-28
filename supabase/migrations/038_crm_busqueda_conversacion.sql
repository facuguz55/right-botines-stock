-- Lo que el cliente está buscando en esta conversación, armado a lo largo de
-- varios mensajes: pregunta "¿qué tenés en 38?", el local le pregunta el tipo,
-- contesta "fútbol 11" → queda talle 38 + F11 y el botón de fotos filtra por
-- las dos cosas (en vez de mandar todos los modelos del 38 de cualquier tipo).
-- Lo completa el webhook (api/whatsapp-webhook.ts) y se puede corregir o
-- borrar a mano desde el chat.
alter table wsp_conversaciones add column if not exists busqueda_talle int;
alter table wsp_conversaciones add column if not exists busqueda_tipo text
  check (busqueda_tipo is null or busqueda_tipo in ('F11', 'F5', 'Futsal', 'Hockey'));
alter table wsp_conversaciones add column if not exists busqueda_updated_at timestamptz;

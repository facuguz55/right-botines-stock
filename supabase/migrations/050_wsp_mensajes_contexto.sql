-- Mensajes que el cliente manda "respondiendo" a otro (deslizar en WhatsApp):
-- guarda el id del mensaje citado para mostrarlo arriba en el CRM.
alter table public.wsp_mensajes add column if not exists contexto_wa_id text;
comment on column public.wsp_mensajes.contexto_wa_id is 'wa_message_id del mensaje al que el cliente respondió deslizando (cita de WhatsApp)';

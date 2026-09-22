-- Bucket público para las fotos/audios que mandan los clientes por WhatsApp.
-- El webhook los sube con la service_role key (bypassa RLS), y el bucket
-- público permite que el CRM los muestre con una URL directa, igual que
-- fotos-botines.
insert into storage.buckets (id, name, public) values ('crm-media', 'crm-media', true) on conflict (id) do nothing;

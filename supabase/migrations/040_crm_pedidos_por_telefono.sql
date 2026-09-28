-- Para que el CRM encuentre los pedidos de la tienda web de quien escribe por
-- WhatsApp, buscando por teléfono (la API de TiendaNube no permite filtrar
-- órdenes por teléfono, solo por número/nombre/email).
--
-- telefono_digitos: solo los dígitos, calculado por Postgres — el CRM compara
-- los últimos 7 (tolera +54 9, el 0 de la característica y el "15" viejo).
-- En las órdenes se usa el teléfono de contacto y, si no está (órdenes
-- sincronizadas antes de esta migración), el de la dirección de envío, que ya
-- venía guardado en shipping_address.

alter table tn_ordenes add column if not exists contact_phone text;

alter table tn_ordenes add column if not exists telefono_digitos text
  generated always as (
    regexp_replace(coalesce(nullif(contact_phone, ''), shipping_address->>'phone', ''), '\D', '', 'g')
  ) stored;

alter table tn_clientes add column if not exists telefono_digitos text
  generated always as (regexp_replace(coalesce(phone, ''), '\D', '', 'g')) stored;

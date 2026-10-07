-- Stock en tiempo real en todos los dispositivos. Cada celular cargaba el
-- stock al abrir la app y no se enteraba de lo que cambiaban los demás: si
-- una empleada hacía un cambio o una venta, Cami (y el resto) seguía viendo
-- el stock viejo hasta reabrir la app o hasta la sincronización de cada hora.
-- useModelos escucha los UPDATE de modelo_talles y corrige la pantalla al
-- instante (mismo mecanismo que ya usa el CRM con wsp_mensajes).
ALTER PUBLICATION supabase_realtime ADD TABLE modelo_talles;

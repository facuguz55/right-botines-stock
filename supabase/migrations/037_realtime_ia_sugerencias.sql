-- El CRM escucha en vivo los inserts de sugerencias de la IA (botón de
-- "mandar talle" pegado al mensaje, cartel de respuesta sugerida) para no
-- depender de salir y volver a entrar a la conversación. wsp_conversaciones
-- y wsp_mensajes ya estaban en la publicación de realtime (031), pero
-- wsp_ia_sugerencias había quedado afuera — sin esto, aunque el frontend
-- se suscriba, Supabase nunca manda el evento.
alter publication supabase_realtime add table wsp_ia_sugerencias;

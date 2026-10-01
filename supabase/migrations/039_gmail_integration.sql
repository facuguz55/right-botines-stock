-- Integración de Gmail (mandar mails a clientes de Preventa, ej. aviso de
-- demora del proveedor) — mismo patrón que /Users/mauricio/nova-local
-- (api/_lib/gmail.ts, gmail-oauth-state.ts), adaptado a que esta app es de
-- un solo local (no hay "tienda_id": una sola fila por tabla).
--
-- Los tokens quedan cifrados (AES-256-GCM, ver api/_lib equivalente en el
-- código) y estas tablas NO tienen política RLS que permita leer/escribir
-- desde el cliente (ni anon ni authenticated) — solo las tocan las funciones
-- serverless con la service role key. A diferencia del resto de las tablas
-- de esta app (RLS allow-all), un token de Gmail es demasiado sensible como
-- para que el navegador lo pueda llegar a pedir, aunque esté cifrado.

CREATE TABLE IF NOT EXISTS gmail_integration (
  id integer PRIMARY KEY DEFAULT 1,
  access_token_encrypted text,
  refresh_token_encrypted text,
  expires_at timestamptz,
  email text,
  status text NOT NULL DEFAULT 'inactive' CHECK (status IN ('active', 'inactive')),
  connected_at timestamptz,
  CONSTRAINT gmail_integration_singleton CHECK (id = 1)
);

ALTER TABLE gmail_integration ENABLE ROW LEVEL SECURITY;
-- Sin policies = sin acceso para anon/authenticated. Solo service role.

-- Estado "state" del handshake OAuth: de un solo uso, vence a los 10 minutos
-- (ver STATE_MAX_AGE_MS en nova-local). browser_nonce liga el state al mismo
-- navegador que arrancó el flujo, para que un link de conexión filtrado no
-- sirva desde otro navegador dentro de la ventana de validez.
CREATE TABLE IF NOT EXISTS gmail_oauth_pending (
  state text PRIMARY KEY,
  browser_nonce text,
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz
);

ALTER TABLE gmail_oauth_pending ENABLE ROW LEVEL SECURITY;
-- Sin policies = sin acceso para anon/authenticated. Solo service role.

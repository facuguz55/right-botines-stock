-- Dispositivos habilitados para usar TiendaNube a través de /api/tiendanube.
--
-- El proxy usaba las credenciales de TiendaNube del servidor para cualquiera
-- que lo llamara: desde afuera se podían leer órdenes y clientes (nombres,
-- mails, teléfonos, direcciones) y crear/editar/borrar productos. Como los
-- empleados entran sin clave, el servidor no tenía forma de distinguir una
-- compu del local de un desconocido.
--
-- Ahora cada dispositivo se habilita UNA vez con el PIN del dueño: se genera
-- un token al azar (256 bits), el dispositivo lo guarda y lo manda en cada
-- pedido; acá se guarda solo su hash. El proxy pregunta a dispositivo_valido
-- antes de usar las credenciales del servidor.

CREATE TABLE IF NOT EXISTS dispositivos_habilitados (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  ultimo_uso timestamptz,
  revocado boolean NOT NULL DEFAULT false
);
-- Sin policies: nadie la lee ni escribe directo, solo las funciones de abajo.
ALTER TABLE dispositivos_habilitados ENABLE ROW LEVEL SECURITY;

-- PIN del dueño con límite de intentos: con 5 fallidos en 15 minutos se
-- bloquea. El PIN es de 4 dígitos y, sin esto, cualquiera de estas funciones
-- serviría para adivinarlo probando. Los fallos se anotan en
-- intentos_acceso_fallidos (la campanita de intentos del dueño).
--
-- Devuelve null si está bien, o el mensaje de error. NO tira excepción ante
-- un PIN incorrecto a propósito: la excepción deshace la transacción entera,
-- incluido el INSERT del intento fallido, y el bloqueo nunca se activaría.
CREATE OR REPLACE FUNCTION verificar_pin_dueno_con_limite(p_pin text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (SELECT count(*) FROM intentos_acceso_fallidos WHERE fecha > now() - interval '15 minutes') >= 5 THEN
    RETURN 'Demasiados intentos fallidos. Esperá 15 minutos y probá de nuevo.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM app_settings WHERE id = 1 AND owner_pin = p_pin) THEN
    INSERT INTO intentos_acceso_fallidos DEFAULT VALUES;
    RETURN 'PIN incorrecto';
  END IF;
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION verificar_pin_dueno_con_limite(text) FROM PUBLIC, anon, authenticated;

-- Devuelve { ok, token } o { ok: false, error }.
CREATE OR REPLACE FUNCTION habilitar_dispositivo(p_pin text, p_nombre text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_error text := verificar_pin_dueno_con_limite(p_pin);
  v_token text;
  v_nombre text := left(btrim(coalesce(p_nombre, '')), 60);
BEGIN
  IF v_error IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', v_error);
  END IF;
  IF v_nombre = '' THEN v_nombre := 'Dispositivo sin nombre'; END IF;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  INSERT INTO dispositivos_habilitados (nombre, token_hash)
  VALUES (v_nombre, encode(extensions.digest(v_token, 'sha256'), 'hex'));
  RETURN jsonb_build_object('ok', true, 'token', v_token);
END;
$$;

-- La usa el proxy (y la app, para saber si mostrar el aviso). Actualiza el
-- último uso como mucho una vez por hora para no escribir en cada pedido.
CREATE OR REPLACE FUNCTION dispositivo_valido(p_token text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_token IS NULL OR length(p_token) <> 64 THEN RETURN false; END IF;
  SELECT id INTO v_id FROM dispositivos_habilitados
  WHERE token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') AND NOT revocado;
  IF v_id IS NULL THEN RETURN false; END IF;
  UPDATE dispositivos_habilitados SET ultimo_uso = now()
  WHERE id = v_id AND (ultimo_uso IS NULL OR ultimo_uso < now() - interval '1 hour');
  RETURN true;
END;
$$;

-- Listado y baja para el dueño (Ajustes → Seguridad). Piden el PIN porque
-- el "rol" de dueño en la app vive solo en el navegador.
-- Devuelve { ok, dispositivos: [...] } o { ok: false, error }.
CREATE OR REPLACE FUNCTION listar_dispositivos(p_pin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_error text := verificar_pin_dueno_con_limite(p_pin);
BEGIN
  IF v_error IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', v_error);
  END IF;
  RETURN jsonb_build_object('ok', true, 'dispositivos', coalesce((
    SELECT jsonb_agg(jsonb_build_object('id', d.id, 'nombre', d.nombre, 'created_at', d.created_at, 'ultimo_uso', d.ultimo_uso) ORDER BY d.created_at)
    FROM dispositivos_habilitados d WHERE NOT d.revocado
  ), '[]'::jsonb));
END;
$$;

-- Devuelve { ok } o { ok: false, error }.
CREATE OR REPLACE FUNCTION quitar_dispositivo(p_pin text, p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_error text := verificar_pin_dueno_con_limite(p_pin);
BEGIN
  IF v_error IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', v_error);
  END IF;
  UPDATE dispositivos_habilitados SET revocado = true WHERE id = p_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION habilitar_dispositivo(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION dispositivo_valido(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION listar_dispositivos(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION quitar_dispositivo(text, uuid) TO anon, authenticated;

-- Despliegue sin cortar el servicio: el proxy empieza a exigir un
-- dispositivo habilitado recién cuando existe al menos uno. Si exigiera desde
-- el primer minuto, la compu del local (todavía sin habilitar) dejaría de
-- llevar sus ventas y cambios a TiendaNube y la sincronización los desharía.
CREATE OR REPLACE FUNCTION proxy_exige_dispositivo()
RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM dispositivos_habilitados WHERE NOT revocado)
$$;
GRANT EXECUTE ON FUNCTION proxy_exige_dispositivo() TO anon, authenticated;

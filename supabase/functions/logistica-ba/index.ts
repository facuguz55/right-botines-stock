// Envíos que salen del depósito de Buenos Aires (ubicación "Deposito CABA" de
// TiendaNube), para la logística de la proveedora y para Right.
//
// Acceso: el PIN de logística (vault: logistica_pin, con límite de intentos)
// o un dispositivo de Right habilitado (x-device-token, migración 046). Las
// órdenes se piden a TiendaNube en el momento con el token del servidor, así
// que no dependen de que alguna compu haya sincronizado.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const TN = "https://api.tiendanube.com/v1/7648870";
const UA = "RightBotinesStock (contacto@rightbotines.com)";
const CABA = /caba|buenos aires|deposito/i;
const DESPACHADO = new Set(["DISPATCHED", "DELIVERED", "RECEIVED_BY_POST_OFFICE", "IN_TRANSIT", "DELIVERED_TO_RECIPIENT"]);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-logistica-pin, x-device-token, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: CORS });

type Producto = { product_id: number; variant_id: number; name: string; quantity: number | string; variant_values?: string[]; image?: { src?: string } };
type Despacho = { status: string; assigned_location?: { name?: string; location_id?: string }; tracking_info?: { url?: string; code?: string } };
type Orden = {
  id: number; number: number; created_at: string; status: string; payment_status: string;
  contact_name?: string; contact_phone?: string; note?: string | null; shipping_option?: string;
  shipping_address?: { name?: string; address?: string; number?: string; floor?: string; locality?: string; city?: string; province?: string; zipcode?: string; phone?: string };
  products: Producto[]; fulfillments?: Despacho[];
};
type LineaFO = { quantity: number; variant?: { variant_id?: string } };
type FO = { assigned_location?: { name?: string }; line_items?: LineaFO[] };

async function tn(token: string, path: string) {
  const r = await fetch(`${TN}${path}`, { headers: { Authentication: `bearer ${token}`, "User-Agent": UA } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`TiendaNube ${r.status}`);
  return await r.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  // ── Acceso ──
  const pin = req.headers.get("x-logistica-pin");
  const dispositivo = req.headers.get("x-device-token");
  if (pin) {
    const { data: err } = await db.rpc("logistica_verificar_pin", { p_pin: pin });
    if (err) return json({ error: err }, 401);
  } else if (dispositivo) {
    const { data: ok } = await db.rpc("dispositivo_valido", { p_token: dispositivo });
    if (!ok) return json({ error: "Dispositivo no habilitado" }, 401);
  } else {
    return json({ error: "Falta el PIN" }, 401);
  }

  try {
    const { data: token } = await db.rpc("logistica_token_tn");
    if (!token) return json({ error: "Falta el token de TiendaNube" }, 500);

    // Últimos 30 días, abiertas (no canceladas).
    const desde = new Date(Date.now() - 30 * 86400_000).toISOString();
    const ordenes: Orden[] = [];
    for (let page = 1; page <= 5; page++) {
      const lote = (await tn(token, `/orders?per_page=200&page=${page}&status=open&created_at_min=${encodeURIComponent(desde)}`)) as Orden[] | null;
      if (!lote?.length) break;
      ordenes.push(...lote);
      if (lote.length < 200) break;
    }

    const resultado = [];
    for (const o of ordenes) {
      const pagada = o.payment_status === "paid" || o.payment_status === "authorized";
      const desp = (o.fulfillments ?? []).find((f) => CABA.test(f.assigned_location?.name ?? ""));
      if (!pagada || !desp) continue;
      const despachado = DESPACHADO.has(desp.status);
      // Enviados: solo los de la última semana, como referencia.
      if (despachado && Date.now() - Date.parse(o.created_at) > 7 * 86400_000) continue;

      // Qué productos salen de CABA (en órdenes divididas, solo esos).
      const dividida = (o.fulfillments ?? []).some((f) => !CABA.test(f.assigned_location?.name ?? ""));
      let deCaba: Map<string, number> | null = null;
      if (dividida) {
        const fos = ((await tn(token, `/orders/${o.id}/fulfillment-orders`)) ?? []) as FO[];
        deCaba = new Map();
        for (const fo of fos.filter((f) => CABA.test(f.assigned_location?.name ?? ""))) {
          for (const li of fo.line_items ?? []) {
            const v = String(li.variant?.variant_id ?? "");
            deCaba.set(v, (deCaba.get(v) ?? 0) + li.quantity);
          }
        }
      }
      const productos = o.products
        .filter((p) => !deCaba || deCaba.has(String(p.variant_id)))
        .map((p) => ({
          nombre: p.name.replace(/\s*\([^)]*\)\s*$/, ""),
          talle: (p.variant_values ?? []).join(" · "),
          cantidad: deCaba?.get(String(p.variant_id)) ?? Number(p.quantity),
          foto: p.image?.src ?? null,
        }));

      const a = o.shipping_address ?? {};
      resultado.push({
        numero: o.number,
        fecha: o.created_at,
        estado: desp.status,
        despachado,
        dividida,
        cliente: a.name || o.contact_name || "",
        telefono: a.phone || o.contact_phone || "",
        direccion: [[a.address, a.number].filter(Boolean).join(" "), a.floor, a.locality, a.city, a.province, a.zipcode && `CP ${a.zipcode}`].filter(Boolean).join(", "),
        envio: o.shipping_option ?? "",
        // Retiro o cadete de Santa Fe no se pueden hacer desde Buenos Aires.
        envioDudoso: /uber|cadete|retiro|santa fe|showroom/i.test(o.shipping_option ?? ""),
        seguimiento: desp.tracking_info?.url || null,
        codigoSeguimiento: desp.tracking_info?.code || null,
        nota: o.note || null,
        productos,
      });
    }
    resultado.sort((x, y) => Number(x.despachado) - Number(y.despachado) || x.fecha.localeCompare(y.fecha));
    return json({ ok: true, ordenes: resultado, actualizado: new Date().toISOString() });
  } catch (e) {
    console.error("logistica-ba:", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

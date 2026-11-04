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
type Despacho = { id?: string; status: string; shipping?: { type?: string }; assigned_location?: { name?: string; location_id?: string }; tracking_info?: { url?: string; code?: string } };
type Orden = {
  id: number; number: number; created_at: string; status: string; payment_status: string;
  contact_name?: string; contact_phone?: string; note?: string | null; shipping_option?: string;
  shipping_address?: { name?: string; address?: string; number?: string; floor?: string; locality?: string; city?: string; province?: string; zipcode?: string; phone?: string };
  products: Producto[]; fulfillments?: Despacho[];
};
type LineaFO = { quantity: number; variant?: { variant_id?: string } };
type FO = { id?: string; status?: string; assigned_location?: { name?: string }; tracking_info?: { url?: string; code?: string }; line_items?: LineaFO[] };

async function tn(token: string, path: string) {
  const r = await fetch(`${TN}${path}`, { headers: { Authentication: `bearer ${token}`, "User-Agent": UA } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`TiendaNube ${r.status}`);
  return await r.json();
}

// Marca el despacho de CABA de una orden como armado o despachado en
// TiendaNube. Al despachar, TiendaNube le avisa al cliente con el seguimiento.
// Se vuelve a leer la orden para no tocar nada que no sea un despacho de CABA.
async function marcar(token: string, orderId: number, accion: "armado" | "despachado") {
  // En la orden suelta "fulfillments" trae solo ids: el detalle (ubicación,
  // estado, seguimiento) está en fulfillment-orders.
  const o = (await tn(token, `/orders/${orderId}`)) as Orden | null;
  if (!o) return { ok: false, detalle: "No encontré la orden", numero: 0 };
  const fos = ((await tn(token, `/orders/${orderId}/fulfillment-orders`)) ?? []) as FO[];
  const desp = fos.find((f) => CABA.test(f.assigned_location?.name ?? ""));
  if (!desp?.id) return { ok: false, detalle: "La orden no sale del depósito de Buenos Aires", numero: o.number };
  if (o.status !== "open" || !["paid", "authorized"].includes(o.payment_status)) {
    return { ok: false, detalle: "La orden no está paga o está cancelada", numero: o.number };
  }
  if (DESPACHADO.has(desp.status ?? "")) return { ok: true, detalle: "Ya estaba despachada", numero: o.number };
  const body = accion === "despachado"
    ? { status: "DISPATCHED", tracking_info: { code: desp.tracking_info?.code ?? "", url: desp.tracking_info?.url ?? "", notify_customer: true } }
    : { status: "PACKED" };
  const r = await fetch(`${TN}/orders/${orderId}/fulfillment-orders/${desp.id}`, {
    method: "PATCH",
    headers: { Authentication: `bearer ${token}`, "User-Agent": UA, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) return { ok: false, detalle: `TiendaNube ${r.status}: ${(await r.text()).slice(0, 200)}`, numero: o.number };
  return { ok: true, detalle: null, numero: o.number };
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

    if (req.method === "POST") {
      const { orderId, accion, motivo, id, nombre, pdf } = await req.json().catch(() => ({})) as {
        orderId?: number; accion?: string; motivo?: string; id?: string; nombre?: string; pdf?: string;
      };

      // ── Rótulos del día (PDF) ──
      // Subir y borrar: solo Right (dispositivo habilitado).
      if (accion === "subir_rotulos") {
        if (pin) return json({ error: "Solo Right puede subir rótulos" }, 403);
        if (!pdf) return json({ error: "Falta el PDF" }, 400);
        const bytes = Uint8Array.from(atob(pdf), (c) => c.charCodeAt(0));
        if (bytes.length > 20 * 1024 * 1024) return json({ error: "El PDF pesa más de 20 MB" }, 400);
        if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") return json({ error: "El archivo no es un PDF" }, 400);
        const limpio = String(nombre ?? "rotulos.pdf").replace(/[^\w.\- ]+/g, "").slice(0, 80) || "rotulos.pdf";
        const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.pdf`;
        const { error: e1 } = await db.storage.from("rotulos").upload(path, bytes, { contentType: "application/pdf" });
        if (e1) return json({ error: `No se pudo guardar: ${e1.message}` }, 500);
        await db.from("logistica_rotulos").insert({ path, nombre: limpio });
        return json({ ok: true });
      }
      if (accion === "borrar_rotulo") {
        if (pin) return json({ error: "Solo Right puede borrar rótulos" }, 403);
        const { data: r } = await db.from("logistica_rotulos").select("path").eq("id", id ?? "").maybeSingle();
        if (!r) return json({ error: "No encontré el rótulo" }, 404);
        await db.storage.from("rotulos").remove([r.path]);
        await db.from("logistica_rotulos").delete().eq("id", id);
        return json({ ok: true });
      }
      // Descargado: se marca solo cuando lo baja la logística.
      if (accion === "rotulo_descargado") {
        if (pin) await db.from("logistica_rotulos").update({ descargado_at: new Date().toISOString() }).eq("id", id ?? "").is("descargado_at", null);
        return json({ ok: true });
      }

      // "Hay un problema": no toca TiendaNube, queda registrado y le llega a
      // Right en la campanita.
      if (accion === "problema") {
        const texto = String(motivo ?? "").trim().slice(0, 400);
        if (!orderId || !texto) return json({ error: "Falta el motivo" }, 400);
        const o = (await tn(token, `/orders/${orderId}`)) as Orden | null;
        if (!o) return json({ error: "No encontré la orden" }, 404);
        const quien = pin ? "Logística Bs As" : "Right";
        await db.from("logistica_acciones").insert({
          orden_numero: o.number, tn_order_id: orderId, accion: "problema", origen: pin ? "logistica" : "right", ok: true, detalle: texto,
        });
        await db.from("devoluciones_cambios_fallos").insert({ empleado_id: null, mensaje: `${quien} · pedido #${o.number}: ${texto}` });
        return json({ ok: true });
      }

      if (!orderId || (accion !== "armado" && accion !== "despachado")) return json({ error: "Pedido inválido" }, 400);
      const res = await marcar(token, orderId, accion);
      await db.from("logistica_acciones").insert({
        orden_numero: res.numero, tn_order_id: orderId, accion, origen: pin ? "logistica" : "right", ok: res.ok, detalle: res.detalle,
      });
      return res.ok ? json({ ok: true, detalle: res.detalle }) : json({ error: res.detalle }, 409);
    }

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
        orderId: o.id,
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

    // Quién marcó cada orden desde acá (la última acción que salió bien).
    const ids = resultado.map((r) => r.orderId);
    // Y el último problema avisado, aparte.
    type Marca = { accion: string; origen: string; created_at: string; detalle: string | null };
    const marcas = new Map<number, Marca>();
    const problemas = new Map<number, Marca>();
    if (ids.length) {
      const { data } = await db.from("logistica_acciones").select("tn_order_id, accion, origen, created_at, detalle")
        .in("tn_order_id", ids).eq("ok", true).order("created_at", { ascending: true });
      for (const m of data ?? []) (m.accion === "problema" ? problemas : marcas).set(Number(m.tn_order_id), m);
    }
    const conMarca = resultado.map((r) => ({ ...r, marcado: marcas.get(r.orderId) ?? null, problema: problemas.get(r.orderId) ?? null }));

    // Rótulos de la última semana, con link de descarga (vale 1 hora).
    const { data: filas } = await db.from("logistica_rotulos").select("id, path, nombre, created_at, descargado_at")
      .gte("created_at", new Date(Date.now() - 7 * 86400_000).toISOString()).order("created_at", { ascending: false });
    const rotulos = [];
    for (const f of filas ?? []) {
      const { data: s } = await db.storage.from("rotulos").createSignedUrl(f.path, 3600, { download: f.nombre });
      rotulos.push({ id: f.id, nombre: f.nombre, subido: f.created_at, descargado: f.descargado_at, url: s?.signedUrl ?? null });
    }
    return json({ ok: true, ordenes: conMarca, rotulos, actualizado: new Date().toISOString() });
  } catch (e) {
    console.error("logistica-ba:", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

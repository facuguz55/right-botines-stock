// Carritos abandonados de Right (reemplaza los 3 flujos de n8n).
//   POST ?accion=enviar        → lo llama el cron cada 2 h: manda el mail a los carritos abandonados (una vez por mail).
//   POST ?accion=conversiones  → lo llama el cron cada 6 h: cruza los clics con las órdenes pagadas de Tiendanube.
//   GET  ?e=<mail>&u=<checkout> → el botón del mail: anota el clic y redirige al checkout.
// Las acciones POST piden la clave del cron (vault: carritos_cron). El clic es público.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const TIENDA = "7648870";
const CLIENTE = "right-botines";
const TN = `https://api.tiendanube.com/v1/${TIENDA}`;
const UA = "Nova Recover (soporte@novaagency.info)";
const URL_FN = `${Deno.env.get("SUPABASE_URL")}/functions/v1/carritos`;
const HORA = 3600_000;

const secreto = async (nombre: string) => {
  // Primero el vault; si no está, el secreto de Edge Functions con el mismo nombre en mayúsculas (ej. RESEND_API_KEY).
  const { data } = await db.rpc("carritos_secreto", { p_nombre: nombre });
  return (typeof data === "string" && data) || Deno.env.get(nombre.toUpperCase()) || "";
};
const esc = (t: unknown) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const plata = (n: unknown) => "$" + Math.round(Number(n) || 0).toLocaleString("es-AR");
const limpiarCheckout = (u: string) => u.replace("/v3/proxy/", "/v3/next/");
// Solo se redirige a la tienda de Right (que el link no sirva para mandar gente a cualquier lado).
const checkoutValido = (u: string) => /^https:\/\/(www\.)?right\.com\.ar\//.test(u);

async function tn(path: string, token: string) {
  const r = await fetch(`${TN}${path}`, { headers: { Authentication: `bearer ${token}`, "User-Agent": UA } });
  if (r.status === 404) return [];
  if (!r.ok) throw new Error(`Tiendanube ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return await r.json();
}

type Producto = { name?: string; name_without_variants?: string; variant_values?: string[]; quantity?: number | string; price?: number | string; image?: { src?: string } };
type Checkout = { id: number; created_at: string; order_id?: number | null; contact_email?: string; contact_name?: string; customer?: { email?: string; name?: string }; total?: string; products?: Producto[]; abandoned_checkout_url?: string; has_stock_available?: boolean };

function html(c: Checkout, email: string, link: string) {
  const nombre = (c.contact_name || c.customer?.name || "").trim().split(/\s+/)[0] ?? "";
  const titulo = nombre ? `${esc(nombre)}, tus botines siguen en el carrito` : "Tus botines siguen en el carrito";
  const productos = (c.products ?? []).map((p) => {
    const talle = (p.variant_values ?? []).filter(Boolean).join(" · ");
    const cant = Number(p.quantity) > 1 ? ` · ${Number(p.quantity)} pares` : "";
    const foto = p.image?.src ? `<img src="${esc(p.image.src)}" width="130" alt="${esc(p.name_without_variants || p.name)}" style="display:block;width:100%;height:auto;border:0;">` : "";
    return `<tr><td class="px" style="padding:12px 32px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e6e6e6;"><tr>
      <td class="foto" width="130" valign="middle" bgcolor="#f5f5f5" style="background:#f5f5f5;width:130px;"><a href="${link}">${foto}</a></td>
      <td valign="middle" style="padding:14px 16px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
        <p style="margin:0 0 4px;font-size:15px;line-height:20px;font-weight:700;color:#111111;">${esc(p.name_without_variants || p.name)}</p>
        <p style="margin:0 0 10px;font-size:13px;color:#757575;">${talle ? `Talle ${esc(talle)}` : ""}${cant}</p>
        <p style="margin:0;font-size:16px;font-weight:800;color:#111111;">${plata(Number(p.price) * Number(p.quantity || 1))}</p>
      </td></tr></table></td></tr>`;
  }).join("");
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"><title>Tus botines siguen en el carrito</title>
<style>@media (max-width:600px){.px{padding-left:20px!important;padding-right:20px!important}.h1{font-size:30px!important;line-height:33px!important}.foto{width:96px!important}}</style></head>
<body style="margin:0;padding:0;background:#f2f2f2;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f2f2f2;">El carrito no te guarda el talle. Si alguien lo compra antes, se va.&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f2f2f2"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background:#ffffff;">
<tr><td bgcolor="#111111" class="px" style="background:#111111;padding:18px 32px;"><a href="https://right.com.ar"><img src="https://acdn-us.mitiendanube.com/stores/007/648/870/themes/common/logo-712925820209932908-1777818843-860bc3d12650ac9f9c9ffacf9d69894d1777818843-1024-1024.png" width="110" alt="RIGHT" style="display:block;width:110px;height:auto;border:0;"></a></td></tr>
<tr><td class="px" style="padding:36px 32px 16px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <p style="margin:0 0 14px;font-size:12px;font-weight:700;letter-spacing:1.5px;color:#d9480f;">TU TALLE NO ESTÁ RESERVADO</p>
  <p class="h1" style="margin:0 0 14px;font-size:34px;line-height:37px;font-weight:800;letter-spacing:-0.8px;color:#111111;">${titulo}</p>
  <p style="margin:0;font-size:16px;line-height:24px;color:#444444;">El carrito no te guarda el par. Si otra persona compra tu talle antes, se va. Lo terminás en un minuto desde acá.</p>
</td></tr>
${productos}
<tr><td class="px" style="padding:18px 32px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
  <td style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;color:#444444;">Total</td>
  <td align="right" style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:20px;font-weight:800;color:#111111;">${plata(c.total)}</td></tr></table></td></tr>
<tr><td class="px" style="padding:22px 32px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
  <td align="center" bgcolor="#111111" style="background:#111111;border-radius:6px;"><a href="${link}" style="display:block;padding:18px 24px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:17px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:6px;">Terminar mi compra</a></td></tr></table>
  <p style="margin:12px 0 0;text-align:center;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;color:#757575;">Despachamos en 24 hs hábiles · Envío gratis a todo el país</p></td></tr>
<tr><td class="px" style="padding:30px 32px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #e6e6e6;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;"><tr>
  <td width="33%" valign="top" style="padding:18px 6px 0 0;font-size:13px;line-height:18px;color:#111111;"><b>Bordado gratis</b><br><span style="color:#757575;">Tu nombre y número</span></td>
  <td width="33%" valign="top" style="padding:18px 6px 0;font-size:13px;line-height:18px;color:#111111;"><b>3 cuotas</b><br><span style="color:#757575;">sin interés</span></td>
  <td width="33%" valign="top" style="padding:18px 0 0 6px;font-size:13px;line-height:18px;color:#111111;"><b>30 días</b><br><span style="color:#757575;">de garantía</span></td></tr></table></td></tr>
<tr><td class="px" style="padding:30px 32px 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f5f5f5" style="background:#f5f5f5;"><tr>
  <td style="padding:16px 18px;font-size:14px;line-height:20px;color:#111111;">¿No sabés si te va el talle? Escribinos y te ayudamos antes de comprar.<br><a href="https://wa.me/543424054898" style="color:#111111;font-weight:700;">Hablar por WhatsApp →</a></td></tr></table></td></tr>
<tr><td class="px" align="center" style="padding:30px 32px 34px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;line-height:19px;color:#9a9a9a;">RIGHT · Botines · Santa Fe<br><a href="https://right.com.ar" style="color:#9a9a9a;">right.com.ar</a> · <a href="https://www.instagram.com/right.botinessf" style="color:#9a9a9a;">@right.botinessf</a></td></tr>
</table></td></tr></table></body></html>`;
}

// Envío por Gmail (la misma cuenta y el mismo cliente OAuth de Google Cloud que usaba n8n) o, si no está, por Resend.
const b64url = (b: Uint8Array) => btoa(Array.from(b, (x) => String.fromCharCode(x)).join("")).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const utf8b64 = (t: string) => btoa(Array.from(new TextEncoder().encode(t), (x) => String.fromCharCode(x)).join(""));
type Envio = { para: string; asunto: string; html: string; nombre: string; desde: string; responder: string };
async function enviador(): Promise<((m: Envio) => Promise<string | null>) | null> {
  const [id, secret, refresh] = await Promise.all([secreto("gmail_client_id"), secreto("gmail_client_secret"), secreto("gmail_refresh_token")]);
  if (id && secret && refresh) {
    const t = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body: new URLSearchParams({ client_id: id, client_secret: secret, refresh_token: refresh, grant_type: "refresh_token" }) });
    const tj = await t.json().catch(() => ({}));
    if (!tj.access_token) throw new Error(`Gmail no dio acceso: ${tj.error_description ?? tj.error ?? t.status}`);
    const auth = { Authorization: `Bearer ${tj.access_token}` };
    const perfil = await (await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", { headers: auth })).json();
    return async (m) => {
      const mime = [
        `From: =?UTF-8?B?${utf8b64(m.nombre)}?= <${perfil.emailAddress}>`, `To: ${m.para}`, `Reply-To: ${m.responder}`,
        `Subject: =?UTF-8?B?${utf8b64(m.asunto)}?=`, "MIME-Version: 1.0", "Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: base64", "",
        utf8b64(m.html).replace(/.{76}/g, "$&\r\n"),
      ].join("\r\n");
      const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ raw: b64url(new TextEncoder().encode(mime)) }) });
      return r.ok ? null : (await r.text()).slice(0, 160);
    };
  }
  const resend = await secreto("resend_api_key");
  if (!resend) return null;
  return async (m) => {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${resend}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: `${m.nombre} <${m.desde}>`, to: [m.para], reply_to: m.responder, subject: m.asunto, html: m.html }),
    });
    return r.ok ? null : (await r.text()).slice(0, 160);
  };
}

async function config() {
  const { data } = await db.from("carritos_config").select("clave, valor");
  return Object.fromEntries((data ?? []).map((f) => [f.clave, f.valor])) as Record<string, string>;
}

async function enviar() {
  const cfg = await config();
  const modo = cfg.modo ?? "apagado";
  if (modo === "apagado") return { ok: true, modo, enviados: 0 };
  const token = await secreto("tiendanube_token");
  if (!token) throw new Error("Falta el token de Tiendanube en el vault (tiendanube_token)");
  const mandar = await enviador();
  if (!mandar) throw new Error("Falta cómo mandar: gmail_client_id, gmail_client_secret y gmail_refresh_token (o resend_api_key) en el vault");

  const ahora = Date.now();
  const min = Number(cfg.horas_min ?? 1) * HORA, max = Number(cfg.horas_max ?? 72) * HORA;
  const desde = new Date(ahora - max).toISOString();
  const lista = (await tn(`/checkouts?per_page=200&created_at_min=${encodeURIComponent(desde)}`, token)) as Checkout[];

  // Los mails que ya recibieron uno de verdad (los anotados mientras el destinatario estaba fijo no cuentan).
  const { data: ya } = await db.from("emails_enviados").select("email").eq("client_id", CLIENTE).eq("llego", true).range(0, 99999);
  const enviados = new Set((ya ?? []).map((f) => String(f.email).toLowerCase()));

  const vistos = new Set<string>();
  const candidatos: { c: Checkout; email: string }[] = [];
  for (const c of lista.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))) {
    const email = (c.customer?.email || c.contact_email || "").toLowerCase().trim();
    const edad = ahora - Date.parse(c.created_at);
    if (!email || c.order_id || !c.abandoned_checkout_url) continue;
    if (edad < min || edad > max) continue;
    if (c.has_stock_available === false) continue; // si ya no hay stock, el mail no sirve
    if (vistos.has(email) || enviados.has(email)) continue;
    vistos.add(email);
    candidatos.push({ c, email });
  }

  const tope = modo === "prueba" ? Math.min(3, Number(cfg.tope_por_vuelta ?? 20)) : Number(cfg.tope_por_vuelta ?? 20);
  const res = { ok: true, modo, candidatos: candidatos.length, enviados: 0, errores: [] as string[] };
  for (const { c, email } of candidatos.slice(0, tope)) {
    const checkout = limpiarCheckout(c.abandoned_checkout_url!);
    const link = `${URL_FN}?e=${encodeURIComponent(email)}&u=${encodeURIComponent(checkout)}`;
    const para = modo === "prueba" ? cfg.prueba_a : email;
    const error = await mandar({
      para, nombre: cfg.remitente_nombre ?? "Right Botines", desde: cfg.remitente_resend ?? "", responder: cfg.responder_a, html: html(c, email, link),
      asunto: modo === "prueba" ? `[PRUEBA para ${email}] Tus botines siguen en el carrito` : "Tus botines siguen en el carrito",
    });
    if (error) { res.errores.push(`${email}: ${error}`); continue; }
    res.enviados++;
    // En prueba no se anota: así el cliente recibe el suyo cuando se pase a real.
    if (modo === "real") {
      await db.from("emails_enviados").upsert({ client_id: CLIENTE, email, fecha: new Date().toISOString(), llego: true }, { onConflict: "client_id,email" });
    }
  }
  return res;
}

async function conversiones() {
  const token = await secreto("tiendanube_token");
  if (!token) throw new Error("Falta el token de Tiendanube en el vault (tiendanube_token)");
  const desde = new Date(Date.now() - 30 * 24 * HORA).toISOString();
  const [{ data: clicks }, ordenes] = await Promise.all([
    db.from("clicks_tracking").select("email, fecha_click").eq("client_id", CLIENTE).gte("fecha_click", desde).range(0, 9999),
    tn(`/orders?per_page=200&status=any&created_at_min=${encodeURIComponent(desde)}`, token),
  ]);
  // Por cada mail, el primer clic (la compra cuenta si es posterior).
  const primero = new Map<string, number>();
  for (const k of clicks ?? []) {
    const e = String(k.email ?? "").toLowerCase().trim(), t = Date.parse(k.fecha_click);
    if (e && (!primero.has(e) || t < primero.get(e)!)) primero.set(e, t);
  }
  const filas = [];
  for (const o of ordenes as Record<string, unknown>[]) {
    if (o.payment_status !== "paid") continue;
    const email = String(o.contact_email ?? (o.customer as { email?: string })?.email ?? "").toLowerCase().trim();
    const click = primero.get(email), fecha = Date.parse(String(o.created_at));
    if (!click || !(fecha > click)) continue;
    filas.push({
      client_id: CLIENTE, email, nombre_cliente: String(o.contact_name ?? ""), id_orden: String(o.id), total_orden: String(o.total ?? ""),
      fecha_orden: new Date(fecha).toISOString(), fecha_click: new Date(click).toISOString(), fecha_verificacion: new Date().toISOString(), utm_campaign: "recuperacion",
    });
  }
  if (filas.length) {
    const { error } = await db.from("conversiones").upsert(filas, { onConflict: "client_id,id_orden" });
    if (error) throw new Error(error.message);
  }
  return { ok: true, conversiones: filas.length };
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // Clic del botón del mail: anotar y redirigir. Si algo falla, igual se redirige.
  if (req.method === "GET") {
    const email = (url.searchParams.get("e") ?? "").toLowerCase().trim().slice(0, 200);
    const destino = url.searchParams.get("u") ?? "";
    if (!checkoutValido(destino)) return Response.redirect("https://right.com.ar", 302);
    if (email) await db.from("clicks_tracking").insert({ client_id: CLIENTE, email, checkout_url: destino, fecha_click: new Date().toISOString() }).then(() => {}, () => {});
    return Response.redirect(destino, 302);
  }

  const clave = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (!clave || clave !== (await secreto("carritos_cron"))) return Response.json({ error: "No autorizado" }, { status: 401 });
  try {
    const accion = url.searchParams.get("accion");
    if (accion === "enviar") return Response.json(await enviar());
    if (accion === "conversiones") return Response.json(await conversiones());
    return Response.json({ error: "Acción desconocida" }, { status: 400 });
  } catch (e) {
    console.error("carritos:", e);
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
});

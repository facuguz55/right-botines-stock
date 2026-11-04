// Manda a TiendaNube el stock de los talles que quedaron en la cola
// privado.tn_stock_cola (migración 054). La llama el cron cada minuto
// (privado.tn_stock_llamar) solo cuando hay algo pendiente. Pide la clave del
// cron (vault: tn_stock_cron). Usa el token de TiendaNube del vault, así que no
// depende de qué compu o celu hizo la venta.
//
// Ubicaciones (multi-inventario): la tienda tiene "Showroom" (el local) y
// "Deposito CABA" (la proveedora de Buenos Aires, solo envío). La app guarda
// el total de cada talle (la suma de las dos). Mandar ese total en "stock"
// lo cargaba en la ubicación principal de TiendaNube, que desde el 02/11 es el
// depósito de CABA: una venta del local podía terminar descontándose de
// Buenos Aires. Ahora se manda por ubicación (inventory_levels): el cambio va
// al Showroom, y solo si el Showroom no alcanza (se vendió un par de CABA) se
// toca CABA. El total en TiendaNube siempre queda igual al de la app.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const TN = "https://api.tiendanube.com/v1/7648870";
const UA = "RightBotinesStock (contacto@rightbotines.com)";
const NOMBRE_LOCAL = /showroom/i;

const secreto = async (nombre: string) => {
  const { data } = await db.rpc("tn_stock_secreto", { p_nombre: nombre });
  return typeof data === "string" ? data : "";
};

type Pendiente = { talle_id: string; cantidad: number; tn_variant_id: number; tn_product_id: number; nombre: string; todo_local: boolean };
type Nivel = { location_id: string; stock: number | null };
type Ubicacion = { id: string; name?: Record<string, string> };

// Reparte el total de la app entre ubicaciones: lo que no es Showroom se
// respeta (salvo que el total ya no alcance) y el resto va al Showroom.
export function repartir(total: number, local: string, niveles: Nivel[]): Nivel[] {
  let restante = Math.max(0, total);
  const otros = niveles
    .filter((n) => n.location_id !== local)
    .map((n) => ({ location_id: n.location_id, stock: Math.max(0, n.stock ?? 0) }));
  const enOtros = otros.reduce((s, n) => s + n.stock, 0);
  if (enOtros <= restante) {
    return [{ location_id: local, stock: restante - enOtros }, ...otros];
  }
  // Se vendió (o se ajustó) más de lo que había en el Showroom: lo que falta
  // sale de las otras ubicaciones.
  const ajustados = otros.map((n) => {
    const s = Math.min(n.stock, restante);
    restante -= s;
    return { location_id: n.location_id, stock: s };
  });
  return [{ location_id: local, stock: 0 }, ...ajustados];
}

async function tn(token: string, path: string, init: RequestInit = {}) {
  return await fetch(`${TN}${path}`, {
    ...init,
    headers: { Authentication: `bearer ${token}`, "User-Agent": UA, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

Deno.serve(async (req) => {
  const clave = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (!clave || clave !== (await secreto("tn_stock_cron"))) return Response.json({ error: "No autorizado" }, { status: 401 });

  const token = await secreto("tiendanube_token");
  if (!token) return Response.json({ ok: false, error: "Falta tiendanube_token en el vault" }, { status: 500 });

  // Ubicación del local. Si no se puede saber, no se manda nada (mejor
  // esperar que cargar el stock en la ubicación equivocada).
  const rl = await tn(token, "/locations");
  if (!rl.ok) return Response.json({ ok: false, error: `locations ${rl.status}` }, { status: 502 });
  const ubicaciones = (await rl.json()) as Ubicacion[];
  const local = ubicaciones.find((u) => Object.values(u.name ?? {}).some((n) => NOMBRE_LOCAL.test(n)))?.id;
  if (!local) return Response.json({ ok: false, error: "No encontré la ubicación Showroom en TiendaNube" }, { status: 500 });

  const { data, error } = await db.rpc("tn_stock_tomar", { p_limite: 20 });
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  const res = { ok: true, enviados: 0, fallidos: [] as string[] };
  for (const p of (data ?? []) as Pendiente[]) {
    let ok = false;
    let detalle: string | null = null;
    let frenado = false;
    try {
      const path = `/products/${p.tn_product_id}/variants/${p.tn_variant_id}`;
      const rv = await tn(token, path);
      if (!rv.ok) {
        detalle = `TiendaNube GET ${rv.status}: ${(await rv.text()).slice(0, 200)}`;
        frenado = rv.status === 429;
      } else {
        const variante = await rv.json() as { inventory_levels?: Nivel[] };
        // Talle recién creado desde la app: todo su stock es del local (al
        // crearlo, TiendaNube lo pudo haber puesto en la ubicación principal).
        const niveles = p.todo_local
          ? [{ location_id: local, stock: Math.max(0, p.cantidad) },
             ...(variante.inventory_levels ?? []).filter((n) => n.location_id !== local).map((n) => ({ location_id: n.location_id, stock: 0 }))]
          : repartir(p.cantidad, local, variante.inventory_levels ?? []);
        const r = await tn(token, path, { method: "PUT", body: JSON.stringify({ inventory_levels: niveles }) });
        if (r.ok) {
          // Confirmar que el total quedó igual al de la app.
          const v = await r.json() as { stock?: number | null; inventory_levels?: Nivel[] };
          const total = v.inventory_levels?.reduce((s, n) => s + (n.stock ?? 0), 0) ?? v.stock ?? null;
          ok = total === Math.max(0, p.cantidad);
          if (!ok) detalle = `TiendaNube quedó en ${total} y la app tiene ${p.cantidad}`;
        } else {
          detalle = `TiendaNube PUT ${r.status}: ${(await r.text()).slice(0, 200)}`;
          frenado = r.status === 429;
        }
      }
    } catch (e) {
      detalle = e instanceof Error ? e.message : String(e);
    }
    await db.rpc("tn_stock_resultado", { p_talle_id: p.talle_id, p_cantidad_enviada: p.cantidad, p_ok: ok, p_error: detalle });
    if (ok) res.enviados++;
    else res.fallidos.push(`${p.nombre}: ${detalle}`);
    // Límite de TiendaNube: si nos frena, cortar esta vuelta y seguir en la próxima.
    if (frenado) break;
    await new Promise((r) => setTimeout(r, 400));
  }
  if (res.fallidos.length) console.error("tn-stock:", res.fallidos);
  return Response.json(res);
});

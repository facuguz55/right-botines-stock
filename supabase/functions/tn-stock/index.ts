// Manda a TiendaNube el stock de los talles que quedaron en la cola
// privado.tn_stock_cola (migración 054). La llama el cron cada minuto
// (privado.tn_stock_llamar) solo cuando hay algo pendiente. Pide la clave del
// cron (vault: tn_stock_cron). Usa el token de TiendaNube del vault, así que no
// depende de qué compu o celu hizo la venta.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const TN = "https://api.tiendanube.com/v1/7648870";
const UA = "RightBotinesStock (contacto@rightbotines.com)";

const secreto = async (nombre: string) => {
  const { data } = await db.rpc("tn_stock_secreto", { p_nombre: nombre });
  return typeof data === "string" ? data : "";
};

type Pendiente = { talle_id: string; cantidad: number; tn_variant_id: number; tn_product_id: number; nombre: string };

Deno.serve(async (req) => {
  const clave = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (!clave || clave !== (await secreto("tn_stock_cron"))) return Response.json({ error: "No autorizado" }, { status: 401 });

  const token = await secreto("tiendanube_token");
  if (!token) return Response.json({ ok: false, error: "Falta tiendanube_token en el vault" }, { status: 500 });

  const { data, error } = await db.rpc("tn_stock_tomar", { p_limite: 30 });
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  const res = { ok: true, enviados: 0, fallidos: [] as string[] };
  for (const p of (data ?? []) as Pendiente[]) {
    let ok = false;
    let detalle: string | null = null;
    try {
      const r = await fetch(`${TN}/products/${p.tn_product_id}/variants/${p.tn_variant_id}`, {
        method: "PUT",
        headers: { Authentication: `bearer ${token}`, "User-Agent": UA, "Content-Type": "application/json" },
        body: JSON.stringify({ stock: Math.max(0, p.cantidad) }),
      });
      ok = r.ok;
      if (!ok) detalle = `TiendaNube ${r.status}: ${(await r.text()).slice(0, 200)}`;
      // Límite de TiendaNube: si nos frena, cortar esta vuelta y seguir en la próxima.
      if (r.status === 429) {
        await db.rpc("tn_stock_resultado", { p_talle_id: p.talle_id, p_cantidad_enviada: p.cantidad, p_ok: false, p_error: detalle });
        res.fallidos.push(`${p.nombre}: ${detalle}`);
        break;
      }
    } catch (e) {
      detalle = e instanceof Error ? e.message : String(e);
    }
    await db.rpc("tn_stock_resultado", { p_talle_id: p.talle_id, p_cantidad_enviada: p.cantidad, p_ok: ok, p_error: detalle });
    if (ok) res.enviados++;
    else res.fallidos.push(`${p.nombre}: ${detalle}`);
    await new Promise((r) => setTimeout(r, 300)); // ~3 por segundo, debajo del límite de TiendaNube
  }
  if (res.fallidos.length) console.error("tn-stock:", res.fallidos);
  return Response.json(res);
});

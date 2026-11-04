
// El stock a TiendaNube ya no lo manda el dispositivo: lo manda el servidor
// (cola privado.tn_stock_cola + Edge Function tn-stock, en menos de un minuto
// y con reintentos), que además sabe en qué ubicación va (Showroom = local,
// Deposito CABA = Buenos Aires). Desde acá se mandaba el total en "stock" y
// TiendaNube lo cargaba en la ubicación principal, que ahora es el depósito
// de CABA: las ventas del local se podían descontar de Buenos Aires.
// Se deja la función para no tocar a quienes la llaman; no hay nada que avisar.
export async function reflejarStockEnTN(_talleIds: string[]): Promise<string | null> {
  return null
}

// El envío desde el dispositivo es solo para que la web se actualice al
// instante. Si falla no hace falta que nadie haga nada: el cambio quedó en la
// cola del servidor (migración 054, Edge Function tn-stock), que lo manda a
// TiendaNube en menos de un minuto y reintenta hasta que llegue. Si el
// servidor tampoco puede después de varios intentos, avisa él en la campanita.
// Antes esto mostraba un cartel y pedía corregir a mano: ya no corresponde.
export function avisarFallaStockTN(
  operacion: 'La venta' | 'El ingreso de stock' | 'El cambio' | 'La devolución',
  aviso: string,
  _empleadoId: string | null,
) {
  console.warn(`${operacion}: ${aviso} desde este dispositivo; lo manda el servidor.`)
}

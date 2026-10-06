// Única tabla de talles de la app: la que usa Right en la web. Antes había
// cuatro tablas ARG→US distintas (alta de modelos, ingreso de stock, import de
// TiendaNube) y ninguna coincidía — por eso los talles se publicaban mal (ej.
// ARG 40 salía "9 us" y es "8 us") y había que corregirlos a mano en TN.
//
// 39–44 = guía de talles de right.com.ar. 35–38: la guía muestra "—", pero
// los 144 productos publicados (relevados el 06/10/2026, ya corregidos a mano
// por Right) usan 35→5, 36→5, 37→5,5, 38→6,5 sin excepción: se usa eso para
// que lo nuevo salga igual que lo que ya está. Fuera de la tabla (34, 45+) el
// US queda vacío (0 en la base, que no admite null) y en TiendaNube se publica
// solo "45 arg".

export const GUIA_ARG_A_US: Record<number, number> = {
  35: 5, 36: 5, 37: 5.5, 38: 6.5,
  39: 7, 40: 8, 41: 8.5, 42: 9.5, 43: 10, 44: 11,
}

export function usDeGuia(arg: number | null | undefined): number | null {
  if (arg == null || !Number.isFinite(arg)) return null
  return GUIA_ARG_A_US[arg] ?? null
}

// US a guardar en modelo_talles.talle_us (NOT NULL): 0 = sin US.
export function usParaGuardar(valor: string | number | null | undefined): number {
  const n = typeof valor === 'number' ? valor : parseFloat(String(valor ?? '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : 0
}

// "8 us", "8,5 us" o '' si no tiene US — para mostrar en pantallas.
export function textoUs(us: number | null | undefined): string {
  return us && us > 0 ? `${String(us).replace('.', ',')} us` : ''
}

// Nombre de la variante en TiendaNube: "40 arg / 8 us", o "35 arg" sin US.
export function etiquetaVarianteTN(arg: number, us: number | null | undefined): string {
  const usTxt = textoUs(us)
  return usTxt ? `${arg} arg / ${usTxt}` : `${arg} arg`
}

// US que figura en el nombre de una variante de TiendaNube ("40 arg / 8 us").
export function usDesdeEtiqueta(label: string): number | null {
  const m = label.toLowerCase().match(/(\d{1,2}(?:[.,]5)?)\s*us\b/)
  return m ? Number(m[1].replace(',', '.')) : null
}

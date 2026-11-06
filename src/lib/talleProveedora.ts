// La proveedora de Buenos Aires usa talles europeos en su planilla: su número
// es uno más que el argentino (talle 42 ARG = 43 en su planilla). Cami lo
// confirmó el 06/11/2026.
//
// Recibe el talle como lo manda TiendaNube ("42 arg / 9,5 us", "42",
// "40,5 arg") y devuelve el argentino y el de la planilla, o null si no
// encuentra un número.
export function talleParaProveedora(talle: string): { arg: string; planilla: string } | null {
  const m = talle.match(/(\d{2}(?:[.,]5)?)/)
  if (!m) return null
  const arg = Number(m[1].replace(',', '.'))
  if (!Number.isFinite(arg)) return null
  const fmt = (n: number) => String(n).replace('.', ',')
  return { arg: fmt(arg), planilla: fmt(arg + 1) }
}

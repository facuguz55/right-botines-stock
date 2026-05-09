function norm(s: string, len: number): string {
  return s
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, len)
}

function catGamaAbbrev(categoria: string, gama: string): string {
  const catMap: Record<string, string> = {
    'F5': 'F5', 'F11': 'F11', 'Futsal': 'FUT', 'Hockey': 'HOC',
  }
  const gamaMap: Record<string, string> = {
    'Alta': 'A', 'Media': 'M', 'Económica': 'E',
  }
  return (catMap[categoria] ?? norm(categoria, 3)) + (gamaMap[gama] ?? norm(gama, 1))
}

// Formato: NIK-PHAN-F11M (sin talle — el talle vive en modelo_talles)
export function buildCodigoBase(
  marca: string,
  modelo: string,
  categoria: string,
  gama: string
): string {
  if (!marca || !modelo || !categoria || !gama) return ''
  return [norm(marca, 3), norm(modelo, 4), catGamaAbbrev(categoria, gama)].join('-')
}

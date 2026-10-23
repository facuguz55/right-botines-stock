// Silenciar un chat: sin aviso al celular hasta una fecha ("siempre" = año 2100).
export const SILENCIAR_SIEMPRE = '2100-01-01T00:00:00.000Z'

export function estaSilenciada(c: { silenciada_hasta?: string | null }, ahora = Date.now()): boolean {
  return !!c.silenciada_hasta && new Date(c.silenciada_hasta).getTime() > ahora
}

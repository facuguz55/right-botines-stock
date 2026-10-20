// Meta a veces manda los celulares argentinos con el 9 después del 54
// (5493425903310) y a veces sin él (543425903310). Para no crear una
// conversación nueva (y perder el historial) cuando el mismo número llega en la
// otra forma, se buscan las dos.
export function variantesWaId(waId: string): string[] {
  if (/^549\d{10}$/.test(waId)) return [waId, `54${waId.slice(3)}`]
  if (/^54\d{10}$/.test(waId)) return [`549${waId.slice(2)}`, waId]
  return [waId]
}

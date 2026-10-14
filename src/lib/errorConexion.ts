// "TypeError: Failed to fetch" (Chrome), "Load failed" (Safari) y
// "NetworkError…" (Firefox) significan lo mismo: el pedido no llegó al
// servidor, casi siempre porque se cortó internet. Al empleado ese texto no
// le dice nada, así que se traduce a algo que pueda resolver.
export function mensajeDeError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  if (/failed to fetch|load failed|networkerror|network request failed/i.test(msg)) {
    return 'No hay conexión a internet en este dispositivo. Revisá el wifi, recargá la página y probá de nuevo.'
  }
  return msg
}

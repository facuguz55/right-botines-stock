// Copiar al portapapeles sin que un navegador que lo bloquea (permisos, webviews,
// PWA, el navegador integrado de alguna app) termine en un error sin capturar.

// Devuelve true si se copió. Nunca tira error.
export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto)
    return true
  } catch { /* se prueba el método viejo */ }
  try {
    const ta = document.createElement('textarea')
    ta.value = texto
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.top = '0'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    ta.setSelectionRange(0, texto.length)
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

// Cuando no se pudo copiar: muestra el texto para copiarlo a mano. prompt() y
// alert() no existen en todos los entornos (webviews, navegadores embebidos):
// si ninguno está, no hace nada en vez de tirar un error.
export function mostrarParaCopiar(texto: string): void {
  try {
    window.prompt('No se pudo copiar automáticamente. Seleccioná el texto y copialo con Ctrl+C / Cmd+C:', texto)
    return
  } catch { /* sigue */ }
  try {
    window.alert(`No se pudo copiar. Texto:\n\n${texto}`)
  } catch { /* sin diálogos disponibles */ }
}

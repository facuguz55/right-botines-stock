// Vibración corta al mantener apretado un chat.
//  - Android (Chrome): navigator.vibrate.
//  - iPhone: Safari NO tiene navigator.vibrate (ni la app instalada). Desde iOS 17.4 un
//    interruptor nativo (<input type="checkbox" switch>) da un toquecito háptico cuando se
//    lo activa, y se usa eso. En iPhones más viejos no hay forma desde una página web.
export function vibrar(ms = 14): void {
  try {
    if (typeof navigator.vibrate === 'function' && navigator.vibrate(ms)) return
  } catch { /* sigue */ }
  try {
    const label = document.createElement('label')
    label.setAttribute('aria-hidden', 'true')
    label.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none'
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.setAttribute('switch', '')
    label.appendChild(input)
    document.body.appendChild(label)
    label.click()
    window.setTimeout(() => label.remove(), 150)
  } catch { /* sin háptico en este dispositivo */ }
}

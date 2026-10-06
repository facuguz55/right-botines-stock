/*
 * Tracking de tráfico de right.com.ar → Right Botines Stock (pantalla Tráfico).
 * Se carga desde Google Tag Manager con una etiqueta "HTML personalizado":
 *   <script src="https://right-botines-stock.vercel.app/track.js" async></script>
 *
 * Registra: vistas de página, vistas de producto (usa LS.product de
 * TiendaNube), talle elegido (y si estaba agotado), clicks en "Agregar al
 * carrito" e "Iniciar compra".
 * Las compras NO salen de acá: TiendaNube bloquea scripts propios en el
 * checkout, así que se toman de las órdenes que llegan por webhook.
 *
 * Sin datos personales: solo un id anónimo aleatorio por navegador.
 */
(function () {
  if (window.__rbTrack) return
  window.__rbTrack = true

  var ENDPOINT = (function () {
    try {
      var s = document.currentScript && document.currentScript.src
      if (s) return new URL('/api/track', s).toString()
    } catch (e) { /* noop */ }
    return 'https://right-botines-stock.vercel.app/api/track'
  })()

  var SESION_MAX_INACTIVA_MS = 30 * 60 * 1000

  function rid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
  }

  function leer(store, k) { try { return store.getItem(k) } catch (e) { return null } }
  function guardar(store, k, v) { try { store.setItem(k, v) } catch (e) { /* noop */ } }

  var visitorId = leer(localStorage, 'rb_vid')
  if (!visitorId) { visitorId = rid(); guardar(localStorage, 'rb_vid', visitorId) }

  // Sesión: nueva si pasó más de 30 min sin actividad (criterio estándar).
  var ahora = Date.now()
  var ultima = Number(leer(localStorage, 'rb_last') || 0)
  var sessionId = leer(localStorage, 'rb_sid')
  var sesionNueva = !sessionId || ahora - ultima > SESION_MAX_INACTIVA_MS
  if (sesionNueva) { sessionId = rid(); guardar(localStorage, 'rb_sid', sessionId) }
  guardar(localStorage, 'rb_last', String(ahora))

  function enviar(eventos) {
    guardar(localStorage, 'rb_last', String(Date.now()))
    var body = JSON.stringify({ visitor_id: visitorId, session_id: sessionId, eventos: eventos })
    try {
      // String → text/plain: no dispara preflight de CORS.
      if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, body)) return
    } catch (e) { /* noop */ }
    try { fetch(ENDPOINT, { method: 'POST', body: body, keepalive: true, mode: 'cors' }) } catch (e) { /* noop */ }
  }

  function productoActualId() {
    try { return window.LS && LS.product && LS.product.id ? LS.product.id : null } catch (e) { return null }
  }

  // Origen (UTM / referrer externo): solo en el primer evento de la sesión.
  function origen() {
    if (!sesionNueva) return {}
    var p = new URLSearchParams(location.search)
    var ref = document.referrer
    var externo = ref && ref.indexOf(location.host) === -1 ? ref : null
    // IDs de click que agregan Google Ads (gclid), Meta (fbclid) y TikTok
    // (ttclid): identifican el canal aunque el link no tenga UTM. Solo se
    // guarda cuál vino, no el valor.
    var clickId = p.get('gclid') ? 'gclid' : p.get('ttclid') ? 'ttclid' : p.get('fbclid') ? 'fbclid' : null
    return {
      referrer: externo,
      utm_source: p.get('utm_source'),
      utm_medium: p.get('utm_medium'),
      utm_campaign: p.get('utm_campaign'),
      click_id: clickId,
    }
  }

  // ── Vista de página / producto ──
  var pid = productoActualId()
  var vista = { tipo: pid ? 'product_view' : 'page_view', path: location.pathname, tn_product_id: pid }
  var o = origen()
  for (var k in o) vista[k] = o[k]
  enviar([vista])

  // ── Clicks (delegados: los botones del carrito lateral aparecen después) ──
  document.addEventListener('click', function (ev) {
    var t = ev.target
    if (!t || !t.closest) return

    var add = t.closest('.js-addtocart')
    if (add && !add.classList.contains('js-addtocart-placeholder') && !add.disabled) {
      var form = add.closest('form')
      var input = form && form.querySelector('input[name="add_to_cart"]')
      enviar([{ tipo: 'add_to_cart', path: location.pathname, tn_product_id: (input && input.value) || productoActualId() }])
      return
    }

    var checkout = t.closest('[name="go_to_checkout"], [data-component="cart.checkout-button"], a[href*="/checkout"]')
    if (checkout) { enviar([{ tipo: 'checkout_start', path: location.pathname }]); return }

    // Talle elegido: la tienda muestra todos los talles como botones, también
    // los agotados. Se marca sin_stock si ninguna variante con ese valor está
    // disponible según LS.variants (el stock que tiene la página en ese momento).
    var talle = t.closest('.js-insta-variant[data-option]')
    if (talle) {
      var valor = talle.getAttribute('data-option')
      var grupo = talle.closest('[data-variation-id]')
      var idx = grupo ? grupo.getAttribute('data-variation-id') : '0'
      var sinStock = null
      try {
        var variantes = (window.LS && LS.variants) || []
        var conEseValor = variantes.filter(function (v) { return v['option' + idx] === valor })
        if (conEseValor.length) sinStock = !conEseValor.some(function (v) { return v.available })
      } catch (e) { /* noop */ }
      enviar([{ tipo: 'talle_select', path: location.pathname, tn_product_id: productoActualId(), talle: valor, sin_stock: sinStock }])
    }
  }, true)
})()

import { describe, expect, it } from 'vitest'
import {
  busquedaVigente,
  coincidenciaModelo,
  decidirBusqueda,
  etiquetaModelo,
  extraerModeloBuscado,
  parseModeloQuery,
  vocabularioCatalogo,
  combinarBusqueda,
  detectarBusqueda,
  normalizeTipo,
  respuestaSugeridaBusqueda,
  textoPreguntarTalle,
  textoPreguntarTipo,
  resumirStock,
  tipoDeCategoria,
  talleIaEsConfiable,
  tipoIaEsConfiable,
} from './crmBusqueda'

describe('detectarBusqueda — talle', () => {
  it.each([
    ['Que tenes en talle 38', 38],
    ['qué tenés en 42?', 42],
    ['Hola, busco botines número 40', 40],
    ['40', 40],
    ['talle 9.5 us', 41],
    ['tenés 9,5 US?', 41],
    ['us 10 tenes algo?', 42],
    ['calzo 43', 43],
  ])('%s → %s', (texto, talle) => {
    expect(detectarBusqueda(texto).talle).toBe(talle)
  })

  it.each([
    ['Hola cómo andas'],
    ['cuánto salen? tengo 40 mil'],
    ['mi hijo tiene 38 años y juega mucho al fútbol los fines de semana'],
    ['llego en 45 minutos'],
    ['mi número es 3424633285'],
    ['sale $38000?'],
    ['talle 38,5'],
    ['talle 12 us'], // US sin equivalencia cargada: no se adivina
    ['tenés 38 o 39?'], // ambiguo
    ['f 11'], // "11" no es un talle ARG
  ])('%s → sin talle', texto => {
    expect(detectarBusqueda(texto).talle).toBeNull()
  })

  it('un número suelto en un mensaje largo sin palabra de talle no se toma', () => {
    expect(detectarBusqueda('ayer fuimos 40 a la cancha y estuvo buenisimo la verdad').talle).toBeNull()
  })

  it('número suelto largo se toma si el local acababa de preguntar el talle', () => {
    const d = detectarBusqueda('mira yo creo que sería 41 pero no estoy seguro del todo', {
      ultimoMensajeLocal: '¿Qué talle usás? 👟',
    })
    expect(d.talle).toBe(41)
  })
})

describe('detectarBusqueda — tipo', () => {
  it.each([
    ['fútbol 11', 'F11'],
    ['Futbol 5', 'F5'],
    ['F11', 'F11'],
    ['busco para futsal', 'Futsal'],
    ['unos de 11 talle 40', 'F11'],
    ['para cancha de 5', 'F5'],
    ['sintéticos', 'F5'],
    ['futbol sala', 'Futsal'],
    ['hockey talle 38', 'Hockey'],
  ])('%s → %s', (texto, tipo) => {
    expect(detectarBusqueda(texto).tipo).toBe(tipo)
  })

  it('ambiguo (dos tipos) → null', () => {
    expect(detectarBusqueda('f5 o f11?').tipo).toBeNull()
  })

  it('respuesta cortita solo cuenta si el local preguntó el tipo', () => {
    const pregunta = '¡Hola! Sí, tenemos modelos en talle 38 👟 ¿Para qué cancha los buscás? ¿Fútbol 11, Fútbol 5 o Futsal?'
    expect(detectarBusqueda('11', { ultimoMensajeLocal: pregunta }).tipo).toBe('F11')
    expect(detectarBusqueda('el de 5 porfa', { ultimoMensajeLocal: pregunta }).tipo).toBe('F5')
    expect(detectarBusqueda('de sala', { ultimoMensajeLocal: pregunta }).tipo).toBe('Futsal')
    expect(detectarBusqueda('11').tipo).toBeNull()
  })

  it('el "11" de fútbol 11 no se confunde con un talle', () => {
    const d = detectarBusqueda('para fútbol 11 en talle 38')
    expect(d).toMatchObject({ talle: 38, tipo: 'F11' })
  })
})

describe('validación de lo que propone la IA', () => {
  it('acepta un talle que el cliente escribió', () => {
    expect(talleIaEsConfiable(38, ['que tenes en talle 38'])).toBe(true)
  })
  it('acepta un talle cuyo equivalente US escribió el cliente', () => {
    expect(talleIaEsConfiable(41, ['uso 9.5'])).toBe(true)
  })
  it('rechaza un talle inventado', () => {
    expect(talleIaEsConfiable(39, ['que tenes en talle 38'])).toBe(false)
    expect(talleIaEsConfiable(38, ['hola como andas'])).toBe(false)
  })
  it('rechaza valores fuera de rango o no enteros', () => {
    expect(talleIaEsConfiable(38.5, ['38.5'])).toBe(false)
    expect(talleIaEsConfiable(12, ['12'])).toBe(false)
    expect(talleIaEsConfiable('38', ['38'])).toBe(false)
  })
  it('tipo de la IA solo con pistas en el mensaje', () => {
    expect(tipoIaEsConfiable('F5', 'para cancha de 7')).toBe('F5')
    expect(tipoIaEsConfiable('f11', 'hola buenas tardes')).toBeNull()
    expect(tipoIaEsConfiable('rugby', 'cancha')).toBeNull()
  })
})

describe('estado de la búsqueda', () => {
  it('combina lo nuevo con lo guardado', () => {
    expect(combinarBusqueda({ talle: 38, tipo: null }, { talle: null, tipo: 'F11' })).toEqual({ talle: 38, tipo: 'F11', modelo: null })
    expect(combinarBusqueda({ talle: 38, tipo: 'F11' }, { talle: 39, tipo: null })).toEqual({ talle: 39, tipo: 'F11', modelo: null })
  })

  it('una búsqueda vieja no se arrastra', () => {
    const ahora = new Date('2026-09-28T12:00:00Z')
    expect(busquedaVigente({ busqueda_talle: 38, busqueda_tipo: 'F11', busqueda_updated_at: '2026-09-27T12:00:00Z' }, ahora))
      .toEqual({ talle: 38, tipo: 'F11', modelo: null })
    expect(busquedaVigente({ busqueda_talle: 38, busqueda_tipo: 'F11', busqueda_updated_at: '2026-09-20T12:00:00Z' }, ahora))
      .toEqual({ talle: null, tipo: null, modelo: null })
  })

  it('normaliza tipos guardados con el formato viejo', () => {
    expect(normalizeTipo('f11')).toBe('F11')
    expect(normalizeTipo('futsal')).toBe('Futsal')
    expect(normalizeTipo('null')).toBeNull()
  })
})

describe('modelo puntual', () => {
  // Nombres reales de right.com.ar (marca + modelo como los guarda la app).
  const catalogo = [
    { marca: 'Adidas', modelo: 'F50 Negro Amarillo F' },
    { marca: 'Adidas', modelo: 'F50 SC Naranja' },
    { marca: 'Adidas', modelo: 'F50 Negro Blanco' },
    { marca: 'Adidas', modelo: 'F50 Negro Rojo F5' },
    { marca: 'Adidas', modelo: 'Predator Rojo' },
    { marca: 'Nike', modelo: 'Mercurial Vapor 15 Blanco' },
    { marca: 'Adidas', modelo: 'Mixtos- Adidas F50 Violeta' },
  ]
  const vocab = vocabularioCatalogo(catalogo)

  it('saca las palabras de modelo del mensaje', () => {
    expect(extraerModeloBuscado('Los f50 negro blanco s/C en 40 los tenés?', vocab)).toBe('f50 negro blanco sc')
    expect(extraerModeloBuscado('tenés mercurial en 42?', vocab)).toBe('mercurial')
    expect(extraerModeloBuscado('hay nike talle 40?', vocab)).toBe('nike')
  })

  it('sin palabra de modelo (o solo colores) no filtra', () => {
    expect(extraerModeloBuscado('que tenes en talle 38', vocab)).toBeNull()
    expect(extraerModeloBuscado('tenés algo negro en 40?', vocab)).toBeNull()
    expect(extraerModeloBuscado('futbol 5 porfa', vocab)).toBeNull()
    expect(extraerModeloBuscado('tenés phantom?', vocab)).toBeNull() // no está en el catálogo
  })

  it('duras obligatorias, blandas ordenan', () => {
    const q = parseModeloQuery('f50 negro blanco sc')
    expect(q).toEqual({ duras: ['f50'], blandas: ['negr', 'blanc', 'sc'] })
    expect(coincidenciaModelo(catalogo[2], q)).toEqual({ pasa: true, blandas: 2 })
    expect(coincidenciaModelo(catalogo[1], q)).toEqual({ pasa: true, blandas: 1 })
    expect(coincidenciaModelo(catalogo[4], q).pasa).toBe(false)
  })

  it('la etiqueta se lee bien', () => {
    expect(etiquetaModelo('f50 negro blanco sc')).toBe('F50 negro blanco sin cordones')
  })

})

describe('cambio de tema', () => {
  const previa = { talle: 40, tipo: 'F5' as const, modelo: null }
  const sinNada = { talle: null, tipo: null, modelo: null }

  it('pasar a mayorista borra la búsqueda', () => {
    expect(decidirBusqueda({ previa, nuevo: sinNada, intencion: 'otro', categoria: 'Mayorista', cambioDeTema: false }))
      .toEqual({ busqueda: sinNada, aporto: false, limpiar: true })
  })
  it('preguntar por un pedido ya hecho borra la búsqueda', () => {
    expect(decidirBusqueda({ previa, nuevo: sinNada, intencion: 'estado_pedido', categoria: 'Normal', cambioDeTema: false }).limpiar).toBe(true)
  })
  it('si la IA dice que cambió de tema, se borra aunque la categoría sea normal', () => {
    expect(decidirBusqueda({ previa, nuevo: sinNada, intencion: 'otro', categoria: 'Normal', cambioDeTema: true }).limpiar).toBe(true)
  })
  it('"gracias" o "¿cuánto salen?" no borran', () => {
    for (const intencion of ['saludo', 'consulta_precio', 'consulta_envio', 'otro']) {
      expect(decidirBusqueda({ previa, nuevo: sinNada, intencion, categoria: 'Normal', cambioDeTema: false }))
        .toEqual({ busqueda: previa, aporto: false, limpiar: false })
    }
  })
  it('seguir la misma búsqueda combina ("de 11" después de "40")', () => {
    expect(decidirBusqueda({ previa: { talle: 40, tipo: null, modelo: null }, nuevo: { talle: null, tipo: 'F11', modelo: null }, intencion: 'pedido_talle', categoria: 'Pedido de talles', cambioDeTema: false }).busqueda)
      .toEqual({ talle: 40, tipo: 'F11', modelo: null })
  })
  it('una búsqueda nueva sin relación arranca de cero', () => {
    expect(decidirBusqueda({ previa: { talle: 40, tipo: 'F5', modelo: 'f50' }, nuevo: { talle: 35, tipo: null, modelo: null }, intencion: 'pedido_talle', categoria: 'Pedido de talles', cambioDeTema: true }).busqueda)
      .toEqual({ talle: 35, tipo: null, modelo: null })
  })
  it('sin nada guardado no hay nada que borrar', () => {
    expect(decidirBusqueda({ previa: sinNada, nuevo: sinNada, intencion: 'otro', categoria: 'Mayorista', cambioDeTema: true }).limpiar).toBe(false)
  })
})

describe('respuestas según el stock real', () => {
  const stock = (porTipo: Partial<Record<'F11' | 'F5' | 'Futsal' | 'Hockey', number>>) =>
    ({ porTipo, total: Object.values(porTipo).reduce((a, b) => a + (b ?? 0), 0) })

  it('el caso de la captura: talle 32 sin stock → lo dice, no inventa', () => {
    expect(detectarBusqueda('Hola qué tenes en talle 32').talle).toBe(32)
    const r = respuestaSugeridaBusqueda({ talle: 32, tipo: null, modelo: null }, stock({}))
    expect(r).toBe('Uh, en el 32 por ahora no nos queda nada. Si querés te aviso cuando entre')
    expect(r).not.toMatch(/tenemos/)
  })
  it('un solo tipo con stock → lo dice directo, sin preguntar', () => {
    expect(respuestaSugeridaBusqueda({ talle: 32, tipo: null, modelo: null }, stock({ F11: 3 })))
      .toBe('Sí! En el 32 tenemos 3 modelos de fútbol 11. Te paso fotos?')
  })
  it('varios tipos → pregunta solo entre los que hay', () => {
    const r = respuestaSugeridaBusqueda({ talle: 40, tipo: null, modelo: null }, stock({ F11: 5, Futsal: 2 }))
    expect(r).toBe('Sí! En el 40 tenemos de fútbol 11 y futsal. Para cuál los buscás?')
    expect(r).not.toMatch(/fútbol 5/)
  })
  it('pide un tipo que no hay → ofrece los que sí', () => {
    expect(respuestaSugeridaBusqueda({ talle: 40, tipo: 'F5', modelo: null }, stock({ F11: 5 })))
      .toBe('De fútbol 5 en el 40 ahora no nos queda nada. Sí tenemos de fútbol 11, te sirve?')
  })
  it('pide un tipo que hay → cuántos y fotos', () => {
    expect(respuestaSugeridaBusqueda({ talle: 40, tipo: 'F11', modelo: null }, stock({ F11: 1 })))
      .toBe('Sí! En el 40 tenemos 1 modelo de fútbol 11. Ahí te paso fotos')
  })
  it('con modelo', () => {
    expect(respuestaSugeridaBusqueda({ talle: 40, tipo: null, modelo: 'f50' }, stock({ F5: 2 })))
      .toBe('Sí! En el 40 tenemos 2 modelos F50 de fútbol 5. Te paso fotos?')
    expect(respuestaSugeridaBusqueda({ talle: 40, tipo: null, modelo: 'f50' }, stock({})))
      .toMatch(/no nos quedan F50/)
    expect(respuestaSugeridaBusqueda({ talle: null, tipo: null, modelo: 'f50' }, null)).toMatch(/Qué talle/)
  })
  it('sin poder consultar el stock no promete nada', () => {
    for (const r of [
      respuestaSugeridaBusqueda({ talle: 40, tipo: null, modelo: null }, null),
      respuestaSugeridaBusqueda({ talle: 40, tipo: 'F11', modelo: null }, null),
      respuestaSugeridaBusqueda({ talle: null, tipo: 'F11', modelo: null }, null),
    ]) {
      // Ni "hay" ni "no hay": sin stock consultado no se afirma nada.
      expect(r).not.toMatch(/Sí!|(?<!qué )tenemos (\d|los|en|modelos|de)|no nos queda/)
    }
  })
  it('categorías → tipo', () => {
    expect(tipoDeCategoria('F11')).toBe('F11')
    expect(tipoDeCategoria('Botines F5')).toBe('F5')
    expect(tipoDeCategoria('futsal')).toBe('Futsal')
    expect(resumirStock(['F11', 'F11', 'Futsal', null])).toEqual({ porTipo: { F11: 2, Futsal: 1 }, total: 4 })
  })
  it('talles de chicos', () => {
    expect(detectarBusqueda('tenés en 28 para mi hijo?').talle).toBe(28)
  })
})

describe('estilo humano en todas las respuestas', () => {
  it('ninguna respuesta fija tiene emojis, ¿ ¡ ni guiones largos', () => {
    const tipos = [null, 'F11', 'F5', 'Futsal', 'Hockey'] as const
    const stocks = [null, { porTipo: {}, total: 0 }, { porTipo: { F11: 1 }, total: 1 }, { porTipo: { F11: 2, F5: 3, Futsal: 1 }, total: 6 }]
    const textos: string[] = [textoPreguntarTipo(null), textoPreguntarTipo(40), ...tipos.map(t => textoPreguntarTalle(t))]
    for (const talle of [null, 32, 40]) for (const tipo of tipos) for (const modelo of [null, 'f50 negro sc']) for (const stock of stocks) {
      const r = respuestaSugeridaBusqueda({ talle, tipo, modelo }, stock)
      if (r) textos.push(r)
    }
    expect(textos.length).toBeGreaterThan(50)
    for (const t of textos) {
      expect(t).not.toMatch(/[¿¡—•]|\p{Extended_Pictographic}/u)
    }
  })
})

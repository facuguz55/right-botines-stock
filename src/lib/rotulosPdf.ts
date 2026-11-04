// Lee el PDF de rótulos de Andreani (el que Right le pasa a la logística de
// Buenos Aires) y lo separa en un PDF por pedido. Todo en el navegador.
//
// Cada rótulo trae "N° Interno: #1042-XXXX" (el número de pedido de
// TiendaNube) y "N° de seguimiento: 3600…". La hoja A4 trae hasta 4 rótulos
// en una grilla de 2×2. Solo si ninguna hoja tiene más de un rótulo (un PDF de
// un rótulo por hoja) se toma la hoja entera.

export interface TextoRotulo { s: string; x: number; y: number }
export interface PaginaRotulos { w: number; h: number; textos: TextoRotulo[] }
// zona en puntos PDF (origen abajo a la izquierda): x, y, ancho, alto
export interface RotuloPedido { numero: number; seguimiento: string | null; pagina: number; zona: [number, number, number, number] }

const RE_PEDIDO = /#(\d{3,7})-/
const RE_SEGUIMIENTO = /\b(\d{13,17})\b/

const pedidosEn = (p: PaginaRotulos) => p.textos.filter(t => RE_PEDIDO.test(t.s)).length

export function agruparRotulos(paginas: PaginaRotulos[]): RotuloPedido[] {
  const out: RotuloPedido[] = []
  const grilla = paginas.some(p => pedidosEn(p) > 1)
  paginas.forEach((p, pagina) => {
    const pedidos = p.textos
      .map(t => ({ t, m: t.s.match(RE_PEDIDO) }))
      .filter((x): x is { t: TextoRotulo; m: RegExpMatchArray } => !!x.m)
    if (pedidos.length === 0) return
    const seguimientos = p.textos
      .map(t => ({ t, m: t.s.match(RE_SEGUIMIENTO) }))
      .filter((x): x is { t: TextoRotulo; m: RegExpMatchArray } => !!x.m)

    if (!grilla) {
      out.push({ numero: Number(pedidos[0].m[1]), seguimiento: seguimientos[0]?.m[1] ?? null, pagina, zona: [0, 0, p.w, p.h] })
      return
    }
    // Grilla de 2×2: columna por x, fila por y.
    const zonaDe = (t: TextoRotulo): [number, number, number, number] => {
      const col = t.x < p.w / 2 ? 0 : 1
      const arriba = t.y >= p.h / 2
      return [col * p.w / 2, arriba ? p.h / 2 : 0, p.w / 2, p.h / 2]
    }
    const misma = (a: number[], b: number[]) => a[0] === b[0] && a[1] === b[1]
    for (const { t, m } of pedidos) {
      const zona = zonaDe(t)
      const seg = seguimientos.find(s => misma(zonaDe(s.t), zona))
      if (out.some(r => r.pagina === pagina && misma(r.zona, zona))) continue
      out.push({ numero: Number(m[1]), seguimiento: seg?.m[1] ?? null, pagina, zona })
    }
  })
  return out
}

export async function leerRotulos(bytes: Uint8Array): Promise<RotuloPedido[]> {
  const pdfjs = await import('pdfjs-dist')
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = worker
  // pdfjs se queda con el buffer: se le pasa una copia.
  const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise
  const paginas: PaginaRotulos[] = []
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n)
    const [x0, y0, x1, y1] = page.view
    const tc = await page.getTextContent()
    paginas.push({
      w: x1 - x0,
      h: y1 - y0,
      textos: tc.items
        .filter((i): i is typeof i & { str: string; transform: number[] } => 'str' in i)
        .map(i => ({ s: i.str, x: i.transform[4] - x0, y: i.transform[5] - y0 })),
    })
  }
  return agruparRotulos(paginas)
}

// Un PDF por rótulo, recortando la hoja a la zona del rótulo (sigue siendo
// vectorial: el código de barras se imprime nítido).
export async function separarRotulos(bytes: Uint8Array, rotulos: RotuloPedido[]): Promise<{ numero: number; seguimiento: string | null; pdf: Uint8Array }[]> {
  const { PDFDocument } = await import('pdf-lib')
  const src = await PDFDocument.load(bytes)
  const out = []
  for (const r of rotulos) {
    const doc = await PDFDocument.create()
    const [pag] = await doc.copyPages(src, [r.pagina])
    const base = pag.getMediaBox()
    const [x, y, w, h] = r.zona
    pag.setMediaBox(base.x + x, base.y + y, w, h)
    pag.setCropBox(base.x + x, base.y + y, w, h)
    doc.addPage(pag)
    out.push({ numero: r.numero, seguimiento: r.seguimiento, pdf: await doc.save() })
  }
  return out
}

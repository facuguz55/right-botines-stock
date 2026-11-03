// Lee el pedido en PDF que manda la proveedora de Buenos Aires (una tabla con
// código, foto, producto, cantidad, talles "41/1, 42/3", valor y total) y lo
// pasa a datos. Todo en el navegador: el PDF no se sube a ningún lado.
//
// Las columnas se reconocen por su posición horizontal (x) y cada fila por la
// altura (y) de su texto. La foto de la fila es la imagen cuyo rectángulo
// contiene esa altura.

export interface TextoPdf { s: string; x: number; y: number }
export interface ImagenPdf { name: string; x: number; y: number; w: number; h: number }

export interface TalleBA { talle: string; cantidad: number }
export interface ItemBA {
  codigo: string
  descripcion: string
  cantidad: number
  talles: TalleBA[]
  costo: number
  fotoNombre: string | null
}
export interface PedidoBA {
  numero: string
  fecha: string | null // yyyy-mm-dd
  proveedor: string | null
  unidades: number | null
  total: number | null
  items: ItemBA[]
  avisos: string[]
}

const num = (s: string) => Number(s.replace(/[$.,\s]/g, '')) || 0
// "$1,794" → 1794 (el PDF usa coma de miles)
const plata = (s: string) => Number(s.replace(/[$\s]/g, '').replace(/,/g, '')) || 0

function fechaIso(dmy: string): string | null {
  const m = dmy.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null
}

export function parsearTalles(s: string): TalleBA[] {
  const out: TalleBA[] = []
  for (const parte of s.split(',')) {
    const m = parte.trim().match(/^(\d{2}(?:[.,]5)?)\s*\/\s*(\d+)$/)
    if (m) out.push({ talle: m[1].replace(',', '.'), cantidad: Number(m[2]) })
  }
  return out
}

// Columnas por x (en puntos PDF, hoja horizontal de 792 de ancho).
function columna(x: number): 'codigo' | 'producto' | 'cantidad' | 'talles' | 'valor' | 'total' | null {
  if (x < 120) return 'codigo'
  if (x < 400) return 'producto'
  if (x < 450) return 'cantidad'
  if (x < 640) return 'talles'
  if (x < 705) return 'valor'
  return 'total'
}

export function parsearPedido(paginas: { textos: TextoPdf[]; imagenes: ImagenPdf[] }[]): PedidoBA {
  const pedido: PedidoBA = { numero: '', fecha: null, proveedor: null, unidades: null, total: null, items: [], avisos: [] }

  for (const pag of paginas) {
    const encabezado = pag.textos.find(t => /^CÓDIGO$/i.test(t.s.trim()))
    const yEncabezado = encabezado?.y ?? -Infinity

    for (const t of pag.textos) {
      const s = t.s.trim()
      let m: RegExpMatchArray | null
      if ((m = s.match(/ID DE PEDIDO:\s*(\S+)/i))) pedido.numero = m[1]
      else if ((m = s.match(/FECHA:\s*(.+)/i))) pedido.fecha = fechaIso(m[1])
      else if ((m = s.match(/VENDEDOR:\s*(.+)/i))) pedido.proveedor = m[1].trim()
      else if ((m = s.match(/UNIDADES:\s*(\d+)/i))) pedido.unidades = Number(m[1])
      else if ((m = s.match(/^TOTAL:\s*(\$?[\d.,]+)/i))) pedido.total = plata(m[1])
    }

    // Filas: textos de la tabla (debajo del encabezado) agrupados por altura.
    const cuerpo = pag.textos.filter(t => t.y < yEncabezado - 5 && t.s.trim())
    const filas: TextoPdf[][] = []
    for (const t of [...cuerpo].sort((a, b) => b.y - a.y)) {
      const fila = filas.find(f => Math.abs(f[0].y - t.y) <= 4)
      if (fila) fila.push(t)
      else filas.push([t])
    }

    for (const fila of filas) {
      const cel: Record<string, string> = {}
      for (const t of [...fila].sort((a, b) => a.x - b.x)) {
        const c = columna(t.x)
        if (c) cel[c] = (cel[c] ? cel[c] + ' ' : '') + t.s.trim()
      }
      const talles = parsearTalles(cel.talles ?? '')
      // Línea de totales del final ("200 $13,465") y renglones sueltos: no son un modelo.
      if (!cel.codigo || !/^\d+$/.test(cel.codigo) || talles.length === 0) continue

      const y = fila[0].y
      const foto = pag.imagenes.find(i => y >= i.y - 2 && y <= i.y + i.h + 2)
      const cantidad = num(cel.cantidad ?? '')
      const suma = talles.reduce((a, t) => a + t.cantidad, 0)
      if (cantidad && suma !== cantidad) {
        pedido.avisos.push(`El código ${cel.codigo} dice ${cantidad} pares pero los talles suman ${suma}. Se cargaron los talles.`)
      }
      pedido.items.push({
        codigo: cel.codigo,
        descripcion: (cel.producto ?? '').replace(/\s+/g, ' ').trim(),
        cantidad: suma,
        talles,
        costo: plata(cel.valor ?? ''),
        fotoNombre: foto?.name ?? null,
      })
    }
  }

  const pares = pedido.items.reduce((a, i) => a + i.cantidad, 0)
  if (pedido.unidades != null && pares !== pedido.unidades) {
    pedido.avisos.push(`El PDF dice ${pedido.unidades} pares y se leyeron ${pares}. Revisá la lista antes de confirmar.`)
  }
  if (!pedido.numero) pedido.avisos.push('No se encontró el número de pedido en el PDF.')
  return pedido
}

// ── Lectura real del archivo (pdf.js, se carga recién cuando se sube un PDF) ──

export interface PedidoLeido extends PedidoBA {
  fotos: Record<string, Blob>
}

async function imagenAJpeg(obj: { bitmap?: ImageBitmap; data?: Uint8ClampedArray; width: number; height: number; kind?: number }): Promise<Blob | null> {
  const canvas = document.createElement('canvas')
  canvas.width = obj.width
  canvas.height = obj.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  if (obj.bitmap) {
    ctx.drawImage(obj.bitmap, 0, 0)
  } else if (obj.data) {
    // kind 3 = RGBA, 2 = RGB (pdf.js ImageKind)
    const px = obj.width * obj.height
    const rgba = new Uint8ClampedArray(px * 4)
    if (obj.data.length === px * 4) rgba.set(obj.data)
    else if (obj.data.length === px * 3) {
      for (let i = 0, j = 0; i < px; i++) { rgba[j++] = obj.data[i * 3]; rgba[j++] = obj.data[i * 3 + 1]; rgba[j++] = obj.data[i * 3 + 2]; rgba[j++] = 255 }
    } else return null
    ctx.putImageData(new ImageData(rgba, obj.width, obj.height), 0, 0)
  } else return null
  return new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.85))
}

export async function leerPedidoPdf(file: File): Promise<PedidoLeido> {
  const pdfjs = await import('pdfjs-dist')
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = worker

  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const paginas: { textos: TextoPdf[]; imagenes: ImagenPdf[] }[] = []
  const fotos: Record<string, Blob> = {}

  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n)
    const tc = await page.getTextContent()
    const textos: TextoPdf[] = tc.items
      .filter((i): i is typeof i & { str: string; transform: number[] } => 'str' in i)
      .map(i => ({ s: i.str, x: i.transform[4], y: i.transform[5] }))

    // Posición de cada imagen: se sigue la matriz de transformación del dibujo.
    const ops = await page.getOperatorList()
    const imagenes: ImagenPdf[] = []
    const pila: number[][] = []
    let ctm = [1, 0, 0, 1, 0, 0]
    const mul = (a: number[], b: number[]) => [
      a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
      a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
      a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
    ]
    for (let k = 0; k < ops.fnArray.length; k++) {
      const f = ops.fnArray[k]
      if (f === pdfjs.OPS.save) pila.push(ctm)
      else if (f === pdfjs.OPS.restore) ctm = pila.pop() ?? ctm
      else if (f === pdfjs.OPS.transform) ctm = mul(ctm, ops.argsArray[k] as number[])
      else if (f === pdfjs.OPS.paintImageXObject) {
        const name = `p${n}_${ops.argsArray[k][0]}`
        imagenes.push({ name, x: ctm[4], y: ctm[5], w: Math.abs(ctm[0]), h: Math.abs(ctm[3]) })
        // Si una imagen no se puede leer, la fila queda sin foto (no se frena el pedido).
        const obj = await Promise.race([
          new Promise<Parameters<typeof imagenAJpeg>[0]>(res => page.objs.get(ops.argsArray[k][0], res)),
          new Promise<null>(res => setTimeout(() => res(null), 4000)),
        ])
        const blob = obj ? await imagenAJpeg(obj) : null
        if (blob) fotos[name] = blob
      }
    }
    paginas.push({ textos, imagenes })
  }

  return { ...parsearPedido(paginas), fotos }
}

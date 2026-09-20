import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { Heading1, Heading2, Type, Bold, Italic, Palette } from 'lucide-react'
import './RichTextEditor.css'

// Tipografías modernas nada más — nada de serif clásica (Georgia/Times,
// "estilo griego") ni slab tipo máquina de escribir (Courier, "estilo
// egipcio"). Inter/Poppins se suman vía Google Fonts en index.html; Plus
// Jakarta Sans y Barlow Condensed ya las carga la app para su propia marca.
const FONTS = ['Plus Jakarta Sans', 'Inter', 'Poppins', 'Barlow Condensed']
const COLORS = ['#ffffff', '#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ec4899']

interface RichTextEditorProps {
  value: string
  onChange: (html: string) => void
}

// Editor de texto enriquecido chiquito para el mensaje de "app bloqueada":
// títulos, subtítulos, negrita/cursiva, tipografía y color. Usa
// contentEditable + execCommand a propósito (sin dependencias) porque el
// alcance es mínimo: unos pocos botones, no un editor de documentos.
export function RichTextEditor({ value, onChange }: RichTextEditorProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [lastColor, setLastColor] = useState(COLORS[0])
  const [empty, setEmpty] = useState(!value?.trim())
  // Último HTML que ESTE editor emitió — para distinguir "el padre me
  // mandó un value nuevo de afuera" (hay que sincronizar el DOM) de "el
  // value nuevo es el eco de mi propio onChange" (el DOM ya está así, no
  // hay que tocarlo). Sin esto, cada Título/color/etc. terminaba
  // reemplazando por completo el innerHTML del contentEditable en cuanto
  // el estado volvía a bajar por props — eso invalida cualquier Selection
  // que apunte a esos nodos, así que si el usuario encadenaba una segunda
  // selección o click rápido, podía terminar aplicándose sobre el texto
  // equivocado (ej. el bloque de abajo) porque el DOM se reconstruía por
  // debajo de la selección justo en el medio.
  const lastEmitted = useRef<string | null>(null)

  useEffect(() => {
    if (value === lastEmitted.current) {
      setEmpty(!value?.trim())
      return
    }
    if (ref.current && ref.current.innerHTML !== value) {
      ref.current.innerHTML = value || ''
    }
    setEmpty(!value?.trim())
  }, [value])

  const emitChange = () => {
    const html = ref.current?.innerHTML ?? ''
    lastEmitted.current = html
    setEmpty(!html.trim() || html === '<br>')
    onChange(html)
  }

  const exec = (cmd: string, arg?: string) => {
    ref.current?.focus()
    // Sin esto, foreColor en Chrome a veces genera <font color="…"> en vez
    // de <span style="color:…">. El sanitizador (a propósito) no conoce
    // <font> — lo descarta por seguridad — así que el color elegido
    // desaparecía en la vista previa y en la pantalla real sin ningún
    // aviso. styleWithCSS fuerza el HTML moderno que sí sobrevive.
    document.execCommand('styleWithCSS', false, 'true')
    document.execCommand(cmd, false, arg)
    emitChange()
  }

  const pickColor = (c: string) => {
    setLastColor(c)
    exec('foreColor', c)
  }

  // Clave para que los botones de la barra funcionen: por default, al
  // clickear un botón fuera del contentEditable el navegador dispara
  // mousedown → blur → se pierde/colapsa la selección de texto — así que
  // cuando el onClick llama a exec(), ya no queda nada seleccionado para
  // aplicarle el formato. preventDefault en mousedown evita ese blur.
  const keepSelection = (e: MouseEvent) => e.preventDefault()

  return (
    <div className="rte">
      <div className="rte-toolbar">
        <div className="rte-group">
          <button type="button" onMouseDown={keepSelection} onClick={() => exec('formatBlock', 'h1')} title="Título"><Heading1 size={15} /></button>
          <button type="button" onMouseDown={keepSelection} onClick={() => exec('formatBlock', 'h2')} title="Subtítulo"><Heading2 size={15} /></button>
          <button type="button" onMouseDown={keepSelection} onClick={() => exec('formatBlock', 'p')} title="Texto normal"><Type size={15} /></button>
        </div>
        <span className="rte-sep" />
        <div className="rte-group">
          <button type="button" onMouseDown={keepSelection} onClick={() => exec('bold')} title="Negrita"><Bold size={15} /></button>
          <button type="button" onMouseDown={keepSelection} onClick={() => exec('italic')} title="Cursiva"><Italic size={15} /></button>
        </div>
        <span className="rte-sep" />
        <select
          className="rte-font"
          defaultValue=""
          onMouseDown={e => e.stopPropagation()}
          onChange={e => { if (e.target.value) exec('fontName', e.target.value); e.target.value = '' }}
        >
          <option value="" disabled>Fuente…</option>
          {FONTS.map(f => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
        </select>
        <div className="rte-colors">
          <Palette size={13} className="rte-colors-icon" />
          {COLORS.map(c => (
            <button
              key={c}
              type="button"
              className={`rte-color-swatch${lastColor === c ? ' active' : ''}`}
              style={{ background: c }}
              onMouseDown={keepSelection}
              onClick={() => pickColor(c)}
              title={c}
            />
          ))}
          <label className="rte-color-custom" style={{ background: lastColor }} title="Color personalizado" onMouseDown={keepSelection}>
            <input
              type="color"
              value={lastColor}
              onChange={e => pickColor(e.target.value)}
            />
          </label>
        </div>
      </div>
      <div className="rte-content-wrap">
        <div
          ref={ref}
          className="rte-content"
          contentEditable
          suppressContentEditableWarning
          onInput={emitChange}
          onBlur={emitChange}
        />
        {empty && (
          <p className="rte-placeholder">
            Escribí acá el mensaje que van a ver los usuarios bloqueados. Probá el título y algún color para que se note.
          </p>
        )}
      </div>
    </div>
  )
}

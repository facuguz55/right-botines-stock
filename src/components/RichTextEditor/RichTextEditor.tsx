import { useEffect, useRef } from 'react'
import { Heading1, Heading2, Type, Bold, Italic } from 'lucide-react'
import './RichTextEditor.css'

const FONTS = ['Arial', 'Georgia', 'Courier New', 'Trebuchet MS', 'Verdana', 'Times New Roman']
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

  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) {
      ref.current.innerHTML = value || ''
    }
  }, [value])

  const emitChange = () => onChange(ref.current?.innerHTML ?? '')

  const exec = (cmd: string, arg?: string) => {
    ref.current?.focus()
    document.execCommand(cmd, false, arg)
    emitChange()
  }

  return (
    <div className="rte">
      <div className="rte-toolbar">
        <button type="button" onClick={() => exec('formatBlock', 'h1')} title="Título"><Heading1 size={15} /></button>
        <button type="button" onClick={() => exec('formatBlock', 'h2')} title="Subtítulo"><Heading2 size={15} /></button>
        <button type="button" onClick={() => exec('formatBlock', 'p')} title="Texto normal"><Type size={15} /></button>
        <span className="rte-sep" />
        <button type="button" onClick={() => exec('bold')} title="Negrita"><Bold size={15} /></button>
        <button type="button" onClick={() => exec('italic')} title="Cursiva"><Italic size={15} /></button>
        <span className="rte-sep" />
        <select className="rte-font" defaultValue="" onChange={e => { if (e.target.value) exec('fontName', e.target.value); e.target.value = '' }}>
          <option value="" disabled>Fuente…</option>
          {FONTS.map(f => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
        </select>
        <div className="rte-colors">
          {COLORS.map(c => (
            <button
              key={c}
              type="button"
              className="rte-color-swatch"
              style={{ background: c }}
              onClick={() => exec('foreColor', c)}
              title={c}
            />
          ))}
          <input
            type="color"
            className="rte-color-custom"
            onChange={e => exec('foreColor', e.target.value)}
            title="Color personalizado"
          />
        </div>
      </div>
      <div
        ref={ref}
        className="rte-content"
        contentEditable
        suppressContentEditableWarning
        onInput={emitChange}
        onBlur={emitChange}
      />
    </div>
  )
}

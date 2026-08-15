const ALLOWED_TAGS = new Set(['H1', 'H2', 'P', 'B', 'STRONG', 'I', 'EM', 'SPAN', 'BR', 'U', 'DIV'])
const ALLOWED_STYLE_PROPS = new Set(['color', 'font-family', 'font-weight', 'font-style', 'text-align'])

// Sanitiza el HTML del mensaje de "app bloqueada" antes de guardarlo y antes
// de renderizarlo: solo permite las etiquetas que genera el RichTextEditor
// y, dentro de style, solo color/tipografía/alineación. Nada de atributos
// on*, href con javascript:, <script>, <iframe>, etc.
export function sanitizeHtml(html: string): string {
  const template = document.createElement('template')
  template.innerHTML = html

  const walk = (parent: Node) => {
    Array.from(parent.childNodes).forEach(child => {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement
        if (!ALLOWED_TAGS.has(el.tagName)) {
          while (el.firstChild) parent.insertBefore(el.firstChild, el)
          parent.removeChild(el)
          return
        }
        const style = el.getAttribute('style')
        Array.from(el.attributes).forEach(attr => el.removeAttribute(attr.name))
        if (style) {
          const safeDeclarations = style
            .split(';')
            .map(rule => rule.trim())
            .filter(Boolean)
            .filter(rule => {
              const prop = rule.split(':')[0]?.trim().toLowerCase()
              return prop && ALLOWED_STYLE_PROPS.has(prop)
            })
            .join('; ')
          if (safeDeclarations) el.setAttribute('style', safeDeclarations)
        }
        walk(el)
      } else if (child.nodeType !== Node.TEXT_NODE) {
        parent.removeChild(child)
      }
    })
  }

  walk(template.content)
  return template.innerHTML
}

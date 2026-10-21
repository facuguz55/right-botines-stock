// Tema claro del CRM, para usarlo a pleno sol o con mucha luz (el oscuro no se
// ve). Es una preferencia de cada dispositivo (localStorage) y solo vale
// mientras se está en el CRM: el resto de la app sigue oscura.
const KEY = 'crm-tema'

export type CrmTema = 'oscuro' | 'claro'

export function leerTemaCrm(): CrmTema {
  try { return localStorage.getItem(KEY) === 'claro' ? 'claro' : 'oscuro' } catch { return 'oscuro' }
}

export function guardarTemaCrm(tema: CrmTema): void {
  try { localStorage.setItem(KEY, tema) } catch { /* sin storage: queda solo en esta sesión */ }
}

export function aplicarTemaCrm(tema: CrmTema | null): void {
  const el = document.documentElement
  if (tema === 'claro') el.setAttribute('data-crm-tema', 'claro')
  else el.removeAttribute('data-crm-tema')
}

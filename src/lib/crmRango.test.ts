import { describe, it, expect } from 'vitest'
import { lunesDeISO, mesDelRango, presetsCrm, rangoDeMes, ultimosMeses } from './crmRango'

describe('crmRango', () => {
  it('el lunes de la semana (el domingo cuenta en la semana que termina)', () => {
    expect(lunesDeISO('2026-11-05')).toBe('2026-11-02') // jueves
    expect(lunesDeISO('2026-11-02')).toBe('2026-11-02') // lunes
    expect(lunesDeISO('2026-11-08')).toBe('2026-11-02') // domingo
  })

  it('un mes completo, y el actual hasta hoy', () => {
    expect(rangoDeMes('2026-10', '2026-11-05')).toEqual({ start: '2026-10-01', end: '2026-10-31' })
    expect(rangoDeMes('2026-11', '2026-11-05')).toEqual({ start: '2026-11-01', end: '2026-11-05' })
    expect(rangoDeMes('2028-02', '2028-03-10').end).toBe('2028-02-29')
  })

  it('los últimos meses cruzan el año', () => {
    expect(ultimosMeses('2026-02-10', 4)).toEqual(['2026-02', '2026-01', '2025-12', '2025-11'])
  })

  it('reconoce cuando el rango es justo un mes', () => {
    expect(mesDelRango({ start: '2026-10-01', end: '2026-10-31' }, '2026-11-05')).toBe('2026-10')
    expect(mesDelRango({ start: '2026-11-01', end: '2026-11-05' }, '2026-11-05')).toBe('2026-11')
    expect(mesDelRango({ start: '2026-10-01', end: '2026-10-20' }, '2026-11-05')).toBeNull()
    expect(mesDelRango({ start: '2026-10-02', end: '2026-10-31' }, '2026-11-05')).toBeNull()
  })

  it('presets: ayer, semana y mes pasado', () => {
    const p = Object.fromEntries(presetsCrm('2026-11-05').map(x => [x.label, x]))
    expect(p['Ayer']).toMatchObject({ start: '2026-11-04', end: '2026-11-04' })
    expect(p['Esta semana']).toMatchObject({ start: '2026-11-02', end: '2026-11-05' })
    expect(p['Semana pasada']).toMatchObject({ start: '2026-10-26', end: '2026-11-01' })
    expect(p['Mes pasado']).toMatchObject({ start: '2026-10-01', end: '2026-10-31' })
  })
})

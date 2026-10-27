import { describe, it, expect } from 'vitest'
import { planificarVideo } from './crmVideo'

const MB = 1024 * 1024

describe('planificarVideo', () => {
  it('un MP4 compatible que ya entra no se toca', () => {
    expect(planificarVideo({ bytes: 9 * MB, duracion: 30, esMp4Compatible: true, anchoMax: 1920 }).convertir).toBe(false)
  })
  it('un .mov / HEVC chico igual se convierte', () => {
    const p = planificarVideo({ bytes: 9 * MB, duracion: 30, esMp4Compatible: false, anchoMax: 1920 })
    expect(p.convertir).toBe(true)
  })
  it('60 MB de 30 s entra en 16 MB y mantiene 720p o más', () => {
    const p = planificarVideo({ bytes: 60 * MB, duracion: 30, esMp4Compatible: true, anchoMax: 1920 })
    expect(p.convertir).toBe(true)
    expect((p.bitrate! + 96_000) * 30 / 8).toBeLessThan(16 * MB)
    expect(p.ladoMax).toBeGreaterThanOrEqual(720)
  })
  it('un video largo baja la resolución antes de bajar más la calidad', () => {
    const p = planificarVideo({ bytes: 300 * MB, duracion: 240, esMp4Compatible: true, anchoMax: 1920 })
    expect(p.ladoMax).toBe(480)
    expect(p.demasiadoLargo).toBe(false)
  })
  it('uno larguísimo se rechaza en vez de quedar ilegible', () => {
    expect(planificarVideo({ bytes: 900 * MB, duracion: 900, esMp4Compatible: true, anchoMax: 1920 }).demasiadoLargo).toBe(true)
  })
})

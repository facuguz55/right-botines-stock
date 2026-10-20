// Horario del local (Santa Fe, hora de Argentina) y regla de los mensajes
// automáticos del CRM. Lunes a viernes de 9 a 13 y de 16 a 20, sábados de 9 a 13,
// domingos cerrado (ver INFO_NEGOCIO en crmNegocio.ts).

const MIN = (h: number) => h * 60
const MANANA_TARDE: [number, number][] = [[MIN(9), MIN(13)], [MIN(16), MIN(20)]]
// 0 = domingo ... 6 = sábado
export const HORARIOS: Record<number, [number, number][]> = {
  0: [], 1: MANANA_TARDE, 2: MANANA_TARDE, 3: MANANA_TARDE, 4: MANANA_TARDE, 5: MANANA_TARDE,
  6: [[MIN(9), MIN(13)]],
}

const DIA: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

export function estaAbierto(fecha: Date): boolean {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Argentina/Buenos_Aires', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(fecha)
  const dia = DIA[partes.find(p => p.type === 'weekday')?.value ?? 'Sun'] ?? 0
  const hora = Number(partes.find(p => p.type === 'hour')?.value ?? 0) % 24
  const minuto = Number(partes.find(p => p.type === 'minute')?.value ?? 0)
  const t = hora * 60 + minuto
  return HORARIOS[dia].some(([desde, hasta]) => t >= desde && t < hasta)
}

const HORA = 3600 * 1000

export interface EntradaAutomatico {
  ahora: Date
  // Hora del último mensaje de la conversación ANTES del que acaba de llegar (null si es nueva).
  mensajeAnteriorAt: Date | null
  // Última vez que el CRM mandó la ausencia en esta conversación.
  ultimaAusenciaAt: Date | null
  bienvenidaActiva: boolean
  ausenciaActiva: boolean
}

// Qué mensaje automático corresponde cuando el cliente escribe (o ninguno).
// Fuera de horario: la ausencia, una sola vez cada 6 horas por conversación.
// En horario: la bienvenida si es una conversación nueva o hace más de 12 horas
// que nadie escribe.
export function decidirAutomatico(e: EntradaAutomatico): 'bienvenida' | 'ausencia' | null {
  if (!estaAbierto(e.ahora)) {
    const reciente = e.ultimaAusenciaAt && e.ahora.getTime() - e.ultimaAusenciaAt.getTime() < 6 * HORA
    return e.ausenciaActiva && !reciente ? 'ausencia' : null
  }
  const hayCharlaReciente = e.mensajeAnteriorAt && e.ahora.getTime() - e.mensajeAnteriorAt.getTime() < 12 * HORA
  return e.bienvenidaActiva && !hayCharlaReciente ? 'bienvenida' : null
}

// empleado_id null = el dueño. La cuenta que hoy no ficha (fichajes.empleado_id
// es NOT NULL en la base) pero para la que igual queremos poder guardar un
// valor por hora, por si algún día ficha o solo por prolijidad de la tabla.
export interface ValorHora {
  id: string
  empleado_id: string | null
  valor_hora: number
  vigente_desde: string // 'YYYY-MM-DD'
}

export interface TurnoParaPago {
  empleado_id: string | null
  hora_entrada: string // timestamp ISO
  hora_salida: string | null // turno en curso: se ignora, no se paga hasta que cierre
}

export interface PagoPersona {
  empleadoId: string | null
  horas: number
  // Parte de "horas" trabajada antes de que existiera un valor por hora
  // vigente para esa persona en esa fecha. Se muestra aparte, nunca como $0
  // sumado al importe — sumarla como cero haría ver un total completo
  // cuando en realidad falta cargarle el valor a esas horas.
  horasSinValorizar: number
  importe: number
}

// El valor que regía para empleadoId en fechaISO: el de vigente_desde más
// reciente que no sea posterior a esa fecha. null si en ese momento la
// persona todavía no tenía ningún valor cargado (no es lo mismo que $0).
export function valorHoraEn(
  valores: ValorHora[], empleadoId: string | null, fechaISO: string
): number | null {
  let mejor: ValorHora | null = null
  for (const v of valores) {
    if (v.empleado_id !== empleadoId) continue
    if (v.vigente_desde > fechaISO) continue
    if (!mejor || v.vigente_desde > mejor.vigente_desde) mejor = v
  }
  return mejor ? mejor.valor_hora : null
}

// Agrupa los turnos por persona: horas totales, importe (sobre las horas
// exactas, no las redondeadas que se muestran) y cuánto de esas horas quedó
// sin valorizar. El valor de cada turno es el vigente el día en que empezó.
export function calcularPagos(turnos: TurnoParaPago[], valores: ValorHora[]): PagoPersona[] {
  const porPersona = new Map<string | null, PagoPersona>()

  for (const t of turnos) {
    if (!t.hora_salida) continue
    const horas = (new Date(t.hora_salida).getTime() - new Date(t.hora_entrada).getTime()) / 3_600_000
    if (!(horas > 0)) continue

    const fechaISO = t.hora_entrada.slice(0, 10)
    const valor = valorHoraEn(valores, t.empleado_id, fechaISO)

    const actual = porPersona.get(t.empleado_id)
      ?? { empleadoId: t.empleado_id, horas: 0, horasSinValorizar: 0, importe: 0 }
    actual.horas += horas
    if (valor == null) actual.horasSinValorizar += horas
    else actual.importe += horas * valor
    porPersona.set(t.empleado_id, actual)
  }

  return [...porPersona.values()]
}

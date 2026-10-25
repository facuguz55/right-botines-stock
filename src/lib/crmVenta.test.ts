import { describe, expect, it } from 'vitest'
import { clasificarPorReglas, montoDeLaCharla, type MensajeVenta } from './crmVenta'

// Charlas reales de Right (resumidas), revisadas a mano el 24/10.
// "C:" cliente, "L:" local, "[image]"/"[document]" archivo del cliente.
function charla(...lineas: string[]): MensajeVenta[] {
  return lineas.map((l, i) => {
    const direccion = l.startsWith('C:') ? 'in' : 'out'
    let t = l.slice(2).trim()
    let tipo = 'text'
    const archivo = t.match(/^\[(image|document)\]\s*/)
    if (archivo) { tipo = archivo[1]; t = t.slice(archivo[0].length) }
    return { direccion, tipo, contenido: t || null, transcripcion: null, media_url: null, timestamp: new Date(Date.UTC(2026, 9, 20, 12, i)).toISOString() }
  })
}
const clase = (m: MensajeVenta[]) => clasificarPorReglas(m).resultado

describe('ventas cerradas por WhatsApp', () => {
  // Las que tienen confirmación firme se marcan sin IA.
  it('Adrian: alias, comprobante y "quedó registrada tu compra"', () => {
    const m = charla(
      'C:[image]Quiero esos tiempo blancos talle 39, mandaría a buscar mañana con un transporte',
      'L:Dale buenisimo, los dejarías pagos o pagan al retirar?',
      'C:Te transfiero', 'C:Pásame alias',
      'L:Dale, el alias es BOTINES.RIGHT a nombre de Marcelo benjamín Fernández',
      'L:Y te dejo unos datos que necesitaría que me completes para el retiro',
      'C:[image]',
      'C:DATOS DE RETIRO •Nombre y apellido: Mario •DNI: 34549351',
      'L:Listo, quedó registrada tu compra: - Nike Tiempo Blanco talle 39',
    )
    expect(clase(m)).toBe('venta')
  })
  it('Alan: precio, alias, comprobante y "muchísimas gracias"', () => {
    const m = charla(
      'C:[image]hola buenos dias, tenes este par en numero 40?',
      'L:Sisi! Lo tenemos disponibles, los querías con envío?',
      'C:me lo podrías alcanzar a mi depto?', 'L:$3.700 el envio hasta ahi', 'C:te transfiero todo, puede ser?',
      'L:te quedaria en $102.700 con transferencia', 'L:BOTINES.RIGHT a nombre de marcelo benjamin fernandez',
      'C:en 15 te transfiero, porq recien estoy saliendo de cursar',
      'L:Dale perfecto, sin drama! Cuando puedas nomas pasame el comprobante y hacemos el envio',
      'C:[image]', 'L:Dale buenisimo, Muchísimas gracias',
    )
    // Solo "muchísimas gracias": la IA confirma mirando la foto del comprobante.
    expect(clase(m)).toBe('dudoso')
  })
  it('Malu: link de Mercado Pago con tarjeta (historial importado)', () => {
    const m = charla(
      'C:Quería encargar unos botines F5 para hombre',
      'L:El total con envío incluido sería de $134.500 en efectivo/transferencia o $169.100 con tarjeta en 3 cuotas',
      'L:Confírmame como querrías pagar y te envío link de pago o alias',
      'C:Con tarjeta, 3 cuotas', 'L:Dale buenisimo ahí te envío', 'L:Ingresá al link para pagar https://mpago.la/17wG5yM',
      'C:(foto no incluida en la exportación)', 'L:Recibido! Muchas gracuas',
    )
    expect(clasificarPorReglas(m)).toEqual({ resultado: 'venta', monto: 169100 })
  })
  it('Lola: avisa el comprobante y "Recibido! Muchas gracias por elegirnos"', () => {
    const m = charla(
      'C:Quisiera esto botines', 'C:Y sería en transferencia', 'L:Dale, quedaría entonces en $108.500 con transferencia',
      'L:BOTINES.RIGHT Ese sería el alias a nombre de Marcelo benjamín Fernández', 'L:DATOS DE ENVIO •Nombre y apellido:',
      'C:DATOS DE ENVIO •Nombre y apellido: Lola', 'C:Ahí te paso comprobante', 'C:(foto no incluida en la exportación)',
      'L:Recibido! Muchas gracias por elegirnos! ☺️🫶',
    )
    expect(clasificarPorReglas(m)).toEqual({ resultado: 'venta', monto: 108500 })
  })
  it('Mel: compra nueva por chat aunque nombra un pedido anterior', () => {
    expect(clase(charla(
      'L:Sino también si te parece te puedo tomar la compra por acá', 'L:Que modelos te había gustado?',
      'C:(foto no incluida en la exportación)', 'C:En talle 41', 'C:Y quería personalizarlos', 'C:Y ya te envío el comprobante',
      'C:Me pasas el alias', 'L:BOTINES.RIGHT Ese sería el alias a nombre de Marcelo benjamín Fernández', 'L:Es de personal pay',
      'C:attachment.pdf • 1 página (documento no incluido en la exportación)', 'L:Recibido! Muchas gracias por elegirnos nuevamente 🤗',
      'C:El número de orden del anterior es #826', 'L:Dale muchas gracias!',
    ))).toBe('venta')
  })
  it('Gonzaa: "quedó registrada tu compra" unos mensajes después del comprobante', () => {
    expect(clase(charla(
      'L:Con envío incluido te quedaría en $108.500 con transferencia!', 'C:Te pagaría por transferencia',
      'L:BOTINES.RIGHT a nombre de Marcelo benjamín Fernández', 'C:Dale ya te paso', 'C:[image]', 'L:Perfecto, muchas gracias',
      'L:DATOS DE ENVIO •Nombre y apellido:', 'L:Esos datos vamos a necesitar para el envío', 'C:DATOS DE ENVIO •Nombre: Gonzalo',
      'C:Perdona', 'C:Ya te mando completo', 'C:DATOS DE ENVIO •Nombre: Gonzalo •DNI', 'L:Buenísimo! Muchas gracias! Mañana ya va a estar saliendo 🤗',
      'L:Listo, quedó registrada tu compra: - Nike Vapor Rosa Blanco talle 44',
    ))).toBe('venta')
  })
})

describe('pedidos de la web pagados por WhatsApp', () => {
  it('Jero: comprobante de un pedido #969', () => {
    expect(clase(charla(
      'C:[image]Hola soy Jerónimo de tucumán te envío el comprobante de los botines que compré.', 'C:?',
      'L:Hola! Tu pedido #969 (Nike Mercurial vini fly) ya está confirmado, lo estamos preparando.',
    ))).toBe('web')
  })
  it('Juan: "realicé una compra"', () => {
    expect(clase(charla('C:[image]', 'C:Hola realice una compra de unos botines de f5', 'L:Hola buenas! Recibido! Muchas gracias por elegirnos 🤗'))).toBe('web')
  })
  it('Aberturas: compra en la página con datos de cuenta por chat', () => {
    expect(clase(charla(
      'C:Hago la compra desde la página no?', 'L:Sisi se puede hacer por la página sino también le puedo tomar la compra por acá',
      'C:A sisi lo hago por transferencia', 'L:CBU 4530000800010602605697 Alias NARANJA.BOTINES',
      'L:El total por transferencia es de $145,000 con envío incluido a domicilio', 'C:[image]',
      'L:Muchas gracias! Te dejo los datos que necesitaría para el envío', 'C:Si si', 'L:Disculpa! En la web ya están cargados!',
    ))).toBe('web')
  })
})

describe('no son ventas nuevas', () => {
  it('Santino: cambio de talle pagando la diferencia → lo decide la IA', () => {
    expect(clase(charla(
      'L:Dale perfecto! Vamos a hacer el cambio de botines a talle 43 y le sumamos las pantorrilleras',
      'L:Te paso el alias: BOTINES.RIGHT a nombre de Marcelo Fernández', 'C:serian estos de f5',
      'L:En ese caso la diferencia que tendría que cobrarte es de $7.000', 'C:[image]', 'L:Perfecto, muchas gracias!',
    ))).not.toBe('venta')
  })
  it('Denis: fotos de los botines que le llegaron', () => {
    expect(clase(charla(
      'C:Buenas! Llegaron los botines todo perfecto, gracias por las pantorrilleras!', 'C:[image]', 'C:[image]',
      'L:Muchas gracias por mandarnos!! Nos alegra muchísimo que te hayan gustado',
    ))).toBe('nada')
  })
  it('pasó el alias pero el cliente todavía no pagó', () => {
    expect(clase(charla(
      'C:El pago lo tengo que hacer por la página?', 'L:Dale grnial, sería entonces $108.500 con envío incluido',
      'L:BOTINES.RIGHT Ese sería el alias', 'C:(foto no incluida en la exportación)', 'C:Bandera de arg',
      'L:Dale buenisimo! Muchas gracias', 'L:Ni bien puedas envíame estos datos nomas así ya hacemos el rotulo',
    ))).not.toBe('venta')
  })
  it('consulta de precio con foto de un botín', () => {
    expect(clase(charla('C:[image]Que precio están?', 'L:Ese modelo por el momento no lo tenemos', 'C:Bueno 👍🏻'))).toBe('nada')
  })
})

describe('montoDeLaCharla', () => {
  it('elige transferencia salvo que el cliente pague con tarjeta', () => {
    const precio = 'L:$99.000 en efectivo/transferencia o $128.000 con tarjeta en 3 cuotas sin intereses'
    expect(montoDeLaCharla(charla(precio, 'C:Transferencia'))).toBe(99000)
    expect(montoDeLaCharla(charla(precio, 'C:Con tarjeta'))).toBe(128000)
  })
})

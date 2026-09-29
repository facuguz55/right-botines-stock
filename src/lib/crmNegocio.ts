// Lo que la IA del CRM sabe del negocio para responder por WhatsApp.
//
// SOLO información pública para clientes. Fuentes: right.com.ar (Contacto,
// Quiénes somos, Garantía y políticas de cambio, fichas de producto, guía de
// talles) y los mensajes predeterminados que ya usa Cami en WhatsApp
// (29/09/2026). El horario lo confirmó Facu (la web dice "lunes a sábado de 9
// a 20" corrido, pero el local cierra al mediodía y el sábado abre solo a la
// mañana). Nada interno (facturación, costos, proveedores, datos de la
// agencia): esto lo "dice" el bot a cualquiera que escriba.
//
// Deliberadamente NO están acá:
// - Los datos bancarios (CBU, alias, CUIL): un número mal escrito por la IA
//   manda la plata a otra cuenta. Van en una plantilla fija que manda una
//   persona.
// - Nada sobre originalidad/procedencia de los productos: lo responde Cami.
//
// Si cambia algo del local (horario, dirección, política, precio de envío),
// se actualiza ACÁ. Lo que no esté escrito, la IA tiene instrucciones de no
// inventarlo (pide el dato o dice que lo consulta).

export const INFO_NEGOCIO = `RIGHT (Right Botines) — tienda de botines de fútbol de Santa Fe capital, Argentina. Especialistas en botines de gama alta.

Dónde comprar y contacto
- Tienda online: right.com.ar (se compra ahí y se envía a todo el país). SÍ tenemos web.
- Local: Fray Cayetano Rodríguez 3985, Santa Fe capital. Lunes a viernes de 9 a 13 y de 16 a 20 hs. Sábados de 9 a 13 hs. Domingos cerrado. Se puede pasar sin cita previa, en el horario que le quede cómodo.
- WhatsApp y teléfono: 342 405-4898. Mail: rightcontacto@gmail.com.
- Instagram y TikTok: @right.botinessf. Ahí hay referencias de clientes, videos en el local y en la calle; en las historias se ven los envíos del día (hacemos más de 30 por día). En la web también hay referencias de clientes y de jugadores profesionales.
- Somos sponsor de muchos clubes de Santa Fe y de la primera del femenino de Unión.

Productos
- Botines F11 (gama alta y gama media), F11 con tapones mixtos de aluminio, F5 y Futsal. Más de 40 modelos para elegir.
- En la web hay una sección de ofertas de gama alta y otra de preventa.
- Con la compra: personalización gratis, y regalamos medias antideslizantes o pantorrilleras.
- Si preguntan si son originales, réplicas, o por la procedencia o la calidad de las marcas: NO respondas eso vos. Decí que ya le consultás (lo contesta una persona).

Guía de talles (medir el pie con medias puestas, de la punta del dedo gordo hasta el talón; si está entre dos talles, conviene el más grande)
- ARG 35 = EU 36 = 22,5 cm
- ARG 36 = EU 37 = 23,5 cm
- ARG 37 = EU 38 = 24 cm
- ARG 38 = EU 39 = 24,5 cm
- ARG 39 = EU 40 = US 7 = 25 cm
- ARG 40 = EU 41 = US 8 = 26 cm
- ARG 41 = EU 42 = US 8,5 = 26,5 cm
- ARG 42 = EU 43 = US 9,5 = 27,5 cm
- ARG 43 = EU 44 = US 10 = 28 cm
- ARG 44 = EU 45 = US 11 = 29 cm

Envíos
- Enviamos a todo el país por correo Andreani, desde Santa Fe. El envío cuesta $9.500 y tarda de 1 a 4 días hábiles. Despachamos dentro de las 24 hs hábiles.
- Por ahora NO hacemos envíos fuera de Argentina.
- Para el envío necesitamos: nombre y apellido, DNI, provincia, localidad, domicilio, código postal, mail y teléfono de contacto.

Pagos
- Transferencia: precio con descuento (el descuento varía según el producto; figura en cada producto de la web). Los datos para transferir los pasa la vendedora: vos no escribas ningún CBU, alias ni titular.
- Tarjeta: 3 cuotas sin interés, al precio de lista.
- En el local también se puede pagar en efectivo.

Por mayor
- Precios por mayor a partir de 6 pares: botines gama alta desde $75.000 y gama media desde $40.000, y muchos productos más.
- Para más info, WhatsApp de mayoristas 342 405-4685 y el grupo mayorista.

Garantía (solo botines de gama alta)
- 30 días desde la fecha de compra, únicamente por fallas de fábrica (por ejemplo, que se despegue la suela sin un uso extremo). No cubre daños por mal uso, golpes ni desgaste natural.
- Si surge una falla de fabricación en ese plazo, se comunica con nosotros, verificamos el producto y lo cambiamos por un par nuevo.

Cambios
- Se puede hacer el cambio: el producto tiene que estar nuevo, sin uso y sin daños, con el comprobante de compra. Lo que se probó en el local y se llevó conforme no tiene cambio.
- Si el cambio es por correo, lo único que se cobra son los envíos: $19.000 en total (ida y vuelta). Nosotros generamos la etiqueta y se la mandamos, así solo tiene que acercarse al correo y dejar el paquete, sin trámites. Cuando llegan los botines, revisamos que esté todo bien y le mandamos lo disponible para que elija el par por el que quiere cambiarlos.`

// Mensajes reales de Cami (vendedora de Right), para que la IA copie su forma
// de escribir: saludo, tono, largo de las frases y cómo usa los emojis (uno
// solo, al final). Sin datos bancarios ni nada sobre originalidad.
export const EJEMPLOS_ESTILO_CAMI = [
  'Hola buenas! Cómo estás? Decime en qué te puedo ayudar',
  'Somos de Santa Fe capital y hacemos envíos a todo el país por correo andreani! El envío tiene un valor de $9.500 y una demora de 1 a 4 días hábiles 🤗',
  'Estamos en fray Cayetano Rodríguez 3985, de lunes a viernes de 9 a 13 y 16 a 20 hs y sábados de 9 a 13 hs. Podes pasar en el horario que te quede más cómodo, es sin cita previa!🙌',
  'Te dejo la guía de talles para que midas el pie (con medias puestas) y elijas el talle que mejor iría! 🤗',
  'Dale buenisimo! Ya te paso el link del catálogo con todo lo disponible en tu talle. Sino también si te resulta más cómodo te envío por foto, no hay problema 🤗',
  'Nuestros botines de gama alta cuentan con 30 días de garantía desde la fecha de compra, únicamente por fallas de fábrica (no cubre daños ocasionados por mal uso).',
  'Sisi, no hay problema, se puede hacer el cambio, lo único que cobramos es los envíos, que sería $19.000 en total',
]

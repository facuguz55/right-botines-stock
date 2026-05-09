# Prompt Maestro — Right Botines Stock

## Objetivo
Construir una aplicación web interna llamada **Right Botines Stock** para la gestión de inventario de un local de botines de fútbol en Argentina. La app es de uso exclusivo de los dueños del local. Reemplaza un sistema caótico de carpetas con fotos en Windows y un Excel desactualizado.

El objetivo central es que los dueños puedan ver su stock visualmente (con fotos), registrar ventas con un clic, y tener un dashboard con métricas clave del negocio.

---

## Stack tecnológico
- **Frontend:** React 19 + TypeScript + Vite
- **Base de datos:** Supabase (PostgreSQL)
- **Estilos:** CSS tradicional (sin Tailwind, sin frameworks de UI)
- **Charts:** Recharts
- **Hosting:** Vercel
- **Almacenamiento de imágenes:** Supabase Storage

No introducir librerías fuera de este stack sin consultar primero.

---

## Contexto del negocio
- Local físico de botines de fútbol en Argentina
- Actualmente organizan el stock en carpetas de Windows por talle (ej: `8,5us - 41arg`, `10us - 43arg`) con fotos sin nombres útiles
- También tienen un Excel desactualizado porque mantenerlo sincronizado es difícil
- Venden por WhatsApp e Instagram
- El problema principal: confusión de modelo/color, stock desactualizado, doble trabajo
- Los talles se expresan en formato americano (us) y argentino (arg)

---

## Funcionalidades

### 1. Gestión de stock
- Agregar modelo de botín con los siguientes campos:
  - Fotos múltiples (subidas a Supabase Storage, sin etiquetas, mínimo 1 requerida)
  - Marca (Nike, Adidas, Puma, New Balance, Mizuno, Umbro, Under Armour, Joma, Otra)
  - Modelo (ej: Predator, Mercurial, Phantom)
  - Categoría: F5 / F11 / Futsal / Hockey
  - Gama: Económica / Media / Alta
  - Talles: múltiples pares por modelo, cada uno con talle US, talle ARG y cantidad
  - Precio de costo (ARS)
  - Precio de venta (ARS) — sin recargo de tarjeta
  - Código de referencia (generado automáticamente, fijo e inamovible)
  - Notas (campo libre para aclaraciones internas, ej: "tiene rayón en la puntera")
- Grilla visual con fotos de todos los modelos en stock
- Filtros: por talle, marca, categoría, gama, disponibilidad ✅ (todos implementados)
- Búsqueda por código de referencia o modelo ✅
- Búsqueda por foto: el usuario sube una foto y el sistema busca el producto exacto primero; si no encuentra, muestra productos del mismo modelo en otros colores o talles ✅
- Editar cualquier campo de un modelo existente (excepto el código de referencia) ✅
- Eliminar modelo ✅

### 1b. Sistema de códigos de referencia
- El código se genera automáticamente al crear el producto, combinando:
  - Primeras 3 letras de la marca (ej: ADI, NIK, PUM)
  - Primeras 4 letras del modelo (ej: PRED, MERC, PHAN)
  - Talle ARG (ej: 42)
  - Categoría + Gama abreviados (ej: F5A = F5 Alta, F5M = F5 Media, F5E = F5 Económica, F11A, F11M, FUT, HOC)
  - Ejemplo: ADI-PRED-42-F5A
- El código es único, fijo e inamovible — no se puede editar una vez creado
- Si hay colisión, se agrega un sufijo numérico (ej: ADI-PRED-42-F5A-2)

### 2. Marcar como vendido
- Botón "Vender" en cada modelo ✅
- Al vender se registra: precio de venta, medio de pago (Efectivo / Transferencia / Tarjeta)
- Si el medio de pago es Tarjeta, se aplica automáticamente +10% al precio y se muestra el precio final ✅
- Descuenta 1 unidad del stock del talle seleccionado automáticamente ✅
- Si llega a 0: se marca como agotado visualmente ✅
- Registra la venta en el historial con fecha, precio y medio de pago ✅

### 3. Ingreso de mercadería
- Agregar stock nuevo (productos nuevos o sumar unidades a existentes) ✅
- Registrar fecha de ingreso y costo total del lote ✅

### 4. Alertas
- Último par disponible → badge visual de alerta en la grilla ✅
- Sin stock → producto marcado como agotado (visible pero diferenciado) ✅
- Stock mínimo configurable por producto — el dueño define el umbral (ej: "avisame cuando queden menos de 2 pares")
- Los productos que alcanzaron el stock mínimo aparecen destacados en el dashboard con una sección de alertas activas

### 5. Historial de ventas
- Lista de todas las ventas registradas ✅
- Campos: fecha, producto, talle, precio de venta, ganancia (precio venta - costo) ✅
- Filtro por rango de fechas ✅

### 5b. Historial de precios
- Cada vez que se modifica el precio de venta de un producto, se registra el precio anterior con fecha y hora ✅
- Visible dentro de la ficha del producto como un historial cronológico ✅

### 6. Dashboard
- Total de pares en stock ✅
- Ventas del mes actual ✅
- Ganancia estimada del mes (suma de márgenes) ✅
- Talles que más rotan (top 5) ✅
- Gráfico de ventas por semana (Recharts) ✅

### 7. Exportación
- Exportar stock a CSV/Excel ✅

### 8. Importación masiva desde Excel de TiendaNube
- Botón "Importar desde TiendaNube" en la sección stock ✅
- La app lee directamente el formato de exportación de TiendaNube (.xlsx)
- Mapea automáticamente los campos: Nombre → marca + modelo, Categorías → categoría + gama, Talle → talle ARG + talle US, Precio → precio venta, Costo → precio costo, Stock, SKU → notas
- Genera los códigos de referencia automáticamente para cada producto importado
- Muestra una previsualización de todos los productos antes de confirmar ✅
- Al confirmar, carga todo al stock ✅
- Las fotos se agregan después producto por producto
- Uso: solo para carga inicial de inventario, no para sincronización de ventas

---

## Diseño y UI
- App de uso interno, no pública — priorizá claridad y velocidad de uso sobre estética elaborada
- Tema oscuro preferido (los dueños usan la app en el local)
- Grilla de productos tipo "galería" con foto grande, modelo, talle y estado visible de un vistazo
- Tipografía limpia y legible
- Sin animaciones complejas — micro-interacciones sutiles están bien
- Paleta sugerida: fondo oscuro (#0f0f0f o similar), acento verde o naranja para CTAs, blanco para texto principal
- Mobile-friendly: los dueños pueden usarla desde el celular en el local

---

## Estructura de base de datos (Supabase)

> La arquitectura central usa **modelos** (un modelo = una línea de botín) con múltiples talles por modelo. Esto permite gestionar el stock de todos los talles de un mismo par en una sola ficha.

### Tabla: `modelos`
| campo | tipo |
|---|---|
| id | uuid |
| marca | text |
| modelo | text |
| categoria | text (F5, F11, Futsal, Hockey) |
| gama | text (Económica, Media, Alta) |
| precio_costo | numeric |
| precio_venta | numeric |
| codigo_ref | text (unique, generado automáticamente, inmutable) |
| notas | text (nullable) |
| stock_minimo | integer (default: 1) |
| created_at | timestamp |

### Tabla: `modelo_talles`
| campo | tipo |
|---|---|
| id | uuid |
| modelo_id | uuid (FK → modelos) |
| talle_us | numeric |
| talle_arg | numeric |
| cantidad | integer |

### Tabla: `modelo_fotos`
| campo | tipo |
|---|---|
| id | uuid |
| modelo_id | uuid (FK → modelos) |
| foto_url | text |
| orden | integer |
| created_at | timestamp |

### Tabla: `ventas`
| campo | tipo |
|---|---|
| id | uuid |
| modelo_id | uuid (FK → modelos) |
| talle_arg | numeric |
| fecha | timestamp |
| precio_venta | numeric |
| medio_pago | text (Efectivo, Transferencia, Tarjeta) |
| recargo_tarjeta | numeric (nullable) |
| ganancia | numeric |

### Tabla: `ingresos`
| campo | tipo |
|---|---|
| id | uuid |
| modelo_id | uuid (FK → modelos) |
| fecha | timestamp |
| cantidad | integer |
| costo_total | numeric |

### Tabla: `historial_precios`
| campo | tipo |
|---|---|
| id | uuid |
| modelo_id | uuid (FK → modelos) |
| precio_venta_anterior | numeric |
| precio_venta_nuevo | numeric |
| fecha | timestamp |

---

## Estado actual (mayo 2026)

**Construido y funcionando:**
- Estructura completa de componentes React + TypeScript
- Conexión a Supabase operativa
- Migraciones SQL aplicadas en el proyecto `xpzkotmxetyofbrizvny`
- CRUD completo de modelos con talles múltiples
- Registro y historial de ventas
- Registro de ingresos de mercadería
- Historial de precios
- Dashboard con métricas y gráfico
- Filtros: marca, categoría, gama, talle, disponibilidad ✅ (filtro por talle agregado)
- Búsqueda por texto
- Búsqueda por foto (PhotoSearch)
- Importación desde TiendaNube (.xlsx)
- Exportación a CSV
- Storage de fotos en Supabase (`fotos-botines`, bucket público)
- TypeScript sin errores

**Pendiente:**
- Deploy a Vercel (`.vercel` ya en `.gitignore`)
- Stock mínimo configurable con alertas en dashboard

---

## Restricciones
- Sin sistema de login por ahora — la app es de acceso directo (uso interno)
- Sin integración con WhatsApp, Instagram ni redes sociales en este MVP
- Sin facturación ni cuentas corrientes
- No duplicar lógica ni componentes
- CSS tradicional, no Tailwind
- Variables de entorno en `.env`, nunca hardcodeadas
- `.env` siempre en `.gitignore`

---

## Funcionalidades futuras (no construir ahora, pero tener en cuenta para no bloquearlas)
- Sincronización de ventas web con TiendaNube vía webhook — las ventas de la tienda online aparecen en un apartado "Ventas Web" separado de las ventas del local, con totales combinados en el dashboard
- Tienda web pública para clientes
- Sistema de login con roles (dueño / empleado)
- Integración con WhatsApp para notificar ventas
- Múltiples sucursales
- Cuentas corrientes con proveedores

---

## Criterios de aceptación
- El dueño puede agregar un botín con fotos múltiples en menos de 2 minutos
- El código de referencia se genera automáticamente y no se puede editar
- Al marcar una venta, el stock se actualiza instantáneamente sin recargar la página
- La grilla muestra correctamente productos agotados y con stock mínimo diferenciados
- La búsqueda por foto devuelve el producto correcto o similares
- El dashboard muestra alertas de stock mínimo en tiempo real
- El historial de precios registra cada cambio con fecha
- La app funciona correctamente en mobile (celular)
- El CSV exportado abre correctamente en Excel

---

## Idioma
Todo el código en inglés (variables, funciones, componentes). Todo el texto visible en la UI en español argentino (vos, acá, etc.).

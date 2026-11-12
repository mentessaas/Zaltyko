---
name: Zaltyko
description: Software de dirección para academias de gimnasia, rotulado como un suelo de competición. «Magnesio sobre tapiz».
colors:
  mat: "#1E3FA8"
  mat-deep: "#14307F"
  mat-night: "#0B1430"
  mat-light: "#5B7BE0"
  mat-lane: "#8FB4FF"
  mat-wash: "#E8EDFB"
  chalk: "#F4F6F2"
  chalk-dust: "#E9ECE6"
  chalk-line: "#D5DAE3"
  tape: "#FFFFFF"
  signal: "#E5482A"
  signal-ink: "#B8331A"
  signal-dark: "#C2391E"
  signal-wash: "#FDECE7"
  ramp-300: "#B4BCCB"
  ramp-400: "#8A93A8"
  ramp-500: "#5C6782"
  ramp-600: "#3E4A66"
  ramp-700: "#27314C"
  ramp-800: "#162038"
typography:
  display:
    fontFamily: "Archivo, ui-sans-serif, system-ui"
    fontSize: "clamp(2.75rem, 8vw, 6rem)"
    fontWeight: 900
    lineHeight: 0.9
    letterSpacing: "-0.01em"
    fontVariation: "'wdth' 72"
  headline:
    fontFamily: "Archivo, ui-sans-serif, system-ui"
    fontSize: "clamp(2.25rem, 5vw, 4rem)"
    fontWeight: 900
    lineHeight: 0.92
    letterSpacing: "-0.005em"
    fontVariation: "'wdth' 72"
  title:
    fontFamily: "Archivo, ui-sans-serif, system-ui"
    fontSize: "clamp(2rem, 3.5vw, 3rem)"
    fontWeight: 900
    lineHeight: 0.95
    letterSpacing: "-0.005em"
    fontVariation: "'wdth' 72"
  panel-title:
    fontFamily: "Archivo, ui-sans-serif, system-ui"
    fontSize: "1.5rem"
    fontWeight: 900
    lineHeight: 1
    fontVariation: "'wdth' 72"
  step-current:
    fontFamily: "Archivo, ui-sans-serif, system-ui"
    fontSize: "6rem"
    fontWeight: 900
    lineHeight: 0.8
    fontFeature: "'tnum' 1"
    fontVariation: "'wdth' 72"
  step-pending:
    fontFamily: "Archivo, ui-sans-serif, system-ui"
    fontSize: "3rem"
    fontWeight: 900
    lineHeight: 1
    fontFeature: "'tnum' 1"
    fontVariation: "'wdth' 72"
  row-title:
    fontFamily: "Archivo, ui-sans-serif, system-ui"
    fontSize: "1.25rem"
    fontWeight: 800
    lineHeight: 1.25
    fontVariation: "'wdth' 72"
  figure:
    fontFamily: "Archivo, ui-sans-serif, system-ui"
    fontSize: "1.875rem"
    fontWeight: 900
    lineHeight: 1
    fontFeature: "'tnum' 1"
    fontVariation: "'wdth' 72"
  body:
    fontFamily: "Archivo, ui-sans-serif, system-ui"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.75
  lede:
    fontFamily: "Archivo, ui-sans-serif, system-ui"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.625
  label:
    fontFamily: "Archivo, ui-sans-serif, system-ui"
    fontSize: "0.75rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.08em"
    fontVariation: "'wdth' 80"
rounded:
  control: "6px"
  md: "8px"
  card: "10px"
  xl: "12px"
  modal: "16px"
spacing:
  gutter-sm: "24px"
  gutter-md: "40px"
  gutter-lg: "56px"
  row: "16px"
  panel: "24px"
  section: "80px"
  section-lg: "112px"
components:
  button-primary:
    backgroundColor: "{colors.mat}"
    textColor: "{colors.tape}"
    rounded: "{rounded.md}"
    padding: "10px 24px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.mat-deep}"
  button-outline:
    backgroundColor: "{colors.tape}"
    textColor: "{colors.mat-night}"
    rounded: "{rounded.md}"
    padding: "10px 24px"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.mat-wash}"
    textColor: "{colors.mat-deep}"
    rounded: "{rounded.md}"
    padding: "10px 24px"
    height: "44px"
  button-destructive:
    backgroundColor: "{colors.signal-ink}"
    textColor: "{colors.tape}"
    rounded: "{rounded.md}"
    padding: "10px 24px"
    height: "44px"
  button-destructive-hover:
    backgroundColor: "#9A2914"
  button-tape:
    backgroundColor: "{colors.tape}"
    textColor: "{colors.mat-deep}"
    rounded: "{rounded.md}"
    padding: "0 28px"
    height: "56px"
  button-tape-hover:
    backgroundColor: "{colors.chalk}"
  card:
    backgroundColor: "{colors.tape}"
    textColor: "{colors.mat-night}"
    rounded: "{rounded.xl}"
    padding: "24px"
  panel-ruled:
    backgroundColor: "{colors.tape}"
    textColor: "{colors.mat-night}"
    rounded: "{rounded.xl}"
    padding: "20px"
  group-tag:
    backgroundColor: "{colors.tape}"
    textColor: "{colors.mat-night}"
    rounded: "{rounded.md}"
    padding: "4px 8px"
  input:
    backgroundColor: "{colors.tape}"
    textColor: "{colors.mat-night}"
    rounded: "{rounded.card}"
    padding: "8px 16px"
    height: "44px"
  badge:
    backgroundColor: "{colors.mat-wash}"
    textColor: "{colors.mat-deep}"
    rounded: "{rounded.md}"
    padding: "2px 10px"
  badge-error:
    backgroundColor: "{colors.signal-wash}"
    textColor: "{colors.signal-ink}"
    rounded: "{rounded.md}"
    padding: "2px 10px"
  state-chip-live:
    backgroundColor: "{colors.mat}"
    textColor: "{colors.tape}"
    rounded: "{rounded.control}"
    padding: "4px 8px"
  state-chip-ready:
    backgroundColor: "{colors.chalk-dust}"
    textColor: "{colors.ramp-600}"
    rounded: "{rounded.control}"
    padding: "4px 8px"
  floor-tag:
    backgroundColor: "{colors.mat-night}"
    textColor: "{colors.tape}"
    rounded: "{rounded.control}"
    padding: "4px 8px"
  sidebar-item-active:
    backgroundColor: "{colors.tape}"
    textColor: "{colors.mat-deep}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "40px"
---

# Design System: Zaltyko

## Contrato de dirección

- **Tesis:** la academia vista desde la pista. Rechaza el SaaS blanco con captura de panel: el producto se demuestra contando la tarde con marcas de magnesio.
- **Mundo propio:** tapiz azul de competición (#1E3FA8, #14307F, noche #0B1430), blanco magnesio (#F4F6F2), cinta de límite blanca de 5 cm como estructura, coral señal (#E5482A) solo para alertas. Archivo condensada en mayúsculas para rótulos, Archivo normal para trabajar, cifras tabulares.
- **Historia:** la directora entiende que Zaltyko habla de grupos, niveles y sesiones; ve la tarde contada en palotes; crea su academia.
- **Primera pantalla:** tapiz azul a sangre con marco de cinta; titular condensado blanco a la izquierda a 5-6rem; a la derecha la sesión de hoy donde tocar a una gimnasta añade un palote de magnesio; CTA blanco tipo cinta bajo el titular.
- **Forma:** Magnesio sobre tapiz, candidata 7 de 7, seed 709cef6f.
- **Cierre:** sin revisión ni documentación no está terminado; cada imagen que se publique lleva su procedencia.

## Overview

**Creative North Star: "Magnesio sobre tapiz"**

La academia vista desde la pista. El sistema toma sus materiales del suelo de competición de gimnasia: el tapiz azul de moqueta, la zona de seguridad más oscura que lo rodea, la cinta blanca de 5 cm que marca el límite y el polvo de magnesio que deja marcas en manos, aparatos y pizarras. No hay tarjetas flotando sobre gris: hay campos de color con fibra, reglas de cinta que estructuran y cifras grandes condensadas, como un marcador de pabellón.

Dos superficies se turnan. El **tapiz** (azul de competición con un ruido fino que imita la moqueta) lleva los momentos de marca y de orientación: primer viewport, cierre, panel de entrada, barra pública, lateral de la academia, banda de cabecera del panel. El **magnesio** (blanco roto con grano de tiza) es la mesa de trabajo donde vive el contenido denso. Encima de ambos, la información se ordena en listas regladas: una línea gruesa de 3 px abre el bloque y líneas finas separan las filas. La densidad es de herramienta de dirección: filas de 48–56 px, cifras tabulares, poco aire decorativo y mucho dato real.

La firma es el **palote de magnesio**: cuatro trazos y el quinto cruzado, dibujados a mano en SVG. No es un adorno: el número de trazos es siempre la cifra que se anuncia (presentes de una sesión, plazas ocupadas). El movimiento es seco, como un aterrizaje clavado: nada rebota, los trazos se dibujan de arriba abajo en 420 ms y se acabó. El mundo rechaza de forma explícita el SaaS blanco con captura de panel y el texto degradado; el énfasis es peso, anchura y tamaño.

**Key Characteristics:**
- Una sola familia variable (Archivo) en dos anchuras: condensada en mayúsculas para rótulos y cifras, normal para trabajar.
- Azul tapiz como estructura y acción; coral señal reservado a alertas y deudas.
- Reglas de cinta (3 px) en lugar de tarjetas anidadas; listas y tablas antes que rejillas de tarjetas.
- Cifras tabulares grandes como protagonistas (horas, asistencia, precios, KPIs).
- Palotes de magnesio como única ilustración, siempre ligados a un dato.
- Movimiento corto y sin rebote; `prefers-reduced-motion` lo anula todo.

## Colors

Un azul de competición en tres profundidades, un blanco magnesio cálido y una sola señal coral partida en relleno y tinta; los grises son una rampa con un punto de azul.

### Primary
- **Azul Tapiz** (`mat`): el color del suelo. Fondo de los campos de marca (con su fibra), relleno del botón principal, enlaces y nombres de módulo, regla de cabecera de los paneles («Sesiones de hoy», «Hoy en pista»), chip «En pista», anillo de foco y selección de texto.
- **Zona de Seguridad** (`mat-deep`): el borde oscuro del tapiz. Barra pública, lateral de la academia, cabecera móvil de la entrada, bloque «Antes / con Zaltyko», hover del botón principal y texto del CTA blanco tipo cinta. También es el `theme-color` del navegador.
- **Noche de Pabellón** (`mat-night`): la tinta. Todo el texto principal sobre claro, la regla de cinta de 3 px sobre magnesio, el pie de página y el bloque de contacto de precios.

### Secondary
- **Tapiz Claro** (`mat-light`): tono medio del tapiz, ya definido como token propio en la configuración (y como alias heredado `zaltyko-primary-light`). Es una de las cinco tintas de grupo y el punto pulsante del estado «Cargando datos» del pulso operativo. No es color de texto (≈3,9:1 sobre blanco).
- **Azul Calle** (`mat-lane`): azul claro legible sobre azul. Rótulos de sección del lateral, segundo término de cifras sobre tapiz («/7»), iconos de comprobación sobre tapiz, y `--primary` en modo oscuro.
- **Lavado Tapiz** (`mat-wash`): tinte de fila activa. Fila «en pista» de la pizarra, plan destacado en la línea de planes, hover de celdas del marcador y de filas de acción, fondo de badges y del botón secundario, chip «Cargando datos» del pulso operativo, alerta de gravedad baja, cuadro de icono de la alerta media y columnas activas del kanban (prueba, activo).

### Tertiary
El coral está partido en dos papeles: un relleno vivo para puntos y superficies, y dos tintas oscuras que sí aguantan texto.
- **Coral Señal** (`signal`): alertas y deudas, nunca decoración. Solo puntos y rellenos (punto de «cuotas sin cobrar», borde al 30 % de la alerta grave). Con blanco encima da ≈4:1, así que no lleva texto pequeño ni encima ni en él.
- **Coral Tinta** (`signal-ink`): token del mundo para texto de alerta sobre claro (≈6:1 sobre blanco). Fondo del botón destructivo (hover a `#9A2914`, ≈7,8:1), texto de badge de error y del icono de acción destructiva.
- **Coral Oscuro** (`signal-dark`): señal oscura para texto (≈5,4:1 sobre blanco, ≈5:1 sobre magnesio). Es el valor del alias heredado `zaltyko-coral` y de `--destructive` (`10 73% 44%`), así que la llevan `text-destructive` (por ejemplo, la variación negativa del pulso operativo) y las pantallas antiguas. Los mensajes de error de formulario ya no la usan: van en `signal-ink`.
- **Lavado Señal** (`signal-wash`): fondo de badge de error, de la alerta grave, del chip «Sin conexión» del pulso operativo y del icono de acción destructiva.

### Neutral
- **Magnesio** (`chalk`): fondo de trabajo (`--background`), con grano de tiza en las secciones públicas y en la entrada. Hover del CTA blanco.
- **Polvo** (`chalk-dust`): `--muted` y el estado en reposo. Chip «Lista pasada», chip «Serie actual / Sin datos» del pulso operativo, alerta de gravedad media, columnas de estado apagado del kanban (inactivo, pausado, archivado) y superficie a la que apunta el alias heredado `zaltyko-warm-white`.
- **Línea de Magnesio** (`chalk-line`): todos los separadores finos de 1 px, bordes de tarjeta y de panel (`--border`).
- **Cinta** (`tape`): blanco puro. Superficie de tarjetas y paneles sobre magnesio, CTA sobre tapiz, marco y reglas de cinta sobre azul.
- **Rampa** (`ramp-300` … `ramp-800`): únicos grises. `ramp-300` para bordes de control y el `--input` (≈1,9:1, nunca texto); `ramp-400` para flechas e iconos de fila en reposo (≈3,1:1); `ramp-500` para texto terciario (≈6:1 sobre blanco, 5,5:1 sobre magnesio); `ramp-600` para párrafos secundarios y ledes; `ramp-700`/`ramp-800` para borde y superficie de tarjeta en oscuro.

### Named Rules
**The Señal Rule.** El coral solo aparece cuando algo pide atención (deuda, error, borrado). Como texto o como fondo con texto blanco se usa una tinta oscura (`signal-ink` en código nuevo, `signal-dark` por alias y `--destructive`); `signal` puro es relleno o punto, nunca letra ni fondo de botón.

**The Lane Rule.** `mat-lane` como texto pequeño solo va sobre `mat-deep` o `mat-night` (≈5,8:1). Sobre `mat` (≈4,3:1) solo se admite a tamaño grande (≥24 px o ≥18,7 px en negrita) o como icono. Los rótulos pequeños sobre la banda `mat` del panel van en blanco al 85 %.

**The Group Ink Rule.** El color que cada academia elige para sus grupos es un dato, no un color de interfaz. Se pinta siempre a través de `groupInk()` (`src/lib/mat/group-ink.ts`), que lo traduce de forma estable (hash del valor de origen, o del nombre del grupo si no hay color) a uno de cinco tonos del tapiz: `mat`, `mat-light`, `mat-deep`, `mat-lane` y `ramp-600`. El mismo origen da siempre el mismo tono. Solo aparece como punto de 6–8 px junto al nombre del grupo, que es quien lleva la información; nunca como fondo, borde de tarjeta o texto. La etiqueta que rodea al punto es neutra (cinta con borde y texto de interfaz), no se tiñe con el color del grupo. Ningún color de usuario entra en la paleta, y el coral queda fuera de las tintas de grupo.

**The Alias Rule.** El mundo se hereda por alias a nivel de tema, sin editar archivo por archivo. Hay dos capas:
- **Alias de marca:** los nombres heredados `zaltyko-*` apuntan al mundo (teal → tapiz, indigo → zona de seguridad, navy → noche, coral → coral oscuro `signal-dark`, mist → línea de magnesio, warm-white → polvo, electric → calle, primary-light → tapiz claro).
- **Familias de Tailwind reasignadas:** `tailwind.config.mjs` define tres escalas completas (50–950) y sustituye con ellas las familias de Tailwind. `MAT_SCALE` (de `#F0F3FC` a `#0B1430`, con `mat-wash` en el 100, `mat` en el 700 y `mat-deep` en el 800) sustituye a teal, emerald, green, cyan, sky, blue, indigo, violet, purple y lime. `SIGNAL_SCALE` (de `#FDF3F0` a `#431109`, con `signal-wash` en el 100, `signal` en el 500 y `signal-ink` en el 700) sustituye a amber, yellow, orange, red, rose, pink y fuchsia. `RAMP_SCALE` (la rampa de `#F4F6F2` a `#0B1430`, más un 950 `#070D20`) sustituye a gray, slate, zinc, neutral y stone. Así, cualquier `bg-emerald-50` o `text-amber-700` heredado se pinta en dos tintas.

Los alias existen para que las pantallas antiguas hereden el mundo, no para escribir con ellos. El código nuevo escribe los tokens semánticos `mat`, `chalk`, `tape`, `signal` y `ramp`, nunca `teal-*`, `amber-*`, `gray-*` ni `zaltyko-*`. Efecto a vigilar: un aviso heredado en ámbar o amarillo se pinta ahora en coral, con el mismo tono que un error. Un aviso que no sea deuda, error ni borrado se reescribe con los tokens del mundo; el alias no lo arregla.

## Typography

**Display Font:** Archivo variable (con ui-sans-serif, system-ui), condensada por `font-stretch`
**Body Font:** Archivo variable (con ui-sans-serif, system-ui), anchura normal
**Label Font:** Archivo variable a 80 % de anchura, mayúsculas

**Character:** Una sola familia con eje de anchura (62 %–125 %) y peso (100–900). Condensada y negra, en mayúsculas, rotula como los paneles laterales de una pista de competición; a anchura normal es una sans de trabajo sobria. No se añade una segunda familia: la tensión sale del eje de anchura.

### Hierarchy
- **Display** (900, `clamp(2.75rem, 8vw, 6rem)`, 0,9): titular del primer viewport y de la portada de precios, en mayúsculas, blanco sobre tapiz. El cierre usa la misma voz a `clamp(2.5rem, 6.5vw, 5.5rem)`.
- **Headline** (900, `clamp(2.25rem, 5vw, 4rem)`, 0,92): titulares de sección pública y de la entrada, en mayúsculas. Variante corta a `clamp(2rem, 4.5vw, 3.5rem)` / 0,95 para secciones de cierre de lista (planes, guías, países).
- **Title** (900, `clamp(2rem, 3.5vw, 3rem)`, 0,95): título de pantalla en la app (`PageHeader`) y titular de la banda del panel, en mayúsculas.
- **Panel title** (900, 1,5 rem, 1, MAYÚSCULAS, condensada): título de cada panel reglado del panel de dirección («Recomendaciones», «Actividad por rama», «Programadas para los próximos días», «Pulso operativo», «Puesta en marcha»), en noche sobre blanco, justo bajo la regla de 3 px.
- **Step numeral** (900, cifras tabulares, condensada): número de paso de la puesta en marcha. El paso actual a 6 rem con interlineado 0,8 en azul tapiz, seguido del total («/7») a 1,875 rem en gris de rampa; los pasos pendientes, en una lista ordenada (`<ol>`), a 3 rem en una columna de 48 px que pasa a azul tapiz al pasar el ratón. El número grande es la jerarquía: no lleva icono ni círculo.
- **Row title** (800, 1,25–1,5 rem): nombre de módulo, de plan, de país; siempre condensado y en mayúsculas cuando nombra una categoría del deporte. En la navegación rápida del panel, 1,125 rem en noche.
- **Figure** (900, 1,875 rem en filas; hasta 3,75 rem en el marcador del primer viewport y 3 rem en el reloj): horas, asistencia, precios, KPIs. Siempre con cifras tabulares.
- **Body** (400, 1 rem, 1,75): texto de trabajo; los párrafos secundarios en `ramp-600`. Los ledes de sección van a 1,125–1,25 rem con interlineado 1,625 y ancho máximo de 36–42 rem.
- **Label** (700, 0,75 rem, 0,08em, MAYÚSCULAS, anchura 80 %): «rótulo de pista». Cabeceras de panel, migas de pan, cabeceras de tabla, títulos de columna del pie, secciones del lateral, día bajo el reloj.
- **Suelo de tamaño:** 0,75 rem (`text-xs`) es el texto más pequeño del sistema: detalles, subtítulos de fila, etiquetas de la navegación inferior. Ya no queda ningún `text-[9px]`, `text-[10px]` ni `text-[11px]` en `src`: todos pasaron a `text-xs`.
- **Fechas y horas:** las horas se muestran como HH:MM («17:30 – 19:00»). Las fechas de listas y fichas van en formato corto español (`Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric" })`, por ejemplo «8 nov 2026»).

### Named Rules
**The Stretch Rule.** La anchura es la jerarquía. Titulares a 72 % de anchura, encabezados sin clase a 78 %, rótulos a 80 %, texto a 100 %. Nunca se simula condensación con `letter-spacing` negativo ni con otra fuente.

**The Tabular Rule.** Toda cifra que se compara o se actualiza (horas, «7/10», precios, porcentajes, fechas en listas) usa cifras tabulares. Las tablas las activan por defecto.

**The Label Is Data Rule.** El rótulo de pista nombra el bloque de datos que tiene debajo o al lado («Sesiones de hoy», «País»). No se coloca como antetítulo decorativo encima de un titular.

## Layout

Contenedor público de `max-w-7xl` (80 rem) con márgenes laterales de 24 / 40 / 56 px (móvil / tablet / escritorio). Las secciones respiran 80 px en vertical y 96–112 px en escritorio. La rejilla habitual es asimétrica de dos columnas: titular y lede en una columna estrecha (0,8–0,9 fr), datos en la ancha (1,1–1,6 fr); en el primer viewport, 1,15 fr de titular frente a 0,85 fr de sesión en vivo, alineadas a la base. La columna del titular puede quedarse fija (`sticky`) mientras la lista reglada corre al lado.

El ritmo vertical lo marcan las reglas, no las cajas: regla de cinta de 3 px al abrir un bloque, filas de 16–20 px de relleno vertical separadas por 1 px de `chalk-line`. Los paneles de app usan 20 px de relleno lateral en filas y 24 px en tarjetas. La app vive en un lateral de 256 px en tapiz oscuro (solo escritorio) más una barra superior blanca; en móvil el lateral desaparece y entra la navegación inferior.

Cada objetivo táctil mide al menos 44 px (botones, filas de lista, enlaces de tabla, ítems de menú, controles de la barra de gimnastas, enlaces de la navegación de áreas globales). En móvil los campos de formulario van a 16 px para evitar el zoom de iOS. La página nunca hace scroll horizontal.

En el panel de dirección cada bloque es un **panel reglado** (blanco, 12 px de radio, borde de línea de magnesio y una regla superior de 3 px en noche) y dentro de él las filas van separadas por 1 px de `chalk-line`, con 20 px de relleno lateral. La navegación rápida no es un bloque: es una fila de rótulos entre dos líneas finas, 2 columnas en móvil y 4 en escritorio, separadas por líneas verticales de magnesio. Las barras de herramientas de lista (gimnastas, grupos) son también una sola fila sin tarjeta, cerrada por una línea fina inferior: filtros a la izquierda, acciones a la derecha (en columna por debajo de `xl` en gimnastas y de `lg` en grupos).

### Named Rules
**The Ruled List Rule.** Antes que una rejilla de tarjetas, una lista reglada: regla de 3 px arriba, separadores de 1 px, nombre condensado a la izquierda y detalle a la derecha. Módulos, planes, guías, países, acciones rápidas, recomendaciones, sesiones programadas y pasos pendientes siguen esta forma.

**The No Card In Card Rule.** Dentro de un panel reglado no se anidan tarjetas: el contenido se ordena en filas regladas. Las filas no llevan sombra, ni barra lateral de color, ni radio propio; el estado se marca con el fondo de la fila (`mat-wash`, `signal-wash`, `chalk-dust`).

## Elevation & Depth

El tapiz es plano y está apoyado en el suelo. La profundidad se transmite por cambio de material (tapiz frente a magnesio frente a cinta blanca) y por reglas, no por capas flotantes. Los paneles reglados del panel de dirección no llevan sombra: solo borde y regla. La tarjeta base genérica conserva como mucho una sombra de contacto muy corta, teñida de azul noche; las sombras medias quedan para menús y overlays. No hay halos ni resplandores de color.

### Shadow Vocabulary
- **Contacto** (`box-shadow: 0 1px 2px rgba(11,20,48,0.06), 0 2px 6px -2px rgba(11,20,48,0.08)`): tarjeta base (`Card`) blanca sobre magnesio y la barra de navegación inferior móvil. No se usa en paneles reglados.
- **Overlay** (`box-shadow: 0 6px 20px -6px rgba(11,20,48,0.18)`): desplegables y menús (selector de academia).
- **Botón principal** (`box-shadow: 0 1px 0 rgba(11,20,48,0.25)`): canto inferior de un píxel, como el grosor del tapiz.
- **CTA sobre tapiz** (`box-shadow: 0 8px 20px -10px rgba(11,20,48,0.8)`): solo el CTA blanco del primer viewport.
- **Barra con scroll** (`box-shadow: 0 10px 24px -18px rgba(11,20,48,0.9)`): aparece en la barra pública al desplazarse.
- **Alias heredados** (`brand`, `indigo`: `0 1px 2px rgba(11,20,48,0.08), 0 4px 10px -6px rgba(11,20,48,0.2)`; `lift`: `0 1px 2px rgba(11,20,48,0.08), 0 6px 14px -8px rgba(11,20,48,0.28)`): las pantallas antiguas que los piden reciben ahora una sombra corta de contacto en azul noche, no un halo. El código nuevo no los escribe; usa `soft` o ninguna. `glow` es un anillo de 3 px de tapiz al 18 %, no un resplandor.
- **Escala por defecto de Tailwind** (`shadow-sm`, `shadow`, `shadow-md`, `shadow-lg`, `shadow-xl`, `shadow-2xl`): el tema las redefine en azul noche: de `sm` a `lg` son sombras de contacto, y `xl` y `2xl` valen lo mismo que la sombra de overlay. Una pantalla heredada que pida `shadow-2xl` ya no flota con un halo grande. El código nuevo no las escribe.
- **Fondo `hero-glow`:** el alias heredado es ahora un relleno plano de polvo (`chalk-dust`), sin degradado.

### Named Rules
**The Flat Mat Rule.** Ninguna superficie se levanta al pasar el ratón en el mundo nuevo: el hover cambia color, fondo o borde (`mat-wash`, `chalk`, borde `mat`), no altura. La utilidad compartida de hover de tarjeta (`.card-hover`) solo pasa el borde a azul tapiz en 150 ms. No hay excepciones: no queda ningún `hover:-translate-y-*` en `src`, tampoco en el CTA blanco del primer viewport. El único desplazamiento al pasar el ratón es el de la flecha de un enlace (`translate-x`), que mueve el icono, no la superficie.

## Shapes

Esquinas cortas, de cinta y de moqueta cortada. Controles a 6–8 px (`control`, `md`), paneles y campos a 10 px (`card`), tarjetas a 12 px (`xl`), modales a 16 px. Los grandes radios heredados se comprimieron (`2xl` = 14 px, `3xl` = 16 px) para que nada vuelva a la píldora blanda. Los chips de estado y las etiquetas son **chips de cinta**: rectángulos de 6 px (`rounded-md`), no píldoras.

Los bordes de acento son finos. Una pestaña lateral de color (`border-l-4`) se convirtió en un borde de 1 px, y en los paneles redondeados la línea inferior de acento (`border-b-2`) pasó a `border-b` de 1 px. El grosor lo marca solo la regla de cinta de 3 px, que abre un bloque y no subraya cajas redondeadas.

El **marco de cinta** es la forma recurrente: un borde blanco de 3 px al 80 % de opacidad, inset 12 px en móvil y 24 px en escritorio, con esquinas rectas sobre los campos a sangre (primer viewport, cierre, portada de precios, panel de entrada). Dentro de la banda redondeada del panel de la app, el marco sigue el radio de la banda (8 px, inset 8 px). La **regla de cinta** (3 px) subraya cabeceras de pantalla, abre listas y marca el enlace activo de la barra pública. Los únicos círculos son puntos de estado de 12 px.

## Components

### Buttons
Tactiles y directos: altura generosa, peso semibold–extrabold, sin degradados.
- **Shape:** esquinas cortas (8 px); 44 px de alto por defecto, 36 px en `sm`, 48 px en `lg`; los CTA públicos sobre tapiz suben a 48–56 px.
- **Primary:** relleno azul tapiz, texto blanco, canto inferior de 1 px; hover a zona de seguridad.
- **Outline:** blanco con borde `ramp-300` y texto noche; hover a borde y texto azul tapiz.
- **Secondary:** lavado tapiz con texto zona de seguridad.
- **Destructive:** relleno coral tinta (`signal-ink`) con texto blanco (≈6:1); hover a `#9A2914`. Nunca relleno `signal` puro.
- **Tape (CTA sobre azul):** blanco cinta con texto zona de seguridad en extrabold; hover a magnesio. Su pareja es el contorno blanco de 2 px al 60 % que se aclara al pasar.
- **Ghost / Link:** texto con hover de lavado; los enlaces de sección van subrayados con 2 px y 6 px de separación, que crece a 3 px al pasar.
- **Hover / Focus:** transición de 150 ms ease-out en color y fondo; `active` escala a 0,99; foco con anillo de 2 px en azul tapiz y 2 px de separación (blanco sobre tapiz).

### Chips
- **Estado de sesión:** rectángulo de 6 px, 0,7 rem en extrabold mayúsculas con 0,06em. «En pista» relleno tapiz; «Lista pasada» polvo con texto `ramp-600`; «Próxima» borde `ramp-300`.
- **Estado de datos (pulso operativo):** rectángulo de 6 px, 0,75 rem semibold, con punto de 6 px delante. Listo: polvo con texto `ramp-600` y punto tapiz («Serie actual», o «Sin datos» si la serie es toda cero); error: lavado señal con `signal-ink` y punto `signal` («Sin conexión»); cargando: lavado tapiz con texto zona de seguridad y punto `mat-light` pulsante («Cargando datos»).
- **Distintivo de área (`floor-tag`):** rótulo de pista (0,75 rem, 700, 0,08em, mayúsculas, anchura 80 %) en blanco sobre noche, rectángulo de 6 px. Lo lleva «Super Admin» en la barra global; no es una píldora.
- **Presente / Marcar (sobre tapiz):** 32 px de alto, blanco con texto zona de seguridad cuando está marcado; contorno blanco de 2 px al 45 % cuando no.
- **Badge:** lavado tapiz con texto zona de seguridad; error en lavado señal con `signal-ink`.
- **Etiqueta de grupo:** rectángulo de 6 px con borde `chalk-line`, nombre del grupo en texto de interfaz (semibold noche o medium) y delante un punto de 6–8 px pintado con `groupInk()`. El nombre siempre acompaña al punto. Es la misma forma en la ficha, en las tablas de gimnastas y de clases, en asistencia, en entrenadores, en el panel de la entrenadora y en el diálogo de asistencia.
- **Chip de cinta (neutro):** rectángulo de 6 px (`rounded-md`) a 0,75 rem, en una de tres variantes: polvo/`muted` con texto apagado, blanco con borde `chalk-line` o lavado tapiz con zona de seguridad (clases asignadas en entrenadores, «Principal»). Sustituye a las píldoras en `GroupCard`, el kanban de gimnastas, la ficha de gimnasta, la tabla de clases y asistencia.

### Cards / Containers
- **Panel reglado (por defecto en el panel de dirección):** blanco cinta, radio 12 px, borde 1 px `chalk-line` y regla superior de 3 px en `mat-night`, sin sombra. Título en voz *panel title*, sin antetítulo encima; contenido en filas regladas con 20 px de relleno lateral. Lo usan Recomendaciones, Métricas financieras, Actividad reciente, Actividad por rama, Programadas, Pulso operativo, Puesta en marcha, Alertas, Base recomendada, Bienvenida, los bloques de la ficha de gimnasta y la tarjeta de grupo (cuya regla pasa a azul tapiz al pasar el ratón).
- **Estado vacío de lista:** blanco con borde discontinuo de 2 px en `ramp-300`, radio 12 px y 48 px de relleno; frase en 0,875 rem apagada y un solo botón de acción. Lo usa la lista de grupos sin grupos.
- **Tarjeta base (`Card`):** 12 px, blanco cinta sobre magnesio con sombra de contacto; en oscuro, `ramp-800` con borde `ramp-700`. Queda para superficies genéricas fuera del panel.
- **Border:** 1 px `chalk-line`.
- **Internal Padding:** 24 px en tarjeta; 20 px en panel reglado y en sus filas.

### Inputs / Fields
- **Style:** 44 px de alto, blanco, borde 1 px línea de magnesio, radio 10 px, 16 px de relleno lateral.
- **Focus:** borde azul tapiz más anillo de 4 px de tapiz al 15 %.
- **Sobre tapiz (búsqueda del lateral):** 40 px, fondo noche al 35 %, borde blanco al 15 %, foco a borde blanco.
- **Error / Disabled:** borde en `signal` y anillo de foco en `signal` al 40 % (línea, no letra); icono de alerta y mensaje de 0,75 rem medium bajo el campo en `signal-ink` (≈6:1). Los errores de la pantalla de entrada usan la misma tinta a 0,875 rem. Deshabilitado al 50 % de opacidad.

### Navigation
- **Barra pública:** banda de 64 px en zona de seguridad con fibra; lockup Z + «ZALTYKO» en blanco; enlaces semibold al 75 % que pasan a blanco. El activo lleva debajo un tramo de cinta blanca de 3 px que se despliega en horizontal (200 ms). CTA blanco tipo cinta a la derecha. En móvil, panel a pantalla en la misma zona de seguridad con enlaces en titular condensado de 1,5 rem separados por líneas blancas al 10 %.
- **Lateral de academia:** 256 px de tapiz oscuro. Nombre de la academia en titular condensado sobre una regla blanca de 3 px; secciones con rótulo de pista en azul calle; ítems de 40 px al 80 % de blanco, hover al 10 % de blanco, activo como pastilla blanca (8 px) con texto zona de seguridad.
- **Barra superior de la app:** blanca con borde inferior de línea de magnesio; la Z en azul tapiz; el nombre de la academia tras una regla vertical de 3 px.
- **Navegación de áreas globales (`GlobalTopNav` sin academia activa):** rótulos en línea, sin cápsula ni sombra. Cada enlace mide 44 px de alto, con icono de 14 px y texto 0,875 rem semibold en `ramp-600` (hover a noche); el activo pasa a azul tapiz y lleva debajo un tramo de cinta de 3 px en tapiz que se despliega en horizontal en 200 ms, como la barra pública. En la variante oscura (fondo noche), reposo en blanco al 70 % y cinta blanca. «Super Admin» se marca con el distintivo de área en noche, no con una píldora.
- **Cajón móvil de la barra global (`GlobalTopNav`):** pantalla completa en zona de seguridad con fibra (`mat-field-deep`). Arriba, el lockup Z + «ZALTYKO» en blanco y un botón de cerrar de 44 px. Cada destino es una fila de 56 px como mínimo, en titular condensado de 1,25 rem extrabold y mayúsculas, separada por líneas blancas al 10 %. El activo es una franja de cinta blanca con texto zona de seguridad; el reposo va en blanco al 85 % con hover al 10 % de blanco. El bloque de usuario dentro del cajón se fuerza a la variante sobre oscuro (texto blanco, secundarios al 60–70 %, avatar en azul calle al 15 %), sea cual sea el tema de la barra.
- **Navegación inferior móvil (`MobileAcademyNav`):** 72 px, cinco celdas de 56 px de alto (mínimo 44 px) con icono de 20 px y una etiqueta de **una sola palabra** a 0,75 rem semibold: Mesa, Gimnastas, Sesiones, Lista, Evaluar, Equipo, más «Más» para el resto. El nombre completo («Mesa de dirección», «Pasar lista», «Evaluaciones»…) va en `aria-label`. Activo relleno azul tapiz con texto blanco; reposo en texto apagado con hover a `muted`.
- **Navegación rápida del panel:** fila de rótulos, no tarjetas. Cada enlace mide al menos 64 px: icono de 20 px en tapiz, nombre en titular condensado de 1,125 rem en noche (azul tapiz al pasar) y subtítulo de 0,75 rem en `ramp-500`; hover de lavado tapiz.
- **Pie:** noche de pabellón; columnas encabezadas por rótulos de pista sobre regla blanca de 3 px.

### Cabecera de pantalla (`PageHeader`)
Sin tarjeta. Migas en rótulo de pista `ramp-500` con la actual en azul tapiz; título en voz *title* (mayúsculas, negra, condensada) apoyado en una regla de cinta de 3 px en noche; icono pequeño en tapiz al lado; acciones alineadas a la base a la derecha.

### Marcador (KPIs del panel)
Cuatro celdas sobre una sola regla de cinta en noche, separadas por líneas de magnesio, 2 × 2 en móvil y 4 en línea en escritorio. Cifra *figure* en noche y nombre en titular condensado azul tapiz sobre la misma línea base; detalle en 12 px `ramp-500`. Cada celda es un enlace con hover de lavado tapiz. Sin iconos ni tarjetas internas. Con 0 gimnastas, la asistencia muestra «—», no «0 %».

### Pulso operativo (`OperationsPulse`)
Panel reglado con título *panel title* y, a su lado, el chip de estado de datos. El selector de métrica (gimnastas, equipo, grupos, asistencia) es una fila de pestañas planas de 44 px y 0,75 rem semibold. La activa es blanca con texto noche y un anillo de 1 px `chalk-line`, sin sombra; el reposo va en `ramp-600`. La cifra actual va en *figure* grande (3 rem, 900, condensada, tabular, noche), con su variación frente al día anterior debajo. La línea de los últimos 14 días se dibuja en 900 ms dentro de un pozo de magnesio (`chalk`) con borde `chalk-line` y 8 px de radio. Las tintas de las series son solo tonos del mundo (`mat`, `mat-deep`, `ramp-600`, `mat-night`). Si la serie entera es cero, no se dibuja la línea: el hueco muestra «Sin datos todavía. La evolución aparece cuando registres…» y el chip dice «Sin datos». En error, «No pudimos cargar la evolución» con un botón de contorno «Reintentar» de 44 px.

**The No Fake Zero Rule.** Un cero que en realidad significa «aún no hay datos» no se pinta como dato: ni «0 %» de asistencia sin gimnastas, ni una línea plana en una serie vacía. Se muestra «—» o «Sin datos», con una frase que diga qué hace falta registrar.

### Pizarra de sesiones
Panel blanco con cabecera reglada de 3 px en azul tapiz y rótulo de pista. Cada fila: hora en *figure* a la izquierda (80 px de columna), grupo y detalle en el centro, acción o estado a la derecha. La fila en curso se tiñe de lavado tapiz.

### Programadas (calendario del panel)
Panel reglado con título *panel title*. Cada sesión es una fila separada por 1 px de `chalk-line` (sin borde superior en la primera), con 16 px de relleno vertical: nombre de la clase en semibold (azul tapiz al pasar), fecha y hora en 0,75 rem, y debajo la entrenadora en un rectángulo `chalk-dust` y la etiqueta de grupo con su tinta.

### Acción rápida (`QuickAction`)
Fila reglada de 56 px como mínimo, no tarjeta: icono en un cuadrado de 40 px a 6 px de radio (lavado tapiz con icono tapiz; lavado señal con `signal-ink` si la acción es de deuda o borrado), nombre en semibold, detalle en 0,75 rem, flecha a la derecha que pasa a azul tapiz. Hover de lavado tapiz; separador inferior `chalk-line`.

### Alertas (`AlertsWidget`)
Panel reglado sin antetítulo: cuadro de icono de 40 px en lavado señal con `signal-ink` y, al lado, el recuento como título *panel title* («2 alertas requieren atención»). Se muestran como mucho tres; el resto se resume en una línea al pie. Cada alerta lleva fondo por gravedad y borde completo de 1 px: grave, lavado señal con borde `signal` al 30 % y cuadro de icono lavado señal / `signal-ink`; media, polvo con borde `chalk-line` y cuadro de icono lavado tapiz / zona de seguridad; baja, lavado tapiz. Sin ámbar ni rojo de Tailwind y sin pestaña lateral de color (`border-l-4`). Botón de descartar de 44 px.

### Base recomendada (`StarterSetupSection`)
Panel reglado de 20 px de relleno, sin caja interior. El título *panel title* nombra la plantilla («Base recomendada para gimnasia artística») y lleva debajo una frase en `ramp-600`; a la derecha, un botón de contorno y uno principal (`sm`). Si hay un siguiente ajuste, entra como fila reglada bajo una línea `chalk-line`: «Siguiente ajuste:» en azul tapiz seguido del título en semibold noche, descripción apagada y un botón de contorno.

### Bienvenida (`WelcomeBanner`)
Panel reglado de 24 px de relleno con cuadro de icono de 40 px en lavado tapiz y título *panel title*. La voz es neutra y sin género: «Te damos la bienvenida, {nombre}» y «Tu academia {nombre} ya está lista», con el nombre de la academia en azul tapiz. Solo se monta para una academia nueva y nunca a la vez que el panel de puesta en marcha, que ya dice lo mismo. La entrada sigue la misma voz: «Hola de nuevo», y el texto habla de gimnastas, sesiones y equipo técnico.

### Puesta en marcha (`DashboardOnboardingPanel`)
Panel reglado. A la izquierda, el paso actual en *step numeral* de 6 rem en azul tapiz con el total en gris de rampa; en el centro, título *panel title*, «Paso N de M · X % completado» y una barra de progreso de 6 px sobre polvo; a la derecha, el botón principal con el siguiente paso y un botón de contorno «Ver N pendientes». Desplegados, los pendientes son un `<ol>` de filas regladas con el numeral a 3 rem en `ramp-400` (≈3,1:1, válido a ese tamaño; azul tapiz al pasar el ratón), la etiqueta en semibold noche, la descripción en `ramp-500` y una flecha `ramp-400`.

### Barra de herramientas de lista (`AthletesToolbar`, `GroupsDashboard`)
Sin tarjeta: una sola fila con línea inferior de `chalk-line` y 16–20 px de aire debajo. En gimnastas, a la izquierda, búsqueda, selectores de filtro, «Más filtros» y los atajos de estado (Activos / Prueba) como texto azul tapiz que se rellena de tapiz al activarse, todos de 44 px de alto; a la derecha, el cambio de vista tabla/kanban en un grupo con borde `ramp-300` y, si hay selección, las acciones por lote sobre lavado tapiz. Por debajo de `xl` las dos mitades se apilan. En grupos, la misma fila lleva las plantillas iniciales sugeridas a la izquierda y, a la derecha, el filtro de rama y el botón principal «Nuevo grupo» (44 px, relleno tapiz, hover a zona de seguridad).

### Kanban de gimnastas (`AthletesKanbanView`)
Cinco columnas por estado en dos tintas, sin ámbar, verde ni rojo: prueba y activo en lavado tapiz con borde tapiz al 20 % y al 30 %; inactivo y pausado en polvo con borde `chalk-line`; archivado en polvo con borde `ramp-300`. El estado se lee en el título de la columna, no en el color. Ningún texto baja de 0,75 rem.

### Ficha de gimnasta (`AthleteDetailTabs`)
Cada pestaña es una pila de paneles reglados de 24 px de relleno. La cabecera no lleva antetítulo: el nombre va directo en voz *title* (mayúsculas, negra, condensada) y debajo tres rectángulos de 6 px: el estado con su nombre en español en lavado tapiz / zona de seguridad, el nivel en polvo / `ramp-600` y la etiqueta de grupo con su punto `groupInk()`. A la derecha, las fechas en formato corto español: «Alta: 8 nov 2026», «Edad», «Nacimiento: 1 may 2015».

### Clases (`ClassesDashboard`, `ClassesTableView`)
- **Marcador:** las cuatro cifras forman una sola tira reglada, no cuatro tarjetas: un panel blanco de 12 px con borde `chalk-line` y regla superior de 3 px en noche, con celdas separadas por líneas de 1 px (2 × 2 en móvil, 4 en línea en escritorio). Cada celda lleva la cifra en *figure* de 1,875 rem en noche y el nombre en titular condensado azul tapiz sobre la misma línea base. El detalle va en 0,75 rem `ramp-500`.
- **Acciones:** una sola acción principal por vista, «Crear {clase}», en relleno tapiz de 44 px con hover a zona de seguridad. «Filtrar» es un botón de contorno (blanco, borde `ramp-300`, texto noche, hover a borde y texto tapiz). Los accesos secundarios del panel de clases son botones de contorno.
- **Datos:** horas en HH:MM («17:30 – 19:00» o «Desde 17:30»), fecha de creación en formato corto español. Los códigos de aparato que lleguen en inglés se muestran con su nombre en español: primero la etiqueta del registro de especialización y, si no la hay, una tabla de respaldo en español.

### Ajustes (`SettingsLayout`, `SportConfigurationDashboard`)
- **Sin navegación duplicada:** `SettingsLayout` ya no pinta un lateral propio. Las pestañas de la página son la única navegación entre secciones.
- **Estado por rama:** lista reglada entre dos líneas `chalk-line`. Cada pendiente es una fila con la cifra en *figure* tabular de 1,5 rem, una frase en lenguaje llano y su acción («Revisar»). Las ramas van debajo como bloques abiertos por una regla de 3 px en noche.
- **Bloque técnico:** se titula «Configuración federativa». El asistente de migración habla el idioma de la academia: en la interfaz no aparecen «legacy» ni «scope».

### Función no disponible (`FeatureUnavailableState`)
Usa la cabecera de pantalla compartida (`PageHeader`) con el título de la función. El estado va al principio de la descripción («Disponible más adelante. …»), sin antetítulo ni insignia. Debajo, un único botón de contorno para volver.

### Entrenadores (`CoachesTableView`)
La acción principal es el botón tapiz de 44 px (hover a zona de seguridad). Las clases asignadas son chips de cinta en lavado tapiz con texto zona de seguridad, y los grupos son etiquetas de grupo con punto `groupInk()`. El alta se muestra en formato corto español («Alta: 8 nov 2026»).

### Gráficos (`brand-charts`)
Las series usan solo tonos del mundo: tapiz, zona de seguridad, calle y `ramp-400`, y coral solo para alertas. Los ejes y el borde del tooltip leen variables CSS (`hsl(var(--muted-foreground))`, `hsl(var(--border))`, `hsl(var(--popover))`), así que siguen el tema claro y el oscuro. Los colores literales de analítica y disputas de admin, la línea de auditoría, `global-error`, las páginas de éxito y cancelación de tienda y marketplace y `MyAttendanceWidget` usan valores de las tres escalas del mundo.

### Guía de arranque condicionada
Los consejos de arranque solo se muestran mientras describen la situación real de la academia: el aviso de la barra de gimnastas, mientras haya menos de 5 gimnastas; el consejo «Empieza aquí» sobre «Nuevo grupo» de `GroupsDashboard`, solo mientras no exista ningún grupo; la bienvenida, solo si no está ya el panel de puesta en marcha. Cuando el recuento deja de cumplirse, la guía desaparece sin más.

**The Still True Rule.** Un consejo, aviso de arranque o estado vacío solo aparece mientras sigue siendo cierto, y se condiciona a un recuento real (gimnastas, grupos, sesiones), no a un indicador de «visto» ni a una fecha. La guía que ya no describe la academia es ruido.

### Palotes de magnesio (`ChalkTally`)
SVG de grupos de cinco (cuatro verticales y una diagonal) en `currentColor`, trazo de 3,4 px redondeado; los huecos vacíos a 2 px y 22 % de opacidad. Inclinación determinista para que servidor y cliente coincidan. Animación `chalk-stroke` de 420 ms con `cubic-bezier(0.16, 1, 0.3, 1)` y 45 ms de escalonado (máximo 12 trazos); se desactiva con movimiento reducido y en listas estáticas. Su etiqueta accesible siempre dice la cifra real.

### Reloj de pista (`LiveClock`)
Hora en cifras tabulares negras de 3 rem y el día debajo en rótulo de pista. Se rellena tras montar («--:--» en el servidor) y se actualiza cada 15 s.

## Do's and Don'ts

### Do:
- **Do** alternar tapiz (`mat`/`mat-deep` con su fibra) y magnesio (`chalk` con grano) por secciones; el contenido denso siempre sobre magnesio o blanco.
- **Do** abrir cada lista, tabla o cabecera con una regla de cinta de 3 px (noche sobre claro, blanca sobre azul) y separar filas con 1 px de `chalk-line` o blanco al 15–20 %.
- **Do** escribir titulares, nombres de módulo y cifras en Archivo condensada negra; texto de trabajo en Archivo normal.
- **Do** usar cifras tabulares en toda hora, recuento, precio y porcentaje.
- **Do** ligar cada palote de magnesio a una cifra real y rotular como «Datos de ejemplo» o «Demostración» cualquier dato ilustrativo.
- **Do** reservar el coral para deudas, errores y borrados, con `signal-ink` como texto o fondo de botón sobre claro; `signal` solo para puntos y rellenos.
- **Do** pintar todo color de grupo con `groupInk()` y como punto de 6 px junto al nombre del grupo.
- **Do** construir los bloques del panel como paneles reglados (12 px, borde `chalk-line`, regla superior de 3 px en `mat-night`, sin sombra) con filas regladas dentro.
- **Do** condicionar cada consejo de arranque a un recuento real y retirarlo en cuanto deja de ser cierto (gimnastas < 5, grupos = 0).
- **Do** mostrar «—» o «Sin datos» cuando un cero significa que aún no hay datos (asistencia sin gimnastas, serie toda a cero).
- **Do** marcar estados con las tres familias del mundo: tapiz (`mat-wash`/`mat-deep`) para en curso o activo, polvo (`chalk-dust`/`ramp-600`) para reposo o listo, señal (`signal-wash`/`signal-ink`) para error o deuda.
- **Do** usar etiquetas de una palabra en la navegación inferior móvil y llevar el nombre completo en `aria-label`.
- **Do** mantener objetivos táctiles de 44 px, 0,75 rem como tamaño mínimo de texto y el anillo de foco de 2 px (blanco sobre tapiz).
- **Do** escribir con los tokens del mundo (`mat`, `chalk`, `tape`, `signal`, `ramp`) en código nuevo, aunque las familias de Tailwind ya se pinten en dos tintas por alias.
- **Do** usar chips de cinta (rectángulo de 6 px) para estados y etiquetas, con el color de grupo solo en el punto.
- **Do** mostrar horas en HH:MM y fechas en formato corto español, y traducir cualquier código técnico (aparatos, estados) a una etiqueta en español.
- **Do** dejar una sola acción principal por vista; el resto, de contorno.

### Don't:
- **Don't** usar texto degradado, halos de color ni fondos con ondas: el énfasis es peso, anchura y tamaño.
- **Don't** usar el coral como decoración, acento de marca o color de icono neutro, ni poner texto blanco sobre `signal` puro.
- **Don't** pintar el color de grupo elegido por la academia tal cual, ni usarlo como fondo, borde o texto.
- **Don't** construir rejillas de tarjetas con icono cuando una lista reglada dice lo mismo, ni anidar tarjetas dentro de un panel reglado.
- **Don't** marcar filas o alertas con pestañas laterales de color (`border-l-4`), ni subrayar paneles redondeados con una línea gruesa de acento (`border-b-2`); el estado va en el fondo de la fila y los bordes son de 1 px.
- **Don't** usar tamaños de texto sueltos por debajo de 0,75 rem (`text-[10px]`, `text-[11px]`).
- **Don't** levantar tarjetas al pasar el ratón (`hover:-translate-y-*`) ni animar con rebote; el tapiz frena en seco.
- **Don't** introducir grises fuera de la rampa ni una segunda familia tipográfica.
- **Don't** escribir familias de Tailwind (`amber-*`, `red-*`, `teal-*`, `emerald-*`, `gray-*`, `slate-*`…) ni alias `zaltyko-*` en código nuevo: se pintan en el mundo solo por compatibilidad, y un ámbar heredado sale en coral de error.
- **Don't** escribir colores hexadecimales sueltos en componentes de interfaz; si un gráfico o un estilo en línea necesita un literal, ha de ser un valor de las escalas del mundo o una variable CSS del tema.
- **Don't** poner `mat-lane` como texto pequeño sobre `mat`.
- **Don't** fabricar testimonios, logos ni métricas para rellenar superficies de marca.

### Modo oscuro: The Night Mat Rule
El modo oscuro se activa con el interruptor de la barra global (`next-themes`, clase `.dark`, sin modo de sistema). El tapiz no cambia de noche: sigue siendo azul. Lo que cambia es el papel. Las reglas viven en `globals.css`, dentro de `@layer components`, de modo que una variante `dark:` explícita en un componente siempre manda.
- **Superficies:**
  - `bg-white` → tarjeta nocturna `hsl(var(--card))`;
  - magnesio (`bg-chalk`, `chalk-field`, `bg-z-canvas`) → fondo `hsl(var(--background))`;
  - polvo → `hsl(var(--muted))`;
  - bloque noche (`bg-mat-night`) → tarjeta nocturna, para que el pie y los avisos de cierre se despeguen del fondo.
- **Lavados:** el lavado de tapiz pasa a azul de calle al 12 % y el de señal, a señal al 16 %.
- **Tinta:**
  - noche (`text-mat-night`, `text-z-ink`, `text-mat-deep`, `text-zaltyko-navy`) → `hsl(var(--foreground))`;
  - rampa (`text-ramp-500`/`600`, `text-z-soft`) → `hsl(var(--muted-foreground))`;
  - azul tapiz como texto (`text-mat`, `text-zaltyko-teal`, `text-z-brand-*`) → azul de calle `#8FB4FF`;
  - tinta de señal → `#FF8A73`.
- **Líneas:** la línea de magnesio pasa a `hsl(var(--border))`. La regla de 3 px en noche pasa a cinta blanca `#E9ECE6`, la misma metáfora de la cinta sobre el tapiz.
- **Restauración sobre tapiz:** dentro de `mat-field`, `mat-field-deep`, `bg-mat`, `bg-mat-deep` o `bg-mat-night`, `bg-white` sigue siendo blanco, y la tinta de tapiz sobre esas piezas conserva `#14307F`. Así los botones de cinta, la píldora del selector y el ítem activo del lateral no cambian.
- **Disciplinas del panel del club de noche:** artística en azul de calle, rítmica en `#B4BCCB` y complementarias en cinta blanca.
- **Alertas del panel:** cada severidad lleva su variante `dark:` explícita y el panel usa `dark:bg-card`. Es el caso que destapó el problema: texto claro sobre lavados literales claros.

### Panel del club (`/owner`)
Decisión del 2026-11-09: una sola identidad en toda la plataforma. La dirección violeta del panel del club, aprobada el 2026-11-07, se sustituye por «Magnesio sobre tapiz» sin tocar su estructura, su lógica ni sus textos.
- **Tokens `z-*` redirigidos en el tema:**
  - `canvas` es el magnesio `#F4F6F2`, `line` es `#D5DAE3`, `ink` es la noche `#0B1430` y `soft` es la rampa `#5C6782` (5,2:1 sobre magnesio).
  - `brand` se mapea al azul tapiz: 50 → `#E8EDFB`, 100 → `#CED9F6`, 500 y 600 → `#1E3FA8`, 700 → `#14307F`.
  - `chalk` (atención) se mapea a la señal: 50 → `#FDECE7`, 500 → `#E5482A`, 600 → `#B8331A`.
- **Disciplinas por tono, no por tinte:**
  - artística en tapiz (`#1E3FA8` sobre `#E8EDFB`, 7,7:1);
  - rítmica en pizarra (`#3E4A66` sobre `#E9ECE6`, 7,4:1);
  - complementarias en noche (`#0B1430` sobre `#F4F6F2`).
- **Base común `owner-ui.ts`:**
  - Tarjetas y métricas: paneles reglados (regla superior de 3 px en noche, radio de 12 px).
  - Títulos de página y de tarjeta: condensados en mayúsculas.
  - Rótulos: `floor-label`. La cifra de métrica es *figure* de 3 rem.
  - Botón principal: azul tapiz con canto de 1 px, que pasa a noche al pasar el ratón.
  - Chips de cinta de 6 px. Avisos de aviso y error en lavado de señal.
- **Pantallas:** las franjas laterales (`border-l-2`, `border-l-4`) pasan a una regla superior de 3 px en el mismo color. Los radios arbitrarios de 14 a 24 px quedan en 12 px. Los colores literales se cambian por valores del mundo.
- **La fila de grupo seleccionada** usa lavado de tapiz, sin pestaña lateral.
- **Shell con el aspecto de `/app` (2026-11-12):** el área de dirección se ve como la app clásica sin cambiar su navegación ni sus permisos.
  - **Lateral:** 248 px de zona de seguridad con fibra (`mat-field-deep`). Arriba, el nombre de la academia en titular condensado sobre una regla blanca de 3 px y debajo el plan en rótulo de pista azul calle (con aviso de solo lectura y «Ver planes» si el rol gestiona el plan). Botón de cinta «Añadir gimnasta» solo con la capacidad de gestionar gimnastas. Secciones «Día a día», «Personas» y «Club» en rótulo de pista azul calle; ítems de 44 px al 80 % de blanco, activo en cinta blanca con texto zona de seguridad y foco en anillo blanco. Sin nombre de academia, el lateral rotula la marca. No lleva buscador: la lista de gimnastas de `/owner` no admite búsqueda por URL.
  - **Cabecera:** blanca con línea de magnesio; marca Z en tapiz y, solo donde no hay lateral, la academia tras una regla vertical de 3 px.
  - **Navegación inferior móvil:** las mismas celdas y «Más»; activo relleno tapiz con texto blanco, etiquetas a 0,75 rem.
  - **Hero del Resumen:** banda de tapiz con marco de cinta, la academia como `h1` (con «Resumen de» solo para lectores de pantalla), la sede o «Todas las sedes» en rótulo de pista, el saludo con el siguiente paso real (puesta en marcha, listas sin pasar o sesiones de hoy) y su acción en cinta blanca, el reloj de pista a la derecha y, al pie, la franja del plan: nombre y estado de la política operativa y, solo para la titular, el uso real (gimnastas, clases y grupos frente a su límite) con barra y «Mejorar plan».
  - **Puesta en marcha:** mismo formato que en `/app`: paso actual en numeral de 6 rem, «Paso N de M · X% completado», barra de 6 px, acción del paso y «Ver N pendientes» con la lista reglada de pendientes.

### Huecos conocidos (no son reglas del sistema)
Estado registrado tras la tercera ronda de pulido (2026-11-08), comprobado en código. Nada de esta lista debe copiarse como patrón.

**Fuera de alcance por decisión:**
- **Cuerpo de `/super-admin`:** antetítulo en píldora, titular en dos tonos, tarjetas KPI con franjas, puntos con el color en crudo de cada serie y la Z con degradado. Solo su barra global (distintivo de área) entró en el mundo; el resto de su paleta se pinta en dos tintas solo por el alias. Desde el 2026-11-09 (P2 #20) sus textos e iconos cumplen AA sobre noche: el coral pasa a `signal-light` (7,9:1), el azul tapiz y el tapiz claro como texto pasan a `mat-lane` (≥7,8:1 sobre sus lavados) y el blanco al 40–45 % pasa al 60 % (6,6–7,0:1 como texto sobre noche y sus tarjetas; 6,0:1 como marcador dentro de campos `white/10`). Las piezas compartidas pensadas para claro (`PageHeader`, campos del directorio) llevan su variante nocturna o su tinta explícita. El auditor es `scripts/audit-contrast.mjs`.
- **Plantillas de correo, PDF y Stripe:** otro medio, con sus propios colores literales y fuentes.
- **Editores de marca de la academia y escaparate (`BrandingEditor`, editor de página pública, tienda):** ahí los colores son contenido de la persona usuaria, no interfaz.

**Pendientes dentro del producto:**
- **Modo oscuro revisado** en `/app` (panel, gimnastas, grupos, entrenamientos, ajustes), home, precios y login. No se ha revisado de noche en `/owner` (pide una sesión real de Supabase), `/super-admin` ni en las páginas públicas secundarias.
- **`/owner` sin revisión visual:** pide una sesión real de Supabase que el entorno local no tiene y redirige al login. Está verificado solo en código (`tsc`, eslint) y en tests de render; el shell y el hero de 2026-11-12 tampoco tienen capturas.
- **Disciplinas del panel del club:** pizarra y noche se distinguen menos que los tintes violeta, rosa y verde anteriores.
- **Rótulo de entrenadoras en género único:** la página y la navegación ya coinciden («Entrenadoras», del registro de especialización), pero el rótulo no cambia cuando el equipo es mixto, y la cabecera de la tabla de clases dice «Entrenadores/as». «Equipo técnico», que ya usa Asistencia, valdría para todos los casos; es una decisión de terminología del producto, no de diseño.
- **Aparatos repetidos en clases:** «Suelo y barra», «Suelo» y «Barra de equilibrio» aparecen juntos. Viene de los datos de la configuración deportiva, no de la interfaz.
- **Detector «gray-on-color»:** 14 hallazgos que son tinta de rampa sobre lavados teñidos con contraste suficiente; no se cambiaron.
- **Sin revisión visual:** el aviso de inicio de sesión fallido (un toast) no llegó a pintarse en la captura porque el Supabase local no respondía; los errores de validación por campo y los rótulos de la navegación global para usuarios que no son super admin están verificados solo en código. Sí se revisaron el aviso de servicio del registro y los estados hover del lateral, de las filas de tabla y del botón principal.
- **Hexadecimales fuera del mundo:** solo quedan en `/super-admin` y en `BrandingEditor`, ambos fuera de alcance. El modo oscuro del error de campo usa el token `signal.light` (`#FF8A73`).
- **`AthleteProfileHeader` sin uso:** no se monta en ninguna ruta y conserva banda noche, avatar con sombra y tarjetas de 14 px con `shadow-soft`. No sirve de referencia.
- **Familias de Tailwind por nombre:** unos 264 archivos de `src` aún escriben `amber`, `red`, `green`, `teal`, `gray`, `slate`… Gracias a The Alias Rule se pintan en dos tintas, pero no se diseñaron una a una: conservan radios de 16 px y avisos ámbar que ahora salen en coral de error. Sus sombras ya son de contacto porque el tema redefine `shadow-sm` … `shadow-2xl`.

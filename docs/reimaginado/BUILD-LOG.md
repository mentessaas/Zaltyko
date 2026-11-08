# Zaltyko reimaginado: «Magnesio sobre tapiz»

**Fecha:** 2026-11-08
**Rama:** `claude/reimaginado-20261108` (worktree `trabajos/Zaltyko-reimaginado-20261108`), desde `d5b8d961`.
**Método:** skill *impeccable* (PRODUCT.md → sorteo de dirección → construcción → inspección → revisión
final independiente) + ui-indexador (búsqueda semántica con Ollama) como fuente de patrones.

## Decisiones confirmadas por el usuario

- Usuario principal: dirección de la academia.
- Marca intocable: solo el nombre Zaltyko y el logo Z. Paleta, tipografía y copy, libres.
- Alcance: web pública (home, precios, entrada) + app núcleo (shell, panel, gimnastas, grupos).
- Dirección visual elegida en la página de decisión: **«Magnesio sobre tapiz»** (seed 709cef6f).

## El mundo

- Tapiz azul de competición (#1E3FA8 / #14307F / noche #0B1430), magnesio (#F4F6F2), cinta blanca como
  estructura, coral señal (#E5482A) solo para alertas.
- Una sola familia, Archivo variable (OFL, autoalojada): condensada en mayúsculas para rótulos, normal para
  trabajar, cifras tabulares.
- Firma: palotes de magnesio (`ChalkTally`). En la home, tocar una gimnasta suma un palote.
- Todo el SaaS hereda el mundo: los alias `zaltyko-*` se reasignaron a los nuevos valores, así que las
  ~800 pantallas cambian sin reescribirse una a una.

## Piezas de ui-indexador usadas como patrón

| Pieza | Fuente | Uso |
|---|---|---|
| Shell de app | @ballmac/app-shell-1 | Estructura de la barra lateral: academia, acción, navegación agrupada |
| Precios 4 niveles | @uiception/pricing-section-v2 | Conmutador con radios nativos y pastilla deslizante, CTA anclado |
| Footer 5 columnas | @uiception/footer-section-v2 | Rejilla 2→3→5 |
| FAQ | @mischief/accordion | `<details>` nativo, contenido indexable |
| Login | @blocks-so/login-06 | Recuperación como enlace, separador «o continúa con» |
| Cifras | @blocks-so/stats-01 | Rejilla `gap-px` reglada |

## Revisión final (revisor independiente)

Cuatro rondas con el mismo revisor (contexto limpio). Resultado final: **ship** sobre las correcciones
puntuadas.

| # | Corrección | Estado final |
|---|---|---|
| 1 | «Más elegido» era una afirmación de uso → «Recomendado» | Resuelto |
| 2 | Palotes en magnesio blanco sobre el tapiz, sin tarjeta blanca; 3/7 cuadra con la lista | Resuelto |
| 3 | Fuera las sobrelíneas encima de los títulos | Resuelto |
| 4 | Cifras como marcador reglado; sin tarjetas anidadas; plan como línea al pie de la banda | Resuelto |
| 5 | Dos tintas: colores de grupo traducidos a tonos del tapiz (`src/lib/mat/group-ink.ts`); gráficos en azules | Resuelto |
| 6 | Vocabulario «Gimnastas»; recuentos correctos (la discrepancia venía de mi siembra de prueba); avisos de onboarding solo cuando son ciertos (era un fallo real) | Resuelto |
| 7 | Barra de Gimnastas en una fila reglada; tabla a ancho completo | Resuelto |
| 8 | Hoy primero en móvil; barra inferior con etiquetas de una palabra | Resuelto |
| R | Regresiones: etiquetas partidas, aviso de grupos con 4 grupos, captura de Pulso | Resueltas |

También en esta ronda: numerales de paso grandes en la puesta en marcha, Recomendaciones / accesos /
calendario como paneles reglados, contrastes de alerta a ≥ 4.5:1, detector de impeccable a 0 hallazgos.

Sin puntuar (fuera de las correcciones revisadas): el login no se recapturó tras la última ronda; los
numerales de paso no salen en capturas porque la academia de prueba tiene la puesta en marcha completa;
AlertsWidget no aparece en ninguna captura.

## Pasada de pulido (huecos de DESIGN.md)

Tres rondas más con el mismo revisor → **ship** (cubre lo puntuado en estas rondas).

- `bg-zaltyko-warm-white` (≈23 pantallas, nunca definida) pasa a token; sombras y `.card-hover` heredados quedan planos.
- Fuera ámbar y rojo de Tailwind: chip de Pulso, AlertsWidget, arranque recomendado y columnas del kanban usan solo tapiz, magnesio y señal.
- Errores de formulario en tinta señal; controles de la barra de Gimnastas a 44 px; tamaños 10/11 px eliminados.
- Barra superior de zonas globales con rótulos y cinta bajo el activo; etiqueta Super Admin en noche.
- Grupos: barra reglada, estado vacío limpio y aviso «Empieza aquí» solo sin grupos.
- Ficha de gimnasta: estado en español, fechas legibles, sin sobrelínea, punto de grupo en tinta del tapiz.
- Academia nueva: Pulso con estado vacío honesto («Sin datos todavía»), «—» en asistencia, sin bienvenida duplicada; copy neutra («Te damos la bienvenida», «Hola de nuevo»).
- Verificado con una segunda academia vacía en la base de prueba (Club Rítmica Nuevo) para ver la puesta en marcha (1/7).

Sin puntuar: rótulos de la barra global (el usuario de prueba es super admin y ve otra navegación), estados de
error de formulario y hover. Fuera de alcance: el cuerpo de /super-admin sigue en el mundo anterior.
El «Rítmica» sin acento que el revisor vio en el selector es de render a 12 px: el DOM y la base tienen la «í».

## Pasada sobre pantallas heredadas

Dos rondas más con el mismo revisor → **ship** (cubre lo puntuado).

- **Regla de alias a nivel de tema** (`tailwind.config.mjs`): las familias de Tailwind se reasignan a escalas del mundo
  (azules/verdes/violetas → tapiz, rojos/ámbares → señal, grises → rampa). Unas 210 pantallas heredadas pasan a dos
  tintas sin editarlas una a una. El código nuevo sigue usando los tokens semánticos.
- Sin elevación al pasar en todo el SaaS; chips de grupo neutros con punto en tinta del tapiz (12 archivos);
  pestañas laterales gruesas, texto degradado, rebotes y tamaños de 9-11 px eliminados.
- Menú móvil de la app en tapiz; «Pulso» con cifra condensada y pestañas planas de 44 px.
- **Entrenamientos:** marcador reglado, una sola acción principal, horas HH:MM, fechas legibles y aparatos en español.
- **Ajustes:** una sola navegación; «Estado por rama» como lista reglada en lenguaje claro (sin «legacy» ni «scope»);
  «Configuración federativa» legible.
- **Informes:** cabecera común; el estado «Disponible más adelante» va en la descripción.
- **Entrenadoras y Asistencia:** botón principal del mundo, chips de cinta, fechas legibles, «Equipo técnico».

Fallos reales del producto corregidos por el camino:
- La API de ajustes devolvía «rítmica» por defecto a cualquier academia sin variante guardada; ahora la deduce del tipo.
- Un `<textarea>` recibía `value={null}` (aviso de React en Ajustes).

Detector sobre todo `src`: de 427 a ~300 hallazgos; el resto son plantillas de correo/PDF, editores de marca de la
academia (colores del usuario), `/super-admin` (fuera de alcance) y 14 avisos de gris sobre lavado con contraste correcto.
Pendiente: la etiqueta «Entrenadoras» (navegación) frente a «Entrenadores/as» (página) viene de dos sistemas de
terminología distintos; sin captura: estados de error de formulario, hover y la barra global para usuarios no super admin.

Cierre de la pasada: el documentador detectó cuatro restos que no cuadraban con lo afirmado y se corrigieron
(texto del tooltip de los gráficos casi blanco sobre blanco, introducido en la pasada anterior; pestaña lateral del
calendario; puntos de grupo en la ficha de entrenador y en el detalle de grupo; animaciones de rebote y elevación
sin uso). Además se quitaron `hover:scale` y las sombras grandes al pasar en 31 archivos.
Estado final del detector en interfaz dentro del alcance: 17 hallazgos (14 gris sobre lavado con contraste correcto).

## Verificación

- `tsc --noEmit`: exit 0. `eslint --quiet` sobre lo tocado: 0.
- Detector de impeccable: 0 hallazgos tras corregir tamaños fuera de escala, bordes laterales y colores no documentados.
- Capturas 1440 y 390 en `comparacion-ui-indexador-20261108/reimaginado/` y la página `comparacion.html`.
- No ejecutado: vitest, Playwright e2e, axe, build de producción.
- Nada commiteado, desplegado ni llevado a producción.

## Tercera pasada de pulido (huecos restantes de DESIGN.md)

Se cerraron los pendientes que DESIGN.md listaba dentro del producto:
- **Sombras por defecto de Tailwind** redefinidas en el tema (de `sm` a `lg`, contacto; `xl` y `2xl`, overlay). Las tarjetas heredadas con `shadow-lg` o `shadow-xl` quedan planas.
- **167 hexadecimales heredados** en 33 archivos de interfaz pasaron a valores del mundo. Solo quedan en `/super-admin` y `BrandingEditor`, fuera de alcance. Nuevo token `signal.light` (`#FF8A73`) para errores de campo en modo oscuro.
- **Entrenadoras:** el título y la miga de la página usan el mismo rótulo que la navegación.
- **Mi asistencia:** «Excusa» en rampa, distinta del coral de «Ausente».
- **Área de propietario:** las franjas laterales de 2 px pasan a bloques reglados o a un aviso en lavado de señal.
- **Ficha de gimnasta:** filas regladas en lugar de cajas sobre polvo; chips sin mayúsculas con tracking.
- **Tabla de gimnastas:**
  - El distintivo de estado y la etiqueta móvil son chips de cinta de 6 px.
  - Las acciones por lote usan botones del sistema de 44 px.
- **Clases:**
  - La base recomendada es una fila reglada, sin tarjetas anidadas.
  - El estado vacío es discontinuo.
- **Pulso operativo:**
  - Sin degradado bajo la línea.
  - Las pestañas van sobre una regla, sin cápsula.
- **Alertas** con radio de 6 px.
- **Objetivos de 44 px:**
  - El filtro de rama de grupos.
  - Los ítems del menú de perfil.
  - Los botones de cuenta del cajón móvil (48 px).
- **El CTA del estado vacío de grupos** usa el botón principal del mundo.

Revisión independiente con 16 capturas nuevas, incluidos estados de error y de hover. Encontró un defecto material: el aviso del registro decía «No se iniciará el alta Owner», jerga interna en inglés. Se reescribió como «No se creará la cuenta de dirección» en sus tres apariciones, y el aviso pasó del ámbar al lavado de señal.

Quedan registrados en DESIGN.md, sin tocar:
- El rótulo «Entrenadoras» no cambia con un equipo mixto. Es una decisión de terminología del producto.
- Los aparatos aparecen repetidos en clases. Vienen de los datos.
- El aviso de inicio de sesión fallido no se capturó porque el Supabase local no respondía.

Verificación: `tsc --noEmit` (src) y eslint sin errores. No se ejecutaron vitest, e2e ni el build de producción. No hay nada commiteado.

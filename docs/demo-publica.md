# Demo pública (`/demo`)

Recorrido sin registro por una academia de gimnasia **ficticia** («Club Demo Cinta Azul»), con los componentes reales de `/owner` y `/familia`. Origen: análisis de competencia A15 (`documentacion/Zaltyko/auditoria-2026-11-14/brechas-competencia.md`; ScoreGym enseña una demo sin registro).

## Qué se ve

| Paso | Ruta | Componente real |
|---|---|---|
| 1. Resumen | `/demo` | `OwnerEssentialDashboard` |
| 2. Clases | `/demo/clases` | `OwnerClassesManager` |
| 3. Asistencia | `/demo/asistencia` | `OwnerAttendanceManager` |
| 4. Gimnastas | `/demo/gimnastas` | `OwnerAthleteIntakeWorkspace` |
| 5. Cobros (cuotas) | `/demo/cuotas` | `ManualPaymentForm` |
| 6. Portal de familia | `/demo/familia`, `/demo/familia/cuotas`, `/demo/familia/gimnastas/[id]` | `FamilyHomeView`, `FamilyFeesView`, `FamilyAthleteView` |

Las vistas del portal de familia se extrajeron de las páginas de `/familia` (sin cambiar su comportamiento) para compartirlas. El portal figura «En preparación» en la web pública: la demo lo dice en un aviso.

## Cómo garantiza que no toca nada

- **Datos**: `src/modules/demo/demo-fixtures.ts`, calculados en memoria a partir de la fecha de hoy (para que «Hoy» siempre tenga sesiones). Apellidos que son palabras de prueba (Ejemplo, Muestra, Prueba…) y no apellidos reales; sin siglas, fotos ni contacto. Las páginas son `force-dynamic` por eso.
- **Red**: `src/modules/demo/demo-guard.ts` sustituye `window.fetch` mientras la demo está montada. Las lecturas de `/api/v1/owner/*` que necesitan los componentes se contestan con datos de ejemplo; cualquier escritura (POST/PUT/PATCH/DELETE, incluidas las acciones de servidor) se rechaza con un `problem+json` «forbidden» que las pantallas tratan como negativa definitiva (no dejan reintentos pendientes); las llamadas a `*.supabase.co` se bloquean. Tampoco se pide ni se precarga el panel real: cualquier GET a `/owner` o `/familia` (navegación o precarga de `next/link`, que traería páginas con datos de la cuenta de quien tenga sesión abierta) se contesta 404 sin red, de modo que ningún enlace de un componente reutilizado llega al panel real aunque esté escrito contra `/owner`. La única petición que sale es el POST de la medición pública (`/api/growth/events`), que pasa sin avisar para que el aviso no genere su propio evento.
- **Formularios**: `DemoSandbox` frena el envío de cualquier formulario y muestra «En la demo no se guarda nada» con CTA a crear cuenta.
- **Enlaces**: los enlaces a `/owner` y `/familia` se reescriben a su equivalente en `/demo` (`demo-routes.ts`); lo que la demo no incluye lleva a `/demo/mas`.
- **Servidor**: ninguna página de la demo importa base de datos, Supabase, sesión ni servicios de aplicación. Lo comprueba `tests/demo-no-database.contract.test.ts`.

## SEO

`noindex, follow` en toda la demo y fuera del sitemap. Son pantallas de aplicación con datos ficticios y casi sin texto (contenido fino), repetirían lo que ya explican `/features` y `/pricing` y repartirían la señal entre nueve URL. Lo que sí vale es el enlace desde la home y los precios (`follow`).

## Medición

Tres eventos en `PUBLIC_GROWTH_EVENT_NAMES`, por el canal público que ya usa `/pricing` (`capturePublicGrowthEvent`), sin datos personales:

- `demo_viewed` — entrada; propiedad `origen`: `inicio` | `precios` | `directo`.
- `demo_signup_clicked` — clic al registro; `colocacion` (banner, aviso, final-recorrido, seccion-no-incluida, enlace) y `seccion`.
- `demo_action_blocked` — intento de guardar; `seccion`.

`seccion` es siempre una clave de los pasos (resumen, clases, asistencia, gimnastas, cuotas, familia) u «otra» (`demo-steps.ts`); nunca la ruta tal cual.

**Aviso:** `capturePublicGrowthEvent` está hoy deshabilitado a propósito (no hay receptor con consentimiento verificado), así que los eventos solo registrarán cuando se reabra ese canal, igual que `pricing_viewed`.

## Cómo añadir una pantalla a la demo

1. Datos en `demo-fixtures.ts` (tipados con los tipos reales).
2. Si el componente lee de la API, un `DemoApiResponder` con el mismo formato que valida el componente.
3. Ruta en `demo-routes.ts` y paso en `DemoStepper`.
4. La prueba de contrato recorre `src/app/demo`, `src/components/demo` y `src/modules/demo` sola.

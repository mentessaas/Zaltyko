import { ownerUi } from "./owner-ui";

// Tonos de estado del mundo (DESIGN.md, «Tonos de estado» y The Aviso Rule)
// para las pantallas de /owner (gimnastas, grupos, clases, asistencia,
// inscripciones, solicitudes, equipo) y el portal de familias.
//
// En `owner-ui.ts`, el aviso (`noticeWarning`) y el chip de atención
// (`chipAttention`) siguen hoy en lavado de señal (coral) hasta que el PR-R lo
// alinee. Mientras tanto, estas pantallas no usan esas dos claves para avisos:
// lo pendiente va en ocre y solo el error, la deuda o el borrado van en señal.
// Cuando `owner-ui.ts` exponga el aviso en ocre, `ownerTone.noticeWarning`
// puede pasar a reutilizarlo.
const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-z-brand-500";

const FOCUS_RING_MAT =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mat";

const CHIP = "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold";

export const ownerTone = {
  // Aviso: pendiente, bloqueado mientras se confirma, revisar antes de seguir.
  noticeWarning: "rounded-md border border-ochre-line bg-ochre-wash p-4 text-sm leading-6 text-ochre-ink",
  // Error: fallo, operación rechazada o confirmación destructiva.
  noticeError: ownerUi.noticeError,
  // Información o éxito sin acción: lavado tapiz.
  noticeInfo: ownerUi.noticeInfo,
  // Mensaje neutro (resultado que puede ser éxito o error ya nombrado en el texto).
  noticeNeutral: "rounded-md border border-z-line bg-z-canvas p-4 text-sm leading-6 text-z-ink",
  // Línea suelta de aviso o de error dentro de un bloque.
  warningText: "text-sm leading-6 text-ochre-ink",
  errorText: "text-sm font-semibold leading-6 text-signal-ink",

  // Chips de cinta (rectángulo de 6 px, nunca píldora).
  chipWarning: "inline-flex items-center rounded-md bg-ochre-wash px-2.5 py-1 text-xs font-semibold text-ochre-ink",
  chipError: "inline-flex items-center rounded-md bg-signal-wash px-2.5 py-1 text-xs font-semibold text-signal-ink",
  chipSuccess: "inline-flex items-center rounded-md bg-mat-wash px-2.5 py-1 text-xs font-semibold text-mat-deep",
  chipOutline: "inline-flex items-center rounded-md border border-z-line bg-white px-2.5 py-1 text-xs font-semibold text-z-ink",

  // Peligro: tinta de señal con texto blanco, hover a `signal-800`; nunca `signal` puro.
  dangerButton: `touch-target inline-flex min-h-12 max-w-full items-center justify-center gap-2 rounded-lg bg-signal-ink px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-signal-800 ${FOCUS_RING} disabled:cursor-not-allowed disabled:opacity-50`,
  // Acción destructiva secundaria (quitar de un grupo): contorno con tinta de señal.
  dangerOutlineButton: `touch-target inline-flex min-h-12 max-w-full items-center justify-center gap-2 rounded-lg border border-signal/30 bg-white px-4 py-2 text-sm font-semibold text-signal-ink transition-colors hover:bg-signal-wash ${FOCUS_RING} disabled:cursor-not-allowed disabled:opacity-50`,

  // Bloque interior de un panel reglado: no se anidan paneles reglados.
  innerPanel: "rounded-md border border-z-line bg-white p-4",

  // Tabla reglada: abre con la regla de 3 px en noche, cabecera en rótulo de
  // pista sobre magnesio y filas separadas por línea de magnesio.
  table: "w-full border-t-[3px] border-t-z-ink text-left text-sm",
  tableHeadRow: "border-b border-z-line bg-z-canvas",
  tableHeadCell: "floor-label px-3 py-2.5 text-z-soft",
  tableRow: "border-b border-z-line align-top transition-colors hover:bg-z-brand-50",
  tableCell: "px-3 py-3",

  // --- Asistencia, inscripciones, solicitudes, equipo y portal de familias ---
  // Texto suelto de aviso o error junto a un campo o una fila.
  inlineWarning: "text-sm leading-6 text-ochre-ink",
  inlineError: "text-sm font-semibold leading-6 text-signal-ink",
  // Chips de estado: activo/en curso en tapiz, reposo en polvo.
  chipActive: `${CHIP} bg-mat-wash text-mat-deep`,
  chipRest: `${CHIP} bg-chalk-dust text-ramp-600`,
  // «Ahora»: en curso, rótulo de pista en lavado tapiz con punto pulsante.
  chipLive: "inline-flex items-center gap-1.5 rounded-md bg-mat-wash px-2 py-0.5 text-[11px] font-bold uppercase text-mat-deep",
  dotLive: "h-1.5 w-1.5 rounded-sm bg-mat-light motion-safe:animate-pulse",
  // Acción secundaria silenciosa (texto subrayado de 44 px).
  quietButton: `touch-target inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold text-mat-night underline underline-offset-4 hover:text-mat ${FOCUS_RING_MAT} disabled:cursor-not-allowed disabled:opacity-50`,
  // Pestañas planas con un tramo de cinta de 3 px bajo la activa.
  tabList: "flex min-w-0 flex-wrap items-stretch gap-1 border-b border-chalk-line",
  tab: `relative inline-flex min-h-11 items-center px-3 text-sm font-semibold transition-colors after:absolute after:inset-x-3 after:-bottom-px after:h-[3px] after:origin-center after:bg-mat after:transition-transform after:duration-200 ${FOCUS_RING_MAT}`,
  tabActive: "text-mat after:scale-x-100",
  tabIdle: "text-ramp-600 after:scale-x-0 hover:text-mat-night",
} as const;

export function ownerTab(active: boolean): string {
  return `${ownerTone.tab} ${active ? ownerTone.tabActive : ownerTone.tabIdle}`;
}

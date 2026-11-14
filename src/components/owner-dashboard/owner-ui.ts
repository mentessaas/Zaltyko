import { fieldControlClassName } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Único origen de los tonos y piezas del panel del club (`/owner`) y del
// portal de familias en el mundo «Magnesio sobre tapiz» (DESIGN.md): paneles
// reglados (regla de 3 px en noche), rotulado condensado en mayúsculas, chips
// de cinta de 6 px y botón principal en azul tapiz.
//
// Tonos de estado (DESIGN.md, «Tonos de estado» y The Señal Rule):
// - aviso (pendiente, bloqueado mientras se confirma, revisar): ocre;
// - error, deuda o borrado: señal (coral), nunca para avisos.
//
// La cabecera de pantalla es `PageHeader` (`components/ui/page-header`), sin
// antetítulo ni nombre del club encima del título.
const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-z-brand-500";

const FOCUS_RING_MAT =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mat";

const CHIP = "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold";

const NOTICE_WARNING = "rounded-md border border-ochre-line bg-ochre-wash p-4 text-sm leading-6 text-ochre-ink";
const NOTICE_ERROR =
  "rounded-md border border-signal/30 border-t-[3px] border-t-signal-ink bg-signal-wash p-4 text-sm font-semibold leading-6 text-signal-ink";
const NOTICE_INFO = "rounded-md border border-z-brand-100 bg-z-brand-50 p-4 text-sm leading-6 text-z-brand-700";
const CHIP_WARNING = "inline-flex items-center rounded-md bg-ochre-wash px-2.5 py-1 text-xs font-semibold text-ochre-ink";

export const ownerUi = {
  page: "mx-auto w-full max-w-6xl px-5 pb-16 pt-7 sm:pt-9 lg:px-10",
  pageWide: "w-full px-5 pb-16 pt-7 sm:pt-9 lg:px-10",
  // Separación bajo `PageHeader` en las pantallas de `/owner`.
  pageHeader: "mb-7 sm:mb-8",
  backLink: `touch-target inline-flex items-center gap-1.5 rounded-lg text-sm font-semibold text-z-soft hover:text-z-ink ${FOCUS_RING}`,

  card: "rounded-xl border border-z-line border-t-[3px] border-t-z-ink bg-white p-5 sm:p-6",
  cardFlush: "overflow-hidden rounded-xl border border-z-line border-t-[3px] border-t-z-ink bg-white",
  cardHeader: "flex items-center justify-between gap-3 border-b border-z-line px-5 py-4",
  listItem: "rounded-md border border-z-line bg-white p-4 sm:p-5",
  subtlePanel: "rounded-md bg-z-canvas p-3.5 sm:p-4",
  iconTile: "flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-z-brand-50 text-z-brand-600",
  sectionTitle: "min-w-0 break-words font-display text-xl font-black uppercase leading-none text-z-ink [overflow-wrap:anywhere] sm:text-2xl",
  cardTitle: "min-w-0 break-words font-display text-xl font-black uppercase leading-none text-z-ink [overflow-wrap:anywhere] sm:text-2xl",
  muted: "text-sm leading-6 text-z-soft",

  metricCard: "min-w-0 rounded-xl border border-z-line border-t-[3px] border-t-z-ink bg-white p-4",
  metricLabel: "floor-label text-z-soft",
  metricValue: "mt-2 min-w-0 break-words font-display text-3xl font-black leading-none tabular-nums text-z-ink sm:text-4xl lg:text-5xl",

  label: "text-sm font-semibold text-z-ink",
  smallLabel: "text-xs font-semibold text-z-soft",
  help: "text-xs leading-5 text-z-soft",
  field: `min-h-12 min-w-0 w-full rounded-lg border border-z-line bg-white px-3 text-base text-z-ink transition-colors hover:border-z-soft/40 sm:text-sm ${FOCUS_RING} disabled:cursor-not-allowed disabled:bg-z-canvas disabled:opacity-70`,

  primaryButton: `touch-target inline-flex min-h-12 max-w-full items-center justify-center gap-2 rounded-lg bg-z-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-[0_1px_0_rgba(11,20,48,0.25)] transition-colors hover:bg-z-ink ${FOCUS_RING} disabled:cursor-not-allowed disabled:opacity-50`,
  brandButton: `touch-target inline-flex min-h-12 max-w-full items-center justify-center gap-2 rounded-lg bg-z-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-[0_1px_0_rgba(11,20,48,0.25)] transition-colors hover:bg-z-ink ${FOCUS_RING} disabled:cursor-not-allowed disabled:opacity-50`,
  secondaryButton: `touch-target inline-flex min-h-12 max-w-full items-center justify-center gap-2 rounded-lg border border-z-line bg-white px-4 py-2 text-sm font-semibold text-z-ink transition-colors hover:border-z-brand-500 hover:bg-z-brand-50 ${FOCUS_RING} disabled:cursor-not-allowed disabled:opacity-50`,
  // Botón de icono (quitar, borrar): al pasar el ratón anuncia el borrado en señal.
  iconButton: `touch-target inline-flex min-h-12 min-w-12 items-center justify-center rounded-lg border border-z-line bg-white text-z-soft transition-colors hover:border-signal/30 hover:bg-signal-wash hover:text-signal-ink ${FOCUS_RING} disabled:cursor-not-allowed disabled:opacity-50`,
  textLink: `rounded-md text-sm font-semibold text-z-brand-600 hover:text-z-brand-700 ${FOCUS_RING}`,

  // Información o éxito sin acción.
  noticeInfo: NOTICE_INFO,
  // Aviso: pendiente, bloqueado mientras se confirma, revisar antes de seguir.
  noticeWarning: NOTICE_WARNING,
  // Error: fallo, operación rechazada o confirmación destructiva.
  noticeError: NOTICE_ERROR,

  emptyState: "flex flex-col items-center rounded-xl border border-dashed border-z-line bg-white px-6 py-10 text-center sm:py-12",
  emptyIcon: "mb-4 flex h-11 w-11 items-center justify-center rounded-md bg-z-brand-50 text-z-brand-600",
  chip: "inline-flex items-center rounded-md bg-z-canvas px-2 py-1 text-xs font-semibold text-z-ink",
  chipAccent: "inline-flex items-center rounded-md bg-z-brand-50 px-2.5 py-1 text-xs font-semibold text-z-brand-700",
  // Atención (pendiente de revisar): el mismo ocre que el aviso.
  chipAttention: CHIP_WARNING,
  chipSuccess: "inline-flex items-center rounded-md bg-z-brand-500 px-2.5 py-1 text-xs font-semibold text-white",
  // Barra de 6 px con esquinas cortas, no píldora.
  meterTrack: "h-1.5 overflow-hidden rounded-sm bg-chalk-dust",
} as const;

// Tonos de estado y piezas de las pantallas de gimnastas, grupos, clases,
// asistencia, inscripciones, solicitudes, equipo y portal de familias.
export const ownerTone = {
  noticeWarning: NOTICE_WARNING,
  noticeError: NOTICE_ERROR,
  noticeInfo: NOTICE_INFO,
  // Mensaje neutro (resultado que puede ser éxito o error ya nombrado en el texto).
  noticeNeutral: "rounded-md border border-z-line bg-z-canvas p-4 text-sm leading-6 text-z-ink",
  // Línea suelta de aviso o de error dentro de un bloque.
  warningText: "text-sm leading-6 text-ochre-ink",
  errorText: "text-sm font-semibold leading-6 text-signal-ink",

  // Chips de cinta (rectángulo de 6 px, nunca píldora).
  chipWarning: CHIP_WARNING,
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

// Campo del alta de academia y de los cobros: el de `components/ui` (radio de
// 10 px, 44 px de alto, foco tapiz), a 16 px en móvil para que iOS no amplíe
// la página.
export const ownerField = cn(fieldControlClassName, "px-3 text-base sm:text-sm");

export type OwnerDiscipline = "artistic" | "rhythmic" | "other";

export function ownerDisciplineOf(programName: string | null | undefined): OwnerDiscipline {
  const name = (programName ?? "").toLocaleLowerCase("es");
  if (name.includes("rítmica") || name.includes("ritmica")) return "rhythmic";
  if (name.includes("artística") || name.includes("artistica") || name.includes("gaf") || name.includes("gam")) return "artistic";
  return "other";
}

export const ownerDisciplineStyle: Record<OwnerDiscipline, { tile: string; bar: string; dot: string }> = {
  artistic: { tile: "bg-z-art-50 text-z-art-600", bar: "bg-z-art-600", dot: "bg-z-art-600" },
  rhythmic: { tile: "bg-z-rit-50 text-z-rit-600", bar: "bg-z-rit-600", dot: "bg-z-rit-600" },
  other: { tile: "bg-z-comp-50 text-z-comp-600", bar: "bg-z-comp-600", dot: "bg-z-comp-600" },
};

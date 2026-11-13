// Tonos de estado y pestañas «Magnesio sobre tapiz» para asistencia,
// inscripciones, solicitudes, equipo y el portal de familias.
//
// `owner-ui.ts` es el contrato común con el Resumen y todavía pinta su
// `noticeWarning` y su `chipAttention` en lavado de señal (coral). Aquí el
// aviso va en ocre (The Aviso Rule: pendiente, sin confirmar, revisar), el
// error sigue en señal, lo activo o en curso en tapiz y lo que está en reposo
// en polvo. Todo compone con `ownerUi`; candidato a integrarse en `owner-ui.ts`
// cuando se alinee el contrato común (PR-R de la auditoría de coherencia).
import { ownerUi } from "./owner-ui";

const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mat";

const CHIP = "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold";

export const ownerTone = {
  // Avisos en bloque.
  noticeWarning: "rounded-md border border-ochre-line bg-ochre-wash p-4 text-sm leading-6 text-ochre-ink",
  noticeError: ownerUi.noticeError,
  noticeInfo: ownerUi.noticeInfo,
  noticeNeutral: "rounded-md border border-chalk-line bg-chalk p-4 text-sm leading-6 text-mat-night",

  // Texto suelto de aviso o error junto a un campo o una fila.
  inlineWarning: "text-sm leading-6 text-ochre-ink",
  inlineError: "text-sm font-semibold leading-6 text-signal-ink",

  // Chips de cinta (6 px, nunca píldora), uno por tono.
  chipActive: `${CHIP} bg-mat-wash text-mat-deep`,
  chipWarning: `${CHIP} bg-ochre-wash text-ochre-ink`,
  chipError: `${CHIP} bg-signal-wash text-signal-ink`,
  chipRest: `${CHIP} bg-chalk-dust text-ramp-600`,
  chipOutline: `${CHIP} border border-chalk-line bg-white text-ramp-600`,
  // «Ahora»: en curso, rótulo de pista en lavado tapiz con punto pulsante.
  chipLive: "inline-flex items-center gap-1.5 rounded-md bg-mat-wash px-2 py-0.5 text-[11px] font-bold uppercase text-mat-deep",
  dotLive: "h-1.5 w-1.5 rounded-sm bg-mat-light motion-safe:animate-pulse",

  // Acción destructiva confirmada: tinta de señal, nunca `signal` puro.
  dangerButton: `touch-target inline-flex min-h-12 max-w-full items-center justify-center gap-2 rounded-lg bg-signal-ink px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-signal-800 ${FOCUS_RING} disabled:cursor-not-allowed disabled:opacity-50`,
  // Acción secundaria silenciosa (texto subrayado de 44 px).
  quietButton: `touch-target inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold text-mat-night underline underline-offset-4 hover:text-mat ${FOCUS_RING} disabled:cursor-not-allowed disabled:opacity-50`,

  // Pestañas planas con un tramo de cinta de 3 px bajo la activa, como la
  // barra pública y `GlobalTopNav`. Sin botones principal/secundario.
  tabList: "flex min-w-0 flex-wrap items-stretch gap-1 border-b border-chalk-line",
  tab: `relative inline-flex min-h-11 items-center px-3 text-sm font-semibold transition-colors after:absolute after:inset-x-3 after:-bottom-px after:h-[3px] after:origin-center after:bg-mat after:transition-transform after:duration-200 ${FOCUS_RING}`,
  tabActive: "text-mat after:scale-x-100",
  tabIdle: "text-ramp-600 after:scale-x-0 hover:text-mat-night",
} as const;

export function ownerTab(active: boolean): string {
  return `${ownerTone.tab} ${active ? ownerTone.tabActive : ownerTone.tabIdle}`;
}

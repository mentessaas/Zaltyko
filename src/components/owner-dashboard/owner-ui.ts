// Base común del panel del club en el mundo «Magnesio sobre tapiz»: paneles
// reglados (regla de 3 px en noche), rotulado condensado en mayúsculas, chips
// de cinta de 6 px, botón principal en azul tapiz y avisos en lavado de señal.
const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-z-brand-500";

export const ownerUi = {
  page: "mx-auto w-full max-w-6xl px-5 pb-16 pt-7 sm:pt-9 lg:px-10",
  pageWide: "w-full px-5 pb-16 pt-7 sm:pt-9 lg:px-10",
  pageHeader: "mb-7 sm:mb-8",
  eyebrow: "floor-label break-words text-z-soft",
  // Título apoyado en una regla de cinta de 3 px en noche, como PageHeader de /app.
  pageTitle: "mt-1 min-w-0 break-words border-b-[3px] border-z-ink pb-3 font-display text-[28px] font-black uppercase leading-[0.95] text-z-ink [overflow-wrap:anywhere] [text-wrap:balance] lg:text-[40px]",
  pageLead: "mt-1.5 max-w-2xl text-sm leading-6 text-z-soft",
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
  iconButton: `touch-target inline-flex min-h-12 min-w-12 items-center justify-center rounded-lg border border-z-line bg-white text-z-soft transition-colors hover:border-z-chalk-500/40 hover:bg-z-chalk-50 hover:text-z-chalk-600 ${FOCUS_RING} disabled:cursor-not-allowed disabled:opacity-50`,
  textLink: `rounded-md text-sm font-semibold text-z-brand-600 hover:text-z-brand-700 ${FOCUS_RING}`,

  noticeInfo: "rounded-md border border-z-brand-100 bg-z-brand-50 p-4 text-sm leading-6 text-z-brand-700",
  noticeWarning: "rounded-md border border-z-chalk-500/30 bg-z-chalk-50 p-4 text-sm leading-6 text-z-ink",
  noticeError: "rounded-md border border-z-chalk-500/40 border-t-[3px] border-t-z-chalk-600 bg-z-chalk-50 p-4 text-sm font-semibold leading-6 text-z-chalk-600",

  emptyState: "flex flex-col items-center rounded-xl border border-dashed border-z-line bg-white px-6 py-10 text-center sm:py-12",
  emptyIcon: "mb-4 flex h-11 w-11 items-center justify-center rounded-md bg-z-brand-50 text-z-brand-600",
  chip: "inline-flex items-center rounded-md bg-z-canvas px-2 py-1 text-xs font-semibold text-z-ink",
  chipAccent: "inline-flex items-center rounded-md bg-z-brand-50 px-2.5 py-1 text-xs font-semibold text-z-brand-700",
  chipAttention: "inline-flex items-center rounded-md bg-z-chalk-50 px-2.5 py-1 text-xs font-semibold text-z-chalk-600",
  chipSuccess: "inline-flex items-center rounded-md bg-z-brand-500 px-2.5 py-1 text-xs font-semibold text-white",
  meterTrack: "h-1.5 overflow-hidden rounded-full bg-chalk-dust",
} as const;

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

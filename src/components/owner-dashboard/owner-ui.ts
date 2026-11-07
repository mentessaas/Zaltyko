const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-z-brand-500";

export const ownerUi = {
  page: "mx-auto w-full max-w-6xl px-5 pb-16 pt-7 sm:pt-9 lg:px-10",
  pageHeader: "mb-7 sm:mb-8",
  eyebrow: "break-words text-xs font-semibold text-z-soft",
  pageTitle: "mt-1 font-display text-[28px] font-bold leading-tight tracking-tight text-z-ink sm:text-[32px]",
  pageLead: "mt-1.5 max-w-2xl text-sm leading-6 text-z-soft",
  backLink: `touch-target inline-flex items-center gap-1.5 rounded-lg text-sm font-semibold text-z-soft hover:text-z-ink ${FOCUS_RING}`,

  card: "rounded-[16px] border border-z-line bg-white p-5 sm:p-6",
  cardFlush: "overflow-hidden rounded-[16px] border border-z-line bg-white",
  cardHeader: "flex items-center justify-between gap-3 border-b border-z-line px-5 py-4",
  listItem: "rounded-[14px] border border-z-line bg-white p-4 sm:p-5",
  subtlePanel: "rounded-[12px] bg-z-canvas p-3.5 sm:p-4",
  iconTile: "flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-z-brand-50 text-z-brand-600",
  sectionTitle: "font-display text-lg font-bold tracking-tight text-z-ink",
  cardTitle: "font-display text-lg font-bold tracking-tight text-z-ink",
  muted: "text-sm leading-6 text-z-soft",

  metricCard: "rounded-[16px] border border-z-line bg-white p-4",
  metricLabel: "text-xs font-semibold text-z-soft",
  metricValue: "mt-2 font-display text-3xl font-bold tabular-nums tracking-tight text-z-ink",

  label: "text-sm font-semibold text-z-ink",
  smallLabel: "text-xs font-semibold text-z-soft",
  help: "text-xs leading-5 text-z-soft",
  field: `min-h-12 min-w-0 w-full rounded-[10px] border border-z-line bg-white px-3 text-base text-z-ink transition-colors hover:border-z-soft/40 sm:text-sm ${FOCUS_RING} disabled:cursor-not-allowed disabled:bg-z-canvas disabled:opacity-70`,

  primaryButton: `touch-target inline-flex min-h-12 max-w-full items-center justify-center gap-2 rounded-[10px] bg-z-ink px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-black ${FOCUS_RING} disabled:cursor-not-allowed disabled:opacity-50`,
  brandButton: `touch-target inline-flex min-h-12 max-w-full items-center justify-center gap-2 rounded-[10px] bg-z-brand-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-z-brand-600 ${FOCUS_RING} disabled:cursor-not-allowed disabled:opacity-50`,
  secondaryButton: `touch-target inline-flex min-h-12 max-w-full items-center justify-center gap-2 rounded-[10px] border border-z-line bg-white px-4 py-2 text-sm font-semibold text-z-ink transition-colors hover:bg-z-canvas ${FOCUS_RING} disabled:cursor-not-allowed disabled:opacity-50`,
  iconButton: `touch-target inline-flex min-h-12 min-w-12 items-center justify-center rounded-[10px] border border-z-line bg-white text-z-soft transition-colors hover:border-z-chalk-500/40 hover:bg-z-chalk-50 hover:text-z-chalk-600 ${FOCUS_RING} disabled:cursor-not-allowed disabled:opacity-50`,
  textLink: `rounded-md text-sm font-semibold text-z-brand-600 hover:text-z-brand-700 ${FOCUS_RING}`,

  noticeInfo: "rounded-[12px] border border-z-brand-100 bg-z-brand-50 p-4 text-sm leading-6 text-z-brand-700",
  noticeWarning: "rounded-[12px] border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950",
  noticeError: "rounded-[12px] border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-950",

  emptyState: "flex flex-col items-center rounded-[16px] border border-dashed border-z-line bg-white px-6 py-10 text-center sm:py-12",
  emptyIcon: "mb-4 flex h-11 w-11 items-center justify-center rounded-[12px] bg-z-brand-50 text-z-brand-600",
  chip: "inline-flex items-center rounded-md bg-z-canvas px-2 py-1 text-xs font-semibold text-z-ink",
  chipAccent: "inline-flex items-center rounded-full bg-z-brand-50 px-2.5 py-1 text-xs font-semibold text-z-brand-700",
  chipAttention: "inline-flex items-center rounded-full bg-z-chalk-50 px-2.5 py-1 text-xs font-semibold text-z-chalk-600",
  chipSuccess: "inline-flex items-center rounded-full bg-z-comp-50 px-2.5 py-1 text-xs font-semibold text-z-comp-600",
  meterTrack: "h-1.5 overflow-hidden rounded-full bg-z-canvas",
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

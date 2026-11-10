import type { ReactNode } from "react";
import Link from "next/link";

import {
  DATA_STATUS_LABELS,
  EVIDENCE_LEVEL_LABELS,
  FLOW_COVERAGE_LABELS,
  OPPORTUNITY_CLASS_LABELS,
  ZALTYKO_FLOW_STATUS_LABELS,
  type DataStatus,
  type EvidenceLevel,
  type FlowCoverage,
  type OpportunityClass,
  type ZaltykoFlowStatus,
} from "@/lib/competencia/domain";
import {
  REVIEW_STATE_LABELS,
  type ReviewState,
} from "@/lib/competencia/review";
import { cn } from "@/lib/utils";

/** Clases compartidas con el resto del super-admin (fondo navy, texto claro). */
export const ciInput =
  "min-h-[44px] w-full rounded-lg border border-white/15 bg-zaltyko-navy/70 px-3 py-2 text-sm text-white placeholder:text-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zaltyko-teal";
export const ciLabel =
  "text-xs font-medium uppercase tracking-[0.12em] text-white/60";
export const ciCard =
  "rounded-2xl border border-white/10 bg-white/[0.04] p-4 sm:p-5";
export const ciButtonPrimary =
  "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-zaltyko-teal px-4 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60";
export const ciButtonGhost =
  "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-white/15 px-4 text-sm font-medium text-white/85 transition hover:bg-white/10 disabled:opacity-60";

const tone = {
  ok: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  warn: "border-amber-400/30 bg-amber-400/10 text-amber-100",
  bad: "border-rose-400/30 bg-rose-400/10 text-rose-100",
  neutral: "border-white/15 bg-white/5 text-white/75",
  info: "border-sky-400/30 bg-sky-400/10 text-sky-100",
} as const;

export function Pill({
  children,
  variant = "neutral",
  title,
}: {
  children: ReactNode;
  variant?: keyof typeof tone;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        tone[variant]
      )}
    >
      {children}
    </span>
  );
}

export function DataStatusPill({ status }: { status: string }) {
  const variant =
    status === "verificado"
      ? "ok"
      : status === "desactualizado"
        ? "bad"
        : "warn";
  return (
    <Pill variant={variant}>
      {DATA_STATUS_LABELS[status as DataStatus] ?? status}
    </Pill>
  );
}

export function EvidencePill({ level }: { level: string }) {
  const variant =
    level === "observado" || level === "confirmado"
      ? "ok"
      : level === "declarado"
        ? "info"
        : level === "inferido"
          ? "warn"
          : "neutral";
  return (
    <Pill variant={variant}>
      {EVIDENCE_LEVEL_LABELS[level as EvidenceLevel] ?? level}
    </Pill>
  );
}

export function ReviewPill({ state }: { state: ReviewState }) {
  const variant =
    state === "al_dia"
      ? "ok"
      : state === "desactualizado"
        ? "bad"
        : state === "sin_datos"
          ? "neutral"
          : "warn";
  return <Pill variant={variant}>{REVIEW_STATE_LABELS[state]}</Pill>;
}

export function ZaltykoStatusPill({ status }: { status: string }) {
  const variant =
    status === "completo" ? "ok" : status === "ausente" ? "bad" : "warn";
  return (
    <Pill variant={variant}>
      {ZALTYKO_FLOW_STATUS_LABELS[status as ZaltykoFlowStatus] ?? status}
    </Pill>
  );
}

export function CoveragePill({ coverage }: { coverage: string }) {
  const variant =
    coverage === "resuelve"
      ? "ok"
      : coverage === "parcial"
        ? "warn"
        : coverage === "no"
          ? "bad"
          : "neutral";
  return (
    <Pill variant={variant}>
      {FLOW_COVERAGE_LABELS[coverage as FlowCoverage] ?? coverage}
    </Pill>
  );
}

export function OpportunityClassPill({ value }: { value: string }) {
  const variant =
    value === "diferenciar"
      ? "info"
      : value === "superar"
        ? "ok"
        : value === "igualar"
          ? "warn"
          : "neutral";
  return (
    <Pill variant={variant}>
      {OPPORTUNITY_CLASS_LABELS[value as OpportunityClass] ?? value}
    </Pill>
  );
}

export function PageIntro({
  eyebrow,
  title,
  children,
  actions,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))] p-5 sm:flex-row sm:items-end sm:justify-between sm:p-7">
      <div className="min-w-0 max-w-3xl">
        <p className="font-display text-xs uppercase tracking-[0.28em] text-zaltyko-electric">
          {eyebrow}
        </p>
        <h1 className="mt-2 break-words font-display text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          {title}
        </h1>
        {children ? (
          <div className="mt-2 text-sm leading-6 text-white/70">{children}</div>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

export function EmptyNote({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-white/15 p-6 text-center">
      <p className="font-medium text-white">{title}</p>
      {children ? (
        <div className="mx-auto mt-1 max-w-xl text-sm text-white/60">
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function SubNav({
  active,
}: {
  active: "resumen" | "comparar" | "oportunidades" | "fuentes" | "flujos";
}) {
  const items = [
    {
      key: "resumen",
      label: "Resumen y listado",
      href: "/super-admin/competencia",
    },
    {
      key: "comparar",
      label: "Comparar",
      href: "/super-admin/competencia/comparar",
    },
    {
      key: "oportunidades",
      label: "Oportunidades",
      href: "/super-admin/competencia/oportunidades",
    },
    {
      key: "fuentes",
      label: "Fuentes",
      href: "/super-admin/competencia/fuentes",
    },
    {
      key: "flujos",
      label: "Flujos y Zaltyko",
      href: "/super-admin/competencia/flujos",
    },
  ] as const;
  return (
    <nav
      aria-label="Secciones de competencia"
      className="-mx-1 flex gap-1 overflow-x-auto pb-1"
    >
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          aria-current={item.key === active ? "page" : undefined}
          className={cn(
            "shrink-0 rounded-full px-3 py-2 text-sm transition",
            item.key === active
              ? "bg-white text-zaltyko-navy"
              : "text-white/70 hover:bg-white/10 hover:text-white"
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export function UnavailableNotice() {
  return (
    <div className={ciCard} role="status">
      <p className="font-medium text-white">
        El panel de competencia no está disponible en esta base de datos
      </p>
      <p className="mt-2 text-sm leading-6 text-white/70">
        Faltan las tablas <code>ci_*</code>. Se crean con el candidato{" "}
        <code>
          docs/deployment/candidates/20261110180000_competitive_intelligence_candidate.sql
        </code>
        , que requiere autorización expresa antes de aplicarse en un entorno
        alojado. Después, carga los datos iniciales con{" "}
        <code>pnpm db:seed:competencia</code> o con el botón del panel.
      </p>
    </div>
  );
}

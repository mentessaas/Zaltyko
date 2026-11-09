"use client";

import Link from "next/link";

import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  Calendar,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  MessageCircle,
  Wallet,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { PlanUsage } from "@/components/dashboard/PlanUsage";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { LiveClock } from "@/components/mat/LiveClock";
import type { DashboardActivity, DashboardPlanUsage, DashboardSportConfigBreakdown } from "@/lib/dashboard";
import { pluralizeFirstWord } from "@/lib/specialization/registry";

interface AcademySwitcherItem {
  id: string;
  name: string | null;
}

interface DashboardLabels {
  athletesPlural: string;
  groupLabel: string;
  classLabel: string;
  disciplineName: string;
}

interface DashboardAction {
  label: string;
  href: string;
  icon: LucideIcon;
}

interface PendingStep extends DashboardAction {
  description: string | null;
  cta: string;
}

interface StarterRecommendation {
  title: string;
  description: string;
  href: string;
  cta: string;
}

export function DashboardHeroSection({
  academyId,
  academyName,
  profileName,
  labels,
  welcomeMessage,
  primaryCTA,
  tenantAcademies,
  plan,
  onNavigate,
}: {
  academyId: string;
  academyName: string | null;
  profileName: string | null;
  labels: DashboardLabels;
  welcomeMessage: string;
  primaryCTA: DashboardAction;
  tenantAcademies: AcademySwitcherItem[];
  plan: DashboardPlanUsage;
  onNavigate: (href: string) => void;
}) {
  const CTAIcon = primaryCTA.icon;

  return (
    // Cabecera «Magnesio sobre tapiz»: banda de tapiz con el nombre de la
    // academia rotulado, el saludo y la acción del día; a la derecha, el
    // reloj de pista y el uso del plan.
    <section className="mat-field relative overflow-hidden rounded-xl">
      <div aria-hidden className="pointer-events-none absolute inset-2 rounded-md border-[3px] border-white/70" />
      <div className="relative flex flex-col gap-6 px-6 py-7 lg:flex-row lg:items-end lg:justify-between lg:px-8 lg:py-8">
        <div className="flex-1">
          <h1 className="font-display text-[clamp(2rem,4vw,3.25rem)] font-black uppercase leading-[0.92] text-white">
            {academyName ?? "Academia"}
          </h1>
          <p className="floor-label mt-2 text-white/85">{labels.disciplineName}</p>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-white/90">
            Hola, {profileName ?? "equipo"}. {welcomeMessage}
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onNavigate(primaryCTA.href)}
              className="inline-flex min-h-11 items-center gap-2 rounded-md bg-white px-5 text-sm font-extrabold text-mat-deep transition-colors hover:bg-chalk focus-visible:ring-white focus-visible:ring-offset-mat"
            >
              <CTAIcon aria-hidden className="h-4 w-4" />
              {primaryCTA.label}
            </button>
            {tenantAcademies.length > 1 && (
              <div className="group relative">
                <button
                  type="button"
                  className="flex min-h-11 items-center gap-2 rounded-md border border-white/40 px-3 text-xs font-semibold text-white transition hover:border-white"
                >
                  <span className="max-w-[120px] truncate">{academyName ?? "Academia"}</span>
                  <ChevronDown className="h-3 w-3" />
                </button>
                <div className="invisible absolute right-0 top-full z-50 mt-1 w-56 rounded-xl border border-border bg-card p-1 opacity-0 shadow-medium transition-all group-hover:visible group-hover:opacity-100">
                  <div className="mb-1 border-b border-border px-3 py-2 text-xs font-semibold text-muted-foreground">
                    Cambiar de academia
                  </div>
                  {tenantAcademies.map((academy) => (
                    <button
                      key={academy.id}
                      type="button"
                      onClick={() => onNavigate(`/app/${academy.id}/dashboard`)}
                      className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors ${
                        academy.id === academyId ? "bg-primary/10 font-medium text-primary" : "hover:bg-muted"
                      }`}
                    >
                      <span className="truncate">{academy.name ?? "Sin nombre"}</span>
                      {academy.id === academyId && <span className="h-2 w-2 rounded-full bg-zaltyko-teal" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        <LiveClock className="text-white lg:text-right" />
      </div>
      {/* Uso del plan como línea al pie de la banda, no como tarjeta anidada. */}
      <div className="relative border-t border-white/25 px-6 pb-5 pt-4 lg:px-8">
        <PlanUsage
          plan={plan}
          academyId={academyId}
          athleteLabel={labels.athletesPlural.toLowerCase()}
          classLabel={pluralizeFirstWord(labels.classLabel).toLowerCase()}
          tone="onMat"
        />
      </div>
    </section>
  );
}

export function SportBreakdownSection({
  academyId,
  items,
  labels,
  onNavigate,
}: {
  academyId: string;
  items: DashboardSportConfigBreakdown[];
  labels: DashboardLabels;
  onNavigate: (href: string) => void;
}) {
  if (items.length === 0) return null;

  return (
    <section className="rounded-xl border border-chalk-line border-t-[3px] border-t-mat-night bg-white p-5">
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-display text-2xl font-black uppercase leading-none text-mat-night">Actividad por rama</h2>
          <p className="mt-1 text-sm text-ramp-500">Distribución deportiva de la academia</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => onNavigate(`/app/${academyId}/settings`)}>
          Gestionar ramas
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {items.map((item) => (
          <div key={item.sportConfigId} className="border-t-[3px] border-mat-night pt-3">
            <p className="text-sm font-semibold text-foreground">{item.branchName}</p>
            <p className="text-xs text-muted-foreground">{item.disciplineName}</p>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <SportBreakdownMetric value={item.athletes} label={labels.athletesPlural} />
              <SportBreakdownMetric value={item.groups} label={pluralizeFirstWord(labels.groupLabel)} />
              <SportBreakdownMetric value={item.classes} label={pluralizeFirstWord(labels.classLabel)} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function StarterSetupSection({
  academyId,
  labels,
  recommendation,
  onNavigate,
}: {
  academyId: string;
  labels: DashboardLabels;
  recommendation: StarterRecommendation | null;
  onNavigate: (href: string) => void;
}) {
  return (
    <section className="rounded-xl border border-chalk-line border-t-[3px] border-t-mat-night bg-white p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <h2 className="font-display text-2xl font-black uppercase leading-none text-mat-night">
            {`Base recomendada para ${labels.disciplineName.toLowerCase()}`}
          </h2>
          <p className="text-sm text-ramp-600">
            Tu academia ya arrancó con ella. Ahora toca revisar responsables, ajustar horarios y adaptar la plantilla inicial a tu realidad diaria.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => onNavigate(`/app/${academyId}/groups`)}>
            Revisar {pluralizeFirstWord(labels.groupLabel).toLowerCase()}
          </Button>
          <Button size="sm" onClick={() => onNavigate(`/app/${academyId}/classes`)}>
            Ajustar {pluralizeFirstWord(labels.classLabel).toLowerCase()}
          </Button>
        </div>
      </div>
      {recommendation && (
        <div className="mt-4 border-t border-chalk-line pt-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-mat-night">
                <span className="text-mat">Siguiente ajuste:</span> {recommendation.title}
              </p>
              <p className="text-sm text-muted-foreground">{recommendation.description}</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => onNavigate(recommendation.href)}>
              {recommendation.cta}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

export function QuickNavigationSection({ academyId }: { academyId: string }) {
  const links = [
    { href: `/app/${academyId}/events`, icon: Calendar, title: "Eventos", subtitle: "Competencias", color: "text-zaltyko-indigo dark:text-zaltyko-electric" },
    { href: `/app/${academyId}/billing`, icon: Wallet, title: "Cobros", subtitle: "Pagos", color: "text-zaltyko-teal" },
    { href: `/app/${academyId}/assessments`, icon: ClipboardList, title: "Evaluaciones", subtitle: "Técnicas", color: "text-zaltyko-indigo dark:text-zaltyko-electric" },
    { href: `/app/${academyId}/messages`, icon: MessageCircle, title: "Mensajes", subtitle: "Comunicación", color: "text-zaltyko-teal" },
  ];

  // Accesos como una fila reglada de rótulos (no cuatro tarjetas iguales).
  return (
    <nav aria-label="Accesos rápidos" className="border-y border-chalk-line">
      <ul className="grid grid-cols-2 lg:grid-cols-4">
        {links.map((link, i) => {
          const Icon = link.icon;
          return (
            <li key={link.href} className={i % 2 === 1 ? "border-l border-chalk-line" : i >= 2 ? "lg:border-l lg:border-chalk-line" : ""}>
              <Link
                href={link.href}
                className="group flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-mat-wash"
              >
                <Icon aria-hidden className="h-5 w-5 shrink-0 text-mat" strokeWidth={2} />
                <span className="min-w-0">
                  <span className="font-display block text-lg font-extrabold uppercase leading-none text-mat-night group-hover:text-mat">
                    {link.title}
                  </span>
                  <span className="text-xs text-ramp-500">{link.subtitle}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function DashboardOnboardingPanel({
  progress,
  nextSetupStep,
  pendingSteps,
  showAllSteps,
  onToggleSteps,
  onNavigate,
}: {
  progress: { completed: number; total: number } | null;
  nextSetupStep: DashboardAction | null;
  pendingSteps: PendingStep[];
  showAllSteps: boolean;
  onToggleSteps: () => void;
  onNavigate: (href: string) => void;
}) {
  const NextSetupIcon = nextSetupStep?.icon;
  const progressPercent = progress && progress.total > 0
    ? Math.round((progress.completed / progress.total) * 100)
    : null;

  // Puesta en marcha «Magnesio sobre tapiz»: el número del paso manda, a
  // tamaño de rótulo de pista (donación del libro de instrucciones). La
  // secuencia es información: cuántos pasos llevas y cuál toca.
  const currentStep = progress ? Math.min(progress.completed + 1, progress.total) : null;
  return (
    <section aria-labelledby="setup-title" className="overflow-hidden rounded-xl border border-chalk-line border-t-[3px] border-t-mat-night bg-white">
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:gap-7">
        {currentStep !== null && progress && (
          <p className="font-display tabular shrink-0 text-8xl font-black leading-[0.8] text-mat" aria-hidden>
            {currentStep}
            <span className="text-3xl text-ramp-300">/{progress.total}</span>
          </p>
        )}
        <div className="min-w-0 flex-1">
          <h2 id="setup-title" className="font-display text-2xl font-black uppercase leading-none text-mat-night">
            Puesta en marcha
          </h2>
          <p className="mt-1 text-sm text-ramp-600">
            {progress
              ? `Paso ${currentStep} de ${progress.total}${progressPercent !== null ? ` · ${progressPercent}% completado` : ""}`
              : "Configura lo esencial de tu academia."}
          </p>
          {progressPercent !== null && <Progress value={progressPercent} aria-label="Progreso de la puesta en marcha" className="mt-3 h-1.5 bg-chalk-dust" />}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {nextSetupStep && NextSetupIcon && (
            <Button onClick={() => onNavigate(nextSetupStep.href)} className="gap-2">
              <NextSetupIcon aria-hidden className="h-4 w-4" />
              {nextSetupStep.label}
            </Button>
          )}
          {pendingSteps.length > 0 && (
            <Button variant="outline" onClick={onToggleSteps} aria-expanded={showAllSteps} className="gap-1.5">
              {showAllSteps ? "Ocultar pasos" : `Ver ${pendingSteps.length} pendientes`}
              {showAllSteps ? <ChevronUp aria-hidden className="h-4 w-4" /> : <ChevronDown aria-hidden className="h-4 w-4" />}
            </Button>
          )}
        </div>
      </div>

      {showAllSteps && pendingSteps.length > 0 && (
        <ol className="border-t border-chalk-line">
          {pendingSteps.map((step, index) => (
            <li key={`${step.href}-${index}`} className="border-b border-chalk-line last:border-b-0">
              <button
                type="button"
                onClick={() => onNavigate(step.href)}
                className="group flex w-full items-center gap-5 px-5 py-4 text-left transition-colors hover:bg-mat-wash"
              >
                <span className="font-display tabular w-12 shrink-0 text-5xl font-black leading-none text-ramp-400 group-hover:text-mat">
                  {(progress?.completed ?? 0) + index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-mat-night">{step.label}</span>
                  {step.description && <span className="mt-0.5 block text-sm text-ramp-500">{step.description}</span>}
                </span>
                <ArrowRight aria-hidden className="h-4 w-4 shrink-0 text-ramp-400 group-hover:text-mat" />
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function RecentActivityPanel({
  items,
  academyCountry,
  expanded,
  onToggle,
}: {
  items: DashboardActivity[];
  academyCountry: string | null;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-chalk-line border-t-[3px] border-t-mat-night bg-white">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between p-5 text-left transition hover:bg-muted/80"
      >
        <div className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-muted-foreground" />
          <span className="font-medium">Actividad Reciente</span>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {expanded && (
        <div className="p-4 pt-0">
          <RecentActivity items={items} academyCountry={academyCountry} />
        </div>
      )}
    </section>
  );
}

function SportBreakdownMetric({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <p className="font-display text-xl font-semibold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

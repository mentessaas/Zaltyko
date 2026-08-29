"use client";

import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  Calendar,
  ChevronDown,
  ChevronUp,
  Circle,
  ClipboardList,
  MessageCircle,
  Wallet,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { PlanUsage } from "@/components/dashboard/PlanUsage";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import type { DashboardActivity, DashboardPlanUsage, DashboardSportConfigBreakdown } from "@/lib/dashboard";

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
    <section className="zaltyko-motion-lines overflow-hidden rounded-2xl border border-zaltyko-mist/70 bg-white px-5 py-5 shadow-soft lg:px-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex-1 space-y-3">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-zaltyko-teal">
              Panel operativo
            </p>
            <h1 className="font-display text-2xl font-semibold tracking-normal text-zaltyko-navy lg:text-3xl">
              {academyName ?? "Academia"} · {labels.disciplineName}
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-zaltyko-text-secondary">
              Hola {profileName ?? "equipo"}. {welcomeMessage}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => onNavigate(primaryCTA.href)} className="gap-2" size="sm">
              <CTAIcon className="h-4 w-4" />
              {primaryCTA.label}
            </Button>
            {tenantAcademies.length > 1 && (
              <div className="group relative">
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-full border border-zaltyko-mist bg-white px-3 py-1.5 text-xs font-semibold text-zaltyko-text-secondary transition hover:border-zaltyko-teal hover:text-zaltyko-teal"
                >
                  <span className="max-w-[120px] truncate">{academyName ?? "Academia"}</span>
                  <ChevronDown className="h-3 w-3" />
                </button>
                <div className="invisible absolute right-0 top-full z-50 mt-1 w-56 rounded-xl border border-zaltyko-mist bg-white p-1 opacity-0 shadow-medium transition-all group-hover:visible group-hover:opacity-100">
                  <div className="mb-1 border-b border-zaltyko-mist px-3 py-2 text-xs font-semibold text-slate-600">
                    Cambiar de academia
                  </div>
                  {tenantAcademies.map((academy) => (
                    <button
                      key={academy.id}
                      type="button"
                      onClick={() => onNavigate(`/app/${academy.id}/dashboard`)}
                      className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors ${
                        academy.id === academyId ? "bg-primary/10 font-medium text-primary" : "hover:bg-zaltyko-white"
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
        <div className="lg:w-72">
          <PlanUsage plan={plan} academyId={academyId} />
        </div>
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
    <section className="rounded-2xl border border-zaltyko-mist bg-white p-5 shadow-soft">
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.05em] text-zaltyko-teal">
            Distribución deportiva
          </p>
          <h2 className="font-display text-xl font-semibold text-zaltyko-navy">Actividad por rama</h2>
        </div>
        <Button size="sm" variant="outline" onClick={() => onNavigate(`/app/${academyId}/settings`)}>
          Gestionar ramas
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {items.map((item) => (
          <div key={item.sportConfigId} className="rounded-xl border border-zaltyko-mist bg-zaltyko-warm-white p-4">
            <p className="text-sm font-semibold text-zaltyko-navy">{item.branchName}</p>
            <p className="text-xs text-zaltyko-text-secondary">{item.disciplineName}</p>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <SportBreakdownMetric value={item.athletes} label={labels.athletesPlural} />
              <SportBreakdownMetric value={item.groups} label={`${labels.groupLabel}s`} />
              <SportBreakdownMetric value={item.classes} label={`${labels.classLabel}s`} />
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
    <section className="rounded-2xl border border-zaltyko-teal/20 bg-zaltyko-teal/5 p-5 shadow-soft">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">
            Tu academia ya arrancó con una base recomendada para {labels.disciplineName.toLowerCase()}
          </p>
          <p className="text-sm text-slate-700">
            Ahora toca revisar responsables, ajustar horarios y adaptar la plantilla inicial a tu realidad diaria.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => onNavigate(`/app/${academyId}/groups`)}>
            Revisar {labels.groupLabel.toLowerCase()}s
          </Button>
          <Button size="sm" onClick={() => onNavigate(`/app/${academyId}/classes`)}>
            Ajustar {labels.classLabel.toLowerCase()}s
          </Button>
        </div>
      </div>
      {recommendation && (
        <div className="mt-4 rounded-xl border border-zaltyko-mist bg-white/90 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-zaltyko-teal">
                Siguiente ajuste recomendado
              </p>
              <p className="text-sm font-semibold text-foreground">{recommendation.title}</p>
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
    { href: `/app/${academyId}/events`, icon: Calendar, title: "Eventos", subtitle: "Competencias", color: "text-zaltyko-indigo" },
    { href: `/app/${academyId}/billing`, icon: Wallet, title: "Cobros", subtitle: "Pagos", color: "text-zaltyko-teal" },
    { href: `/app/${academyId}/assessments`, icon: ClipboardList, title: "Evaluaciones", subtitle: "Técnicas", color: "text-zaltyko-indigo" },
    { href: `/app/${academyId}/messages`, icon: MessageCircle, title: "Mensajes", subtitle: "Comunicación", color: "text-zaltyko-teal" },
  ];

  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {links.map((link) => {
        const Icon = link.icon;
        return (
          <a
            key={link.href}
            href={link.href}
            className="flex items-center gap-3 rounded-2xl border border-zaltyko-mist bg-white p-4 shadow-soft transition hover:border-zaltyko-teal/40"
          >
            <Icon className={`h-5 w-5 ${link.color}`} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{link.title}</p>
              <p className="text-xs text-muted-foreground">{link.subtitle}</p>
            </div>
          </a>
        );
      })}
    </section>
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

  return (
    <section className="rounded-2xl border border-zaltyko-mist bg-white p-5 shadow-soft">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleSteps}
              className="flex items-center justify-center rounded-md p-1 text-primary transition-colors hover:bg-primary/10"
              aria-label={showAllSteps ? "Ocultar pasos" : "Ver pasos pendientes"}
              aria-expanded={showAllSteps}
            >
              {showAllSteps ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            <h3 className="text-sm font-semibold text-foreground">Próximo paso</h3>
            {progress && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-foreground">
                {progress.completed}/{progress.total}
              </span>
            )}
          </div>
          {progressPercent !== null && (
            <div className="space-y-1">
              <Progress value={progressPercent} className="h-1.5" />
              <p className="text-xs text-muted-foreground">{progressPercent}% completado</p>
            </div>
          )}
        </div>
        {nextSetupStep && NextSetupIcon && (
          <Button onClick={() => onNavigate(nextSetupStep.href)} size="sm" className="shrink-0 gap-2">
            <NextSetupIcon className="h-3.5 w-3.5" />
            {nextSetupStep.label}
          </Button>
        )}
      </div>

      {showAllSteps && pendingSteps.length > 0 && (
        <div className="mt-4 space-y-2 border-t border-zaltyko-mist pt-4">
          <p className="mb-2 text-xs font-semibold text-muted-foreground">
            Pasos pendientes ({pendingSteps.length}):
          </p>
          <ul className="space-y-1.5">
            {pendingSteps.map((step, index) => {
              const StepIcon = step.icon;
              return (
                <li key={`${step.href}-${index}`}>
                  <button
                    type="button"
                    onClick={() => onNavigate(step.href)}
                    className="flex w-full items-start gap-2 rounded-xl px-3 py-2 text-left text-sm transition hover:bg-zaltyko-white"
                  >
                    <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <StepIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <span className="block font-medium text-muted-foreground">{step.label}</span>
                      {step.description && (
                        <span className="mt-0.5 block text-xs text-muted-foreground/70">{step.description}</span>
                      )}
                    </div>
                    <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
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
    <section className="overflow-hidden rounded-2xl border border-zaltyko-mist bg-white shadow-soft">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between p-5 text-left transition hover:bg-zaltyko-white/80"
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
      <p className="font-display text-xl font-semibold text-zaltyko-navy">{value}</p>
      <p className="text-[11px] text-zaltyko-text-secondary">{label}</p>
    </div>
  );
}

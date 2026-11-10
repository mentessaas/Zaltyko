"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ExternalLink,
  Loader2,
  Pencil,
  RotateCcw,
  PauseCircle,
} from "lucide-react";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  CiChangeEventRow,
  CiCompetitorFlowRow,
  CiCompetitorRow,
  CiFlowRow,
  CiOpportunityRow,
  CiPricingPlanRow,
  CiSectionRow,
  CiSourceRow,
} from "@/db/schema/competitive-intelligence";
import {
  BILLING_PERIODS,
  BILLING_PERIOD_LABELS,
  CLIENT_SIZES,
  CLIENT_SIZE_LABELS,
  COMPETITOR_TYPES,
  COMPETITOR_TYPE_LABELS,
  DATA_STATUSES,
  DATA_STATUS_LABELS,
  DEFAULT_REVIEW_DAYS,
  DISCIPLINES,
  DISCIPLINE_LABELS,
  EVIDENCE_LEVELS,
  EVIDENCE_LEVEL_LABELS,
  FLOW_COVERAGES,
  FLOW_COVERAGE_LABELS,
  LIFECYCLE_STATUS_LABELS,
  RESEARCH_STATUSES,
  RESEARCH_STATUS_LABELS,
  SECTION_GROUPS,
  SECTION_LABELS,
  SOURCE_TYPE_LABELS,
  VAT_MODES,
  VAT_MODE_LABELS,
  type ClientSize,
  type CompetitorType,
  type Discipline,
  type LifecycleStatus,
  type SectionKey,
  type SourceType,
} from "@/lib/competencia/domain";
import { reviewDueOn, reviewState, todayIso } from "@/lib/competencia/review";

import { emptyToNull, numberOrNull, sendCompetencia } from "./client-api";
import { SourceForm } from "./SourceForm";
import {
  CoveragePill,
  EmptyNote,
  EvidencePill,
  OpportunityClassPill,
  Pill,
  ReviewPill,
  ZaltykoStatusPill,
  ciButtonGhost,
  ciButtonPrimary,
  ciCard,
  ciInput,
  ciLabel,
} from "./ui";

export interface CompetitorProfileWorkspaceProps {
  competitor: CiCompetitorRow;
  sections: CiSectionRow[];
  sources: CiSourceRow[];
  pricing: CiPricingPlanRow[];
  flows: CiFlowRow[];
  coverage: CiCompetitorFlowRow[];
  history: CiChangeEventRow[];
  opportunities: CiOpportunityRow[];
}

const dateTime = new Intl.DateTimeFormat("es-ES", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Madrid",
});

function useSaver() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(action: () => Promise<unknown>, after?: () => void) {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await action();
      router.refresh();
      after?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }
  return { saving, error, run };
}

function ErrorLine({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="text-sm text-rose-200">
      {error}
    </p>
  ) : null;
}

/* ---------- Datos generales y ciclo de vida ---------- */

function GeneralEditor({
  competitor,
  onClose,
}: {
  competitor: CiCompetitorRow;
  onClose: () => void;
}) {
  const { saving, error, run } = useSaver();
  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run(
      () =>
        sendCompetencia(
          `/api/super-admin/competencia/competitors/${competitor.id}`,
          "PATCH",
          {
            name: String(form.get("name") ?? ""),
            website: emptyToNull(form.get("website")),
            competitorType: String(form.get("competitorType")),
            researchStatus: String(form.get("researchStatus")),
            countries: String(form.get("countries") ?? "")
              .split(/[\s,;]+/)
              .map((value) => value.trim().toUpperCase())
              .filter(Boolean),
            disciplines: form.getAll("disciplines").map(String),
            clientSizes: form.getAll("clientSizes").map(String),
            summary: emptyToNull(form.get("summary")),
          }
        ),
      onClose
    );
  }
  return (
    <form onSubmit={onSubmit} className={`${ciCard} space-y-4`}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={ciLabel}>Nombre</span>
          <input
            name="name"
            required
            defaultValue={competitor.name}
            className={`${ciInput} mt-2`}
          />
        </label>
        <label className="block">
          <span className={ciLabel}>Web</span>
          <input
            name="website"
            type="url"
            defaultValue={competitor.website ?? ""}
            className={`${ciInput} mt-2`}
          />
        </label>
        <label className="block">
          <span className={ciLabel}>Tipo</span>
          <select
            name="competitorType"
            defaultValue={competitor.competitorType}
            className={`${ciInput} mt-2`}
          >
            {COMPETITOR_TYPES.map((type) => (
              <option key={type} value={type}>
                {COMPETITOR_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={ciLabel}>Estado de la investigación</span>
          <select
            name="researchStatus"
            defaultValue={competitor.researchStatus}
            className={`${ciInput} mt-2`}
          >
            {RESEARCH_STATUSES.map((status) => (
              <option key={status} value={status}>
                {RESEARCH_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </label>
        <label className="block sm:col-span-2">
          <span className={ciLabel}>Países</span>
          <input
            name="countries"
            defaultValue={competitor.countries.join(", ")}
            className={`${ciInput} mt-2`}
          />
        </label>
      </div>
      <fieldset>
        <legend className={ciLabel}>Disciplinas</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {DISCIPLINES.map((discipline) => (
            <label
              key={discipline}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-white/15 px-3 text-sm text-white/85"
            >
              <input
                type="checkbox"
                name="disciplines"
                value={discipline}
                defaultChecked={competitor.disciplines.includes(discipline)}
                className="h-4 w-4"
              />
              {DISCIPLINE_LABELS[discipline]}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className={ciLabel}>Tamaño de cliente</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {CLIENT_SIZES.map((size) => (
            <label
              key={size}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-white/15 px-3 text-sm text-white/85"
            >
              <input
                type="checkbox"
                name="clientSizes"
                value={size}
                defaultChecked={competitor.clientSizes.includes(size)}
                className="h-4 w-4"
              />
              {CLIENT_SIZE_LABELS[size]}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block">
        <span className={ciLabel}>Resumen</span>
        <textarea
          name="summary"
          rows={3}
          defaultValue={competitor.summary ?? ""}
          className={`${ciInput} mt-2`}
        />
      </label>
      <ErrorLine error={error} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={saving} className={ciButtonPrimary}>
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : null}{" "}
          Guardar datos generales
        </button>
        <button type="button" onClick={onClose} className={ciButtonGhost}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function LifecycleActions({ competitor }: { competitor: CiCompetitorRow }) {
  const { saving, error, run } = useSaver();
  const [confirmArchive, setConfirmArchive] = useState(false);
  const setLifecycle = (lifecycleStatus: LifecycleStatus) =>
    run(() =>
      sendCompetencia(
        `/api/super-admin/competencia/competitors/${competitor.id}`,
        "PATCH",
        { lifecycleStatus }
      )
    );

  return (
    <div className="flex flex-wrap items-center gap-2">
      {competitor.lifecycleStatus === "activo" ? (
        <button
          type="button"
          disabled={saving}
          onClick={() => setLifecycle("inactivo")}
          className={ciButtonGhost}
        >
          <PauseCircle className="h-4 w-4" aria-hidden /> Marcar inactivo
        </button>
      ) : null}
      {competitor.lifecycleStatus !== "activo" ? (
        <button
          type="button"
          disabled={saving}
          onClick={() => setLifecycle("activo")}
          className={ciButtonGhost}
        >
          <RotateCcw className="h-4 w-4" aria-hidden /> Reactivar
        </button>
      ) : null}
      {competitor.lifecycleStatus !== "archivado" ? (
        <button
          type="button"
          disabled={saving}
          onClick={() => setConfirmArchive(true)}
          className={ciButtonGhost}
        >
          <Archive className="h-4 w-4" aria-hidden /> Archivar
        </button>
      ) : null}
      <ErrorLine error={error} />
      <ConfirmDialog
        open={confirmArchive}
        onOpenChange={setConfirmArchive}
        title={`Archivar ${competitor.name}`}
        description="La ficha deja de aparecer en el listado y en la comparación, pero se conservan sus datos, fuentes e historial. Puedes reactivarla cuando quieras."
        confirmText="Archivar"
        loading={saving}
        onConfirm={async () => {
          await setLifecycle("archivado");
          setConfirmArchive(false);
        }}
      />
    </div>
  );
}

/* ---------- Secciones ---------- */

function SectionCard({
  competitorId,
  sectionKey,
  section,
  sources,
}: {
  competitorId: string;
  sectionKey: SectionKey;
  section: CiSectionRow | undefined;
  sources: CiSourceRow[];
}) {
  const [editing, setEditing] = useState(false);
  const { saving, error, run } = useSaver();
  const content = section?.content ?? "";
  const state = reviewState({
    content,
    dataStatus: section?.dataStatus ?? "pendiente_revision",
    lastVerifiedOn: section?.lastVerifiedOn ?? null,
    reviewAfterDays:
      section?.reviewAfterDays ?? DEFAULT_REVIEW_DAYS[sectionKey],
  });
  const linkedSources = sources.filter((source) =>
    section?.sourceIds.includes(source.id)
  );
  const dueOn = section ? reviewDueOn(section) : null;

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run(
      () =>
        sendCompetencia(
          `/api/super-admin/competencia/competitors/${competitorId}/sections/${sectionKey}`,
          "PUT",
          {
            content: String(form.get("content") ?? ""),
            dataStatus: String(form.get("dataStatus")),
            evidenceLevel: String(form.get("evidenceLevel")),
            lastVerifiedOn: emptyToNull(form.get("lastVerifiedOn")),
            reviewAfterDays: Number(
              form.get("reviewAfterDays") ?? DEFAULT_REVIEW_DAYS[sectionKey]
            ),
            sourceIds: form.getAll("sourceIds").map(String),
          }
        ),
      () => setEditing(false)
    );
  }

  return (
    <article className={ciCard} aria-labelledby={`section-${sectionKey}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 id={`section-${sectionKey}`} className="font-semibold text-white">
          {SECTION_LABELS[sectionKey]}
        </h3>
        <div className="flex flex-wrap items-center gap-1.5">
          <ReviewPill state={state} />
          {content.trim() && section ? (
            <EvidencePill level={section.evidenceLevel} />
          ) : null}
          {!editing ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex min-h-[36px] items-center gap-1 rounded-lg px-2 text-xs text-white/70 hover:bg-white/10"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden /> Editar
            </button>
          ) : null}
        </div>
      </div>

      {!editing ? (
        <>
          {content.trim() ? (
            <p className="mt-2 whitespace-pre-line text-sm leading-6 text-white/80">
              {content}
            </p>
          ) : (
            <p className="mt-2 text-sm italic text-white/45">
              Pendiente de investigar.
            </p>
          )}
          {content.trim() ? (
            <p className="mt-2 text-xs text-white/45">
              {section?.lastVerifiedOn
                ? `Comprobado el ${section.lastVerifiedOn}`
                : "Sin fecha de comprobación"}
              {dueOn ? ` · revisar antes del ${dueOn}` : ""}
            </p>
          ) : null}
          {linkedSources.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {linkedSources.map((source) => (
                <li key={source.id} className="text-xs">
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1 text-zaltyko-electric hover:underline"
                  >
                    {source.title ?? source.url}{" "}
                    <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : (
        <form onSubmit={onSubmit} className="mt-3 space-y-3">
          <label className="block">
            <span className="sr-only">Contenido</span>
            <textarea
              name="content"
              rows={5}
              maxLength={8000}
              defaultValue={content}
              className={ciInput}
              placeholder="Hallazgo, con su fuente. Marca las inferencias como tales."
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className={ciLabel}>Estado del dato</span>
              <select
                name="dataStatus"
                defaultValue={section?.dataStatus ?? "pendiente_revision"}
                className={`${ciInput} mt-2`}
              >
                {DATA_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {DATA_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={ciLabel}>Nivel de evidencia</span>
              <select
                name="evidenceLevel"
                defaultValue={section?.evidenceLevel ?? "sin_evidencia"}
                className={`${ciInput} mt-2`}
              >
                {EVIDENCE_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {EVIDENCE_LEVEL_LABELS[level]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={ciLabel}>Comprobado el</span>
              <input
                name="lastVerifiedOn"
                type="date"
                defaultValue={section?.lastVerifiedOn ?? todayIso()}
                className={`${ciInput} mt-2`}
              />
            </label>
            <label className="block">
              <span className={ciLabel}>Revisar cada (días)</span>
              <input
                name="reviewAfterDays"
                type="number"
                min={1}
                max={730}
                defaultValue={
                  section?.reviewAfterDays ?? DEFAULT_REVIEW_DAYS[sectionKey]
                }
                className={`${ciInput} mt-2`}
              />
            </label>
          </div>
          {sources.length > 0 ? (
            <fieldset>
              <legend className={ciLabel}>Fuentes que lo respaldan</legend>
              <div className="mt-2 max-h-44 space-y-1 overflow-y-auto">
                {sources.map((source) => (
                  <label
                    key={source.id}
                    className="flex items-start gap-2 text-xs text-white/80"
                  >
                    <input
                      type="checkbox"
                      name="sourceIds"
                      value={source.id}
                      defaultChecked={section?.sourceIds.includes(source.id)}
                      className="mt-0.5 h-4 w-4"
                    />
                    <span className="break-all">
                      {source.title ?? source.url}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : (
            <p className="text-xs text-white/50">
              Añade fuentes en la pestaña «Fuentes» para vincularlas.
            </p>
          )}
          <ErrorLine error={error} />
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={saving} className={ciButtonPrimary}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : null}{" "}
              Guardar sección
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className={ciButtonGhost}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </article>
  );
}

/* ---------- Fuentes ---------- */

function SourcesPanel({
  competitorId,
  sources,
}: {
  competitorId: string;
  sources: CiSourceRow[];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <div className={ciCard}>
        <h3 className="font-semibold text-white">Añadir fuente</h3>
        <div className="mt-3">
          <SourceForm competitorId={competitorId} />
        </div>
      </div>
      {sources.length === 0 ? (
        <EmptyNote title="Sin fuentes todavía">
          Registra la URL, la fecha y qué afirmación respalda cada fuente.
        </EmptyNote>
      ) : (
        <ul className="space-y-3">
          {sources.map((source) => (
            <li key={source.id} className={ciCard}>
              {editingId === source.id ? (
                <SourceForm
                  initial={source}
                  onDone={() => setEditingId(null)}
                />
              ) : (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex min-w-0 items-center gap-1 break-all font-medium text-zaltyko-electric hover:underline"
                    >
                      {source.title ?? source.url}{" "}
                      <ExternalLink
                        className="h-3.5 w-3.5 shrink-0"
                        aria-hidden
                      />
                    </a>
                    <button
                      type="button"
                      onClick={() => setEditingId(source.id)}
                      className="inline-flex min-h-[36px] items-center gap-1 rounded-lg px-2 text-xs text-white/70 hover:bg-white/10"
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden /> Editar
                    </button>
                  </div>
                  <p className="text-sm text-white/80">{source.claim}</p>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-white/55">
                    <EvidencePill level={source.evidenceLevel} />
                    <Pill>
                      {SOURCE_TYPE_LABELS[source.sourceType as SourceType] ??
                        source.sourceType}
                    </Pill>
                    <span>Consultada el {source.accessedOn}</span>
                    {!source.accessible ? (
                      <Pill variant="bad">Inaccesible</Pill>
                    ) : null}
                  </div>
                  {source.notes ? (
                    <p className="text-xs text-white/55">{source.notes}</p>
                  ) : null}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------- Precios ---------- */

function PricingForm({
  competitorId,
  plan,
  sources,
  onDone,
}: {
  competitorId: string;
  plan?: CiPricingPlanRow;
  sources: CiSourceRow[];
  onDone?: () => void;
}) {
  const { saving, error, run } = useSaver();
  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const body = {
      planName: String(form.get("planName") ?? ""),
      priceAmount: numberOrNull(form.get("priceAmount")),
      currency: String(form.get("currency") ?? "EUR"),
      billingPeriod: String(form.get("billingPeriod")),
      vatMode: String(form.get("vatMode")),
      limitsText: emptyToNull(form.get("limitsText")),
      feesText: emptyToNull(form.get("feesText")),
      extrasText: emptyToNull(form.get("extrasText")),
      trialText: emptyToNull(form.get("trialText")),
      commitmentText: emptyToNull(form.get("commitmentText")),
      estimateSmall: emptyToNull(form.get("estimateSmall")),
      estimateMedium: emptyToNull(form.get("estimateMedium")),
      estimateLarge: emptyToNull(form.get("estimateLarge")),
      sourceId: emptyToNull(form.get("sourceId")),
      dataStatus: String(form.get("dataStatus")),
      lastVerifiedOn: emptyToNull(form.get("lastVerifiedOn")),
      reviewAfterDays: Number(form.get("reviewAfterDays") ?? 60),
    };
    run(
      () =>
        plan
          ? sendCompetencia(
              `/api/super-admin/competencia/pricing/${plan.id}`,
              "PATCH",
              body
            )
          : sendCompetencia(
              `/api/super-admin/competencia/competitors/${competitorId}/pricing`,
              "POST",
              body
            ),
      () => {
        if (!plan) formElement.reset();
        onDone?.();
      }
    );
  }
  const text = (name: keyof CiPricingPlanRow, label: string, wide = false) => (
    <label className={`block ${wide ? "sm:col-span-2" : ""}`}>
      <span className={ciLabel}>{label}</span>
      <input
        name={name}
        defaultValue={(plan?.[name] as string | null) ?? ""}
        className={`${ciInput} mt-2`}
      />
    </label>
  );
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block sm:col-span-2">
          <span className={ciLabel}>Plan *</span>
          <input
            name="planName"
            required
            defaultValue={plan?.planName}
            className={`${ciInput} mt-2`}
          />
        </label>
        <label className="block">
          <span className={ciLabel}>Importe</span>
          <input
            name="priceAmount"
            inputMode="decimal"
            defaultValue={plan?.priceAmount ?? ""}
            placeholder="vacío = no publicado"
            className={`${ciInput} mt-2`}
          />
        </label>
        <label className="block">
          <span className={ciLabel}>Moneda</span>
          <input
            name="currency"
            defaultValue={plan?.currency ?? "EUR"}
            maxLength={3}
            className={`${ciInput} mt-2`}
          />
        </label>
        <label className="block">
          <span className={ciLabel}>Periodo</span>
          <select
            name="billingPeriod"
            defaultValue={plan?.billingPeriod ?? "mes"}
            className={`${ciInput} mt-2`}
          >
            {BILLING_PERIODS.map((period) => (
              <option key={period} value={period}>
                {BILLING_PERIOD_LABELS[period]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={ciLabel}>IVA</span>
          <select
            name="vatMode"
            defaultValue={plan?.vatMode ?? "desconocido"}
            className={`${ciInput} mt-2`}
          >
            {VAT_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {VAT_MODE_LABELS[mode]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={ciLabel}>Estado del dato</span>
          <select
            name="dataStatus"
            defaultValue={plan?.dataStatus ?? "verificado"}
            className={`${ciInput} mt-2`}
          >
            {DATA_STATUSES.map((status) => (
              <option key={status} value={status}>
                {DATA_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={ciLabel}>Comprobado el</span>
          <input
            name="lastVerifiedOn"
            type="date"
            defaultValue={plan?.lastVerifiedOn ?? todayIso()}
            className={`${ciInput} mt-2`}
          />
        </label>
        {text("limitsText", "Límites", true)}
        {text("feesText", "Comisiones", true)}
        {text("extrasText", "Extras", true)}
        {text("trialText", "Prueba / demo")}
        {text("commitmentText", "Permanencia")}
        {text("estimateSmall", "Coste club S (30 / 3)")}
        {text("estimateMedium", "Coste club M (75 / 5)")}
        {text("estimateLarge", "Coste club L (150 / 10)")}
        <label className="block">
          <span className={ciLabel}>Revisar cada (días)</span>
          <input
            name="reviewAfterDays"
            type="number"
            min={1}
            max={730}
            defaultValue={plan?.reviewAfterDays ?? 60}
            className={`${ciInput} mt-2`}
          />
        </label>
        <label className="block sm:col-span-2">
          <span className={ciLabel}>Fuente</span>
          <select
            name="sourceId"
            defaultValue={plan?.sourceId ?? ""}
            className={`${ciInput} mt-2`}
          >
            <option value="">Sin fuente</option>
            {sources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.title ?? source.url}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ErrorLine error={error} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={saving} className={ciButtonPrimary}>
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : null}{" "}
          {plan ? "Guardar plan" : "Añadir plan"}
        </button>
        {onDone ? (
          <button type="button" onClick={onDone} className={ciButtonGhost}>
            Cancelar
          </button>
        ) : null}
      </div>
    </form>
  );
}

function PricingPanel({
  competitorId,
  pricing,
  sources,
}: {
  competitorId: string;
  pricing: CiPricingPlanRow[];
  sources: CiSourceRow[];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      {pricing.length === 0 ? (
        <EmptyNote title="Sin planes registrados">
          Si no publican precios, añade un plan «a consultar» sin importe; no
          inventes valores.
        </EmptyNote>
      ) : (
        <ul className="space-y-3">
          {pricing.map((plan) => (
            <li key={plan.id} className={ciCard}>
              {editingId === plan.id ? (
                <PricingForm
                  competitorId={competitorId}
                  plan={plan}
                  sources={sources}
                  onDone={() => setEditingId(null)}
                />
              ) : (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-white">
                        {plan.planName}
                      </p>
                      <p className="text-sm text-white/80">
                        {plan.priceAmount === null
                          ? "No publicado"
                          : `${Number(plan.priceAmount).toLocaleString("es-ES")} ${plan.currency}`}{" "}
                        {
                          BILLING_PERIOD_LABELS[
                            plan.billingPeriod as keyof typeof BILLING_PERIOD_LABELS
                          ]
                        }{" "}
                        ·{" "}
                        {
                          VAT_MODE_LABELS[
                            plan.vatMode as keyof typeof VAT_MODE_LABELS
                          ]
                        }
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <ReviewPill state={reviewState(plan)} />
                      <button
                        type="button"
                        onClick={() => setEditingId(plan.id)}
                        className="inline-flex min-h-[36px] items-center gap-1 rounded-lg px-2 text-xs text-white/70 hover:bg-white/10"
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden /> Editar
                      </button>
                    </div>
                  </div>
                  <dl className="grid gap-x-4 gap-y-1 text-xs text-white/65 sm:grid-cols-2">
                    {[
                      ["Límites", plan.limitsText],
                      ["Comisiones", plan.feesText],
                      ["Extras", plan.extrasText],
                      ["Prueba", plan.trialText],
                      ["Permanencia", plan.commitmentText],
                      ["Club S (30/3)", plan.estimateSmall],
                      ["Club M (75/5)", plan.estimateMedium],
                      ["Club L (150/10)", plan.estimateLarge],
                    ]
                      .filter(([, value]) => value)
                      .map(([label, value]) => (
                        <div key={label} className="flex gap-1">
                          <dt className="text-white/45">{label}:</dt>
                          <dd>{value}</dd>
                        </div>
                      ))}
                  </dl>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className={ciCard}>
        <h3 className="font-semibold text-white">Añadir plan de precios</h3>
        <div className="mt-3">
          <PricingForm competitorId={competitorId} sources={sources} />
        </div>
      </div>
    </div>
  );
}

/* ---------- Flujos de producto ---------- */

function CoverageRow({
  competitorId,
  flow,
  current,
  sources,
}: {
  competitorId: string;
  flow: CiFlowRow;
  current?: CiCompetitorFlowRow;
  sources: CiSourceRow[];
}) {
  const { saving, error, run } = useSaver();
  const [open, setOpen] = useState(false);
  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run(
      () =>
        sendCompetencia(
          `/api/super-admin/competencia/competitors/${competitorId}/flows`,
          "PUT",
          {
            flowId: flow.id,
            coverage: String(form.get("coverage")),
            evidenceLevel: String(form.get("evidenceLevel")),
            sourceId: emptyToNull(form.get("sourceId")),
            notes: emptyToNull(form.get("notes")),
          }
        ),
      () => setOpen(false)
    );
  }
  return (
    <li className="border-b border-white/10 py-3 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-white">{flow.name}</p>
          <p className="text-xs text-white/50">
            Zaltyko: <ZaltykoStatusPill status={flow.zaltykoStatus} />
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <CoveragePill coverage={current?.coverage ?? "desconocido"} />
          {current ? <EvidencePill level={current.evidenceLevel} /> : null}
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="inline-flex min-h-[36px] items-center gap-1 rounded-lg px-2 text-xs text-white/70 hover:bg-white/10"
            aria-expanded={open}
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden />{" "}
            {open ? "Cerrar" : "Editar"}
          </button>
        </div>
      </div>
      {current?.notes && !open ? (
        <p className="mt-1 text-xs text-white/55">{current.notes}</p>
      ) : null}
      {open ? (
        <form onSubmit={onSubmit} className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={ciLabel}>¿Lo resuelve?</span>
            <select
              name="coverage"
              defaultValue={current?.coverage ?? "desconocido"}
              className={`${ciInput} mt-2`}
            >
              {FLOW_COVERAGES.map((coverage) => (
                <option key={coverage} value={coverage}>
                  {FLOW_COVERAGE_LABELS[coverage]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={ciLabel}>Evidencia</span>
            <select
              name="evidenceLevel"
              defaultValue={current?.evidenceLevel ?? "sin_evidencia"}
              className={`${ciInput} mt-2`}
            >
              {EVIDENCE_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {EVIDENCE_LEVEL_LABELS[level]}
                </option>
              ))}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className={ciLabel}>Fuente</span>
            <select
              name="sourceId"
              defaultValue={current?.sourceId ?? ""}
              className={`${ciInput} mt-2`}
            >
              <option value="">Sin fuente</option>
              {sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.title ?? source.url}
                </option>
              ))}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className={ciLabel}>Notas</span>
            <input
              name="notes"
              defaultValue={current?.notes ?? ""}
              className={`${ciInput} mt-2`}
            />
          </label>
          <div className="sm:col-span-2">
            <ErrorLine error={error} />
            <button type="submit" disabled={saving} className={ciButtonPrimary}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : null}{" "}
              Guardar
            </button>
          </div>
        </form>
      ) : null}
    </li>
  );
}

/* ---------- Ficha completa ---------- */

export function CompetitorProfileWorkspace(
  props: CompetitorProfileWorkspaceProps
) {
  const {
    competitor,
    sections,
    sources,
    pricing,
    flows,
    coverage,
    history,
    opportunities,
  } = props;
  const [editingGeneral, setEditingGeneral] = useState(false);
  const sectionByKey = useMemo(
    () => new Map(sections.map((section) => [section.section, section])),
    [sections]
  );
  const coverageByFlow = useMemo(
    () => new Map(coverage.map((row) => [row.flowId, row])),
    [coverage]
  );

  return (
    <div className="space-y-6">
      <section className={`${ciCard} space-y-3`} aria-label="Datos generales">
        <div className="flex flex-wrap items-center gap-1.5">
          <Pill variant="info">
            {
              COMPETITOR_TYPE_LABELS[
                competitor.competitorType as CompetitorType
              ]
            }
          </Pill>
          <Pill
            variant={competitor.researchStatus === "completa" ? "ok" : "warn"}
          >
            {
              RESEARCH_STATUS_LABELS[
                competitor.researchStatus as keyof typeof RESEARCH_STATUS_LABELS
              ]
            }
          </Pill>
          <Pill
            variant={competitor.lifecycleStatus === "activo" ? "ok" : "neutral"}
          >
            {
              LIFECYCLE_STATUS_LABELS[
                competitor.lifecycleStatus as LifecycleStatus
              ]
            }
            {competitor.archivedAt
              ? ` · ${dateTime.format(new Date(competitor.archivedAt))}`
              : ""}
          </Pill>
          {competitor.countries.map((country) => (
            <Pill key={country}>{country}</Pill>
          ))}
          {competitor.disciplines.map((discipline) => (
            <Pill key={discipline}>
              {DISCIPLINE_LABELS[discipline as Discipline] ?? discipline}
            </Pill>
          ))}
          {competitor.clientSizes.map((size) => (
            <Pill key={size}>
              {CLIENT_SIZE_LABELS[size as ClientSize] ?? size}
            </Pill>
          ))}
        </div>
        {competitor.summary ? (
          <p className="text-sm leading-6 text-white/80">
            {competitor.summary}
          </p>
        ) : null}
        {competitor.website ? (
          <a
            href={competitor.website}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 break-all text-sm text-zaltyko-electric hover:underline"
          >
            {competitor.website}{" "}
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => setEditingGeneral((value) => !value)}
            className={ciButtonGhost}
            aria-expanded={editingGeneral}
          >
            <Pencil className="h-4 w-4" aria-hidden /> Editar datos generales
          </button>
          <LifecycleActions competitor={competitor} />
        </div>
      </section>

      {editingGeneral ? (
        <GeneralEditor
          competitor={competitor}
          onClose={() => setEditingGeneral(false)}
        />
      ) : null}

      <Tabs defaultValue="resumen" className="space-y-4">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-white/5 p-1">
          {SECTION_GROUPS.map((group) => (
            <TabsTrigger
              key={group.id}
              value={group.id}
              className="min-h-[40px]"
            >
              {group.label}
            </TabsTrigger>
          ))}
          <TabsTrigger value="fuentes" className="min-h-[40px]">
            Fuentes ({sources.length})
          </TabsTrigger>
          <TabsTrigger value="historial" className="min-h-[40px]">
            Historial
          </TabsTrigger>
        </TabsList>

        {SECTION_GROUPS.map((group) => (
          <TabsContent key={group.id} value={group.id} className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              {group.sections.map((key) => (
                <SectionCard
                  key={key}
                  competitorId={competitor.id}
                  sectionKey={key}
                  section={sectionByKey.get(key)}
                  sources={sources}
                />
              ))}
            </div>

            {group.id === "negocio" ? (
              <PricingPanel
                competitorId={competitor.id}
                pricing={pricing}
                sources={sources}
              />
            ) : null}

            {group.id === "producto" ? (
              <section className={ciCard} aria-labelledby="ci-flows-title">
                <h3 id="ci-flows-title" className="font-semibold text-white">
                  Flujos de producto
                </h3>
                <p className="mt-1 text-xs text-white/55">
                  «Desconocido» significa que no hay evidencia, no que no
                  exista.
                </p>
                {flows.length === 0 ? (
                  <p className="mt-3 text-sm text-white/60">
                    No hay flujos definidos. Créalos en «Flujos y Zaltyko».
                  </p>
                ) : (
                  <ul className="mt-2">
                    {flows.map((flow) => (
                      <CoverageRow
                        key={flow.id}
                        competitorId={competitor.id}
                        flow={flow}
                        current={coverageByFlow.get(flow.id)}
                        sources={sources}
                      />
                    ))}
                  </ul>
                )}
              </section>
            ) : null}

            {group.id === "oportunidades" ? (
              <section className={ciCard} aria-labelledby="ci-linked-opps">
                <h3 id="ci-linked-opps" className="font-semibold text-white">
                  Oportunidades vinculadas
                </h3>
                {opportunities.length === 0 ? (
                  <p className="mt-2 text-sm text-white/60">
                    Ninguna oportunidad menciona todavía a este competidor.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {opportunities.map((opportunity) => (
                      <li
                        key={opportunity.id}
                        className="flex flex-wrap items-center gap-2 text-sm text-white/85"
                      >
                        <OpportunityClassPill
                          value={opportunity.classification}
                        />{" "}
                        {opportunity.title}
                      </li>
                    ))}
                  </ul>
                )}
                <Link
                  href="/super-admin/competencia/oportunidades"
                  className="mt-3 inline-block text-xs text-zaltyko-electric hover:underline"
                >
                  Gestionar oportunidades
                </Link>
              </section>
            ) : null}
          </TabsContent>
        ))}

        <TabsContent value="fuentes">
          <SourcesPanel competitorId={competitor.id} sources={sources} />
        </TabsContent>

        <TabsContent value="historial">
          {history.length === 0 ? (
            <EmptyNote title="Sin cambios registrados" />
          ) : (
            <ol className={`${ciCard} space-y-3`}>
              {history.map((event) => (
                <li
                  key={event.id}
                  className="border-b border-white/10 pb-3 last:border-b-0 last:pb-0"
                >
                  <p className="text-sm text-white/85">{event.summary}</p>
                  <p className="text-xs text-white/45">
                    {dateTime.format(new Date(event.createdAt))} ·{" "}
                    {event.action}
                  </p>
                  {event.diff &&
                  Object.keys(event.diff as object).length > 0 ? (
                    <details className="mt-1 text-xs text-white/55">
                      <summary className="cursor-pointer">Ver cambios</summary>
                      <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-black/30 p-2">
                        {JSON.stringify(event.diff, null, 2)}
                      </pre>
                    </details>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

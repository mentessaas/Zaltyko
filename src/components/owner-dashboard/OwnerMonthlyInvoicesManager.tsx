"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  OwnerMonthlyInvoiceWorkspace,
  type MonthlyInvoiceOptionsResponse,
} from "./OwnerMonthlyInvoiceWorkspace";
import {
  OwnerMonthlyInvoiceResolutionPanel,
  type ResolutionAction,
} from "./OwnerMonthlyInvoiceResolutionPanel";

type WorkspaceState = "loading" | "error" | "empty" | "ready";
type RetryIssue = { key: string; body: unknown };

function responseData<T>(payload: unknown): T | null {
  if (payload && typeof payload === "object" && "data" in payload) {
    return (payload as { data: T }).data;
  }
  return null;
}

function responseMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object") {
    const detail = "detail" in payload ? payload.detail : undefined;
    const message = "message" in payload ? payload.message : undefined;
    if (typeof detail === "string") return detail;
    if (typeof message === "string") return message;
  }
  return fallback;
}

function problemCode(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  if ("code" in payload && typeof payload.code === "string") {
    return payload.code;
  }
  if ("type" in payload && typeof payload.type === "string") {
    return payload.type.split("/").at(-1)?.replaceAll("-", "_").toUpperCase();
  }
  return undefined;
}

function isServicePeriod(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}

export function OwnerMonthlyInvoicesManager({
  organizationId,
  organizationName,
  defaultCurrency,
  locations,
  initialLocationId,
  initialServicePeriod,
}: {
  organizationId: string;
  organizationName: string;
  defaultCurrency: string;
  locations: Array<{ id: string; name: string }>;
  initialLocationId: string;
  initialServicePeriod: string;
}) {
  const [locationId, setLocationId] = useState(initialLocationId);
  const [servicePeriod, setServicePeriod] = useState(initialServicePeriod);
  const [options, setOptions] = useState<MonthlyInvoiceOptionsResponse>();
  const [selectedFamilyId, setSelectedFamilyId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [state, setState] = useState<WorkspaceState>("loading");
  const [loadError, setLoadError] = useState("");
  const [issueError, setIssueError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [resolutionAction, setResolutionAction] =
    useState<ResolutionAction | null>(null);
  const [payerResetKey, setPayerResetKey] = useState(0);
  const [resolutionNotice, setResolutionNotice] = useState("");
  const [quoteNeedsReview, setQuoteNeedsReview] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const requestSequence = useRef(0);
  const issueRetry = useRef<RetryIssue | null>(null);
  const currentScopeRef = useRef({
    organizationId,
    locationId: initialLocationId,
    servicePeriod: initialServicePeriod,
  });

  const loadOptions = useCallback(
    async (signal?: AbortSignal, preferredFamilyId?: string) => {
      if (!locationId || !isServicePeriod(servicePeriod)) {
        return;
      }
      const requestId = ++requestSequence.current;
      try {
        const params = new URLSearchParams({
          organizationId,
          locationId,
          servicePeriod,
        });
        const response = await fetch(
          `/api/v1/owner/billing/monthly-invoices/options?${params.toString()}`,
          { cache: "no-store", signal }
        );
        const payload = await response.json().catch(() => null);
        const data = responseData<MonthlyInvoiceOptionsResponse>(payload);
        if (!response.ok || !data || !Array.isArray(data.families)) {
          throw new Error(
            responseMessage(payload, "No se han podido cargar las cuotas.")
          );
        }
        if (requestSequence.current !== requestId) return;
        if (
          data.organizationId !== organizationId ||
          data.locationId !== locationId ||
          data.servicePeriod !== servicePeriod
        ) {
          throw new Error(
            "La respuesta no corresponde a la academia, sede y mes solicitados. Vuelve a intentarlo."
          );
        }
        setLoadError("");
        setOptions(data);
        const preferredFamilyIsAvailable =
          isUuid(preferredFamilyId) &&
          data.organizationId === organizationId &&
          data.locationId === locationId &&
          data.servicePeriod === servicePeriod &&
          data.families.some((family) => family.familyId === preferredFamilyId);
        setSelectedFamilyId((current) => {
          if (preferredFamilyIsAvailable) return preferredFamilyId;
          return data.families.some((family) => family.familyId === current)
            ? current
            : "";
        });
        setState(data.families.length > 0 ? "ready" : "empty");
      } catch (error) {
        if (signal?.aborted || requestSequence.current !== requestId) return;
        setOptions(undefined);
        setState("error");
        setLoadError(
          error instanceof Error
            ? error.message
            : "No se han podido cargar las cuotas. Comprueba la conexión e inténtalo de nuevo."
        );
      }
    },
    [locationId, organizationId, servicePeriod]
  );

  const loadOptionsRef = useRef(loadOptions);
  useEffect(() => {
    currentScopeRef.current = { organizationId, locationId, servicePeriod };
    loadOptionsRef.current = loadOptions;
  }, [loadOptions, locationId, organizationId, servicePeriod]);

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial state is already loading; this call starts the async server read.
    void loadOptions(controller.signal);
    return () => controller.abort();
  }, [loadOptions, refreshKey]);

  function refreshOptions() {
    setQuoteNeedsReview(false);
    setState("loading");
    setRefreshKey((value) => value + 1);
  }

  async function handleResolutionSaved(
    kind: "tariff" | "family",
    returnedFamilyId?: string
  ) {
    setResolutionAction(null);
    if (kind === "family") setPayerResetKey((current) => current + 1);
    setResolutionNotice(
      kind === "tariff"
        ? "Tarifa mensual asignada a la inscripción."
        : "Familia y persona pagadora vinculadas a la inscripción."
    );
    setState("loading");
    const currentScope = currentScopeRef.current;
    const callbackScopeMatchesCurrent =
      currentScope.organizationId === organizationId &&
      currentScope.locationId === locationId &&
      currentScope.servicePeriod === servicePeriod;
    const preferredFamilyId =
      kind === "family" &&
      callbackScopeMatchesCurrent &&
      isUuid(returnedFamilyId)
        ? returnedFamilyId
        : undefined;
    await loadOptionsRef.current(undefined, preferredFamilyId);
  }

  async function issueInvoice(command: {
    organizationId: string;
    locationId: string;
    familyId: string;
    familyPayerId: string;
    servicePeriod: string;
    dueDate: string;
    quoteHash: string;
  }) {
    setIssueError("");
    setSuccessMessage("");
    const body = {
      organizationId: command.organizationId,
      locationId: command.locationId,
      familyId: command.familyId,
      familyPayerId: command.familyPayerId,
      servicePeriod: command.servicePeriod,
      dueDate: command.dueDate,
      quoteHash: command.quoteHash,
    };
    const previous = issueRetry.current;
    const key =
      previous && JSON.stringify(previous.body) === JSON.stringify(body)
        ? previous.key
        : `owner-monthly-invoice:${crypto.randomUUID()}`;
    issueRetry.current = { key, body };
    setBusy(true);
    try {
      const response = await fetch(
        "/api/v1/owner/billing/monthly-invoices/issue",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "Idempotency-Key": key,
          },
          body: JSON.stringify(body),
        }
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const code = problemCode(payload);
        if (response.status >= 400 && response.status < 500) {
          issueRetry.current = null;
        }
        if (code === "QUOTE_STALE" || code === "MONTHLY_INVOICE_BLOCKED") {
          setQuoteNeedsReview(true);
          setState("loading");
          await loadOptions();
        }
        if (
          code === "PERIOD_ALREADY_INVOICED" ||
          code === "INVOICE_VOIDED" ||
          code === "ENROLLMENT_ALREADY_BILLED" ||
          code === "FAMILY_PAYER_INVALID"
        ) {
          setQuoteNeedsReview(true);
          setState("loading");
          await loadOptions();
        }
        throw new Error(
          responseMessage(
            payload,
            "No se ha podido emitir la factura. Revisa los datos e inténtalo de nuevo."
          )
        );
      }
      issueRetry.current = null;
      const data = responseData<{
        invoiceId?: string;
        status?: string;
        chargeStatus?: string;
        collectionMode?: string;
      }>(payload);
      setSuccessMessage(
        data?.chargeStatus === "due" && data.collectionMode === "manual"
          ? "Factura emitida y pendiente. No se ha registrado ni iniciado un pago."
          : "Factura emitida; no se ha registrado ni iniciado un pago."
      );
      setQuoteNeedsReview(false);
      if (data?.invoiceId) await loadOptions();
    } catch (error) {
      setIssueError(
        error instanceof Error
          ? error.message
          : "No se ha podido emitir la factura."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="mx-auto grid max-w-4xl gap-5 px-5 pt-6 sm:pt-10">
        <Link
          href={`/owner?organizationId=${encodeURIComponent(organizationId)}`}
          className="min-h-11 w-fit content-center rounded-full border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800"
        >
          Volver al panel
        </Link>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-900">
            {organizationName}
          </p>
        </div>
        {locations.length > 1 && (
          <label className="grid max-w-md gap-2">
            <span className="text-sm font-bold">Sede</span>
            <select
              value={locationId}
              onChange={(event) => {
                setLocationId(event.target.value);
                setSelectedFamilyId("");
                setState("loading");
              }}
              className="min-h-11 w-full border border-slate-400 bg-white px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-800"
            >
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="grid max-w-md gap-2">
          <span className="text-sm font-bold">Mes de la cuota</span>
          <input
            type="month"
            value={servicePeriod}
            onChange={(event) => {
              const nextPeriod = event.target.value;
              setServicePeriod(nextPeriod);
              setSelectedFamilyId("");
              setDueDate("");
              if (!isServicePeriod(nextPeriod)) setOptions(undefined);
              setSuccessMessage("");
              setIssueError("");
              setQuoteNeedsReview(false);
              setState(isServicePeriod(nextPeriod) ? "loading" : "empty");
            }}
            className="min-h-11 w-full border border-slate-400 bg-white px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-800"
            aria-describedby="monthly-invoice-period-help"
          />
          <span
            id="monthly-invoice-period-help"
            className="text-xs text-slate-600"
          >
            El total y el desglose llegan calculados por el servidor para este
            periodo.
          </span>
        </label>
      </div>
      <OwnerMonthlyInvoiceWorkspace
        state={state}
        options={options}
        selectedFamilyId={selectedFamilyId}
        payerResetKey={payerResetKey}
        dueDate={dueDate}
        errorMessage={loadError || issueError}
        successMessage={successMessage}
        quoteNeedsReview={quoteNeedsReview}
        busy={busy || Boolean(resolutionAction)}
        onFamilyChange={(familyId) => {
          setSelectedFamilyId(familyId);
          setSuccessMessage("");
          setIssueError("");
        }}
        onDueDateChange={setDueDate}
        onRetry={refreshOptions}
        onAssignTariff={(enrollmentId) => {
          const enrollment = options?.families
            .flatMap((family) => family.enrollments)
            .find((item) => item.enrollmentId === enrollmentId);
          setIssueError("");
          setResolutionNotice("");
          setResolutionAction({
            kind: "tariff",
            enrollmentId,
            athleteName: enrollment?.athleteName ?? null,
          });
        }}
        onLinkFamily={(enrollmentId) => {
          const enrollment = [
            ...(options?.unassignedEnrollments ?? []),
            ...(options?.families.flatMap((family) => family.enrollments) ??
              []),
          ].find((item) => item.enrollmentId === enrollmentId);
          if (!enrollment) {
            setIssueError(
              "No se encuentra esta inscripción en las opciones actuales."
            );
            return;
          }
          setIssueError("");
          setResolutionNotice("");
          setResolutionAction({
            kind: "family",
            enrollmentId,
            athleteId: enrollment.athleteId,
            athleteName: enrollment.athleteName,
          });
        }}
        onAssignPayer={(familyId) => {
          const family = options?.families.find(
            (item) => item.familyId === familyId
          );
          if (!family) return;
          setIssueError("");
          setResolutionNotice("");
          setResolutionAction({
            kind: "payer",
            familyId,
            athleteIds: family.enrollments
              .filter((item) => item.billable)
              .map((item) => item.athleteId),
          });
        }}
        onIssue={(command) => void issueInvoice(command)}
      />
      {resolutionNotice && (
        <p
          role="status"
          aria-live="polite"
          className="mx-auto mt-6 max-w-4xl border border-teal-300 bg-teal-50 p-4 text-sm text-teal-950"
        >
          {resolutionNotice}
        </p>
      )}
      {resolutionAction && (
        <OwnerMonthlyInvoiceResolutionPanel
          key={
            resolutionAction.kind === "payer"
              ? `payer:${resolutionAction.familyId}`
              : `${resolutionAction.kind}:${resolutionAction.enrollmentId}`
          }
          action={resolutionAction}
          organizationId={organizationId}
          locationId={locationId}
          defaultCurrency={defaultCurrency}
          servicePeriodStart={
            options?.servicePeriodStart ?? `${servicePeriod}-01`
          }
          onCancel={() => setResolutionAction(null)}
          onSaved={handleResolutionSaved}
        />
      )}
      {issueError && (
        <div
          role="alert"
          className="mx-auto -mt-4 max-w-4xl px-5 text-sm text-red-900"
        >
          {issueError}
        </div>
      )}
    </>
  );
}

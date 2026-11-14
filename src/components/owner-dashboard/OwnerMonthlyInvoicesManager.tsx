"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { OwnerOperationalReadOnlyNotice } from "./OwnerOperationalReadOnlyNotice";
import { useOwnerPlanPolicy } from "./owner-plan-usage-store";
import { ownerField, ownerUi } from "./owner-ui";
import { cn } from "@/lib/utils";

import {
  OwnerMonthlyInvoiceWorkspace,
  type MonthlyInvoiceOptionsResponse,
} from "./OwnerMonthlyInvoiceWorkspace";
import {
  OwnerMonthlyInvoiceResolutionPanel,
  type ResolutionAction,
} from "./OwnerMonthlyInvoiceResolutionPanel";
import {
  clearPendingMonthlyInvoiceIssue,
  persistPendingMonthlyInvoiceIssue,
  PRE_COMMIT_MONTHLY_INVOICE_REJECTIONS,
  ROLLED_BACK_MONTHLY_INVOICE_RETRY,
  readPendingMonthlyInvoiceIssue,
  restorePendingMonthlyInvoiceIssueAfterRollback,
  type MonthlyInvoiceIssueBody,
  type PendingMonthlyInvoiceIssue,
} from "./monthly-invoice-retry-storage";

type WorkspaceState = "loading" | "error" | "empty" | "ready";
type RetryIssue = PendingMonthlyInvoiceIssue;
type ScopedInvoiceOptions = {
  scopeKey: string;
  data: MonthlyInvoiceOptionsResponse;
};

const useCommittedLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

function invoiceScopeKey(
  organizationId: string,
  locationId: string,
  servicePeriod: string
) {
  return JSON.stringify([organizationId, locationId, servicePeriod]);
}

function isSameIssue(left: RetryIssue | null, right: RetryIssue): boolean {
  return (
    left !== null &&
    left.key === right.key &&
    left.scopeKey === right.scopeKey &&
    JSON.stringify(left.body) === JSON.stringify(right.body)
  );
}

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
  defaultCurrency,
  locations,
  initialLocationId,
  initialServicePeriod,
}: {
  organizationId: string;
  /** Se conserva en la API; la academia ya se nombra en la barra lateral. */
  organizationName: string;
  defaultCurrency: string;
  locations: Array<{ id: string; name: string }>;
  initialLocationId: string;
  initialServicePeriod: string;
}) {
  const router = useRouter();
  const planPolicy = useOwnerPlanPolicy(organizationId);
  const writesBlocked = planPolicy.status !== "ready" || planPolicy.readOnly;
  const [locationId, setLocationId] = useState(initialLocationId);
  const [servicePeriod, setServicePeriod] = useState(initialServicePeriod);
  function replaceInvoiceContext(
    nextLocationId: string,
    nextServicePeriod: string
  ) {
    if (!isServicePeriod(nextServicePeriod)) return;

    const params = new URLSearchParams(window.location.search);
    params.set("organizationId", organizationId);
    params.set("locationId", nextLocationId);
    params.set("servicePeriod", nextServicePeriod);
    const query = params.toString();
    const hash = window.location.hash;
    router.replace(
      `${window.location.pathname}${query ? `?${query}` : ""}${hash}`,
      { scroll: false }
    );
  }
  const [options, setOptions] = useState<ScopedInvoiceOptions>();
  const currentScopeKey = invoiceScopeKey(
    organizationId,
    locationId,
    servicePeriod
  );
  const currentScopeKeyRef = useRef(currentScopeKey);
  useCommittedLayoutEffect(() => {
    currentScopeKeyRef.current = currentScopeKey;
  }, [currentScopeKey]);
  const currentOptions =
    options?.scopeKey === currentScopeKey ? options.data : undefined;
  const [selectedFamilyId, setSelectedFamilyId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [state, setState] = useState<WorkspaceState>("loading");
  const [stateScopeKey, setStateScopeKey] = useState(currentScopeKey);
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
  const [issueRetry, setIssueRetry] = useState<RetryIssue | null>(null);
  const [retryStorageState, setRetryStorageState] = useState<
    "loading" | "ready" | "blocked"
  >("loading");
  const [retryStorageError, setRetryStorageError] = useState("");
  const [issueReceipt, setIssueReceipt] = useState<{
    organizationId: string;
    locationId: string;
    servicePeriod: string;
    message: string;
  } | null>(null);
  const incomingSelectionScope = JSON.stringify([
    organizationId,
    initialLocationId,
    initialServicePeriod,
  ]);
  const [localSelectionScope, setLocalSelectionScope] = useState(
    incomingSelectionScope
  );
  if (localSelectionScope !== incomingSelectionScope) {
    setLocalSelectionScope(incomingSelectionScope);
    setLocationId(initialLocationId);
    setServicePeriod(initialServicePeriod);
    setSelectedFamilyId("");
    setDueDate("");
    setIssueError("");
    setSuccessMessage("");
    setResolutionNotice("");
    setQuoteNeedsReview(false);
  }
  const workspaceState =
    stateScopeKey === currentScopeKey ? state : "loading";
  const workspaceLoadError =
    stateScopeKey === currentScopeKey ? loadError : "";

  const loadOptions = useCallback(
    async (signal?: AbortSignal, preferredFamilyId?: string) => {
      if (!locationId || !isServicePeriod(servicePeriod)) {
        return;
      }
      const requestId = ++requestSequence.current;
      const requestScopeKey = invoiceScopeKey(
        organizationId,
        locationId,
        servicePeriod
      );
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
        setOptions({ scopeKey: requestScopeKey, data });
        setStateScopeKey(requestScopeKey);
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
        setStateScopeKey(requestScopeKey);
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
  useCommittedLayoutEffect(() => {
    loadOptionsRef.current = loadOptions;
  }, [loadOptions]);

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial state is already loading; this call starts the async server read.
    void loadOptions(controller.signal);
    return () => controller.abort();
  }, [loadOptions, refreshKey]);

  useEffect(() => {
    const pending = readPendingMonthlyInvoiceIssue();
    if (pending.status === "pending") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restore the explicit retry affordance after a page reload.
      setIssueRetry(pending.request);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- gate invoice writes until durable state is checked.
      setRetryStorageState("ready");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear only the transient storage warning after successful recovery.
      setRetryStorageError("");
      return;
    }
    if (pending.status === "none") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- gate invoice writes until durable state is checked.
      setRetryStorageState("ready");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear only the transient storage warning after successful recovery.
      setRetryStorageError("");
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fail closed if the prior command cannot be inspected.
    setRetryStorageState("blocked");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- show why invoice writes are paused.
    setRetryStorageError(
      pending.status === "invalid"
        ? "No se puede validar una emisión pendiente guardada. No se enviará otra cuota hasta resolver ese registro."
        : "El almacenamiento de sesión no está disponible. No se enviará ninguna cuota hasta que se pueda guardar y recuperar el reintento seguro."
    );
  }, []);

  function refreshOptions() {
    setQuoteNeedsReview(false);
    setState("loading");
    setStateScopeKey(currentScopeKey);
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
    setStateScopeKey(currentScopeKey);
    const preferredFamilyId =
      kind === "family" && isUuid(returnedFamilyId)
        ? returnedFamilyId
        : undefined;
    await loadOptionsRef.current(undefined, preferredFamilyId);
  }

  function persistRetryRequest(request: RetryIssue): boolean {
    if (persistPendingMonthlyInvoiceIssue(request)) return true;

    const stored = readPendingMonthlyInvoiceIssue();
    if (stored.status === "pending") {
      setIssueRetry(stored.request);
      if (isSameIssue(stored.request, request)) {
        setRetryStorageState("blocked");
        setRetryStorageError(
          "No se pudo actualizar el estado del reintento en el almacenamiento de sesión. No se ha enviado la cuota; vuelve a habilitarlo y reintenta."
        );
      } else {
        setRetryStorageState("ready");
        setRetryStorageError(
          "Ya existe una emisión pendiente guardada. Recupera su academia, sede y periodo antes de preparar otra."
        );
      }
      return false;
    }

    setRetryStorageState("blocked");
    setRetryStorageError(
      stored.status === "invalid"
        ? "No se puede validar una emisión pendiente guardada. No se enviará otra cuota hasta resolver ese registro."
        : "No se pudo guardar la emisión pendiente de forma segura. No se ha enviado la cuota; habilita el almacenamiento de sesión y vuelve a cargar la página."
    );
    return false;
  }

  function retainUncertainRetry(request: RetryIssue) {
    const uncertain = { ...request, hasAmbiguousAttempt: true };
    persistRetryRequest(uncertain);
    setIssueRetry((current) =>
      isSameIssue(current, request) ? uncertain : current
    );
  }

  // CONCURRENCY_RETRY: the attempt rolled back, so it adds no ambiguity. Keep
  // the same key and content with the ambiguity the command had before it.
  function retainRolledBackRetry(request: RetryIssue) {
    if (!restorePendingMonthlyInvoiceIssueAfterRollback(request)) {
      // Could not lower it in storage: keep it as ambiguous, the safe side.
      retainUncertainRetry(request);
      return;
    }
    setIssueRetry((current) =>
      isSameIssue(current, request) ? request : current
    );
  }

  function clearResolvedRetry(request: RetryIssue): boolean {
    if (clearPendingMonthlyInvoiceIssue(request)) {
      setIssueRetry((current) =>
        isSameIssue(current, request) ? null : current
      );
      setRetryStorageState("ready");
      setRetryStorageError("");
      return true;
    }

    retainUncertainRetry(request);
    setRetryStorageState("blocked");
    setRetryStorageError(
      "La respuesta llegó, pero no se pudo limpiar el reintento guardado. Conservamos la misma clave y el mismo contenido; vuelve a intentarlo antes de preparar otra cuota."
    );
    return false;
  }

  async function sendInvoiceIssue(request: RetryIssue) {
    const uncertainRequest = { ...request, hasAmbiguousAttempt: true };
    if (!persistRetryRequest(uncertainRequest)) {
      setIssueError(
        "No se ha enviado la cuota porque no pudimos conservar de forma segura el mismo reintento."
      );
      return;
    }
    setIssueRetry((current) =>
      isSameIssue(current, request) ? uncertainRequest : current
    );
    setIssueError("");
    setSuccessMessage("");
    setBusy(true);
    try {
      const response = await fetch(
        "/api/v1/owner/billing/monthly-invoices/issue",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "Idempotency-Key": request.key,
          },
          body: JSON.stringify(request.body),
        }
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const code = problemCode(payload);
        const knownPreCommitDomainRejection =
          PRE_COMMIT_MONTHLY_INVOICE_REJECTIONS.includes(code ?? "");
        // The route rejects 4xx before the service or the service transaction rolls back.
        // A later 4xx cannot clear an operation after an ambiguous first attempt.
        const definitiveFirstRejection =
          !request.hasAmbiguousAttempt &&
          ((response.status >= 400 && response.status < 500) ||
            knownPreCommitDomainRejection);
        if (definitiveFirstRejection) {
          clearResolvedRetry(request);
        } else if (code === ROLLED_BACK_MONTHLY_INVOICE_RETRY) {
          retainRolledBackRetry(request);
        } else {
          retainUncertainRetry(request);
        }
        if (
          currentScopeKeyRef.current === request.scopeKey &&
          (code === "QUOTE_STALE" || code === "MONTHLY_INVOICE_BLOCKED")
        ) {
          setQuoteNeedsReview(true);
          setState("loading");
          await loadOptions();
        }
        if (
          currentScopeKeyRef.current === request.scopeKey &&
          (code === "PERIOD_ALREADY_INVOICED" ||
            code === "INVOICE_VOIDED" ||
            code === "ENROLLMENT_ALREADY_BILLED" ||
            code === "FAMILY_PAYER_INVALID" ||
            code === "INVOICE_REFERENCE_TAKEN")
        ) {
          setQuoteNeedsReview(true);
          setState("loading");
          await loadOptions();
        }
        if (currentScopeKeyRef.current === request.scopeKey) {
          setIssueError(
            responseMessage(
              payload,
              "No se ha podido emitir la cuota. Revisa los datos e inténtalo de nuevo."
            )
          );
        }
        return;
      }
      const data = responseData<{
        invoiceId?: string;
        status?: string;
        chargeStatus?: string;
        collectionMode?: string;
      }>(payload);
      if (!isUuid(data?.invoiceId)) {
        throw new Error(
          "La respuesta no confirma qué cuota se emitió. Conservamos la operación para reintentarla con la misma clave."
        );
      }
      clearResolvedRetry(request);
      if (currentScopeKeyRef.current === request.scopeKey) {
        setSuccessMessage(
          data.chargeStatus === "due" && data.collectionMode === "manual"
            ? "Cuota emitida y pendiente de pago. No se ha registrado ni iniciado un pago."
            : "Cuota emitida; no se ha registrado ni iniciado un pago."
        );
        setQuoteNeedsReview(false);
        await loadOptionsRef.current();
      } else {
        setIssueReceipt({
          organizationId: request.body.organizationId,
          locationId: request.body.locationId,
          servicePeriod: request.body.servicePeriod,
          message: "La cuota se emitió correctamente en la operación iniciada para el ámbito original.",
        });
      }
    } catch (error) {
      retainUncertainRetry(request);
      if (currentScopeKeyRef.current === request.scopeKey) {
        setIssueError(
          error instanceof Error
            ? error.message
            : "No se ha podido emitir la cuota."
        );
      }
    } finally {
      setBusy(false);
    }
  }

  async function issueInvoice(command: MonthlyInvoiceIssueBody) {
    if (writesBlocked || busy) return;
    if (retryStorageState !== "ready") {
      setIssueError(
        retryStorageError ||
          "Espera a que se compruebe el almacenamiento seguro antes de emitir."
      );
      return;
    }
    const commandScopeKey = invoiceScopeKey(
      command.organizationId,
      command.locationId,
      command.servicePeriod
    );
    if (
      commandScopeKey !== currentScopeKey ||
      !currentOptions ||
      currentOptions.organizationId !== organizationId ||
      currentOptions.locationId !== locationId ||
      currentOptions.servicePeriod !== servicePeriod
    ) {
      setIssueError(
        "La cotización ya no corresponde a la academia, sede y periodo visibles. Vuelve a cargarla antes de emitir."
      );
      return;
    }
    if (issueRetry) {
      if (
        issueRetry.scopeKey !== currentScopeKey ||
        JSON.stringify(issueRetry.body) !== JSON.stringify(command)
      ) {
        setIssueError(
          "Hay una emisión pendiente de confirmar. Reintenta exactamente esa operación en su ámbito antes de preparar otra."
        );
        return;
      }
      await sendInvoiceIssue(issueRetry);
      return;
    }
    const request: RetryIssue = {
      version: 1,
      key: `owner-monthly-invoice:${crypto.randomUUID()}`,
      body: command,
      scopeKey: commandScopeKey,
      hasAmbiguousAttempt: false,
    };
    if (!persistRetryRequest(request)) return;
    setIssueRetry(request);
    await sendInvoiceIssue(request);
  }

  function replayPendingInvoice() {
    if (!issueRetry || issueRetry.scopeKey !== currentScopeKey || busy) return;
    void sendInvoiceIssue(issueRetry);
  }

  return (
    <>
      <div className="mx-auto grid max-w-4xl gap-5 px-5 pt-6 sm:pt-10">
        <Link
          href={`/owner?${new URLSearchParams({
            organizationId,
            locationId,
          }).toString()}`}
          className={cn(ownerUi.backLink, "w-fit")}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Volver al resumen
        </Link>
        <OwnerOperationalReadOnlyNotice organizationId={organizationId} />
        {locations.length > 1 && (
          <label className="grid max-w-md gap-2">
            <span className="text-sm font-bold">Sede</span>
            <select
              value={locationId}
              onChange={(event) => {
                const nextLocationId = event.target.value;
                setLocationId(nextLocationId);
                replaceInvoiceContext(nextLocationId, servicePeriod);
                setSelectedFamilyId("");
                setState("loading");
                setStateScopeKey(
                  invoiceScopeKey(
                    organizationId,
                    event.target.value,
                    servicePeriod
                  )
                );
                setIssueError("");
                setSuccessMessage("");
              }}
              className={ownerField}
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
              replaceInvoiceContext(locationId, nextPeriod);
              setSelectedFamilyId("");
              setDueDate("");
              if (!isServicePeriod(nextPeriod)) setOptions(undefined);
              setStateScopeKey(
                invoiceScopeKey(organizationId, locationId, nextPeriod)
              );
              setSuccessMessage("");
              setIssueError("");
              setQuoteNeedsReview(false);
              setState(isServicePeriod(nextPeriod) ? "loading" : "empty");
            }}
            className={ownerField}
            aria-describedby="monthly-invoice-period-help"
          />
          <span
            id="monthly-invoice-period-help"
            className="text-xs text-z-soft"
          >
            El total y el desglose llegan calculados por el servidor para este
            periodo.
          </span>
        </label>
      </div>
      {retryStorageError && (
        <p
          role="alert"
          aria-live="assertive"
          className={cn(ownerUi.noticeError, "mx-auto max-w-4xl")}
        >
          {retryStorageError}
        </p>
      )}
      {issueRetry && (
        <div
          role="status"
          className={cn(ownerUi.noticeWarning, "mx-auto grid max-w-4xl gap-3")}
        >
          <p>
            Hay una emisión cuyo resultado sigue sin confirmar. Conservamos su
            academia, sede, periodo, contenido y clave originales.
          </p>
          {issueRetry.scopeKey === currentScopeKey ? (
            <button
              type="button"
              disabled={busy}
              onClick={replayPendingInvoice}
              className={cn(ownerUi.secondaryButton, "w-fit")}
            >
              Reintentar la emisión pendiente
            </button>
          ) : (
            <Link
              className="min-h-11 w-fit content-center font-bold underline underline-offset-2"
              href={`/owner/monthly-invoices?${new URLSearchParams({
                organizationId: issueRetry.body.organizationId,
                locationId: issueRetry.body.locationId,
                servicePeriod: issueRetry.body.servicePeriod,
              }).toString()}`}
            >
              Volver a su academia, sede y periodo
            </Link>
          )}
        </div>
      )}
      {issueReceipt && (
        <div role="status" className={cn(ownerUi.noticeInfo, "mx-auto grid max-w-4xl gap-2")}>
          <p>{issueReceipt.message} La pantalla actual no se ha actualizado.</p>
          <Link
            className="min-h-11 w-fit content-center font-bold underline underline-offset-2"
            href={`/owner/monthly-invoices?${new URLSearchParams({
              organizationId: issueReceipt.organizationId,
              locationId: issueReceipt.locationId,
              servicePeriod: issueReceipt.servicePeriod,
            }).toString()}`}
          >
            Volver al ámbito de la emisión
          </Link>
        </div>
      )}
      <OwnerMonthlyInvoiceWorkspace
        state={workspaceState}
        options={currentOptions}
        selectedFamilyId={selectedFamilyId}
        payerResetKey={payerResetKey}
        dueDate={dueDate}
        errorMessage={workspaceLoadError || issueError}
        successMessage={successMessage}
        quoteNeedsReview={quoteNeedsReview}
        writesBlocked={writesBlocked}
        busy={busy || Boolean(resolutionAction)}
        onFamilyChange={(familyId) => {
          setSelectedFamilyId(familyId);
          setSuccessMessage("");
          setIssueError("");
        }}
        onDueDateChange={setDueDate}
        onRetry={refreshOptions}
        onAssignTariff={(enrollmentId) => {
          const enrollment = currentOptions?.families
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
            ...(currentOptions?.unassignedEnrollments ?? []),
            ...(currentOptions?.families.flatMap((family) => family.enrollments) ??
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
          const family = currentOptions?.families.find(
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
          className={cn(ownerUi.noticeInfo, "mx-auto mt-6 max-w-4xl")}
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
          writesBlocked={writesBlocked}
          locationId={locationId}
          defaultCurrency={defaultCurrency}
          servicePeriodStart={
            currentOptions?.servicePeriodStart ?? `${servicePeriod}-01`
          }
          onCancel={() => setResolutionAction(null)}
          onSaved={handleResolutionSaved}
        />
      )}
      {issueError && (
        <div
          role="alert"
          className="mx-auto -mt-4 max-w-4xl px-5 text-sm font-medium text-signal-ink"
        >
          {issueError}
        </div>
      )}
    </>
  );
}

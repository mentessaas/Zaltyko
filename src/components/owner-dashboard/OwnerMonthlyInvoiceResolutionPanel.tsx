"use client";

import { useRef, useState } from "react";
import { useOwnerPlanPolicy } from "./owner-plan-usage-store";
import {
  displayName,
  isDateValue,
  isUuid,
  parseMonthlyAmountCents,
  primaryButtonClassName,
  problemCode,
  resolutionScopeKey,
  responseData,
  responseMessage,
  secondaryButtonClassName,
  emptyPricePlanDraft,
  type PricePlanOption,
  type ResolutionAction,
} from "./owner-monthly-resolution-model";
import {
  pendingResolutionCommandMatchesStorage,
  type PendingResolutionCommand,
} from "./owner-monthly-resolution-pending-storage";
import {
  useCommittedLayoutEffect,
  useMonthlyPricePlanDraft,
  useMonthlyResolutionCatalog,
  useMonthlyResolutionPendingCommand,
} from "./use-owner-monthly-resolution-state";
import {
  MonthlyResolutionPendingNotice,
  MonthlyResolutionReceiptNotice,
} from "./OwnerMonthlyResolutionNotices";
import {
  MonthlyPricePlanCreateForm,
  MonthlyPricePlanOptionsRetry,
  MonthlyPricePlanSelector,
} from "./OwnerMonthlyResolutionTariffFields";
import { MonthlyResolutionFamilyFields } from "./OwnerMonthlyResolutionFamilyFields";

export type { ResolutionAction } from "./owner-monthly-resolution-model";
export { PENDING_OWNER_MONTHLY_RESOLUTION_STORAGE_KEY } from "./owner-monthly-resolution-pending-storage";


export function OwnerMonthlyInvoiceResolutionPanel({
  action,
  organizationId,
  writesBlocked,
  locationId,
  defaultCurrency,
  servicePeriodStart,
  onCancel,
  onSaved,
}: {
  action: ResolutionAction;
  organizationId: string;
  writesBlocked: boolean;
  locationId: string;
  defaultCurrency: string;
  servicePeriodStart: string;
  onCancel: () => void;
  onSaved: (kind: "tariff" | "family", familyId?: string) => Promise<void>;
}) {
  const planPolicy = useOwnerPlanPolicy(organizationId);
  const blocked = writesBlocked || planPolicy.status !== "ready" || planPolicy.readOnly;
  const actionKey =
    action.kind === "payer"
      ? `payer:${action.familyId}`
      : `${action.kind}:${action.enrollmentId}`;
  const currentScope = {
    organizationId,
    locationId,
    servicePeriod: servicePeriodStart.slice(0, 7),
    actionKey,
  };
  const currentScopeKey = resolutionScopeKey(currentScope);
  const currentScopeKeyRef = useRef(currentScopeKey);
  const payerConfirmationScopeKeyRef = useRef(currentScopeKey);
  const onSavedRef = useRef(onSaved);
  const [primaryPayerConfirmationKey, setPrimaryPayerConfirmationKey] =
    useState<string | null>(null);
  useCommittedLayoutEffect(() => {
    currentScopeKeyRef.current = currentScopeKey;
    onSavedRef.current = onSaved;
    if (payerConfirmationScopeKeyRef.current !== currentScopeKey) {
      payerConfirmationScopeKeyRef.current = currentScopeKey;
      // Scope changes invalidate consent captured for the prior operation.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPrimaryPayerConfirmationKey(null);
    }
  }, [currentScopeKey, onSaved]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selectedPricePlanId, setSelectedPricePlanId] = useState("");
  const [priceStartsOn, setPriceStartsOn] = useState(servicePeriodStart);
  const [effectiveFrom, setEffectiveFrom] = useState(servicePeriodStart);
  const [selectedFamilyId, setSelectedFamilyId] = useState(
    action.kind === "payer" ? action.familyId : ""
  );
  const [selectedPayerId, setSelectedPayerId] = useState("");
  const [athleteIds, setAthleteIds] = useState<string[]>(
    action.kind === "family"
      ? [action.athleteId]
      : action.kind === "payer"
        ? action.athleteIds
        : []
  );
  const [givenName, setGivenName] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [relationship, setRelationship] = useState<
    "parent" | "legal_guardian" | "foster_guardian" | "other"
  >("parent");
  const [commandReceipt, setCommandReceipt] = useState<{
    organizationId: string;
    locationId: string;
    servicePeriod: string;
    message: string;
  } | null>(null);
  const {
    pendingCommandRef,
    pendingCommand,
    pendingStorageReady,
    pendingStorageError,
    setPendingStorageError,
    createPendingCommand,
    clearPendingCommand,
    markPendingCommandAmbiguous,
  } = useMonthlyResolutionPendingCommand({ currentScope, currentScopeKey });
  const {
    pricePlanCreationScopeKey,
    setPricePlanCreationScopeKey,
    setPricePlanDraft,
    pricePlanNotice,
    setPricePlanNotice,
    pricePlanNoticeScope,
    setPricePlanNoticeScope,
    currentPricePlanDraft,
    updatePricePlanDraft,
    selectedCoverageClassIds,
  } = useMonthlyPricePlanDraft({
    currentScopeKey,
    servicePeriodStart,
    pendingCommandRef,
  });
  const {
    setLoading,
    pricePlanOptionsError,
    setPricePlanOptionsError,
    setOptionsRetry,
    setPricePlans,
    classTemplatesHasMore,
    pricePlanOptionsMatchCurrentScope,
    currentLoading,
    currentPricePlans,
    currentClassTemplates,
    currentFamilies,
  } = useMonthlyResolutionCatalog({
    actionKind: action.kind,
    organizationId,
    locationId,
    servicePeriod: currentScope.servicePeriod,
    currentScopeKey,
    servicePeriodStart,
    setError,
    setSelectedPricePlanId,
    setPricePlanDraft,
  });

  function recordLateReceipt(
    command: PendingResolutionCommand,
    message: string
  ) {
    setCommandReceipt({
      organizationId: command.organizationId,
      locationId: command.locationId,
      servicePeriod: command.servicePeriod,
      message,
    });
  }
  const pendingPricePlanCreation =
    pendingCommand?.operation === "create-price-plan" &&
    pendingCommand.scopeKey === currentScopeKey;
  const isCreatingPricePlan =
    pricePlanCreationScopeKey === currentScopeKey || pendingPricePlanCreation;
  const pricePlanFormDisabled =
    busy ||
    !pendingStorageReady ||
    Boolean(pendingStorageError) ||
    pendingCommand !== null;
  const associationFamilyId =
    action.kind === "payer" ? action.familyId : selectedFamilyId;
  const selectedFamily = currentFamilies.find(
    (family) => family.familyId === associationFamilyId
  );
  const selectedFamilyPayer = selectedFamily?.payers.find(
    (payer) => payer.familyPayerId === selectedPayerId
  );
  const primaryPayerWillChange = Boolean(
    associationFamilyId &&
      selectedFamily &&
      (selectedFamilyPayer
        ? !selectedFamilyPayer.isPrimary
        : selectedFamily.payers.some((payer) => payer.isPrimary))
  );
  const currentPayerConfirmationKey = JSON.stringify([
    currentScopeKey,
    associationFamilyId || null,
    selectedFamilyPayer?.familyPayerId ?? null,
    effectiveFrom,
    selectedFamilyPayer ? null : givenName.trim(),
    selectedFamilyPayer ? null : familyName.trim(),
    selectedFamilyPayer ? null : relationship,
  ]);
  const primaryPayerChangeConfirmed =
    primaryPayerConfirmationKey === currentPayerConfirmationKey;
  const canCreatePricePlan =
    !currentLoading &&
    !busy &&
    !blocked &&
    pendingStorageReady &&
    !pendingStorageError &&
    !pendingCommand &&
    !pricePlanOptionsError &&
    pricePlanOptionsMatchCurrentScope &&
    currentClassTemplates.length > 0 &&
    selectedCoverageClassIds.length > 0 &&
    selectedCoverageClassIds.length <= 100 &&
    selectedCoverageClassIds.every((id) =>
      currentClassTemplates.some((classTemplate) => classTemplate.id === id)
    );

  function beginPricePlanCreation() {
    if (pricePlanFormDisabled || currentLoading || blocked) return;
    setError("");
    setPricePlanNotice("");
    setPricePlanDraft(emptyPricePlanDraft(currentScopeKey, servicePeriodStart));
    setPricePlanCreationScopeKey(currentScopeKey);
  }

  function returnToPricePlanSelector() {
    if (pricePlanFormDisabled) return;
    setError("");
    setPricePlanDraft(emptyPricePlanDraft(currentScopeKey, servicePeriodStart));
    setPricePlanCreationScopeKey(null);
  }

  async function sendPendingCommand(
    command: PendingResolutionCommand,
    fallback: string
  ): Promise<{ response: Response; payload: unknown } | null> {
    if (!pendingResolutionCommandMatchesStorage(command)) {
      setPendingStorageError(
        "El marcador guardado no coincide con la operación pendiente. No se enviará otra solicitud."
      );
      setError(
        "No se pudo verificar la operación pendiente en esta sesión. No se ha enviado."
      );
      return null;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(command.endpoint, {
        method: command.method,
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": command.key,
        },
        body: command.serializedBody,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const knownPreCommitDomainRejection =
          command.operation === "create-price-plan" &&
          problemCode(payload) === "MONTHLY_INVOICE_BLOCKED";
        // On a first request, 4xx routes reject before service work or the transaction rolls back.
        // Replays after an ambiguous attempt keep the exact command for any status.
        const definitiveFirstRejection =
          !command.hasAmbiguousAttempt &&
          ((response.status >= 400 && response.status < 500) ||
            knownPreCommitDomainRejection);
        if (definitiveFirstRejection) {
          if (!clearPendingCommand(command)) {
            markPendingCommandAmbiguous(command);
          }
        } else {
          markPendingCommandAmbiguous(command);
        }
        setError(responseMessage(payload, fallback));
        return null;
      }
      return { response, payload };
    } catch {
      markPendingCommandAmbiguous(command);
      setError(
        "No sabemos si se guardó. Conservamos exactamente la operación para reintentarla con la misma clave."
      );
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function createPricePlan() {
    if (
      blocked ||
      currentLoading ||
      !pendingStorageReady ||
      pendingStorageError ||
      pendingCommandRef.current
    ) return;
    if (action.kind !== "tariff") return;
    const name = currentPricePlanDraft.name.trim();
    const amountCents = parseMonthlyAmountCents(currentPricePlanDraft.amount);
    if (!name || name.length > 100 || amountCents === null) {
      setError(
        "Introduce un nombre de hasta 100 caracteres y un importe mensual válido mayor que cero."
      );
      return;
    }
    if (!pricePlanOptionsMatchCurrentScope || pricePlanOptionsError) {
      setError(
        "Vuelve a cargar las opciones de clases de esta academia y sede antes de crear la tarifa."
      );
      return;
    }
    if (
      currentClassTemplates.length === 0 ||
      selectedCoverageClassIds.length === 0 ||
      selectedCoverageClassIds.length > 100 ||
      selectedCoverageClassIds.some(
        (id) =>
          !currentClassTemplates.some((classTemplate) => classTemplate.id === id)
      )
    ) {
      setError("Selecciona al menos una clase activa de esta sede.");
      return;
    }
    if (
      !isDateValue(currentPricePlanDraft.coverageStartsOn) ||
      (!currentPricePlanDraft.coverageHasNoEnd &&
        (!isDateValue(currentPricePlanDraft.coverageEndsOn) ||
          currentPricePlanDraft.coverageEndsOn <
            currentPricePlanDraft.coverageStartsOn))
    ) {
      setError(
        "Indica una vigencia válida: la fecha de inicio es obligatoria y el fin no puede ser anterior."
      );
      return;
    }
    const body = {
      organizationId,
      locationId,
      name,
      amountCents,
      coverage: {
        classTemplateIds: selectedCoverageClassIds,
        startsOn: currentPricePlanDraft.coverageStartsOn,
        endsOn: currentPricePlanDraft.coverageHasNoEnd
          ? null
          : currentPricePlanDraft.coverageEndsOn,
      },
    };
    const command = createPendingCommand(
      "create-price-plan",
      "owner-monthly-price-plan",
      "/api/v1/owner/billing/price-plans",
      "POST",
      body
    );
    if (!command) return;
    setPricePlanNotice("");
    await resolvePendingCommand(command);
  }

  async function saveTariff() {
    if (
      blocked ||
      currentLoading ||
      !pendingStorageReady ||
      pendingStorageError ||
      isCreatingPricePlan ||
      pendingCommandRef.current
    ) return;
    if (
      action.kind !== "tariff" ||
      !currentPricePlans.some((plan) => plan.id === selectedPricePlanId) ||
      !priceStartsOn
    ) {
      setError("Selecciona una tarifa y la fecha desde la que se aplica.");
      return;
    }
    const body = {
      organizationId,
      locationId,
      pricePlanId: selectedPricePlanId,
      startsOn: priceStartsOn,
    };
    const command = createPendingCommand(
      "assign-tariff",
      "owner-price-assignment",
      `/api/v1/owner/enrollments/${encodeURIComponent(action.enrollmentId)}/price-plan`,
      "PATCH",
      body
    );
    if (!command) return;
    await resolvePendingCommand(command);
  }

  async function saveAssociation() {
    if (
      blocked ||
      currentLoading ||
      !pendingStorageReady ||
      pendingStorageError ||
      pendingCommandRef.current
    ) return;
    if (action.kind === "tariff") return;
    const uniqueAthleteIds = [...new Set(athleteIds)];
    if (
      uniqueAthleteIds.length === 0 ||
      !effectiveFrom ||
      (associationFamilyId && !selectedFamily) ||
      (!selectedFamilyPayer && (!givenName.trim() || !familyName.trim()))
    ) {
      setError(
        "Selecciona la familia y las gimnastas, y completa el nombre de la persona pagadora adulta."
      );
      return;
    }
    if (primaryPayerWillChange && !primaryPayerChangeConfirmed) {
      setError("Confirma el cambio de pagador principal antes de continuar.");
      return;
    }
    const body = {
      organizationId,
      locationId,
      ...(associationFamilyId ? { familyId: associationFamilyId } : {}),
      athleteIds: uniqueAthleteIds,
      payer: selectedFamilyPayer
        ? {
            familyPayerId: selectedFamilyPayer.familyPayerId,
            ...(primaryPayerWillChange
              ? { confirmPrimaryPayerChange: true }
              : {}),
          }
        : {
            givenName: givenName.trim(),
            familyName: familyName.trim(),
            relationship,
            ...(primaryPayerWillChange
              ? { confirmPrimaryPayerChange: true }
              : {}),
          },
      effectiveFrom,
    };
    const command = createPendingCommand(
      "associate-family",
      "owner-family-association",
      "/api/v1/owner/families/associations",
      "POST",
      body
    );
    if (!command) return;
    await resolvePendingCommand(command);
  }

  async function resolvePendingCommand(command: PendingResolutionCommand) {
    const result = await sendPendingCommand(
      command,
      "No se pudo confirmar la operación de facturación."
    );
    if (!result) return;
    const data = responseData<Record<string, unknown>>(result.payload);
    if (!data) {
      markPendingCommandAmbiguous(command);
      setError(
        "La respuesta no confirma la operación. Conservamos el body y la clave para reintentarla exactamente."
      );
      return;
    }

    if (command.operation === "create-price-plan") {
      const body = command.body as {
        name: string;
        amountCents: number;
        coverage: { classTemplateIds: string[] };
      };
      const created = data as unknown as PricePlanOption;
      if (
        !isUuid(created.id) ||
        created.name !== body.name ||
        created.amountCents !== body.amountCents ||
        typeof created.currency !== "string" ||
        created.cadence !== "monthly"
      ) {
        markPendingCommandAmbiguous(command);
        setError(
          "La respuesta no confirma la tarifa solicitada. Conservamos el body y la clave para reintentarla exactamente."
        );
        return;
      }
      if (!clearPendingCommand(command)) {
        markPendingCommandAmbiguous(command);
        setError(
          "El servidor confirmó la tarifa, pero no pudimos limpiar el marcador. Conservamos la operación para comprobarla con la misma clave."
        );
        return;
      }
      if (command.scopeKey !== currentScopeKeyRef.current) {
        recordLateReceipt(
          command,
          `La tarifa «${created.name}» se creó correctamente en la operación iniciada para su ámbito original.`
        );
        return;
      }
      setPricePlans((current) => [
        ...current.filter((plan) => plan.id !== created.id),
        created,
      ]);
      setSelectedPricePlanId(created.id);
      setPricePlanDraft(emptyPricePlanDraft(currentScopeKey, servicePeriodStart));
      setPricePlanCreationScopeKey(null);
      setPricePlanNotice(
        `Tarifa creada con cobertura para ${body.coverage.classTemplateIds.length} ${body.coverage.classTemplateIds.length === 1 ? "clase" : "clases"}. Revisa el importe y confirma aparte su asignación a la inscripción.`
      );
      setPricePlanNoticeScope(command.scopeKey);
      setPricePlanOptionsError(false);
      setLoading(true);
      setOptionsRetry((current) => current + 1);
      return;
    }

    if (command.operation === "assign-tariff") {
      const body = command.body as {
        pricePlanId: string;
        startsOn: string;
      };
      if (
        !isUuid(data.id) ||
        action.kind !== "tariff" ||
        data.enrollmentId !== action.enrollmentId ||
        data.pricePlanId !== body.pricePlanId ||
        data.startsOn !== body.startsOn
      ) {
        markPendingCommandAmbiguous(command);
        setError(
          "La respuesta no confirma la asignación solicitada. Conservamos el body y la clave para reintentarla exactamente."
        );
        return;
      }
      if (!clearPendingCommand(command)) {
        markPendingCommandAmbiguous(command);
        setError(
          "El servidor confirmó la asignación, pero no pudimos limpiar el marcador. Conservamos la operación para comprobarla con la misma clave."
        );
        return;
      }
      if (command.scopeKey !== currentScopeKeyRef.current) {
        recordLateReceipt(
          command,
          "La asignación de tarifa se confirmó para la inscripción del ámbito original."
        );
        return;
      }
      await onSavedRef.current("tariff");
      return;
    }

    const familyId = data.familyId;
    if (!isUuid(familyId) || !isUuid(data.familyPayerId)) {
      markPendingCommandAmbiguous(command);
      setError(
        "La respuesta no confirma la relación familiar. Conservamos el body y la clave para reintentarla exactamente."
      );
      return;
    }
    if (!clearPendingCommand(command)) {
      markPendingCommandAmbiguous(command);
      setError(
        "El servidor confirmó el vínculo, pero no pudimos limpiar el marcador. Conservamos la operación para comprobarla con la misma clave."
      );
      return;
    }
    if (command.scopeKey !== currentScopeKeyRef.current) {
      recordLateReceipt(
        command,
        "La relación familiar se confirmó para la operación del ámbito original."
      );
      return;
    }
    await onSavedRef.current("family", familyId);
  }

  function replayPendingCommand() {
    const command = pendingCommandRef.current;
    if (
      !command ||
      command.scopeKey !== currentScopeKey ||
      !pendingStorageReady ||
      Boolean(pendingStorageError) ||
      busy
    ) {
      return;
    }
    void resolvePendingCommand(command);
  }

  const pendingMatchesCurrentScope =
    pendingCommand?.scopeKey === currentScopeKey;


  return (
    <section
      aria-labelledby="owner-monthly-resolution-heading"
      className="rounded-[12px] mx-auto mt-6 grid max-w-4xl gap-4 border border-z-line bg-white p-5 sm:p-7"
    >
      <div>
        <h2 id="owner-monthly-resolution-heading" className="text-xl font-bold">
          {action.kind === "tariff"
            ? `Asignar tarifa a ${displayName(action.athleteName, "la gimnasta")}`
            : action.kind === "family"
              ? `Vincular a ${displayName(action.athleteName, "la gimnasta")} a una familia`
              : "Añadir una persona pagadora adulta"}
        </h2>
        <p className="mt-2 text-sm leading-6 text-z-soft">
          {action.kind === "tariff"
            ? "La tarifa y su importe vienen del catálogo. La fecha de inicio se guarda en el historial de la inscripción."
            : "Selecciona una familia y confirma qué persona adulta será responsable. Solo se solicitan los datos necesarios para esta relación."}
        </p>
      </div>

      {pendingCommand && (
        <MonthlyResolutionPendingNotice
          pendingCommand={pendingCommand}
          matchesCurrentScope={pendingMatchesCurrentScope}
          replayDisabled={busy || !pendingStorageReady || Boolean(pendingStorageError)}
          onReplay={replayPendingCommand}
        />
      )}

      {commandReceipt && (
        <MonthlyResolutionReceiptNotice commandReceipt={commandReceipt} />
      )}

      {pendingStorageError && (
        <p role="alert" className="rounded-[12px] border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          {pendingStorageError}
        </p>
      )}

      {currentLoading && <p role="status">Cargando opciones…</p>}

      {action.kind === "tariff" && !currentLoading && (
        <div className="grid gap-4 sm:grid-cols-2">
          {currentPricePlans.length > 0 && !isCreatingPricePlan ? (
            <MonthlyPricePlanSelector
              pricePlans={currentPricePlans}
              selectedPricePlanId={selectedPricePlanId}
              onSelectPricePlan={(pricePlanId) => {
                setSelectedPricePlanId(pricePlanId);
                setPricePlanNotice("");
              }}
              priceStartsOn={priceStartsOn}
              onPriceStartsOnChange={setPriceStartsOn}
              busy={busy}
              beginCreationDisabled={pricePlanFormDisabled || blocked || currentLoading}
              onBeginCreation={beginPricePlanCreation}
            />
          ) : pricePlanOptionsError ? (
            <MonthlyPricePlanOptionsRetry
              disabled={busy || currentLoading}
              onRetry={() => {
                setError("");
                setLoading(true);
                setPricePlanOptionsError(false);
                setOptionsRetry((current) => current + 1);
              }}
            />
          ) : (
            <MonthlyPricePlanCreateForm
              hasExistingPricePlans={currentPricePlans.length > 0}
              onReturnToSelector={returnToPricePlanSelector}
              formDisabled={pricePlanFormDisabled}
              draft={currentPricePlanDraft}
              onDraftChange={updatePricePlanDraft}
              defaultCurrency={defaultCurrency}
              classTemplates={currentClassTemplates}
              classTemplatesPartial={pricePlanOptionsMatchCurrentScope && classTemplatesHasMore}
              createDisabled={!canCreatePricePlan || pricePlanFormDisabled}
              busy={busy}
              onCreate={() => void createPricePlan()}
            />
          )}
        </div>
      )}

      {pricePlanNotice && pricePlanNoticeScope === currentScopeKey && (
        <p role="status" aria-live="polite" className="text-sm text-z-brand-700">
          {pricePlanNotice}
        </p>
      )}

      {(action.kind === "family" || action.kind === "payer") && !currentLoading && (
        <MonthlyResolutionFamilyFields
          action={action}
          families={currentFamilies}
          selectedFamilyId={selectedFamilyId}
          onSelectFamily={(familyId) => {
            setSelectedFamilyId(familyId);
            setSelectedPayerId("");
            setPrimaryPayerConfirmationKey(null);
          }}
          selectedFamily={selectedFamily}
          athleteIds={athleteIds}
          onToggleAthlete={(athleteId, checked) => {
            setAthleteIds((current) =>
              checked
                ? [...new Set([...current, athleteId])]
                : current.filter((id) => id !== athleteId)
            );
            setPrimaryPayerConfirmationKey(null);
          }}
          selectedPayerId={selectedPayerId}
          onSelectPayer={(familyPayerId) => {
            setSelectedPayerId(familyPayerId);
            setPrimaryPayerConfirmationKey(null);
          }}
          selectedFamilyPayer={selectedFamilyPayer}
          givenName={givenName}
          onGivenNameChange={(value) => {
            setGivenName(value);
            setPrimaryPayerConfirmationKey(null);
          }}
          familyName={familyName}
          onFamilyNameChange={(value) => {
            setFamilyName(value);
            setPrimaryPayerConfirmationKey(null);
          }}
          relationship={relationship}
          onRelationshipChange={(value) => {
            setRelationship(value);
            setPrimaryPayerConfirmationKey(null);
          }}
          primaryPayerWillChange={primaryPayerWillChange}
          primaryPayerChangeConfirmed={primaryPayerChangeConfirmed}
          onPrimaryPayerChangeConfirmed={(confirmed) =>
            setPrimaryPayerConfirmationKey(
              confirmed ? currentPayerConfirmationKey : null
            )
          }
          effectiveFrom={effectiveFrom}
          onEffectiveFromChange={(value) => {
            setEffectiveFrom(value);
            setPrimaryPayerConfirmationKey(null);
          }}
          busy={busy}
        />
      )}
      {error && (
        <p
          role="alert"
          className="rounded-[12px] border border-red-300 bg-red-50 p-3 text-sm text-red-900"
        >
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        {!pendingCommand && action.kind === "tariff" ? (
          <button
            type="button"
            onClick={() => void saveTariff()}
            disabled={
              blocked ||
              busy ||
              currentLoading ||
              isCreatingPricePlan ||
              !pendingStorageReady ||
              Boolean(pendingStorageError) ||
              currentPricePlans.length === 0 ||
              !selectedPricePlanId
            }
            className={primaryButtonClassName}
          >
            {busy ? "Guardando…" : "Guardar tarifa"}
          </button>
        ) : !pendingCommand ? (
          <button
            type="button"
            onClick={() => void saveAssociation()}
            disabled={
              blocked ||
              busy ||
              currentLoading ||
              !pendingStorageReady ||
              Boolean(pendingStorageError) ||
              (primaryPayerWillChange && !primaryPayerChangeConfirmed)
            }
            className={primaryButtonClassName}
          >
            {busy ? "Guardando…" : "Guardar vínculo"}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onCancel}
          disabled={busy || !pendingStorageReady || pendingCommand !== null}
          className={secondaryButtonClassName}
        >
          Cancelar
        </button>
      </div>
    </section>
  );
}

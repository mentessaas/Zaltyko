"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useOwnerPlanPolicy } from "./owner-plan-usage-store";
import { usePendingCommandExitWarning } from "./use-pending-command-exit-warning";

const useCommittedLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

export type ResolutionAction =
  | { kind: "tariff"; enrollmentId: string; athleteName: string | null }
  | {
      kind: "family";
      enrollmentId: string;
      athleteId: string;
      athleteName: string | null;
    }
  | { kind: "payer"; familyId: string; athleteIds: string[] };

type PricePlanOption = {
  id: string;
  name: string;
  amountCents: number;
  currency: string;
  cadence: string;
};

type ClassTemplateOption = {
  id: string;
  name: string;
  effectiveFrom: string;
  effectiveTo: string | null;
};

type PricePlanOptionsResponse = {
  organizationId: string;
  locationId: string;
  items: PricePlanOption[];
  classTemplates: ClassTemplateOption[];
  classTemplatesHasMore: boolean;
};

type FamilyAssociationOption = {
  familyId: string;
  athletes: Array<{ athleteId: string; athleteName: string | null }>;
  payers: Array<{
    familyPayerId: string;
    displayName: string | null;
    isPrimary: boolean;
  }>;
};

type PendingResolutionCommand = {
  scopeKey: string;
  organizationId: string;
  locationId: string;
  servicePeriod: string;
  actionKey: string;
  operation: "create-price-plan" | "assign-tariff" | "associate-family";
  endpoint: string;
  method: "POST" | "PATCH";
  key: string;
  hasAmbiguousAttempt: boolean;
  body: unknown;
  serializedBody: string;
};

function resolutionScopeKey(input: {
  organizationId: string;
  locationId: string;
  servicePeriod: string;
  actionKey: string;
}) {
  return JSON.stringify([
    input.organizationId,
    input.locationId,
    input.servicePeriod,
    input.actionKey,
  ]);
}

function responseData<T>(payload: unknown): T | null {
  if (payload && typeof payload === "object" && "data" in payload) {
    return (payload as { data: T }).data;
  }
  return null;
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  );
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
  if ("code" in payload && typeof payload.code === "string") return payload.code;
  if ("type" in payload && typeof payload.type === "string") {
    return payload.type.split("/").at(-1)?.replaceAll("-", "_").toUpperCase();
  }
  return undefined;
}

function displayName(value: string | null | undefined, fallback: string) {
  return value?.trim() || fallback;
}

function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

function parseMonthlyAmountCents(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const cents = Math.round(Number(normalized) * 100);
  return Number.isSafeInteger(cents) && cents > 0 && cents <= 2_147_483_647
    ? cents
    : null;
}

function isDateValue(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
  );
}

function isClassTemplateOption(value: unknown): value is ClassTemplateOption {
  if (!value || typeof value !== "object") return false;
  const option = value as Partial<ClassTemplateOption>;
  return (
    isUuid(option.id) &&
    typeof option.name === "string" &&
    option.name.trim().length > 0 &&
    isDateValue(option.effectiveFrom) &&
    (option.effectiveTo === null || isDateValue(option.effectiveTo)) &&
    (option.effectiveTo === null || option.effectiveTo >= option.effectiveFrom)
  );
}

const fieldClassName =
  "min-h-11 w-full border border-slate-400 bg-white px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-800";
const primaryButtonClassName =
  "touch-target min-h-11 border border-teal-800 bg-teal-800 px-4 py-2 text-sm font-bold text-white disabled:opacity-50";
const secondaryButtonClassName =
  "touch-target min-h-11 border border-slate-400 bg-white px-4 py-2 text-sm font-semibold text-slate-800 disabled:opacity-50";

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
  const onSavedRef = useRef(onSaved);
  useCommittedLayoutEffect(() => {
    currentScopeKeyRef.current = currentScopeKey;
    onSavedRef.current = onSaved;
  }, [currentScopeKey, onSaved]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pricePlanOptionsError, setPricePlanOptionsError] = useState(false);
  const [optionsRetry, setOptionsRetry] = useState(0);
  const [pricePlans, setPricePlans] = useState<PricePlanOption[]>([]);
  const [classTemplates, setClassTemplates] = useState<ClassTemplateOption[]>(
    []
  );
  const [classTemplatesHasMore, setClassTemplatesHasMore] = useState(false);
  const [pricePlanOptionsScope, setPricePlanOptionsScope] = useState<{
    organizationId: string;
    locationId: string;
    servicePeriod: string;
  } | null>(null);
  const [families, setFamilies] = useState<FamilyAssociationOption[]>([]);
  const [familyOptionsScope, setFamilyOptionsScope] = useState<{
    organizationId: string;
    locationId: string;
    servicePeriod: string;
  } | null>(null);
  const [selectedPricePlanId, setSelectedPricePlanId] = useState("");
  const [newPricePlanName, setNewPricePlanName] = useState("");
  const [newPricePlanAmount, setNewPricePlanAmount] = useState("");
  const [selectedClassTemplateIds, setSelectedClassTemplateIds] = useState<
    string[]
  >([]);
  const [coverageStartsOn, setCoverageStartsOn] = useState(
    `${servicePeriodStart.slice(0, 7)}-01`
  );
  const [coverageHasNoEnd, setCoverageHasNoEnd] = useState(true);
  const [coverageEndsOn, setCoverageEndsOn] = useState("");
  const [pricePlanNotice, setPricePlanNotice] = useState("");
  const [pricePlanNoticeScope, setPricePlanNoticeScope] = useState("");
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
  const pendingCommandRef = useRef<PendingResolutionCommand | null>(null);
  const [pendingCommand, setPendingCommand] =
    useState<PendingResolutionCommand | null>(null);
  const [commandReceipt, setCommandReceipt] = useState<{
    organizationId: string;
    locationId: string;
    servicePeriod: string;
    message: string;
  } | null>(null);
  usePendingCommandExitWarning(pendingCommand !== null, pendingCommandRef);

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
  const selectedCoverageClassIds = [
    ...new Set(selectedClassTemplateIds),
  ].sort();
  const pricePlanOptionsMatchCurrentScope =
    pricePlanOptionsScope?.organizationId === organizationId &&
    pricePlanOptionsScope.locationId === locationId &&
    pricePlanOptionsScope.servicePeriod === currentScope.servicePeriod;
  const familyOptionsMatchCurrentScope =
    familyOptionsScope?.organizationId === organizationId &&
    familyOptionsScope.locationId === locationId &&
    familyOptionsScope.servicePeriod === currentScope.servicePeriod;
  const catalogMatchesCurrentScope =
    action.kind === "tariff"
      ? pricePlanOptionsMatchCurrentScope
      : familyOptionsMatchCurrentScope;
  const currentLoading = loading || !catalogMatchesCurrentScope;
  const currentPricePlans = pricePlanOptionsMatchCurrentScope ? pricePlans : [];
  const currentClassTemplates = pricePlanOptionsMatchCurrentScope
    ? classTemplates
    : [];
  const currentFamilies = familyOptionsMatchCurrentScope ? families : [];
  const canCreatePricePlan =
    !currentLoading &&
    !busy &&
    !blocked &&
    !pricePlanOptionsError &&
    pricePlanOptionsMatchCurrentScope &&
    currentClassTemplates.length > 0 &&
    selectedCoverageClassIds.length > 0 &&
    selectedCoverageClassIds.length <= 100 &&
    selectedCoverageClassIds.every((id) =>
      currentClassTemplates.some((classTemplate) => classTemplate.id === id)
    );

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ organizationId, locationId });
    void (async () => {
      try {
        const endpoint =
          action.kind === "tariff"
            ? `/api/v1/owner/price-plans/options?${params.toString()}`
            : `/api/v1/owner/families/options?${params.toString()}`;
        const response = await fetch(endpoint, { cache: "no-store" });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            responseMessage(
              payload,
              action.kind === "tariff"
                ? "No se pudieron cargar las tarifas disponibles."
                : "No se pudieron cargar las familias disponibles."
            )
          );
        }
        if (action.kind === "tariff") {
          const data = responseData<PricePlanOptionsResponse>(payload);
          if (
            !data ||
            data.organizationId !== organizationId ||
            data.locationId !== locationId
          ) {
            throw new Error(
              "Las opciones recibidas no corresponden a esta academia y sede. Reintenta la carga."
            );
          }
          if (
            !Array.isArray(data.items) ||
            !Array.isArray(data.classTemplates) ||
            data.classTemplates.length > 100 ||
            typeof data.classTemplatesHasMore !== "boolean" ||
            !data.classTemplates.every(isClassTemplateOption) ||
            new Set(data.classTemplates.map((item) => item.id)).size !==
              data.classTemplates.length
          ) {
            throw new Error(
              "La respuesta de tarifas y clases no tiene el formato esperado."
            );
          }
          if (active) {
            setPricePlanOptionsError(false);
            setPricePlans(data.items);
            setSelectedPricePlanId((current) =>
              data.items.some((item) => item.id === current)
                ? current
                : (data.items[0]?.id ?? "")
            );
            setClassTemplates(data.classTemplates);
            setClassTemplatesHasMore(data.classTemplatesHasMore);
            setPricePlanOptionsScope({
              organizationId,
              locationId,
              servicePeriod: currentScope.servicePeriod,
            });
            setSelectedClassTemplateIds((current) =>
              current.filter((id) =>
                data.classTemplates.some((item) => item.id === id)
              )
            );
          }
        } else {
          const data = responseData<{ families: FamilyAssociationOption[] }>(
            payload
          );
          if (!data || !Array.isArray(data.families)) {
            throw new Error(
              "La respuesta de familias no tiene el formato esperado."
            );
          }
          if (active) {
            setFamilies(data.families);
            setFamilyOptionsScope({
              organizationId,
              locationId,
              servicePeriod: currentScope.servicePeriod,
            });
          }
        }
      } catch (cause) {
        if (active) {
          if (action.kind === "tariff") {
            setPricePlanOptionsError(true);
            setPricePlans([]);
            setClassTemplates([]);
            setPricePlanOptionsScope({
              organizationId,
              locationId,
              servicePeriod: currentScope.servicePeriod,
            });
          } else {
            setFamilies([]);
            setFamilyOptionsScope({
              organizationId,
              locationId,
              servicePeriod: currentScope.servicePeriod,
            });
          }
          setError(
            cause instanceof Error
              ? cause.message
              : "No se pudieron cargar las opciones."
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [action.kind, currentScope.servicePeriod, locationId, optionsRetry, organizationId]);

  function createPendingCommand(
    operation: PendingResolutionCommand["operation"],
    prefix: string,
    endpoint: string,
    method: PendingResolutionCommand["method"],
    body: unknown
  ) {
    if (pendingCommandRef.current) return null;
    const command: PendingResolutionCommand = {
      ...currentScope,
      scopeKey: currentScopeKey,
      operation,
      endpoint,
      method,
      key: `${prefix}:${crypto.randomUUID()}`,
      hasAmbiguousAttempt: false,
      body,
      serializedBody: JSON.stringify(body),
    };
    pendingCommandRef.current = command;
    setPendingCommand(command);
    return command;
  }

  function clearPendingCommand(command: PendingResolutionCommand) {
    if (pendingCommandRef.current?.key !== command.key) return;
    pendingCommandRef.current = null;
    setPendingCommand(null);
  }

  function markPendingCommandAmbiguous(command: PendingResolutionCommand) {
    const current = pendingCommandRef.current;
    if (current?.key !== command.key || current.hasAmbiguousAttempt) return;
    const updated = { ...current, hasAmbiguousAttempt: true };
    pendingCommandRef.current = updated;
    setPendingCommand(updated);
  }

  async function sendPendingCommand(
    command: PendingResolutionCommand,
    fallback: string
  ): Promise<{ response: Response; payload: unknown } | null> {
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
          clearPendingCommand(command);
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
    if (blocked || currentLoading || pendingCommandRef.current) return;
    if (action.kind !== "tariff") return;
    const name = newPricePlanName.trim();
    const amountCents = parseMonthlyAmountCents(newPricePlanAmount);
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
      !isDateValue(coverageStartsOn) ||
      (!coverageHasNoEnd &&
        (!isDateValue(coverageEndsOn) || coverageEndsOn < coverageStartsOn))
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
        startsOn: coverageStartsOn,
        endsOn: coverageHasNoEnd ? null : coverageEndsOn,
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
    if (blocked || currentLoading || pendingCommandRef.current) return;
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
    if (blocked || currentLoading || pendingCommandRef.current) return;
    if (action.kind === "tariff") return;
    const familyId =
      action.kind === "payer" ? action.familyId : selectedFamilyId;
    const uniqueAthleteIds = [...new Set(athleteIds)];
    const selectedFamily = currentFamilies.find(
      (family) => family.familyId === familyId
    );
    const existingPayerId = selectedFamily?.payers.some(
      (payer) => payer.familyPayerId === selectedPayerId
    )
      ? selectedPayerId
      : "";
    if (
      uniqueAthleteIds.length === 0 ||
      !effectiveFrom ||
      (!existingPayerId && (!givenName.trim() || !familyName.trim()))
    ) {
      setError(
        "Selecciona la familia y las gimnastas, y completa el nombre de la persona pagadora adulta."
      );
      return;
    }
    const body = {
      organizationId,
      locationId,
      ...(familyId ? { familyId } : {}),
      athleteIds: uniqueAthleteIds,
      payer: existingPayerId
        ? { familyPayerId: existingPayerId }
        : {
            givenName: givenName.trim(),
            familyName: familyName.trim(),
            relationship,
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
      clearPendingCommand(command);
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
      setNewPricePlanName("");
      setNewPricePlanAmount("");
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
      clearPendingCommand(command);
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
    clearPendingCommand(command);
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
      busy
    ) {
      return;
    }
    void resolvePendingCommand(command);
  }

  const selectedFamily = currentFamilies.find(
    (family) => family.familyId === selectedFamilyId
  );
  const pendingMatchesCurrentScope =
    pendingCommand?.scopeKey === currentScopeKey;

  return (
    <section
      aria-labelledby="owner-monthly-resolution-heading"
      className="mx-auto mt-6 grid max-w-4xl gap-4 border border-slate-300 bg-white p-5 sm:p-7"
    >
      <div>
        <h2 id="owner-monthly-resolution-heading" className="text-xl font-bold">
          {action.kind === "tariff"
            ? `Asignar tarifa a ${displayName(action.athleteName, "la gimnasta")}`
            : action.kind === "family"
              ? `Vincular a ${displayName(action.athleteName, "la gimnasta")} a una familia`
              : "Añadir una persona pagadora adulta"}
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {action.kind === "tariff"
            ? "La tarifa y su importe vienen del catálogo. La fecha de inicio se guarda en el historial de la inscripción."
            : "Selecciona una familia y confirma qué persona adulta será responsable. Solo se solicitan los datos necesarios para esta relación."}
        </p>
      </div>

      {pendingCommand && (
        <div
          role="status"
          className="grid gap-3 border border-amber-500 bg-amber-50 p-4 text-sm text-amber-950"
        >
          <p>
            Hay una operación de facturación cuyo resultado sigue sin
            confirmar. Conservamos su academia, sede, periodo, endpoint, body y
            clave originales. No iniciaremos otra operación desde este panel.
          </p>
          {pendingMatchesCurrentScope ? (
            <button
              type="button"
              disabled={busy}
              onClick={replayPendingCommand}
              className={`${primaryButtonClassName} w-fit`}
            >
              Reintentar la misma operación
            </button>
          ) : (
            <Link
              className="min-h-11 w-fit content-center font-bold underline underline-offset-2"
              href={`/owner/monthly-invoices?${new URLSearchParams({
                organizationId: pendingCommand.organizationId,
                locationId: pendingCommand.locationId,
                servicePeriod: pendingCommand.servicePeriod,
              }).toString()}`}
            >
              Volver a su academia, sede y periodo
            </Link>
          )}
        </div>
      )}

      {commandReceipt && (
        <div role="status" className="grid gap-2 border border-teal-300 bg-teal-50 p-4 text-sm text-teal-950">
          <p>{commandReceipt.message} No hemos cambiado el catálogo de la vista actual.</p>
          <Link
            className="min-h-11 w-fit content-center font-bold underline underline-offset-2"
            href={`/owner/monthly-invoices?${new URLSearchParams({
              organizationId: commandReceipt.organizationId,
              locationId: commandReceipt.locationId,
              servicePeriod: commandReceipt.servicePeriod,
            }).toString()}`}
          >
            Volver al ámbito de la operación
          </Link>
        </div>
      )}

      {currentLoading && <p role="status">Cargando opciones…</p>}

      {action.kind === "tariff" && !currentLoading && (
        <div className="grid gap-4 sm:grid-cols-2">
          {currentPricePlans.length > 0 ? (
            <>
              <label className="grid gap-2">
                <span className="text-sm font-bold">Tarifa mensual</span>
                <select
                  value={selectedPricePlanId}
                  onChange={(event) => {
                    setSelectedPricePlanId(event.target.value);
                    setPricePlanNotice("");
                  }}
                  disabled={busy}
                  className={fieldClassName}
                  required
                >
                  <option value="">Selecciona una tarifa</option>
                  {currentPricePlans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name} ·{" "}
                      {formatMoney(plan.amountCents, plan.currency)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-bold">Vigente desde</span>
                <input
                  type="date"
                  value={priceStartsOn}
                  onChange={(event) => setPriceStartsOn(event.target.value)}
                  disabled={busy}
                  required
                  className={fieldClassName}
                />
              </label>
            </>
          ) : pricePlanOptionsError ? (
            <div className="grid gap-3 sm:col-span-2">
              <p className="text-sm leading-6 text-slate-600">
                No se pudieron comprobar las tarifas y clases activas de esta
                sede. Reintenta antes de crear una nueva.
              </p>
              <button
                type="button"
                onClick={() => {
                  setError("");
                  setLoading(true);
                  setPricePlanOptionsError(false);
                  setOptionsRetry((current) => current + 1);
                }}
                disabled={busy || currentLoading}
                className={`${secondaryButtonClassName} w-fit`}
              >
                Reintentar cargar tarifas
              </button>
            </div>
          ) : (
            <div className="grid gap-4 sm:col-span-2">
              <p className="text-sm leading-6 text-slate-600">
                No hay tarifas mensuales para esta sede. Crea una para poder
                asignarla a la inscripción y selecciona las clases que cubrirá.
              </p>
              <label className="grid gap-2">
                <span className="text-sm font-bold">Nombre de la tarifa</span>
                <input
                  value={newPricePlanName}
                  onChange={(event) => setNewPricePlanName(event.target.value)}
                  maxLength={100}
                  disabled={busy}
                  required
                  className={fieldClassName}
                />
              </label>
              <div className="grid max-w-md gap-2">
                <label
                  htmlFor="monthly-price-plan-amount"
                  className="text-sm font-bold"
                >
                  Importe mensual ({defaultCurrency})
                </label>
                <input
                  id="monthly-price-plan-amount"
                  type="text"
                  inputMode="decimal"
                  value={newPricePlanAmount}
                  onChange={(event) =>
                    setNewPricePlanAmount(event.target.value)
                  }
                  placeholder="35,00"
                  disabled={busy}
                  required
                  aria-describedby="monthly-price-plan-amount-help"
                  className={fieldClassName}
                />
                <p
                  id="monthly-price-plan-amount-help"
                  className="text-xs text-slate-600"
                >
                  Se usará {defaultCurrency}, la moneda de la academia. Puedes
                  usar coma o punto decimal; la tarifa será mensual.
                </p>
              </div>
              <fieldset
                aria-describedby="monthly-price-plan-coverage-help"
                className="grid gap-3 border border-slate-300 p-4"
              >
                <legend className="px-1 text-sm font-bold">
                  Clases cubiertas
                </legend>
                <p
                  id="monthly-price-plan-coverage-help"
                  className="text-sm leading-6 text-slate-600"
                >
                  Marca cada clase activa a la que se aplicará esta tarifa. No
                  se incluirán otras clases automáticamente.
                </p>
                {currentClassTemplates.length === 0 ? (
                  <p role="status" className="text-sm text-slate-700">
                    No hay clases activas disponibles en esta sede. No se puede
                    crear una tarifa sin cobertura explícita.
                  </p>
                ) : (
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {currentClassTemplates.map((classTemplate) => {
                      const checkboxId = `monthly-price-plan-class-${classTemplate.id}`;

                      return (
                        <li key={classTemplate.id}>
                          <label
                            htmlFor={checkboxId}
                            className="flex min-h-11 items-center gap-3 border border-slate-200 px-3 py-2 text-sm font-medium text-slate-900 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-teal-800"
                          >
                            <input
                              id={checkboxId}
                              type="checkbox"
                              checked={selectedClassTemplateIds.includes(
                                classTemplate.id
                              )}
                              onChange={(event) => {
                                setSelectedClassTemplateIds((current) =>
                                  event.target.checked
                                    ? current.includes(classTemplate.id)
                                      ? current
                                      : [...current, classTemplate.id]
                                    : current.filter(
                                        (id) => id !== classTemplate.id
                                      )
                                );
                              }}
                              disabled={busy}
                              className="size-5 shrink-0 accent-teal-800"
                            />
                            <span className="min-w-0">
                              {classTemplate.name}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {pricePlanOptionsMatchCurrentScope && classTemplatesHasMore && (
                  <p role="status" className="text-sm text-amber-900">
                    Hay más de 100 clases activas. La lista es parcial; solo se
                    cubrirán las clases que marques aquí.
                  </p>
                )}
              </fieldset>
              <div className="grid gap-3 sm:grid-cols-2">
                <label
                  htmlFor="monthly-price-plan-coverage-starts"
                  className="grid gap-2"
                >
                  <span className="text-sm font-bold">Vigente desde</span>
                  <input
                    id="monthly-price-plan-coverage-starts"
                    type="date"
                    value={coverageStartsOn}
                    onChange={(event) =>
                      setCoverageStartsOn(event.target.value)
                    }
                    disabled={busy}
                    required
                    className={fieldClassName}
                  />
                </label>
                <label className="flex min-h-11 items-center gap-3 text-sm font-medium text-slate-900">
                  <input
                    type="checkbox"
                    checked={coverageHasNoEnd}
                    onChange={(event) =>
                      setCoverageHasNoEnd(event.target.checked)
                    }
                    disabled={busy}
                    className="size-5 shrink-0 accent-teal-800"
                  />
                  <span>Sin fecha de fin</span>
                </label>
                {!coverageHasNoEnd && (
                  <label
                    htmlFor="monthly-price-plan-coverage-ends"
                    className="grid gap-2 sm:col-span-2"
                  >
                    <span className="text-sm font-bold">Vigente hasta</span>
                    <input
                      id="monthly-price-plan-coverage-ends"
                      type="date"
                      value={coverageEndsOn}
                      onChange={(event) =>
                        setCoverageEndsOn(event.target.value)
                      }
                      disabled={busy}
                      required
                      aria-describedby="monthly-price-plan-coverage-dates-help"
                      className={fieldClassName}
                    />
                    <span
                      id="monthly-price-plan-coverage-dates-help"
                      className="text-xs text-slate-600"
                    >
                      La fecha de fin debe ser igual o posterior al inicio.
                    </span>
                  </label>
                )}
              </div>
              <button
                type="button"
                onClick={() => void createPricePlan()}
                disabled={!canCreatePricePlan}
                className={`${primaryButtonClassName} w-fit`}
              >
                {busy ? "Guardando…" : "Crear tarifa mensual"}
              </button>
            </div>
          )}
        </div>
      )}

      {pricePlanNotice && pricePlanNoticeScope === currentScopeKey && (
        <p role="status" aria-live="polite" className="text-sm text-teal-900">
          {pricePlanNotice}
        </p>
      )}

      {(action.kind === "family" || action.kind === "payer") && !currentLoading && (
        <div className="grid gap-4">
          {action.kind === "family" ? (
            <label className="grid gap-2">
              <span className="text-sm font-bold">Familia</span>
              <select
                value={selectedFamilyId}
                onChange={(event) => {
                  setSelectedFamilyId(event.target.value);
                  setSelectedPayerId("");
                }}
                disabled={busy}
                className={fieldClassName}
              >
                <option value="">Crear una familia nueva</option>
                {currentFamilies.map((family) => (
                  <option key={family.familyId} value={family.familyId}>
                    {family.athletes.length
                      ? family.athletes
                          .map((athlete) =>
                            displayName(
                              athlete.athleteName,
                              "Gimnasta sin nombre"
                            )
                          )
                          .join(", ")
                      : "Familia sin gimnastas asociadas"}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="text-sm font-semibold">
              Familia:{" "}
              {selectedFamily?.athletes
                .map((athlete) =>
                  displayName(athlete.athleteName, "Gimnasta sin nombre")
                )
                .join(", ") || "Familia seleccionada"}
            </p>
          )}

          {action.kind === "payer" &&
            currentFamilies
              .find((family) => family.familyId === action.familyId)
              ?.athletes.map((athlete) => (
                <label
                  key={athlete.athleteId}
                  className="flex min-h-11 items-center gap-3 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={athleteIds.includes(athlete.athleteId)}
                    onChange={(event) =>
                      setAthleteIds((current) =>
                        event.target.checked
                          ? [...new Set([...current, athlete.athleteId])]
                          : current.filter((id) => id !== athlete.athleteId)
                      )
                    }
                    disabled={busy}
                    className="h-5 w-5 accent-teal-800"
                  />
                  {displayName(athlete.athleteName, "Gimnasta sin nombre")}
                </label>
              ))}

          {selectedFamily?.payers.length ? (
            <label className="grid gap-2">
              <span className="text-sm font-bold">Persona pagadora</span>
              <select
                value={selectedPayerId}
                onChange={(event) => setSelectedPayerId(event.target.value)}
                disabled={busy}
                className={fieldClassName}
              >
                <option value="">Añadir persona adulta nueva</option>
                {selectedFamily.payers.map((payer) => (
                  <option key={payer.familyPayerId} value={payer.familyPayerId}>
                    {displayName(
                      payer.displayName,
                      "Persona pagadora sin nombre"
                    )}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {!selectedPayerId && (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-sm font-bold">
                  Nombre de la persona adulta
                </span>
                <input
                  value={givenName}
                  onChange={(event) => setGivenName(event.target.value)}
                  disabled={busy}
                  required
                  maxLength={100}
                  className={fieldClassName}
                />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-bold">Apellidos</span>
                <input
                  value={familyName}
                  onChange={(event) => setFamilyName(event.target.value)}
                  disabled={busy}
                  required
                  maxLength={100}
                  className={fieldClassName}
                />
              </label>
              <label className="grid gap-2 sm:col-span-2">
                <span className="text-sm font-bold">
                  Relación con la gimnasta
                </span>
                <select
                  value={relationship}
                  onChange={(event) =>
                    setRelationship(event.target.value as typeof relationship)
                  }
                  disabled={busy}
                  className={fieldClassName}
                >
                  <option value="parent">Madre o padre</option>
                  <option value="legal_guardian">Tutor/a legal</option>
                  <option value="foster_guardian">Acogedor/a</option>
                  <option value="other">Otra relación autorizada</option>
                </select>
              </label>
            </div>
          )}

          <label className="grid max-w-md gap-2">
            <span className="text-sm font-bold">Fecha efectiva</span>
            <input
              type="date"
              value={effectiveFrom}
              onChange={(event) => setEffectiveFrom(event.target.value)}
              disabled={busy}
              required
              className={fieldClassName}
              aria-describedby="family-association-effective-help"
            />
            <span
              id="family-association-effective-help"
              className="text-xs text-slate-600"
            >
              La fecha sugerida es el primer día del periodo; se usará para
              comprobar la cobertura mensual. Confírmala o ajústala antes de
              guardar.
            </span>
          </label>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="border border-red-300 bg-red-50 p-3 text-sm text-red-900"
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
              blocked || busy || currentLoading || currentPricePlans.length === 0 || !selectedPricePlanId
            }
            className={primaryButtonClassName}
          >
            {busy ? "Guardando…" : "Guardar tarifa"}
          </button>
        ) : !pendingCommand ? (
          <button
            type="button"
            onClick={() => void saveAssociation()}
            disabled={blocked || busy || currentLoading}
            className={primaryButtonClassName}
          >
            {busy ? "Guardando…" : "Guardar vínculo"}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onCancel}
          disabled={busy || pendingCommand !== null}
          className={secondaryButtonClassName}
        >
          Cancelar
        </button>
      </div>
    </section>
  );
}

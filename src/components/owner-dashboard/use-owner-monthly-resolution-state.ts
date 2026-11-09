"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { usePendingCommandExitWarning } from "./use-pending-command-exit-warning";
import {
  emptyPricePlanDraft,
  isClassTemplateOption,
  responseData,
  responseMessage,
  type ClassTemplateOption,
  type FamilyAssociationOption,
  type PricePlanDraft,
  type PricePlanOption,
  type PricePlanOptionsResponse,
  type ResolutionAction,
} from "./owner-monthly-resolution-model";
import {
  clearPendingResolutionCommand,
  persistPendingResolutionCommand,
  readPendingResolutionCommand,
  type PendingResolutionCommand,
} from "./owner-monthly-resolution-pending-storage";

export const useCommittedLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

type ResolutionScope = {
  organizationId: string;
  locationId: string;
  servicePeriod: string;
  actionKey: string;
};

/**
 * Billing command awaiting its result: restored from sessionStorage after a
 * remount (marked ambiguous, never resent automatically), created, cleared or
 * marked ambiguous with read-back verification. Sending stays in the panel.
 */
export function useMonthlyResolutionPendingCommand({
  currentScope,
  currentScopeKey,
}: {
  currentScope: ResolutionScope;
  currentScopeKey: string;
}) {
  const pendingCommandRef = useRef<PendingResolutionCommand | null>(null);
  const [pendingCommand, setPendingCommand] =
    useState<PendingResolutionCommand | null>(null);
  const [pendingStorageReady, setPendingStorageReady] = useState(false);
  const [pendingStorageError, setPendingStorageError] = useState("");
  usePendingCommandExitWarning(pendingCommand !== null, pendingCommandRef);

  useEffect(() => {
    const stored = readPendingResolutionCommand();
    if (stored.kind === "none") {
      setPendingStorageReady(true);
      return;
    }
    if (stored.kind === "unavailable") {
      setPendingStorageError(
        "No podemos leer el marcador seguro de esta sesión. No se enviarán cambios desde este panel."
      );
      setPendingStorageReady(true);
      return;
    }
    if (stored.kind === "invalid") {
      setPendingStorageError(
        "El marcador de una operación anterior no supera la validación. No se enviarán cambios desde este panel."
      );
      setPendingStorageReady(true);
      return;
    }

    // After a remount, the request may or may not have reached the server.
    // Upgrade only metadata; the exact serialized body and idempotency key stay fixed.
    const restored = { ...stored.command, hasAmbiguousAttempt: true };
    pendingCommandRef.current = restored;
    setPendingCommand(restored);
    if (!persistPendingResolutionCommand(restored, { allowAmbiguousUpgrade: true })) {
      setPendingStorageError(
        "No pudimos releer y verificar la operación pendiente. Conservamos el marcador y no la reenviaremos."
      );
    }
    setPendingStorageReady(true);
  }, []);

  function createPendingCommand(
    operation: PendingResolutionCommand["operation"],
    prefix: string,
    endpoint: string,
    method: PendingResolutionCommand["method"],
    body: unknown
  ) {
    if (
      !pendingStorageReady ||
      pendingStorageError ||
      pendingCommandRef.current
    ) return null;
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
    if (!persistPendingResolutionCommand(command, { allowCreate: true })) {
      setPendingStorageError(
        "No pudimos guardar y releer la operación exacta en esta sesión. No se enviará."
      );
      return null;
    }
    pendingCommandRef.current = command;
    setPendingCommand(command);
    return command;
  }

  function clearPendingCommand(command: PendingResolutionCommand) {
    if (
      pendingCommandRef.current?.key !== command.key ||
      !clearPendingResolutionCommand(command)
    ) {
      setPendingStorageError(
        "No pudimos verificar ni limpiar el marcador pendiente. Se conserva la operación para evitar duplicados."
      );
      return false;
    }
    pendingCommandRef.current = null;
    setPendingCommand(null);
    return true;
  }

  function markPendingCommandAmbiguous(command: PendingResolutionCommand) {
    const current = pendingCommandRef.current;
    if (current?.key !== command.key) return;
    const updated = current.hasAmbiguousAttempt
      ? current
      : { ...current, hasAmbiguousAttempt: true };
    if (updated !== current) {
      pendingCommandRef.current = updated;
      setPendingCommand(updated);
    }
    if (!persistPendingResolutionCommand(updated, {
      allowCreate: true,
      allowAmbiguousUpgrade: true,
    })) {
      setPendingStorageError(
        "No pudimos persistir la incertidumbre de la operación. No se permitirá reenviarla desde este panel."
      );
    }
  }

  return {
    pendingCommandRef,
    pendingCommand,
    pendingStorageReady,
    pendingStorageError,
    setPendingStorageError,
    createPendingCommand,
    clearPendingCommand,
    markPendingCommandAmbiguous,
  };
}

/**
 * Draft of a new monthly price plan, scoped to the current academy, site,
 * period and action. A new scope gets an empty draft unless a command is pending.
 */
export function useMonthlyPricePlanDraft({
  currentScopeKey,
  servicePeriodStart,
  pendingCommandRef,
}: {
  currentScopeKey: string;
  servicePeriodStart: string;
  pendingCommandRef: { readonly current: PendingResolutionCommand | null };
}) {
  const [pricePlanCreationScopeKey, setPricePlanCreationScopeKey] =
    useState<string | null>(null);
  const [pricePlanDraft, setPricePlanDraft] = useState<PricePlanDraft>(() =>
    emptyPricePlanDraft(currentScopeKey, servicePeriodStart)
  );
  const [pricePlanNotice, setPricePlanNotice] = useState("");
  const [pricePlanNoticeScope, setPricePlanNoticeScope] = useState("");
  const pricePlanDraftScopeKeyRef = useRef(currentScopeKey);

  useCommittedLayoutEffect(() => {
    if (pricePlanDraftScopeKeyRef.current === currentScopeKey) return;
    pricePlanDraftScopeKeyRef.current = currentScopeKey;
    if (pendingCommandRef.current !== null) return;
    // A new scope gets an empty draft; uncertain commands remain stored separately.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPricePlanDraft(emptyPricePlanDraft(currentScopeKey, servicePeriodStart));
    setPricePlanCreationScopeKey(null);
    setPricePlanNotice("");
    setPricePlanNoticeScope("");
  }, [currentScopeKey, servicePeriodStart]);

  const currentPricePlanDraft =
    pricePlanDraft.scopeKey === currentScopeKey
      ? pricePlanDraft
      : emptyPricePlanDraft(currentScopeKey, servicePeriodStart);
  function updatePricePlanDraft(
    updates: Partial<Omit<PricePlanDraft, "scopeKey">>
  ) {
    setPricePlanDraft((current) => ({
      ...(current.scopeKey === currentScopeKey
        ? current
        : emptyPricePlanDraft(currentScopeKey, servicePeriodStart)),
      ...updates,
      scopeKey: currentScopeKey,
    }));
  }
  const selectedCoverageClassIds = [
    ...new Set(currentPricePlanDraft.classTemplateIds),
  ].sort();

  return {
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
  };
}

/**
 * Price plans and class templates (tariff actions) or families (family and
 * payer actions) for the current academy, site and period. Responses from
 * another scope are never shown.
 */
export function useMonthlyResolutionCatalog({
  actionKind,
  organizationId,
  locationId,
  servicePeriod,
  currentScopeKey,
  servicePeriodStart,
  setError,
  setSelectedPricePlanId,
  setPricePlanDraft,
}: {
  actionKind: ResolutionAction["kind"];
  organizationId: string;
  locationId: string;
  servicePeriod: string;
  currentScopeKey: string;
  servicePeriodStart: string;
  setError: Dispatch<SetStateAction<string>>;
  setSelectedPricePlanId: Dispatch<SetStateAction<string>>;
  setPricePlanDraft: Dispatch<SetStateAction<PricePlanDraft>>;
}) {
  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ organizationId, locationId });
    void (async () => {
      try {
        const endpoint =
          actionKind === "tariff"
            ? `/api/v1/owner/price-plans/options?${params.toString()}`
            : `/api/v1/owner/families/options?${params.toString()}`;
        const response = await fetch(endpoint, { cache: "no-store" });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            responseMessage(
              payload,
              actionKind === "tariff"
                ? "No se pudieron cargar las tarifas disponibles."
                : "No se pudieron cargar las familias disponibles."
            )
          );
        }
        if (actionKind === "tariff") {
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
              servicePeriod: servicePeriod,
            });
            setPricePlanDraft((current) => {
              const draft =
                current.scopeKey === currentScopeKey
                  ? current
                  : emptyPricePlanDraft(currentScopeKey, servicePeriodStart);
              return {
                ...draft,
                classTemplateIds: draft.classTemplateIds.filter((id) =>
                  data.classTemplates.some((item) => item.id === id)
                ),
              };
            });
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
              servicePeriod: servicePeriod,
            });
          }
        }
      } catch (cause) {
        if (active) {
          if (actionKind === "tariff") {
            setPricePlanOptionsError(true);
            setPricePlans([]);
            setClassTemplates([]);
            setPricePlanOptionsScope({
              organizationId,
              locationId,
              servicePeriod: servicePeriod,
            });
          } else {
            setFamilies([]);
            setFamilyOptionsScope({
              organizationId,
              locationId,
              servicePeriod: servicePeriod,
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
  }, [
    actionKind,
    servicePeriod,
    currentScopeKey,
    locationId,
    optionsRetry,
    organizationId,
    servicePeriodStart,
  ]);

  const pricePlanOptionsMatchCurrentScope =
    pricePlanOptionsScope?.organizationId === organizationId &&
    pricePlanOptionsScope.locationId === locationId &&
    pricePlanOptionsScope.servicePeriod === servicePeriod;
  const familyOptionsMatchCurrentScope =
    familyOptionsScope?.organizationId === organizationId &&
    familyOptionsScope.locationId === locationId &&
    familyOptionsScope.servicePeriod === servicePeriod;
  const catalogMatchesCurrentScope =
    actionKind === "tariff"
      ? pricePlanOptionsMatchCurrentScope
      : familyOptionsMatchCurrentScope;
  const currentLoading = loading || !catalogMatchesCurrentScope;
  const currentPricePlans = pricePlanOptionsMatchCurrentScope ? pricePlans : [];
  const currentClassTemplates = pricePlanOptionsMatchCurrentScope
    ? classTemplates
    : [];
  const currentFamilies = familyOptionsMatchCurrentScope ? families : [];

  return {
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
  };
}

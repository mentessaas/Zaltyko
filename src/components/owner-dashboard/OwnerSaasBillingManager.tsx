"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePendingCommandExitWarning } from "./use-pending-command-exit-warning";
import { isCheckoutSessionUrl, isPortalSessionUrl } from "./owner-saas-session-url";
import { isSaasTimestamp } from "./owner-saas-timestamp";
import { OwnerPlanUsage } from "./OwnerPlanUsage";
import { decodeOwnerSaasBillingSnapshot } from "./owner-saas-billing-response";
import { isDefinitiveSaasCommandRejection } from "./owner-saas-command-rejection";
import { clearStoredSaasCommand, persistStoredSaasCommand, readStoredSaasCommand, saasCommandStorageKey } from "./owner-saas-pending-command";
import {
  formatSaasAccessDate as formatDate,
  saasPaymentNotice,
} from "./owner-saas-presentation";

import {
  formatPlanAmount,
  PRODUCT_PLAN_BY_CODE,
  getProductPlanPublicName,
} from "@/lib/plans/catalog";

import type {
  OwnerSaasBillingInterval,
  OwnerSaasBillingSnapshot,
  OwnerSaasCheckoutResult,
  OwnerSaasPlanCode,
  OwnerSaasPortalResult,
  OwnerSaasTrialResult,
} from "./owner-saas-billing-types";

const useCommittedLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

type LoadState =
  | { organizationId: string; status: "loading" }
  | { organizationId: string; status: "ready" }
  | { organizationId: string; status: "error"; message: string };

type PendingCheckout = OwnerSaasCheckoutResult & { organizationId: string };
type PendingPortal = OwnerSaasPortalResult & { organizationId: string };
type ActionMessage = { organizationId: string; message: string };
type RequestIntent = {
  key: string;
  storageKey: string;
  body: Record<string, unknown>;
  serializedBody: string;
  hasPriorAttempt: boolean;
};
type PendingCommand = {
  organizationId: string;
  action: "checkout" | "portal" | "trial";
  planCode?: "starter" | "growth";
  intent: RequestIntent;
};
class SaasCommandError extends Error {
  constructor(message: string, readonly definitive: boolean) { super(message); }
}

const CHECKOUT_ENDPOINT = "/api/v1/owner/saas/checkout";
const PORTAL_ENDPOINT = "/api/v1/owner/saas/portal";
const TRIAL_ENDPOINT = "/api/v1/owner/saas/trial/start";
const BILLING_ENDPOINT = "/api/v1/owner/saas/billing";

function responseData<T>(payload: unknown): T | null {
  if (
    !payload ||
    typeof payload !== "object" ||
    !("ok" in payload) ||
    (payload as { ok?: unknown }).ok !== true ||
    !("data" in payload)
  ) {
    return null;
  }
  return (payload as { data: T }).data;
}

function responseCode(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  if ("code" in payload && typeof payload.code === "string") {
    return payload.code;
  }
  if ("error" in payload && typeof payload.error === "string") return payload.error;
  if ("error" in payload && payload.error && typeof payload.error === "object") {
    const error = payload.error as Record<string, unknown>;
    if (typeof error.code === "string") return error.code;
  }
  return undefined;
}

function apiErrorMessage(payload: unknown, fallback: string): string {
  const code = responseCode(payload);
  const known: Record<string, string> = {
    UNAUTHENTICATED: "Tu sesión ha caducado. Vuelve a iniciar sesión.",
    FORBIDDEN: "Tu cuenta no tiene permiso para gestionar el plan de esta academia.",
    ORGANIZATION_NOT_FOUND: "No hemos encontrado esta academia o no tienes acceso.",
    VALIDATION_ERROR: "No se ha podido validar la solicitud. Actualiza la página y vuelve a intentarlo.",
    IDEMPOTENCY_CONFLICT: "La solicitud anterior sigue asociada a esta operación. Actualiza el estado antes de iniciar otra.",
    SUBSCRIPTION_ALREADY_EXISTS: "La academia ya tiene una suscripción. Actualiza el estado o abre el portal de facturación.",
    CHECKOUT_IN_PROGRESS: "Hay un pago pendiente. Actualiza el estado antes de iniciar otro.",
    CHECKOUT_EXPIRED: "El enlace de pago ha caducado. Actualiza el estado antes de iniciar otro intento.",
    TRIAL_NOT_ELIGIBLE: "Esta academia no puede iniciar otro periodo de prueba.",
    PLAN_NOT_SELF_SERVE: "Este plan requiere acompañamiento de Zaltyko.",
    BILLING_CONFIGURATION_UNAVAILABLE: "La contratación no está disponible ahora. El plan actual no ha cambiado.",
    BILLING_PROVIDER_UNAVAILABLE: "No hemos podido conectar con el proveedor de pagos. El plan actual no ha cambiado.",
    RATE_LIMITED: "Has realizado varias solicitudes seguidas. Espera un momento y vuelve a intentarlo.",
    RATE_LIMIT_EXCEEDED: "Has realizado varias solicitudes seguidas. Espera un momento y vuelve a intentarlo.",
  };
  return (code && known[code]) || fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isCheckoutResult(value: unknown): value is OwnerSaasCheckoutResult {
  return (
    isRecord(value) &&
    typeof value.operationId === "string" && value.operationId.trim().length > 0 &&
    typeof value.checkoutUrl === "string" &&
    isSaasTimestamp(value.expiresAt) &&
    value.status === "pending"
  );
}

function isPortalResult(value: unknown): value is OwnerSaasPortalResult {
  return isRecord(value) && typeof value.portalUrl === "string";
}

function isTrialResult(value: unknown): value is OwnerSaasTrialResult {
  return (
    isRecord(value) &&
    typeof value.trialId === "string" && value.trialId.trim().length > 0 &&
    isSaasTimestamp(value.startsAt) && isSaasTimestamp(value.endsAt) &&
    Date.parse(value.endsAt) > Date.parse(value.startsAt) &&
    value.planCode === "starter" &&
    typeof value.entitlementRevision === "number" && Number.isSafeInteger(value.entitlementRevision)
    && value.entitlementRevision > 0
  );
}

function planLabel(code: OwnerSaasPlanCode): string {
  const catalogCode =
    code === "starter" ? "pro" : code === "growth" ? "premium" : code;
  return getProductPlanPublicName(catalogCode);
}

function sourceLabel(source: string): string {
  const labels: Record<string, string> = {
    trial: "Prueba de Starter",
    stripe_subscription: "Suscripción",
    bootstrap: "Plan inicial",
    contract: "Acuerdo vigente",
  };
  return labels[source] ?? "Acceso vigente";
}

function subscriptionStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    active: "Activa",
    trialing: "Prueba activa",
    past_due: "Pago pendiente de resolver",
    incomplete: "Contratación pendiente",
    incomplete_expired: "Contratación caducada",
    canceled: "Finalizada",
    unpaid: "Pago sin resolver",
    paused: "Pausada",
  };
  return labels[status] ?? "Estado en revisión";
}

function isReadySyncStatus(status: string): boolean {
  return ["current", "ready", "synced", "synchronized"].includes(
    status.trim().toLowerCase()
  );
}

function syncStatusPresentation(status: string): {
  title: string;
  message: string;
  actionLabel: string;
} {
  const normalized = status.trim().toLowerCase();
  const accessCopy =
    "Se conserva el acceso vigente que devuelve ahora el servidor. El plan solicitado no se considera activo hasta que el servidor lo confirme.";
  const presentations: Record<
    string,
    { title: string; message: string; actionLabel: string }
  > = {
    requested: {
      title: "Solicitud de pago registrada",
      message: `La operación está registrada. ${accessCopy}`,
      actionLabel: "Solicitud en curso",
    },
    creating_customer: {
      title: "Preparando la facturación",
      message: `Estamos preparando la facturación. ${accessCopy}`,
      actionLabel: "Preparando facturación",
    },
    creating_session: {
      title: "Preparando la sesión de pago",
      message: `Estamos creando la sesión de pago. ${accessCopy}`,
      actionLabel: "Preparando pago",
    },
    open: {
      title: "Sesión de pago pendiente",
      message: `Hay una sesión de pago abierta sin confirmación. ${accessCopy} Actualiza el estado antes de iniciar otra operación.`,
      actionLabel: "Pago pendiente",
    },
    recovery_required: {
      title: "La operación necesita revisión",
      message: `No se reintentará automáticamente. No inicies otra compra mientras esta operación siga pendiente; contacta con soporte para revisarla. ${accessCopy}`,
      actionLabel: "Revisión necesaria",
    },
    quarantined: {
      title: "Notificación de facturación en revisión",
      message: `Una notificación de facturación no se ha podido conciliar. ${accessCopy} No inicies otra compra hasta que se revise la operación.`,
      actionLabel: "Revisión necesaria",
    },
    unavailable: {
      title: "Facturación no disponible",
      message: "La gestión del plan no está disponible ahora. Este estado no indica que haya un pago pendiente. Se conserva el acceso vigente que devuelve el servidor; no hay un plan nuevo confirmado.",
      actionLabel: "No disponible ahora",
    },
  };
  const known = presentations[normalized];
  if (known) return known;

  if (normalized.includes("reconcil")) {
    return {
      title: "Conciliación pendiente",
      message: `Estamos revisando una operación. ${accessCopy}`,
      actionLabel: "Revisión necesaria",
    };
  }
  if (normalized.includes("pending") || normalized.includes("processing")) {
    return {
      title: "Operación pendiente",
      message: `Hay una operación en curso. ${accessCopy} Actualiza el estado antes de iniciar otra operación.`,
      actionLabel: "Operación pendiente",
    };
  }
  if (normalized.includes("fail") || normalized.includes("error")) {
    return {
      title: "No se pudo confirmar la sincronización",
      message: `No se ha podido confirmar el último cambio. ${accessCopy}`,
      actionLabel: "Revisión necesaria",
    };
  }
  return {
    title: "Estado de facturación en revisión",
    message: `No hemos podido confirmar el estado de facturación. ${accessCopy} Actualiza el estado antes de iniciar otra operación.`,
    actionLabel: "Revisión necesaria",
  };
}

function formatPrice(code: "starter" | "growth", interval: OwnerSaasBillingInterval) {
  const product = PRODUCT_PLAN_BY_CODE[code === "starter" ? "pro" : "premium"];
  const cents =
    interval === "year" ? product.annualPriceEurCents : product.priceEurCents;
  return cents === undefined ? null : formatPlanAmount(cents);
}

function priceSubtitle(
  code: "starter" | "growth",
  interval: OwnerSaasBillingInterval
) {
  if (interval === "month") return "al mes";
  const annual = formatPrice(code, "year");
  return annual ? "al año, pago anual" : "al año";
}

export function OwnerSaasBillingManager({
  organizationId,
  organizationName,
}: {
  organizationId: string;
  organizationName: string;
}) {
  const activeOrganizationIdRef = useRef(organizationId);
  useCommittedLayoutEffect(() => {
    activeOrganizationIdRef.current = organizationId;
  }, [organizationId]);
  const [snapshot, setSnapshot] = useState<OwnerSaasBillingSnapshot | null>(null);
  const [loadState, setLoadState] = useState<LoadState>({
    organizationId,
    status: "loading",
  });
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [interval, setInterval] = useState<OwnerSaasBillingInterval>("month");
  const [busyActionState, setBusyActionState] = useState<{ organizationId: string; action: string } | null>(null);
  const busyAction = busyActionState?.action ?? null;
  const displayedBusyAction = busyActionState?.organizationId === organizationId ? busyAction : null;
  const [actionErrorState, setActionErrorState] = useState<ActionMessage | null>(null);
  const [noticeState, setNoticeState] = useState<ActionMessage | null>(null);
  const actionError = actionErrorState?.organizationId === organizationId ? actionErrorState.message : "";
  const notice = noticeState?.organizationId === organizationId ? noticeState.message : "";
  const [pendingCheckout, setPendingCheckout] =
    useState<PendingCheckout | null>(null);
  const [pendingPortal, setPendingPortal] = useState<PendingPortal | null>(null);
  const [trialConfirmed, setTrialConfirmed] = useState<string | null>(null);
  const requestSequence = useRef(0);
  const actionInFlight = useRef(false);
  const pendingCommandRef = useRef<PendingCommand | null>(null);
  const uncertainCommandRef = useRef(false);
  const [pendingCommand, setPendingCommand] = useState<PendingCommand | null>(null);
  const [pendingReadState, setPendingReadState] = useState<{ organizationId: string; status: "loading" | "ready" | "blocked"; message?: string }>({ organizationId, status: "loading" });
  const [pendingReadAttempt, setPendingReadAttempt] = useState(0);
  usePendingCommandExitWarning(pendingCommand !== null, pendingCommandRef);

  useEffect(() => {
    if (pendingCommandRef.current && pendingCommandRef.current.organizationId !== organizationId) {
      setPendingReadState({ organizationId, status: "blocked", message: "Hay una operación pendiente en otra academia. Vuelve a ella para resolverla antes de continuar." });
      return;
    }
    setPendingReadState({ organizationId, status: "loading" });
    const stored = readStoredSaasCommand(organizationId);
    if (stored.status === "pending") {
      const command = stored.command;
      const intent: RequestIntent = {
        key: command.key,
        storageKey: saasCommandStorageKey(organizationId),
        body: JSON.parse(command.serializedBody) as Record<string, unknown>,
        serializedBody: command.serializedBody,
        hasPriorAttempt: true,
      };
      const pending = { organizationId, action: command.action, planCode: command.planCode, intent } as PendingCommand;
      pendingCommandRef.current = pending;
      uncertainCommandRef.current = true;
      setPendingCommand(pending);
      setPendingReadState({ organizationId, status: "ready" });
      return;
    }
    if (stored.status === "invalid" || stored.status === "unavailable") {
      setPendingReadState({ organizationId, status: "blocked", message: stored.status === "invalid"
        ? "Hay una operación guardada que no se puede validar. No iniciaremos otra solicitud. Revisa el almacenamiento e inténtalo de nuevo."
        : "No se puede leer el almacenamiento de la operación. No se ha enviado ninguna solicitud." });
      return;
    }
    setPendingReadState({ organizationId, status: "ready" });
  }, [organizationId, pendingReadAttempt]);

  function setBusyAction(action: string | null) {
    setBusyActionState(action === null ? null : { organizationId, action });
  }

  function setActionError(message: string) {
    setActionErrorState({ organizationId, message });
  }

  function setNotice(message: string) {
    setNoticeState({ organizationId, message });
  }

  const loadSnapshot = useCallback(
    async (signal?: AbortSignal) => {
      const requestId = ++requestSequence.current;
      try {
        const params = new URLSearchParams({ organizationId });
        const response = await fetch(
          `${BILLING_ENDPOINT}?${params.toString()}`,
          { cache: "no-store", signal }
        );
        const payload = await response.json().catch(() => null);
        const data = decodeOwnerSaasBillingSnapshot(payload, organizationId);
        if (!response.ok || !data) {
          throw new Error(
            apiErrorMessage(
              payload,
              "No se ha podido cargar el estado del plan. Comprueba la conexión e inténtalo de nuevo."
            )
          );
        }
        if (signal?.aborted || requestSequence.current !== requestId) return;
        setSnapshot(data);
        setLoadState({ organizationId, status: "ready" });
      } catch (error) {
        if (signal?.aborted || requestSequence.current !== requestId) return;
        setLoadState({
          organizationId,
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "No se ha podido cargar el estado del plan. Inténtalo de nuevo.",
        });
      }
    },
    [organizationId]
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadSnapshot(controller.signal);
    return () => controller.abort();
  }, [loadSnapshot, refreshVersion]);

  const currentSnapshot =
    snapshot?.organization.id === organizationId ? snapshot : null;
  const currentLoadState =
    loadState.organizationId === organizationId
      ? loadState
      : ({ organizationId, status: "loading" } as const);
  const stateIsCurrent = currentLoadState.status === "ready";
  const syncIsReady = currentSnapshot
    ? isReadySyncStatus(currentSnapshot.syncStatus)
    : false;
  const syncPresentation = currentSnapshot
    ? syncStatusPresentation(currentSnapshot.syncStatus)
    : null;
  const canStartOperation =
    Boolean(currentSnapshot) &&
    stateIsCurrent &&
    syncIsReady &&
    !busyAction &&
    pendingReadState.organizationId === organizationId && pendingReadState.status === "ready" &&
    !pendingCommand &&
    pendingCheckout?.organizationId !== organizationId;

  function refresh() {
    setActionError("");
    setPendingPortal(null);
    setLoadState({ organizationId, status: "loading" });
    setRefreshVersion((value) => value + 1);
  }

  function getIntent(body: Record<string, unknown>): RequestIntent {
    return { key: crypto.randomUUID(), storageKey: saasCommandStorageKey(organizationId), body, serializedBody: JSON.stringify(body), hasPriorAttempt: false };
  }

  function persistCommand(action: PendingCommand["action"], intent: RequestIntent, planCode?: "starter" | "growth") {
    const command = { organizationId, action, ...(planCode ? { planCode, billingInterval: intent.body.billingInterval as OwnerSaasBillingInterval } : {}), key: intent.key, serializedBody: intent.serializedBody };
    return persistStoredSaasCommand(command);
  }

  async function postAction<T>(endpoint: string, intent: RequestIntent) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Idempotency-Key": intent.key,
      },
      body: intent.serializedBody,
    });
    const payload = await response.json().catch(() => null);
    const data = responseData<unknown>(payload);
    if (!response.ok || !data) {
      throw new SaasCommandError(
        apiErrorMessage(
          payload,
          "No hemos podido confirmar la operación. Al reintentar se usará la misma solicitud."
        ),
        isDefinitiveSaasCommandRejection(response, payload, { previouslyUncertain: uncertainCommandRef.current })
      );
    }
    return data as T;
  }

  function mayRetry(action: PendingCommand["action"], intent: RequestIntent) {
    const pending = pendingCommandRef.current;
    return pending?.organizationId === organizationId && pending.action === action && pending.intent === intent;
  }

  function rememberCommand(action: PendingCommand["action"], intent: RequestIntent, planCode?: "starter" | "growth") {
    if (pendingCommandRef.current) return;
    const pending = { organizationId, action, intent, planCode };
    uncertainCommandRef.current = intent.hasPriorAttempt;
    pendingCommandRef.current = pending;
    setPendingCommand(pending);
  }

  function clearCommand(intent: RequestIntent) {
    const pending = pendingCommandRef.current;
    if (pending?.intent !== intent) return false;
    const expectedCommand = {
      organizationId,
      action: pending.action,
      ...(pending.planCode ? { planCode: pending.planCode, billingInterval: intent.body.billingInterval as OwnerSaasBillingInterval } : {}),
      key: intent.key,
      serializedBody: intent.serializedBody,
    };
    if (!clearStoredSaasCommand(organizationId, expectedCommand)) return false;
    pendingCommandRef.current = null;
    uncertainCommandRef.current = false;
    setPendingCommand(null);
    return true;
  }

  function commandFailure(error: unknown, intent: RequestIntent | null, preparationMessage: string) {
    if (!intent) { setActionError(preparationMessage); return; }
    if (error instanceof Error && error.message.includes("No se pudo guardar la operación")) {
      setPendingReadState({ organizationId, status: "blocked", message: error.message });
      return;
    }
    if (error instanceof SaasCommandError && error.definitive) {
      if (!clearCommand(intent)) {
        setActionError("El servidor rechazó la operación, pero no hemos podido limpiar su registro local. No inicies otra operación hasta recuperar el almacenamiento.");
        return;
      }
      setActionError(error.message);
      return;
    }
    if (pendingCommandRef.current?.intent === intent) uncertainCommandRef.current = true;
    setActionError("No podemos confirmar el resultado. No inicies otra operación: reintenta únicamente la solicitud pendiente sin cerrar ni recargar esta página.");
  }

  async function startCheckout(planCode: "starter" | "growth", retryIntent?: RequestIntent) {
    if (actionInFlight.current || (retryIntent ? !mayRetry("checkout", retryIntent)
      : (!currentSnapshot || !canStartOperation || pendingCheckout || pendingCommandRef.current))) return;
    actionInFlight.current = true;
    setActionError("");
    setNotice("");
    setPendingPortal(null);
    setBusyAction(`checkout:${planCode}`);
    let intent: RequestIntent | null = null;
    try {
      const body = { organizationId, planCode, billingInterval: interval };
      intent = retryIntent ?? getIntent(body);
      if (!persistCommand("checkout", intent, planCode)) throw new Error("No se pudo guardar la operación antes de enviarla. No se ha enviado ninguna solicitud.");
      rememberCommand("checkout", intent, planCode);
      const result = await postAction<OwnerSaasCheckoutResult>(
        CHECKOUT_ENDPOINT,
        intent
      );
      if (!isCheckoutResult(result) || !isCheckoutSessionUrl(result.checkoutUrl)) {
        throw new Error(
          "La respuesta de contratación no contiene un enlace válido. No hemos cambiado tu plan; actualiza el estado antes de reintentar."
        );
      }
      if (!clearCommand(intent)) throw new Error("La respuesta se ha validado, pero no hemos podido limpiar el registro local. Reintenta la misma operación.");
      setPendingCheckout({ ...result, organizationId });
      setNotice(
        "La sesión de pago está pendiente. El plan y los límites solo cambiarán cuando el servidor confirme el pago."
      );
      setLoadState({ organizationId, status: "loading" });
      setRefreshVersion((value) => value + 1);
    } catch (error) {
      commandFailure(error, intent, "No se ha podido preparar la contratación. No se ha enviado ninguna solicitud.");
    } finally {
      actionInFlight.current = false;
      setBusyAction(null);
    }
  }

  async function openPortal(retryIntent?: RequestIntent) {
    if (actionInFlight.current || (retryIntent ? !mayRetry("portal", retryIntent)
      : (!currentSnapshot || !canStartOperation || !currentSnapshot.actions.canOpenPortal || pendingCommandRef.current))) {
      return;
    }
    actionInFlight.current = true;
    setActionError("");
    setNotice("");
    setPendingCheckout(null);
    setBusyAction("portal");
    let intent: RequestIntent | null = null;
    try {
      const body = { organizationId };
      intent = retryIntent ?? getIntent(body);
      if (!persistCommand("portal", intent)) throw new Error("No se pudo guardar la operación antes de enviarla. No se ha enviado ninguna solicitud.");
      rememberCommand("portal", intent);
      const result = await postAction<OwnerSaasPortalResult>(
        PORTAL_ENDPOINT,
        intent
      );
      if (!isPortalResult(result) || !isPortalSessionUrl(result.portalUrl)) {
        throw new Error(
          "El portal no ha devuelto un enlace seguro. El plan actual no ha cambiado; actualiza el estado."
        );
      }
      if (!clearCommand(intent)) throw new Error("La respuesta se ha validado, pero no hemos podido limpiar el registro local. Reintenta la misma operación.");
      setPendingPortal({ ...result, organizationId });
      setNotice("El portal de facturación está listo. El estado de tu plan se mantiene hasta que el servidor confirme cualquier cambio.");
    } catch (error) {
      commandFailure(error, intent, "No se ha podido preparar el portal. No se ha enviado ninguna solicitud.");
    } finally {
      actionInFlight.current = false;
      setBusyAction(null);
    }
  }

  async function startTrial(retryIntent?: RequestIntent) {
    if (
      actionInFlight.current || (retryIntent ? !mayRetry("trial", retryIntent)
        : (!currentSnapshot || !canStartOperation || !currentSnapshot.actions.canStartTrial || pendingCommandRef.current))
    ) {
      return;
    }
    actionInFlight.current = true;
    setActionError("");
    setNotice("");
    setPendingCheckout(null);
    setBusyAction("trial");
    let intent: RequestIntent | null = null;
    try {
      const body = { organizationId };
      intent = retryIntent ?? getIntent(body);
      if (!persistCommand("trial", intent)) throw new Error("No se pudo guardar la operación antes de enviarla. No se ha enviado ninguna solicitud.");
      rememberCommand("trial", intent);
      const result = await postAction<OwnerSaasTrialResult>(TRIAL_ENDPOINT, intent);
      if (!isTrialResult(result)) {
        throw new Error(
          "No hemos podido validar la respuesta de activación. Actualiza el estado; al reintentar se usará la misma solicitud."
        );
      }
      if (!clearCommand(intent)) throw new Error("La respuesta se ha validado, pero no hemos podido limpiar el registro local. Reintenta la misma operación.");
      setTrialConfirmed(organizationId);
      setNotice(
        `El servidor confirma la prueba Starter hasta el ${formatDate(result.endsAt) ?? "final de su periodo"}. No se ha solicitado ningún cobro.`
      );
      if (activeOrganizationIdRef.current === organizationId) {
        setSnapshot(null);
        setLoadState({ organizationId, status: "loading" });
        setRefreshVersion((value) => value + 1);
      }
    } catch (error) {
      commandFailure(error, intent, "No se ha podido preparar la prueba. No se ha enviado ninguna solicitud.");
    } finally {
      actionInFlight.current = false;
      setBusyAction(null);
    }
  }

  function retryPendingCommand() {
    const pending = pendingCommandRef.current;
    if (!pending || pending.organizationId !== organizationId || actionInFlight.current) return;
    if (pending.action === "checkout" && pending.planCode) void startCheckout(pending.planCode, pending.intent);
    else if (pending.action === "portal") void openPortal(pending.intent);
    else if (pending.action === "trial") void startTrial(pending.intent);
  }

  const subscription = currentSnapshot?.subscription ?? null;
  const paymentNotice = subscription ? saasPaymentNotice(subscription.status) : null;
  const planCode = currentSnapshot?.entitlement.planCode;
  const trial = currentSnapshot?.trial ?? null;
  const canCheckoutStarter =
    canStartOperation &&
    !pendingCheckout &&
    trialConfirmed !== organizationId &&
    currentSnapshot?.actions.canCheckoutStarter === true;
  const canCheckoutGrowth =
    canStartOperation &&
    !pendingCheckout &&
    currentSnapshot?.actions.canCheckoutGrowth === true;
  const activeCheckout = pendingCheckout?.organizationId === organizationId;
  const activePortal = pendingPortal?.organizationId === organizationId;
  const isTrialActive =
    planCode === "starter" &&
    currentSnapshot?.entitlement.source === "trial" &&
    Boolean(trial?.endsAt);
  const activePlanName = planCode ? planLabel(planCode) : "";
  const currentLoadError =
    currentLoadState.status === "error" ? currentLoadState.message : "";

  return (
    <main className="min-h-screen bg-[#F1F3EF] px-5 py-8 text-slate-950 sm:py-12">
      <div className="mx-auto max-w-5xl">
        <header className="border-t-4 border-teal-800 bg-[#F8F8F4] p-6 sm:p-9">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-800">
            Gestión del plan
          </p>
          <h1 className="mt-3 font-display text-3xl font-bold tracking-[-0.035em] sm:text-4xl">
            Plan y facturación de Zaltyko
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-slate-700">
            Consulta el acceso de tu academia y gestiona su suscripción. Esto es
            independiente de los cobros y cuotas de las familias.
          </p>
          <div className="mt-6 border-l-2 border-teal-800 bg-white p-4">
            <span className="block text-xs font-bold uppercase tracking-wide text-slate-500">
              Academia
            </span>
            <span className="mt-1 block font-display text-lg font-bold">
              {currentSnapshot?.organization.name ?? organizationName}
            </span>
          </div>
        </header>

        <OwnerPlanUsage organizationId={organizationId} />

        {currentLoadState.status === "loading" && !currentSnapshot ? (
          <section className="mt-6 bg-white p-6" aria-live="polite">
            <p className="font-semibold">Consultando el estado de facturación…</p>
          </section>
        ) : null}

        {currentLoadError ? (
          <section
            className="mt-6 border-l-4 border-amber-700 bg-white p-5"
            role="alert"
          >
            <h2 className="font-display text-xl font-bold">
              No hemos podido actualizar el plan
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              {currentLoadError}
              {currentSnapshot
                ? " El estado mostrado puede estar desactualizado; las operaciones quedan desactivadas hasta confirmar de nuevo."
                : " No hemos sustituido el estado por datos de ejemplo."}
            </p>
            <button
              type="button"
              className="touch-target mt-4 rounded-full bg-slate-950 px-5 text-sm font-bold text-white disabled:opacity-60"
              onClick={refresh}
              disabled={busyAction !== null}
            >
              Volver a consultar
            </button>
          </section>
        ) : null}

        {currentSnapshot ? (
          <>
            <section
              className="mt-6 grid gap-4 border border-slate-300 bg-white p-5 sm:grid-cols-2 sm:p-6"
              aria-label="Estado actual del plan"
            >
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  Acceso efectivo
                </p>
                <p className="mt-1 font-display text-2xl font-bold">
                  {activePlanName}
                </p>
                <p className="mt-1 text-sm text-slate-700">
                  {sourceLabel(currentSnapshot.entitlement.source)}
                  {currentSnapshot.entitlement.effectiveUntil
                    ? ` · hasta ${formatDate(currentSnapshot.entitlement.effectiveUntil) ?? "fecha por confirmar"}`
                    : ""}
                </p>
              </div>
              <div className="sm:text-right">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  Límite de gimnastas
                </p>
                <p className="mt-1 font-display text-2xl font-bold">
                  {currentSnapshot.limits.maxAthletes === null
                    ? "Sin límite de plan"
                    : `${currentSnapshot.limits.maxAthletes} gimnastas`}
                </p>
                <p className="mt-1 text-sm text-slate-700">
                  Revisión de acceso: {currentSnapshot.entitlement.revision}
                </p>
              </div>
              {subscription ? (
                <div className="border-t border-slate-200 pt-4 sm:col-span-2 sm:flex sm:items-center sm:justify-between sm:gap-4">
                  <div>
                    <p className="text-sm font-bold">
                      Suscripción {subscriptionStatusLabel(subscription.status)}
                    </p>
                    <p className="mt-1 text-sm text-slate-700">
                      {subscription.billingInterval === "year"
                        ? "Facturación anual"
                        : subscription.billingInterval === "month"
                          ? "Facturación mensual"
                          : "Periodo de facturación por confirmar"}
                      {subscription.currentPeriodEndsAt
                        ? ` · periodo hasta ${formatDate(subscription.currentPeriodEndsAt) ?? "fecha por confirmar"}`
                        : ""}
                    </p>
                    {subscription.cancelAtPeriodEnd ? (
                      <p className="mt-2 text-sm font-semibold text-amber-900">
                        La renovación está desactivada y la cancelación está
                        programada al final del periodo indicado. El acceso
                        efectivo es el que confirma el servidor.
                      </p>
                    ) : null}
                    {paymentNotice ? (
                      <p className="mt-2 max-w-2xl text-sm text-amber-900" role="status">
                        {paymentNotice}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="touch-target mt-4 w-full rounded-full border border-slate-400 px-5 text-sm font-bold text-slate-900 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 sm:mt-0 sm:w-auto"
                    onClick={() => void openPortal()}
                    disabled={
                      !canStartOperation ||
                      currentLoadState.status !== "ready" ||
                      !currentSnapshot.actions.canOpenPortal ||
                      activePortal
                    }
                  >
                    {displayedBusyAction === "portal"
                      ? "Preparando portal…"
                      : "Gestionar suscripción"}
                  </button>
                </div>
              ) : null}
              {isTrialActive ? (
                <div className="border-t border-slate-200 pt-4 sm:col-span-2">
                  <p className="text-sm font-bold">Prueba Starter activa</p>
                  <p className="mt-1 text-sm text-slate-700">
                    {trial?.endsAt
                      ? `Finaliza el ${formatDate(trial.endsAt) ?? "fecha por confirmar"}. No se hará ningún cobro automático al terminar.`
                      : "El servidor no ha indicado todavía la fecha de fin."}
                  </p>
                </div>
              ) : null}
            </section>

            {!syncIsReady ? (
              <section
                className="mt-4 border-l-4 border-amber-700 bg-white p-5"
                role="status"
              >
                <p className="font-semibold">
                  {syncPresentation?.title ?? "Estado de facturación en revisión"}
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-700">
                  {syncPresentation?.message ??
                    "Se conserva el acceso vigente que devuelve el servidor. No se activa el plan solicitado hasta confirmación."}
                </p>
                <button
                  type="button"
                  className="touch-target mt-3 rounded-full border border-slate-400 px-5 text-sm font-bold disabled:opacity-60"
                  onClick={refresh}
                  disabled={busyAction !== null}
                >
                  Actualizar estado
                </button>
              </section>
            ) : null}
          </>
        ) : null}

        {notice ? (
          <div
            className="mt-4 border-l-4 border-teal-800 bg-white p-4 text-sm leading-6 text-slate-800"
            role="status"
            aria-live="polite"
          >
            {notice}
          </div>
        ) : null}
        {pendingCommand ? (
          <section className="mt-4 border border-amber-700 bg-white p-5" aria-label="Operación de facturación pendiente" aria-busy={busyAction !== null}>
            {pendingCommand.organizationId === organizationId ? <>
              <p className="font-semibold">{pendingCommand.action === "checkout" ? `Contratación de ${pendingCommand.planCode === "growth" ? "Growth" : "Starter"} · ${pendingCommand.intent.body.billingInterval === "year" ? "pago anual" : "mensual"}` : pendingCommand.action === "portal" ? "Preparación del Portal" : "Activación de la prueba"}: pendiente de confirmar.</p>
              <p className="mt-2 text-sm">No cierres ni recargues esta página. El reintento conserva la operación, el cuerpo y la clave originales; no inicia otra contratación.</p>
              <button type="button" className="touch-target mt-3 rounded-full border px-5 text-sm font-bold disabled:opacity-50" disabled={busyAction !== null} onClick={retryPendingCommand}>Reintentar la operación pendiente</button>
            </> : <p>Hay una operación de facturación pendiente en otra academia. Vuelve a ella para resolverla antes de iniciar otra operación.</p>}
          </section>
        ) : null}
        {actionError ? (
          <div className="mt-4 border-l-4 border-rose-700 bg-white p-4" role="alert">
            <p className="text-sm leading-6 text-slate-800">{actionError}</p>
            {pendingCommand?.organizationId === organizationId ? <p className="mt-2 text-xs leading-5 text-slate-600">
              El reintento de la operación pendiente conservará la misma clave y el mismo cuerpo.
            </p> : null}
          </div>
        ) : null}
        {pendingReadState.organizationId === organizationId && pendingReadState.status === "blocked" ? (
          <div className="mt-4 border-l-4 border-amber-700 bg-white p-4" role="alert">
            <p className="text-sm leading-6 text-slate-800">{pendingReadState.message}</p>
            <button type="button" className="touch-target mt-2 rounded-full border px-4 text-sm font-bold" onClick={() => setPendingReadAttempt((value) => value + 1)}>Volver a comprobar la operación guardada</button>
          </div>
        ) : null}

        {activeCheckout ? (
          <section className="mt-4 border border-teal-800 bg-white p-5">
            <h2 className="font-display text-xl font-bold">
              Pago pendiente de confirmación
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              La sesión se ha creado, pero el plan actual sigue vigente hasta
              que el servidor confirme el pago.
            </p>
            <a
              className="touch-target mt-4 inline-flex rounded-full bg-teal-800 px-5 text-sm font-bold text-white hover:bg-teal-900"
              href={pendingCheckout.checkoutUrl}
              target="_blank"
              rel="noreferrer"
            >
              Continuar al pago seguro
            </a>
            <p className="mt-3 text-xs leading-5 text-slate-600">
              Si vuelves aquí, actualiza el estado antes de iniciar otra
              operación.
            </p>
          </section>
        ) : null}

        {activePortal ? (
          <section className="mt-4 border border-slate-300 bg-white p-5">
            <h2 className="font-display text-xl font-bold">
              Portal de facturación listo
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              Los cambios se reflejarán cuando el servidor los confirme.
            </p>
            <a
              className="touch-target mt-4 inline-flex rounded-full border border-slate-400 px-5 text-sm font-bold text-slate-900 hover:bg-slate-50"
              href={pendingPortal.portalUrl}
              target="_blank"
              rel="noreferrer"
            >
              Abrir portal seguro
            </a>
          </section>
        ) : null}

        {currentSnapshot ? (
          <section className="mt-8" aria-labelledby="available-plans-title">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-800">
                  Opciones disponibles
                </p>
                <h2
                  id="available-plans-title"
                  className="mt-2 font-display text-2xl font-bold"
                >
                  Elige un plan para tu academia
                </h2>
              </div>
              <fieldset className="flex items-center gap-1 rounded-full border border-slate-300 bg-white p-1" disabled={pendingCommand !== null || busyAction !== null}>
                <legend className="sr-only">Periodo de facturación</legend>
                {(["month", "year"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={interval === value}
                    className={`touch-target rounded-full px-4 text-sm font-semibold ${interval === value ? "bg-slate-950 text-white" : "text-slate-700 hover:bg-slate-100"}`}
                    onClick={() => { if (!pendingCommandRef.current && !actionInFlight.current) setInterval(value); }}
                  >
                    {value === "month" ? "Mensual" : "Anual"}
                  </button>
                ))}
              </fieldset>
            </div>

            {trial?.eligible && currentSnapshot.actions.canStartTrial ? (
              <div className="mt-5 flex flex-col gap-4 border-l-4 border-teal-800 bg-white p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                <div>
                  <h3 className="font-display text-xl font-bold">
                    Prueba Starter durante 7 días
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-slate-700">
                    Sin tarjeta y sin cobro automático al terminar. La prueba
                    solo se activa cuando tú la solicitas.
                  </p>
                </div>
                <button
                  type="button"
                  className="touch-target w-full shrink-0 rounded-full bg-teal-800 px-5 text-sm font-bold text-white hover:bg-teal-900 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                  onClick={() => void startTrial()}
                  disabled={
                    !canStartOperation ||
                    !currentSnapshot.actions.canStartTrial ||
                    trialConfirmed === organizationId
                  }
                >
                  {displayedBusyAction === "trial" ? "Activando prueba…" : "Activar prueba"}
                </button>
                {trial.nextEligibleAt ? (
                  <p className="text-xs text-slate-600">
                    Disponible de nuevo desde {formatDate(trial.nextEligibleAt) ?? "fecha por confirmar"}.
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {(["starter", "growth"] as const).map((code) => {
                const product =
                  PRODUCT_PLAN_BY_CODE[code === "starter" ? "pro" : "premium"];
                const available =
                  code === "starter" ? canCheckoutStarter : canCheckoutGrowth;
                const busy = displayedBusyAction === `checkout:${code}`;
                const checkoutButtonLabel = (() => {
                  if (busy) return "Preparando sesión…";
                  if (!stateIsCurrent) return "Actualizando estado…";
                  if (!syncIsReady) {
                    return syncPresentation?.actionLabel ?? "Revisión necesaria";
                  }
                  return available
                    ? `Contratar ${planLabel(code)}`
                    : "No disponible ahora";
                })();
                return (
                  <article
                    key={code}
                    className={`flex flex-col border bg-white p-5 sm:p-6 ${code === "growth" ? "border-teal-800" : "border-slate-300"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-display text-2xl font-bold">
                          {planLabel(code)}
                        </h3>
                        <p className="mt-1 text-sm text-slate-700">
                          Hasta {product.athleteLimit} gimnastas
                        </p>
                      </div>
                      {code === "growth" ? (
                        <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-bold text-teal-900">
                          Crecimiento
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-5 font-display text-3xl font-bold">
                      {formatPrice(code, interval) ?? "Consultar"}
                      <span className="ml-2 text-sm font-semibold text-slate-600">
                        {priceSubtitle(code, interval)}
                      </span>
                    </p>
                    {interval === "year" ? (
                      <p className="mt-1 text-sm text-slate-600">
                        Pago anual por adelantado.
                      </p>
                    ) : null}
                    <p className="mt-3 text-sm leading-6 text-slate-700">
                      {product.description}
                    </p>
                    <ul className="mt-4 space-y-2 text-sm text-slate-700">
                      {product.features.slice(0, 3).map((feature) => (
                        <li key={feature} className="flex gap-2">
                          <span aria-hidden="true" className="font-bold text-teal-800">
                            ✓
                          </span>
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      className="touch-target mt-6 w-full rounded-full bg-slate-950 px-5 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => void startCheckout(code)}
                      disabled={!available || !stateIsCurrent || busyAction !== null}
                    >
                      {checkoutButtonLabel}
                    </button>
                  </article>
                );
              })}
            </div>

            {trial?.eligible === false && trial.nextEligibleAt ? (
              <p className="mt-4 text-sm text-slate-600">
                La prueba podrá volver a solicitarse desde {formatDate(trial.nextEligibleAt) ?? "la fecha indicada por el servidor"}.
              </p>
            ) : null}

            <aside className="mt-5 border border-slate-300 bg-[#F8F8F4] p-5">
              <h3 className="font-display text-lg font-bold">
                ¿Gestionas varias sedes?
              </h3>
              <p className="mt-1 text-sm leading-6 text-slate-700">
                Network requiere una conversación y un onboarding acompañado.
              </p>
              <Link
                className="touch-target mt-3 inline-flex items-center text-sm font-bold text-teal-900 underline underline-offset-4"
                href="/contact?type=network"
              >
                Hablar con Zaltyko
              </Link>
            </aside>
          </section>
        ) : null}

        {currentSnapshot && currentLoadState.status === "ready" ? (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-300 pt-4">
            <p className="text-xs text-slate-600">
              Estado leído del servidor. No se muestran datos de tarjetas.
            </p>
            <button
              type="button"
              className="touch-target rounded-full px-4 text-sm font-bold text-teal-900 underline underline-offset-4 disabled:opacity-50"
              onClick={refresh}
              disabled={busyAction !== null}
            >
              Actualizar estado
            </button>
          </div>
        ) : null}
      </div>
    </main>
  );
}

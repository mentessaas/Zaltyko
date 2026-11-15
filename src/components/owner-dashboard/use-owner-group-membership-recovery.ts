"use client";

import { useEffect, useRef, useState } from "react";
import { usePendingCommandExitWarning } from "./use-pending-command-exit-warning";
import {
  clearPendingGroupAthleteCreate,
  decodeGroupAthleteRecovery,
  decodePendingGroupAthleteCreate,
  encodePendingGroupAthleteCreate,
  persistPendingGroupAthleteCreate,
  type GroupAthleteReceipt,
  type PendingGroupAthleteCreate,
} from "./owner-pending-group-athlete";
import {
  commandFromGroupMembershipSnapshot,
  readPendingGroupMembership,
} from "./owner-pending-group-membership";
import type {
  CreateAthleteRecoveryState,
  PendingMembershipCommand,
} from "./owner-groups-manager-model";

/**
 * Membership command awaiting its result (restored from sessionStorage without
 * resending it) and the focus on its retry button. Extracted from OwnerGroupsManager.
 */
export function useOwnerGroupMembershipRecovery({
  organizationId,
  selectedGroupId,
  membershipScope,
  busy,
}: {
  organizationId: string;
  selectedGroupId: string | null;
  membershipScope: string;
  busy: boolean;
}) {
  const pendingMembershipRef = useRef<PendingMembershipCommand | null>(null);
  const membershipSendingRef = useRef(false);
  const membershipUncertainRef = useRef(false);
  const [pendingMembership, setPendingMembership] = useState<PendingMembershipCommand | null>(null);
  const [membershipRecoveryLoadedFor, setMembershipRecoveryLoadedFor] = useState<string | null>(null);
  const [membershipRecoveryFailure, setMembershipRecoveryFailure] = useState<{ scope: string; message: string } | null>(null);
  const [foreignMembershipScope, setForeignMembershipScope] = useState<{ organizationId: string; groupId: string } | null>(null);
  const [membershipRecoveryAttempt, setMembershipRecoveryAttempt] = useState(0);
  const retryMembershipRef = useRef<HTMLButtonElement | null>(null);
  usePendingCommandExitWarning(pendingMembership !== null, pendingMembershipRef);
  const membershipRecoveryReady = membershipRecoveryLoadedFor === membershipScope && membershipRecoveryFailure?.scope !== membershipScope;
  const membershipRecoveryError = membershipRecoveryFailure?.scope === membershipScope ? membershipRecoveryFailure.message : "";
  const canRetryMembership = pendingMembership?.organizationId === organizationId && pendingMembership.groupId === selectedGroupId;

  useEffect(() => {
    if (canRetryMembership && !busy) retryMembershipRef.current?.focus();
  }, [canRetryMembership, pendingMembership, busy]);

  useEffect(() => {
    let result: ReturnType<typeof readPendingGroupMembership>;
    try { result = readPendingGroupMembership(window.sessionStorage); }
    catch { result = { status: "unavailable" }; }
    if (result.status === "invalid" || result.status === "unavailable") {
      setMembershipRecoveryFailure({
        scope: membershipScope,
        message: result.status === "invalid"
          ? "Hay un cambio de grupo sin terminar en este navegador. No se harán más cambios hasta resolverlo."
          : "No se pudo consultar el almacenamiento de esta sesión. No se permitirán cambios hasta poder verificar la operación pendiente.",
      });
      setForeignMembershipScope(null);
      setMembershipRecoveryLoadedFor(membershipScope);
      return;
    }
    setMembershipRecoveryFailure(null);
    if (result.status === "pending") {
      const snapshot = result.snapshot;
      if (snapshot.organizationId === organizationId && snapshot.groupId === (selectedGroupId ?? "")) {
        const restored = commandFromGroupMembershipSnapshot(snapshot);
        pendingMembershipRef.current = restored;
        membershipUncertainRef.current = true;
        setPendingMembership(restored);
        setForeignMembershipScope(null);
      } else {
        setForeignMembershipScope({ organizationId: snapshot.organizationId, groupId: snapshot.groupId });
      }
    } else {
      setForeignMembershipScope(null);
      if (pendingMembershipRef.current === null) {
        membershipUncertainRef.current = false;
        setPendingMembership(null);
      }
    }
    setMembershipRecoveryLoadedFor(membershipScope);
  }, [organizationId, selectedGroupId, membershipScope, membershipRecoveryAttempt]);

  return {
    pendingMembershipRef,
    membershipSendingRef,
    membershipUncertainRef,
    pendingMembership,
    setPendingMembership,
    membershipRecoveryFailure,
    setMembershipRecoveryFailure,
    foreignMembershipScope,
    setMembershipRecoveryAttempt,
    retryMembershipRef,
    membershipRecoveryReady,
    membershipRecoveryError,
    canRetryMembership,
  };
}

/**
 * "Create athlete and add to group" intent: verifies the stored idempotency key
 * against the receipt endpoint before allowing another submission.
 */
export function useOwnerGroupAthleteCreateRecovery({
  organizationId,
  selectedGroupId,
  membershipScope,
}: {
  organizationId: string;
  selectedGroupId: string | null;
  membershipScope: string;
}) {
  const [createAthleteRecovery, setCreateAthleteRecovery] = useState<CreateAthleteRecoveryState | null>(null);
  const [createAthleteRecoveryAttempt, setCreateAthleteRecoveryAttempt] = useState(0);
  const scopedCreateAthleteRecovery = createAthleteRecovery?.scope === membershipScope ? createAthleteRecovery : null;
  const createAthleteBlocked = !scopedCreateAthleteRecovery ||
    ["checking", "complete", "blocked"].includes(scopedCreateAthleteRecovery.status);
  const createAthleteStorageKey = `zaltyko:pending-group-athlete:${organizationId}:${selectedGroupId ?? "none"}`;

  useEffect(() => {
    const controller = new AbortController();
    const recoveryScope = membershipScope;
    const blockRecovery = (detail: string) => {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (!controller.signal.aborted) setCreateAthleteRecovery({ scope: recoveryScope, status: "blocked", detail });
    };
    try {
      const raw = window.sessionStorage.getItem(createAthleteStorageKey);
      const intent = decodePendingGroupAthleteCreate(raw, organizationId, selectedGroupId ?? "");
      if (intent === false) {
        blockRecovery("No se pudo validar el marcador local del alta. No se enviará otra solicitud.");
      } else if (!intent) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setCreateAthleteRecovery({ scope: recoveryScope, status: "none" });
      } else {
        const encoded = encodePendingGroupAthleteCreate(intent);
        if (raw !== encoded && !persistPendingGroupAthleteCreate(window.sessionStorage, createAthleteStorageKey, intent)) {
          blockRecovery("No se pudo migrar y verificar la clave anterior. No se enviará otra solicitud.");
        } else {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setCreateAthleteRecovery({ scope: recoveryScope, status: "checking", intent });
          const params = new URLSearchParams({ organizationId, idempotencyKey: intent.idempotencyKey });
          void fetch(`/api/v1/owner/groups/${intent.groupId}/memberships/receipt?${params}`, {
            cache: "no-store",
            signal: controller.signal,
          }).then(async (response) => {
            const payload = await response.json().catch(() => null);
            if (controller.signal.aborted) return;
            const recovery = response.ok ? decodeGroupAthleteRecovery(payload) : null;
            if (!recovery) {
              blockRecovery("No se pudo verificar el recibo. La operación permanece bloqueada para evitar duplicados.");
            } else if (recovery.status === "none") {
              setCreateAthleteRecovery({ scope: recoveryScope, status: "needs-input", intent });
            } else if (recovery.receipt.groupId !== intent.groupId) {
              blockRecovery("El recibo pertenece a otro grupo. No se enviará otra solicitud.");
            } else {
              setCreateAthleteRecovery({ scope: recoveryScope, status: "complete", intent, receipt: recovery.receipt });
            }
          }).catch(() => {
            blockRecovery("No se pudo consultar el recibo. Vuelve a intentarlo cuando haya conexión.");
          });
        }
      }
    } catch {
      blockRecovery("No se pudo leer el almacenamiento de la operación pendiente.");
    }
    return () => controller.abort();
  }, [organizationId, selectedGroupId, membershipScope, createAthleteStorageKey, createAthleteRecoveryAttempt]);

  function clearCreateAthleteIntent(
    intent: PendingGroupAthleteCreate,
    receipt?: GroupAthleteReceipt
  ) {
    try {
      if (clearPendingGroupAthleteCreate(window.sessionStorage, createAthleteStorageKey, intent)) {
        setCreateAthleteRecovery({ scope: membershipScope, status: "none" });
        return true;
      }
    } catch {
      // Preserve the receipt and block another operation when storage is unreadable.
    }
    if (receipt) {
      setCreateAthleteRecovery({ scope: membershipScope, status: "complete", intent, receipt });
    } else {
      setCreateAthleteRecovery({
        scope: membershipScope,
        status: "blocked",
        detail: "La ficha no se creó, pero queda un intento sin terminar. No empezaremos otro.",
      });
    }
    return false;
  }

  return {
    setCreateAthleteRecovery,
    setCreateAthleteRecoveryAttempt,
    scopedCreateAthleteRecovery,
    createAthleteBlocked,
    createAthleteStorageKey,
    clearCreateAthleteIntent,
  };
}

"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { OwnerUsage } from "./owner-plan-usage-response";

export type OwnerPlanPolicy =
  | { status: "loading" | "error" }
  | ({ status: "ready" } & Pick<OwnerUsage, "readOnly" | "planCode">);

const policies = new Map<string, OwnerPlanPolicy>();
const listeners = new Map<string, Set<() => void>>();
const readSequences = new Map<string, number>();
type UsagePolicy = Pick<OwnerUsage, "readOnly" | "planCode">;
type SettledRead = { status: "ready"; usage: UsagePolicy } | { status: "error" | "cancelled" };
type ReadBatch = {
  active: Set<number>;
  settled: Map<number, SettledRead>;
  /**
   * Confirmed policy kept visible while a background revalidation runs. Null
   * as soon as any regular read joins the batch.
   */
  revalidating: Extract<OwnerPlanPolicy, { status: "ready" }> | null;
};
const readBatches = new Map<string, ReadBatch>();

export type OwnerPlanUsageReadTicket = number;

function publishPolicy(organizationId: string, policy: OwnerPlanPolicy) {
  const current = policies.get(organizationId);
  if (current?.status === policy.status && (policy.status !== "ready" || (
    current.status === "ready" &&
    current.readOnly === policy.readOnly &&
    current.planCode === policy.planCode
  ))) {
    return;
  }
  policies.set(organizationId, policy);
  listeners.get(organizationId)?.forEach((listener) => listener());
}

export function publishOwnerPlanUsage(
  organizationId: string,
  usage: UsagePolicy,
  ticket?: OwnerPlanUsageReadTicket
) {
  if (ticket === undefined) {
    // Synchronous seeds/overrides supersede any outstanding network reads.
    readBatches.delete(organizationId);
    publishPolicy(organizationId, { status: "ready", ...usage });
    return true;
  }
  const batch = readBatches.get(organizationId);
  if (!batch?.active.delete(ticket)) return false;
  batch.settled.set(ticket, { status: "ready", usage });
  publishSettledBatch(organizationId, batch);
  return true;
}

/*
 * All readers for one organization share this policy summary. A newer
 * component can unmount while an older compact reader is still fetching; keep
 * the policy loading until every overlapping read settles, then use the
 * newest successful result. This prevents one cancelled consumer from
 * poisoning the other mounted Owner views.
 */
function publishSettledBatch(organizationId: string, batch: ReadBatch) {
  if (batch.active.size > 0) return;
  readBatches.delete(organizationId);
  const latestMeaningfulRead = [...batch.settled.entries()]
    .sort(([left], [right]) => right - left)
    .find(([, result]) => result.status !== "cancelled");
  if (latestMeaningfulRead?.[1].status === "ready") {
    publishPolicy(organizationId, { status: "ready", ...latestMeaningfulRead[1].usage });
  } else if (!latestMeaningfulRead && batch.revalidating) {
    // Every background revalidation was cancelled (navigation, a newer
    // focus): nothing new was learned, so the confirmed policy stays.
    publishPolicy(organizationId, batch.revalidating);
  } else {
    // A real failure in a newer read must not be replaced by older data.
    publishPolicy(organizationId, { status: "error" });
  }
}

/**
 * Starts a read of the plan policy. A regular read blocks writes ("loading")
 * until it settles. A background revalidation (`revalidate: true`, used when
 * the tab or window regains focus) keeps an already confirmed policy visible
 * meanwhile: otherwise the first click after focusing the window lands on a
 * button that was disabled between mousedown and click, and does nothing.
 * The server still checks plan writability on every write.
 */
export function beginOwnerPlanUsageRead(
  organizationId: string,
  options: { revalidate?: boolean } = {}
): OwnerPlanUsageReadTicket {
  const ticket = (readSequences.get(organizationId) ?? 0) + 1;
  readSequences.set(organizationId, ticket);
  const current = policies.get(organizationId);
  const existing = readBatches.get(organizationId);
  const keep: Extract<OwnerPlanPolicy, { status: "ready" }> | null = options.revalidate === true && current?.status === "ready" && (!existing || existing.revalidating)
    ? current
    : null;
  const batch: ReadBatch = existing ?? {
    active: new Set<number>(),
    settled: new Map<number, SettledRead>(),
    revalidating: keep,
  };
  batch.revalidating = keep;
  batch.active.add(ticket);
  readBatches.set(organizationId, batch);
  if (!keep) publishPolicy(organizationId, { status: "loading" });
  return ticket;
}

export function markOwnerPlanUsageUnavailable(
  organizationId: string,
  ticket?: OwnerPlanUsageReadTicket,
  reason: "error" | "cancelled" = "error"
) {
  if (ticket === undefined) {
    readBatches.delete(organizationId);
    publishPolicy(organizationId, { status: "error" });
    return true;
  }
  const batch = readBatches.get(organizationId);
  if (!batch?.active.delete(ticket)) return false;
  batch.settled.set(ticket, { status: reason });
  publishSettledBatch(organizationId, batch);
  return true;
}

function subscribe(organizationId: string, listener: () => void) {
  const group = listeners.get(organizationId) ?? new Set<() => void>();
  group.add(listener);
  listeners.set(organizationId, group);
  return () => {
    group.delete(listener);
    if (group.size === 0) listeners.delete(organizationId);
  };
}

export function useOwnerPlanPolicy(
  organizationId: string,
  enabled = true
): OwnerPlanPolicy {
  const subscribeOrganization = useCallback(
    (listener: () => void) => subscribe(organizationId, listener),
    [organizationId]
  );
  const getSnapshot = useCallback(
    () => policies.get(organizationId) ?? null,
    [organizationId]
  );
  const policy = useSyncExternalStore(
    subscribeOrganization,
    getSnapshot,
    () => null
  );
  return enabled
    ? policy ?? { status: "loading" }
    : { status: "ready", readOnly: false, planCode: "preview" };
}

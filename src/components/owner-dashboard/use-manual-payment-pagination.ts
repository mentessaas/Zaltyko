"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { OpenManualPaymentCharge } from "@/modules/billing/application/manual-payments";
import {
  manualPaymentOptionsResponseSchema,
  type LoadedManualPaymentPage,
  type ManualPaymentOptionsRequest,
} from "./manual-payment-form-model";

/**
 * "Cargar más cargos": keeps the server page plus the charges appended by
 * cursor, and discards late responses from another academy, site or page.
 * Extracted from ManualPaymentForm.
 */
export function useManualPaymentPagination({
  organizationId,
  locationId,
  charges,
  nextCursor,
  formLocked,
}: {
  organizationId: string;
  locationId: string | null;
  charges: OpenManualPaymentCharge[];
  nextCursor: string | null;
  /** The form's lock in this render: a locked form cannot load more charges. */
  formLocked: boolean;
}) {
  const paginationPageIdentity = useMemo(
    () => ({}),
    [organizationId, locationId, charges, nextCursor]
  );
  const [loadedPage, setLoadedPage] = useState<LoadedManualPaymentPage>(() => ({
    identity: paginationPageIdentity,
    charges,
    cursor: nextCursor,
  }));
  const pageMatchesCurrentProps =
    loadedPage.identity === paginationPageIdentity;
  const loadedCharges = pageMatchesCurrentProps ? loadedPage.charges : charges;
  const pageCursor = pageMatchesCurrentProps ? loadedPage.cursor : nextCursor;
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const paginationScopeKey = JSON.stringify([organizationId, locationId]);
  const paginationGeneration = useRef(0);
  const paginationRequestSequence = useRef(0);
  const activePaginationRequest = useRef<ManualPaymentOptionsRequest | null>(
    null
  );
  const paginationMounted = useRef(false);

  useEffect(() => {
    paginationMounted.current = true;
    return () => {
      paginationMounted.current = false;
      paginationGeneration.current += 1;
      activePaginationRequest.current?.controller.abort();
      activePaginationRequest.current = null;
    };
  }, []);

  useEffect(() => {
    paginationGeneration.current += 1;
    activePaginationRequest.current?.controller.abort();
    activePaginationRequest.current = null;
    setLoadedPage({
      identity: paginationPageIdentity,
      charges,
      cursor: nextCursor,
    });
    setLoadingMore(false);
    setLoadMoreError(false);
  }, [
    organizationId,
    locationId,
    charges,
    nextCursor,
    paginationPageIdentity,
  ]);

  async function loadMoreCharges() {
    const activeRequest = activePaginationRequest.current;
    if (
      !pageMatchesCurrentProps ||
      !pageCursor ||
      (activeRequest?.generation === paginationGeneration.current &&
        activeRequest.scopeKey === paginationScopeKey) ||
      formLocked
    ) {
      return;
    }
    const request: ManualPaymentOptionsRequest = {
      id: ++paginationRequestSequence.current,
      generation: paginationGeneration.current,
      pageIdentity: paginationPageIdentity,
      scopeKey: paginationScopeKey,
      cursor: pageCursor,
      controller: new AbortController(),
    };
    activePaginationRequest.current = request;
    const isCurrentRequest = () => {
      const active = activePaginationRequest.current;
      return (
        paginationMounted.current &&
        paginationGeneration.current === request.generation &&
        active !== null &&
        active.id === request.id &&
        active.pageIdentity === request.pageIdentity &&
        active.scopeKey === request.scopeKey
      );
    };

    setLoadingMore(true);
    setLoadMoreError(false);
    try {
      const params = new URLSearchParams({
        organizationId,
        cursor: request.cursor,
      });
      if (locationId) params.set("locationId", locationId);
      const response = await fetch(
        `/api/v1/owner/billing/manual-payments?${params.toString()}`,
        {
          headers: { accept: "application/json" },
          signal: request.controller.signal,
        }
      );
      if (!isCurrentRequest()) return;
      const raw: unknown = await response.json().catch(() => null);
      if (!isCurrentRequest()) return;
      const parsed = manualPaymentOptionsResponseSchema.safeParse(raw);
      if (!response.ok || !parsed.success) throw new Error("page-unavailable");

      setLoadedPage((current) => {
        if (current.identity !== request.pageIdentity) return current;
        const known = new Set(current.charges.map((charge) => charge.chargeId));
        return {
          identity: current.identity,
          charges: [
            ...current.charges,
            ...parsed.data.data.charges.filter(
              (charge) => !known.has(charge.chargeId)
            ),
          ],
          cursor: parsed.data.data.nextCursor,
        };
      });
    } catch {
      if (isCurrentRequest()) setLoadMoreError(true);
    } finally {
      if (isCurrentRequest()) {
        activePaginationRequest.current = null;
        setLoadingMore(false);
      }
    }
  }

  return {
    pageMatchesCurrentProps,
    loadedCharges,
    pageCursor,
    loadingMore,
    loadMoreError,
    loadMoreCharges,
  };
}

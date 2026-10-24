"use client";

import { useCallback, useState, type Dispatch, type SetStateAction } from "react";

/** Ephemeral form data only. Never use this for a command awaiting its receipt. */
export function useOrganizationDraftField<T>(
  organizationId: string,
  initialValue: T | (() => T)
): readonly [T, Dispatch<SetStateAction<T>>] {
  const initialize = () => typeof initialValue === "function"
    ? (initialValue as () => T)()
    : initialValue;
  const [stored, setStored] = useState(() => ({
    organizationId,
    generation: 0,
    value: initialize(),
  }));
  let current = stored;
  if (stored.organizationId !== organizationId) {
    current = { organizationId, generation: stored.generation + 1, value: initialize() };
    // Reset only this draft field before children commit stale academy data.
    // The manager's pending command, mutex and busy state remain outside it.
    setStored(current);
  }
  const generation = current.generation;
  const update = useCallback<Dispatch<SetStateAction<T>>>((action) => {
    setStored(previous => {
      // Also fence A -> B -> A: a callback from the first A cannot edit the new A.
      if (previous.organizationId !== organizationId || previous.generation !== generation) return previous;
      const value = typeof action === "function"
        ? (action as (previous: T) => T)(previous.value)
        : action;
      return { ...previous, value };
    });
  }, [organizationId, generation]);
  return [current.value, update];
}

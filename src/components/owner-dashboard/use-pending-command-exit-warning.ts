"use client";

import { useEffect, type RefObject } from "react";

// Registered only by client effects, never during SSR. Keep no serialized
// command, token or payload here; each callback reads its owner's current ref.
const pendingChecks = new Set<() => boolean>();

function warnBeforeLosingCommand(event: BeforeUnloadEvent) {
  for (const isPending of pendingChecks) {
    if (!isPending()) continue;
    event.preventDefault();
    event.returnValue = "pending";
    break;
  }
}

/** Warns before leaving while a command is unresolved; durability is handled by each command flow. */
export function usePendingCommandExitWarning(hasPendingCommand: boolean, pendingRef: RefObject<object | null>) {
  useEffect(() => {
    if (!hasPendingCommand) return;
    const isPending = () => pendingRef.current !== null;
    pendingChecks.add(isPending);
    if (pendingChecks.size === 1) window.addEventListener("beforeunload", warnBeforeLosingCommand);
    return () => {
      pendingChecks.delete(isPending);
      if (pendingChecks.size === 0) window.removeEventListener("beforeunload", warnBeforeLosingCommand);
    };
  }, [hasPendingCommand, pendingRef]);
}

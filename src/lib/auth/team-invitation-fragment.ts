/** Invitation credentials live only in this document's memory, never storage. */
let pendingToken: string | null = null;

/** Called by browser instrumentation before SDK initialization and by the page. */
export function captureTeamInvitationFragment(): boolean {
  if (typeof window === "undefined" || window.location.pathname !== "/staff/accept") {
    pendingToken = null;
    return false;
  }

  const fragment = window.location.hash;
  if (fragment || window.location.search) {
    // Reject ambiguous/extra fields instead of extracting a credential from them.
    const match = /^#token=([A-Za-z0-9_-]{43})$/.exec(fragment);
    pendingToken = null;
    try {
      window.history.replaceState(window.history.state, "", "/staff/accept");
      pendingToken = match?.[1] ?? null;
    } catch {
      // Never expose a credential to the page if cleaning the address failed.
      pendingToken = null;
    }
  }
  return true;
}

/** Navigation abandons an unconsumed bootstrap credential, including re-entry. */
export function discardTeamInvitationToken(): void {
  pendingToken = null;
}

/** The acceptance page takes ownership once; subsequent reads cannot reveal it. */
export function takeTeamInvitationToken(): string | null {
  const token = pendingToken;
  pendingToken = null;
  return token;
}

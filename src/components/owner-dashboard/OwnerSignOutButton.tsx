"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useHydrated } from "@/lib/auth/use-hydrated";

export function OwnerSignOutButton() {
  const router = useRouter();
  const hydrated = useHydrated();
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signOut() {
    if (!hydrated || pending.current) return;
    pending.current = true;
    setBusy(true);
    setFailed(false);
    try {
      // End this browser session without revoking the user's other sessions.
      const { error } = await createClient().auth.signOut({ scope: "local" });
      if (error) throw error;
      router.replace("/auth/login");
      router.refresh();
    } catch {
      setFailed(true);
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="shrink-0 text-right">
      <button
        type="button"
        onClick={signOut}
        disabled={!hydrated || busy}
        aria-busy={busy}
        className="touch-target inline-flex items-center justify-center rounded-full border border-slate-400 px-3 text-xs font-semibold text-slate-800 hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800 disabled:cursor-wait disabled:opacity-60"
      >
        {busy ? "Cerrando sesión…" : "Cerrar sesión"}
      </button>
      {failed ? (
        <p role="alert" className="mt-2 max-w-48 text-xs text-red-800">
          No se pudo cerrar la sesión. Inténtalo de nuevo.
        </p>
      ) : null}
    </div>
  );
}

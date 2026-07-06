"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { useDevSession } from "@/components/dev-session-provider";

export default function AppLanding() {
  const router = useRouter();
  const { session, loading, refresh } = useDevSession();
  const [resolving, setResolving] = useState(true);

  useEffect(() => {
    if (loading) return;

    // 1) Sesión demo (solo en desarrollo).
    if (session?.academyId) {
      router.replace(`/app/${session.academyId}/dashboard`);
      return;
    }

    // 2) Academia real del usuario (activeAcademyId o membership).
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/billing/user-academies", { credentials: "include" });
        if (res.ok) {
          const json = await res.json();
          const academyId = json?.data?.academyId;
          if (academyId && !cancelled) {
            router.replace(`/app/${academyId}/dashboard`);
            return;
          }
        }
      } catch {
        // ignore; se muestra el estado sin academia
      }
      if (!cancelled) setResolving(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [loading, router, session?.academyId]);

  const isResolving = loading || resolving;

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-semibold">Preparando tu panel...</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        {isResolving
          ? "Buscando tu academia..."
          : "No encontramos una academia asociada a tu cuenta. Completa el onboarding para crear tu academia."}
      </p>
      {!isResolving && (
        <button
          type="button"
          onClick={refresh}
          className="rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
        >
          Reintentar
        </button>
      )}
    </div>
  );
}

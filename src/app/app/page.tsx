"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useDevSession } from "@/components/dev-session-provider";

export default function AppLanding() {
  const router = useRouter();
  const { session, loading, refresh } = useDevSession();

  useEffect(() => {
    if (loading) return;
    if (session?.academyId) {
      router.replace(`/app/${session.academyId}/dashboard`);
    }
  }, [loading, router, session?.academyId]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-semibold">Preparando tu panel...</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        {loading
          ? "Creando sesión demo"
          : "No encontramos una academia activa. Completa el onboarding o refresca la sesión demo."}
      </p>
      <button
        type="button"
        onClick={refresh}
        className="rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
      >
        Refrescar sesión demo
      </button>
    </div>
  );
}


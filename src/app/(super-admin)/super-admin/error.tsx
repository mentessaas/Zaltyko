"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { logger } from "@/lib/logger";

export default function SuperAdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("Super-admin segment failed to render", error, {
      digest: error.digest,
    });
  }, [error]);

  return (
    <main
      role="alert"
      aria-live="assertive"
      className="mx-auto flex min-h-[60vh] w-full max-w-xl items-center justify-center px-4 py-12"
    >
      <section className="w-full rounded-2xl border border-zaltyko-coral/30 bg-zaltyko-coral/10 p-6 text-center shadow-soft sm:p-8">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-zaltyko-coral/15 text-zaltyko-coral">
          <AlertTriangle className="h-6 w-6" aria-hidden="true" />
        </div>
        <h1 className="mt-5 font-display text-xl font-semibold text-white">
          No se pudo cargar este control
        </h1>
        <p className="mt-2 text-sm leading-6 text-white/65">
          La vista encontró un problema temporal. Puedes reintentar sin perder tu sesión.
        </p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <Button type="button" onClick={reset} className="gap-2 bg-zaltyko-coral text-white hover:bg-zaltyko-coral/90">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Reintentar
          </Button>
          <Button asChild type="button" variant="outline" className="gap-2 border-white/20 bg-white/5 text-white hover:bg-white/10">
            <Link href="/super-admin/dashboard">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Volver al dashboard
            </Link>
          </Button>
        </div>
      </section>
    </main>
  );
}

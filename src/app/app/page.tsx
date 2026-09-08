"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Compass } from "lucide-react";

import { useDevSession } from "@/components/dev-session-provider";
import { EmptyState } from "@/components/ui/empty-state";

export default function AppLanding() {
  const router = useRouter();
  const { session, loading, refresh } = useDevSession();
  const [resolving, setResolving] = useState(true);

  useEffect(() => {
    if (loading) return;

    // Primero resolvemos la sesión real para no mandar a un coach al dashboard
    // administrativo, que lo redirige a una superficie incorrecta.
    let cancelled = false;
    (async () => {
      try {
        const authResponse = await fetch("/api/auth/check", { credentials: "include" });
        if (authResponse.ok) {
          const authJson = await authResponse.json();
          const authData = authJson?.data ?? authJson;
          if (authData?.authenticated && authData.academyId && !cancelled) {
            const destination = authData.role === "coach" ? "coach" : authData.role === "parent" || authData.role === "athlete" ? "my-dashboard" : "dashboard";
            router.replace(`/app/${authData.academyId}/${destination}`);
            return;
          }
        }

        // Sesión demo (solo en desarrollo).
        if (session?.academyId && !cancelled) {
          router.replace(`/app/${session.academyId}/dashboard`);
          return;
        }

        // Academia real del usuario (activeAcademyId o membership).
        const res = await fetch("/api/billing/user-academies", { credentials: "include" });
        if (res.status === 401 || res.status === 403) {
          if (!cancelled) router.replace("/auth/login");
          return;
        }
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

  if (isResolving) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 bg-background p-8 text-center">
        <h1 className="text-2xl font-semibold">Preparando tu panel...</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Buscando tu academia...
        </p>
      </div>
    );
  }

  // Dead-end del resolver: usuario autenticado sin academia. Antes: solo
  // un `<button>Reintentar</button>` sin escapatoria — la critique Operate
  // P1 #6 describe el loop de "cierra la pestaña, vuelve, hace clic 3x,
  // no progresa". Ahora: EmptyState con CTA primaria a `/onboarding/owner`
  // (la única ruta real de setup que existe en el tree) + "Reintentar"
  // como secundaria (caso "me acaban de agregar a una academia, refresh
  // para recoger el cambio"). El wrapper gana `bg-background` para que el
  // botón no quede invisible en light theme.
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center bg-background p-8">
      <EmptyState
        icon={Compass}
        title="Aún no tienes una academia asignada"
        description="Si te registraste como dueño, completa el setup inicial para crear tu academia. Si te invitó un admin y acabas de ser agregado, reintenta para recoger el cambio."
        action={
          <Link
            href="/onboarding/owner"
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-zaltyko-teal px-4 py-2 text-sm font-semibold text-white shadow-soft transition hover:bg-primary-dark"
          >
            Iniciar onboarding
          </Link>
        }
        secondaryAction={
          <button
            type="button"
            onClick={refresh}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-white px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-muted/50"
          >
            Reintentar
          </button>
        }
      />
    </div>
  );
}

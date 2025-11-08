"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { useDevSession } from "@/components/dev-session-provider";

type PlanCode = "free" | "pro" | "premium";

const PLAN_STEPS: Record<PlanCode, { title: string; price: string; description: string; action: string }> = {
  free: {
    title: "Free",
    price: "0 €",
    description: "Hasta 50 atletas. Puedes ampliar más adelante.",
    action: "Continuar con Free",
  },
  pro: {
    title: "Pro",
    price: "19 €/mes",
    description: "Hasta 200 atletas, métricas avanzadas y soporte prioritario.",
    action: "Upgrade a Pro",
  },
  premium: {
    title: "Premium",
    price: "49 €/mes",
    description: "Atletas ilimitados e integraciones exclusivas.",
    action: "Upgrade a Premium",
  },
};

interface CoachInput {
  name: string;
  email: string;
}

interface AthleteInput {
  name: string;
}

type StepKey = 1 | 2 | 3 | 4;

export default function OnboardingWizard() {
  const router = useRouter();
  const { session, loading: loadingSession, update, refresh } = useDevSession();
  const [step, setStep] = useState<StepKey>(1);
  const [academyId, setAcademyId] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [coaches, setCoaches] = useState<CoachInput[]>([{ name: "", email: "" }]);
  const [athletes, setAthletes] = useState<AthleteInput[]>([
    { name: "" },
    { name: "" },
    { name: "" },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [planLoading, setPlanLoading] = useState<PlanCode | null>(null);

  useEffect(() => {
    if (!academyId && session?.academyId) {
      setAcademyId(session.academyId);
    }
    if (!tenantId && session?.tenantId) {
      setTenantId(session.tenantId);
    }
  }, [academyId, session?.academyId, session?.tenantId, tenantId]);

  const canGoNext = useMemo(() => {
    if (step === 1) return Boolean(academyId);
    if (step === 2) {
      return coaches.every(
        (coach) => (coach.name && coach.email) || (!coach.name && !coach.email)
      );
    }
    return true;
  }, [academyId, coaches, step]);

  const handleCreateAcademy = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session?.userId) {
      setError("No encontramos un usuario demo. Refresca la sesión e inténtalo nuevamente.");
      return;
    }
    setLoading(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const res = await fetch("/api/academies", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": session.userId,
        },
        body: JSON.stringify({
          name: form.get("name"),
          country: form.get("country"),
          region: form.get("region"),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Error al crear la academia");
      setAcademyId(data.id);
      setTenantId(data.tenantId);
      update({ academyId: data.id, tenantId: data.tenantId ?? session.tenantId });
      setStep(2);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleInviteCoaches = async () => {
    if (!academyId || !session?.userId) {
      setError("Completa el paso anterior o refresca la sesión demo.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload = coaches.filter((coach) => coach.name && coach.email);
      for (const coach of payload) {
        await fetch("/api/coaches", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-user-id": session.userId,
          },
          body: JSON.stringify({
            academyId,
            name: coach.name,
            email: coach.email,
          }),
        });
      }
      setStep(3);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAthletes = async () => {
    if (!academyId || !session?.userId) {
      setError("Completa los pasos previos o refresca la sesión demo.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload = athletes.filter((athlete) => athlete.name);
      for (const athlete of payload) {
        await fetch("/api/athletes", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-user-id": session.userId,
          },
          body: JSON.stringify({
            academyId,
            name: athlete.name,
          }),
        });
      }
      setStep(4);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePlanSelection = async (plan: PlanCode) => {
    if (!academyId || !session?.userId) {
      setError("No encontramos una academia activa. Refresca la sesión demo.");
      return;
    }
    if (plan === "free") {
      update({ academyId });
      router.push(`/app/${academyId}/dashboard`);
      return;
    }

    setPlanLoading(plan);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": session.userId,
        },
        body: JSON.stringify({ academyId, planCode: plan }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error ?? "No se pudo iniciar la suscripción");
      }

      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      }
    } catch (err: any) {
      setError(err.message ?? "Error desconocido");
    } finally {
      setPlanLoading(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Onboarding de tu Academia</h1>
        <p className="text-muted-foreground">Completa los pasos para preparar tu espacio.</p>
      </header>

      <ol className="flex items-center gap-4">
        {[1, 2, 3, 4].map((value) => (
          <li
            key={value}
            className={`flex h-10 w-10 items-center justify-center rounded-full border ${
              step >= value ? "bg-primary text-white" : "bg-muted text-muted-foreground"
            }`}
          >
            {value}
          </li>
        ))}
      </ol>

      {error && (
        <p className="rounded border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {!session?.userId && !loadingSession && (
        <div className="space-y-3 rounded border border-amber-400/50 bg-amber-400/10 p-3 text-sm text-amber-200">
          <p>
            No detectamos un usuario demo. Desde la portada pulsa "Crear academia demo" o refresca la sesión usando el botón inferior.
          </p>
          <button
            type="button"
            onClick={refresh}
            className="inline-flex items-center justify-center rounded-full border border-amber-300/60 px-3 py-1 text-xs font-semibold text-amber-100 hover:bg-amber-400/20"
          >
            Refrescar sesión demo
          </button>
        </div>
      )}
      {session?.userId && (
        <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-xs text-slate-200/80">
          <p>
            Usuario demo: <code className="rounded bg-black/40 px-2 py-1">{session.userId}</code>
          </p>
          {academyId && (
            <p className="mt-2">
              Academia activa: <code className="rounded bg-black/40 px-2 py-1">{academyId}</code>
            </p>
          )}
          <button
            type="button"
            onClick={refresh}
            className="mt-3 inline-flex items-center justify-center rounded-full border border-white/20 px-3 py-1 text-xs font-semibold text-white hover:bg-white/10"
          >
            Refrescar sesión demo
          </button>
        </div>
      )}

      {step === 1 && (
        <form onSubmit={handleCreateAcademy} className="space-y-4">
          <div>
            <label className="block text-sm font-medium">Nombre de la academia</label>
            <input name="name" required className="mt-1 w-full rounded border px-3 py-2" />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium">País</label>
              <input name="country" className="mt-1 w-full rounded border px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm font-medium">Región</label>
              <input name="region" className="mt-1 w-full rounded border px-3 py-2" />
            </div>
          </div>
          <button
            type="submit"
            className="rounded-md bg-primary px-4 py-2 text-white disabled:opacity-50"
            disabled={loading}
          >
            Guardar y continuar
          </button>
        </form>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <h2 className="text-xl font-medium">Paso 2 · Invita a tus entrenadores</h2>
          {coaches.map((coach, index) => (
            <div key={index} className="grid gap-3 md:grid-cols-2">
              <input
                placeholder="Nombre"
                value={coach.name}
                onChange={(event) => {
                  const value = event.target.value;
                  setCoaches((prev) => {
                    const copy = [...prev];
                    copy[index] = { ...copy[index], name: value };
                    return copy;
                  });
                }}
                className="rounded border px-3 py-2"
              />
              <input
                placeholder="Email"
                value={coach.email}
                onChange={(event) => {
                  const value = event.target.value;
                  setCoaches((prev) => {
                    const copy = [...prev];
                    copy[index] = { ...copy[index], email: value };
                    return copy;
                  });
                }}
                className="rounded border px-3 py-2"
              />
            </div>
          ))}
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded border px-3 py-2"
            onClick={() => setCoaches((prev) => [...prev, { name: "", email: "" }])}
            >
              Añadir coach
            </button>
            <button
              type="button"
              className="rounded-md bg-primary px-4 py-2 text-white disabled:opacity-50"
              disabled={loading || !canGoNext}
              onClick={handleInviteCoaches}
            >
              Guardar y continuar
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <h2 className="text-xl font-medium">Paso 3 · Registra a tus primeras atletas</h2>
          {athletes.map((athlete, index) => (
            <div key={index} className="grid gap-3 md:grid-cols-2">
              <input
                placeholder="Nombre"
                value={athlete.name}
                onChange={(event) => {
                  const value = event.target.value;
                  setAthletes((prev) => {
                    const copy = [...prev];
                    copy[index] = { ...copy[index], name: value };
                    return copy;
                  });
                }}
                className="rounded border px-3 py-2"
              />
            </div>
          ))}
          <button
            type="button"
            className="rounded-md bg-primary px-4 py-2 text-white disabled:opacity-50"
            disabled={loading || !canGoNext}
            onClick={handleCreateAthletes}
          >
            Guardar y continuar
          </button>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-medium">Paso 4 · Elige tu plan</h2>
            <p className="text-muted-foreground">
              Puedes comenzar en Free y escalar cuando lo necesites.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {(Object.entries(PLAN_STEPS) as [PlanCode, typeof PLAN_STEPS[PlanCode]][]).map(
              ([code, info]) => (
                <article
                  key={code}
                  className={`rounded-lg border p-6 shadow-sm ${code === "pro" ? "border-primary" : ""}`}
                >
                  <h3 className="text-lg font-semibold">{info.title}</h3>
                  <p className="mt-1 text-xl font-bold">{info.price}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{info.description}</p>
                  <button
                    onClick={() => handlePlanSelection(code)}
                    disabled={planLoading === code}
                    className="mt-4 w-full rounded-md bg-primary px-4 py-2 text-white disabled:opacity-50"
                  >
                    {planLoading === code ? "Redirigiendo…" : info.action}
                  </button>
                </article>
              )
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            ¿No estás listo? Puedes cambiar de plan más tarde desde "Facturación".
          </p>
        </div>
      )}
    </div>
  );
}

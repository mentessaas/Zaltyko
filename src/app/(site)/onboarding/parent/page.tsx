"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast-provider";
import { Button } from "@/components/ui/button";
import { RoleOnboardingShell, onboardingUi } from "@/components/onboarding/RoleOnboardingShell";
import { CheckCircle2, Users, Calendar, Bell, ArrowRight } from "lucide-react";

interface AthleteChild {
  id: string;
  name: string;
  academyName: string;
}

type Step = "welcome" | "children" | "notifications" | "done";

export default function ParentOnboardingPage() {
  const router = useRouter();
  const toast = useToast();
  const [step, setStep] = useState<Step>("welcome");
  const [loading, setLoading] = useState(false);
  const [children, setChildren] = useState<AthleteChild[]>([]);
  const [loadingChildren, setLoadingChildren] = useState(true);
  const [notifications, setNotifications] = useState({
    evaluations: true,
    attendance: true,
    events: true,
    billing: false,
  });

  useEffect(() => {
    fetchChildren();
  }, []);

  async function fetchChildren() {
    setLoadingChildren(true);
    try {
      const res = await fetch("/api/family/children");
      if (res.ok) {
        const data = await res.json();
        setChildren(data.children ?? []);
      } else {
        setChildren([]);
      }
    } catch {
      setChildren([]);
    } finally {
      setLoadingChildren(false);
    }
  }

  async function handleFinish() {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No user");

      const profileResponse = await fetch("/api/onboarding/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-id": user.id },
        body: JSON.stringify({ role: "parent" }),
      });
      if (!profileResponse.ok) {
        const payload = await profileResponse.json().catch(() => null);
        throw new Error(payload?.message ?? "No se pudo guardar tu perfil. Inténtalo de nuevo.");
      }

      // Las preferencias no deben bloquear el alta, pero el perfil sí: solo
      // mostramos el estado final después de confirmar el paso crítico.
      await fetch("/api/onboarding/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(notifications),
      }).catch(() => {});

      setStep("done");
      setTimeout(() => {
        router.push("/dashboard");
      }, 2000);
    } catch (err) {
      toast.pushToast({
        title: "Error",
        description: err instanceof Error ? err.message : "No se pudo completar.",
        variant: "error",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <RoleOnboardingShell>
      {step === "welcome" && (
        <section className={onboardingUi.panel}>
          <div className="space-y-6">
            <div className="space-y-3">
              <h1 className={onboardingUi.title}>Bienvenido/a</h1>
              <p className={onboardingUi.lede}>
                Para consultar información de una academia, tu cuenta debe estar asociada y
                contar con los permisos correspondientes.
              </p>
            </div>

            <div className={onboardingUi.list}>
              <div className={onboardingUi.listRow}>
                <Calendar aria-hidden className={onboardingUi.rowIcon} />
                <div>
                  <p className={onboardingUi.rowTitle}>Vínculo con la academia</p>
                  <p className="text-xs text-ramp-600">Necesitas una cuenta asociada a la academia.</p>
                </div>
              </div>
              <div className={onboardingUi.listRow}>
                <Users aria-hidden className={onboardingUi.rowIcon} />
                <div>
                  <p className={onboardingUi.rowTitle}>Datos disponibles</p>
                  <p className="text-xs text-ramp-600">Solo podrás consultar información autorizada para tu cuenta.</p>
                </div>
              </div>
              <div className={onboardingUi.listRow}>
                <Bell aria-hidden className={onboardingUi.rowIcon} />
                <div>
                  <p className={onboardingUi.rowTitle}>Permisos de acceso</p>
                  <p className="text-xs text-ramp-600">La asociación no concede acceso a la gestión de la academia.</p>
                </div>
              </div>
            </div>

            <Button onClick={() => setStep("children")} className="w-full" size="lg">
              Continuar
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </section>
      )}

      {step === "children" && (
        <section className={onboardingUi.panel}>
          <div className="space-y-4">
            <div>
              <h2 className={onboardingUi.stepTitle}>Tus hijos/as</h2>
              <p className={onboardingUi.subtitle}>
                Hijos vinculados a tu cuenta a través de invitaciones.
              </p>
            </div>

            {loadingChildren ? (
              <div className="flex justify-center py-6">
                <div role="status" aria-label="Cargando" className={onboardingUi.spinner} />
              </div>
            ) : children.length === 0 ? (
              <div className="text-center py-6 space-y-2">
                <p className="text-sm text-ramp-600">
                  No tienes hijos vinculados todavía.
                </p>
                <p className="text-xs text-ramp-600">
                  Un administrador de la academia debe vincular a tus hijos con tu cuenta.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {children.map((child) => (
                  <div key={child.id} className={onboardingUi.item}>
                    <div>
                      <p className="font-semibold text-mat-night">{child.name}</p>
                      <p className="text-xs text-ramp-600">{child.academyName}</p>
                    </div>
                    <CheckCircle2 aria-hidden className="h-5 w-5 text-mat" />
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep("welcome")} className="flex-1">
                Atrás
              </Button>
              <Button onClick={() => setStep("notifications")} className="flex-1">
                Siguiente
              </Button>
            </div>
          </div>
        </section>
      )}

      {step === "notifications" && (
        <section className={onboardingUi.panel}>
          <div className="space-y-4">
            <div>
              <h2 className={onboardingUi.stepTitle}>Preferencias de tu cuenta</h2>
              <p className={onboardingUi.subtitle}>
                Los datos disponibles dependen de los permisos asignados a tu cuenta.
              </p>
            </div>

            <div className="space-y-3">
              {[
                { key: "evaluations", label: "Evaluaciones", desc: "Esta preferencia no habilita el acceso a evaluaciones." },
                { key: "attendance", label: "Asistencia", desc: "Esta preferencia no habilita el acceso a la asistencia." },
                { key: "events", label: "Eventos", desc: "Esta preferencia no habilita el acceso a eventos." },
                { key: "billing", label: "Cuotas", desc: "Esta preferencia no habilita el acceso a cuotas." },
              ].map((item) => (
                <label key={item.key} className="flex min-h-11 cursor-pointer items-center justify-between rounded-[10px] border border-chalk-line bg-white p-3 transition-colors hover:bg-mat-wash">
                  <div>
                    <p className={onboardingUi.rowTitle}>{item.label}</p>
                    <p className="text-xs text-ramp-600">{item.desc}</p>
                  </div>
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-ramp-300 text-mat focus:ring-mat"
                    checked={notifications[item.key as keyof typeof notifications]}
                    onChange={(e) =>
                      setNotifications((n) => ({ ...n, [item.key]: e.target.checked }))
                    }
                  />
                </label>
              ))}
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep("children")} className="flex-1">
                Atrás
              </Button>
              <Button onClick={handleFinish} disabled={loading} className="flex-1">
                {loading ? "Guardando..." : "Ir a mi panel"}
              </Button>
            </div>
          </div>
        </section>
      )}

      {step === "done" && (
        <section className={onboardingUi.panel}>
          <div className="space-y-4">
            <CheckCircle2 aria-hidden className="h-6 w-6 text-mat" />
            <h2 className={onboardingUi.stepTitle}>¡Listo!</h2>
            <p className="text-sm text-ramp-600">
              Perfil configurado. Redirigiendo a tu panel...
            </p>
          </div>
        </section>
      )}
    </RoleOnboardingShell>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast-provider";
import { Button } from "@/components/ui/button";
import { RoleOnboardingShell, onboardingUi } from "@/components/onboarding/RoleOnboardingShell";
import { CheckCircle2, User, Calendar, BarChart3, ArrowRight } from "lucide-react";

interface AthleteAcademy {
  id: string;
  name: string;
  role: string;
}

type Step = "welcome" | "academies" | "profile" | "done";

export default function AthleteOnboardingPage() {
  const router = useRouter();
  const toast = useToast();
  const [step, setStep] = useState<Step>("welcome");
  const [loading, setLoading] = useState(false);
  const [academies, setAcademies] = useState<AthleteAcademy[]>([]);
  const [loadingAcademies, setLoadingAcademies] = useState(true);
  const [profile, setProfile] = useState({
    name: "",
    phone: "",
    level: "",
  });

  useEffect(() => {
    fetchAcademies();
  }, []);

  async function fetchAcademies() {
    setLoadingAcademies(true);
    try {
      const res = await fetch("/api/onboarding/athlete-academies");
      if (res.ok) {
        const payload = await res.json();
        const data = payload?.data ?? payload;
        setAcademies(data?.academies ?? []);
      }
    } catch {
      setAcademies([]);
    } finally {
      setLoadingAcademies(false);
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: profile.name || user.email,
          role: "athlete",
        }),
      });
      if (!profileResponse.ok) {
        const payload = await profileResponse.json().catch(() => null);
        throw new Error(payload?.message ?? "No se pudo guardar tu perfil. Inténtalo de nuevo.");
      }

      setStep("done");
      setTimeout(() => {
        if (academies.length > 0) {
          router.push(`/app/${academies[0].id}/dashboard`);
        } else {
          router.push("/dashboard");
        }
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
      {/* Welcome Step */}
      {step === "welcome" && (
        <section className={onboardingUi.panel}>
          <div className="space-y-6">
            <div className="space-y-3">
              <h1 className={onboardingUi.title}>Bienvenido/a, gimnasta</h1>
              <p className={onboardingUi.lede}>
                Con tu cuenta personal podrás consultar tu calendario de clases,
                ver tu progreso y compartirlo con tu familia.
              </p>
            </div>

            <div className={onboardingUi.list}>
              <div className={onboardingUi.listRow}>
                <Calendar aria-hidden className={onboardingUi.rowIcon} />
                <div>
                  <p className={onboardingUi.rowTitle}>Tu calendario</p>
                  <p className="text-xs text-ramp-600">Consulta horarios y eventos de tus clases</p>
                </div>
              </div>
              <div className={onboardingUi.listRow}>
                <BarChart3 aria-hidden className={onboardingUi.rowIcon} />
                <div>
                  <p className={onboardingUi.rowTitle}>Tu progreso</p>
                  <p className="text-xs text-ramp-600">Historial de evaluaciones técnicas</p>
                </div>
              </div>
              <div className={onboardingUi.listRow}>
                <User aria-hidden className={onboardingUi.rowIcon} />
                <div>
                  <p className={onboardingUi.rowTitle}>Comparte con tu familia</p>
                  <p className="text-xs text-ramp-600">Tu familia puede seguir tu avance</p>
                </div>
              </div>
            </div>

            <Button onClick={() => setStep("academies")} className="w-full" size="lg">
              Continuar
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </section>
      )}

      {/* Academies Step */}
      {step === "academies" && (
        <section className={onboardingUi.panel}>
          <div className="space-y-4">
            <div>
              <h2 className={onboardingUi.stepTitle}>Tu academia</h2>
              <p className={onboardingUi.subtitle}>
                Has sido invitado/a a las siguientes academias.
              </p>
            </div>

            {loadingAcademies ? (
              <div className="flex justify-center py-6">
                <div role="status" aria-label="Cargando" className={onboardingUi.spinner} />
              </div>
            ) : academies.length === 0 ? (
              <div className="text-center py-6 text-ramp-600">
                <p className="text-sm">No tienes academias vinculadas todavía.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {academies.map((academy) => (
                  <div
                    key={academy.id}
                    className={onboardingUi.item}
                  >
                    <div>
                      <p className="font-semibold text-mat-night">{academy.name}</p>
                      <p className="text-xs capitalize text-ramp-600">{academy.role}</p>
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
              <Button onClick={() => setStep("profile")} className="flex-1">
                Siguiente
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* Profile Step */}
      {step === "profile" && (
        <section className={onboardingUi.panel}>
          <div className="space-y-4">
            <div>
              <h2 className={onboardingUi.stepTitle}>Tu perfil</h2>
              <p className={onboardingUi.subtitle}>
                Completa tu perfil de gimnasta (opcional).
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className={onboardingUi.label}>Nombre completo</label>
                <input
                  type="text"
                  className={onboardingUi.field}
                  placeholder="Tu nombre"
                  value={profile.name}
                  onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
                />
              </div>
              <div>
                <label className={onboardingUi.label}>Nivel</label>
                <select
                  className={onboardingUi.field}
                  value={profile.level}
                  onChange={(e) => setProfile((p) => ({ ...p, level: e.target.value }))}
                >
                  <option value="">Selecciona...</option>
                  <option value="beginner">Iniciación</option>
                  <option value="intermediate">Intermedio</option>
                  <option value="advanced">Avanzado</option>
                  <option value="professional">Profesional</option>
                </select>
              </div>
              <div>
                <label className={onboardingUi.label}>Teléfono</label>
                <input
                  type="tel"
                  className={onboardingUi.field}
                  placeholder="+34 600 000 000"
                  value={profile.phone}
                  onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep("academies")} className="flex-1">
                Atrás
              </Button>
              <Button onClick={handleFinish} disabled={loading} className="flex-1">
                {loading ? "Guardando..." : "Ir a mi panel"}
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* Done Step */}
      {step === "done" && (
        <section className={onboardingUi.panel}>
          <div className="space-y-4">
            <CheckCircle2 aria-hidden className="h-6 w-6 text-mat" />
            <h2 className={onboardingUi.stepTitle}>¡Listo!</h2>
            <p className="text-sm text-ramp-600">
              Perfil guardado. Redirigiendo a tu panel...
            </p>
          </div>
        </section>
      )}
    </RoleOnboardingShell>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast-provider";
import { Button } from "@/components/ui/button";
import { RoleOnboardingShell, onboardingUi } from "@/components/onboarding/RoleOnboardingShell";
import { CheckCircle2, Users, BarChart3, Calendar, ArrowRight } from "lucide-react";

interface AcademySummary {
  id: string;
  name: string;
  role: string;
}

type Step = "welcome" | "academies" | "profile" | "done";

export default function CoachOnboardingPage() {
  const router = useRouter();
  const toast = useToast();
  const [step, setStep] = useState<Step>("welcome");
  const [loading, setLoading] = useState(false);
  const [academies, setAcademies] = useState<AcademySummary[]>([]);
  const [loadingAcademies, setLoadingAcademies] = useState(true);
  const [profile, setProfile] = useState({
    name: "",
    specialty: "",
    phone: "",
  });

  useEffect(() => {
    fetchAcademies();
  }, []);

  async function fetchAcademies() {
    setLoadingAcademies(true);
    try {
      const res = await fetch("/api/onboarding/user-academies");
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

      const res = await fetch("/api/onboarding/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-id": user.id },
        body: JSON.stringify({
          name: profile.name || user.email,
          role: "coach",
        }),
      });

      if (!res.ok) throw new Error("Failed to update profile");

      setStep("done");
      setTimeout(() => {
        if (academies.length > 0) {
          router.push(`/owner`);
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
              <h1 className={onboardingUi.title}>Bienvenido/a, entrenador/a</h1>
              <p className={onboardingUi.lede}>
                Te damos la bienvenida a Zaltyko. Con tu cuenta podrás gestionar clases,
                registrar gimnastas y compartir evaluaciones técnicas.
              </p>
            </div>

            <div className={onboardingUi.list}>
              <div className={onboardingUi.listRow}>
                <Calendar aria-hidden className={onboardingUi.rowIcon} />
                <div>
                  <p className={onboardingUi.rowTitle}>Gestión de clases</p>
                  <p className="text-xs text-ramp-600">Organiza horarios y pasa lista</p>
                </div>
              </div>
              <div className={onboardingUi.listRow}>
                <Users aria-hidden className={onboardingUi.rowIcon} />
                <div>
                  <p className={onboardingUi.rowTitle}>Registro de gimnastas</p>
                  <p className="text-xs text-ramp-600">Controla quién asiste a cada sesión</p>
                </div>
              </div>
              <div className={onboardingUi.listRow}>
                <BarChart3 aria-hidden className={onboardingUi.rowIcon} />
                <div>
                  <p className={onboardingUi.rowTitle}>Evaluaciones técnicas</p>
                  <p className="text-xs text-ramp-600">Registra progresiones y comparte con familias</p>
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
              <h2 className={onboardingUi.stepTitle}>Tus academias</h2>
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
                Completa tu perfil de entrenador/a (opcional).
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
                <label className={onboardingUi.label}>Especialidad</label>
                <select
                  className={onboardingUi.field}
                  value={profile.specialty}
                  onChange={(e) => setProfile((p) => ({ ...p, specialty: e.target.value }))}
                >
                  <option value="">Selecciona...</option>
                  <option value="artistica_femenina">Gimnasia artística femenina</option>
                  <option value="artistica_masculina">Gimnasia artística masculina</option>
                  <option value="ritmica">Gimnasia rítmica</option>
                  <option value="trampolin">Trampolín</option>
                  <option value="parkour">Parkour</option>
                  <option value="general">General</option>
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

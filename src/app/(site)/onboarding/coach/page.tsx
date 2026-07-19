"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
        const data = await res.json();
        setAcademies(data.academies ?? []);
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
    <div className="flex min-h-screen items-center justify-center bg-zaltyko-white p-4">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="mb-8 text-center">
          <Link href="/" className="inline-flex items-center gap-2">
            <Image
              src="/branding/zaltyko/logo-zaltyko.svg"
              alt="Zaltyko"
              width={132}
              height={38}
              className="h-9 w-auto"
              priority
            />
          </Link>
        </div>

        {/* Welcome Step */}
        {step === "welcome" && (
          <Card className="rounded-card border-zaltyko-mist shadow-soft">
            <CardContent className="p-8 space-y-6">
              <div className="text-center space-y-2">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-zaltyko-primary-ultralight">
                  <Users className="h-8 w-8 text-zaltyko-teal" />
                </div>
                <h1 className="text-2xl font-bold text-zaltyko-navy">Bienvenido/a, entrenador/a</h1>
                <p className="text-muted-foreground">
                  Te damos la bienvenida a Zaltyko. Con tu cuenta podrás gestionar clases,
                  registrar atletas y compartir evaluaciones técnicas.
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-start gap-3 rounded-card bg-zaltyko-white p-3">
                  <Calendar className="h-5 w-5 mt-0.5 text-zaltyko-teal" />
                  <div>
                    <p className="font-medium text-sm">Gestión de clases</p>
                    <p className="text-xs text-muted-foreground">Organiza horarios y registra asistencia</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-card bg-zaltyko-white p-3">
                  <Users className="h-5 w-5 mt-0.5 text-zaltyko-teal" />
                  <div>
                    <p className="font-medium text-sm">Registro de atletas</p>
                    <p className="text-xs text-muted-foreground">Controla quién asiste a cada entreno</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-card bg-zaltyko-white p-3">
                  <BarChart3 className="h-5 w-5 mt-0.5 text-zaltyko-teal" />
                  <div>
                    <p className="font-medium text-sm">Evaluaciones técnicas</p>
                    <p className="text-xs text-muted-foreground">Registra progresiones y comparte con familias</p>
                  </div>
                </div>
              </div>

              <Button onClick={() => setStep("academies")} className="w-full" size="lg">
                Continuar
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Academies Step */}
        {step === "academies" && (
          <Card className="rounded-card border-zaltyko-mist shadow-soft">
            <CardContent className="p-8 space-y-4">
              <div className="text-center">
                <h2 className="text-xl font-bold text-zaltyko-navy">Tus academias</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Has sido invitado/a a las siguientes academias.
                </p>
              </div>

              {loadingAcademies ? (
                <div className="flex justify-center py-6">
                  <div className="h-6 w-6 rounded-full border-2 border-zaltyko-teal border-t-transparent animate-spin" />
                </div>
              ) : academies.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <p className="text-sm">No tienes academias vinculadas todavía.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {academies.map((academy) => (
                    <div
                      key={academy.id}
                      className="flex items-center justify-between rounded-card border border-zaltyko-mist bg-zaltyko-white p-3"
                    >
                      <div>
                        <p className="font-medium">{academy.name}</p>
                        <p className="text-xs text-muted-foreground capitalize">{academy.role}</p>
                      </div>
                      <CheckCircle2 className="h-5 w-5 text-zaltyko-teal" />
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
            </CardContent>
          </Card>
        )}

        {/* Profile Step */}
        {step === "profile" && (
          <Card className="rounded-card border-zaltyko-mist shadow-soft">
            <CardContent className="p-8 space-y-4">
              <div className="text-center">
                <h2 className="text-xl font-bold text-zaltyko-navy">Tu perfil</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Completa tu perfil de entrenador/a (opcional).
                </p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium">Nombre completo</label>
                  <input
                    type="text"
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    placeholder="Tu nombre"
                    value={profile.name}
                    onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Especialidad</label>
                  <select
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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
                  <label className="text-sm font-medium">Teléfono</label>
                  <input
                    type="tel"
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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
                  {loading ? "Guardando..." : "Ir al dashboard"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Done Step */}
        {step === "done" && (
          <Card className="rounded-card border-zaltyko-mist shadow-soft">
            <CardContent className="p-8 space-y-4 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-zaltyko-primary-ultralight">
                <CheckCircle2 className="h-8 w-8 text-zaltyko-teal" />
              </div>
              <h2 className="text-xl font-bold text-zaltyko-navy">¡Listo!</h2>
              <p className="text-sm text-muted-foreground">
                Perfil guardado. Redirigiendo a tu dashboard...
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, User, Calendar, BarChart3, ArrowRight } from "lucide-react";

interface AthleteAcademy {
  id: string;
  name: string;
  role: string;
}

type Step = "welcome" | "academies" | "profile" | "done";

export default function AthleteOnboardingPage() {
  const router = useRouter();
  const supabase = createClient();
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No user");

      await fetch("/api/onboarding/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: profile.name || user.email,
          role: "athlete",
        }),
      });

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
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-white flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center text-white font-bold text-lg">
              Z
            </div>
            <span className="font-display font-bold text-2xl text-gray-900">Zaltyko</span>
          </Link>
        </div>

        {/* Welcome Step */}
        {step === "welcome" && (
          <Card>
            <CardContent className="p-8 space-y-6">
              <div className="text-center space-y-2">
                <div className="mx-auto w-16 h-16 rounded-full bg-purple-100 flex items-center justify-center mb-4">
                  <User className="h-8 w-8 text-purple-600" />
                </div>
                <h1 className="text-2xl font-bold">Bienvenido/a, gimnasta</h1>
                <p className="text-muted-foreground">
                  Con tu cuenta personal podrás consultar tu calendario de entrenos,
                  ver tu progreso y compartirlo con tu familia.
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 rounded-lg bg-gray-50">
                  <Calendar className="h-5 w-5 text-purple-500 mt-0.5" />
                  <div>
                    <p className="font-medium text-sm">Tu calendario</p>
                    <p className="text-xs text-muted-foreground">Consulta horarios y eventos de entreno</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg bg-gray-50">
                  <BarChart3 className="h-5 w-5 text-purple-500 mt-0.5" />
                  <div>
                    <p className="font-medium text-sm">Tu progreso</p>
                    <p className="text-xs text-muted-foreground">Historial de evaluaciones técnicas</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg bg-gray-50">
                  <User className="h-5 w-5 text-purple-500 mt-0.5" />
                  <div>
                    <p className="font-medium text-sm">Comparte con tu familia</p>
                    <p className="text-xs text-muted-foreground">Tus padres pueden seguir tu avance</p>
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
          <Card>
            <CardContent className="p-8 space-y-4">
              <div className="text-center">
                <h2 className="text-xl font-bold">Tu academia</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Has sido invitado/a a las siguientes academias.
                </p>
              </div>

              {loadingAcademies ? (
                <div className="flex justify-center py-6">
                  <div className="h-6 w-6 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" />
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
                      className="flex items-center justify-between p-3 rounded-lg border bg-gray-50"
                    >
                      <div>
                        <p className="font-medium">{academy.name}</p>
                        <p className="text-xs text-muted-foreground capitalize">{academy.role}</p>
                      </div>
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
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
          <Card>
            <CardContent className="p-8 space-y-4">
              <div className="text-center">
                <h2 className="text-xl font-bold">Tu perfil</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Completa tu perfil de gimnasta (opcional).
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
                  <label className="text-sm font-medium">Nivel</label>
                  <select
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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
          <Card>
            <CardContent className="p-8 space-y-4 text-center">
              <div className="mx-auto w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
              <h2 className="text-xl font-bold text-green-700">¡Listo!</h2>
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

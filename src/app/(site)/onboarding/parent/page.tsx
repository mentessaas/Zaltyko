"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, Users, Calendar, Bell, ArrowRight } from "lucide-react";

interface AthleteChild {
  id: string;
  name: string;
  academyName: string;
}

type Step = "welcome" | "children" | "notifications" | "done";

export default function ParentOnboardingPage() {
  const router = useRouter();
  const supabase = createClient();
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No user");

      await Promise.all([
        fetch("/api/onboarding/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-user-id": user.id },
          body: JSON.stringify({ role: "parent" }),
        }),
        fetch("/api/onboarding/notifications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(notifications),
        }).catch(() => {}),
      ]);

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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white flex items-center justify-center p-4">
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

        {step === "welcome" && (
          <Card>
            <CardContent className="p-8 space-y-6">
              <div className="text-center space-y-2">
                <div className="mx-auto w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mb-4">
                  <Users className="h-8 w-8 text-blue-600" />
                </div>
                <h1 className="text-2xl font-bold">Bienvenido/a</h1>
                <p className="text-muted-foreground">
                  Con tu cuenta de padre/madre podrás seguir el progreso de tus hijos en tiempo real:
                  evaluaciones, asistencia, eventos y mucho más.
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 rounded-lg bg-gray-50">
                  <Calendar className="h-5 w-5 text-blue-500 mt-0.5" />
                  <div>
                    <p className="font-medium text-sm">Horarios de entreno</p>
                    <p className="text-xs text-muted-foreground">Consulta el calendario de clases</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg bg-gray-50">
                  <Users className="h-5 w-5 text-blue-500 mt-0.5" />
                  <div>
                    <p className="font-medium text-sm">Evaluaciones técnicas</p>
                    <p className="text-xs text-muted-foreground">Recibe actualizaciones del progreso</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg bg-gray-50">
                  <Bell className="h-5 w-5 text-blue-500 mt-0.5" />
                  <div>
                    <p className="font-medium text-sm">Notificaciones</p>
                    <p className="text-xs text-muted-foreground">Recibe alertas de ausencia o eventos</p>
                  </div>
                </div>
              </div>

              <Button onClick={() => setStep("children")} className="w-full" size="lg">
                Continuar
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </CardContent>
          </Card>
        )}

        {step === "children" && (
          <Card>
            <CardContent className="p-8 space-y-4">
              <div className="text-center">
                <h2 className="text-xl font-bold">Tus hijos/as</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Hijos vinculados a tu cuenta a través de invitaciones.
                </p>
              </div>

              {loadingChildren ? (
                <div className="flex justify-center py-6">
                  <div className="h-6 w-6 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                </div>
              ) : children.length === 0 ? (
                <div className="text-center py-6 space-y-2">
                  <p className="text-sm text-muted-foreground">
                    No tienes hijos vinculados todavía.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Un administrador de la academia debe vincular a tus hijos con tu cuenta.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {children.map((child) => (
                    <div key={child.id} className="flex items-center justify-between p-3 rounded-lg border bg-gray-50">
                      <div>
                        <p className="font-medium">{child.name}</p>
                        <p className="text-xs text-muted-foreground">{child.academyName}</p>
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
                <Button onClick={() => setStep("notifications")} className="flex-1">
                  Siguiente
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "notifications" && (
          <Card>
            <CardContent className="p-8 space-y-4">
              <div className="text-center">
                <h2 className="text-xl font-bold">Notificaciones</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  ¿Qué quieres recibir en tu email?
                </p>
              </div>

              <div className="space-y-3">
                {[
                  { key: "evaluations", label: "Evaluaciones técnicas", desc: "Nuevas evaluaciones de tus hijos" },
                  { key: "attendance", label: "Asistencia", desc: "Ausencias y retrasos" },
                  { key: "events", label: "Eventos", desc: "Competiciones y eventos próximos" },
                  { key: "billing", label: "Facturación", desc: "Cuotas y pagos" },
                ].map((item) => (
                  <label key={item.key} className="flex items-center justify-between p-3 rounded-lg border cursor-pointer hover:bg-gray-50">
                    <div>
                      <p className="font-medium text-sm">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.desc}</p>
                    </div>
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-gray-300"
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
                  {loading ? "Guardando..." : "Ir al dashboard"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "done" && (
          <Card>
            <CardContent className="p-8 space-y-4 text-center">
              <div className="mx-auto w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
              <h2 className="text-xl font-bold text-green-700">¡Listo!</h2>
              <p className="text-sm text-muted-foreground">
                Perfil configurado. Redirigiendo a tu dashboard...
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

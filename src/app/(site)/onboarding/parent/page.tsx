"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
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

        {step === "welcome" && (
          <Card className="rounded-card border-zaltyko-mist shadow-soft">
            <CardContent className="p-8 space-y-6">
              <div className="text-center space-y-2">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-zaltyko-primary-ultralight">
                  <Users className="h-8 w-8 text-zaltyko-teal" />
                </div>
                <h1 className="text-2xl font-bold text-zaltyko-navy">Bienvenido/a</h1>
                <p className="text-muted-foreground">
                  Con tu cuenta de padre/madre podrás seguir el progreso de tus hijos en tiempo real:
                  evaluaciones, asistencia, eventos y mucho más.
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-start gap-3 rounded-card bg-zaltyko-white p-3">
                  <Calendar className="h-5 w-5 mt-0.5 text-zaltyko-teal" />
                  <div>
                    <p className="font-medium text-sm">Horarios de entreno</p>
                    <p className="text-xs text-muted-foreground">Consulta el calendario de clases</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-card bg-zaltyko-white p-3">
                  <Users className="h-5 w-5 mt-0.5 text-zaltyko-teal" />
                  <div>
                    <p className="font-medium text-sm">Evaluaciones técnicas</p>
                    <p className="text-xs text-muted-foreground">Recibe actualizaciones del progreso</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-card bg-zaltyko-white p-3">
                  <Bell className="h-5 w-5 mt-0.5 text-zaltyko-teal" />
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
          <Card className="rounded-card border-zaltyko-mist shadow-soft">
            <CardContent className="p-8 space-y-4">
              <div className="text-center">
                <h2 className="text-xl font-bold text-zaltyko-navy">Tus hijos/as</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Hijos vinculados a tu cuenta a través de invitaciones.
                </p>
              </div>

              {loadingChildren ? (
                <div className="flex justify-center py-6">
                  <div className="h-6 w-6 rounded-full border-2 border-zaltyko-teal border-t-transparent animate-spin" />
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
                    <div key={child.id} className="flex items-center justify-between rounded-card border border-zaltyko-mist bg-zaltyko-white p-3">
                      <div>
                        <p className="font-medium">{child.name}</p>
                        <p className="text-xs text-muted-foreground">{child.academyName}</p>
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
                <Button onClick={() => setStep("notifications")} className="flex-1">
                  Siguiente
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "notifications" && (
          <Card className="rounded-card border-zaltyko-mist shadow-soft">
            <CardContent className="p-8 space-y-4">
              <div className="text-center">
                <h2 className="text-xl font-bold text-zaltyko-navy">Notificaciones</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  ¿Qué quieres recibir en tu email?
                </p>
              </div>

              <div className="space-y-3">
                {[
                  { key: "evaluations", label: "Evaluaciones técnicas", desc: "Nuevas evaluaciones de tus hijos" },
                  { key: "attendance", label: "Asistencia", desc: "Ausencias y retrasos" },
                  { key: "events", label: "Eventos", desc: "Competiciones y eventos próximos" },
                  { key: "billing", label: "Cobros", desc: "Cuotas y pagos" },
                ].map((item) => (
                  <label key={item.key} className="flex items-center justify-between rounded-card border border-zaltyko-mist p-3 cursor-pointer hover:bg-zaltyko-white">
                    <div>
                      <p className="font-medium text-sm">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.desc}</p>
                    </div>
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-zaltyko-mist text-zaltyko-teal focus:ring-zaltyko-teal"
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
          <Card className="rounded-card border-zaltyko-mist shadow-soft">
            <CardContent className="p-8 space-y-4 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-zaltyko-primary-ultralight">
                <CheckCircle2 className="h-8 w-8 text-zaltyko-teal" />
              </div>
              <h2 className="text-xl font-bold text-zaltyko-navy">¡Listo!</h2>
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

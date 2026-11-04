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
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
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
                <h1 className="text-2xl font-bold text-foreground">Bienvenido/a</h1>
                <p className="text-muted-foreground">
                  Para consultar información de una academia, tu cuenta debe estar asociada y
                  contar con los permisos correspondientes.
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-start gap-3 rounded-card bg-card p-3">
                  <Calendar className="h-5 w-5 mt-0.5 text-zaltyko-teal" />
                  <div>
                    <p className="font-medium text-sm">Vínculo con la academia</p>
                    <p className="text-xs text-muted-foreground">Necesitas una cuenta asociada a la academia.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-card bg-card p-3">
                  <Users className="h-5 w-5 mt-0.5 text-zaltyko-teal" />
                  <div>
                    <p className="font-medium text-sm">Datos disponibles</p>
                    <p className="text-xs text-muted-foreground">Solo podrás consultar información autorizada para tu cuenta.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-card bg-card p-3">
                  <Bell className="h-5 w-5 mt-0.5 text-zaltyko-teal" />
                  <div>
                    <p className="font-medium text-sm">Permisos de acceso</p>
                    <p className="text-xs text-muted-foreground">La asociación no concede acceso a la gestión de la academia.</p>
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
                <h2 className="text-xl font-bold text-foreground">Tus hijos/as</h2>
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
                    <div key={child.id} className="flex items-center justify-between rounded-card border border-zaltyko-mist bg-card p-3">
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
                <h2 className="text-xl font-bold text-foreground">Preferencias de tu cuenta</h2>
                <p className="text-sm text-muted-foreground mt-1">
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
                  <label key={item.key} className="flex items-center justify-between rounded-card border border-zaltyko-mist p-3 cursor-pointer hover:bg-muted">
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
              <h2 className="text-xl font-bold text-foreground">¡Listo!</h2>
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

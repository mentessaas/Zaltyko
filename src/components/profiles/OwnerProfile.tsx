"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { type User } from "@supabase/supabase-js";
import { AlertTriangle, Building2, CreditCard, Users, ArrowLeft, Shield } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { type ProfileRow } from "@/lib/authz";
import { OnboardingChecklist } from "@/components/dashboard/OnboardingChecklist";
import { calculateDaysLeft } from "@/lib/onboarding-utils";
import { AcademyEditSection } from "@/components/academies/AcademyEditSection";
import { ProfileTabs } from "@/components/profiles/ProfileTabs";

interface AcademySummary {
  id: string;
  name: string | null;
  academyType: string | null;
  createdAt: Date | null;
  planCode: string | null;
  planNickname: string | null;
  subscriptionStatus: string | null;
  trialStartsAt: Date | string | null;
  trialEndsAt: Date | string | null;
  isTrialActive: boolean | null;
  paymentsConfiguredAt: Date | string | null;
}

interface OwnerProfileProps {
  user: User | null;
  profile: ProfileRow | null;
  academies: AcademySummary[];
  defaultAcademyId: string | null;
  targetProfileId?: string | null;
}

const PLAN_COPY: Record<string, { label: string; description: string; cta: string }> = {
  free: {
    label: "Plan Free",
    description: "Incluye 1 academia y hasta 50 atletas activos.",
    cta: "Mejorar plan",
  },
  pro: {
    label: "Plan Pro",
    description: "Automatizaciones avanzadas y academias ilimitadas.",
    cta: "Gestionar suscripción",
  },
  premium: {
    label: "Plan Premium",
    description: "Soporte prioritario y módulos avanzados.",
    cta: "Gestionar suscripción",
  },
};

function formatAcademyType(value: string | null | undefined) {
  switch (value) {
    case "artistica":
      return "Gimnasia artística";
    case "ritmica":
      return "Gimnasia rítmica";
    case "trampolin":
      return "Trampolín";
    case "general":
      return "General / Mixta";
    default:
      return "Sin tipo definido";
  }
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export function OwnerProfile({ user, profile, academies, defaultAcademyId, targetProfileId }: OwnerProfileProps) {
  const router = useRouter();
  const [activeAcademyId, setActiveAcademyId] = useState(defaultAcademyId ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [currentProfile, setCurrentProfile] = useState(profile);
  const [currentUser, setCurrentUser] = useState(user);
  const [limitViolations, setLimitViolations] = useState<{
    violations: Array<{
      resource: string;
      currentCount: number;
      limit: number | null;
    }>;
    requiresAction: boolean;
  } | null>(null);

  useEffect(() => {
    setActiveAcademyId(defaultAcademyId ?? "");
  }, [defaultAcademyId]);

  useEffect(() => {
    const checkLimits = async () => {
      try {
        const response = await fetch("/api/profile/check-limits", { cache: "no-store" });
        if (response.ok) {
          const data = await response.json();
          if (data.requiresAction) {
            setLimitViolations(data);
          }
        }
      } catch (error) {
        console.error("Error checking limits", error);
      }
    };

    if (!targetProfileId) {
      checkLimits();
    }
  }, [targetProfileId]);

  const activeAcademy = useMemo(
    () => academies.find((academy) => academy.id === activeAcademyId) ?? null,
    [academies, activeAcademyId]
  );

  const planCode = activeAcademy?.planCode?.toLowerCase() ?? "free";
  const planCopy = PLAN_COPY[planCode] ?? {
    label: activeAcademy?.planNickname ?? "Plan personalizado",
    description: "Gestiona tu suscripción desde facturación.",
    cta: "Ver facturación",
  };

  const canCreateAcademies = planCode !== "free" || profile?.role === "super_admin";
  const planLimitLabel = canCreateAcademies
    ? `Gestionas ${academies.length} academia${academies.length === 1 ? "" : "s"}.`
    : "Tu plan actual no permite crear nuevas academias. Actualiza tu plan para ampliarlo.";

  const trialDaysLeft = activeAcademy?.trialEndsAt ? calculateDaysLeft(activeAcademy.trialEndsAt) : null;

  const handleAcademyChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    setActiveAcademyId(value);
    setStatus("saving");

    try {
      const body: { academyId: string | null; profileId?: string } = { academyId: value || null };
      if (targetProfileId) {
        body.profileId = targetProfileId;
      }

      const response = await fetch("/api/profile/active-academy", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error("No se pudo actualizar la academia activa.");
      }

      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
    } catch (error) {
      console.error(error);
      setStatus("error");
    }
  };

  const initials = (currentProfile?.name || currentUser?.email || "U").slice(0, 2).toUpperCase();

  return (
    <div className="space-y-10">
      {targetProfileId && (
        <div className="rounded-lg border border-amber-400/60 bg-amber-400/10 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className="h-5 w-5 text-amber-600" strokeWidth={2} />
              <div>
                <p className="font-semibold text-amber-900">
                  Modo Super Admin: Viendo perfil de {profile?.name ?? "Usuario"}
                </p>
                <p className="text-sm text-amber-700">
                  Estás viendo el perfil de este usuario. Los cambios que hagas afectarán a su cuenta.
                </p>
              </div>
            </div>
            <Link
              href={`/super-admin/users/${targetProfileId}`}
              className="inline-flex items-center gap-2 rounded-md border border-amber-600/40 bg-white px-3 py-2 text-sm font-semibold text-amber-900 transition hover:bg-amber-50"
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={2} />
              Volver a Super Admin
            </Link>
          </div>
        </div>
      )}
      {limitViolations && limitViolations.requiresAction && !targetProfileId && (
        <div className="rounded-lg border border-amber-400/60 bg-amber-400/10 p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-6 w-6 text-amber-600 flex-shrink-0" strokeWidth={2} />
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-amber-900">Ajustes necesarios en tu plan</h2>
              <p className="mt-1 text-sm text-amber-700">
                Tu plan actual tiene límites que están siendo excedidos. Para continuar usando Zaltyko normalmente, necesitas ajustar los siguientes recursos:
              </p>
              <ul className="mt-3 space-y-2">
                {limitViolations.violations.map((violation, idx) => (
                  <li key={idx} className="text-sm text-amber-800">
                    • <strong className="capitalize">
                      {violation.resource === "academies" && "Academias"}
                      {violation.resource === "athletes" && "Atletas"}
                      {violation.resource === "classes" && "Clases"}
                      {violation.resource === "groups" && "Grupos"}
                    </strong>: {violation.currentCount} / {violation.limit ?? "∞"}
                  </li>
                ))}
              </ul>
              <div className="mt-4">
                <Button asChild className="bg-amber-600 text-white hover:bg-amber-700">
                  <Link href="/dashboard/plan-limits">Ajustar límites ahora</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <section className="space-y-4">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Panel principal
          </p>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-foreground">Resumen general</h2>
              <p className="text-sm text-muted-foreground">
                Visualiza tu rol, el estado de tus academias y accesos clave de un vistazo.
              </p>
            </div>
            <div className="rounded-full border border-primary/20 bg-primary/5 px-4 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
              Propietario de Academia
            </div>
          </div>
        </div>

        <Card className="border bg-card p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarFallback className="bg-primary/10 text-lg font-semibold text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="space-y-1">
                <h3 className="text-xl font-semibold text-foreground">Mi perfil - Propietario</h3>
                <p className="text-sm text-muted-foreground">
                  Gestiona tus academias, planes de suscripción y configuración de cuenta.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link href="/dashboard/profile">Ver mi cuenta</Link>
              </Button>
              <Button variant="default" size="sm" asChild>
                <Link href="/dashboard/academies">Ir a academias</Link>
              </Button>
            </div>
          </div>
        </Card>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="p-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="h-4 w-4" />
                Academias
              </CardTitle>
              <CardDescription>Activas en tu cuenta</CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <p className="text-3xl font-semibold text-foreground">{academies.length}</p>
            </CardContent>
            <CardFooter className="p-4 pt-0">
              <Button variant="outline" size="sm" className="w-full" asChild>
                <Link href="/dashboard/academies">Ver academias</Link>
              </Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader className="p-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <CreditCard className="h-4 w-4" />
                Plan actual
              </CardTitle>
              <CardDescription>Estado del plan y beneficios</CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <p className="text-lg font-semibold">{planCopy.label}</p>
              <p className="text-xs text-muted-foreground">{planCopy.description}</p>
            </CardContent>
            <CardFooter className="p-4 pt-0">
              <Button variant="outline" size="sm" className="w-full" asChild>
                <Link href={activeAcademy ? `/app/${activeAcademy.id}/billing` : "/billing"}>
                  {planCopy.cta}
                </Link>
              </Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader className="p-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4" />
                Equipo
              </CardTitle>
              <CardDescription>Accesos y roles</CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <p className="text-sm text-muted-foreground">
                Invita administradores, entrenadores y tutores desde un único lugar.
              </p>
            </CardContent>
            <CardFooter className="p-4 pt-0">
              <Button variant="outline" size="sm" className="w-full" asChild>
                <Link href="/dashboard/users">Gestionar equipo</Link>
              </Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader className="p-4">
              <CardTitle className="text-base">Facturación</CardTitle>
              <CardDescription>Suscripciones y cobros</CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <p className="text-sm text-muted-foreground">
                Estado: {activeAcademy?.subscriptionStatus ?? "Sin suscripción"}
              </p>
            </CardContent>
            <CardFooter className="p-4 pt-0">
              <Button variant="outline" size="sm" className="w-full" asChild>
                <Link href="/billing">Ver facturación</Link>
              </Button>
            </CardFooter>
          </Card>
        </div>
      </section>

      <section className="space-y-4">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Gestión de academias
          </p>
          <h2 className="text-2xl font-semibold text-foreground">Controla tu academia activa</h2>
          <p className="text-sm text-muted-foreground">
            Cambia entre academias, revisa el estado del plan y accede rápidamente al panel operativo.
          </p>
        </div>

        {activeAcademy && activeAcademy.trialEndsAt && (
          <div
            className={`rounded-lg border px-4 py-3 text-sm ${
              activeAcademy.isTrialActive
                ? "border-primary/40 bg-primary/5 text-primary"
                : "border-amber-400/60 bg-amber-50 text-amber-900"
            }`}
          >
            {activeAcademy.isTrialActive ? (
              <p>
                Acceso completo al periodo de prueba. Te quedan {trialDaysLeft ?? 0} días para explorar todas las funciones
                premium.
              </p>
            ) : (
              <p>
                Tu periodo de prueba terminó. Activa un plan Pro para mantener automatizaciones y cobranzas sin fricciones.
              </p>
            )}
          </div>
        )}

        <Card>
          <CardContent className="grid gap-6 p-6 lg:grid-cols-2">
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Academia activa</p>
                <p className="text-sm text-muted-foreground">
                  Selecciona la academia sobre la que quieres operar. Los widgets y accesos rápidos se actualizarán
                  automáticamente.
                </p>
              </div>
              <select
                value={activeAcademyId}
                onChange={handleAcademyChange}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:cursor-not-allowed"
                disabled={academies.length === 0}
              >
                <option value="">Ver todas las academias</option>
                {academies.map((academy) => (
                  <option key={academy.id} value={academy.id}>
                    {academy.name ?? "(sin nombre)"} · {formatAcademyType(academy.academyType)}
                  </option>
                ))}
              </select>
              {status === "saving" && <p className="text-xs text-primary">Guardando cambios…</p>}
              {status === "saved" && <p className="text-xs text-primary">Actualizado correctamente.</p>}
              {status === "error" && <p className="text-xs text-destructive">Error al guardar.</p>}
            </div>

            {activeAcademy ? (
              <div className="space-y-4 rounded-lg border border-dashed border-primary/30 bg-primary/5 p-4 text-sm">
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Plan actual</p>
                      <p className="text-base font-semibold text-foreground">{planCopy.label}</p>
                    </div>
                    <Button size="sm" asChild>
                      <Link href={`/app/${activeAcademy.id}/dashboard`}>Ir al panel</Link>
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">{planCopy.description}</p>
                  <p className="text-xs text-muted-foreground">
                    Creada el {formatDate(activeAcademy.createdAt)} · Estado: {activeAcademy.subscriptionStatus ?? "sin suscripción"}
                  </p>
                  {canCreateAcademies && (
                    <Button variant="outline" size="sm" onClick={() => router.push("/onboarding")} className="w-full">
                      Crear nueva academia
                    </Button>
                  )}
                  <p className="text-xs text-muted-foreground">{planLimitLabel}</p>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-muted-foreground/30 bg-muted/20 p-4 text-sm text-muted-foreground">
                Selecciona una academia para ver sus detalles.
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {activeAcademy && (
        <section className="space-y-4">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Configuración de academia
            </p>
            <h2 className="text-2xl font-semibold text-foreground">Información y contacto</h2>
            <p className="text-sm text-muted-foreground">
              Gestiona los datos públicos de tu academia que aparecerán en el directorio.
            </p>
          </div>

          <AcademyEditSection academyId={activeAcademy.id} />
        </section>
      )}

      {(activeAcademy?.id ?? defaultAcademyId) && (
        <section className="space-y-4">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Onboarding y próximos pasos
            </p>
            <h2 className="text-2xl font-semibold text-foreground">Checklist de activación</h2>
            <p className="text-sm text-muted-foreground">
              Completa las tareas prioritarias para poner en marcha tu academia en menos de 24 horas.
            </p>
          </div>

          <OnboardingChecklist academyId={activeAcademy?.id ?? defaultAcademyId} />
        </section>
      )}

      <section className="space-y-4">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Configuración personal
          </p>
          <h2 className="text-2xl font-semibold text-foreground">Datos de la cuenta</h2>
          <p className="text-sm text-muted-foreground">
            Mantén actualizada tu información personal y los accesos principales.
          </p>
        </div>

        <ProfileTabs
          user={currentUser}
          profile={currentProfile}
          onProfileUpdated={() => {
            // Recargar datos del perfil
            window.location.reload();
          }}
        />
      </section>
    </div>
  );
}


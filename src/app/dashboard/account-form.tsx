"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { type User } from "@supabase/supabase-js";
import { AlertTriangle } from "lucide-react";

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

interface AcademySummary {
  id: string;
  name: string | null;
  academyType: string | null;
  createdAt: Date | null;
  planCode: string | null;
  planNickname: string | null;
  subscriptionStatus: string | null;
}

interface AccountFormProps {
  user: User | null;
  profile: ProfileRow | null;
  academies: AcademySummary[];
  defaultAcademyId: string | null;
  targetProfileId?: string | null; // Para modo Super Admin "ver como usuario"
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

function formatRoleLabel(role?: string | null) {
  switch (role) {
    case "super_admin":
      return "Super administrador";
    case "admin":
      return "Administrador";
    case "coach":
      return "Entrenador";
    case "athlete":
      return "Atleta";
    case "parent":
      return "Tutor";
    case "owner":
    default:
      return "Propietario";
  }
}

export default function AccountForm({ user, profile, academies, defaultAcademyId, targetProfileId }: AccountFormProps) {
  const router = useRouter();
  const [activeAcademyId, setActiveAcademyId] = useState(defaultAcademyId ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
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
    // Check for limit violations on mount
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
      // Only check for current user, not when viewing as Super Admin
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

  const quickActions = [
    {
      title: "Gestionar equipo",
      description: "Invita entrenadores y managers a tu academia.",
      href: "/dashboard/users",
    },
    {
      title: planCopy.cta,
      description: planCopy.description,
      href: activeAcademy ? `/app/${activeAcademy.id}/billing` : "/app",
    },
    {
      title: "Ir al panel",
      description: "Accede al dashboard operativo de tu academia.",
      href: activeAcademy ? `/app/${activeAcademy.id}/dashboard` : "/app",
    },
  ];

  const initials = (profile?.name || user?.email || "U").slice(0, 2).toUpperCase();

  return (
    <div className="space-y-8">
      {/* Banner de violaciones de límites */}
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

      <header className="flex flex-col gap-4 rounded-xl border bg-card p-6 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16">
            <AvatarFallback className="bg-primary/10 text-lg font-semibold text-primary">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold">Mi perfil</h1>
            <p className="text-sm text-muted-foreground">
              Gestiona tu cuenta, tu plan y las academias asociadas. Todo lo que cambia aquí impacta lo que ves en el panel principal.
            </p>
          </div>
        </div>
        <div className="rounded-full border border-primary/20 bg-primary/5 px-4 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
          Rol actual: {formatRoleLabel(profile?.role)}
        </div>
      </header>

      <Card>
        <CardHeader className="flex flex-col gap-1.5 p-6 pb-3">
          <CardTitle className="text-base font-semibold">Acciones rápidas</CardTitle>
          <CardDescription>
            Mantén tu operación al día con accesos directos a las secciones más utilizadas.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 p-6 pt-0 md:grid-cols-2 xl:grid-cols-4">
          {quickActions.map((action) => (
            <Link
              key={action.title}
              href={action.href}
              className="group flex flex-col gap-1 rounded-lg border border-border bg-background p-4 text-sm transition hover:-translate-y-0.5 hover:border-primary/60 hover:shadow"
            >
              <span className="font-semibold text-foreground group-hover:text-primary">
                {action.title}
              </span>
              <span className="text-xs text-muted-foreground">{action.description}</span>
            </Link>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader className="p-6 pb-3">
            <CardTitle className="text-base font-semibold">Datos personales</CardTitle>
            <CardDescription>
              Información básica de tu cuenta. Muy pronto podrás actualizar tu nombre y contraseña desde aquí.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 pt-0">
            <dl className="space-y-4 text-sm">
              <div className="flex flex-col">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Nombre</dt>
                <dd className="font-medium text-foreground">{profile?.name ?? "Añade tu nombre"}</dd>
              </div>
              <div className="flex flex-col">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Correo</dt>
                <dd className="font-medium text-foreground">{user?.email ?? "—"}</dd>
              </div>
              <div className="flex flex-col">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Miembro desde</dt>
                <dd className="font-medium text-foreground">{formatDate(profile?.createdAt ?? null)}</dd>
              </div>
            </dl>
          </CardContent>
          <CardFooter className="flex justify-end space-x-3">
            <Button variant="outline" size="sm" asChild>
              <Link href="mailto:soporte@gymnasaas.com">Solicitar cambios</Link>
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader className="p-6 pb-3">
            <CardTitle className="text-base font-semibold">Academias y plan</CardTitle>
            <CardDescription>
              Selecciona tu academia activa y revisa el plan asociado. Esto define la información y automatizaciones que verás en el panel.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 p-6 pt-0">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Academia activa
              </label>
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
              <p className="text-xs text-muted-foreground">
                Tu academia activa se utiliza para filtrar módulos, métricas y automatizaciones.
              </p>
              {status === "saving" && <p className="text-xs text-primary">Guardando cambios…</p>}
              {status === "saved" && <p className="text-xs text-primary">Actualizado correctamente.</p>}
              {status === "error" && <p className="text-xs text-destructive">Error al guardar. Inténtalo nuevamente.</p>}
            </div>

            {activeAcademy ? (
              <div className="space-y-3 rounded-lg border border-dashed border-primary/30 bg-primary/5 p-4 text-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Plan actual</p>
                    <p className="text-base font-semibold text-foreground">{planCopy.label}</p>
                  </div>
                  <Button size="sm" asChild>
                    <Link href={`/app/${activeAcademy.id}/billing`}>{planCopy.cta}</Link>
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">{planCopy.description}</p>
                <p className="text-xs text-muted-foreground">
                  Academia creada el {formatDate(activeAcademy.createdAt)} · Estado suscripción: {activeAcademy.subscriptionStatus ?? "sin suscripción"}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!canCreateAcademies}
                  onClick={() => {
                    if (!canCreateAcademies) {
                      return;
                    }
                    router.push("/onboarding");
                  }}
                >
                  Crear nueva academia
                </Button>
                <p className="text-xs text-muted-foreground">{planLimitLabel}</p>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-muted-foreground/30 bg-muted/20 p-4 text-sm text-muted-foreground">
                Aún no has seleccionado una academia. Elige una para ver detalles de plan y accesos rápidos.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

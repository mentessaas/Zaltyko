"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { type User } from "@supabase/supabase-js";
import {
  AlertTriangle,
  Building2,
  CreditCard,
  Users,
  ArrowLeft,
  Shield,
  Settings,
  Calendar,
  Mail,
  Phone,
  Globe,
  CheckCircle2,
  Clock,
  Sparkles,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { type ProfileRow } from "@/lib/authz";
import { OnboardingChecklist } from "@/components/dashboard/OnboardingChecklist";
import { calculateDaysLeft } from "@/lib/onboarding-utils";
import { AcademyEditSection } from "@/components/academies/AcademyEditSection";
import { ProfileTabs } from "@/components/profiles/ProfileTabs";
import { formatPhoneNumber } from "@/lib/validation/phone";

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

const PLAN_COPY: Record<string, { label: string; description: string; cta: string; color: string }> = {
  free: {
    label: "Plan Free",
    description: "Incluye 1 academia y hasta 50 atletas activos.",
    cta: "Mejorar plan",
    color: "bg-gray-100 text-gray-800",
  },
  pro: {
    label: "Plan Pro",
    description: "Automatizaciones avanzadas y academias ilimitadas.",
    cta: "Gestionar suscripción",
    color: "bg-blue-100 text-blue-800",
  },
  premium: {
    label: "Plan Premium",
    description: "Soporte prioritario y módulos avanzados.",
    cta: "Gestionar suscripción",
    color: "bg-purple-100 text-purple-800",
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

export function OptimizedOwnerProfile({
  user,
  profile,
  academies,
  defaultAcademyId,
  targetProfileId,
}: OwnerProfileProps) {
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
    color: "bg-gray-100 text-gray-800",
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
    <div className="space-y-6">
      {/* Alertas importantes */}
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
                Tu plan actual tiene límites que están siendo excedidos. Para continuar usando Zaltyko normalmente,
                necesitas ajustar los siguientes recursos:
              </p>
              <ul className="mt-3 space-y-2">
                {limitViolations.violations.map((violation, idx) => (
                  <li key={idx} className="text-sm text-amber-800">
                    • <strong className="capitalize">
                      {violation.resource === "academies" && "Academias"}
                      {violation.resource === "athletes" && "Atletas"}
                      {violation.resource === "classes" && "Clases"}
                      {violation.resource === "groups" && "Grupos"}
                    </strong>
                    : {violation.currentCount} / {violation.limit ?? "∞"}
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

      {/* Header principal con información del usuario */}
      <Card className="border-2 border-primary/20 bg-gradient-to-br from-card to-card/50 shadow-lg">
        <CardContent className="p-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-4">
              <Avatar className="h-20 w-20 border-2 border-primary/20 shadow-md">
                <AvatarImage src={currentProfile?.photoUrl || undefined} alt={currentProfile?.name || "Usuario"} />
                <AvatarFallback className="bg-primary/10 text-xl font-semibold text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-2xl font-bold text-foreground">
                    {currentProfile?.name || "Usuario sin nombre"}
                  </h1>
                  <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary">
                    Propietario
                  </Badge>
                </div>
                <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                  {currentUser?.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      <span>{currentUser.email}</span>
                    </div>
                  )}
                  {currentProfile?.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4" />
                      <span>{formatPhoneNumber(currentProfile.phone)}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    <span>Miembro desde {formatDate(currentProfile?.createdAt ?? null)}</span>
                  </div>
                </div>
                {currentProfile?.bio && (
                  <p className="text-sm text-muted-foreground mt-2 max-w-2xl">{currentProfile.bio}</p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link href="/dashboard/academies">
                  <Building2 className="h-4 w-4 mr-2" />
                  Ver academias
                </Link>
              </Button>
              <Button size="sm" asChild>
                <Link href={activeAcademy ? `/app/${activeAcademy.id}/dashboard` : "/dashboard"}>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Ir al panel
                </Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Estadísticas rápidas */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">Academias</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{academies.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Total activas</p>
          </CardContent>
          <CardFooter className="pt-3">
            <Button variant="ghost" size="sm" className="w-full" asChild>
              <Link href="/dashboard/academies">Gestionar</Link>
            </Button>
          </CardFooter>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">Plan actual</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold text-foreground">{planCopy.label}</div>
              <Badge className={planCopy.color} variant="outline">
                {activeAcademy?.subscriptionStatus || "Sin suscripción"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">{planCopy.description}</p>
          </CardContent>
          <CardFooter className="pt-3">
            <Button variant="ghost" size="sm" className="w-full" asChild>
              <Link href={activeAcademy ? `/app/${activeAcademy.id}/billing` : "/billing"}>
                {planCopy.cta}
              </Link>
            </Button>
          </CardFooter>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">Equipo</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">—</div>
            <p className="text-xs text-muted-foreground mt-1">Gestiona tu equipo</p>
          </CardContent>
          <CardFooter className="pt-3">
            <Button variant="ghost" size="sm" className="w-full" asChild>
              <Link href="/dashboard/users">Invitar</Link>
            </Button>
          </CardFooter>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">Estado</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold text-foreground">Activo</div>
            <p className="text-xs text-muted-foreground mt-1">
              {activeAcademy?.isTrialActive
                ? `Prueba: ${trialDaysLeft ?? 0} días restantes`
                : "Cuenta activa"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Sección principal: Configuración de perfil */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl">Configuración de cuenta</CardTitle>
              <CardDescription>
                Gestiona tu información personal, seguridad y preferencias
              </CardDescription>
            </div>
            <Badge variant="outline" className="flex items-center gap-1">
              <Settings className="h-3 w-3" />
              Configuración
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <ProfileTabs
            user={currentUser}
            profile={currentProfile}
            onProfileUpdated={() => {
              window.location.reload();
            }}
          />
        </CardContent>
      </Card>

      {/* Sección de academia activa */}
      {academies.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl">Academia activa</CardTitle>
                <CardDescription>
                  Selecciona la academia sobre la que quieres operar
                </CardDescription>
              </div>
              <Badge variant="outline" className="flex items-center gap-1">
                <Building2 className="h-3 w-3" />
                {academies.length} {academies.length === 1 ? "academia" : "academias"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {activeAcademy && activeAcademy.trialEndsAt && (
              <div
                className={`rounded-lg border px-4 py-3 text-sm ${
                  activeAcademy.isTrialActive
                    ? "border-primary/40 bg-primary/5 text-primary"
                    : "border-amber-400/60 bg-amber-50 text-amber-900"
                }`}
              >
                {activeAcademy.isTrialActive ? (
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    <p>
                      Acceso completo al periodo de prueba. Te quedan {trialDaysLeft ?? 0} días para explorar todas las
                      funciones premium.
                    </p>
                  </div>
                ) : (
                  <p>
                    Tu periodo de prueba terminó. Activa un plan Pro para mantener automatizaciones y cobranzas sin
                    fricciones.
                  </p>
                )}
              </div>
            )}

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-3">
                <label className="text-sm font-medium">Seleccionar academia</label>
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
                {status === "saving" && (
                  <p className="text-xs text-primary flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Guardando cambios…
                  </p>
                )}
                {status === "saved" && (
                  <p className="text-xs text-green-600 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Actualizado correctamente.
                  </p>
                )}
                {status === "error" && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Error al guardar.
                  </p>
                )}
              </div>

              {activeAcademy ? (
                <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Plan actual</p>
                      <p className="text-base font-semibold text-foreground">{planCopy.label}</p>
                    </div>
                    <Button size="sm" asChild>
                      <Link href={`/app/${activeAcademy.id}/dashboard`}>Ir al panel</Link>
                    </Button>
                  </div>
                  <Separator />
                  <p className="text-xs text-muted-foreground">{planCopy.description}</p>
                  <p className="text-xs text-muted-foreground">
                    Creada el {formatDate(activeAcademy.createdAt)} · Estado:{" "}
                    {activeAcademy.subscriptionStatus ?? "sin suscripción"}
                  </p>
                  {canCreateAcademies && (
                    <Button variant="outline" size="sm" onClick={() => router.push("/onboarding")} className="w-full">
                      Crear nueva academia
                    </Button>
                  )}
                  <p className="text-xs text-muted-foreground">{planLimitLabel}</p>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-muted-foreground/30 bg-muted/20 p-4 text-sm text-muted-foreground flex items-center justify-center min-h-[120px]">
                  Selecciona una academia para ver sus detalles.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Configuración de academia */}
      {activeAcademy && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl">Información de la academia</CardTitle>
                <CardDescription>
                  Gestiona los datos públicos de tu academia que aparecerán en el directorio
                </CardDescription>
              </div>
              <Badge variant="outline" className="flex items-center gap-1">
                <Globe className="h-3 w-3" />
                Público
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <AcademyEditSection academyId={activeAcademy.id} />
          </CardContent>
        </Card>
      )}

      {/* Checklist de onboarding */}
      {(activeAcademy?.id ?? defaultAcademyId) && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl">Checklist de activación</CardTitle>
                <CardDescription>
                  Completa las tareas prioritarias para poner en marcha tu academia en menos de 24 horas
                </CardDescription>
              </div>
              <Badge variant="outline" className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Progreso
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <OnboardingChecklist academyId={activeAcademy?.id ?? defaultAcademyId} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}


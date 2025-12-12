"use client";

import Link from "next/link";
import { type User } from "@supabase/supabase-js";
import { Calendar, Trophy, Users, Mail, Phone, ArrowLeft, Shield } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { type ProfileRow } from "@/lib/authz";

interface AthleteProfileProps {
  user: User | null;
  profile: ProfileRow | null;
  athleteData: {
    id: string;
    name: string | null;
    level: string | null;
    status: string | null;
    dob: Date | null;
    academyId: string;
    academyName: string | null;
    groupName: string | null;
    groupColor: string | null;
    classesCount: number;
    upcomingSessionsCount: number;
    age: number | null;
  };
  targetProfileId?: string | null;
}

function calculateAge(dob: Date | null): number | null {
  if (!dob) return null;
  const today = new Date();
  const birthDate = new Date(dob);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

export function AthleteProfile({ user, profile, athleteData, targetProfileId }: AthleteProfileProps) {
  const initials = (athleteData.name || user?.email || "A").slice(0, 2).toUpperCase();
  const age = athleteData.age ?? calculateAge(athleteData.dob);

  return (
    <div className="space-y-8">
      {targetProfileId && (
        <div className="rounded-lg border border-amber-400/60 bg-amber-400/10 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className="h-5 w-5 text-amber-600" strokeWidth={2} />
              <div>
                <p className="font-semibold text-amber-900">
                  Modo Super Admin: Viendo perfil de {athleteData.name ?? "Usuario"}
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
      <header className="flex flex-col gap-4 rounded-xl border bg-card p-6 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16">
            <AvatarFallback className="bg-primary/10 text-lg font-semibold text-primary">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold">Mi perfil - Atleta</h1>
            <p className="text-sm text-muted-foreground">
              {athleteData.academyName ?? "Academia"} · {athleteData.groupName ? `Grupo: ${athleteData.groupName}` : "Sin grupo asignado"}
            </p>
          </div>
        </div>
        <div className="rounded-full border border-primary/20 bg-primary/5 px-4 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
          Atleta
        </div>
      </header>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="p-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="h-4 w-4" />
              Clases
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-2xl font-bold">{athleteData.classesCount}</p>
            <p className="text-xs text-muted-foreground">Clases inscritas</p>
          </CardContent>
          <CardHeader className="p-4 pt-0">
            <Button variant="outline" size="sm" className="w-full" asChild>
              <Link href={`/app/${athleteData.academyId}/classes`}>Ver clases</Link>
            </Button>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="p-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="h-4 w-4" />
              Próximas sesiones
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-2xl font-bold">{athleteData.upcomingSessionsCount}</p>
            <p className="text-xs text-muted-foreground">Sesiones programadas</p>
          </CardContent>
          <CardHeader className="p-4 pt-0">
            <Button variant="outline" size="sm" className="w-full" asChild>
              <Link href={targetProfileId ? `/dashboard/calendar?profileId=${targetProfileId}` : "/dashboard/calendar"}>
                Ver calendario
              </Link>
            </Button>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="p-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <Trophy className="h-4 w-4" />
              Nivel
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-lg font-bold">{athleteData.level ?? "No definido"}</p>
            <p className="text-xs text-muted-foreground">Nivel actual</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="p-6 pb-3">
            <CardTitle className="text-base font-semibold">Información personal</CardTitle>
            <CardDescription>
              Tus datos personales y de contacto.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 pt-0">
            <dl className="space-y-4 text-sm">
              <div className="flex flex-col">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Nombre</dt>
                <dd className="font-medium text-foreground">{athleteData.name ?? "Sin nombre"}</dd>
              </div>
              {age !== null && (
                <div className="flex flex-col">
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Edad</dt>
                  <dd className="font-medium text-foreground">{age} años</dd>
                </div>
              )}
              <div className="flex flex-col">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Estado</dt>
                <dd className="font-medium text-foreground capitalize">{athleteData.status ?? "Sin estado"}</dd>
              </div>
              {athleteData.groupName && (
                <div className="flex flex-col">
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Grupo</dt>
                  <dd className="font-medium text-foreground">{athleteData.groupName}</dd>
                </div>
              )}
              {user?.email && (
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <div className="flex flex-col">
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">Email</dt>
                    <dd className="font-medium text-foreground">{user.email}</dd>
                  </div>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-6 pb-3">
            <CardTitle className="text-base font-semibold">Academia</CardTitle>
            <CardDescription>
              Información sobre tu academia y grupo.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 pt-0">
            <dl className="space-y-4 text-sm">
              <div className="flex flex-col">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Academia</dt>
                <dd className="font-medium text-foreground">{athleteData.academyName ?? "Sin academia"}</dd>
              </div>
              {athleteData.groupName && (
                <div className="flex flex-col">
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Grupo</dt>
                  <dd className="font-medium text-foreground">{athleteData.groupName}</dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="p-6 pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Calendar className="h-4 w-4" />
            Accesos rápidos
          </CardTitle>
          <CardDescription>
            Accesos directos a tus clases y sesiones.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 p-6 pt-0 md:grid-cols-2">
          <Button variant="outline" className="justify-start" asChild>
            <Link href={targetProfileId ? `/dashboard/calendar?profileId=${targetProfileId}` : "/dashboard/calendar"}>
              <Calendar className="mr-2 h-4 w-4" />
              Ver mi calendario
            </Link>
          </Button>
          <Button variant="outline" className="justify-start" asChild>
            <Link href={`/app/${athleteData.academyId}/classes`}>
              <Users className="mr-2 h-4 w-4" />
              Ver mis clases
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}


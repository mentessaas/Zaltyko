"use client";

import Link from "next/link";
import { type User } from "@supabase/supabase-js";
import { Calendar, Users, Award, Mail, Phone, ArrowLeft, Shield } from "lucide-react";

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

interface CoachProfileProps {
  user: User | null;
  profile: ProfileRow | null;
  coachData: {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    bio: string | null;
    photoUrl: string | null;
    specialties: string[] | null;
    academyId: string;
    academyName: string | null;
    classesCount: number;
    upcomingSessionsCount: number;
  };
  targetProfileId?: string | null;
}

export function CoachProfile({ user, profile, coachData, targetProfileId }: CoachProfileProps) {
  const initials = (coachData.name || user?.email || "C").slice(0, 2).toUpperCase();

  return (
    <div className="space-y-8">
      {targetProfileId && (
        <div className="rounded-lg border border-amber-400/60 bg-amber-400/10 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className="h-5 w-5 text-amber-600" strokeWidth={2} />
              <div>
                <p className="font-semibold text-amber-900">
                  Modo Super Admin: Viendo perfil de {coachData.name ?? "Usuario"}
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
          {coachData.photoUrl ? (
            <div className="relative h-16 w-16 overflow-hidden rounded-full">
              <img
                src={coachData.photoUrl}
                alt={coachData.name ?? "Foto del entrenador"}
                className="h-full w-full object-cover"
              />
            </div>
          ) : (
            <Avatar className="h-16 w-16">
              <AvatarFallback className="bg-primary/10 text-lg font-semibold text-primary">
                {initials}
              </AvatarFallback>
            </Avatar>
          )}
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold">Mi perfil - Entrenador</h1>
            <p className="text-sm text-muted-foreground">
              {coachData.academyName ?? "Academia"} · Gestiona tus clases y sesiones
            </p>
          </div>
        </div>
        <div className="rounded-full border border-primary/20 bg-primary/5 px-4 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
          Entrenador
        </div>
      </header>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="p-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="h-4 w-4" />
              Clases asignadas
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-2xl font-bold">{coachData.classesCount}</p>
            <p className="text-xs text-muted-foreground">Clases activas</p>
          </CardContent>
          <CardHeader className="p-4 pt-0">
            <Button variant="outline" size="sm" className="w-full" asChild>
              <Link href="/dashboard/coaches">Ver mis clases</Link>
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
            <p className="text-2xl font-bold">{coachData.upcomingSessionsCount}</p>
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
              <Users className="h-4 w-4" />
              Atletas
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-xs text-muted-foreground">Gestiona atletas</p>
          </CardContent>
          <CardHeader className="p-4 pt-0">
            <Button variant="outline" size="sm" className="w-full" asChild>
              <Link href={`/app/${coachData.academyId}/athletes`}>Ver atletas</Link>
            </Button>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="p-6 pb-3">
            <CardTitle className="text-base font-semibold">Información personal</CardTitle>
            <CardDescription>
              Tu información de contacto y especialidades.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 pt-0">
            <dl className="space-y-4 text-sm">
              <div className="flex flex-col">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Nombre</dt>
                <dd className="font-medium text-foreground">{coachData.name ?? "Sin nombre"}</dd>
              </div>
              {coachData.email && (
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <div className="flex flex-col">
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">Email</dt>
                    <dd className="font-medium text-foreground">{coachData.email}</dd>
                  </div>
                </div>
              )}
              {coachData.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <div className="flex flex-col">
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">Teléfono</dt>
                    <dd className="font-medium text-foreground">{coachData.phone}</dd>
                  </div>
                </div>
              )}
              {coachData.specialties && coachData.specialties.length > 0 && (
                <div className="flex flex-col">
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Especialidades</dt>
                  <dd className="mt-2 flex flex-wrap gap-2">
                    {coachData.specialties.map((specialty, idx) => (
                      <span
                        key={idx}
                        className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
                      >
                        {specialty}
                      </span>
                    ))}
                  </dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-6 pb-3">
            <CardTitle className="text-base font-semibold">Biografía</CardTitle>
            <CardDescription>
              Información sobre tu experiencia y formación.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 pt-0">
            {coachData.bio ? (
              <p className="text-sm text-muted-foreground whitespace-pre-line">{coachData.bio}</p>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                Aún no has agregado una biografía. Contacta con el administrador para actualizarla.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="p-6 pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Award className="h-4 w-4" />
            Accesos rápidos
          </CardTitle>
          <CardDescription>
            Accesos directos a las funciones más utilizadas.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 p-6 pt-0 md:grid-cols-2">
          <Button variant="outline" className="justify-start" asChild>
            <Link href={targetProfileId ? `/dashboard/calendar?profileId=${targetProfileId}` : "/dashboard/calendar"}>
              <Calendar className="mr-2 h-4 w-4" />
              Ver calendario de sesiones
            </Link>
          </Button>
          <Button variant="outline" className="justify-start" asChild>
            <Link href={`/app/${coachData.academyId}/classes`}>
              <Users className="mr-2 h-4 w-4" />
              Ver mis clases
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}


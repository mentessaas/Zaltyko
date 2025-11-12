"use client";

import Link from "next/link";
import { type User } from "@supabase/supabase-js";
import { Users, Mail, Phone, Calendar, ArrowLeft, Shield } from "lucide-react";

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

interface ChildAthlete {
  id: string;
  name: string | null;
  level: string | null;
  status: string | null;
  academyId: string;
  academyName: string | null;
  age: number | null;
}

interface ParentProfileProps {
  user: User | null;
  profile: ProfileRow | null;
  children: ChildAthlete[];
  targetProfileId?: string | null;
}

export function ParentProfile({ user, profile, children, targetProfileId }: ParentProfileProps) {
  const initials = (profile?.name || user?.email || "T").slice(0, 2).toUpperCase();

  return (
    <div className="space-y-8">
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
      <header className="flex flex-col gap-4 rounded-xl border bg-card p-6 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16">
            <AvatarFallback className="bg-primary/10 text-lg font-semibold text-primary">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold">Mi perfil - Tutor</h1>
            <p className="text-sm text-muted-foreground">
              Gestiona la información de tus hijos atletas y sus actividades.
            </p>
          </div>
        </div>
        <div className="rounded-full border border-primary/20 bg-primary/5 px-4 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
          Tutor / Padre
        </div>
      </header>

      <Card>
        <CardHeader className="p-6 pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Users className="h-4 w-4" />
            Mis hijos atletas
          </CardTitle>
          <CardDescription>
            Información sobre los atletas que tienes a cargo.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 pt-0">
          {children.length === 0 ? (
            <div className="rounded-lg border border-dashed border-muted-foreground/30 bg-muted/20 p-8 text-center">
              <p className="text-sm text-muted-foreground">
                Aún no tienes atletas asociados a tu cuenta. Contacta con tu academia para asociar a tus hijos.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {children.map((child) => (
                <Card key={child.id}>
                  <CardHeader className="p-4">
                    <CardTitle className="text-base">{child.name ?? "Sin nombre"}</CardTitle>
                    <CardDescription>{child.academyName ?? "Academia"}</CardDescription>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <dl className="space-y-2 text-sm">
                      {child.age !== null && (
                        <div className="flex justify-between">
                          <dt className="text-muted-foreground">Edad</dt>
                          <dd className="font-medium">{child.age} años</dd>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Nivel</dt>
                        <dd className="font-medium">{child.level ?? "No definido"}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Estado</dt>
                        <dd className="font-medium capitalize">{child.status ?? "Sin estado"}</dd>
                      </div>
                    </dl>
                  </CardContent>
                  <CardHeader className="p-4 pt-0">
                    <Button variant="outline" size="sm" className="w-full" asChild>
                      <Link href={`/dashboard/athletes/${child.id}`}>Ver detalles</Link>
                    </Button>
                  </CardHeader>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="p-6 pb-3">
            <CardTitle className="text-base font-semibold">Información personal</CardTitle>
            <CardDescription>
              Tus datos de contacto.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 pt-0">
            <dl className="space-y-4 text-sm">
              <div className="flex flex-col">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Nombre</dt>
                <dd className="font-medium text-foreground">{profile?.name ?? "Sin nombre"}</dd>
              </div>
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
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Calendar className="h-4 w-4" />
              Accesos rápidos
            </CardTitle>
            <CardDescription>
              Accesos directos a las funciones más utilizadas.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 p-6 pt-0">
            {children.length > 0 && (
              <>
                <Button variant="outline" className="justify-start" asChild>
                  <Link href="/dashboard/athletes">
                    <Users className="mr-2 h-4 w-4" />
                    Ver información de mis hijos
                  </Link>
                </Button>
                <Button variant="outline" className="justify-start" asChild>
                  <Link href={targetProfileId ? `/dashboard/calendar?profileId=${targetProfileId}` : "/dashboard/calendar"}>
                    <Calendar className="mr-2 h-4 w-4" />
                    Ver calendario de actividades
                  </Link>
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


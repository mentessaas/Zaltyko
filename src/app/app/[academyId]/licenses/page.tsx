import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { format, differenceInDays } from "date-fns";
import { es } from "date-fns/locale";
import { Shield, AlertTriangle, CheckCircle, XCircle, Plus, Calendar, FileText } from "lucide-react";

import { db } from "@/db";
import {
  academies,
  athletes,
  federativeLicenses,
  memberships,
  profiles,
} from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";

interface LicensesPageProps {
  params: Promise<{
    academyId: string;
  }>;
}

function getLicenseStatus(license: { validUntil: string | null; medicalCertificateExpiry: string | null }) {
  const now = new Date();
  const today = now.toISOString().split("T")[0];

  if (!license.validUntil) return { status: "unknown", label: "Sin fecha", variant: "outline" as const };

  const daysUntilExpiry = differenceInDays(new Date(license.validUntil), now);

  if (daysUntilExpiry < 0) {
    return { status: "expired", label: "Caducada", variant: "error" as const };
  }
  if (daysUntilExpiry <= 30) {
    return { status: "expiring", label: `${daysUntilExpiry} días`, variant: "pending" as const };
  }
  return { status: "active", label: "Activa", variant: "active" as const };
}

export default async function LicensesPage({ params }: LicensesPageProps) {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, user.id))
    .limit(1);

  if (!profile) redirect("/dashboard");

  const { academyId } = await params;

  // Check academy exists and user has access
  const [academy] = await db
    .select({ id: academies.id, name: academies.name, tenantId: academies.tenantId })
    .from(academies)
    .where(eq(academies.id, academyId))
    .limit(1);

  if (!academy) notFound();

  const membershipRows = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.userId, user.id), eq(memberships.academyId, academyId)))
    .limit(1);

  const canAccess =
    profile.role === "super_admin" ||
    profile.role === "admin" ||
    profile.tenantId === academy.tenantId ||
    membershipRows.length > 0;

  if (!canAccess) redirect("/dashboard");

  const today = new Date().toISOString().split("T")[0];
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

  // Get athletes for this academy
  const academyAthletes = await db
    .select({ id: athletes.id, name: athletes.name })
    .from(athletes)
    .where(eq(athletes.academyId, academyId))
    .orderBy(athletes.name);

  const athleteIds = academyAthletes.map((a) => a.id);

  // Get all licenses for this academy's athletes
  const licenses = athleteIds.length > 0
    ? await db
        .select({
          id: federativeLicenses.id,
          personId: federativeLicenses.personId,
          personType: federativeLicenses.personType,
          licenseNumber: federativeLicenses.licenseNumber,
          licenseType: federativeLicenses.licenseType,
          federation: federativeLicenses.federation,
          validFrom: federativeLicenses.validFrom,
          validUntil: federativeLicenses.validUntil,
          medicalCertificateExpiry: federativeLicenses.medicalCertificateExpiry,
          status: federativeLicenses.status,
          notes: federativeLicenses.notes,
        })
        .from(federativeLicenses)
        .where(eq(federativeLicenses.tenantId, academy.tenantId))
        .orderBy(desc(federativeLicenses.validUntil))
    : [];

  // Stats
  const activeLicenses = licenses.filter((l) => {
    const status = getLicenseStatus(l);
    return status.status === "active";
  });
  const expiringLicenses = licenses.filter((l) => {
    const status = getLicenseStatus(l);
    return status.status === "expiring";
  });
  const expiredLicenses = licenses.filter((l) => {
    const status = getLicenseStatus(l);
    return status.status === "expired";
  });

  // Group licenses by athlete
  const licensesByAthlete = licenses.reduce((acc, license) => {
    if (!acc[license.personId]) acc[license.personId] = [];
    acc[license.personId].push(license);
    return acc;
  }, {} as Record<string, typeof licenses>);

  return (
    <div className="space-y-6 py-6 md:py-8">
      <PageHeader
        breadcrumbs={[
          { label: "Dashboard", href: `/app/${academyId}/dashboard` },
          { label: "Licencias" },
        ]}
        title="Licencias Federativas"
        description="Gestión de licencias federativas y certificados médicos."
        icon={<Shield className="h-5 w-5" strokeWidth={1.5} />}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-zaltyko-teal/20 bg-zaltyko-teal/10">
          <CardContent className="p-4 text-center">
            <CheckCircle className="mx-auto mb-2 h-8 w-8 text-zaltyko-teal" />
            <p className="font-display text-2xl font-bold text-zaltyko-teal">{activeLicenses.length}</p>
            <p className="text-sm text-zaltyko-teal">Activas</p>
          </CardContent>
        </Card>
        <Card className="border-zaltyko-indigo/20 bg-zaltyko-indigo/10">
          <CardContent className="p-4 text-center">
            <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-zaltyko-indigo" />
            <p className="font-display text-2xl font-bold text-zaltyko-indigo">{expiringLicenses.length}</p>
            <p className="text-sm text-zaltyko-indigo">Por caducar (30d)</p>
          </CardContent>
        </Card>
        <Card className="border-zaltyko-coral/20 bg-zaltyko-coral/10">
          <CardContent className="p-4 text-center">
            <XCircle className="mx-auto mb-2 h-8 w-8 text-zaltyko-coral" />
            <p className="font-display text-2xl font-bold text-zaltyko-coral">{expiredLicenses.length}</p>
            <p className="text-sm text-zaltyko-coral">Caducadas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Shield className="mx-auto mb-2 h-8 w-8 text-zaltyko-navy" />
            <p className="font-display text-2xl font-bold text-zaltyko-navy">{licenses.length}</p>
            <p className="text-sm text-zaltyko-text-secondary">Total licencias</p>
          </CardContent>
        </Card>
      </div>

      {/* Alert for expiring licenses */}
      {expiringLicenses.length > 0 && (
        <Card className="border-zaltyko-indigo/20 bg-zaltyko-indigo/10">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 shrink-0 text-zaltyko-indigo" />
              <div>
                <p className="font-medium text-zaltyko-indigo">
                  {expiringLicenses.length} licencia{expiringLicenses.length > 1 ? "s" : ""} por caducar
                </p>
                <p className="text-sm text-zaltyko-text-secondary">
                  Revisa y renueva antes de la fecha de caducidad.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Licenses by athlete */}
      {academyAthletes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <FileText className="mb-4 h-12 w-12 text-zaltyko-mist" />
            <h3 className="font-semibold mb-2">No hay atletas</h3>
            <p className="text-sm text-zaltyko-text-secondary">
              Agrega atletas a la academia para gestionar sus licencias.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {academyAthletes.map((athlete) => {
            const athleteLicenses = licensesByAthlete[athlete.id] || [];

            return (
              <Card key={athlete.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{athlete.name}</CardTitle>
                    <Badge variant="outline">
                      {athleteLicenses.length} licencia{athleteLicenses.length !== 1 ? "s" : ""}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {athleteLicenses.length === 0 ? (
                    <p className="py-4 text-center text-sm text-zaltyko-text-secondary">
                      Sin licencias federativas registradas.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {athleteLicenses.map((license) => {
                        const status = getLicenseStatus(license);

                        return (
                          <div
                            key={license.id}
                            className="flex items-center justify-between rounded-xl border border-zaltyko-mist bg-zaltyko-warm-white p-3"
                          >
                            <div className="flex items-center gap-3">
                              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                                status.status === "active" ? "bg-zaltyko-teal/10" :
                                status.status === "expiring" ? "bg-zaltyko-indigo/10" :
                                status.status === "expired" ? "bg-zaltyko-coral/10" : "bg-zaltyko-mist/30"
                              }`}>
                                <Shield className={`h-5 w-5 ${
                                  status.status === "active" ? "text-zaltyko-teal" :
                                  status.status === "expiring" ? "text-zaltyko-indigo" :
                                  status.status === "expired" ? "text-zaltyko-coral" : "text-zaltyko-text-secondary"
                                }`} />
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="font-medium text-sm">{license.licenseType}</p>
                                  <Badge variant={status.variant} className="text-xs">
                                    {status.label}
                                  </Badge>
                                </div>
                                <p className="text-xs text-zaltyko-text-secondary">
                                  {license.federation} · {license.licenseNumber}
                                </p>
                                <div className="mt-1 flex items-center gap-3 text-xs text-zaltyko-text-secondary">
                                  <span className="flex items-center gap-1">
                                    <Calendar className="h-3 w-3" />
                                    Válida: {license.validFrom
                                      ? format(new Date(license.validFrom), "dd MMM yyyy", { locale: es })
                                      : "—"} → {license.validUntil
                                      ? format(new Date(license.validUntil), "dd MMM yyyy", { locale: es })
                                      : "—"}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              {license.medicalCertificateExpiry && (
                                <p className="text-xs text-zaltyko-text-secondary">
                                  Certificado: {format(new Date(license.medicalCertificateExpiry), "dd MMM yyyy", { locale: es })}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

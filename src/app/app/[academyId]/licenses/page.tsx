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
    <div className="space-y-6 p-4 md:p-8">
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
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="p-4 text-center">
            <CheckCircle className="h-8 w-8 text-emerald-600 mx-auto mb-2" />
            <p className="text-2xl font-bold text-emerald-800">{activeLicenses.length}</p>
            <p className="text-sm text-emerald-700">Activas</p>
          </CardContent>
        </Card>
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4 text-center">
            <AlertTriangle className="h-8 w-8 text-amber-600 mx-auto mb-2" />
            <p className="text-2xl font-bold text-amber-800">{expiringLicenses.length}</p>
            <p className="text-sm text-amber-700">Por caducar (30d)</p>
          </CardContent>
        </Card>
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4 text-center">
            <XCircle className="h-8 w-8 text-red-600 mx-auto mb-2" />
            <p className="text-2xl font-bold text-red-800">{expiredLicenses.length}</p>
            <p className="text-sm text-red-700">Caducadas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Shield className="h-8 w-8 text-primary mx-auto mb-2" />
            <p className="text-2xl font-bold">{licenses.length}</p>
            <p className="text-sm text-muted-foreground">Total licencias</p>
          </CardContent>
        </Card>
      </div>

      {/* Alert for expiring licenses */}
      {expiringLicenses.length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
              <div>
                <p className="font-medium text-amber-800">
                  {expiringLicenses.length} licencia{expiringLicenses.length > 1 ? "s" : ""} por caducar
                </p>
                <p className="text-sm text-amber-700">
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
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="font-semibold mb-2">No hay atletas</h3>
            <p className="text-sm text-muted-foreground">
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
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Sin licencias federativas registradas.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {athleteLicenses.map((license) => {
                        const status = getLicenseStatus(license);

                        return (
                          <div
                            key={license.id}
                            className="flex items-center justify-between p-3 rounded-lg border"
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                                status.status === "active" ? "bg-emerald-100" :
                                status.status === "expiring" ? "bg-amber-100" :
                                status.status === "expired" ? "bg-red-100" : "bg-gray-100"
                              }`}>
                                <Shield className={`h-5 w-5 ${
                                  status.status === "active" ? "text-emerald-600" :
                                  status.status === "expiring" ? "text-amber-600" :
                                  status.status === "expired" ? "text-red-600" : "text-gray-600"
                                }`} />
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="font-medium text-sm">{license.licenseType}</p>
                                  <Badge variant={status.variant} className="text-xs">
                                    {status.label}
                                  </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {license.federation} · {license.licenseNumber}
                                </p>
                                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
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
                                <p className="text-xs text-muted-foreground">
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

import { CalendarClock } from "lucide-react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { memberships, profiles } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { LeadTrialsWorkspace } from "@/components/lead-trials/LeadTrialsWorkspace";
import { AccessDenied } from "@/components/ui/access-denied";

export default async function AcademyTrialsPage({ params }: { params: Promise<{ academyId: string }> }) {
  const { academyId } = await params;
  const supabase = await createClient(await cookies());
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");
  const [profile] = await db.select({ id: profiles.id, role: profiles.role }).from(profiles).where(eq(profiles.userId, user.id)).limit(1);
  if (!profile) redirect("/dashboard");
  const [membership] = await db.select({ role: memberships.role }).from(memberships).where(and(eq(memberships.academyId, academyId), eq(memberships.userId, user.id))).limit(1);
  const canManage = profile.role === "super_admin" || profile.role === "admin" || profile.role === "owner" || membership?.role === "owner";
  const header = <PageHeader breadcrumbs={[{ label: "Dashboard", href: `/app/${academyId}/dashboard` }, { label: "Pruebas" }]} title="Pruebas de clase" description="Convierte cada visita en un siguiente paso claro para la academia y la familia." icon={<CalendarClock className="h-5 w-5" />} />;
  if (!canManage) return <div className="mx-auto max-w-[1500px] space-y-6">{header}<AccessDenied variant="billing" title="Esta sección es solo para administradores" description="Solo el owner o los administradores pueden gestionar pruebas de clase." ctaLabel="Volver al dashboard" ctaHref={`/app/${academyId}/dashboard`} /></div>;
  return <div className="mx-auto max-w-[1500px] space-y-6">{header}<LeadTrialsWorkspace academyId={academyId} /></div>;
}

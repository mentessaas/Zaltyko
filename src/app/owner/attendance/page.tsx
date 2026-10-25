import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { OwnerAttendanceManager } from "@/components/owner-dashboard/OwnerAttendanceManager";
import { createClient } from "@/lib/supabase/server";
import { getOwnerAttendanceSessionOptions } from "@/modules/attendance/application/owner-attendance-sessions";
import { OperationalError } from "@/modules/shared/domain/operational-error";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Asistencia | Zaltyko",
  description: "Pasa lista en las sesiones de tu academia.",
  robots: { index: false, follow: false },
};

const querySchema = z.object({
  organizationId: z.guid().optional(),
  locationId: z.guid().optional(),
  sessionId: z.guid().optional(),
});

export default async function OwnerAttendancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?next=/owner/attendance");

  const raw = await searchParams;
  const query = querySchema.safeParse({
    organizationId:
      typeof raw.organizationId === "string" ? raw.organizationId : undefined,
    locationId: typeof raw.locationId === "string" ? raw.locationId : undefined,
    sessionId: typeof raw.sessionId === "string" ? raw.sessionId : undefined,
  });
  if (!query.success) notFound();

  let data: Awaited<ReturnType<typeof getOwnerAttendanceSessionOptions>>;
  try {
    data = await getOwnerAttendanceSessionOptions({
      userId: user.id,
      organizationId: query.data.organizationId,
      locationId: query.data.locationId,
      sessionId: query.data.sessionId,
    });
  } catch (error) {
    if (error instanceof OperationalError) {
      if (error.code === "FORBIDDEN" && !query.data.organizationId) {
        redirect("/owner/setup");
      }
      if (
        error.code === "FORBIDDEN" ||
        error.code === "LOCATION_SCOPE_DENIED" ||
        error.code === "INVALID_RELATION"
      ) {
        notFound();
      }
    }
    throw error;
  }

  return (
    <OwnerAttendanceManager
      organizationId={data.organization.id}
      locationId={data.locationId}
      sessions={data.sessions}
      initialSessionId={query.data.sessionId}
      initialNextCursor={data.nextCursor}
      selectedSession={data.selectedSession}
    />
  );
}

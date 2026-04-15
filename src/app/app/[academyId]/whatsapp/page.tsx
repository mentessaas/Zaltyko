import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq, and } from "drizzle-orm";

import { db } from "@/db";
import { academies, memberships, profiles } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { WhatsAppPage } from "./WhatsAppPage";

interface PageProps {
  params: Promise<{
    academyId: string;
  }>;
}

export default async function WhatsAppRoutePage({ params }: PageProps) {
  const { academyId } = await params;
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, user.id))
    .limit(1);

  if (!profile) {
    redirect("/onboarding");
  }

  // Check if user has access to this academy
  const [membership] = await db
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, profile.id),
        eq(memberships.academyId, academyId)
      )
    )
    .limit(1);

  const canAccess =
    profile.role === "super_admin" ||
    profile.role === "owner" ||
    profile.role === "admin" ||
    !!membership;

  if (!canAccess) {
    redirect("/dashboard");
  }

  // Get academy info
  const [academy] = await db
    .select({
      id: academies.id,
      name: academies.name,
    })
    .from(academies)
    .where(eq(academies.id, academyId))
    .limit(1);

  if (!academy) {
    redirect("/dashboard");
  }

  // WhatsApp config - these would come from settings or academy metadata
  const whatsappConfig = {
    phone: "",
    apiKey: "",
    isConfigured: false,
  };

  // Get classes for recipient selection
  const { classes } = await import("@/db/schema");
  const classRows = await db
    .select({
      id: classes.id,
      name: classes.name,
    })
    .from(classes)
    .where(eq(classes.academyId, academyId))
    .orderBy(classes.name);

  // Get groups for recipient selection
  const { groups } = await import("@/db/schema");
  const groupRows = await db
    .select({
      id: groups.id,
      name: groups.name,
    })
    .from(groups)
    .where(eq(groups.academyId, academyId))
    .orderBy(groups.name);

  // Get athletes for recipient selection
  const athleteRows = await db
    .select({
      id: profiles.id,
      name: profiles.name,
      phone: profiles.phone,
    })
    .from(profiles)
    .innerJoin(memberships, eq(memberships.userId, profiles.id))
    .where(eq(memberships.academyId, academyId))
    .orderBy(profiles.name);

  return (
    <WhatsAppPage
      academyId={academyId}
      academyName={academy.name}
      whatsappConfig={whatsappConfig}
      classes={classRows.map((c) => ({ id: c.id, name: c.name }))}
      groups={groupRows.map((g) => ({ id: g.id, name: g.name }))}
      recipients={athleteRows.map((a) => ({
        id: a.id,
        name: a.name ?? "Sin nombre",
        phone: a.phone ?? "",
      }))}
    />
  );
}

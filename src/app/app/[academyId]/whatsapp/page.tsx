import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { desc, eq, and } from "drizzle-orm";

import { db } from "@/db";
import { academies, athletes, familyContacts, memberships, messageTemplates, profiles } from "@/db/schema";
import { FeatureUnavailableState } from "@/components/product/FeatureUnavailableState";
import { isFeatureEnabled } from "@/lib/product/features";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_WHATSAPP_TEMPLATES } from "@/lib/communication/default-whatsapp-templates";
import { getAcademySportConfigOptions } from "@/lib/sport-config/service";
import { WhatsAppPage } from "./WhatsAppPage";

interface PageProps {
  params: Promise<{
    academyId: string;
  }>;
}

export default async function WhatsAppRoutePage({ params }: PageProps) {
  const { academyId } = await params;

  if (!isFeatureEnabled("whatsapp")) {
    return (
      <FeatureUnavailableState
        title="WhatsApp Business"
        description="La mensajería por WhatsApp todavía no está activada en la versión para primeros clientes. Seguimos priorizando email, notificaciones internas y mensajes auditables."
        backHref={`/app/${academyId}/dashboard`}
        backLabel="Volver al dashboard"
      />
    );
  }
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
    redirect("/onboarding/owner");
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
      tenantId: academies.tenantId,
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
      sportConfigId: classes.sportConfigId,
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
      sportConfigId: groups.sportConfigId,
    })
    .from(groups)
    .where(eq(groups.academyId, academyId))
    .orderBy(groups.name);

  // Get athletes with family contact phones for recipient selection
  const recipientRows = await db
    .select({
      id: athletes.id,
      name: athletes.name,
      phone: familyContacts.phone,
      sportConfigId: athletes.primarySportConfigId,
    })
    .from(athletes)
    .innerJoin(familyContacts, eq(familyContacts.athleteId, athletes.id))
    .where(eq(athletes.academyId, academyId))
    .orderBy(athletes.name);

  const recipientMap = new Map<string, {
    id: string;
    name: string;
    phone: string;
    sportConfigId: string | null;
  }>();

  for (const row of recipientRows) {
    if (!row.phone) continue;
    if (recipientMap.has(row.id)) continue;
    recipientMap.set(row.id, {
      id: row.id,
      name: row.name,
      phone: row.phone,
      sportConfigId: row.sportConfigId,
    });
  }

  const sportConfigs = await getAcademySportConfigOptions(academyId);
  const templateRows = await db
    .select({
      id: messageTemplates.id,
      name: messageTemplates.name,
      body: messageTemplates.body,
      templateType: messageTemplates.templateType,
      sportConfigId: messageTemplates.sportConfigId,
    })
    .from(messageTemplates)
    .where(and(
      eq(messageTemplates.tenantId, academy.tenantId),
      eq(messageTemplates.channel, "whatsapp"),
      eq(messageTemplates.isActive, true)
    ))
    .orderBy(desc(messageTemplates.createdAt));

  const templates = templateRows.length > 0
    ? templateRows.map((template) => ({
        id: template.id,
        name: template.name,
        content: template.body,
        category: template.templateType.includes("payment")
          ? "payment" as const
          : template.templateType.includes("event")
            ? "event" as const
            : template.templateType.includes("schedule") || template.templateType.includes("class")
              ? "schedule" as const
              : "reminder" as const,
        sportConfigId: template.sportConfigId,
      }))
    : DEFAULT_WHATSAPP_TEMPLATES;

  return (
    <WhatsAppPage
      academyId={academyId}
      academyName={academy.name}
      whatsappConfig={whatsappConfig}
      classes={classRows.map((c) => ({ id: c.id, name: c.name, sportConfigId: c.sportConfigId }))}
      groups={groupRows.map((g) => ({ id: g.id, name: g.name, sportConfigId: g.sportConfigId }))}
      recipients={Array.from(recipientMap.values())}
      sportConfigs={sportConfigs.map((config) => ({
        id: config.id,
        branchName: config.branchName,
        disciplineName: config.disciplineName,
        terminology: config.terminology,
      }))}
      templates={templates}
    />
  );
}

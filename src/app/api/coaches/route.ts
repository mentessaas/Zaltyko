import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { academies, classCoachAssignments, classes, coaches, memberships, profiles } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { markChecklistItem, markWizardStep } from "@/lib/onboarding";

const bodySchema = z.object({
  academyId: z.string().uuid(),
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  profileId: z.string().uuid().optional(),
});

const querySchema = z.object({
  academyId: z.string().uuid().optional(),
  includeAssignments: z
    .string()
    .transform((value) => value === "true" || value === "1")
    .optional(),
});

export const GET = withTenant(async (request, context) => {
  const url = new URL(request.url);
  const params = querySchema.safeParse(Object.fromEntries(url.searchParams));

  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  if (!params.success) {
    return NextResponse.json({ error: "INVALID_FILTERS" }, { status: 400 });
  }

  const { academyId, includeAssignments } = params.data;

  const coachFilter = academyId ? eq(coaches.academyId, academyId) : eq(coaches.tenantId, context.tenantId);

  const coachRows = await db
    .select({
      id: coaches.id,
      name: coaches.name,
      email: coaches.email,
      phone: coaches.phone,
      academyId: coaches.academyId,
      academyName: academies.name,
      createdAt: coaches.createdAt,
    })
    .from(coaches)
    .innerJoin(academies, eq(coaches.academyId, academies.id))
    .where(coachFilter)
    .orderBy(asc(coaches.name));

  if (!includeAssignments) {
    return NextResponse.json({ items: coachRows });
  }

  const assignmentRows = await db
    .select({
      coachId: classCoachAssignments.coachId,
      classId: classes.id,
      className: classes.name,
      classAcademyId: classes.academyId,
    })
    .from(classCoachAssignments)
    .innerJoin(classes, eq(classCoachAssignments.classId, classes.id))
    .where(academyId ? eq(classes.academyId, academyId) : eq(classCoachAssignments.tenantId, context.tenantId));

  const enriched = coachRows.map((coach) => {
    const classesForCoach = assignmentRows
      .filter((assignment) => assignment.coachId === coach.id && assignment.classId)
      .map((assignment) => ({
        id: assignment.classId,
        name: assignment.className ?? null,
        academyId: assignment.classAcademyId ?? null,
      }));

    return {
      ...coach,
      classes: classesForCoach,
    };
  });

  return NextResponse.json({ items: enriched });
});

export const POST = withTenant(async (request, context) => {
  const body = bodySchema.parse(await request.json());

  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const coachId = crypto.randomUUID();

  await db.insert(coaches).values({
    id: coachId,
    tenantId: context.tenantId,
    academyId: body.academyId,
    name: body.name,
    email: body.email,
    phone: body.phone,
  });

  if (body.profileId) {
    const [linkedProfile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, body.profileId))
      .limit(1);

    if (!linkedProfile) {
      return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });
    }

    await db
      .insert(memberships)
      .values({
        id: crypto.randomUUID(),
        academyId: body.academyId,
        userId: linkedProfile.userId,
        role: "coach",
      })
      .onConflictDoNothing();
  }

  await markWizardStep({
    academyId: body.academyId,
    tenantId: context.tenantId,
    step: "coaches",
  });

  await markChecklistItem({
    academyId: body.academyId,
    tenantId: context.tenantId,
    key: "invite_first_coach",
  });

  return NextResponse.json({ id: coachId });
});

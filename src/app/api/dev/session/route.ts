import { NextResponse } from "next/server";
import { isDevFeaturesEnabled } from "@/lib/dev";
import { and, count, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  academies,
  athletes,
  attendanceRecords,
  classSessions,
  classes,
  coaches,
  familyContacts,
  memberships,
  plans,
  profiles,
  subscriptions,
} from "@/db/schema";

const DEV_USER_ID = process.env.MOCK_DEV_USER_ID ?? "11111111-aaaa-bbbb-cccc-111111111111";
const DEV_PROFILE_ID = process.env.MOCK_DEV_PROFILE_ID ?? "22222222-aaaa-bbbb-cccc-222222222222";
const DEV_TENANT_ID = process.env.MOCK_DEV_TENANT_ID ?? "33333333-aaaa-bbbb-cccc-333333333333";
const DEV_ACADEMY_ID = process.env.MOCK_DEV_ACADEMY_ID ?? "44444444-aaaa-bbbb-cccc-444444444444";

const DEMO_COACHES = [
  {
    id: "55555555-aaaa-bbbb-cccc-555555555555",
    name: "Laura Méndez",
    email: "laura.mendez@gymna.demo",
  },
  {
    id: "66666666-aaaa-bbbb-cccc-666666666666",
    name: "Diego Núñez",
    email: "diego.nunez@gymna.demo",
  },
];

const DEMO_ATHLETES = [
  {
    id: "77777777-aaaa-bbbb-cccc-777777777777",
    name: "Ana Torres",
    level: "Nivel 6",
  },
  {
    id: "88888888-aaaa-bbbb-cccc-888888888888",
    name: "Camila Ríos",
    level: "Nivel 4",
  },
  {
    id: "99999999-aaaa-bbbb-cccc-999999999999",
    name: "Valentina Cruz",
    level: "Nivel 3",
  },
];

const DEMO_CLASS_ID = "aaaa1111-bbbb-cccc-dddd-eeeeeeeeeeee";
const DEMO_SESSION_ID = "bbbb1111-bbbb-cccc-dddd-ffffffffffff";

const DEMO_CONTACTS = [
  {
    id: "cccc1111-bbbb-cccc-dddd-aaaaaaaaaaaa",
    athleteId: DEMO_ATHLETES[0].id,
    name: "Patricia Torres",
    relationship: "Madre",
    email: "patricia.torres@example.com",
    phone: "+34 600 123 123",
  },
  {
    id: "cccc2222-bbbb-cccc-dddd-aaaaaaaaaaaa",
    athleteId: DEMO_ATHLETES[1].id,
    name: "Luis Ríos",
    relationship: "Padre",
    email: "luis.rios@example.com",
    phone: "+34 600 456 456",
  },
];

const DEMO_ATTENDANCE = [
  {
    sessionId: DEMO_SESSION_ID,
    athleteId: DEMO_ATHLETES[0].id,
    status: "present",
  },
  {
    sessionId: DEMO_SESSION_ID,
    athleteId: DEMO_ATHLETES[1].id,
    status: "present",
  },
  {
    sessionId: DEMO_SESSION_ID,
    athleteId: DEMO_ATHLETES[2].id,
    status: "injured",
  },
];

function isDevEnabled() {
  return isDevFeaturesEnabled;
}

async function ensureProfile() {
  const [profile] = await db
    .insert(profiles)
    .values({
      id: DEV_PROFILE_ID,
      userId: DEV_USER_ID,
      tenantId: DEV_TENANT_ID,
      name: "Directora Demo",
      role: "owner",
    })
    .onConflictDoUpdate({
      target: profiles.userId,
      set: {
        tenantId: DEV_TENANT_ID,
        name: "Directora Demo",
        role: "owner",
      },
    })
    .returning();

  return profile;
}

async function ensureAcademy(ownerId: string) {
  const [academy] = await db
    .insert(academies)
    .values({
      id: DEV_ACADEMY_ID,
      tenantId: DEV_TENANT_ID,
      name: "Aurora Elite Demo",
      country: "ES",
      region: "Madrid",
      academyType: "artistica",
      ownerId,
    })
    .onConflictDoNothing()
    .returning();

  if (academy) {
    return academy;
  }

  const [existing] = await db
    .select()
    .from(academies)
    .where(eq(academies.id, DEV_ACADEMY_ID))
    .limit(1);

  return existing;
}

async function ensureMembership() {
  await db
    .insert(memberships)
    .values({
      userId: DEV_USER_ID,
      academyId: DEV_ACADEMY_ID,
      role: "owner",
    })
    .onConflictDoNothing();
}

async function ensureSubscription() {
  const [plan] = await db
    .select({ id: plans.id })
    .from(plans)
    .where(eq(plans.code, "free"))
    .limit(1);

  await db
    .insert(subscriptions)
    .values({
      userId: DEV_USER_ID,
      planId: plan?.id ?? null,
      status: "active",
    })
    .onConflictDoUpdate({
      target: subscriptions.userId,
      set: {
        planId: plan?.id ?? null,
        status: "active",
      },
    });
}

async function ensureCoaches() {
  for (const coach of DEMO_COACHES) {
    await db
      .insert(coaches)
      .values({
        id: coach.id,
        tenantId: DEV_TENANT_ID,
        academyId: DEV_ACADEMY_ID,
        name: coach.name,
        email: coach.email,
      })
      .onConflictDoNothing();
  }
}

async function ensureAthletes() {
  const [{ value }] = await db
    .select({ value: count() })
    .from(athletes)
    .where(and(eq(athletes.academyId, DEV_ACADEMY_ID), eq(athletes.tenantId, DEV_TENANT_ID)));

  if (Number(value ?? 0) > 0) {
    return;
  }

  for (const athlete of DEMO_ATHLETES) {
    await db.insert(athletes).values({
      id: athlete.id,
      tenantId: DEV_TENANT_ID,
      academyId: DEV_ACADEMY_ID,
      name: athlete.name,
      level: athlete.level,
    });
  }
}

async function ensureClass() {
  await db
    .insert(classes)
    .values({
      id: DEMO_CLASS_ID,
      tenantId: DEV_TENANT_ID,
      academyId: DEV_ACADEMY_ID,
      name: "Rutina suelo - nivel 6",
      weekday: 2,
      startTime: "18:00:00",
      endTime: "19:30:00",
      capacity: 12,
    })
    .onConflictDoNothing();
}

async function ensureClassSession() {
  await db
    .insert(classSessions)
    .values({
      id: DEMO_SESSION_ID,
      tenantId: DEV_TENANT_ID,
      classId: DEMO_CLASS_ID,
      coachId: DEMO_COACHES[0].id,
      sessionDate: new Date().toISOString().slice(0, 10),
      startTime: "18:00",
      endTime: "19:30",
      status: "scheduled",
      notes: "Sesión demo generada automáticamente.",
    })
    .onConflictDoNothing();
}

async function ensureAttendance() {
  for (const record of DEMO_ATTENDANCE) {
    await db
      .insert(attendanceRecords)
      .values({
        id: crypto.randomUUID(),
        tenantId: DEV_TENANT_ID,
        sessionId: record.sessionId,
        athleteId: record.athleteId,
        status: record.status,
      })
      .onConflictDoNothing();
  }
}

async function ensureFamilyContacts() {
  for (const contact of DEMO_CONTACTS) {
    await db
      .insert(familyContacts)
      .values({
        id: contact.id,
        tenantId: DEV_TENANT_ID,
        athleteId: contact.athleteId,
        name: contact.name,
        relationship: contact.relationship,
        email: contact.email,
        phone: contact.phone,
      })
      .onConflictDoNothing();
  }
}

export async function ensureDevSessionData() {
  const profile = await ensureProfile();
  const academy = await ensureAcademy(profile.id);
  await ensureMembership();
  await ensureSubscription();
  await ensureCoaches();
  await ensureAthletes();
  await ensureClass();
  await ensureClassSession();
  await ensureAttendance();
  await ensureFamilyContacts();

  return {
    userId: DEV_USER_ID,
    profileId: profile.id,
    tenantId: DEV_TENANT_ID,
    academyId: academy?.id ?? DEV_ACADEMY_ID,
    academyName: academy?.name ?? "Aurora Elite Demo",
    academyType: academy?.academyType ?? "artistica",
    sessionId: DEMO_SESSION_ID,
  };
}

export async function POST() {
  if (!isDevEnabled()) {
    return NextResponse.json({ error: "DEV_SESSION_DISABLED" }, { status: 404 });
  }

  try {
    const payload = await ensureDevSessionData();
    return NextResponse.json(payload);
  } catch (error: any) {
    console.error("DEV_SESSION_ERROR", error?.message, error?.stack);
    return NextResponse.json(
      {
        error: "DEV_SESSION_FAILED",
        message: error?.message ?? "Unknown error",
      },
      { status: 500 }
    );
  }
}

export const GET = POST;


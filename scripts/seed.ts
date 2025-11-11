/* eslint-disable no-console */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  academies,
  athletes,
  attendanceRecords,
  billingEvents,
  billingInvoices,
  classCoachAssignments,
  classSessions,
  classes,
  coaches,
  guardianAthletes,
  guardians,
  invitations,
  memberships,
  plans,
  profiles,
  skillCatalog,
  subscriptions,
} from "@/db/schema";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

const PLAN_SEEDS = [
  {
    code: "free" as const,
    athleteLimit: 50,
    priceEur: 0,
    stripePriceId: null,
    stripeProductId: null,
    currency: "eur",
    billingInterval: "month",
    nickname: "Free",
  },
  {
    code: "pro" as const,
    athleteLimit: 200,
    priceEur: 1900,
    stripePriceId: process.env.SEED_STRIPE_PRICE_PRO ?? "price_pro_PLACEHOLDER",
    stripeProductId: process.env.SEED_STRIPE_PRODUCT_PRO ?? null,
    currency: "eur",
    billingInterval: "month",
    nickname: "Pro",
  },
  {
    code: "premium" as const,
    athleteLimit: null,
    priceEur: 4900,
    stripePriceId: process.env.SEED_STRIPE_PRICE_PREMIUM ?? "price_premium_PLACEHOLDER",
    stripeProductId: process.env.SEED_STRIPE_PRODUCT_PREMIUM ?? null,
    currency: "eur",
    billingInterval: "month",
    nickname: "Premium",
  },
] as const;

type PlanCode = (typeof PLAN_SEEDS)[number]["code"];

const SUPER_ADMIN_NAME = process.env.SEED_SUPER_ADMIN_NAME ?? "MenetesSaas";
const SUPER_ADMIN_EMAIL = process.env.SEED_SUPER_ADMIN_EMAIL ?? "mentessaas@gmail.com";
const SUPER_ADMIN_PASSWORD = process.env.SEED_SUPER_ADMIN_PASSWORD ?? "Mentessaas550501";
const SUPER_ADMIN_USER_ID_FALLBACK =
  process.env.SEED_SUPER_ADMIN_USER_ID ?? "00000000-0000-0000-0000-000000000001";

const TENANT_ID = process.env.SEED_TENANT_ID ?? "11111111-0000-0000-0000-000000000000";
const ACADEMY_ID = process.env.SEED_ACADEMY_ID ?? "22222222-0000-0000-0000-000000000000";

const OWNER_PROFILE_ID =
  process.env.SEED_OWNER_PROFILE_ID ?? "33333333-0000-0000-0000-000000000000";
const OWNER_USER_ID =
  process.env.SEED_OWNER_USER_ID ?? "33333333-1111-1111-1111-000000000000";
const OWNER_MEMBERSHIP_ID =
  process.env.SEED_OWNER_MEMBERSHIP_ID ?? "33333333-2222-2222-2222-000000000000";

const COACH_PROFILE_ID =
  process.env.SEED_COACH_PROFILE_ID ?? "44444444-0000-0000-0000-000000000000";
const COACH_USER_ID =
  process.env.SEED_COACH_USER_ID ?? "44444444-1111-1111-1111-000000000000";
const COACH_MEMBERSHIP_ID =
  process.env.SEED_COACH_MEMBERSHIP_ID ?? "44444444-2222-2222-2222-000000000000";
const COACH_ID = process.env.SEED_COACH_ID ?? "44444444-3333-3333-3333-000000000000";

const CLASS_TEAM_ID =
  process.env.SEED_CLASS_TEAM_ID ?? "55555555-0000-0000-0000-000000000000";
const CLASS_PRETEAM_ID =
  process.env.SEED_CLASS_PRETEAM_ID ?? "55555555-1111-1111-1111-000000000000";

const SESSION_TEAM_ID =
  process.env.SEED_SESSION_TEAM_ID ?? "66666666-0000-0000-0000-000000000000";
const SESSION_PRETEAM_ID =
  process.env.SEED_SESSION_PRETEAM_ID ?? "66666666-1111-1111-1111-000000000000";

const SUBSCRIPTION_ID =
  process.env.SEED_SUBSCRIPTION_ID ?? "77777777-0000-0000-0000-000000000000";

const ATHLETE_LUCIA_ID =
  process.env.SEED_ATHLETE_LUCIA_ID ?? "88888888-0000-0000-0000-000000000000";
const ATHLETE_MARTIN_ID =
  process.env.SEED_ATHLETE_MARTIN_ID ?? "88888888-1111-1111-1111-000000000000";
const ATHLETE_EVA_ID =
  process.env.SEED_ATHLETE_EVA_ID ?? "88888888-2222-2222-2222-000000000000";

const GUARDIAN_ID =
  process.env.SEED_GUARDIAN_ID ?? "99999999-0000-0000-0000-000000000000";

const GUARDIAN_LINK_LUCIA_ID =
  process.env.SEED_GUARDIAN_LINK_LUCIA_ID ?? "99999999-1111-1111-1111-000000000000";
const GUARDIAN_LINK_MARTIN_ID =
  process.env.SEED_GUARDIAN_LINK_MARTIN_ID ?? "99999999-2222-2222-2222-000000000000";

const ATTENDANCE_LUCIA_ID =
  process.env.SEED_ATTENDANCE_LUCIA_ID ?? "aaaaaaa0-0000-0000-0000-000000000000";
const ATTENDANCE_MARTIN_ID =
  process.env.SEED_ATTENDANCE_MARTIN_ID ?? "aaaaaaa0-1111-1111-1111-000000000000";

const INVITATION_ID = process.env.SEED_INVITATION_ID ?? "bbbbbbbb-aaaa-1111-2222-000000000000";
const BILLING_INVOICE_ID =
  process.env.SEED_BILLING_INVOICE_ID ?? "cccccccc-aaaa-1111-2222-000000000000";
const BILLING_EVENT_ID =
  process.env.SEED_BILLING_EVENT_ID ?? "dddddddd-aaaa-1111-2222-000000000000";

const todayIso = new Date().toISOString().slice(0, 10);
const tomorrowIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

function envOrDefault(name: string, fallback: string) {
  return process.env[name] ?? fallback;
}

async function seedPlans(): Promise<Record<PlanCode, string | undefined>> {
  for (const seed of PLAN_SEEDS) {
    await db
      .insert(plans)
      .values({
        code: seed.code,
        athleteLimit: seed.athleteLimit,
        priceEur: seed.priceEur,
        stripePriceId: seed.stripePriceId,
        stripeProductId: seed.stripeProductId,
        currency: seed.currency,
        billingInterval: seed.billingInterval,
        nickname: seed.nickname,
        isArchived: false,
      })
      .onConflictDoUpdate({
        target: plans.code,
        set: {
          athleteLimit: seed.athleteLimit,
          priceEur: seed.priceEur,
          stripePriceId: seed.stripePriceId,
          stripeProductId: seed.stripeProductId,
          currency: seed.currency,
          billingInterval: seed.billingInterval,
          nickname: seed.nickname,
          isArchived: false,
        },
      });
  }

  const planRows = await db
    .select({
      id: plans.id,
      code: plans.code,
    })
    .from(plans)
    .where(inArray(plans.code, PLAN_SEEDS.map((seed) => seed.code)));

  const planMap = planRows.reduce<Record<PlanCode, string | undefined>>((acc, row) => {
    acc[row.code as PlanCode] = row.id;
    return acc;
  }, {} as Record<PlanCode, string | undefined>);

  console.log("✓ Plans seeded");
  return planMap;
}

async function ensureSupabaseSuperAdminUser(): Promise<string> {
  const adminClient = getSupabaseAdminClient();

  const existing = await adminClient.auth.admin.listUsers({
    perPage: 200,
  });

  if (existing.error) {
    throw new Error(`No se pudo consultar usuarios: ${existing.error.message}`);
  }

  const user = existing.data?.users?.find(
    (candidate) => candidate.email?.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase(),
  );

  if (user) {

    await adminClient.auth.admin.updateUserById(user.id, {
      email: SUPER_ADMIN_EMAIL,
      email_confirm: true,
      password: SUPER_ADMIN_PASSWORD,
      user_metadata: {
        ...(user.user_metadata ?? {}),
        role: "super_admin",
        name: SUPER_ADMIN_NAME,
      },
    });

    return user.id;
  }

  const createResult = await adminClient.auth.admin.createUser({
    email: SUPER_ADMIN_EMAIL,
    password: SUPER_ADMIN_PASSWORD,
    email_confirm: true,
    user_metadata: {
      role: "super_admin",
      name: SUPER_ADMIN_NAME,
    },
  });

  if (createResult.error || !createResult.data.user) {
    const message = createResult.error?.message ?? "No se pudo crear el usuario super admin";
    throw new Error(message);
  }

  return createResult.data.user.id ?? SUPER_ADMIN_USER_ID_FALLBACK;
}

async function seedAdminProfile(superAdminUserId: string) {
  await db
    .insert(profiles)
    .values({
      userId: superAdminUserId,
      tenantId: null,
      name: SUPER_ADMIN_NAME,
      role: "super_admin",
    })
    .onConflictDoUpdate({
      target: profiles.userId,
      set: {
        tenantId: null,
        name: SUPER_ADMIN_NAME,
        role: "super_admin",
      },
    });

  console.log("✓ Admin profile ready", superAdminUserId);
}

async function seedTenantData(planIds: Record<PlanCode, string | undefined>) {
  const tenantId = TENANT_ID;
  const academyId = ACADEMY_ID;
  const secondaryAcademyId = envOrDefault(
    "SEED_SECONDARY_ACADEMY_ID",
    "22222222-3333-4444-5555-000000000000"
  );

  await db
    .insert(profiles)
    .values({
      id: OWNER_PROFILE_ID,
      userId: OWNER_USER_ID,
      tenantId,
      name: "María Rivera",
      role: "owner",
      activeAcademyId: academyId,
    })
    .onConflictDoUpdate({
      target: profiles.userId,
      set: {
        tenantId,
        name: "María Rivera",
        role: "owner",
        activeAcademyId: academyId,
      },
    });

  await db
    .insert(profiles)
    .values({
      id: COACH_PROFILE_ID,
      userId: COACH_USER_ID,
      tenantId,
      name: "Luis Romero",
      role: "coach",
      activeAcademyId: academyId,
    })
    .onConflictDoUpdate({
      target: profiles.userId,
      set: {
        tenantId,
        name: "Luis Romero",
        role: "coach",
        activeAcademyId: academyId,
      },
    });

  const academySeeds = [
    {
      id: academyId,
      tenantId,
      name: "Gymna Training Center",
      country: "ES",
      region: "Madrid",
      academyType: "artistica",
      ownerId: OWNER_PROFILE_ID,
    },
    {
      id: secondaryAcademyId,
      tenantId,
      name: "Gymna Norte",
      country: "ES",
      region: "Bilbao",
      academyType: "ritmica",
      ownerId: OWNER_PROFILE_ID,
    },
  ] as const;

  for (const academy of academySeeds) {
    await db
      .insert(academies)
      .values(academy)
      .onConflictDoUpdate({
        target: academies.id,
        set: {
          name: academy.name,
          country: academy.country,
          region: academy.region,
          academyType: academy.academyType,
          ownerId: academy.ownerId,
        },
      });
  }

  if (planIds.free) {
    await db
      .insert(subscriptions)
      .values({
        id: SUBSCRIPTION_ID,
        userId: OWNER_USER_ID,
        planId: planIds.free,
        status: "active",
      })
      .onConflictDoUpdate({
        target: subscriptions.userId,
        set: {
          planId: planIds.free,
          status: "active",
        },
      });
  }

  await db
    .insert(memberships)
    .values([
      {
        id: OWNER_MEMBERSHIP_ID,
        academyId,
        userId: OWNER_USER_ID,
        role: "owner",
      },
      {
        id: COACH_MEMBERSHIP_ID,
        academyId,
        userId: COACH_USER_ID,
        role: "coach",
      },
      {
        id: envOrDefault("SEED_OWNER_MEMBERSHIP_SECONDARY_ID", "33333333-2222-2222-2222-000000000001"),
        academyId: secondaryAcademyId,
        userId: OWNER_USER_ID,
        role: "owner",
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(coaches)
    .values({
      id: COACH_ID,
      tenantId,
      academyId,
      name: "Luis Romero",
      email: "coach@gymna.app",
      phone: "+34 600 000 001",
    })
    .onConflictDoUpdate({
      target: coaches.id,
      set: {
        name: "Luis Romero",
        email: "coach@gymna.app",
        phone: "+34 600 000 001",
      },
    });

  await db
    .insert(classes)
    .values([
      {
        id: CLASS_TEAM_ID,
        tenantId,
        academyId,
        name: "Equipo FIG Avanzado",
        weekday: 1,
        startTime: "17:00",
        endTime: "19:00",
        capacity: 20,
      },
      {
        id: CLASS_PRETEAM_ID,
        tenantId,
        academyId,
        name: "Pre-equipo Juvenil",
        weekday: 3,
        startTime: "18:30",
        endTime: "20:00",
        capacity: 18,
      },
    ])
    .onConflictDoUpdate({
      target: classes.id,
      set: {
        name: "Equipo FIG Avanzado",
        weekday: 1,
        startTime: "17:00",
        endTime: "19:00",
        capacity: 20,
      },
      setWhere: eq(classes.id, CLASS_TEAM_ID),
    });

  await db
    .insert(classCoachAssignments)
    .values([
      {
        id: randomUUID(),
        tenantId,
        classId: CLASS_TEAM_ID,
        coachId: COACH_ID,
        role: "head",
      },
      {
        id: randomUUID(),
        tenantId,
        classId: CLASS_TEAM_ID,
        coachId: COACH_ID,
        role: "assistant",
      },
      {
        id: randomUUID(),
        tenantId,
        classId: CLASS_PRETEAM_ID,
        coachId: COACH_ID,
        role: "assistant",
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(classSessions)
    .values([
      {
        id: SESSION_TEAM_ID,
        tenantId,
        classId: CLASS_TEAM_ID,
        coachId: COACH_ID,
        sessionDate: todayIso,
        startTime: "17:00",
        endTime: "19:00",
        status: "scheduled",
        notes: "Sesión técnica de barra y salto.",
      },
      {
        id: SESSION_PRETEAM_ID,
        tenantId,
        classId: CLASS_PRETEAM_ID,
        coachId: COACH_ID,
        sessionDate: tomorrowIso,
        startTime: "18:30",
        endTime: "20:00",
        status: "scheduled",
        notes: "Trabajo de coreografía y flexibilidad.",
      },
      {
        id: randomUUID(),
        tenantId,
        classId: CLASS_PRETEAM_ID,
        coachId: COACH_ID,
        sessionDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        startTime: "18:30",
        endTime: "20:00",
        status: "scheduled",
        notes: "Sesión extra de suelo y salto.",
      },
    ])
    .onConflictDoUpdate({
      target: classSessions.id,
      set: {
        coachId: COACH_ID,
        sessionDate: todayIso,
        startTime: "17:00",
        endTime: "19:00",
        status: "scheduled",
        notes: "Sesión técnica de barra y salto.",
      },
      setWhere: eq(classSessions.id, SESSION_TEAM_ID),
    });

  await db
    .insert(athletes)
    .values([
      {
        id: ATHLETE_LUCIA_ID,
        tenantId,
        academyId,
        name: "Lucía Márquez",
        dob: "2010-05-14",
        level: "FIG Nivel 6",
        status: "active",
      },
      {
        id: ATHLETE_MARTIN_ID,
        tenantId,
        academyId,
        name: "Martín Ortega",
        dob: "2011-09-02",
        level: "FIG Nivel 5",
        status: "active",
      },
      {
        id: ATHLETE_EVA_ID,
        tenantId,
        academyId,
        name: "Eva Suárez",
        dob: "2012-01-21",
        level: "FIG Nivel 4",
        status: "injured",
      },
    ])
    .onConflictDoUpdate({
      target: athletes.id,
      set: {
        level: "FIG Nivel 6",
        status: "active",
      },
      setWhere: eq(athletes.id, ATHLETE_LUCIA_ID),
    });

  await db
    .insert(guardians)
    .values({
      id: GUARDIAN_ID,
      tenantId,
      name: "Ana López",
      email: "familia.lucia@gymna.app",
      phone: "+34 600 123 456",
      relationship: "Madre",
      notifyEmail: true,
      notifySms: false,
    })
    .onConflictDoUpdate({
      target: guardians.id,
      set: {
        name: "Ana López",
        email: "familia.lucia@gymna.app",
        phone: "+34 600 123 456",
        relationship: "Madre",
        notifyEmail: true,
        notifySms: false,
      },
    });

  await db
    .insert(guardianAthletes)
    .values([
      {
        id: GUARDIAN_LINK_LUCIA_ID,
        tenantId,
        guardianId: GUARDIAN_ID,
        athleteId: ATHLETE_LUCIA_ID,
        relationship: "Madre",
        isPrimary: true,
      },
      {
        id: GUARDIAN_LINK_MARTIN_ID,
        tenantId,
        guardianId: GUARDIAN_ID,
        athleteId: ATHLETE_MARTIN_ID,
        relationship: "Madre",
        isPrimary: true,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(attendanceRecords)
    .values([
      {
        id: ATTENDANCE_LUCIA_ID,
        tenantId,
        sessionId: SESSION_TEAM_ID,
        athleteId: ATHLETE_LUCIA_ID,
        status: "present",
        notes: "Excelente control en barra.",
        recordedAt: new Date(),
      },
      {
        id: ATTENDANCE_MARTIN_ID,
        tenantId,
        sessionId: SESSION_TEAM_ID,
        athleteId: ATHLETE_MARTIN_ID,
        status: "late",
        notes: "Llegó 10 minutos tarde por tráfico.",
        recordedAt: new Date(),
      },
    ])
    .onConflictDoUpdate({
      target: [attendanceRecords.sessionId, attendanceRecords.athleteId],
      set: {
        status: "present",
        notes: "Excelente control en barra.",
        recordedAt: new Date(),
      },
      setWhere: eq(attendanceRecords.athleteId, ATHLETE_LUCIA_ID),
    });

  await db
    .insert(invitations)
    .values({
      id: INVITATION_ID,
      tenantId,
      email: "nuevo.coach@gymna.app",
      role: "coach",
      token: "seed-demo-token",
      status: "pending",
      invitedBy: OWNER_USER_ID,
      academyIds: [academyId],
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      defaultAcademyId: academyId,
    })
    .onConflictDoUpdate({
      target: invitations.id,
      set: {
        status: "pending",
        academyIds: [academyId],
        defaultAcademyId: academyId,
      },
    });

  await db
    .insert(billingInvoices)
    .values({
      id: BILLING_INVOICE_ID,
      tenantId,
      academyId,
      stripeInvoiceId: envOrDefault("SEED_STRIPE_INVOICE_ID", "in_seed_demo"),
      status: "paid",
      amountDue: 1900,
      amountPaid: 1900,
      currency: "eur",
      billingReason: "subscription_create",
      hostedInvoiceUrl: "https://billing.stripe.com/demo-invoice",
      invoicePdf: "https://billing.stripe.com/demo-invoice.pdf",
      periodStart: new Date(),
      periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    })
    .onConflictDoUpdate({
      target: billingInvoices.stripeInvoiceId,
      set: {
        status: "paid",
        amountPaid: 1900,
        periodStart: new Date(),
        periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

  await db
    .insert(billingEvents)
    .values({
      id: BILLING_EVENT_ID,
      stripeEventId: envOrDefault("SEED_STRIPE_EVENT_ID", "evt_seed_demo"),
      type: "invoice.paid",
      status: "processed",
      academyId,
      tenantId,
      payload: {
        demo: true,
      },
      processedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: billingEvents.stripeEventId,
      set: {
        status: "processed",
        processedAt: new Date(),
      },
    });

  console.log("✓ Tenant demo data seeded");
}

async function seedSkillCatalog() {
  const tenantId = TENANT_ID;

  const skills = [
    {
      tenantId,
      apparatus: "suelo",
      skillCode: "FX-A1",
      name: "Rondada flick",
      description: "Combinación básica para secuencias acrobáticas.",
      difficulty: 2,
    },
    {
      tenantId,
      apparatus: "viga",
      skillCode: "BB-B1",
      name: "Giro completo",
      description: "Giro de 360º en viga con control de salida.",
      difficulty: 3,
    },
    {
      tenantId,
      apparatus: "barras",
      skillCode: "UB-C1",
      name: "Pak salto",
      description: "Transición alta entre barras.",
      difficulty: 4,
    },
  ];

  for (const skill of skills) {
    await db
      .insert(skillCatalog)
      .values({
        id: randomUUID(),
        ...skill,
      })
      .onConflictDoNothing();
  }

  console.log("✓ Skill catalog seeded (tenant:", tenantId, ")");
}

async function main() {
  const superAdminUserId = await ensureSupabaseSuperAdminUser();
  const planIds = await seedPlans();
  await seedAdminProfile(superAdminUserId);
  await seedTenantData(planIds);
  await seedSkillCatalog();
}

main()
  .then(() => {
    console.log("✅ Seed completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Seed failed", error);
    process.exit(1);
  });


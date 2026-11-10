import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import { countNewTrialRequests } from "@/modules/admissions/application/admission-attention";
import {
  changeTrialRequestStatus,
  convertTrialRequest,
  listOwnerTrialRequests,
  submitPublicTrialRequest,
} from "@/modules/admissions/application/admission-requests";
import { isAdmissionStorageAvailable } from "@/modules/admissions/application/admission-storage";
import { publicTrialRequestSchema } from "@/modules/admissions/domain/trial-request";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";

/**
 * P2 #15 · Solicitudes de prueba sobre PostgreSQL desechable de GitHub.
 * Instala el candidato SQL solo aquí, después de todos los guardas; nunca en
 * un proyecto enlazado ni con credenciales externas.
 */
const disposablePgEnabled =
  process.env.ZALTYKO_PG_INTEGRATION === "1" &&
  process.env.GITHUB_ACTIONS === "true" &&
  process.env.RUNNER_OS === "Linux" &&
  process.env.NODE_ENV === "test";

function assertDisposableTarget() {
  const connection = process.env.ZALTYKO_PG_INTEGRATION_DATABASE_URL;
  let target: URL;
  try {
    target = new URL(connection ?? "");
  } catch {
    throw new Error("The disposable PostgreSQL target is invalid");
  }
  if (
    !disposablePgEnabled ||
    !["postgres:", "postgresql:"].includes(target.protocol) ||
    !["127.0.0.1", "localhost", "::1"].includes(target.hostname) ||
    target.username !== "supabase_admin" ||
    !target.password ||
    !target.port ||
    target.pathname !== "/postgres" ||
    [process.env.DATABASE_URL, process.env.DATABASE_URL_POOL, process.env.DATABASE_URL_DIRECT].some(
      (value) => value !== connection
    )
  ) {
    throw new Error("Disposable GitHub Linux loopback Postgres is required");
  }
  for (const name of [
    "SUPABASE_ACCESS_TOKEN",
    "SUPABASE_DB_PASSWORD",
    "SUPABASE_DB_URL",
    "SUPABASE_PROJECT_REF",
    "SUPABASE_SERVICE_ROLE_KEY",
    "E2E_TARGET_SUPABASE_PROJECT_REF",
    "STRIPE_SAAS_TEST_SECRET_KEY",
    "STRIPE_SAAS_LIVE_SECRET_KEY",
    "VERCEL_TOKEN",
  ]) {
    if (process.env[name]) throw new Error("External credentials are forbidden");
  }
}

const candidate = () =>
  readFileSync(
    resolve(process.cwd(), "docs/deployment/candidates/20261110120000_admission_requests_candidate.sql"),
    "utf8"
  );

async function expectPgCode(promise: Promise<unknown>, code: string) {
  const error = (await promise.then(
    () => null,
    (failure) => failure
  )) as { code?: string; cause?: { code?: string } } | null;
  expect(error).not.toBeNull();
  expect(error?.cause?.code ?? error?.code).toBe(code);
}

async function user(label: string) {
  const id = randomUUID();
  await db.execute(sql`insert into auth.users (id, email) values (${id}::uuid, ${`ci-admission-${label}-${id}@example.invalid`})`);
  return id;
}

async function member(
  organizationId: string,
  role: "owner" | "admin" | "manager" | "coach",
  scopeMode: "all" | "selected",
  locationIds: string[] = []
) {
  const userId = await user(role);
  const memberId = randomUUID();
  await db.execute(sql`
    insert into zaltyko.organization_members (id, organization_id, user_id, role, status, location_scope_mode)
    values (${memberId}::uuid, ${organizationId}::uuid, ${userId}::uuid, ${role}, 'active', ${scopeMode})
  `);
  for (const locationId of locationIds) {
    await db.execute(sql`
      insert into zaltyko.member_location_scopes (organization_id, member_id, location_id)
      values (${organizationId}::uuid, ${memberId}::uuid, ${locationId}::uuid)
    `);
  }
  return { userId, memberId };
}

async function academy(label: string, sites: number, status = "active") {
  const organizationId = randomUUID();
  await db.execute(sql`
    insert into zaltyko.organizations (id, name, status)
    values (${organizationId}::uuid, ${`CI admisiones ${label}`}, ${status})
  `);
  const locationIds: string[] = [];
  for (let index = 0; index < sites; index += 1) {
    const locationId = randomUUID();
    locationIds.push(locationId);
    await db.execute(sql`
      insert into zaltyko.locations (id, organization_id, code, name, timezone, is_active)
      values (${locationId}::uuid, ${organizationId}::uuid,
        ${`ci-adm-${index}-${organizationId.slice(0, 8)}`}, ${`Sede ${label} ${index + 1}`}, 'Europe/Madrid', true)
    `);
  }
  return { organizationId, locationIds };
}

function publicRequest(
  organizationId: string,
  locationId: string | null,
  overrides: Record<string, unknown> = {}
) {
  return publicTrialRequestSchema.parse({
    organizationId,
    locationId,
    submissionId: randomUUID(),
    contactName: "Persona Sintética",
    contactEmail: `familia-${randomUUID()}@example.invalid`,
    contactPhone: null,
    athleteGivenName: "Lúa",
    athleteBirthYear: 2017,
    message: null,
    privacyConsent: true,
    ...overrides,
  });
}

async function scopeFor(userId: string, organizationId: string, locationId?: string) {
  return resolveOwnerScope({ userId, organizationId, locationId });
}

async function count(table: string, organizationId: string) {
  const result = await db.execute(
    sql`select count(*)::int as count from ${sql.identifier("zaltyko")}.${sql.identifier(table)} where organization_id = ${organizationId}::uuid`
  );
  return Number((result.rows[0] as { count: number }).count);
}

describe.skipIf(!disposablePgEnabled)("solicitudes de prueba en PostgreSQL desechable", () => {
  let a: Awaited<ReturnType<typeof academy>>;
  let b: Awaited<ReturnType<typeof academy>>;
  let ownerA: Awaited<ReturnType<typeof member>>;
  let managerA1: Awaited<ReturnType<typeof member>>;
  let ownerB: Awaited<ReturnType<typeof member>>;
  let classA1: string;

  beforeAll(async () => {
    assertDisposableTarget();
    expect(await isAdmissionStorageAvailable(db)).toBe(false);
    // The preflight refuses an existing partial relation before touching ACLs.
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql`create table zaltyko.admission_requests (id uuid)`);
        await tx.execute(sql.raw(candidate()));
      })
    ).rejects.toThrow(/admission_requests absent/);
    await db.execute(sql.raw(candidate()));

    a = await academy("A", 2);
    b = await academy("B", 1);
    ownerA = await member(a.organizationId, "owner", "all");
    managerA1 = await member(a.organizationId, "manager", "selected", [a.locationIds[0]!]);
    ownerB = await member(b.organizationId, "owner", "all");
    classA1 = randomUUID();
    await db.execute(sql`
      insert into zaltyko.class_templates (id, organization_id, location_id, name, capacity, status, effective_from)
      values (${classA1}::uuid, ${a.organizationId}::uuid, ${a.locationIds[0]}::uuid, 'Base 3 GAF', 10, 'active', current_date)
    `);
  });

  afterAll(async () => {
    if (disposablePgEnabled) await db.execute(sql`drop table if exists zaltyko.admission_requests`);
  });

  it("fuerza RLS, niega el acceso directo de anon/authenticated y rechaza reinstalar", async () => {
    expect(await isAdmissionStorageAvailable(db)).toBe(true);
    const inventory = await db.execute(sql`
      select c.relrowsecurity, c.relforcerowsecurity,
        has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE') as anon_access,
        has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE') as authenticated_access
      from pg_class c where c.oid = 'zaltyko.admission_requests'::regclass
    `);
    expect(inventory.rows[0]).toMatchObject({
      relrowsecurity: true,
      relforcerowsecurity: true,
      anon_access: false,
      authenticated_access: false,
    });
    for (const role of ["anon", "authenticated"]) {
      await expectPgCode(
        db.transaction(async (tx) => {
          await tx.execute(sql.raw(`set local role ${role}`));
          await tx.execute(sql`select id from zaltyko.admission_requests limit 1`);
        }),
        "42501"
      );
    }
    await expect(db.execute(sql.raw(candidate()))).rejects.toThrow(/admission_requests absent/);
  });

  it("guarda la solicitud pública sin crear gimnastas y la reenvía de forma idempotente", async () => {
    const peopleBefore = await count("people", a.organizationId);
    const input = publicRequest(a.organizationId, a.locationIds[0]!);
    const first = await submitPublicTrialRequest(input);
    const replay = await submitPublicTrialRequest(input);
    expect(first.replayed).toBe(false);
    expect(replay).toEqual({ requestId: first.requestId, replayed: true });
    await expect(
      submitPublicTrialRequest({ ...input, athleteGivenName: "Otra" })
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });
    expect(await count("people", a.organizationId)).toBe(peopleBefore);
    expect(await count("athletes", a.organizationId)).toBe(0);

    const stored = await db.execute(sql`
      select status, privacy_consent_version, contact_email, location_id::text as location_id
      from zaltyko.admission_requests where id = ${first.requestId}::uuid
    `);
    expect(stored.rows[0]).toMatchObject({
      status: "new",
      privacy_consent_version: "2026-11-10",
      contact_email: input.contactEmail,
      location_id: a.locationIds[0],
    });
  });

  it("rechaza sedes ajenas, sede ausente con varias sedes y academias que no reciben", async () => {
    await expect(
      submitPublicTrialRequest(publicRequest(a.organizationId, b.locationIds[0]!))
    ).rejects.toMatchObject({ code: "INVALID_RELATION", status: 422 });
    await expect(
      submitPublicTrialRequest(publicRequest(a.organizationId, null))
    ).rejects.toMatchObject({ code: "INVALID_RELATION", status: 422 });
    const single = await submitPublicTrialRequest(publicRequest(b.organizationId, null));
    expect(single.replayed).toBe(false);

    const suspended = await academy("S", 1, "suspended");
    await expect(
      submitPublicTrialRequest(publicRequest(suspended.organizationId, suspended.locationIds[0]!))
    ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    expect(await count("admission_requests", suspended.organizationId)).toBe(0);
  });

  it("aísla la bandeja por academia y por sede", async () => {
    const inA2 = await submitPublicTrialRequest(publicRequest(a.organizationId, a.locationIds[1]!));
    const inA1 = await submitPublicTrialRequest(publicRequest(a.organizationId, a.locationIds[0]!));

    const ownerView = await listOwnerTrialRequests({
      scope: await scopeFor(ownerA.userId, a.organizationId),
      view: "open",
      page: 1,
      pageSize: 100,
    });
    const ownerIds = ownerView.items.map((item) => item.id);
    expect(ownerIds).toEqual(expect.arrayContaining([inA1.requestId, inA2.requestId]));
    expect(ownerView.items.every((item) => a.locationIds.includes(item.locationId))).toBe(true);
    expect(ownerView.canConvert).toBe(true);

    const managerScope = await scopeFor(managerA1.userId, a.organizationId);
    const managerView = await listOwnerTrialRequests({ scope: managerScope, view: "open", page: 1, pageSize: 100 });
    expect(managerView.items.map((item) => item.id)).toContain(inA1.requestId);
    expect(managerView.items.map((item) => item.id)).not.toContain(inA2.requestId);
    expect(managerView.items.every((item) => item.locationId === a.locationIds[0])).toBe(true);
    expect(managerView.canConvert).toBe(false);
    await expect(
      listOwnerTrialRequests({ scope: managerScope, locationId: a.locationIds[1], view: "open", page: 1, pageSize: 10 })
    ).rejects.toMatchObject({ code: "LOCATION_SCOPE_DENIED" });

    const otherAcademy = await listOwnerTrialRequests({
      scope: await scopeFor(ownerB.userId, b.organizationId),
      view: "open",
      page: 1,
      pageSize: 100,
    });
    expect(otherAcademy.items.some((item) => [inA1.requestId, inA2.requestId].includes(item.id))).toBe(false);

    // Escrituras: otra sede u otra academia responden 404 y no cambian nada.
    await expect(
      changeTrialRequestStatus({
        scope: managerScope,
        userId: managerA1.userId,
        requestId: inA2.requestId,
        expectedRevision: 1,
        status: "contacted",
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      changeTrialRequestStatus({
        scope: await scopeFor(ownerB.userId, b.organizationId),
        userId: ownerB.userId,
        requestId: inA1.requestId,
        expectedRevision: 1,
        status: "declined",
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const untouched = await db.execute(sql`
      select status, revision from zaltyko.admission_requests where id in (${inA1.requestId}::uuid, ${inA2.requestId}::uuid)
    `);
    expect(untouched.rows).toEqual([
      { status: "new", revision: 1 },
      { status: "new", revision: 1 },
    ]);

    expect(await countNewTrialRequests(db, a.organizationId, [a.locationIds[0]!])).toBe(
      managerView.counts.new
    );
    expect(await countNewTrialRequests(db, b.organizationId, b.locationIds)).toBe(otherAcademy.counts.new);
  });

  it("cambia el estado con revisión y rechaza transiciones no permitidas", async () => {
    const request = await submitPublicTrialRequest(publicRequest(a.organizationId, a.locationIds[0]!));
    const managerScope = await scopeFor(managerA1.userId, a.organizationId);
    const contacted = await changeTrialRequestStatus({
      scope: managerScope,
      userId: managerA1.userId,
      requestId: request.requestId,
      expectedRevision: 1,
      status: "contacted",
    });
    expect(contacted).toMatchObject({ status: "contacted", revision: 2 });
    await expect(
      changeTrialRequestStatus({
        scope: managerScope,
        userId: managerA1.userId,
        requestId: request.requestId,
        expectedRevision: 1,
        status: "declined",
      })
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    await expect(
      changeTrialRequestStatus({
        scope: managerScope,
        userId: managerA1.userId,
        requestId: request.requestId,
        expectedRevision: 2,
        status: "contacted",
      })
    ).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
    const audit = await db.execute(sql`
      select action from zaltyko.audit_log
      where organization_id = ${a.organizationId}::uuid and target_id = ${request.requestId}::uuid
    `);
    expect(audit.rows).toEqual([{ action: "admission_request.status_changed" }]);
  });

  it("pasa a inscripción reutilizando el alta canónica y no duplica en reintentos", async () => {
    const request = await submitPublicTrialRequest(publicRequest(a.organizationId, a.locationIds[0]!));
    const command = {
      organizationId: a.organizationId,
      expectedRevision: 1,
      familyName: "Sintética Prueba",
      relationship: "parent" as const,
      destination: "enrollment" as const,
      classTemplateId: null,
    };
    await expect(
      convertTrialRequest({
        scope: await scopeFor(managerA1.userId, a.organizationId),
        userId: managerA1.userId,
        requestId: request.requestId,
        command,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const athletesBefore = await count("athletes", a.organizationId);
    const ownerScope = await scopeFor(ownerA.userId, a.organizationId);
    const converted = await convertTrialRequest({
      scope: ownerScope,
      userId: ownerA.userId,
      requestId: request.requestId,
      command,
    });
    expect(converted).toMatchObject({ status: "converted", revision: 2, waitlistEntryId: null });
    expect(await count("athletes", a.organizationId)).toBe(athletesBefore + 1);
    const person = await db.execute(sql`
      select p.given_name, p.family_name from zaltyko.athletes a
      join zaltyko.people p on p.organization_id = a.organization_id and p.id = a.person_id
      where a.organization_id = ${a.organizationId}::uuid and a.id = ${converted.convertedAthleteId}::uuid
    `);
    expect(person.rows[0]).toEqual({ given_name: "Lúa", family_name: "Sintética Prueba" });

    await expect(
      convertTrialRequest({ scope: ownerScope, userId: ownerA.userId, requestId: request.requestId, command })
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    expect(await count("athletes", a.organizationId)).toBe(athletesBefore + 1);
  });

  it("pasa a lista de espera de una clase de la sede con la espera canónica", async () => {
    const request = await submitPublicTrialRequest(publicRequest(a.organizationId, a.locationIds[0]!));
    const ownerScope = await scopeFor(ownerA.userId, a.organizationId);
    const waitlisted = await convertTrialRequest({
      scope: ownerScope,
      userId: ownerA.userId,
      requestId: request.requestId,
      command: {
        organizationId: a.organizationId,
        expectedRevision: 1,
        familyName: "Espera",
        relationship: "legal_guardian",
        destination: "waitlist",
        classTemplateId: classA1,
      },
    });
    expect(waitlisted.status).toBe("waitlisted");
    const entry = await db.execute(sql`
      select athlete_id::text as athlete_id, class_template_id::text as class_template_id, status, contactable
      from zaltyko.waitlist_entries
      where organization_id = ${a.organizationId}::uuid and id = ${waitlisted.waitlistEntryId}::uuid
    `);
    expect(entry.rows[0]).toEqual({
      athlete_id: waitlisted.convertedAthleteId,
      class_template_id: classA1,
      status: "waiting",
      contactable: false,
    });

    // Una clase de otra sede no sirve y no crea ficha.
    const other = await submitPublicTrialRequest(publicRequest(a.organizationId, a.locationIds[1]!));
    const athletesBefore = await count("athletes", a.organizationId);
    await expect(
      convertTrialRequest({
        scope: ownerScope,
        userId: ownerA.userId,
        requestId: other.requestId,
        command: {
          organizationId: a.organizationId,
          expectedRevision: 1,
          familyName: "Otra sede",
          relationship: "parent",
          destination: "waitlist",
          classTemplateId: classA1,
        },
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await count("athletes", a.organizationId)).toBe(athletesBefore);
  });
});

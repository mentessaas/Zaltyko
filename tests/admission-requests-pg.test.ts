import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import { countNewTrialRequests } from "@/modules/admissions/application/admission-attention";
import {
  anonymizeTrialRequest,
  changeTrialRequestStatus,
  convertTrialRequest,
  getPublicAdmissionTarget,
  listOwnerTrialRequests,
  manageAdmissionLink,
  resolveAdmissionLinkOrganization,
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
  linkToken: string,
  locationId: string | null,
  overrides: Record<string, unknown> = {}
) {
  return publicTrialRequestSchema.parse({
    linkToken,
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

async function athleteCount(organizationId: string) {
  return count("athletes", organizationId);
}

describe.skipIf(!disposablePgEnabled)("solicitudes de prueba en PostgreSQL desechable", () => {
  let a: Awaited<ReturnType<typeof academy>>;
  let b: Awaited<ReturnType<typeof academy>>;
  let ownerA: Awaited<ReturnType<typeof member>>;
  let managerA1: Awaited<ReturnType<typeof member>>;
  let ownerB: Awaited<ReturnType<typeof member>>;
  let classA1: string;
  let tokenA: string;
  let tokenB: string;

  async function link(owner: { userId: string }, organizationId: string, locationId: string | null, action: "enable" | "disable" | "regenerate") {
    return manageAdmissionLink({ scope: await scopeFor(owner.userId, organizationId), userId: owner.userId, locationId, action });
  }

  async function newRequest(locationId: string) {
    return submitPublicTrialRequest(publicRequest(tokenA, locationId));
  }

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
    tokenA = (await link(ownerA, a.organizationId, null, "enable"))!.token;
    tokenB = (await link(ownerB, b.organizationId, null, "enable"))!.token;
  });

  afterAll(async () => {
    if (!disposablePgEnabled) return;
    await db.execute(sql`drop function if exists zaltyko.ci_admission_fail_waitlist() cascade`);
    await db.execute(sql`drop table if exists zaltyko.admission_requests`);
    await db.execute(sql`drop table if exists zaltyko.admission_links`);
  });

  it("fuerza RLS, niega el acceso directo de anon/authenticated y rechaza reinstalar", async () => {
    expect(await isAdmissionStorageAvailable(db)).toBe(true);
    const inventory = await db.execute(sql`
      select c.relname, c.relrowsecurity, c.relforcerowsecurity,
        has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE') as anon_access,
        has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE') as authenticated_access
      from pg_class c
      where c.oid in ('zaltyko.admission_requests'::regclass, 'zaltyko.admission_links'::regclass)
    `);
    expect(inventory.rows).toHaveLength(2);
    for (const row of inventory.rows) {
      expect(row).toMatchObject({ relrowsecurity: true, relforcerowsecurity: true, anon_access: false, authenticated_access: false });
    }
    for (const role of ["anon", "authenticated"]) {
      for (const table of ["admission_requests", "admission_links"]) {
        await expectPgCode(
          db.transaction(async (tx) => {
            await tx.execute(sql.raw(`set local role ${role}`));
            await tx.execute(sql`select id from ${sql.identifier("zaltyko")}.${sql.identifier(table)} limit 1`);
          }),
          "42501"
        );
      }
    }
    await expect(db.execute(sql.raw(candidate()))).rejects.toThrow(/admission_requests absent/);
  });

  it("solo la dirección o administración con todas las sedes gestiona el enlace, con auditoría", async () => {
    await expect(link(managerA1, a.organizationId, a.locationIds[0]!, "enable")).rejects.toMatchObject({ code: "FORBIDDEN" });
    // La academia B no puede crear enlaces para una sede de A.
    await expect(link(ownerB, b.organizationId, a.locationIds[0]!, "enable")).rejects.toMatchObject({ code: "LOCATION_SCOPE_DENIED" });
    const audit = await db.execute(sql`
      select action from zaltyko.audit_log
      where organization_id = ${a.organizationId}::uuid and target_type = 'admission_link'
    `);
    expect(audit.rows).toEqual([{ action: "admission_link.created" }]);
    expect(tokenA).toMatch(/^[0-9a-f]{32}$/);
    expect(await getPublicAdmissionTarget(tokenA)).toEqual({
      organizationName: "CI admisiones A",
      locations: expect.arrayContaining([expect.objectContaining({ id: a.locationIds[0] })]),
    });
  });

  it("un token desconocido, desactivado o revocado responde igual y no guarda nada", async () => {
    const before = await count("admission_requests", a.organizationId);
    const unknownToken = "f".repeat(32);
    const expectNotReceiving = (token: string) =>
      expect(submitPublicTrialRequest(publicRequest(token, a.locationIds[0]!))).rejects.toMatchObject({
        code: "NOT_FOUND",
        status: 404,
        message: "Este enlace no admite solicitudes.",
      });

    await expectNotReceiving(unknownToken);
    expect(await getPublicAdmissionTarget(unknownToken)).toBeNull();
    expect(await resolveAdmissionLinkOrganization(unknownToken)).toBeNull();

    const siteLink = await link(ownerA, a.organizationId, a.locationIds[1]!, "enable");
    await link(ownerA, a.organizationId, a.locationIds[1]!, "disable");
    await expectNotReceiving(siteLink!.token);
    expect(await getPublicAdmissionTarget(siteLink!.token)).toBeNull();

    const reenabled = await link(ownerA, a.organizationId, a.locationIds[1]!, "enable");
    expect(reenabled!.token).toBe(siteLink!.token);
    const regenerated = await link(ownerA, a.organizationId, a.locationIds[1]!, "regenerate");
    expect(regenerated!.token).not.toBe(siteLink!.token);
    await expectNotReceiving(siteLink!.token);
    expect(await resolveAdmissionLinkOrganization(siteLink!.token)).toBeNull();
    // El enlace de una sede solo admite esa sede.
    await expect(
      submitPublicTrialRequest(publicRequest(regenerated!.token, a.locationIds[0]!))
    ).rejects.toMatchObject({ code: "INVALID_RELATION" });
    const siteRequest = await submitPublicTrialRequest(publicRequest(regenerated!.token, null));
    expect(siteRequest.replayed).toBe(false);
    expect(await count("admission_requests", a.organizationId)).toBe(before + 1);
    expect(await resolveAdmissionLinkOrganization(regenerated!.token)).toBe(a.organizationId);
  });

  it("guarda la solicitud pública sin crear gimnastas y la reenvía de forma idempotente", async () => {
    const peopleBefore = await count("people", a.organizationId);
    const input = publicRequest(tokenA, a.locationIds[0]!);
    const first = await submitPublicTrialRequest(input);
    const replay = await submitPublicTrialRequest(input);
    expect(first.replayed).toBe(false);
    expect(replay).toEqual({ requestId: first.requestId, replayed: true });
    await expect(submitPublicTrialRequest({ ...input, athleteGivenName: "Otra" })).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
      status: 409,
    });
    expect(await count("people", a.organizationId)).toBe(peopleBefore);
    expect(await athleteCount(a.organizationId)).toBe(0);
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
    await expect(submitPublicTrialRequest(publicRequest(tokenA, b.locationIds[0]!))).rejects.toMatchObject({
      code: "INVALID_RELATION",
      status: 422,
    });
    await expect(submitPublicTrialRequest(publicRequest(tokenA, null))).rejects.toMatchObject({ code: "INVALID_RELATION" });
    expect((await submitPublicTrialRequest(publicRequest(tokenB, null))).replayed).toBe(false);

    const suspended = await academy("S", 1);
    const ownerS = await member(suspended.organizationId, "owner", "all");
    const tokenS = (await link(ownerS, suspended.organizationId, null, "enable"))!.token;
    await db.execute(sql`update zaltyko.organizations set status = 'suspended' where id = ${suspended.organizationId}::uuid`);
    await expect(submitPublicTrialRequest(publicRequest(tokenS, null))).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Este enlace no admite solicitudes.",
    });
    expect(await count("admission_requests", suspended.organizationId)).toBe(0);
  });

  it("aísla la bandeja por academia y por sede", async () => {
    const inA2 = await newRequest(a.locationIds[1]!);
    const inA1 = await newRequest(a.locationIds[0]!);

    const ownerView = await listOwnerTrialRequests({ scope: await scopeFor(ownerA.userId, a.organizationId), view: "open", page: 1, pageSize: 100 });
    expect(ownerView.items.map((item) => item.id)).toEqual(expect.arrayContaining([inA1.requestId, inA2.requestId]));
    expect(ownerView.items.every((item) => a.locationIds.includes(item.locationId))).toBe(true);
    expect(ownerView.canManage).toBe(true);
    expect(ownerView.links.map((item) => item.token)).toContain(tokenA);

    const managerScope = await scopeFor(managerA1.userId, a.organizationId);
    const managerView = await listOwnerTrialRequests({ scope: managerScope, view: "open", page: 1, pageSize: 100 });
    expect(managerView.items.map((item) => item.id)).toContain(inA1.requestId);
    expect(managerView.items.map((item) => item.id)).not.toContain(inA2.requestId);
    expect(managerView.items.every((item) => item.locationId === a.locationIds[0])).toBe(true);
    expect(managerView.canManage).toBe(false);
    expect(managerView.links.map((item) => item.token)).not.toContain(tokenA);
    await expect(
      listOwnerTrialRequests({ scope: managerScope, locationId: a.locationIds[1], view: "open", page: 1, pageSize: 10 })
    ).rejects.toMatchObject({ code: "LOCATION_SCOPE_DENIED" });

    const otherAcademy = await listOwnerTrialRequests({ scope: await scopeFor(ownerB.userId, b.organizationId), view: "open", page: 1, pageSize: 100 });
    expect(otherAcademy.items.some((item) => [inA1.requestId, inA2.requestId].includes(item.id))).toBe(false);
    expect(otherAcademy.links.map((item) => item.token)).not.toContain(tokenA);

    await expect(
      changeTrialRequestStatus({ scope: managerScope, userId: managerA1.userId, requestId: inA2.requestId, expectedRevision: 1, status: "contacted" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      changeTrialRequestStatus({ scope: await scopeFor(ownerB.userId, b.organizationId), userId: ownerB.userId, requestId: inA1.requestId, expectedRevision: 1, status: "declined" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const untouched = await db.execute(sql`
      select status, revision from zaltyko.admission_requests where id in (${inA1.requestId}::uuid, ${inA2.requestId}::uuid)
    `);
    expect(untouched.rows).toEqual([
      { status: "new", revision: 1 },
      { status: "new", revision: 1 },
    ]);

    expect(await countNewTrialRequests(db, a.organizationId, [a.locationIds[0]!])).toBe(managerView.counts.new);
    expect(await countNewTrialRequests(db, b.organizationId, b.locationIds)).toBe(otherAcademy.counts.new);
  });

  it("cambia el estado con revisión y rechaza transiciones no permitidas", async () => {
    const request = await newRequest(a.locationIds[0]!);
    const managerScope = await scopeFor(managerA1.userId, a.organizationId);
    const base = { scope: managerScope, userId: managerA1.userId, requestId: request.requestId };
    expect(await changeTrialRequestStatus({ ...base, expectedRevision: 1, status: "contacted" })).toMatchObject({ status: "contacted", revision: 2 });
    await expect(changeTrialRequestStatus({ ...base, expectedRevision: 1, status: "declined" })).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    await expect(changeTrialRequestStatus({ ...base, expectedRevision: 2, status: "contacted" })).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
    const audit = await db.execute(sql`
      select action from zaltyko.audit_log where organization_id = ${a.organizationId}::uuid and target_id = ${request.requestId}::uuid
    `);
    expect(audit.rows).toEqual([{ action: "admission_request.status_changed" }]);
  });

  const enrollmentCommand = (organizationId: string, expectedRevision = 1) => ({
    organizationId,
    expectedRevision,
    familyName: "Sintética Prueba",
    relationship: "parent" as const,
    destination: "enrollment" as const,
    classTemplateId: null,
  });

  it("pasa a inscripción con el alta canónica en una sola transacción", async () => {
    const request = await newRequest(a.locationIds[0]!);
    await expect(
      convertTrialRequest({ scope: await scopeFor(managerA1.userId, a.organizationId), userId: managerA1.userId, requestId: request.requestId, command: enrollmentCommand(a.organizationId) })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const before = await athleteCount(a.organizationId);
    const ownerScope = await scopeFor(ownerA.userId, a.organizationId);
    const converted = await convertTrialRequest({ scope: ownerScope, userId: ownerA.userId, requestId: request.requestId, command: enrollmentCommand(a.organizationId) });
    expect(converted).toMatchObject({ status: "converted", revision: 2, waitlistEntryId: null });
    expect(await athleteCount(a.organizationId)).toBe(before + 1);
    const person = await db.execute(sql`
      select p.given_name, p.family_name from zaltyko.athletes a
      join zaltyko.people p on p.organization_id = a.organization_id and p.id = a.person_id
      where a.organization_id = ${a.organizationId}::uuid and a.id = ${converted.convertedAthleteId}::uuid
    `);
    expect(person.rows[0]).toEqual({ given_name: "Lúa", family_name: "Sintética Prueba" });
    // No crea inscripción ni cuota: solo la ficha y la familia.
    expect(await count("enrollments", a.organizationId)).toBe(0);
    await expect(
      convertTrialRequest({ scope: ownerScope, userId: ownerA.userId, requestId: request.requestId, command: enrollmentCommand(a.organizationId) })
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    expect(await athleteCount(a.organizationId)).toBe(before + 1);
  });

  it("dos conversiones a la vez: una ficha y un 409", async () => {
    const request = await newRequest(a.locationIds[0]!);
    const ownerScope = await scopeFor(ownerA.userId, a.organizationId);
    const before = await athleteCount(a.organizationId);
    const results = await Promise.allSettled([
      convertTrialRequest({ scope: ownerScope, userId: ownerA.userId, requestId: request.requestId, command: enrollmentCommand(a.organizationId) }),
      convertTrialRequest({ scope: ownerScope, userId: ownerA.userId, requestId: request.requestId, command: enrollmentCommand(a.organizationId) }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toMatchObject({ status: 409 });
    expect(await athleteCount(a.organizationId)).toBe(before + 1);
  });

  it("una conversión y un descarte a la vez no dejan fichas huérfanas", async () => {
    const request = await newRequest(a.locationIds[0]!);
    const before = await athleteCount(a.organizationId);
    const results = await Promise.allSettled([
      convertTrialRequest({ scope: await scopeFor(ownerA.userId, a.organizationId), userId: ownerA.userId, requestId: request.requestId, command: enrollmentCommand(a.organizationId) }),
      changeTrialRequestStatus({ scope: await scopeFor(managerA1.userId, a.organizationId), userId: managerA1.userId, requestId: request.requestId, expectedRevision: 1, status: "declined" }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const [stored] = (await db.execute(sql`
      select status, converted_athlete_id::text as athlete_id from zaltyko.admission_requests where id = ${request.requestId}::uuid
    `)).rows as Array<{ status: string; athlete_id: string | null }>;
    if (stored!.status === "converted") {
      expect(await athleteCount(a.organizationId)).toBe(before + 1);
      expect(stored!.athlete_id).not.toBeNull();
    } else {
      expect(stored!.status).toBe("declined");
      expect(await athleteCount(a.organizationId)).toBe(before);
    }
  });

  it("si la lista de espera falla no queda ninguna ficha y el reintento funciona", async () => {
    const request = await newRequest(a.locationIds[0]!);
    const ownerScope = await scopeFor(ownerA.userId, a.organizationId);
    const before = await athleteCount(a.organizationId);
    const waitlistCommand = { ...enrollmentCommand(a.organizationId), destination: "waitlist" as const, classTemplateId: classA1 };
    // Fallo forzado solo en esta base desechable: la inserción en la espera aborta.
    await db.execute(sql.raw(`
      create function zaltyko.ci_admission_fail_waitlist() returns trigger language plpgsql as $$
      begin raise exception 'ci forced waitlist failure'; end $$;
      create trigger ci_admission_fail_waitlist before insert on zaltyko.waitlist_entries
        for each row execute function zaltyko.ci_admission_fail_waitlist();
    `));
    try {
      await expect(
        convertTrialRequest({ scope: ownerScope, userId: ownerA.userId, requestId: request.requestId, command: waitlistCommand })
      ).rejects.toThrow();
    } finally {
      await db.execute(sql`drop function if exists zaltyko.ci_admission_fail_waitlist() cascade`);
    }
    expect(await athleteCount(a.organizationId)).toBe(before);
    const [stored] = (await db.execute(sql`
      select status, revision from zaltyko.admission_requests where id = ${request.requestId}::uuid
    `)).rows;
    expect(stored).toEqual({ status: "new", revision: 1 });

    const waitlisted = await convertTrialRequest({ scope: ownerScope, userId: ownerA.userId, requestId: request.requestId, command: waitlistCommand });
    expect(waitlisted.status).toBe("waitlisted");
    expect(await athleteCount(a.organizationId)).toBe(before + 1);
    const entry = await db.execute(sql`
      select athlete_id::text as athlete_id, class_template_id::text as class_template_id, status, contactable
      from zaltyko.waitlist_entries where organization_id = ${a.organizationId}::uuid and id = ${waitlisted.waitlistEntryId}::uuid
    `);
    expect(entry.rows[0]).toEqual({ athlete_id: waitlisted.convertedAthleteId, class_template_id: classA1, status: "waiting", contactable: false });
  });

  it("la academia B no puede convertir una solicitud de A", async () => {
    const request = await newRequest(a.locationIds[0]!);
    const before = await athleteCount(b.organizationId);
    await expect(
      convertTrialRequest({ scope: await scopeFor(ownerB.userId, b.organizationId), userId: ownerB.userId, requestId: request.requestId, command: enrollmentCommand(b.organizationId) })
    ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    expect(await athleteCount(b.organizationId)).toBe(before);
    const [stored] = (await db.execute(sql`select status from zaltyko.admission_requests where id = ${request.requestId}::uuid`)).rows;
    expect(stored).toEqual({ status: "new" });
  });

  it("elimina los datos personales de una descartada y conserva el registro", async () => {
    const request = await newRequest(a.locationIds[0]!);
    const ownerScope = await scopeFor(ownerA.userId, a.organizationId);
    const managerScope = await scopeFor(managerA1.userId, a.organizationId);
    await expect(
      anonymizeTrialRequest({ scope: ownerScope, userId: ownerA.userId, requestId: request.requestId, expectedRevision: 1 })
    ).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
    await changeTrialRequestStatus({ scope: ownerScope, userId: ownerA.userId, requestId: request.requestId, expectedRevision: 1, status: "declined" });
    await expect(
      anonymizeTrialRequest({ scope: managerScope, userId: managerA1.userId, requestId: request.requestId, expectedRevision: 2 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      anonymizeTrialRequest({ scope: await scopeFor(ownerB.userId, b.organizationId), userId: ownerB.userId, requestId: request.requestId, expectedRevision: 2 })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(await anonymizeTrialRequest({ scope: ownerScope, userId: ownerA.userId, requestId: request.requestId, expectedRevision: 2 })).toMatchObject({ revision: 3 });
    const [stored] = (await db.execute(sql`
      select status, contact_name, contact_email, contact_phone, athlete_given_name, athlete_birth_year, message,
             anonymized_at is not null as anonymized
      from zaltyko.admission_requests where id = ${request.requestId}::uuid
    `)).rows;
    expect(stored).toMatchObject({
      status: "declined",
      contact_name: "Datos eliminados",
      contact_phone: null,
      athlete_given_name: "—",
      athlete_birth_year: null,
      message: null,
      anonymized: true,
    });
    expect(String((stored as { contact_email: string }).contact_email)).toMatch(/@anonimizado\.invalid$/);
    await expect(
      changeTrialRequestStatus({ scope: ownerScope, userId: ownerA.userId, requestId: request.requestId, expectedRevision: 3, status: "contacted" })
    ).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
    const audit = await db.execute(sql`
      select action from zaltyko.audit_log where organization_id = ${a.organizationId}::uuid and target_id = ${request.requestId}::uuid order by created_at
    `);
    expect(audit.rows.map((row) => row.action)).toContain("admission_request.personal_data_erased");
  });
});

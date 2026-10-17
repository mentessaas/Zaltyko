import assert from "node:assert/strict";

import { Pool } from "pg";

import { OperationalError } from "@/modules/shared/domain/operational-error";
import {
  bookTrial,
  convertTrial,
  recordTrialFollowup,
  transitionTrial,
} from "@/modules/trials/application/trial-service";
import {
  acceptWaitlistOffer,
  expireWaitlistOffer,
  joinWaitlist,
  sendWaitlistOffer,
} from "@/modules/waitlists/application/waitlist-service";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL es obligatoria");

const pool = new Pool({ connectionString: databaseUrl, max: 4 });

const ID = {
  singleOrg: "10000000-0000-0000-0000-000000000001",
  singleLocation: "10000000-0000-0000-0000-000000000011",
  singleOwnerUser: "10000000-0000-0000-0000-000000000101",
  singleOwnerMember: "10000000-0000-0000-0000-000000000201",
  singleAthlete: "10000000-0000-0000-0000-000000000401",
  singleGuardian: "10000000-0000-0000-0000-000000000501",
  singleTemplate: "10000000-0000-0000-0000-000000000801",
  singleSession: "10000000-0000-0000-0000-000000000901",
  multiOrg: "20000000-0000-0000-0000-000000000001",
  multiNorth: "20000000-0000-0000-0000-000000000011",
  multiSouth: "20000000-0000-0000-0000-000000000012",
  multiOwnerUser: "20000000-0000-0000-0000-000000000101",
  multiOwnerMember: "20000000-0000-0000-0000-000000000201",
  multiManagerUser: "20000000-0000-0000-0000-000000000102",
  multiManagerMember: "20000000-0000-0000-0000-000000000202",
  multiAthleteNorth: "20000000-0000-0000-0000-000000000401",
  multiAthleteSouth: "20000000-0000-0000-0000-000000000402",
  multiGuardian: "20000000-0000-0000-0000-000000000501",
  multiTemplateNorth: "20000000-0000-0000-0000-000000000801",
  multiTemplateSouth: "20000000-0000-0000-0000-000000000802",
  multiSessionSouth: "20000000-0000-0000-0000-000000000902",
};

const singleOwner = {
  userId: ID.singleOwnerUser,
  memberId: ID.singleOwnerMember,
};
const multiOwner = {
  userId: ID.multiOwnerUser,
  memberId: ID.multiOwnerMember,
};
const multiManager = {
  userId: ID.multiManagerUser,
  memberId: ID.multiManagerMember,
};

async function expectOperationalError(
  operation: () => Promise<unknown>,
  code: OperationalError["code"]
): Promise<void> {
  await assert.rejects(operation, (error: unknown) => {
    assert(error instanceof OperationalError);
    assert.equal(error.code, code);
    return true;
  });
}

async function count(table: string, where = "true"): Promise<number> {
  const result = await pool.query(
    `select count(*)::int as count from ${table} where ${where}`
  );
  return Number(result.rows[0].count);
}

function isoNow(offsetMs = 0): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

function localDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function main(): Promise<void> {
  const booked = await bookTrial({
    organizationId: ID.singleOrg,
    athleteId: ID.singleAthlete,
    sessionId: ID.singleSession,
    idempotencyKey: "single-trial-booked",
    actor: singleOwner,
  });
  const bookedRetry = await bookTrial({
    organizationId: ID.singleOrg,
    athleteId: ID.singleAthlete,
    sessionId: ID.singleSession,
    idempotencyKey: "single-trial-booked",
    actor: singleOwner,
  });
  assert.equal(bookedRetry.id, booked.id);
  assert.equal(
    await count("zaltyko.enrollments", `id = '${booked.trialEnrollmentId}'`),
    1
  );

  await expectOperationalError(
    () =>
      joinWaitlist({
        organizationId: ID.multiOrg,
        locationId: ID.multiSouth,
        athleteId: ID.multiAthleteSouth,
        classTemplateId: ID.multiTemplateSouth,
        contactable: false,
        priority: 1,
        preferences: { weekdays: [], timeBands: [] },
        idempotencyKey: "manager-south-waitlist-denied",
        actor: multiManager,
      }),
    "LOCATION_SCOPE_DENIED"
  );
  assert.equal(
    await count(
      "zaltyko.outbox_events",
      `idempotency_key = 'manager-south-waitlist-denied'`
    ),
    0
  );

  const attended = await transitionTrial({
    organizationId: ID.singleOrg,
    trialId: booked.id,
    expectedVersion: 1,
    toStatus: "attended",
    effectiveAt: isoNow(-2_000),
    idempotencyKey: "single-trial-attended",
    actor: singleOwner,
  });
  assert.equal(attended.status, "attended");
  await expectOperationalError(
    () =>
      transitionTrial({
        organizationId: ID.singleOrg,
        trialId: booked.id,
        expectedVersion: 1,
        toStatus: "attended",
        effectiveAt: isoNow(-3_000),
        idempotencyKey: "single-trial-attended",
        actor: singleOwner,
      }),
    "IDEMPOTENCY_CONFLICT"
  );

  const completed = await transitionTrial({
    organizationId: ID.singleOrg,
    trialId: booked.id,
    expectedVersion: 2,
    toStatus: "completed",
    effectiveAt: isoNow(-1_000),
    idempotencyKey: "single-trial-completed",
    actor: singleOwner,
  });
  assert.equal(completed.status, "completed");

  await expectOperationalError(
    () =>
      joinWaitlist({
        organizationId: ID.singleOrg,
        locationId: ID.singleLocation,
        athleteId: ID.singleAthlete,
        classTemplateId: ID.singleTemplate,
        sourceTrialId: booked.id,
        contactGuardianId: ID.multiGuardian,
        contactable: true,
        contactConsentStatus: "granted",
        contactConsentRecordedAt: isoNow(-60_000),
        priority: 10,
        preferences: { weekdays: [], timeBands: [] },
        idempotencyKey: "cross-tenant-guardian-denied",
        actor: singleOwner,
      }),
    "INVALID_RELATION"
  );
  assert.equal(
    await count(
      "zaltyko.outbox_events",
      `idempotency_key = 'cross-tenant-guardian-denied'`
    ),
    0
  );

  const followupCompletedAt = isoNow();
  const followup = await recordTrialFollowup({
    organizationId: ID.singleOrg,
    trialId: booked.id,
    channel: "email",
    outcome: "waitlisted",
    completedAt: followupCompletedAt,
    idempotencyKey: "single-trial-followup",
    actor: singleOwner,
  });
  const followupRetry = await recordTrialFollowup({
    organizationId: ID.singleOrg,
    trialId: booked.id,
    channel: "email",
    outcome: "waitlisted",
    completedAt: followupCompletedAt,
    idempotencyKey: "single-trial-followup",
    actor: singleOwner,
  });
  assert.equal(followupRetry.id, followup.id);

  const singleConsentRecordedAt = isoNow(-60_000);
  const entry = await joinWaitlist({
    organizationId: ID.singleOrg,
    locationId: ID.singleLocation,
    athleteId: ID.singleAthlete,
    classTemplateId: ID.singleTemplate,
    sourceTrialId: booked.id,
    contactGuardianId: ID.singleGuardian,
    contactable: true,
    contactConsentStatus: "granted",
    contactConsentRecordedAt: singleConsentRecordedAt,
    priority: 10,
    preferences: { weekdays: [2, 4], timeBands: ["afternoon"] },
    idempotencyKey: "single-waitlist-joined",
    actor: singleOwner,
  });
  const entryRetry = await joinWaitlist({
    organizationId: ID.singleOrg,
    locationId: ID.singleLocation,
    athleteId: ID.singleAthlete,
    classTemplateId: ID.singleTemplate,
    sourceTrialId: booked.id,
    contactGuardianId: ID.singleGuardian,
    contactable: true,
    contactConsentStatus: "granted",
    contactConsentRecordedAt: singleConsentRecordedAt,
    priority: 10,
    preferences: { weekdays: [2, 4], timeBands: ["afternoon"] },
    idempotencyKey: "single-waitlist-joined",
    actor: singleOwner,
  });
  assert.equal(entryRetry.id, entry.id);

  const singleOfferExpiresAt = isoNow(3_600_000);
  const sent = await sendWaitlistOffer({
    organizationId: ID.singleOrg,
    waitlistEntryId: entry.id,
    expectedVersion: 1,
    classTemplateId: ID.singleTemplate,
    startsOn: localDate(),
    expiresAt: singleOfferExpiresAt,
    idempotencyKey: "single-waitlist-offer",
    actor: singleOwner,
  });
  const sentRetry = await sendWaitlistOffer({
    organizationId: ID.singleOrg,
    waitlistEntryId: entry.id,
    expectedVersion: 1,
    classTemplateId: ID.singleTemplate,
    startsOn: localDate(),
    expiresAt: singleOfferExpiresAt,
    idempotencyKey: "single-waitlist-offer",
    actor: singleOwner,
  });
  assert.equal(sentRetry.offer.id, sent.offer.id);

  const accepted = await acceptWaitlistOffer({
    organizationId: ID.singleOrg,
    offerId: sent.offer.id,
    expectedVersion: 1,
    idempotencyKey: "single-waitlist-accepted",
    actor: singleOwner,
  });
  const acceptedRetry = await acceptWaitlistOffer({
    organizationId: ID.singleOrg,
    offerId: sent.offer.id,
    expectedVersion: 1,
    idempotencyKey: "single-waitlist-accepted",
    actor: singleOwner,
  });
  assert.equal(accepted.entry.status, "converted");
  assert.equal(acceptedRetry.offer.id, accepted.offer.id);
  assert.equal(
    await count(
      "zaltyko.enrollments",
      `id = '${accepted.entry.convertedEnrollmentId}' and status = 'active' and source = 'waitlist'`
    ),
    1
  );

  const directTrial = await bookTrial({
    organizationId: ID.multiOrg,
    athleteId: ID.multiAthleteSouth,
    sessionId: ID.multiSessionSouth,
    idempotencyKey: "multi-direct-trial-booked",
    actor: multiOwner,
  });
  await transitionTrial({
    organizationId: ID.multiOrg,
    trialId: directTrial.id,
    expectedVersion: 1,
    toStatus: "attended",
    effectiveAt: isoNow(-2_000),
    idempotencyKey: "multi-direct-trial-attended",
    actor: multiOwner,
  });
  const directCompleted = await transitionTrial({
    organizationId: ID.multiOrg,
    trialId: directTrial.id,
    expectedVersion: 2,
    toStatus: "completed",
    effectiveAt: isoNow(-1_000),
    idempotencyKey: "multi-direct-trial-completed",
    actor: multiOwner,
  });
  const converted = await convertTrial({
    organizationId: ID.multiOrg,
    trialId: directTrial.id,
    expectedVersion: directCompleted.version,
    targetLocationId: ID.multiSouth,
    targetClassTemplateId: ID.multiTemplateSouth,
    startsOn: localDate(),
    idempotencyKey: "multi-direct-trial-converted",
    actor: multiOwner,
  });
  const convertedRetry = await convertTrial({
    organizationId: ID.multiOrg,
    trialId: directTrial.id,
    expectedVersion: directCompleted.version,
    targetLocationId: ID.multiSouth,
    targetClassTemplateId: ID.multiTemplateSouth,
    startsOn: localDate(),
    idempotencyKey: "multi-direct-trial-converted",
    actor: multiOwner,
  });
  assert.equal(converted.trial.status, "converted");
  assert.equal(convertedRetry.enrollment.id, converted.enrollment.id);

  const concurrentWaitlist = await Promise.allSettled([
    joinWaitlist({
      organizationId: ID.multiOrg,
      locationId: ID.multiNorth,
      athleteId: ID.multiAthleteNorth,
      classTemplateId: ID.multiTemplateNorth,
      contactGuardianId: ID.multiGuardian,
      contactable: true,
      contactConsentStatus: "granted",
      contactConsentRecordedAt: isoNow(-60_000),
      priority: 5,
      preferences: { weekdays: [], timeBands: ["evening"] },
      idempotencyKey: "multi-expiry-waitlist-a",
      actor: multiOwner,
    }),
    joinWaitlist({
      organizationId: ID.multiOrg,
      locationId: ID.multiNorth,
      athleteId: ID.multiAthleteNorth,
      classTemplateId: ID.multiTemplateNorth,
      contactGuardianId: ID.multiGuardian,
      contactable: true,
      contactConsentStatus: "granted",
      contactConsentRecordedAt: isoNow(-60_000),
      priority: 5,
      preferences: { weekdays: [], timeBands: ["evening"] },
      idempotencyKey: "multi-expiry-waitlist-b",
      actor: multiOwner,
    }),
  ]);
  const successfulWaitlists = concurrentWaitlist.filter(
    (
      result
    ): result is PromiseFulfilledResult<
      Awaited<ReturnType<typeof joinWaitlist>>
    > => result.status === "fulfilled"
  );
  const rejectedWaitlists = concurrentWaitlist.filter(
    (result): result is PromiseRejectedResult => result.status === "rejected"
  );
  assert.equal(successfulWaitlists.length, 1);
  assert.equal(rejectedWaitlists.length, 1);
  assert(rejectedWaitlists[0].reason instanceof OperationalError);
  assert.equal(rejectedWaitlists[0].reason.code, "DUPLICATE_OPEN_WAITLIST");
  const expiryEntry = successfulWaitlists[0].value;
  const expirySent = await sendWaitlistOffer({
    organizationId: ID.multiOrg,
    waitlistEntryId: expiryEntry.id,
    expectedVersion: 1,
    classTemplateId: ID.multiTemplateNorth,
    startsOn: localDate(),
    expiresAt: isoNow(3_600_000),
    idempotencyKey: "multi-expiry-offer",
    actor: multiOwner,
  });
  await pool.query(
    `update zaltyko.waitlist_offers
      set sent_at = now() - interval '2 minutes',
          expires_at = now() - interval '1 minute'
      where id = $1`,
    [expirySent.offer.id]
  );
  const expired = await expireWaitlistOffer({
    organizationId: ID.multiOrg,
    offerId: expirySent.offer.id,
    expectedVersion: 1,
    idempotencyKey: "multi-expiry-processed",
    actor: multiOwner,
  });
  const expiredRetry = await expireWaitlistOffer({
    organizationId: ID.multiOrg,
    offerId: expirySent.offer.id,
    expectedVersion: 1,
    idempotencyKey: "multi-expiry-processed",
    actor: multiOwner,
  });
  assert.equal(expired.entry.status, "waiting");
  assert.equal(expired.offer.status, "expired");
  assert.equal(expiredRetry.offer.id, expired.offer.id);
  assert.equal(
    await count(
      "zaltyko.enrollments",
      `id = '${expirySent.offer.reservedEnrollmentId}' and status = 'cancelled'`
    ),
    1
  );

  assert.equal(
    await count(
      "zaltyko.outbox_events",
      `exists (
        select 1
        from jsonb_object_keys(payload) as payload_key(key_name)
        where key_name ~* '(medical|email|phone|address|birth|guardian)'
      )`
    ),
    0
  );
  assert.equal(
    await count(
      "zaltyko.outbox_events",
      "event_name = 'enrollment.cancelled' and payload->>'reasonCode' = 'trial_completed'"
    ),
    0
  );

  const integrity = await pool.query(`
    select
      (select count(*)::int from zaltyko.outbox_events) as outbox_count,
      (select count(*)::int from zaltyko.audit_log) as audit_count,
      (select count(*)::int from zaltyko.trial_status_history) as trial_history_count,
      (select count(*)::int from zaltyko.waitlist_entries where contactable and contact_consent_status = 'granted') as eligible_waitlist_count
  `);
  assert.equal(integrity.rows[0].outbox_count, integrity.rows[0].audit_count);
  assert.equal(integrity.rows[0].trial_history_count, 7);
  assert.equal(integrity.rows[0].eligible_waitlist_count, 2);

  console.log(
    JSON.stringify({
      status: "PASS",
      trialToWaitlistToEnrollment: accepted.entry.status,
      directTrialConversion: converted.trial.status,
      expiredOfferReturnsTo: expired.entry.status,
      outbox: integrity.rows[0].outbox_count,
      audit: integrity.rows[0].audit_count,
      trialHistory: integrity.rows[0].trial_history_count,
    })
  );
}

main()
  .then(async () => {
    await pool.end();
  })
  .catch(async (error) => {
    console.error(error);
    await pool.end();
    process.exitCode = 1;
  });

import { describe, expect, it } from "vitest";

import { CommercialInterviewInputSchema } from "@/lib/growth/contracts";
import { reconcileCommercialInterviewDenominators } from "@/lib/growth/interviews";
import {
  MARKETING_OUTREACH_CHANNELS,
  MARKETING_OUTREACH_REPLY_KINDS,
  RECONCILIATION_DENOMINATOR_KEYS,
  MarketingOutreachInputSchema,
  dedupeOutreachByIdempotencyKey,
  reconcileMarketingOutreachDenominators,
} from "@/lib/growth/marketing-outreach";

/**
 * Reconciliacion de outreach manual 1:1 (ZAL-582 / ZAL-580).
 *
 * Siete escenarios que cubren los denominadores aprobados por Data:
 * attempts, replies, consented, demosHeld, firstValue, trialsStarted,
 * paidConversions. Cada test asegura que el camino de reconciliacion
 * puede reconstruirse con SQL puro contra `marketing_outreach` +
 * `growth_events` sin depender de PII ni de campañas reales.
 */

const iso = (date: string) => new Date(date);

describe("ZAL-582 marketing_outreach reconciliation", () => {
  it("1/7 attempts counts every outreach with a non-null sentAt", () => {
    const rows = [
      outreachRow({ sentAt: iso("2026-08-01T08:00:00Z") }),
      outreachRow({ sentAt: iso("2026-08-01T09:00:00Z") }),
      outreachRow({ sentAt: null }),
    ];
    const summary = reconcileMarketingOutreachDenominators(rows, []);
    expect(summary.attempts).toBe(2);
    expect(RECONCILIATION_DENOMINATOR_KEYS).toContain("attempts");
  });

  it("2/7 replies count outreach where replyAt is set, ignoring the rest", () => {
    const rows = [
      outreachRow({
        sentAt: iso("2026-08-01T08:00:00Z"),
        replyAt: iso("2026-08-01T18:00:00Z"),
        replyKind: "interested",
      }),
      outreachRow({
        sentAt: iso("2026-08-02T08:00:00Z"),
        replyAt: null,
      }),
      outreachRow({
        sentAt: iso("2026-08-03T08:00:00Z"),
        replyAt: iso("2026-08-03T11:00:00Z"),
        replyKind: "not_interested",
      }),
    ];
    const summary = reconcileMarketingOutreachDenominators(rows, []);
    expect(summary.replies).toBe(2);
    expect(summary.attempts).toBe(3);
  });

  it("3/7 consented requires both consentAt and consentTextVersion", () => {
    const consentValid = iso("2026-08-01T10:00:00Z");

    const validRow = outreachRow({
      sentAt: iso("2026-08-01T08:00:00Z"),
      consentAt: consentValid,
      consentTextVersion: "v1-2026-08-01",
      demoSessionId: "8c3a3e8e-7c7a-49c0-9d4e-2d3b27ce1f01",
    });
    const rows = [validRow];

    const okParse = MarketingOutreachInputSchema.safeParse({
      campaignId: validRow.campaignId,
      channel: "instagram_dm",
      academyFingerprint: validRow.academyFingerprint,
      idempotencyKey: "k-validity-1",
      consentAt: consentValid.toISOString(),
      consentTextVersion: "v1-2026-08-01",
      demoSessionId: "8c3a3e8e-7c7a-49c0-9d4e-2d3b27ce1f01",
    });
    expect(okParse.success).toBe(true);

    const notOk = MarketingOutreachInputSchema.safeParse({
      campaignId: "c1",
      channel: "instagram_dm",
      academyFingerprint: "fp-1",
      idempotencyKey: "k-validity",
      consentAt: consentValid.toISOString(),
    });
    expect(notOk.success).toBe(false);
    if (!notOk.success) {
      const paths = notOk.error.issues.map((issue) => issue.path[0]);
      expect(paths).toContain("consentTextVersion");
      expect(paths).toContain("demoSessionId");
    }

    const summary = reconcileMarketingOutreachDenominators(rows, []);
    expect(summary.consented).toBe(1);
    expect(summary.attempts).toBe(1);
    expect(summary.demosHeld).toBe(1);
  });

  it("4/7 demosHeld counts outreach with a non-null demoSessionId", () => {
    const rows = [
      outreachRow({ demoSessionId: "8c3a3e8e-7c7a-49c0-9d4e-2d3b27ce1f10" }),
      outreachRow({ demoSessionId: null }),
      outreachRow({
        demoSessionId: "8c3a3e8e-7c7a-49c0-9d4e-2d3b27ce1f11",
        consentAt: iso("2026-08-04T10:00:00Z"),
        consentTextVersion: "v1-2026-08-04",
      }),
    ];

    const summary = reconcileMarketingOutreachDenominators(rows, []);
    expect(summary.demosHeld).toBe(2);
    expect(summary.consented).toBe(1);
  });

  it("5/7 firstValue reconciles academy_activated against earliest sentAt per academy", () => {
    const rows = [
      outreachRow({
        academyFingerprint: "alpha",
        sentAt: iso("2026-08-01T09:00:00Z"),
      }),
      outreachRow({
        academyFingerprint: "alpha",
        sentAt: iso("2026-08-02T09:00:00Z"),
      }),
      outreachRow({
        academyFingerprint: "bravo",
        sentAt: iso("2026-08-03T09:00:00Z"),
      }),
    ];
    const events = [
      growthEvent({
        academyFingerprint: "alpha",
        eventName: "academy_activated",
        occurredAt: iso("2026-08-05T09:00:00Z"),
      }),
      growthEvent({
        academyFingerprint: "bravo",
        eventName: "academy_activated",
        occurredAt: iso("2026-07-30T09:00:00Z"),
      }),
      growthEvent({
        academyFingerprint: "charlie",
        eventName: "academy_activated",
        occurredAt: iso("2026-08-06T09:00:00Z"),
      }),
    ];

    const summary = reconcileMarketingOutreachDenominators(rows, events);
    expect(summary.firstValue).toBe(1);
  });

  it("6/7 trialsStarted counts unique academies with trial_started after earliest sentAt", () => {
    const rows = [
      outreachRow({
        academyFingerprint: "alpha",
        sentAt: iso("2026-08-01T09:00:00Z"),
      }),
      outreachRow({
        academyFingerprint: "bravo",
        sentAt: iso("2026-08-02T09:00:00Z"),
      }),
    ];
    const events = [
      growthEvent({
        academyFingerprint: "alpha",
        eventName: "trial_started",
        occurredAt: iso("2026-08-04T09:00:00Z"),
      }),
      growthEvent({
        academyFingerprint: "alpha",
        eventName: "trial_started",
        occurredAt: iso("2026-08-04T10:00:00Z"),
      }),
      growthEvent({
        academyFingerprint: "bravo",
        eventName: "trial_started",
        occurredAt: iso("2026-08-01T09:00:00Z"),
      }),
    ];

    const summary = reconcileMarketingOutreachDenominators(rows, events);
    expect(summary.trialsStarted).toBe(1);
  });

  it("7/7 paidConversions only fires when paid_conversion lines up with outreach", () => {
    const rows = [
      outreachRow({
        academyFingerprint: "alpha",
        sentAt: iso("2026-08-01T09:00:00Z"),
      }),
      outreachRow({
        academyFingerprint: "bravo",
        sentAt: iso("2026-08-01T09:00:00Z"),
      }),
      outreachRow({
        academyFingerprint: "charlie",
        sentAt: null,
      }),
    ];
    const events = [
      growthEvent({
        academyFingerprint: "alpha",
        eventName: "paid_conversion",
        occurredAt: iso("2026-08-09T09:00:00Z"),
      }),
      growthEvent({
        academyFingerprint: "bravo",
        eventName: "paid_conversion",
        occurredAt: iso("2026-07-30T09:00:00Z"),
      }),
      growthEvent({
        academyFingerprint: "charlie",
        eventName: "paid_conversion",
        occurredAt: iso("2026-08-15T09:00:00Z"),
      }),
    ];

    const summary = reconcileMarketingOutreachDenominators(rows, events);
    expect(summary.paidConversions).toBe(1);
    expect(summary.attempts).toBe(2);
  });

  it("idempotent replay returns the same row id (no double counting)", () => {
    const base = {
      idempotencyKey: "alpha-1:2026-08-01",
      id: "row-1",
    };
    const existing = [
      { idempotencyKey: "beta-1:2026-08-01", id: "row-0" },
      base,
    ];
    const dup = {
      idempotencyKey: base.idempotencyKey,
      id: "row-99",
    };
    const first = dedupeOutreachByIdempotencyKey(base, existing);
    expect(first.deduped).toBe(true);
    expect(first.row.id).toBe("row-1");

    const replay = dedupeOutreachByIdempotencyKey(dup, existing);
    expect(replay.deduped).toBe(true);
    expect(replay.row.id).toBe("row-1");

    const fresh = dedupeOutreachByIdempotencyKey(
      { idempotencyKey: "gamma-1:2026-08-01", id: "row-2" },
      existing
    );
    expect(fresh.deduped).toBe(false);
    expect(fresh.row.id).toBe("row-2");
  });

  it("validates the input shape (channel/modality/countryCode/consent)", () => {
    const ok = MarketingOutreachInputSchema.safeParse({
      campaignId: "r3-2026-08",
      channel: "instagram_dm",
      modality: "gymnastics_artistic",
      countryCode: "ES",
      city: "Madrid",
      academyFingerprint: "fp-001",
      attemptNumber: 1,
      idempotencyKey: "r3-2026-08:fp-001:1",
      sentAt: "2026-08-01T10:00:00.000Z",
      replyAt: "2026-08-02T10:00:00.000Z",
      replyKind: "interested",
      consentAt: "2026-08-03T10:00:00.000Z",
      consentTextVersion: "v1-2026-08-01",
      demoSessionId: "8c3a3e8e-7c7a-49c0-9d4e-2d3b27ce1f99",
      source: "agent",
    });
    expect(ok.success).toBe(true);

    const badCountry = MarketingOutreachInputSchema.safeParse({
      campaignId: "r3-2026-08",
      channel: "instagram_dm",
      academyFingerprint: "fp-001",
      idempotencyKey: "r3-2026-08:fp-001:2",
      countryCode: "esp",
    });
    expect(badCountry.success).toBe(false);

    const badChannel = MarketingOutreachInputSchema.safeParse({
      campaignId: "r3-2026-08",
      channel: "telegram",
      academyFingerprint: "fp-001",
      idempotencyKey: "r3-2026-08:fp-001:3",
    });
    expect(badChannel.success).toBe(false);

    const badReplyKind = MarketingOutreachInputSchema.safeParse({
      campaignId: "r3-2026-08",
      channel: "instagram_dm",
      academyFingerprint: "fp-001",
      idempotencyKey: "r3-2026-08:fp-001:4",
      replyKind: "spam",
    });
    expect(badReplyKind.success).toBe(false);

    expect(MARKETING_OUTREACH_CHANNELS).toContain("instagram_dm");
    expect(MARKETING_OUTREACH_REPLY_KINDS).toContain("interested");
  });
});

/**
 * ZAL-583: los mismos dos denominadores, ahora reconstruibles desde
 * `commercial_interviews` (no solo desde `marketing_outreach`). Cierra el
 * hueco de instrumentacion senalado por Data en ZAL-579/ZAL-580.
 */
describe("ZAL-583 commercial_interviews reconciliation", () => {
  it("1/2 consented requires consent_at IS NOT NULL AND consent_text_version IS NOT NULL", () => {
    const rows = [
      // cuenta: ambas columnas presentes
      interviewRow({
        consentAt: iso("2026-08-05T10:00:00Z"),
        consentTextVersion: "v1-2026-08-01",
      }),
      // no cuenta: consent_at sin version (la DB lo rechaza vía
      // commercial_interviews_consent_implies_version_check)
      interviewRow({
        consentAt: iso("2026-08-05T11:00:00Z"),
        consentTextVersion: null,
      }),
      // no cuenta: version sin consent_at
      interviewRow({ consentAt: null, consentTextVersion: "v1-2026-08-01" }),
      // no cuenta: sin consentimiento
      interviewRow({}),
    ];

    expect(reconcileCommercialInterviewDenominators(rows).consented).toBe(1);

    // El contrato Zod espeja la invariante antes de llegar a la DB.
    const missingVersion = CommercialInterviewInputSchema.safeParse({
      academyName: "Club Gimnasia Norte",
      consentAt: "2026-08-05T10:00:00.000Z",
    });
    expect(missingVersion.success).toBe(false);
    if (!missingVersion.success) {
      expect(missingVersion.error.issues.map((issue) => issue.path[0])).toContain(
        "consentTextVersion"
      );
    }

    const badVersionFormat = CommercialInterviewInputSchema.safeParse({
      academyName: "Club Gimnasia Norte",
      consentAt: "2026-08-05T10:00:00.000Z",
      consentTextVersion: "1.0",
    });
    expect(badVersionFormat.success).toBe(false);

    const ok = CommercialInterviewInputSchema.safeParse({
      academyName: "Club Gimnasia Norte",
      consentAt: "2026-08-05T10:00:00.000Z",
      consentTextVersion: "v1-2026-08-01",
    });
    expect(ok.success).toBe(true);
  });

  it("2/2 demos_held requires status='completed' AND demo_ended_at IS NOT NULL AND attendees_count >= 1", () => {
    const rows = [
      // cuenta: completed + cierre de demo + al menos un asistente
      interviewRow({
        status: "completed",
        demoEndedAt: iso("2026-08-06T12:00:00Z"),
        attendeesCount: 1,
      }),
      interviewRow({
        status: "completed",
        demoEndedAt: iso("2026-08-07T12:00:00Z"),
        attendeesCount: 4,
      }),
      // no cuenta: demo cerrada pero entrevista no completada
      interviewRow({
        status: "scheduled",
        demoEndedAt: iso("2026-08-08T12:00:00Z"),
        attendeesCount: 3,
      }),
      // no cuenta: completed sin cierre de demo (la DB lo rechaza vía
      // commercial_interviews_demo_evidence_check)
      interviewRow({ status: "completed", demoEndedAt: null, attendeesCount: 2 }),
      // no cuenta: sin asistentes registrados
      interviewRow({
        status: "completed",
        demoEndedAt: iso("2026-08-09T12:00:00Z"),
        attendeesCount: null,
      }),
    ];

    expect(reconcileCommercialInterviewDenominators(rows).demosHeld).toBe(2);
    expect(reconcileCommercialInterviewDenominators(rows).consented).toBe(0);

    // Una entrevista `completed` sin demoEndedAt falla en el contrato, no en la DB.
    const completedWithoutDemo = CommercialInterviewInputSchema.safeParse({
      ...completedInterviewPayload(),
      demoEndedAt: null,
    });
    expect(completedWithoutDemo.success).toBe(false);
    if (!completedWithoutDemo.success) {
      expect(completedWithoutDemo.error.issues.map((issue) => issue.path[0])).toContain(
        "demoEndedAt"
      );
    }

    const completed = CommercialInterviewInputSchema.safeParse(completedInterviewPayload());
    expect(completed.success).toBe(true);

    // demo_started_at posterior a demo_ended_at es incoherente.
    const invertedTimeline = CommercialInterviewInputSchema.safeParse({
      ...completedInterviewPayload(),
      demoStartedAt: "2026-08-06T13:00:00.000Z",
      demoEndedAt: "2026-08-06T12:00:00.000Z",
    });
    expect(invertedTimeline.success).toBe(false);

    // attendees_count fuera del rango operativo 1..50.
    const tooManyAttendees = CommercialInterviewInputSchema.safeParse({
      ...completedInterviewPayload(),
      attendeesCount: 51,
    });
    expect(tooManyAttendees.success).toBe(false);
  });
});

type InterviewRow = {
  status: string;
  consentAt: Date | null;
  consentTextVersion: string | null;
  demoEndedAt: Date | null;
  attendeesCount: number | null;
};

function interviewRow(partial: Partial<InterviewRow> = {}): InterviewRow {
  return {
    status: partial.status ?? "scheduled",
    consentAt: partial.consentAt ?? null,
    consentTextVersion: partial.consentTextVersion ?? null,
    demoEndedAt: partial.demoEndedAt ?? null,
    attendeesCount: partial.attendeesCount ?? null,
  };
}

function completedInterviewPayload() {
  return {
    academyName: "Club Gimnasia Norte",
    status: "completed" as const,
    completedAt: "2026-08-06T12:30:00.000Z",
    athleteCount: 80,
    currentTools: "Excel y WhatsApp",
    biggestPain: "Cobrar cuotas y perseguir impagos",
    primaryObjection: "Migrar el historico",
    easyPriceEur: 19,
    limitPriceEur: 49,
    demoStartedAt: "2026-08-06T11:30:00.000Z",
    demoEndedAt: "2026-08-06T12:00:00.000Z",
    attendeesCount: 2,
  };
}

type OutreachRow = {
  id: string;
  campaignId: string;
  academyFingerprint: string;
  sentAt: Date | null;
  replyAt: Date | null;
  replyKind: string | null;
  consentAt: Date | null;
  consentTextVersion: string | null;
  demoSessionId: string | null;
};

function outreachRow(partial: Partial<OutreachRow> = {}): OutreachRow {
  return {
    id: partial.id ?? cryptoRandomUUID(),
    campaignId: partial.campaignId ?? "r3-2026-08",
    academyFingerprint: partial.academyFingerprint ?? "fp-default",
    sentAt: partial.sentAt ?? null,
    replyAt: partial.replyAt ?? null,
    replyKind: partial.replyKind ?? null,
    consentAt: partial.consentAt ?? null,
    consentTextVersion: partial.consentTextVersion ?? null,
    demoSessionId: partial.demoSessionId ?? null,
  };
}

type GrowthEvent = {
  academyFingerprint: string;
  eventName: string;
  occurredAt: Date;
};

function growthEvent(
  partial: Partial<GrowthEvent> & { academyFingerprint: string; eventName: string; occurredAt: Date }
): GrowthEvent {
  return {
    academyFingerprint: partial.academyFingerprint,
    eventName: partial.eventName,
    occurredAt: partial.occurredAt,
  };
}

// Deterministic but unique IDs without relying on crypto module polyfills.
let counter = 0;
function cryptoRandomUUID(): string {
  counter += 1;
  return `00000000-0000-4000-8000-${counter.toString(16).padStart(12, "0")}`;
}

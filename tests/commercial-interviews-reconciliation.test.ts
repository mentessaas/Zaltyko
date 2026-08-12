import { describe, expect, it } from "vitest";

import { CommercialInterviewInputSchema } from "@/lib/growth/contracts";
import { reconcileCommercialInterviewDenominators } from "@/lib/growth/interviews";

/**
 * ZAL-583: `consented` y `demos_held` reconstruibles desde
 * `commercial_interviews`, no solo desde `marketing_outreach`. Cierra el hueco
 * de instrumentacion senalado por Data en ZAL-579/ZAL-580.
 *
 * Cada escenario fija una regla que tiene que valer en tres sitios a la vez:
 * la query SQL del denominador, el CHECK de la tabla y el contrato Zod. La
 * paridad SQL<->TS se comprueba aparte en `scripts/verify-zal583-sandbox.sh`,
 * que aplica la migracion en un Postgres efimero y espera los mismos numeros
 * que este archivo (consented=1, demos_held=2).
 */

const iso = (date: string) => new Date(date);

describe("ZAL-583 commercial_interviews reconciliation", () => {
  it("1/2 consented requires consent_at IS NOT NULL AND consent_text_version IS NOT NULL", () => {
    const rows = [
      // cuenta: ambas columnas presentes
      interviewRow({
        consentAt: iso("2026-08-05T10:00:00Z"),
        consentTextVersion: "v1-2026-08-01",
      }),
      // no cuenta: consent_at sin version (la DB lo rechaza via
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
      // no cuenta: completed sin cierre de demo (la DB lo rechaza via
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
      expect(
        completedWithoutDemo.error.issues.map((issue) => issue.path[0])
      ).toContain("demoEndedAt");
    }

    const completed = CommercialInterviewInputSchema.safeParse(
      completedInterviewPayload()
    );
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

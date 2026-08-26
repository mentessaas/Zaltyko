/**
 * Tests unitarios de la lógica de prioridad del bundle de atención.
 *
 * No requieren DB. Cubren:
 * - Casos del dueño: cargos fallidos, vencidos, asistencia urgente, mensajes
 *   fallidos, drafts de progreso, import job fallido, sin acción.
 * - Casos del coach: subset read-only (no ve cargos ni import).
 * - Honestidad: bundle con `sourceAvailable: false` se ignora aunque el count
 *   parezca 0; la UI debe mostrar "sin datos" en lugar de un cero inventado.
 */

import { describe, expect, it } from "vitest";

import {
  deriveCoachPriorityAction,
  deriveOwnerPriorityAction,
  isOwnerBundle,
} from "./attention-priority";
import type {
  ChargesAttention,
  CoachAttentionBundle,
  MessagesAttention,
  OwnerAttentionBundle,
  TodaySessionAttention,
} from "./attention-types";

const ACADEMY_ID = "11111111-1111-1111-1111-111111111111";

function makeToday(): TodaySessionAttention[] {
  return [];
}

function makeCharges(overrides: Partial<ChargesAttention> = {}): ChargesAttention {
  return {
    overdue: 0,
    failed: 0,
    items: [],
    sourceAvailable: true,
    href: `/app/${ACADEMY_ID}/billing`,
    source: "charges.status='overdue'|'failed'",
    ...overrides,
  };
}

function makeMessages(overrides: Partial<MessagesAttention> = {}): MessagesAttention {
  return {
    unsent: 0,
    failed: 0,
    unread: 0,
    sourceAvailable: true,
    href: `/app/${ACADEMY_ID}/comms`,
    source: "scheduled_notifications.status",
    ...overrides,
  };
}

function makeOwner(overrides: Partial<OwnerAttentionBundle> = {}): OwnerAttentionBundle {
  return {
    academyId: ACADEMY_ID,
    date: "2026-08-12",
    today: makeToday(),
    attendancePending: {
      count: 0,
      sourceAvailable: true,
      href: null,
      source: "attendance_records.status='pending'",
    },
    messagesPending: makeMessages(),
    chargesOverdue: makeCharges(),
    progressDrafts: {
      count: 0,
      sourceAvailable: true,
      href: null,
      source: "athlete_assessments.status='draft'",
    },
    importActive: null,
    priorityAction: null,
    ...overrides,
  };
}

function makeCoach(overrides: Partial<CoachAttentionBundle> = {}): CoachAttentionBundle {
  return {
    academyId: ACADEMY_ID,
    date: "2026-08-12",
    today: makeToday(),
    attendancePending: {
      count: 0,
      sourceAvailable: true,
      href: null,
      source: "attendance_records.status='pending'",
    },
    messagesPending: makeMessages(),
    priorityAction: null,
    ...overrides,
  };
}

describe("deriveOwnerPriorityAction", () => {
  it("devuelve null cuando no hay nada accionable", () => {
    const action = deriveOwnerPriorityAction(makeOwner());
    expect(action).toBeNull();
  });

  it("prioriza cargos fallidos por encima de vencidos", () => {
    const bundle = makeOwner({
      chargesOverdue: makeCharges({ overdue: 3, failed: 1 }),
    });
    const action = deriveOwnerPriorityAction(bundle);
    expect(action?.kind).toBe("review_failed_charges");
    expect(action?.label).toContain("fallidos");
    expect(action?.label).toContain("(1)");
    expect(action?.href).toBe(`/app/${ACADEMY_ID}/billing?status=failed`);
  });

  it("cae a cargos vencidos cuando no hay fallidos", () => {
    const bundle = makeOwner({
      chargesOverdue: makeCharges({ overdue: 4 }),
    });
    const action = deriveOwnerPriorityAction(bundle);
    expect(action?.kind).toBe("review_overdue_charges");
    expect(action?.label).toContain("vencidos");
    expect(action?.label).toContain("(4)");
  });

  it("ignora cargos con sourceAvailable:false aunque el count diga 0", () => {
    const bundle = makeOwner({
      chargesOverdue: makeCharges({
        overdue: 0,
        failed: 0,
        sourceAvailable: false,
      }),
    });
    const action = deriveOwnerPriorityAction(bundle);
    expect(action).toBeNull();
  });

  it("elige take_attendance cuando hay una sesión en < 2h sin registro", () => {
    const inOneHour = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const bundle = makeOwner({
      today: [
        {
          sessionId: "s1",
          classId: "c1",
          className: "Iniciación 1",
          startsAt: inOneHour,
          groupName: "Pre-benjamín",
          attendanceRecorded: false,
          href: `/app/${ACADEMY_ID}/attendance/today/s1`,
        },
      ],
    });
    const action = deriveOwnerPriorityAction(bundle);
    expect(action?.kind).toBe("take_attendance");
    expect(action?.label).toContain("Iniciación 1");
    expect(action?.href).toBe(`/app/${ACADEMY_ID}/attendance/today/s1`);
  });

  it("no elige take_attendance si la sesión ya pasó hace más de 1h", () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const bundle = makeOwner({
      today: [
        {
          sessionId: "s1",
          classId: "c1",
          className: "Vieja",
          startsAt: threeHoursAgo,
          groupName: null,
          attendanceRecorded: false,
          href: `/app/${ACADEMY_ID}/attendance/today/s1`,
        },
      ],
    });
    const action = deriveOwnerPriorityAction(bundle);
    expect(action).toBeNull();
  });

  it("no elige take_attendance si la sesión está a más de 2h", () => {
    const inFiveHours = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString();
    const bundle = makeOwner({
      today: [
        {
          sessionId: "s1",
          classId: "c1",
          className: "Lejana",
          startsAt: inFiveHours,
          groupName: null,
          attendanceRecorded: false,
          href: `/app/${ACADEMY_ID}/attendance/today/s1`,
        },
      ],
    });
    const action = deriveOwnerPriorityAction(bundle);
    expect(action).toBeNull();
  });

  it("elige review_failed_messages cuando hay mensajes fallidos", () => {
    const bundle = makeOwner({
      messagesPending: makeMessages({ failed: 2, unsent: 1 }),
    });
    const action = deriveOwnerPriorityAction(bundle);
    expect(action?.kind).toBe("review_failed_messages");
    expect(action?.label).toContain("(2)");
  });

  it("elige publish_drafts cuando hay borradores de progreso", () => {
    const bundle = makeOwner({
      progressDrafts: { count: 5, sourceAvailable: true, href: null, source: "athlete_assessments" },
    });
    const action = deriveOwnerPriorityAction(bundle);
    expect(action?.kind).toBe("publish_drafts");
    expect(action?.label).toContain("(5)");
  });

  it("elige resolve_import cuando el import job está en failed", () => {
    const bundle = makeOwner({
      importActive: {
        jobId: "j1",
        state: "failed",
        filename: "atletas.csv",
        source: "athlete_import_jobs",
        href: `/app/${ACADEMY_ID}/athletes/import?jobId=j1`,
      },
    });
    const action = deriveOwnerPriorityAction(bundle);
    expect(action?.kind).toBe("resolve_import");
    expect(action?.label).toContain("failed");
  });

  it("elige resolve_import cuando el import está en mapping_required", () => {
    const bundle = makeOwner({
      importActive: {
        jobId: "j1",
        state: "mapping_required",
        filename: "atletas.csv",
        source: "athlete_import_jobs",
        href: `/app/${ACADEMY_ID}/athletes/import?jobId=j1`,
      },
    });
    const action = deriveOwnerPriorityAction(bundle);
    expect(action?.kind).toBe("resolve_import");
  });

  it("NO elige resolve_import cuando el import está en preview_ready o validated", () => {
    const bundle = makeOwner({
      importActive: {
        jobId: "j1",
        state: "preview_ready",
        filename: "atletas.csv",
        source: "athlete_import_jobs",
        href: `/app/${ACADEMY_ID}/athletes/import?jobId=j1`,
      },
    });
    const action = deriveOwnerPriorityAction(bundle);
    expect(action).toBeNull();
  });

  it("orden de prioridad: cargos fallidos > asistencia > mensajes > drafts > import", () => {
    const inOneHour = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const bundle = makeOwner({
      chargesOverdue: makeCharges({ failed: 1 }),
      today: [
        {
          sessionId: "s1",
          classId: "c1",
          className: "X",
          startsAt: inOneHour,
          groupName: null,
          attendanceRecorded: false,
          href: "/x",
        },
      ],
      messagesPending: makeMessages({ failed: 3 }),
      progressDrafts: { count: 2, sourceAvailable: true, href: null, source: "x" },
      importActive: {
        jobId: "j1",
        state: "failed",
        filename: "f.csv",
        source: "x",
        href: "/x",
      },
    });
    const action = deriveOwnerPriorityAction(bundle);
    expect(action?.kind).toBe("review_failed_charges");
  });
});

describe("deriveCoachPriorityAction", () => {
  it("devuelve null cuando no hay nada accionable", () => {
    const action = deriveCoachPriorityAction(makeCoach());
    expect(action).toBeNull();
  });

  it("elige take_attendance cuando hay sesión en < 2h", () => {
    const in30Min = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const bundle = makeCoach({
      today: [
        {
          sessionId: "s1",
          classId: "c1",
          className: "Iniciación",
          startsAt: in30Min,
          groupName: null,
          attendanceRecorded: false,
          href: `/app/${ACADEMY_ID}/attendance/today/s1`,
        },
      ],
    });
    const action = deriveCoachPriorityAction(bundle);
    expect(action?.kind).toBe("take_attendance");
  });

  it("elige review_failed_messages cuando no hay clase pronta", () => {
    const bundle = makeCoach({
      messagesPending: makeMessages({ failed: 1 }),
    });
    const action = deriveCoachPriorityAction(bundle);
    expect(action?.kind).toBe("review_failed_messages");
  });

  it("ignora campos del owner (chargesOverdue, progressDrafts) aunque se inyecten", () => {
    // El bundle coach no los incluye; verificamos que un cast accidental
    // no los interprete. Hacemos un bundle coach y le "pegamos" un cargo
    // forzando el type: el helper no debe leerlo.
    const bundle = makeCoach();
    // @ts-expect-error -- comprobando defensivamente
    bundle.chargesOverdue = makeCharges({ overdue: 99 });
    const action = deriveCoachPriorityAction(bundle);
    expect(action).toBeNull();
  });
});

describe("isOwnerBundle", () => {
  it("distingue owner de coach por la presencia de chargesOverdue", () => {
    expect(isOwnerBundle(makeOwner())).toBe(true);
    expect(isOwnerBundle(makeCoach())).toBe(false);
  });
});

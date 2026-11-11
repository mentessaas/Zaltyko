import { describe, expect, it } from "vitest";

import {
  BLOCK_KINDS,
  blockKindLabels,
  canManageClassPlanTemplate,
  canMarkBlocks,
  markBlockCommandSchema,
  parseStoredTemplateBlocks,
  PLAN_APPARATUS,
  PLAN_APPARATUS_BY_DISCIPLINE,
  PLAN_DISCIPLINES,
  planApparatusBelongsToDiscipline,
  planApparatusLabels,
  planDisciplineLabels,
  saveClassPlanTemplateCommandSchema,
  saveSessionPlanCommandSchema,
  sessionPlanQuerySchema,
  SESSION_PLAN_ROLES,
} from "@/modules/session-plans/domain/session-plan";

const organizationId = "b0000000-0000-4000-8000-000000000001";
const locationId = "b0000000-0000-4000-8000-000000000002";
const clientRequestId = "b0000000-0000-4000-8000-000000000003";
const blockId = "b0000000-0000-4000-8000-000000000004";
const objectiveId = "b0000000-0000-4000-8000-000000000005";

const base = { organizationId, locationId, clientRequestId, expectedRevision: null };

describe("listas cerradas y textos", () => {
  it("cada tipo, disciplina y aparato tiene su etiqueta en español", () => {
    for (const kind of BLOCK_KINDS) expect(blockKindLabels[kind]).toBeTruthy();
    for (const discipline of PLAN_DISCIPLINES) expect(planDisciplineLabels[discipline]).toBeTruthy();
    for (const apparatus of PLAN_APPARATUS) expect(planApparatusLabels[apparatus]).toBeTruthy();
    expect(blockKindLabels.warmup).toBe("Calentamiento");
    expect(planDisciplineLabels.gr).toBe("Rítmica");
    expect(planApparatusLabels.ribbon).toBe("Cinta");
  });

  it("cada aparato pertenece a alguna disciplina y la lista es exactamente su unión", () => {
    const union = new Set(Object.values(PLAN_APPARATUS_BY_DISCIPLINE).flat());
    expect([...union].sort()).toEqual([...PLAN_APPARATUS].sort());
  });

  it.each([
    ["gaf", "beam", true],
    ["gam", "pommel_horse", true],
    ["gr", "hoop", true],
    ["gaf", "rings", false],
    ["gr", "vault", false],
    [null, "floor", false],
    [null, null, true],
  ] as const)("disciplina %s con aparato %s → %s", (discipline, apparatus, expected) => {
    expect(planApparatusBelongsToDiscipline(discipline, apparatus)).toBe(expected);
  });
});

describe("permisos", () => {
  it("el plan de la sesión admite al entrenador; la plantilla de la clase no (Decide Elvis)", () => {
    expect(SESSION_PLAN_ROLES).toContain("coach");
    expect(canManageClassPlanTemplate("coach")).toBe(false);
    for (const role of ["owner", "admin", "manager"] as const) expect(canManageClassPlanTemplate(role)).toBe(true);
  });

  it("los bloques se marcan solo desde que empieza la sesión y nunca si está cancelada", () => {
    const now = new Date("2026-11-11T17:00:00.000Z");
    expect(canMarkBlocks({ startsAt: new Date("2026-11-11T18:00:00.000Z"), status: "scheduled" }, now)).toBe(false);
    expect(canMarkBlocks({ startsAt: new Date("2026-11-11T17:00:00.000Z"), status: "scheduled" }, now)).toBe(true);
    expect(canMarkBlocks({ startsAt: new Date("2026-11-11T16:00:00.000Z"), status: "completed" }, now)).toBe(true);
    expect(canMarkBlocks({ startsAt: new Date("2026-11-11T16:00:00.000Z"), status: "cancelled" }, now)).toBe(false);
  });
});

describe("orden de guardar el plan", () => {
  it("normaliza foco y nota vacíos a null y aplica valores por defecto", () => {
    const parsed = saveSessionPlanCommandSchema.parse({ ...base, focus: "   ", note: "" });
    expect(parsed.focus).toBeNull();
    expect(parsed.note).toBeNull();
    expect(parsed.source).toBe("manual");
    expect(parsed.blocks).toEqual([]);
    expect(parsed.objectiveIds).toEqual([]);
  });

  it("colapsa espacios del foco y conserva saltos de línea en contenido y nota", () => {
    const parsed = saveSessionPlanCommandSchema.parse({
      ...base,
      focus: "  Rondada   flic ",
      note: "Línea 1\r\nLínea 2",
      blocks: [{ kind: "technique", discipline: "gaf", apparatus: "floor", content: "Paso 1\nPaso 2", durationMinutes: 20 }],
    });
    expect(parsed.focus).toBe("Rondada flic");
    expect(parsed.note).toBe("Línea 1\nLínea 2");
    expect(parsed.blocks[0].content).toBe("Paso 1\nPaso 2");
  });

  it.each([
    ["foco de más de 200 caracteres", { focus: "a".repeat(201) }],
    ["foco con salto de línea", { focus: "a\nb" }],
    ["nota de más de 1000 caracteres", { note: "a".repeat(1001) }],
    ["contenido vacío", { blocks: [{ kind: "warmup", content: "  " }] }],
    ["contenido de más de 300 caracteres", { blocks: [{ kind: "warmup", content: "a".repeat(301) }] }],
    ["duración 0", { blocks: [{ kind: "warmup", content: "x", durationMinutes: 0 }] }],
    ["duración de más de 240", { blocks: [{ kind: "warmup", content: "x", durationMinutes: 241 }] }],
    ["duración decimal", { blocks: [{ kind: "warmup", content: "x", durationMinutes: 1.5 }] }],
    ["tipo fuera de la lista", { blocks: [{ kind: "ballet", content: "x" }] }],
    ["disciplina fuera de la lista", { blocks: [{ kind: "technique", discipline: "trampoline", content: "x" }] }],
    ["aparato sin disciplina", { blocks: [{ kind: "technique", apparatus: "beam", content: "x" }] }],
    ["aparato de otra disciplina", { blocks: [{ kind: "technique", discipline: "gam", apparatus: "beam", content: "x" }] }],
    ["más de 20 bloques", { blocks: Array.from({ length: 21 }, () => ({ kind: "other", content: "x" })) }],
    ["bloques repetidos", { blocks: [{ id: blockId, kind: "other", content: "x" }, { id: blockId, kind: "other", content: "y" }] }],
    ["objetivos repetidos", { objectiveIds: [objectiveId, objectiveId] }],
    ["más de 30 objetivos", { objectiveIds: Array.from({ length: 31 }, (_, index) => `b0000000-0000-4000-8000-${String(index).padStart(12, "0")}`) }],
    ["plantilla al actualizar", { source: "template", expectedRevision: 2 }],
    ["revisión 0", { expectedRevision: 0 }],
    ["campo desconocido", { sessionStaff: [] }],
    ["caracteres de control en el contenido", { blocks: [{ kind: "other", content: "a\u0000b" }] }],
  ])("rechaza %s", (_label, patch) => {
    expect(saveSessionPlanCommandSchema.safeParse({ ...base, ...patch }).success).toBe(false);
  });

  it("exige expectedRevision explícito (null para crear)", () => {
    expect(saveSessionPlanCommandSchema.safeParse({ organizationId, locationId, clientRequestId }).success).toBe(false);
  });

  it("admite crear desde la plantilla", () => {
    expect(saveSessionPlanCommandSchema.parse({ ...base, source: "template" }).source).toBe("template");
  });
});

describe("otras órdenes", () => {
  it("la consulta exige academia y sede y rechaza parámetros extra", () => {
    expect(sessionPlanQuerySchema.safeParse({ organizationId, locationId }).success).toBe(true);
    expect(sessionPlanQuerySchema.safeParse({ organizationId }).success).toBe(false);
    expect(sessionPlanQuerySchema.safeParse({ organizationId, locationId, staff: "1" }).success).toBe(false);
  });

  it("marcar un bloque exige un booleano", () => {
    expect(markBlockCommandSchema.safeParse({ organizationId, locationId, done: true }).success).toBe(true);
    expect(markBlockCommandSchema.safeParse({ organizationId, locationId, done: "true" }).success).toBe(false);
  });

  it("la plantilla no admite identificadores de bloque", () => {
    const template = { organizationId, locationId, expectedRevision: null };
    expect(saveClassPlanTemplateCommandSchema.safeParse({ ...template, blocks: [{ kind: "warmup", content: "x" }] }).success).toBe(true);
    expect(
      saveClassPlanTemplateCommandSchema.safeParse({ ...template, blocks: [{ id: blockId, kind: "warmup", content: "x" }] }).success
    ).toBe(false);
  });
});

describe("bloques guardados en la plantilla", () => {
  it("descarta lo que ya no valida y normaliza los opcionales a null", () => {
    expect(parseStoredTemplateBlocks(null)).toEqual([]);
    expect(parseStoredTemplateBlocks({ kind: "warmup" })).toEqual([]);
    expect(
      parseStoredTemplateBlocks([
        { kind: "warmup", content: "Movilidad" },
        { kind: "ballet", content: "x" },
        { kind: "technique", discipline: "gr", apparatus: "hoop", content: "Lanzamientos", durationMinutes: 15 },
      ])
    ).toEqual([
      { kind: "warmup", discipline: null, apparatus: null, content: "Movilidad", durationMinutes: null },
      { kind: "technique", discipline: "gr", apparatus: "hoop", content: "Lanzamientos", durationMinutes: 15 },
    ]);
  });

  it("nunca devuelve más de 20 bloques", () => {
    const many = Array.from({ length: 25 }, (_, index) => ({ kind: "other", content: `B${index}` }));
    expect(parseStoredTemplateBlocks(many)).toHaveLength(20);
  });
});

import { describe, expect, it } from "vitest";

import {
  apparatusBelongsToDiscipline,
  buildTemplateProgress,
  canEvaluate,
  canManageTemplates,
  checkLevelPass,
  computeLevelCompletion,
  computeTrackState,
  createTemplateCommandSchema,
  evaluateSkillsCommandSchema,
  formatDiplomaDate,
  isSkillLevelsFlagOn,
  localDateInTimeZone,
  MAX_EVALUATION_CELLS,
  passLevelCommandSchema,
  saveTemplateCommandSchema,
  SKILL_APPARATUS,
  SKILL_APPARATUS_BY_DISCIPLINE,
  SKILL_DISCIPLINES,
  SKILL_LEVELS_ENV_FLAG,
  STARTER_TEMPLATE_NOTICE,
  summarizeByApparatus,
  type ElementStatus,
  type LevelPassView,
  type ProgressEntry,
  type TemplateLevelView,
} from "@/modules/skill-levels/domain/skill-levels";
import {
  findStarterTemplate,
  STARTER_TEMPLATES,
  starterTemplateSummaries,
} from "@/modules/skill-levels/domain/starter-templates";

/**
 * Niveles y progresión · dominio puro: bandera, validación de órdenes,
 * permisos, plantillas de ejemplo y todos los cálculos (porcentajes, nivel
 * actual, «listo para pasar» y reglas del paso de nivel).
 */

const guid = (n: number) => `a0000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const scope = { organizationId: guid(1), locationId: guid(2) };

describe("bandera", () => {
  it("está apagada por defecto y solo la enciende el valor exacto «true»", () => {
    expect(SKILL_LEVELS_ENV_FLAG).toBe("ZALTYKO_SKILL_LEVELS_ENABLED");
    expect(isSkillLevelsFlagOn({})).toBe(false);
    for (const value of ["", "false", "TRUE", "1", "yes", " true"]) {
      expect(isSkillLevelsFlagOn({ [SKILL_LEVELS_ENV_FLAG]: value }), value).toBe(false);
    }
    expect(isSkillLevelsFlagOn({ [SKILL_LEVELS_ENV_FLAG]: "true" })).toBe(true);
  });
});

describe("disciplinas y aparatos", () => {
  it("cada aparato de una disciplina es un aparato conocido y GAF, GAM y rítmica no se mezclan", () => {
    for (const discipline of SKILL_DISCIPLINES) {
      for (const apparatus of SKILL_APPARATUS_BY_DISCIPLINE[discipline]) {
        expect(SKILL_APPARATUS).toContain(apparatus);
      }
    }
    expect(SKILL_APPARATUS_BY_DISCIPLINE.artistic_female).toHaveLength(4);
    expect(SKILL_APPARATUS_BY_DISCIPLINE.artistic_male).toHaveLength(6);
    expect(apparatusBelongsToDiscipline("artistic_female", "beam")).toBe(true);
    expect(apparatusBelongsToDiscipline("artistic_female", "rings")).toBe(false);
    expect(apparatusBelongsToDiscipline("artistic_male", "uneven_bars")).toBe(false);
    expect(apparatusBelongsToDiscipline("rhythmic", "ribbon")).toBe(true);
    expect(apparatusBelongsToDiscipline("rhythmic", "floor")).toBe(false);
  });

  it("sin aparato (general) vale para cualquier disciplina", () => {
    for (const discipline of SKILL_DISCIPLINES) {
      expect(apparatusBelongsToDiscipline(discipline, null)).toBe(true);
      expect(apparatusBelongsToDiscipline(discipline, undefined)).toBe(true);
    }
  });
});

describe("permisos", () => {
  it("las plantillas las gestionan dirección, administración y coordinación; el entrenador no", () => {
    expect(canManageTemplates("owner")).toBe(true);
    expect(canManageTemplates("admin")).toBe(true);
    expect(canManageTemplates("manager")).toBe(true);
    expect(canManageTemplates("coach")).toBe(false);
  });

  it("evalúan todos los roles del equipo técnico", () => {
    for (const role of ["owner", "admin", "manager", "coach"] as const) expect(canEvaluate(role)).toBe(true);
  });
});

describe("validación de órdenes", () => {
  const level = (overrides: Record<string, unknown> = {}) => ({
    name: "Nivel 1",
    elements: [{ name: "Rueda lateral", apparatus: "floor", required: true }],
    ...overrides,
  });

  it("crea una plantilla en blanco, desde un ejemplo o copiando otra, con el mismo identificador de petición", () => {
    const base = { ...scope, clientRequestId: guid(3) };
    expect(createTemplateCommandSchema.parse({ ...base, source: "blank", discipline: "rhythmic", name: "  Base   GR " })).toMatchObject({
      source: "blank",
      name: "Base GR",
    });
    expect(createTemplateCommandSchema.parse({ ...base, source: "starter", starterKey: "gaf_progresion_general" }).source).toBe("starter");
    expect(createTemplateCommandSchema.parse({ ...base, source: "copy", templateId: guid(4), name: "Copia" }).source).toBe("copy");
    expect(createTemplateCommandSchema.safeParse({ ...base, source: "blank", discipline: "gaf", name: "x" }).success).toBe(false);
    expect(createTemplateCommandSchema.safeParse({ ...base, source: "blank", discipline: "rhythmic", name: "A" }).success).toBe(false);
    expect(createTemplateCommandSchema.safeParse({ ...base, source: "other" }).success).toBe(false);
    expect(createTemplateCommandSchema.safeParse({ ...base, source: "copy", templateId: "no-es-un-id", name: "Copia" }).success).toBe(false);
  });

  it("rechaza saltos de línea y nombres vacíos o demasiado largos", () => {
    const base = { ...scope, clientRequestId: guid(3), source: "blank", discipline: "artistic_female" };
    expect(createTemplateCommandSchema.safeParse({ ...base, name: "Línea\nnueva" }).success).toBe(false);
    expect(createTemplateCommandSchema.safeParse({ ...base, name: "x".repeat(81) }).success).toBe(false);
    expect(createTemplateCommandSchema.safeParse({ ...base, name: "x".repeat(80) }).success).toBe(true);
  });

  it("guarda una estructura con orden, aparatos opcionales y obligatorio por defecto", () => {
    const parsed = saveTemplateCommandSchema.parse({
      ...scope,
      expectedRevision: 3,
      name: "Base 2",
      levels: [level({ elements: [{ name: "Rueda lateral" }, { name: "Voltereta", apparatus: null, required: false }] })],
    });
    expect(parsed.archived).toBe(false);
    expect(parsed.levels[0]!.elements[0]).toMatchObject({ required: true });
    expect(parsed.levels[0]!.elements[1]).toMatchObject({ required: false, apparatus: null });
  });

  it("exige al menos un nivel, una revisión válida y rechaza campos desconocidos", () => {
    const base = { ...scope, expectedRevision: 1, name: "Base" };
    expect(saveTemplateCommandSchema.safeParse({ ...base, levels: [] }).success).toBe(false);
    expect(saveTemplateCommandSchema.safeParse({ ...base, expectedRevision: 0, levels: [level()] }).success).toBe(false);
    expect(saveTemplateCommandSchema.safeParse({ ...base, levels: [level()], extra: true }).success).toBe(false);
    expect(saveTemplateCommandSchema.safeParse({ ...base, levels: [level({ elements: [{ name: "x", apparatus: "trampoline" }] })] }).success).toBe(false);
  });

  it("rechaza ids repetidos y más de 300 elementos por plantilla", () => {
    const repeated = saveTemplateCommandSchema.safeParse({
      ...scope,
      expectedRevision: 1,
      name: "Base",
      levels: [level({ id: guid(10) }), level({ id: guid(10) })],
    });
    expect(repeated.success).toBe(false);
    const many = Array.from({ length: 40 }, (_, index) => ({ name: `Elemento ${index + 10}` }));
    const tooMany = saveTemplateCommandSchema.safeParse({
      ...scope,
      expectedRevision: 1,
      name: "Base",
      levels: Array.from({ length: 8 }, (_, index) => level({ name: `Nivel ${index + 1}`, elements: many })),
    });
    expect(tooMany.success).toBe(false);
  });

  it("evalúa gimnastas por elementos: topes, repetidos y fecha solo con «conseguido»", () => {
    const base = {
      ...scope,
      clientRequestId: guid(3),
      templateId: guid(4),
      athleteIds: [guid(5), guid(6)],
      elementIds: [guid(7)],
      status: "achieved",
    };
    expect(evaluateSkillsCommandSchema.safeParse(base).success).toBe(true);
    expect(evaluateSkillsCommandSchema.safeParse({ ...base, achievedOn: "2026-11-10" }).success).toBe(true);
    expect(evaluateSkillsCommandSchema.safeParse({ ...base, status: "in_progress", achievedOn: "2026-11-10" }).success).toBe(false);
    expect(evaluateSkillsCommandSchema.safeParse({ ...base, achievedOn: "2026-02-30" }).success).toBe(false);
    expect(evaluateSkillsCommandSchema.safeParse({ ...base, athleteIds: [] }).success).toBe(false);
    expect(evaluateSkillsCommandSchema.safeParse({ ...base, athleteIds: [guid(5), guid(5)] }).success).toBe(false);
    expect(evaluateSkillsCommandSchema.safeParse({ ...base, elementIds: [guid(7), guid(7)] }).success).toBe(false);
    expect(evaluateSkillsCommandSchema.safeParse({ ...base, status: "perfect" }).success).toBe(false);
    // 60 x 40 supera el tope de 400 marcas por envío.
    const athletes = Array.from({ length: 60 }, (_, index) => guid(100 + index));
    const elements = Array.from({ length: 40 }, (_, index) => guid(200 + index));
    expect(MAX_EVALUATION_CELLS).toBe(400);
    expect(evaluateSkillsCommandSchema.safeParse({ ...base, athleteIds: athletes, elementIds: elements }).success).toBe(false);
    expect(evaluateSkillsCommandSchema.safeParse({ ...base, athleteIds: athletes.slice(0, 10), elementIds: elements }).success).toBe(true);
  });

  it("el paso de nivel pide plantilla y nivel, y admite una fecha opcional", () => {
    const base = { ...scope, clientRequestId: guid(3), templateId: guid(4), levelId: guid(5) };
    expect(passLevelCommandSchema.safeParse(base).success).toBe(true);
    expect(passLevelCommandSchema.safeParse({ ...base, passedOn: "2026-11-14" }).success).toBe(true);
    expect(passLevelCommandSchema.safeParse({ ...base, passedOn: "14/11/2026" }).success).toBe(false);
    expect(passLevelCommandSchema.safeParse({ ...base, levelId: undefined }).success).toBe(false);
  });
});

describe("plantillas de ejemplo", () => {
  it("hay una por disciplina, con cuatro niveles y claves únicas", () => {
    expect(STARTER_TEMPLATES.map((template) => template.discipline).sort()).toEqual([...SKILL_DISCIPLINES].sort());
    expect(new Set(STARTER_TEMPLATES.map((template) => template.key)).size).toBe(STARTER_TEMPLATES.length);
    for (const template of STARTER_TEMPLATES) expect(template.levels, template.key).toHaveLength(4);
  });

  it("todas superan la validación de guardado, con aparatos de su disciplina y obligatorios en cada nivel", () => {
    for (const template of STARTER_TEMPLATES) {
      const result = saveTemplateCommandSchema.safeParse({
        ...scope,
        expectedRevision: 1,
        name: template.name,
        description: template.description,
        levels: template.levels.map((level) => ({
          name: level.name,
          description: level.description ?? null,
          elements: level.elements.map((element) => ({
            name: element.name,
            apparatus: element.apparatus,
            required: element.required ?? true,
          })),
        })),
      });
      expect(result.success, template.key).toBe(true);
      for (const level of template.levels) {
        expect(level.elements.some((element) => element.required !== false), `${template.key}/${level.name}`).toBe(true);
        for (const element of level.elements) {
          expect(apparatusBelongsToDiscipline(template.discipline, element.apparatus), `${template.key}: ${element.name}`).toBe(true);
        }
      }
    }
  });

  it("se declaran orientativas y no citan ni reproducen a ninguna federación", () => {
    for (const template of STARTER_TEMPLATES) {
      expect(template.description, template.key).toContain(STARTER_TEMPLATE_NOTICE);
      // El aviso nombra «federación» para negarla; el resto del contenido no la cita.
      const text = JSON.stringify(template).replace(STARTER_TEMPLATE_NOTICE, "");
      expect(text, template.key).not.toMatch(/\b(?:RFEG|FMG|FIG|CSD)\b/);
      expect(text, template.key).not.toMatch(/federaci[oó]n|reglamento oficial|código de puntuaci[oó]n/i);
    }
    expect(STARTER_TEMPLATE_NOTICE).toMatch(/orientativa/i);
    expect(STARTER_TEMPLATE_NOTICE).toMatch(/ninguna federación/i);
  });

  it("se encuentran por clave y su resumen cuenta niveles y elementos", () => {
    expect(findStarterTemplate("no_existe")).toBeNull();
    const gaf = findStarterTemplate("gaf_progresion_general")!;
    const summary = starterTemplateSummaries().find((entry) => entry.key === gaf.key)!;
    expect(summary.levelCount).toBe(gaf.levels.length);
    expect(summary.elementCount).toBe(gaf.levels.reduce((sum, level) => sum + level.elements.length, 0));
  });
});

describe("cálculos de progreso", () => {
  const level = (id: string, position: number, elements: Array<[string, boolean]>) => ({
    id,
    position,
    elements: elements.map(([elementId, required]) => ({ id: elementId, required })),
  });
  const statuses = (entries: Record<string, ElementStatus>) => new Map(Object.entries(entries));

  it("un nivel está completo cuando todos sus obligatorios están conseguidos; los opcionales no cuentan", () => {
    const base = level("l1", 1, [
      ["e1", true],
      ["e2", true],
      ["e3", false],
    ]);
    const none = computeLevelCompletion(base, statuses({}));
    expect(none).toMatchObject({ requiredElements: 2, achievedRequired: 0, percent: 0, complete: false });
    const half = computeLevelCompletion(base, statuses({ e1: "achieved", e2: "in_progress", e3: "achieved" }));
    expect(half).toMatchObject({ achievedRequired: 1, inProgressRequired: 1, achievedOptional: 1, percent: 50, complete: false });
    const done = computeLevelCompletion(base, statuses({ e1: "achieved", e2: "achieved" }));
    expect(done).toMatchObject({ percent: 100, complete: true });
  });

  it("un nivel sin obligatorios nunca está completo y su porcentaje es 0", () => {
    const optionalOnly = level("l1", 1, [["e1", false]]);
    expect(computeLevelCompletion(optionalOnly, statuses({ e1: "achieved" }))).toMatchObject({
      requiredElements: 0,
      percent: 0,
      complete: false,
    });
    expect(computeLevelCompletion(level("l2", 2, []), statuses({}))).toMatchObject({ totalElements: 0, complete: false });
  });

  it("redondea el porcentaje al entero más cercano", () => {
    const three = level("l1", 1, [
      ["e1", true],
      ["e2", true],
      ["e3", true],
    ]);
    expect(computeLevelCompletion(three, statuses({ e1: "achieved" })).percent).toBe(33);
    expect(computeLevelCompletion(three, statuses({ e1: "achieved", e2: "achieved" })).percent).toBe(67);
  });

  const levels = [
    level("l2", 2, [["b1", true]]),
    level("l1", 1, [
      ["a1", true],
      ["a2", true],
    ]),
    level("l3", 3, [["c1", true]]),
  ];

  it("el nivel actual es el primero, por posición, sin paso de nivel registrado", () => {
    const fresh = computeTrackState({ levels, progress: statuses({}), passedLevelIds: [] });
    expect(fresh.currentLevelId).toBe("l1");
    expect(fresh.levels.map((entry) => entry.levelId)).toEqual(["l1", "l2", "l3"]);
    expect(fresh).toMatchObject({ finished: false, readyToPass: false, overallPercent: 0 });

    const afterOne = computeTrackState({ levels, progress: statuses({ b1: "achieved" }), passedLevelIds: ["l1"] });
    expect(afterOne.currentLevelId).toBe("l2");
    expect(afterOne.readyToPass).toBe(true);
    expect(afterOne.passedLevelIds).toEqual(["l1"]);
  });

  it("avisa de «listo para pasar» solo cuando el nivel actual está completo", () => {
    const almost = computeTrackState({ levels, progress: statuses({ a1: "achieved" }), passedLevelIds: [] });
    expect(almost.readyToPass).toBe(false);
    const ready = computeTrackState({ levels, progress: statuses({ a1: "achieved", a2: "achieved" }), passedLevelIds: [] });
    expect(ready).toMatchObject({ currentLevelId: "l1", readyToPass: true });
    // Completar un nivel posterior no adelanta el actual.
    const jumped = computeTrackState({ levels, progress: statuses({ b1: "achieved" }), passedLevelIds: [] });
    expect(jumped).toMatchObject({ currentLevelId: "l1", readyToPass: false });
  });

  it("el progreso global suma niveles superados y el avance del actual", () => {
    const state = computeTrackState({
      levels,
      progress: statuses({ b1: "achieved" }),
      passedLevelIds: ["l1"],
    });
    // 1 superado + nivel actual al 100 % sobre 3 niveles = 67 %.
    expect(state.overallPercent).toBe(67);
    const finished = computeTrackState({ levels, progress: statuses({}), passedLevelIds: ["l1", "l2", "l3"] });
    expect(finished).toMatchObject({ finished: true, currentLevelId: null, overallPercent: 100, readyToPass: false });
  });

  it("una plantilla sin niveles no está terminada ni tiene progreso", () => {
    expect(computeTrackState({ levels: [], progress: statuses({}), passedLevelIds: [] })).toMatchObject({
      finished: false,
      currentLevelId: null,
      overallPercent: 0,
    });
  });

  it("el paso de nivel exige orden, obligatorios conseguidos y que no esté ya superado", () => {
    const progress = statuses({ a1: "achieved", a2: "achieved", b1: "achieved" });
    expect(checkLevelPass({ levels, progress, passedLevelIds: [], levelId: "l1" })).toEqual({ ok: true });
    expect(checkLevelPass({ levels, progress, passedLevelIds: [], levelId: "l2" })).toEqual({ ok: false, reason: "not_current" });
    expect(checkLevelPass({ levels, progress, passedLevelIds: ["l1"], levelId: "l1" })).toEqual({ ok: false, reason: "already_passed" });
    expect(checkLevelPass({ levels, progress, passedLevelIds: ["l1"], levelId: "l2" })).toEqual({ ok: true });
    expect(checkLevelPass({ levels, progress, passedLevelIds: [], levelId: "zzz" })).toEqual({ ok: false, reason: "unknown_level" });
    expect(
      checkLevelPass({ levels, progress: statuses({ a1: "achieved", a2: "in_progress" }), passedLevelIds: [], levelId: "l1" })
    ).toEqual({ ok: false, reason: "incomplete" });
  });

  it("un nivel sin obligatorios no se puede pasar", () => {
    const optional = [level("l1", 1, [["a1", false]])];
    expect(checkLevelPass({ levels: optional, progress: statuses({ a1: "achieved" }), passedLevelIds: [], levelId: "l1" })).toEqual({
      ok: false,
      reason: "no_required_elements",
    });
  });

  it("resume por aparato, con «general» para lo que no tiene, y en un orden estable", () => {
    const summary = summarizeByApparatus(
      [
        { id: "e1", apparatus: "beam" },
        { id: "e2", apparatus: "beam" },
        { id: "e3", apparatus: "floor" },
        { id: "e4", apparatus: null },
      ],
      statuses({ e1: "achieved", e2: "in_progress", e3: "achieved" })
    );
    expect(summary.find((entry) => entry.apparatus === "beam")).toMatchObject({ total: 2, achieved: 1, inProgress: 1, percent: 50 });
    expect(summary.find((entry) => entry.apparatus === "floor")).toMatchObject({ total: 1, achieved: 1, percent: 100 });
    expect(summary.find((entry) => entry.apparatus === null)).toMatchObject({ total: 1, achieved: 0, percent: 0 });
    // «General» va primero; luego, el orden del catálogo de aparatos (barra antes que suelo).
    expect(summary.map((entry) => entry.apparatus)).toEqual([null, "beam", "floor"]);
  });
});

describe("vista de progreso de una gimnasta", () => {
  const levels: TemplateLevelView[] = [
    {
      id: "l1",
      position: 1,
      name: "Iniciación",
      description: null,
      elements: [
        { id: "e1", name: "Voltereta", apparatus: "floor", description: null, required: true },
        { id: "e2", name: "Equilibrio", apparatus: "beam", description: null, required: true },
      ],
    },
    {
      id: "l2",
      position: 2,
      name: "Nivel 1",
      description: null,
      elements: [{ id: "e3", name: "Rueda", apparatus: "floor", description: null, required: true }],
    },
  ];
  const entry = (status: ElementStatus, achievedOn: string | null = null): ProgressEntry => ({
    status,
    achievedOn,
    evaluatedByName: "Marta",
    evaluatedAt: "2026-11-14T10:00:00.000Z",
  });
  const template = { id: "t1", name: "Base GAF", discipline: "artistic_female" as const, description: null, archived: false };

  it("marca el nivel actual, el estado de cada elemento y «listo para pasar»", () => {
    const view = buildTemplateProgress({
      template,
      levels,
      progress: new Map([
        ["e1", entry("achieved", "2026-11-10")],
        ["e2", entry("achieved", "2026-11-12")],
      ]),
      passes: [],
    });
    expect(view.currentLevelId).toBe("l1");
    expect(view.readyToPass).toBe(true);
    expect(view.levels[0]).toMatchObject({ current: true, passed: null });
    expect(view.levels[0]!.completion.percent).toBe(100);
    expect(view.levels[0]!.elements[0]!.state).toMatchObject({ status: "achieved", achievedOn: "2026-11-10" });
    expect(view.levels[1]!.elements[0]!.state.status).toBe("not_started");
    expect(view.levels[1]!.current).toBe(false);
    expect(view.overallPercent).toBe(50);
  });

  it("tras el paso de nivel, el nivel queda superado con su fecha y el actual avanza", () => {
    const pass: LevelPassView = {
      id: "p1",
      levelId: "l1",
      levelName: "Iniciación",
      levelPosition: 1,
      passedOn: "2026-11-13",
      passedByName: null,
    };
    const view = buildTemplateProgress({ template, levels, progress: new Map(), passes: [pass] });
    expect(view.levels[0]!.passed).toEqual(pass);
    expect(view.currentLevelId).toBe("l2");
    expect(view.levels[1]!.current).toBe(true);
    expect(view.finished).toBe(false);
    const done = buildTemplateProgress({
      template,
      levels,
      progress: new Map(),
      passes: [pass, { ...pass, id: "p2", levelId: "l2", levelName: "Nivel 1", levelPosition: 2 }],
    });
    expect(done).toMatchObject({ finished: true, currentLevelId: null, overallPercent: 100 });
  });
});

describe("fechas", () => {
  it("la fecha civil depende de la zona horaria de la sede", () => {
    const instant = new Date("2026-11-14T23:30:00.000Z");
    expect(localDateInTimeZone(instant, "Europe/Madrid")).toBe("2026-11-15");
    expect(localDateInTimeZone(instant, "America/Mexico_City")).toBe("2026-11-14");
    expect(localDateInTimeZone(instant, "Zona/Inventada")).toBe("2026-11-15");
    expect(localDateInTimeZone(instant, null)).toBe("2026-11-15");
  });

  it("la fecha del diploma sale en español", () => {
    expect(formatDiplomaDate("2026-11-14")).toBe("14 de noviembre de 2026");
    expect(formatDiplomaDate("2027-01-05")).toBe("5 de enero de 2027");
    expect(formatDiplomaDate("no-es-fecha")).toBe("no-es-fecha");
  });
});

import { describe, expect, it } from "vitest";

import { SPORT_CONFIG_SEEDS } from "@/lib/sport-config/catalog";
import {
  APPARATUS_BY_DISCIPLINE as PROGRESS_APPARATUS_BY_DISCIPLINE,
  DISCIPLINES as PROGRESS_DISCIPLINES,
} from "@/modules/athlete-progress/domain/athlete-progress";
import {
  PLAN_APPARATUS,
  PLAN_APPARATUS_BY_DISCIPLINE,
  PLAN_DISCIPLINES,
} from "@/modules/session-plans/domain/session-plan";
import {
  type CanonicalDiscipline,
  DISCIPLINE_EQUIVALENCES,
  fromAthleteProgressDiscipline,
  fromCatalogTsApparatus,
  fromSessionPlanApparatus,
  fromSessionPlanDiscipline,
  fromSportProfileDiscipline,
  toAthleteProgressDiscipline,
  toCatalogTsApparatus,
  toSessionPlanApparatus,
  toSessionPlanDiscipline,
  toSportProfileDiscipline,
} from "@/modules/shared/domain/discipline-keys";
import {
  SKILL_APPARATUS,
  SKILL_APPARATUS_BY_DISCIPLINE,
  SKILL_DISCIPLINES,
} from "@/modules/skill-levels/domain/skill-levels";

/**
 * ADR-0029 §5: una sola tabla de equivalencias de disciplina y aparato.
 * Cada fila del ADR se comprueba de ida y vuelta, y las claves reales de
 * skill-levels, session-plans, athlete-progress y catalog.ts se convierten
 * todas sin perder ninguna.
 */

const UNKNOWN_KEYS = ["", "xx", "GAF", "Artistic", "constructor", "toString", "__proto__", "hasOwnProperty"];

describe("tabla de disciplinas del ADR-0029 §5", () => {
  const rows: Array<{
    canonical: CanonicalDiscipline;
    sportProfile: "artistic" | "rhythmic";
    branch: "female" | "male" | null;
    sessionPlan: "gaf" | "gam" | "gr";
    athleteProgress: "gaf" | "gam" | null;
  }> = [
    { canonical: "artistic_female", sportProfile: "artistic", branch: "female", sessionPlan: "gaf", athleteProgress: "gaf" },
    { canonical: "artistic_male", sportProfile: "artistic", branch: "male", sessionPlan: "gam", athleteProgress: "gam" },
    { canonical: "rhythmic", sportProfile: "rhythmic", branch: null, sessionPlan: "gr", athleteProgress: null },
  ];

  it.each(rows)("$canonical: ida y vuelta en cada borde", (row) => {
    expect(toSportProfileDiscipline(row.canonical)).toBe(row.sportProfile);
    expect(fromSportProfileDiscipline(row.sportProfile, row.branch)).toBe(row.canonical);

    expect(toSessionPlanDiscipline(row.canonical)).toBe(row.sessionPlan);
    expect(fromSessionPlanDiscipline(row.sessionPlan)).toBe(row.canonical);

    expect(toAthleteProgressDiscipline(row.canonical)).toBe(row.athleteProgress);
    if (row.athleteProgress !== null) {
      expect(fromAthleteProgressDiscipline(row.athleteProgress)).toBe(row.canonical);
    }
  });

  it("cubre exactamente las disciplinas de skill-levels", () => {
    expect(Object.keys(DISCIPLINE_EQUIVALENCES).sort()).toEqual([...SKILL_DISCIPLINES].sort());
    expect(rows.map((row) => row.canonical).sort()).toEqual([...SKILL_DISCIPLINES].sort());
  });

  it("artistic sin rama no tiene respuesta", () => {
    expect(fromSportProfileDiscipline("artistic")).toBeNull();
    expect(fromSportProfileDiscipline("artistic", null)).toBeNull();
    expect(fromSportProfileDiscipline("artistic", undefined)).toBeNull();
  });

  it("rítmica no depende de la rama", () => {
    expect(fromSportProfileDiscipline("rhythmic")).toBe("rhythmic");
    expect(fromSportProfileDiscipline("rhythmic", "female")).toBe("rhythmic");
  });

  it("athlete-progress no admite rítmica", () => {
    expect(toAthleteProgressDiscipline("rhythmic")).toBeNull();
    expect(fromAthleteProgressDiscipline("gr")).toBeNull();
  });

  it("una clave desconocida devuelve null sin lanzar", () => {
    for (const key of UNKNOWN_KEYS) {
      expect(fromSportProfileDiscipline(key, "female")).toBeNull();
      expect(fromSessionPlanDiscipline(key)).toBeNull();
      expect(fromAthleteProgressDiscipline(key)).toBeNull();
    }
    expect(fromSessionPlanDiscipline("xx")).toBeNull();
    expect(fromSportProfileDiscipline("general", "female")).toBeNull();
    // Las claves canónicas no son claves de session-plans ni de athlete-progress.
    expect(fromSessionPlanDiscipline("artistic_female")).toBeNull();
    expect(fromAthleteProgressDiscipline("rhythmic")).toBeNull();
  });
});

describe("tabla de aparatos del ADR-0029 §5", () => {
  const catalogRows: Array<[canonical: string, catalogTs: string]> = [
    ["vault", "vt"],
    ["uneven_bars", "ub"],
    ["beam", "bb"],
    ["floor", "fx"],
    ["pommel_horse", "ph"],
    ["rings", "sr"],
    ["parallel_bars", "pb"],
    ["high_bar", "hb"],
    ["body", "free_hands"],
    ["rope", "rope"],
    ["hoop", "hoop"],
    ["ball", "ball"],
    ["clubs", "clubs"],
    ["ribbon", "ribbon"],
  ];

  it.each(catalogRows)("%s ↔ %s en catalog.ts", (canonical, catalogTs) => {
    expect(toCatalogTsApparatus(canonical)).toBe(catalogTs);
    expect(fromCatalogTsApparatus(catalogTs)).toBe(canonical);
  });

  it("manos libres es body ↔ freehand en session-plans", () => {
    expect(toSessionPlanApparatus("body")).toBe("freehand");
    expect(fromSessionPlanApparatus("freehand")).toBe("body");
    expect(toSessionPlanApparatus("freehand")).toBeNull();
    expect(fromSessionPlanApparatus("body")).toBeNull();
  });

  it("el resto de aparatos se llama igual en session-plans", () => {
    for (const apparatus of SKILL_APPARATUS) {
      if (apparatus === "body") continue;
      expect(toSessionPlanApparatus(apparatus)).toBe(apparatus);
      expect(fromSessionPlanApparatus(apparatus)).toBe(apparatus);
    }
  });

  it("cubre exactamente los aparatos de skill-levels", () => {
    expect(catalogRows.map(([canonical]) => canonical).sort()).toEqual([...SKILL_APPARATUS].sort());
    for (const apparatus of SKILL_APPARATUS) {
      expect(toCatalogTsApparatus(apparatus)).not.toBeNull();
      expect(toSessionPlanApparatus(apparatus)).not.toBeNull();
    }
  });

  it("un aparato desconocido devuelve null sin lanzar", () => {
    for (const key of [...UNKNOWN_KEYS, "VT", "Vault"]) {
      expect(toSessionPlanApparatus(key)).toBeNull();
      expect(fromSessionPlanApparatus(key)).toBeNull();
      expect(toCatalogTsApparatus(key)).toBeNull();
      expect(fromCatalogTsApparatus(key)).toBeNull();
    }
    expect(toCatalogTsApparatus("vt")).toBeNull();
    expect(fromCatalogTsApparatus("vault")).toBeNull();
  });
});

describe("las claves reales de cada módulo se convierten sin null", () => {
  it("skill-levels → session-plans: disciplina y aparatos de cada disciplina", () => {
    for (const discipline of SKILL_DISCIPLINES) {
      const planDiscipline = toSessionPlanDiscipline(discipline);
      expect(PLAN_DISCIPLINES).toContain(planDiscipline);
      const planApparatus = (SKILL_APPARATUS_BY_DISCIPLINE[discipline] as readonly string[]).map((a) =>
        toSessionPlanApparatus(a)
      );
      expect(planApparatus).not.toContain(null);
      expect(planApparatus).toEqual([...PLAN_APPARATUS_BY_DISCIPLINE[planDiscipline]]);
    }
  });

  it("session-plans → skill-levels: disciplinas y todos los aparatos", () => {
    for (const planDiscipline of PLAN_DISCIPLINES) {
      const discipline = fromSessionPlanDiscipline(planDiscipline);
      expect(discipline).not.toBeNull();
      if (discipline === null) continue;
      const apparatus = (PLAN_APPARATUS_BY_DISCIPLINE[planDiscipline] as readonly string[]).map((a) =>
        fromSessionPlanApparatus(a)
      );
      expect(apparatus).toEqual([...SKILL_APPARATUS_BY_DISCIPLINE[discipline]]);
    }
    for (const apparatus of PLAN_APPARATUS) {
      expect(fromSessionPlanApparatus(apparatus)).not.toBeNull();
    }
  });

  it("athlete-progress → skill-levels: GAF y GAM con los mismos aparatos", () => {
    for (const progressDiscipline of PROGRESS_DISCIPLINES) {
      const discipline = fromAthleteProgressDiscipline(progressDiscipline);
      expect(discipline).not.toBeNull();
      if (discipline === null) continue;
      expect(toAthleteProgressDiscipline(discipline)).toBe(progressDiscipline);
      expect([...PROGRESS_APPARATUS_BY_DISCIPLINE[progressDiscipline]]).toEqual([
        ...SKILL_APPARATUS_BY_DISCIPLINE[discipline],
      ]);
    }
  });

  it("catalog.ts → skill-levels: disciplina, rama y aparatos de cada configuración", () => {
    const gymnasticsSeeds = SPORT_CONFIG_SEEDS.filter((seed) => seed.defaultDisciplineVariant !== "general");
    expect(gymnasticsSeeds.length).toBeGreaterThan(0);
    for (const seed of gymnasticsSeeds) {
      const branch = seed.branch.code === "female" || seed.branch.code === "male" ? seed.branch.code : null;
      const discipline = fromSportProfileDiscipline(seed.discipline.code, branch);
      expect(discipline, seed.code).toBe(seed.defaultDisciplineVariant);
      if (discipline === null) continue;
      const allowed: readonly string[] = SKILL_APPARATUS_BY_DISCIPLINE[discipline];
      for (const { code } of seed.evaluation.apparatus) {
        const apparatus = fromCatalogTsApparatus(code);
        expect(apparatus, `${seed.code} ${code}`).not.toBeNull();
        expect(allowed, `${seed.code} ${code}`).toContain(apparatus);
      }
    }
  });
});

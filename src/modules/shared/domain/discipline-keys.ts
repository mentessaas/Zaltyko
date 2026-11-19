import type { SkillApparatus, SkillDiscipline } from "@/modules/skill-levels/domain/skill-levels";

/**
 * Una sola tabla de equivalencias de disciplina y aparato (ADR-0029 §5).
 * La clave canónica es la de `skill-levels`; ninguna columna con datos se
 * renombra y este módulo convierte en los bordes. Dominio puro: sin base de
 * datos ni capa de aplicación.
 *
 * Toda clave desconocida devuelve `null`, nunca una excepción. `null` también
 * significa «sin respuesta» (`rhythmic` hacia `athlete-progress`, o `artistic`
 * sin rama): el llamador no enlaza ni supone, y la pantalla pide elegir.
 */

export type CanonicalDiscipline = SkillDiscipline;

export type SportProfileDiscipline = "artistic" | "rhythmic";
export type SportProfileBranch = "female" | "male";
export type SessionPlanDisciplineKey = "gaf" | "gam" | "gr";
export type AthleteProgressDisciplineKey = "gaf" | "gam";

type DisciplineRow = {
  sportProfile: SportProfileDiscipline;
  branch: SportProfileBranch | null;
  sessionPlan: SessionPlanDisciplineKey;
  athleteProgress: AthleteProgressDisciplineKey | null;
};

/** Filas GAF, GAM y GR de la tabla del ADR-0029 §5. */
export const DISCIPLINE_EQUIVALENCES = {
  artistic_female: { sportProfile: "artistic", branch: "female", sessionPlan: "gaf", athleteProgress: "gaf" },
  artistic_male: { sportProfile: "artistic", branch: "male", sessionPlan: "gam", athleteProgress: "gam" },
  rhythmic: { sportProfile: "rhythmic", branch: null, sessionPlan: "gr", athleteProgress: null },
} as const satisfies Record<CanonicalDiscipline, DisciplineRow>;

const CANONICAL_DISCIPLINES = Object.keys(DISCIPLINE_EQUIVALENCES) as CanonicalDiscipline[];

function lookup<V>(map: ReadonlyMap<string, V>, key: unknown): V | null {
  return typeof key === "string" ? (map.get(key) ?? null) : null;
}

function invert<K extends string, V extends string>(entries: ReadonlyArray<readonly [K, V | null]>) {
  const inverse = new Map<string, K>();
  for (const [from, to] of entries) if (to !== null) inverse.set(to, from);
  return inverse;
}

const FROM_SESSION_PLAN = invert(CANONICAL_DISCIPLINES.map((d) => [d, DISCIPLINE_EQUIVALENCES[d].sessionPlan] as const));
const FROM_ATHLETE_PROGRESS = invert(
  CANONICAL_DISCIPLINES.map((d) => [d, DISCIPLINE_EQUIVALENCES[d].athleteProgress] as const)
);

/* ------------------------------------------------------------------------ */
/* Disciplina                                                                */
/* ------------------------------------------------------------------------ */

/** Total: toda disciplina canónica tiene su clave de `sport_profiles`. */
export function toSportProfileDiscipline(d: CanonicalDiscipline): SportProfileDiscipline {
  return DISCIPLINE_EQUIVALENCES[d].sportProfile;
}

/**
 * Parcial: ni el perfil ni `organization_sports` guardan la rama, así que
 * `artistic` necesita la rama del propio objeto; sin ella devuelve `null`.
 */
export function fromSportProfileDiscipline(
  key: string,
  branch?: SportProfileBranch | null
): CanonicalDiscipline | null {
  const match = CANONICAL_DISCIPLINES.find((d) => {
    const row: DisciplineRow = DISCIPLINE_EQUIVALENCES[d];
    return row.sportProfile === key && (row.branch === null || row.branch === branch);
  });
  return match ?? null;
}

/** Total, como hacia `sport_profiles`. */
export function toSessionPlanDiscipline(d: CanonicalDiscipline): SessionPlanDisciplineKey {
  return DISCIPLINE_EQUIVALENCES[d].sessionPlan;
}

export function fromSessionPlanDiscipline(key: string): CanonicalDiscipline | null {
  return lookup(FROM_SESSION_PLAN, key);
}

/** `rhythmic` → `null`: `athlete-progress` no admite rítmica. */
export function toAthleteProgressDiscipline(d: CanonicalDiscipline): AthleteProgressDisciplineKey | null {
  return DISCIPLINE_EQUIVALENCES[d].athleteProgress;
}

export function fromAthleteProgressDiscipline(key: string): CanonicalDiscipline | null {
  return lookup(FROM_ATHLETE_PROGRESS, key);
}

/* ------------------------------------------------------------------------ */
/* Aparato                                                                   */
/* ------------------------------------------------------------------------ */

/**
 * Aparato canónico → `session-plans` y → códigos cortos de
 * `src/lib/sport-config/catalog.ts`. Manos libres es `body` / `freehand` /
 * `free_hands`; los aparatos de rítmica usan el mismo código en los tres.
 */
export const APPARATUS_EQUIVALENCES = {
  vault: { sessionPlan: "vault", catalogTs: "vt" },
  uneven_bars: { sessionPlan: "uneven_bars", catalogTs: "ub" },
  beam: { sessionPlan: "beam", catalogTs: "bb" },
  floor: { sessionPlan: "floor", catalogTs: "fx" },
  pommel_horse: { sessionPlan: "pommel_horse", catalogTs: "ph" },
  rings: { sessionPlan: "rings", catalogTs: "sr" },
  parallel_bars: { sessionPlan: "parallel_bars", catalogTs: "pb" },
  high_bar: { sessionPlan: "high_bar", catalogTs: "hb" },
  body: { sessionPlan: "freehand", catalogTs: "free_hands" },
  rope: { sessionPlan: "rope", catalogTs: "rope" },
  hoop: { sessionPlan: "hoop", catalogTs: "hoop" },
  ball: { sessionPlan: "ball", catalogTs: "ball" },
  clubs: { sessionPlan: "clubs", catalogTs: "clubs" },
  ribbon: { sessionPlan: "ribbon", catalogTs: "ribbon" },
} as const satisfies Record<SkillApparatus, { sessionPlan: string; catalogTs: string }>;

const CANONICAL_APPARATUS = Object.keys(APPARATUS_EQUIVALENCES) as SkillApparatus[];
const TO_SESSION_PLAN_APPARATUS = new Map<string, string>(
  CANONICAL_APPARATUS.map((a) => [a, APPARATUS_EQUIVALENCES[a].sessionPlan] as const)
);
const TO_CATALOG_TS_APPARATUS = new Map<string, string>(
  CANONICAL_APPARATUS.map((a) => [a, APPARATUS_EQUIVALENCES[a].catalogTs] as const)
);
const FROM_SESSION_PLAN_APPARATUS = invert(
  CANONICAL_APPARATUS.map((a) => [a, APPARATUS_EQUIVALENCES[a].sessionPlan] as const)
);
const FROM_CATALOG_TS_APPARATUS = invert(
  CANONICAL_APPARATUS.map((a) => [a, APPARATUS_EQUIVALENCES[a].catalogTs] as const)
);

export function toSessionPlanApparatus(a: string): string | null {
  return lookup(TO_SESSION_PLAN_APPARATUS, a);
}

export function fromSessionPlanApparatus(a: string): SkillApparatus | null {
  return lookup(FROM_SESSION_PLAN_APPARATUS, a);
}

export function toCatalogTsApparatus(a: string): string | null {
  return lookup(TO_CATALOG_TS_APPARATUS, a);
}

export function fromCatalogTsApparatus(a: string): SkillApparatus | null {
  return lookup(FROM_CATALOG_TS_APPARATUS, a);
}

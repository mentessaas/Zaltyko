import gaf from "../data/federation/rfeg-2026/gaf.json";
import gam from "../data/federation/rfeg-2026/gam.json";
import { SKILL_APPARATUS, type SkillApparatus, type SkillDiscipline } from "./skill-levels";

export type FederationTemplate = {
  key: string;
  discipline: SkillDiscipline;
  name: string;
  description: string;
  sourceTitle: string;
  sourceCheckedOn: string;
  sourceDocumentDate: string;
  levels: Array<{
    name: string;
    page: number;
    requirements: Array<{
      apparatus: SkillApparatus | null;
      sourceApparatus: string;
      page: number;
      fact: string;
      elementKey: string | null;
    }>;
  }>;
};

const knownApparatus = new Set<string>(SKILL_APPARATUS);

function normalize(data: typeof gaf, discipline: SkillDiscipline): FederationTemplate {
  return {
    key: data.key,
    discipline,
    name: `${discipline === "artistic_female" ? "GAF" : "GAM"} · RFEG Base 2026`,
    description: `${data.sourceDocument}; edición 2026. Importada como copia editable.`,
    sourceTitle: data.sourceDocument,
    sourceCheckedOn: data.consultedOn,
    sourceDocumentDate: data.documentDate,
    levels: data.levels.map((level) => ({
      name: level.name,
      page: level.page,
      requirements: level.requirements.map((requirement) => ({
        apparatus: requirement.apparatus && knownApparatus.has(requirement.apparatus)
          ? (requirement.apparatus as SkillApparatus)
          : null,
        sourceApparatus: requirement.sourceApparatus ?? "",
        page: requirement.page ?? level.page,
        fact: requirement.fact,
        elementKey: requirement.elementKey ?? null,
      })),
    })),
  };
}

export const RFEG_2026_FEDERATION_TEMPLATES: readonly FederationTemplate[] = [
  normalize(gaf as typeof gaf, "artistic_female"),
  normalize(gam as typeof gaf, "artistic_male"),
];

export function findFederationTemplate(key: string): FederationTemplate | null {
  return RFEG_2026_FEDERATION_TEMPLATES.find((template) => template.key === key) ?? null;
}

export function federationTemplateSummaries() {
  return RFEG_2026_FEDERATION_TEMPLATES.map(({ key, name, discipline, description, levels }) => ({
    key,
    name,
    discipline,
    description,
    levelCount: levels.length,
    elementCount: levels.reduce((count, level) => count + level.requirements.length, 0),
    sourceTitle: RFEG_2026_FEDERATION_TEMPLATES.find((template) => template.key === key)?.sourceTitle ?? "",
  }));
}

export function isValidFederationTemplate(template: FederationTemplate): boolean {
  return template.levels.length > 0 && template.levels.every((level) =>
    level.page > 0 && level.requirements.length > 0 && level.requirements.every((requirement) =>
      requirement.page > 0 && requirement.fact.length > 0 &&
      (!requirement.apparatus || knownApparatus.has(requirement.apparatus))
    )
  );
}

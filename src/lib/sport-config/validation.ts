type ProgramLike = { code: string };
type LevelLike = { code: string; programCode?: string | null };
type CategoryLike = { code: string };
type ApparatusLike = { code: string; name?: string | null; shortName?: string | null };

export interface SportConfigValidationShape {
  programs?: ProgramLike[];
  levels?: LevelLike[];
  categories?: CategoryLike[];
  apparatus?: ApparatusLike[];
  activeProgramCodes?: string[] | null;
  activeApparatusCodes?: string[] | null;
}

function codeSet(values?: string[] | null) {
  return new Set((values ?? []).filter(Boolean));
}

export function isProgramCodeAllowed(config: SportConfigValidationShape, programCode?: string | null) {
  if (!programCode) return true;
  if (config.programs) {
    return config.programs.some((program) => program.code === programCode);
  }
  const activeProgramCodes = codeSet(config.activeProgramCodes);
  return activeProgramCodes.size === 0 || activeProgramCodes.has(programCode);
}

export function isLevelCodeAllowed(
  config: SportConfigValidationShape,
  levelCode?: string | null,
  programCode?: string | null
) {
  if (!levelCode) return true;
  if (!config.levels) return true;
  return config.levels.some(
    (level) =>
      level.code === levelCode &&
      (!programCode || !level.programCode || level.programCode === programCode)
  );
}

export function isCategoryCodeAllowed(config: SportConfigValidationShape, categoryCode?: string | null) {
  if (!categoryCode) return true;
  if (!config.categories) return true;
  return config.categories.some((category) => category.code === categoryCode);
}

export function normalizeApparatusCodes(config: SportConfigValidationShape, apparatusValues?: string[] | null) {
  const requested = Array.from(new Set((apparatusValues ?? []).map((item) => item.trim()).filter(Boolean)));
  if (requested.length === 0) {
    return { ok: true as const, codes: null as string[] | null };
  }

  if (config.apparatus) {
    const codeByInput = new Map<string, string>();
    config.apparatus.forEach((item) => {
      codeByInput.set(item.code, item.code);
      if (item.name) codeByInput.set(item.name, item.code);
      if (item.shortName) codeByInput.set(item.shortName, item.code);
    });

    const converted = requested.map((item) => codeByInput.get(item) ?? item);
    const allowedCodes = new Set(config.apparatus.map((item) => item.code));
    const invalid = converted.filter((item) => !allowedCodes.has(item));
    if (invalid.length > 0) {
      return { ok: false as const, invalid };
    }
    return { ok: true as const, codes: Array.from(new Set(converted)) };
  }

  const activeApparatusCodes = codeSet(config.activeApparatusCodes);
  const invalid = requested.filter((item) => activeApparatusCodes.size > 0 && !activeApparatusCodes.has(item));
  if (invalid.length > 0) {
    return { ok: false as const, invalid };
  }

  return { ok: true as const, codes: requested };
}

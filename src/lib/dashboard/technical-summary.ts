export interface TechnicalSummarySourceItem {
  technicalFocus?: string | null;
  apparatus?: string[] | null;
  sessionBlocks?: string[] | null;
}

interface RankedSummaryItem {
  label: string;
  count: number;
}

export interface TechnicalDashboardSummary {
  groupsWithTechnicalFocus: number;
  classesWithTechnicalFocus: number;
  groupsWithApparatus: number;
  classesWithApparatus: number;
  topFocuses: RankedSummaryItem[];
  topApparatus: RankedSummaryItem[];
  topSessionBlocks: RankedSummaryItem[];
}

function rankItems(values: string[], limit = 4): RankedSummaryItem[] {
  const counts = new Map<string, number>();

  values.forEach((value) => {
    const normalized = value.trim();
    if (!normalized) return;
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  });

  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
}

export function summarizeTechnicalDashboard(params: {
  groups: TechnicalSummarySourceItem[];
  classes: TechnicalSummarySourceItem[];
  apparatusLabels?: Record<string, string>;
}): TechnicalDashboardSummary {
  const { groups, classes, apparatusLabels = {} } = params;
  const focusValues = [...groups, ...classes]
    .map((item) => item.technicalFocus?.trim())
    .filter((value): value is string => Boolean(value));
  const apparatusValues = [...groups, ...classes].flatMap((item) =>
    (item.apparatus ?? []).map((value) => apparatusLabels[value] || value)
  );
  const sessionBlockValues = groups.flatMap((item) => item.sessionBlocks ?? []);

  return {
    groupsWithTechnicalFocus: groups.filter((item) => Boolean(item.technicalFocus?.trim())).length,
    classesWithTechnicalFocus: classes.filter((item) => Boolean(item.technicalFocus?.trim())).length,
    groupsWithApparatus: groups.filter((item) => (item.apparatus?.length ?? 0) > 0).length,
    classesWithApparatus: classes.filter((item) => (item.apparatus?.length ?? 0) > 0).length,
    topFocuses: rankItems(focusValues),
    topApparatus: rankItems(apparatusValues),
    topSessionBlocks: rankItems(sessionBlockValues),
  };
}

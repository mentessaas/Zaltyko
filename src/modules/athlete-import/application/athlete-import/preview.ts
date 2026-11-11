/**
 * Turns the classified rows into the preview the Owner reviews.
 */
import type { AthleteImportMapping } from "../../domain/athlete-import-rows";
import type { ParsedImportFile } from "../athlete-import-file";
import type { AthleteImportPreview, Classified, ImportContext } from "./model";

/**
 * Preview of a file whose columns cannot be used yet: the problems, no rows.
 *
 * @internal Uso exclusivo de athlete-import/*; la API pública está en
 * athlete-import-service.ts.
 */
export function mappingOnlyPreview(
  file: ParsedImportFile,
  mapping: AthleteImportMapping,
  problems: string[],
  previewToken: string
): AthleteImportPreview {
  return {
    format: file.format,
    headers: file.headers,
    mapping,
    mappingProblems: problems,
    hiddenRows: file.hiddenRows,
    rows: [],
    summary: {
      total: file.rows.length,
      toCreate: 0,
      errors: 0,
      duplicates: 0,
      skipped: 0,
      withWarnings: 0,
      newFamilies: 0,
      newTutors: 0,
      groupMemberships: 0,
    },
    plan: { current: 0, limit: null, readOnly: false },
    canConfirm: false,
    previewToken,
  };
}

/**
 * @internal Uso exclusivo de athlete-import/*; la API pública está en
 * athlete-import-service.ts.
 */
export function buildPreview(
  file: ParsedImportFile,
  mapping: AthleteImportMapping,
  previewToken: string,
  classified: readonly Classified[],
  context: ImportContext
): AthleteImportPreview {
  const created = classified.flatMap((item) => (item.plan ? [item.plan] : []));
  const newFamilyKeys = new Set(created.filter((plan) => !plan.existingFamilyId).map((plan) => plan.newFamilyKey));
  const newTutorKeys = new Set(
    created.filter((plan) => !plan.existingFamilyId && plan.row.guardian).map((plan) => plan.newFamilyKey)
  );
  const statuses = classified.map((item) => item.preview.status);
  return {
    format: file.format,
    headers: file.headers,
    mapping,
    mappingProblems: [],
    hiddenRows: file.hiddenRows,
    rows: classified.map((item) => item.preview),
    summary: {
      total: classified.length,
      toCreate: created.length,
      errors: statuses.filter((status) => status === "error").length,
      duplicates: statuses.filter((status) => status === "duplicate").length,
      skipped: statuses.filter((status) => status === "skipped").length,
      withWarnings: classified.filter(
        (item) => item.preview.status === "create" && item.preview.issues.some((entry) => entry.severity === "warning")
      ).length,
      newFamilies: newFamilyKeys.size,
      newTutors: newTutorKeys.size,
      groupMemberships: created.filter((plan) => plan.group).length,
    },
    plan: context.usage,
    canConfirm: created.length > 0 && !context.usage.readOnly,
    previewToken,
  };
}

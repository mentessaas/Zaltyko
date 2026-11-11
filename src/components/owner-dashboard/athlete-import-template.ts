import {
  ATHLETE_IMPORT_FIELD_LABELS,
  ATHLETE_IMPORT_FIELDS,
} from "@/modules/athlete-import/domain/athlete-import-rows";

/**
 * Excel template: one sheet with the column titles only (no example row, so a
 * forgotten example is never imported). The spreadsheet library is loaded on
 * demand, only when the Owner asks for this template.
 */
export async function athleteImportTemplateXlsx(): Promise<Uint8Array> {
  const XLSX = await import("xlsx");
  const headers = ATHLETE_IMPORT_FIELDS.map((field) => ATHLETE_IMPORT_FIELD_LABELS[field]);
  const sheet = XLSX.utils.aoa_to_sheet([headers]);
  sheet["!cols"] = headers.map((header) => ({ wch: Math.max(14, header.length + 2) }));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Gimnastas");
  return new Uint8Array(XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
}

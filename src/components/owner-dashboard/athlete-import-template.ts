import {
  ATHLETE_IMPORT_FIELDS,
  ATHLETE_IMPORT_TEMPLATE_HEADERS,
} from "@/modules/athlete-import/domain/athlete-import-rows";

/** Rows prepared as text in the phone column, so Excel keeps the leading +. */
const TEXT_ROWS = 1000;

/**
 * Excel template: one sheet with the column titles only (no example row, so a
 * forgotten example is never imported). The spreadsheet library is loaded on
 * demand, only when the Owner asks for this template.
 */
export async function athleteImportTemplateXlsx(): Promise<Uint8Array<ArrayBuffer>> {
  const XLSX = await import("xlsx");
  const headers = ATHLETE_IMPORT_FIELDS.map((field) => ATHLETE_IMPORT_TEMPLATE_HEADERS[field]);
  const sheet = XLSX.utils.aoa_to_sheet([headers]);
  // Text format ("@") in the phone column: typed as +34600000000 it stays text
  // instead of becoming the number 34600000000.
  const phoneColumn = ATHLETE_IMPORT_FIELDS.indexOf("guardianPhone");
  for (let row = 1; row <= TEXT_ROWS; row += 1) {
    sheet[XLSX.utils.encode_cell({ r: row, c: phoneColumn })] = { t: "s", v: "", z: "@" };
  }
  sheet["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: TEXT_ROWS, c: headers.length - 1 } });
  sheet["!cols"] = headers.map((header) => ({ wch: Math.max(14, header.length + 2) }));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Gimnastas");
  return new Uint8Array(XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
}

/**
 * O4 · Plantilla Excel: los títulos con el formato de fecha y teléfono, la
 * columna del teléfono como texto y ninguna fila que se pueda importar.
 */
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";

import { athleteImportTemplateXlsx } from "@/components/owner-dashboard/athlete-import-template";
import { parseAthleteImportFile } from "@/modules/athlete-import/application/athlete-import-file";
import { OperationalError } from "@/modules/shared/domain/operational-error";

describe("plantilla Excel de la importación", () => {
  it("trae los títulos con el formato esperado y la columna del teléfono como texto", async () => {
    const bytes = await athleteImportTemplateXlsx();
    const book = XLSX.read(bytes, { type: "array", cellNF: true });
    const sheet = book.Sheets[book.SheetNames[0]!]!;
    const headers = (XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 })[0] ?? []).map(String);
    expect(headers).toEqual([
      "Nombre",
      "Apellidos",
      "Fecha de nacimiento (DD/MM/AAAA)",
      "Grupo",
      "Nombre del tutor",
      "Apellidos del tutor",
      "Email del tutor",
      "Teléfono del tutor (+34600000000, sin espacios)",
      "Parentesco",
    ]);
    expect((sheet.H2 as XLSX.CellObject | undefined)?.z).toBe("@");
  });

  it("vacía no importa nada", async () => {
    const bytes = await athleteImportTemplateXlsx();
    let reason: unknown;
    try {
      parseAthleteImportFile(bytes);
    } catch (error) {
      expect(error).toBeInstanceOf(OperationalError);
      reason = (error as OperationalError).details?.reason;
    }
    expect(reason).toBe("NO_ROWS");
  });
});

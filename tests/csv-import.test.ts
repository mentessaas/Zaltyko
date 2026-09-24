import { describe, expect, it } from "vitest";
import { parseAthleteCsv } from "@/components/onboarding/CsvImportDialog";

describe("parseAthleteCsv", () => {
  it("handles quoted commas, escaped quotes and CRLF", () => {
    expect(parseAthleteCsv(`Nombre,Grupo\r\n"Ana, María",Base\r\n"O'Neil"" Jr.",Avanzado`)).toEqual([
      ["Nombre", "Grupo"],
      ["Ana, María", "Base"],
      ["O'Neil\" Jr.", "Avanzado"],
    ]);
  });

  it("accepts semicolon-delimited spreadsheet exports", () => {
    expect(parseAthleteCsv("Nombre;Categoría\nLucía;Alevín")).toEqual([
      ["Nombre", "Categoría"],
      ["Lucía", "Alevín"],
    ]);
  });
});

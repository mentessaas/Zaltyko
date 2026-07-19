import { describe, expect, it } from "vitest";

import {
  DEFAULT_TERMINOLOGY,
  getTerminology,
  getTerminologyForSportConfig,
  getTerminologyTerm,
  getTerminologyWarnings,
  sanitizeTerminologyOverrides,
} from "@/lib/sport-config/terminology";

describe("sport config terminology", () => {
  it("falls back to the same base terminology used by real sport configs (never a divergent generic default)", () => {
    expect(getTerminology(null)).toMatchObject({
      athlete: "Gimnasta",
      group: "Grupo",
      apparatus: "Aparato",
    });
    expect(getTerminologyTerm(undefined, "athletes")).toBe(DEFAULT_TERMINOLOGY.athletes);
  });

  it("merges sport config terminology over defaults", () => {
    const terms = getTerminology({
      terminology: {
        athlete: "Gimnasta",
        group: "Grupo de entrenamiento",
        team: "Conjunto",
      },
    });

    expect(terms.athlete).toBe("Gimnasta");
    expect(terms.group).toBe("Grupo de entrenamiento");
    expect(terms.team).toBe("Conjunto");
    expect(terms.payment).toBe("Pago");
  });

  it("selects terminology by sport config id", () => {
    const terms = getTerminologyForSportConfig(
      [
        { id: "gaf", terminology: { athletes: "Gimnastas" } },
        { id: "rec", terminology: { athletes: "Alumnos/as" } },
      ],
      "rec"
    );

    expect(terms.athletes).toBe("Alumnos/as");
  });

  it("sanitizes override keys and warns about ambiguous terminology", () => {
    expect(
      sanitizeTerminologyOverrides({
        athlete: "  Gimnasta  ",
        athletes: "Gimnasta",
        unsupported: "No debe pasar",
        license: "",
      })
    ).toEqual({
      athlete: "Gimnasta",
      athletes: "Gimnasta",
    });

    expect(
      getTerminologyWarnings({
        terminology: {
          athlete: "Gimnasta",
          athletes: "Gimnasta",
          group: "Grupo",
          team: "Grupo",
        },
      })
    ).toEqual([
      "Revisa singular/plural de deportistas; ahora usan el mismo texto.",
      "Revisa equipo/conjunto y grupo; ahora usan el mismo texto.",
    ]);
  });
});

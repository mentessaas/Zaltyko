import { describe, expect, it } from "vitest";

import {
  type BatchRecord,
  batchRecordSchema,
  CATALOG_APPARATUS,
  CATALOG_DISCIPLINES,
  type EditionFile,
  editionFileSchema,
  editionsFileSchema,
  ELEMENT_DATA_NOTICE,
  ELEMENT_KEY_PATTERN,
  ELEMENT_LIBRARY_DESCRIPTIONS_ENV_FLAG,
  ELEMENT_LIBRARY_ENV_FLAG,
  ELEMENT_LIBRARY_UNAVAILABLE_REASON,
  elementAttributionText,
  type ElementDataFile,
  elementDataFileSchema,
  type ElementRecord,
  elementRecordSchema,
  filterCatalogElements,
  formatCoverDate,
  isElementLibraryDescriptionsFlagOn,
  isElementLibraryFlagOn,
  isElementVisibleToAcademies,
  isIsoDate,
  VALUE_LETTERS,
} from "@/modules/element-library/domain/element-library";
import { ELEMENT_SEED_FILE_PATTERN, renderElementSeedSql } from "@/modules/element-library/domain/seed-sql";
import { SKILL_APPARATUS_BY_DISCIPLINE } from "@/modules/skill-levels/domain/skill-levels";

const DOCUMENT_URL =
  "https://www.gymnastics.sport/publicdir/rules/files/en_1.1%20-%20WAG%20COP%202025-2028.pdf";

const edition: EditionFile = {
  code: "fig-wag-2025-2028",
  discipline: "artistic_female",
  cycleStart: 2025,
  cycleEnd: 2028,
  title: "Código de Puntuación de Gimnasia Artística Femenina 2025-2028",
  documentUrl: DOCUMENT_URL,
  coverDate: "2026-10-14",
  status: "published",
  groups: {
    vault: [
      { key: "1", label: "Grupo uno" },
      { key: "2", label: "Grupo dos" },
    ],
    beam: [{ key: "1", label: "Grupo de barra" }],
  },
};

const pointsElement: ElementRecord = {
  elementKey: "vt_test_handspring",
  group: "1",
  valuePoints: 2.4,
  name: "Paloma de prueba",
  shortName: "Paloma",
  sourcePage: 12,
  sourceCheckedOn: "2026-11-19",
  draftedBy: "Claude",
  draftedOn: "2026-11-19",
  batch: 1,
  reviewStatus: "draft",
};

const letterElement: ElementRecord = {
  elementKey: "bb_test_jump",
  group: "1",
  valueLetter: "B",
  figReference: "3.101",
  name: "Salto de prueba en barra",
  shortName: "Salto",
  description: "Texto propio de prueba.",
  sourcePage: 40,
  sourceCheckedOn: "2026-11-19",
  draftedBy: "Claude",
  draftedOn: "2026-11-19",
  batch: 1,
  reviewStatus: "reviewed",
  reviewedOn: "2026-11-21",
};

const vaultFile: ElementDataFile = {
  aviso: ELEMENT_DATA_NOTICE,
  edition: "fig-wag-2025-2028",
  apparatus: "vault",
  elements: [pointsElement],
};

const batchRecord: BatchRecord = {
  batch: 1,
  edition: "fig-wag-2025-2028",
  apparatus: ["vault"],
  elementKeys: ["vt_test_handspring", "vt_test_other"],
  procedure: { name: "sala-limpia", version: "1", steps: ["Hechos", "Redacción", "Comprobación"] },
  factsExtractedOn: "2026-11-19",
  draftedBy: "Claude",
  draftedOn: "2026-11-19",
  similarityCheck: {
    method: "Comparación frase a frase entre idiomas",
    threshold: 0.5,
    maxScore: 0.4,
    redrafted: [],
    checkedOn: "2026-11-19",
    checkedBy: "Claude",
  },
  manualSample: { sampleKeys: ["vt_test_other"], checkedBy: null, checkedOn: null, result: null },
  reviewedBy: null,
  reviewedOn: null,
  aviso: ELEMENT_DATA_NOTICE,
};

describe("banderas", () => {
  it("apagadas por defecto y encendidas solo con «true»", () => {
    expect(ELEMENT_LIBRARY_ENV_FLAG).toBe("ZALTYKO_ELEMENT_LIBRARY_ENABLED");
    expect(ELEMENT_LIBRARY_DESCRIPTIONS_ENV_FLAG).toBe("ZALTYKO_ELEMENT_LIBRARY_DESCRIPTIONS_ENABLED");
    expect(ELEMENT_LIBRARY_UNAVAILABLE_REASON).toBe("element_library_unavailable");
    expect(isElementLibraryFlagOn({})).toBe(false);
    expect(isElementLibraryFlagOn({ [ELEMENT_LIBRARY_ENV_FLAG]: "1" })).toBe(false);
    expect(isElementLibraryFlagOn({ [ELEMENT_LIBRARY_ENV_FLAG]: "true" })).toBe(true);
    expect(isElementLibraryDescriptionsFlagOn({})).toBe(false);
    expect(isElementLibraryDescriptionsFlagOn({ [ELEMENT_LIBRARY_ENV_FLAG]: "true" })).toBe(false);
    expect(isElementLibraryDescriptionsFlagOn({ [ELEMENT_LIBRARY_DESCRIPTIONS_ENV_FLAG]: "true" })).toBe(true);
  });
});

describe("constantes", () => {
  it("solo artística, con los aparatos de skill-levels", () => {
    expect(CATALOG_DISCIPLINES).toEqual(["artistic_female", "artistic_male"]);
    const fromSkillLevels = new Set(CATALOG_DISCIPLINES.flatMap((d) => [...SKILL_APPARATUS_BY_DISCIPLINE[d]]));
    expect(new Set(CATALOG_APPARATUS)).toEqual(fromSkillLevels);
    expect(VALUE_LETTERS).toBe("ABCDEFGHIJ");
  });

  it("patrón de clave", () => {
    expect(ELEMENT_KEY_PATTERN.test("vt_yurchenko_1")).toBe(true);
    expect(ELEMENT_KEY_PATTERN.test("ab")).toBe(false);
    expect(ELEMENT_KEY_PATTERN.test("1vt")).toBe(false);
    expect(ELEMENT_KEY_PATTERN.test("Vt_yurchenko")).toBe(false);
    expect(ELEMENT_KEY_PATTERN.test(`a${"b".repeat(64)}`)).toBe(false);
  });

  it("fechas ISO reales", () => {
    expect(isIsoDate("2026-10-14")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("14-10-2026")).toBe(false);
  });
});

describe("esquema de edición", () => {
  it("acepta una edición válida y la lista sin repetidos", () => {
    expect(editionFileSchema.safeParse(edition).success).toBe(true);
    expect(editionsFileSchema.safeParse([edition]).success).toBe(true);
    expect(editionsFileSchema.safeParse([edition, edition]).success).toBe(false);
  });

  it("URL no HTTPS o de otro dominio → error", () => {
    for (const documentUrl of [
      "http://www.gymnastics.sport/publicdir/rules/files/x.pdf",
      "https://gymnastics.sport/publicdir/rules/files/x.pdf",
      "https://www.gymnastics.sport.example.com/x.pdf",
      "https://example.com/www.gymnastics.sport/x.pdf",
      "https://user@www.gymnastics.sport/x.pdf",
      "https://www.gymnastics.sport:8443/x.pdf",
      "no es una url",
    ]) {
      expect(editionFileSchema.safeParse({ ...edition, documentUrl }).success, documentUrl).toBe(false);
    }
  });

  it("rechaza disciplina cambiada, ciclo al revés, aparato de otra disciplina, grupo repetido y campos extra", () => {
    expect(editionFileSchema.safeParse({ ...edition, discipline: "artistic_male" }).success).toBe(false);
    expect(editionFileSchema.safeParse({ ...edition, cycleEnd: 2025 }).success).toBe(false);
    expect(
      editionFileSchema.safeParse({ ...edition, groups: { pommel_horse: [{ key: "1", label: "x" }] } }).success
    ).toBe(false);
    expect(
      editionFileSchema.safeParse({
        ...edition,
        groups: { vault: [{ key: "1", label: "a" }, { key: "1", label: "b" }] },
      }).success
    ).toBe(false);
    expect(editionFileSchema.safeParse({ ...edition, logoUrl: "x" }).success).toBe(false);
    expect(editionFileSchema.safeParse({ ...edition, coverDate: "14-10-2026" }).success).toBe(false);
  });
});

describe("esquema de elemento", () => {
  it("acepta letra o puntos", () => {
    expect(elementRecordSchema.safeParse(pointsElement).success).toBe(true);
    expect(elementRecordSchema.safeParse(letterElement).success).toBe(true);
  });

  it("valor doble o sin valor → error", () => {
    expect(elementRecordSchema.safeParse({ ...letterElement, valuePoints: 4.2 }).success).toBe(false);
    const { valueLetter: _letter, ...withoutValue } = letterElement;
    expect(elementRecordSchema.safeParse(withoutValue).success).toBe(false);
  });

  it("puntos con más de dos decimales, cero o letra fuera de A–J → error", () => {
    expect(elementRecordSchema.safeParse({ ...pointsElement, valuePoints: 4.205 }).success).toBe(false);
    expect(elementRecordSchema.safeParse({ ...pointsElement, valuePoints: 0 }).success).toBe(false);
    expect(elementRecordSchema.safeParse({ ...pointsElement, valuePoints: 100 }).success).toBe(false);
    expect(elementRecordSchema.safeParse({ ...letterElement, valueLetter: "K" }).success).toBe(false);
    expect(elementRecordSchema.safeParse({ ...letterElement, valueLetter: "b" }).success).toBe(false);
  });

  it("clave con mayúsculas → error", () => {
    expect(elementRecordSchema.safeParse({ ...pointsElement, elementKey: "VT_handspring" }).success).toBe(false);
  });

  it("reviewed sin reviewedOn, o draft con reviewedOn → error", () => {
    const { reviewedOn: _reviewedOn, ...withoutDate } = letterElement;
    expect(elementRecordSchema.safeParse(withoutDate).success).toBe(false);
    expect(elementRecordSchema.safeParse({ ...pointsElement, reviewedOn: "2026-11-21" }).success).toBe(false);
  });

  it("textos: límites, espacios sobrantes, autoría y campos extra", () => {
    expect(elementRecordSchema.safeParse({ ...pointsElement, name: "P" }).success).toBe(false);
    expect(elementRecordSchema.safeParse({ ...pointsElement, name: "x".repeat(101) }).success).toBe(false);
    expect(elementRecordSchema.safeParse({ ...pointsElement, shortName: "x".repeat(41) }).success).toBe(false);
    expect(elementRecordSchema.safeParse({ ...pointsElement, description: "x".repeat(301) }).success).toBe(false);
    expect(elementRecordSchema.safeParse({ ...pointsElement, name: " Paloma" }).success).toBe(false);
    expect(elementRecordSchema.safeParse({ ...pointsElement, name: "Paloma\nsalto" }).success).toBe(false);
    expect(elementRecordSchema.safeParse({ ...pointsElement, draftedBy: "Otra persona" }).success).toBe(false);
    expect(elementRecordSchema.safeParse({ ...pointsElement, videoUrl: "x" }).success).toBe(false);
  });
});

describe("esquema de archivo de datos", () => {
  it("acepta un archivo válido", () => {
    expect(elementDataFileSchema.safeParse(vaultFile).success).toBe(true);
    expect(
      elementDataFileSchema.safeParse({ ...vaultFile, apparatus: "beam", elements: [letterElement] }).success
    ).toBe(true);
  });

  it("aviso distinto → error", () => {
    expect(elementDataFileSchema.safeParse({ ...vaultFile, aviso: "Otro aviso" }).success).toBe(false);
  });

  it("valuePoints fuera de salto → error", () => {
    expect(
      elementDataFileSchema.safeParse({ ...vaultFile, apparatus: "beam", elements: [{ ...pointsElement }] }).success
    ).toBe(false);
  });

  it("clave repetida, aparato de otra disciplina o sin elementos → error", () => {
    expect(elementDataFileSchema.safeParse({ ...vaultFile, elements: [pointsElement, pointsElement] }).success).toBe(
      false
    );
    expect(elementDataFileSchema.safeParse({ ...vaultFile, apparatus: "rings", elements: [letterElement] }).success).toBe(
      false
    );
    expect(elementDataFileSchema.safeParse({ ...vaultFile, elements: [] }).success).toBe(false);
  });
});

describe("esquema de tanda", () => {
  it("acepta un registro válido, también con revisión y muestra hechas", () => {
    expect(batchRecordSchema.safeParse(batchRecord).success).toBe(true);
    expect(
      batchRecordSchema.safeParse({
        ...batchRecord,
        manualSample: { sampleKeys: ["vt_test_other"], checkedBy: "Elvis", checkedOn: "2026-11-22", result: "Sin diferencias" },
        reviewedBy: "Elvis",
        reviewedOn: "2026-11-22",
      }).success
    ).toBe(true);
  });

  it("solo «Elvis» revisa: ningún otro nombre", () => {
    expect(batchRecordSchema.safeParse({ ...batchRecord, reviewedBy: "Otra persona", reviewedOn: "2026-11-22" }).success).toBe(
      false
    );
    expect(batchRecordSchema.safeParse({ ...batchRecord, reviewedBy: "Elvis", reviewedOn: null }).success).toBe(false);
  });

  it("muestra a medias, fuera de la tanda o máximo por encima del umbral → error", () => {
    expect(
      batchRecordSchema.safeParse({
        ...batchRecord,
        manualSample: { ...batchRecord.manualSample, checkedBy: "Elvis" },
      }).success
    ).toBe(false);
    expect(
      batchRecordSchema.safeParse({
        ...batchRecord,
        manualSample: { ...batchRecord.manualSample, sampleKeys: ["vt_fuera_de_tanda"] },
      }).success
    ).toBe(false);
    expect(
      batchRecordSchema.safeParse({
        ...batchRecord,
        similarityCheck: { ...batchRecord.similarityCheck, maxScore: 0.6 },
      }).success
    ).toBe(false);
    expect(batchRecordSchema.safeParse({ ...batchRecord, aviso: "Otro" }).success).toBe(false);
  });

  it("la muestra manual cubre al menos el 10 % de la tanda, con claves de la tanda", () => {
    const elementKeys = Array.from({ length: 51 }, (_, index) => `vt_test_${index + 1}`);
    const withSample = (sampleKeys: string[]) =>
      batchRecordSchema.safeParse({
        ...batchRecord,
        elementKeys,
        manualSample: { ...batchRecord.manualSample, sampleKeys },
      }).success;
    expect(withSample(elementKeys.slice(0, 6))).toBe(true);
    expect(withSample(elementKeys.slice(0, 5))).toBe(false);
    expect(withSample([...elementKeys.slice(0, 5), "vt_fuera_de_tanda"])).toBe(false);
    expect(withSample([])).toBe(false);
  });
});

describe("visibilidad para las academias", () => {
  it("solo revisado, de edición publicada y sin retirar", () => {
    const published = { status: "published" };
    expect(isElementVisibleToAcademies({ reviewStatus: "reviewed", withdrawnAt: null }, published)).toBe(true);
    expect(isElementVisibleToAcademies({ reviewStatus: "draft", withdrawnAt: null }, published)).toBe(false);
    expect(isElementVisibleToAcademies({ reviewStatus: "reviewed", withdrawnAt: new Date() }, published)).toBe(false);
    expect(isElementVisibleToAcademies({ reviewStatus: "reviewed", withdrawnAt: null }, { status: "draft" })).toBe(false);
    expect(isElementVisibleToAcademies({ reviewStatus: "reviewed", withdrawnAt: null }, { status: "retired" })).toBe(
      false
    );
  });
});

describe("atribución", () => {
  it("texto exacto con título, fecha de portada dd-mm-aaaa y enlace", () => {
    expect(elementAttributionText(edition)).toBe(
      "Valores y grupos según el Código de Puntuación de Gimnasia Artística Femenina 2025-2028 de la FIG (World Gymnastics), edición publicada el 14-10-2026. Las descripciones las redacta Zaltyko y no son el texto oficial; si hay diferencias, manda el documento oficial: " +
        DOCUMENT_URL +
        ". Zaltyko no está afiliado a la FIG ni cuenta con su respaldo."
    );
    // Fecha local, como devuelve node-postgres un `date`: no debe salir el día anterior.
    expect(elementAttributionText({ ...edition, coverDate: new Date(2026, 9, 14) })).toContain(
      "edición publicada el 14-10-2026."
    );
    expect(formatCoverDate(new Date(2026, 0, 5))).toBe("05-01-2026");
    expect(formatCoverDate("2026-10-14")).toBe("14-10-2026");
  });
});

describe("filtro del catálogo", () => {
  const catalog = [
    { elementKey: "vt_tsukahara_tuck", name: "Tsukahara agrupado", shortName: "Tsuka", apparatus: "vault", group: "3", valueLetter: null, valuePoints: "4.20" },
    { elementKey: "vt_round_off", name: "Rondada con medio giro", shortName: "Rondada ½", apparatus: "vault", group: "5", valueLetter: null, valuePoints: 3 },
    { elementKey: "bb_split_jump", name: "Salto de piernas en extensión", shortName: "Zancada", apparatus: "beam", group: "1", valueLetter: "A", valuePoints: null },
    { elementKey: "bb_turn", name: "Giro en relevé", shortName: "Giro", apparatus: "beam", group: "3", valueLetter: "D", valuePoints: null },
  ];
  const keys = (filter: Parameters<typeof filterCatalogElements>[1]) =>
    filterCatalogElements(catalog, filter).map((element) => element.elementKey);

  it("sin filtros devuelve todo en el mismo orden", () => {
    expect(keys({})).toEqual(catalog.map((element) => element.elementKey));
  });

  it("busca sin acentos ni mayúsculas en nombre, nombre corto y clave", () => {
    expect(keys({ query: "TSUKÁHARA" })).toEqual(["vt_tsukahara_tuck"]);
    expect(keys({ query: "releve" })).toEqual(["bb_turn"]);
    expect(keys({ query: "zancada" })).toEqual(["bb_split_jump"]);
    expect(keys({ query: "round_off" })).toEqual(["vt_round_off"]);
    expect(keys({ query: "nada parecido" })).toEqual([]);
  });

  it("valor por letra o por puntos", () => {
    expect(keys({ value: "d" })).toEqual(["bb_turn"]);
    expect(keys({ value: "4,20" })).toEqual(["vt_tsukahara_tuck"]);
    expect(keys({ value: "4.2" })).toEqual(["vt_tsukahara_tuck"]);
    expect(keys({ value: "3" })).toEqual(["vt_round_off"]);
    expect(keys({ value: "xyz" })).toEqual([]);
  });

  it("aparato y grupo", () => {
    expect(keys({ apparatus: "beam" })).toEqual(["bb_split_jump", "bb_turn"]);
    expect(keys({ apparatus: "beam", group: "3" })).toEqual(["bb_turn"]);
    expect(keys({ group: "3" })).toEqual(["vt_tsukahara_tuck", "bb_turn"]);
  });
});

describe("semilla SQL", () => {
  const beamFile: ElementDataFile = {
    aviso: ELEMENT_DATA_NOTICE,
    edition: "fig-wag-2025-2028",
    apparatus: "beam",
    elements: [{ ...letterElement, name: "Salto d'Artagnan" }],
  };
  const laterVault: ElementDataFile = {
    ...vaultFile,
    elements: [pointsElement, { ...pointsElement, elementKey: "vt_test_other", batch: 2, valuePoints: 5 }],
  };
  const stripComments = (sql: string) => sql.replace(/--[^\n]*/g, "");

  it("es determinista, ordena por aparato y solo incluye la tanda pedida", () => {
    const sql = renderElementSeedSql(edition, [laterVault, beamFile], 1);
    expect(renderElementSeedSql(edition, [beamFile, laterVault], 1)).toBe(sql);
    expect(sql.indexOf("'bb_test_jump'")).toBeLessThan(sql.indexOf("'vt_test_handspring'"));
    expect(sql).not.toContain("vt_test_other");
    expect(sql).toContain("2.40");
    expect(sql).toContain("'Salto d''Artagnan'");
    expect(sql).toContain("'2026-11-21'::date");
  });

  it("transacción con preflight, edición sin bajar de retirada y guardas de revisión", () => {
    const sql = stripComments(renderElementSeedSql(edition, [vaultFile], 1));
    expect(sql.trimStart().startsWith("begin;")).toBe(true);
    expect(sql.trimEnd().endsWith("commit;")).toBe(true);
    expect(sql).toContain("to_regclass('zaltyko.catalog_element_editions') is null");
    expect(sql).toContain("to_regclass('zaltyko.catalog_elements') is null");
    expect(sql).toContain("on conflict (code) do update set");
    expect(sql).toContain("case when catalog_element_editions.status = 'retired' then 'retired' else excluded.status end");
    expect(sql).toContain("e.review_status = 'reviewed'");
    expect(sql).toContain("s.reviewed_on <= e.reviewed_on");
    expect(sql).toContain("on conflict (edition_id, element_key) do update set");
    expect(sql).toContain(
      "review_status = case when catalog_elements.review_status = 'reviewed' then 'reviewed' else excluded.review_status end"
    );
    expect(sql).not.toMatch(/withdrawn/);
  });

  it("cabecera de candidata generada", () => {
    const sql = renderElementSeedSql(edition, [vaultFile], 1);
    expect(sql.startsWith("-- CANDIDATE ONLY.")).toBe(true);
    expect(sql).toContain("No aplicado en ningún entorno");
    expect(sql).toContain("autorización de Elvis");
    expect(sql).toContain("scripts/element-library/build-seed.ts");
    expect(sql).toContain("No editar a mano");
  });

  it("falla con tanda vacía, edición ajena o clave repetida", () => {
    expect(() => renderElementSeedSql(edition, [vaultFile], 9)).toThrow();
    expect(() => renderElementSeedSql(edition, [vaultFile], 0)).toThrow();
    expect(() =>
      renderElementSeedSql(edition, [{ ...vaultFile, edition: "fig-mag-2025-2028" }], 1)
    ).toThrow();
    expect(() =>
      renderElementSeedSql(edition, [vaultFile, { ...beamFile, elements: [{ ...letterElement, elementKey: "vt_test_handspring" }] }], 1)
    ).toThrow();
  });

  it("nombre de archivo de semilla", () => {
    expect(ELEMENT_SEED_FILE_PATTERN.test("20261119121000_element_catalog_seed_fig-wag-2025-2028_1.sql")).toBe(true);
    expect(ELEMENT_SEED_FILE_PATTERN.test("20261119121000_element_catalog_seed_fig-wag-2025-2028_0.sql")).toBe(false);
  });
});

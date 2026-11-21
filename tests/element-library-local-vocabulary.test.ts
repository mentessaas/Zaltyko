import { describe, expect, it } from "vitest";

import mexicoVocabulary from "@/modules/element-library/data/vocabulario/mx.json";
import {
  filterCatalogElements,
  normalizeSearchText,
} from "@/modules/element-library/domain/element-library";
import {
  expandLocalSearchQuery,
  findLocalTerms,
  isLocalVocabularyFlagOn,
  LOCAL_SEARCH_VARIANTS_MAX,
  LOCAL_VOCABULARY_ENV_FLAG,
  localVocabularyFileSchema,
  reviewedVocabulary,
  type LocalTerm,
  type LocalVocabulary,
} from "@/modules/element-library/domain/local-vocabulary";

/**
 * Vocabulario de sala por país (ADR-0030): esquema del archivo de México,
 * coincidencias en la ficha y búsqueda con las palabras del país.
 */

function term(
  key: string,
  es: string[],
  local: string[],
  note?: string
): LocalTerm {
  return {
    key,
    es,
    local,
    ...(note ? { note } : {}),
    confidence: "alta",
    source: "Prueba",
    reviewStatus: "reviewed",
  };
}

/** Todas las entradas del archivo real, como si estuvieran revisadas. */
function realVocabulary(): LocalVocabulary {
  const file = localVocabularyFileSchema.parse(mexicoVocabulary);
  return {
    country: file.country,
    countryName: file.countryName,
    entries: file.entries,
  };
}

const keys = (matches: { key: string }[]) => matches.map((match) => match.key);

describe("archivo de México", () => {
  it("pasa el esquema estricto, es de México y no repite claves ni formas", () => {
    const parsed = localVocabularyFileSchema.safeParse(mexicoVocabulary);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    expect(parsed.data?.country).toBe("MX");
    expect(parsed.data?.countryName).toBe("México");
  });

  it("solo usa las entradas revisadas", () => {
    const file = localVocabularyFileSchema.parse(mexicoVocabulary);
    const reviewed = reviewedVocabulary(file);
    expect(
      reviewed.entries.every((entry) => entry.reviewStatus === "reviewed")
    ).toBe(true);
    expect(reviewed.entries.length).toBe(
      file.entries.filter((entry) => entry.reviewStatus === "reviewed").length
    );
  });

  it("rechaza formas repetidas entre entradas y campos de más", () => {
    const base = {
      aviso: "Aviso de prueba suficiente.",
      country: "MX",
      countryName: "México",
    };
    const repeated = localVocabularyFileSchema.safeParse({
      ...base,
      entries: [
        term("uno", ["rondada"], ["redondilla"]),
        term("dos", ["Rondada"], ["otra"]),
      ],
    });
    expect(repeated.success).toBe(false);
    const extra = localVocabularyFileSchema.safeParse({
      ...base,
      entries: [
        { ...term("uno", ["rondada"], ["redondilla"]), cita: "texto copiado" },
      ],
    });
    expect(extra.success).toBe(false);
  });

  it("cubre las palabras que el glosario de España cambió, o dice que en México se dicen igual", () => {
    // Palabras que la RFEG usa en los textos del catálogo (glosario aplicado el
    // 21-11-2026). Si una sale del glosario de España, entra aquí o en «iguales».
    const spainGlossary = [
      "kippe",
      "kippe invertida",
      "kippe de cabeza",
      "vuelta de plantas",
      "molino",
      "molino atrás",
      "molino adelante",
      "escuadra",
      "paloma sin manos",
      "paloma de dos piernas",
      "tempo",
      "arco adelante",
      "carpa abierta",
      "zancada con cambio",
    ];
    // En México se dicen igual o la diferencia es solo de grafía (ADR-0030).
    const sameInMexico = new Set([
      "vuelta atrás al apoyo",
      "arco atrás",
      "flik-flak",
    ]);
    const forms = new Set(
      localVocabularyFileSchema
        .parse(mexicoVocabulary)
        .entries.flatMap((entry) =>
          entry.es.map((form) => normalizeSearchText(form))
        )
    );
    const missing = spainGlossary.filter(
      (word) => !forms.has(normalizeSearchText(word)) && !sameInMexico.has(word)
    );
    expect(missing).toEqual([]);
  });
});

describe("coincidencias en la ficha", () => {
  const vocabulary = realVocabulary();

  it("encuentra sin mayúsculas ni acentos y en el orden del texto", () => {
    const matches = findLocalTerms(
      ["Rondada, flik-flak y mortal ARABE con media pirueta"],
      vocabulary
    );
    expect(keys(matches)).toEqual(["rondada", "mortal_arabe", "media_pirueta"]);
    expect(matches[0]).toEqual({
      key: "rondada",
      es: "rondada",
      local: ["redondilla"],
      note: null,
    });
  });

  it("la forma más larga gana y no se solapa con la corta", () => {
    expect(keys(findLocalTerms(["Paloma sin manos"], vocabulary))).toEqual([
      "paloma_sin_manos",
    ]);
    expect(
      keys(findLocalTerms(["Kippe de cabeza y después una kippe"], vocabulary))
    ).toEqual(["kippe_cabeza", "kippe"]);
    expect(
      keys(findLocalTerms(["Rueda sin manos y mortal árabe"], vocabulary))
    ).toEqual(["rueda_sin_manos", "mortal_arabe"]);
  });

  it("los cruces de molino: atrás es gigante, adelante se dice igual y no sale", () => {
    expect(
      findLocalTerms(["Molino atrás en presa dorsal"], vocabulary)[0]
    ).toMatchObject({
      key: "molino_atras",
      local: ["gigante"],
    });
    expect(findLocalTerms(["Molino adelante"], vocabulary)).toEqual([]);
    expect(keys(findLocalTerms(["Molino con medio giro"], vocabulary))).toEqual(
      ["molino"]
    );
  });

  it("solo casa palabras completas, con los plurales como forma propia", () => {
    expect(findLocalTerms(["Palomares y rondadores"], vocabulary)).toEqual([]);
    expect(keys(findLocalTerms(["Dos piruetas"], vocabulary))).toEqual([
      "pirueta",
    ]);
  });

  it("enseña cada entrada una vez aunque salga en nombre, nombre corto y descripción", () => {
    const matches = findLocalTerms(
      ["Rondada", "Rondada", "Entra con una rondada", null],
      vocabulary
    );
    expect(keys(matches)).toEqual(["rondada"]);
  });

  it("sin entradas revisadas no enseña nada", () => {
    expect(
      findLocalTerms(["Rondada"], {
        country: "MX",
        countryName: "México",
        entries: [],
      })
    ).toEqual([]);
  });
});

describe("búsqueda con palabras del país", () => {
  const vocabulary: LocalVocabulary = {
    country: "MX",
    countryName: "México",
    entries: [
      term("rondada", ["rondada", "rondadas"], ["redondilla"]),
      term("media_pirueta", ["media pirueta"], ["medio giro"]),
      term("pirueta", ["pirueta"], ["giro"]),
      term("molino", ["molino"], ["gigante"]),
    ],
  };

  it("añade las formas de España y deja la consulta original primero", () => {
    expect(expandLocalSearchQuery("Redondilla", vocabulary)).toEqual([
      "redondilla",
      "rondada",
      "rondadas",
    ]);
    expect(expandLocalSearchQuery("gigante", vocabulary)).toEqual([
      "gigante",
      "molino",
    ]);
  });

  it("cambia la palabra más larga primero y combina varias", () => {
    const variants = expandLocalSearchQuery(
      "redondilla medio giro",
      vocabulary
    );
    expect(variants[0]).toBe("redondilla medio giro");
    expect(variants).toContain("rondada media pirueta");
  });

  it("no cambia aparte una palabra que va dentro de otra más larga", () => {
    const nested: LocalVocabulary = {
      country: "MX",
      countryName: "México",
      entries: [
        term("cambio_presa_saltado", ["cambio de presa saltado"], ["rebote de manos a cambio de toma"]),
        term("saltito", ["saltito"], ["rebote"]),
      ],
    };
    expect(expandLocalSearchQuery("rebote de manos a cambio de toma", nested)).toEqual([
      "rebote de manos a cambio de toma",
      "cambio de presa saltado",
    ]);
    expect(expandLocalSearchQuery("rebote", nested)).toEqual(["rebote", "saltito"]);
  });

  it("rechaza una forma que sin tildes se queda vacía", () => {
    const parsed = localVocabularyFileSchema.safeParse({
      aviso: "Aviso de prueba suficiente.",
      country: "MX",
      countryName: "México",
      entries: [term("vacia", ["rondada"], ["\u0301"])],
    });
    expect(parsed.success).toBe(false);
  });

  it("sin vocabulario o sin palabras del país, solo la consulta", () => {
    expect(expandLocalSearchQuery("Yurchenko", null)).toEqual(["yurchenko"]);
    expect(expandLocalSearchQuery("Yurchenko", vocabulary)).toEqual([
      "yurchenko",
    ]);
  });

  it("tiene un tope de variantes", () => {
    const many = expandLocalSearchQuery(
      Array.from({ length: 12 }, () => "redondilla giro").join(" "),
      vocabulary
    );
    expect(many.length).toBeLessThanOrEqual(LOCAL_SEARCH_VARIANTS_MAX);
  });

  it("el filtro del catálogo encuentra con cualquiera de las variantes y no quita resultados", () => {
    const elements = [
      {
        elementKey: "vt_round_off",
        name: "Rondada con mortal",
        shortName: "Rondada",
        apparatus: "vault",
        group: "4",
      },
      {
        elementKey: "fx_tuck",
        name: "Mortal agrupado",
        shortName: "Agrupado",
        apparatus: "floor",
        group: "3",
      },
    ];
    const queryVariants = expandLocalSearchQuery("redondilla", vocabulary);
    expect(
      filterCatalogElements(elements, {
        query: "redondilla",
        queryVariants,
      }).map((e) => e.elementKey)
    ).toEqual(["vt_round_off"]);
    expect(filterCatalogElements(elements, { query: "redondilla" })).toEqual(
      []
    );
    expect(
      filterCatalogElements(elements, {
        query: "mortal",
        queryVariants: ["mortal"],
      })
    ).toHaveLength(2);
  });
});

describe("bandera", () => {
  it("apagada salvo con «true»", () => {
    expect(isLocalVocabularyFlagOn({})).toBe(false);
    expect(isLocalVocabularyFlagOn({ [LOCAL_VOCABULARY_ENV_FLAG]: "1" })).toBe(
      false
    );
    expect(
      isLocalVocabularyFlagOn({ [LOCAL_VOCABULARY_ENV_FLAG]: "true" })
    ).toBe(true);
  });
});

import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  compareCandidateHashes,
  sha256OfFile,
} from "../scripts/candidates/verify-candidate-hashes.mjs";

// Pruebas de la comparación de SHA-256 de las migraciones candidatas. Todos
// los textos y hashes son inventados: no se lee el README real de
// docs/deployment/candidates.

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);
const HASH_D = "d".repeat(64);
const HASH_E = "e".repeat(64);

describe("compareCandidateHashes", () => {
  it("marca como OK un hash documentado en la tabla del README", () => {
    const readme = [
      "## Estado",
      "",
      "| Candidata | SHA-256 | Producción |",
      "|---|---|---|",
      `| \`20260101000000_uno_candidate.sql\` | \`${HASH_A}\` | Aplicada |`,
    ].join("\n");

    const resultado = compareCandidateHashes({
      readme,
      files: [{ name: "20260101000000_uno_candidate.sql", sha256: HASH_A }],
    });

    expect(resultado.ok).toEqual([
      { name: "20260101000000_uno_candidate.sql", sha256: HASH_A },
    ]);
    expect(resultado.missing).toEqual([]);
    expect(resultado.orphanHashes).toEqual([]);
  });

  it("marca como OK un hash documentado en viñetas, con y sin negrita", () => {
    const readme = [
      "## Detalle",
      "",
      `- SHA-256: \`${HASH_A}\`.`,
      `- **SHA-256:** \`${HASH_B}\`.`,
    ].join("\n");
    const files = [
      { name: "uno.sql", sha256: HASH_A },
      { name: "dos.sql", sha256: HASH_B },
    ];

    const resultado = compareCandidateHashes({ readme, files });

    expect(resultado.ok).toEqual(files);
    expect(resultado.missing).toEqual([]);
    expect(resultado.orphanHashes).toEqual([]);
  });

  it("marca como FALTA EN README un archivo cuyo hash no aparece", () => {
    const readme = [
      "| Candidata | SHA-256 |",
      "|---|---|",
      `| \`uno.sql\` | \`${HASH_A}\` |`,
    ].join("\n");

    const resultado = compareCandidateHashes({
      readme,
      files: [{ name: "dos.sql", sha256: HASH_C }],
    });

    expect(resultado.ok).toEqual([]);
    expect(resultado.missing).toEqual([{ name: "dos.sql", sha256: HASH_C }]);
    // El hash documentado de un archivo que no está en la lista queda huérfano.
    expect(resultado.orphanHashes).toEqual([HASH_A]);
  });

  it("compara sin distinguir mayúsculas y devuelve minúsculas", () => {
    const readme = [
      "| Candidata | SHA-256 |",
      "|---|---|",
      `| \`uno.sql\` | \`${HASH_A.toUpperCase()}\` |`,
      `- SHA-256: \`${HASH_B}\``,
    ].join("\n");
    const files = [
      // README en mayúsculas, archivo en minúsculas.
      { name: "uno.sql", sha256: HASH_A },
      // README en minúsculas, archivo en mayúsculas.
      { name: "dos.sql", sha256: HASH_B.toUpperCase() },
    ];

    const resultado = compareCandidateHashes({ readme, files });

    expect(resultado.ok).toEqual([
      { name: "uno.sql", sha256: HASH_A },
      { name: "dos.sql", sha256: HASH_B },
    ]);
    expect(resultado.missing).toEqual([]);
    expect(resultado.orphanHashes).toEqual([]);
  });

  it("devuelve como huérfano el hash del README sin archivo, en orden de aparición", () => {
    const readme = `- SHA-256: \`${HASH_D}\`\n- **SHA-256:** \`${HASH_A}\``;

    const resultado = compareCandidateHashes({
      readme,
      files: [{ name: "uno.sql", sha256: HASH_A }],
    });

    expect(resultado.ok).toEqual([{ name: "uno.sql", sha256: HASH_A }]);
    expect(resultado.missing).toEqual([]);
    expect(resultado.orphanHashes).toEqual([HASH_D]);
  });

  it("no repite un huérfano aunque aparezca dos veces con distinta caja", () => {
    const readme = [
      "| Candidata | SHA-256 |",
      "|---|---|",
      `| \`vieja.sql\` | \`${HASH_D}\` |`,
      `- SHA-256: \`${HASH_D.toUpperCase()}\``,
      `- **SHA-256:** \`${HASH_E}\``,
    ].join("\n");

    const resultado = compareCandidateHashes({ readme, files: [] });

    expect(resultado.orphanHashes).toEqual([HASH_D, HASH_E]);
  });

  it("con un README sin hashes marca todos los archivos como FALTA EN README", () => {
    const readme = "# Candidatos\n\nSin tabla ni viñetas todavía.";
    const files = [
      { name: "uno.sql", sha256: HASH_A },
      { name: "dos.sql", sha256: HASH_B },
    ];

    const resultado = compareCandidateHashes({ readme, files });

    expect(resultado.ok).toEqual([]);
    expect(resultado.missing).toEqual(files);
    expect(resultado.orphanHashes).toEqual([]);
  });

  it("no extrae como token una cadena hexadecimal más larga de 64 caracteres", () => {
    const readme = `- SHA-256: \`${HASH_A}f\``; // 65 caracteres hexadecimales.

    const resultado = compareCandidateHashes({
      readme,
      files: [{ name: "uno.sql", sha256: HASH_A }],
    });

    expect(resultado.ok).toEqual([]);
    expect(resultado.missing).toEqual([{ name: "uno.sql", sha256: HASH_A }]);
    expect(resultado.orphanHashes).toEqual([]);
  });
});

describe("sha256OfFile", () => {
  it("devuelve el SHA-256 en minúsculas del contenido binario exacto", () => {
    const carpeta = mkdtempSync(join(tmpdir(), "zaltyko-candidate-hashes-"));
    const ruta = join(carpeta, "20260101000000_prueba_candidate.sql");
    const contenido = Buffer.from("-- candidata de prueba\nselect 1;\n");
    writeFileSync(ruta, contenido);

    try {
      const esperado = createHash("sha256").update(contenido).digest("hex");
      const calculado = sha256OfFile(ruta);

      expect(calculado).toBe(esperado);
      expect(calculado).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      rmSync(carpeta, { recursive: true, force: true });
    }
  });
});

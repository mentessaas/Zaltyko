// Comprobación de los SHA-256 de las migraciones candidatas contra su README.
// Sin dependencias: solo módulos de Node.
//
// Uso:
//   node scripts/candidates/verify-candidate-hashes.mjs            # docs/deployment/candidates
//   node scripts/candidates/verify-candidate-hashes.mjs <carpeta>  # otra carpeta con README.md y .sql
//
// Lee los .sql de la carpeta (sin recursión), calcula el SHA-256 de cada uno
// y lo compara con todos los tokens de 64 caracteres hexadecimales del
// README.md de esa misma carpeta, vengan de la tabla o de las viñetas (no se
// parsea la estructura del README). Imprime una línea por archivo —«OK» si su
// hash figura en el README, «FALTA EN README» si no— y una línea
// «HASH SIN ARCHIVO» por cada hash del README que no corresponde a ningún
// archivo (solo avisa: el README conserva hashes históricos). Código de
// salida 1 si algún archivo falta en el README o si algo no se puede leer;
// 0 en caso contrario.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const CARPETA_POR_DEFECTO = "docs/deployment/candidates";

// Extrae todos los tokens de 64 caracteres hexadecimales del README, sin
// parsear tablas ni viñetas. Los límites de palabra evitan contar como token
// una cadena hexadecimal más larga (p. ej. de 65 caracteres).
function hashesDelReadme(readme) {
  return (readme.match(/\b[0-9a-fA-F]{64}\b/g) ?? []).map((hash) =>
    hash.toLowerCase()
  );
}

/**
 * Compara los hashes de los archivos con los del README, sin distinguir
 * mayúsculas. Devuelve:
 * - ok: archivos cuyo hash aparece en el README.
 * - missing: archivos cuyo hash no aparece en el README.
 * - orphanHashes: hashes del README sin archivo, en minúsculas, sin
 *   duplicados y en orden de aparición.
 * Los hashes de ok y missing se devuelven normalizados a minúsculas.
 */
export function compareCandidateHashes({ readme, files }) {
  const delReadme = hashesDelReadme(readme);
  const enReadme = new Set(delReadme);
  const deArchivos = new Set(
    files.map((archivo) => String(archivo.sha256).toLowerCase())
  );
  const ok = [];
  const missing = [];
  for (const archivo of files) {
    const sha256 = String(archivo.sha256).toLowerCase();
    if (enReadme.has(sha256)) {
      ok.push({ name: archivo.name, sha256 });
    } else {
      missing.push({ name: archivo.name, sha256 });
    }
  }
  const vistos = new Set();
  const orphanHashes = [];
  for (const hash of delReadme) {
    if (deArchivos.has(hash) || vistos.has(hash)) continue;
    vistos.add(hash);
    orphanHashes.push(hash);
  }
  return { ok, missing, orphanHashes };
}

/**
 * SHA-256 (hex en minúsculas) del contenido binario exacto del archivo.
 */
export function sha256OfFile(ruta) {
  return createHash("sha256").update(fs.readFileSync(ruta)).digest("hex");
}

function mensajeDeError(error) {
  return error instanceof Error ? error.message : String(error);
}

// Modo CLI: carpeta por argv[2] (docs/deployment/candidates por defecto).
function principal() {
  const carpeta = process.argv[2] || CARPETA_POR_DEFECTO;
  const carpetaAbsoluta = path.resolve(carpeta);

  let nombres;
  try {
    nombres = fs.readdirSync(carpetaAbsoluta);
  } catch (error) {
    console.error(
      `No se pudo leer la carpeta ${carpetaAbsoluta}: ${mensajeDeError(error)}`
    );
    process.exitCode = 1;
    return;
  }

  const rutaReadme = path.join(carpetaAbsoluta, "README.md");
  let readme;
  try {
    readme = fs.readFileSync(rutaReadme, "utf8");
  } catch (error) {
    console.error(`No se pudo leer ${rutaReadme}: ${mensajeDeError(error)}`);
    process.exitCode = 1;
    return;
  }

  // Solo los .sql de la carpeta, sin recursión. La extensión se compara sin
  // distinguir mayúsculas para no saltarse en silencio un .SQL (macOS no
  // distingue mayúsculas en el sistema de archivos).
  const archivos = [];
  let falloDeLectura = false;
  const nombresSql = nombres
    .filter((nombre) => nombre.toLowerCase().endsWith(".sql"))
    .sort();
  for (const nombre of nombresSql) {
    const ruta = path.join(carpetaAbsoluta, nombre);
    try {
      archivos.push({ name: nombre, sha256: sha256OfFile(ruta) });
    } catch (error) {
      // Un .sql ilegible no queda verificado: se avisa y falla el comando.
      console.error(`No se pudo leer ${ruta}: ${mensajeDeError(error)}`);
      falloDeLectura = true;
    }
  }

  const { ok, missing, orphanHashes } = compareCandidateHashes({
    readme,
    files: archivos,
  });

  console.log(`Carpeta: ${carpetaAbsoluta}`);
  if (archivos.length === 0) {
    console.log("No hay archivos .sql en la carpeta.");
  }
  for (const archivo of ok) {
    console.log(`OK\t${archivo.name}\t${archivo.sha256}`);
  }
  for (const archivo of missing) {
    console.log(`FALTA EN README\t${archivo.name}\t${archivo.sha256}`);
  }
  for (const hash of orphanHashes) {
    console.log(`HASH SIN ARCHIVO\t${hash}`);
  }
  console.log(
    `Resumen: ${ok.length} OK, ${missing.length} falta(n) en el README, ` +
      `${orphanHashes.length} hash(es) del README sin archivo.`
  );
  if (orphanHashes.length > 0) {
    console.log(
      "Los hashes sin archivo solo avisan: el README conserva hashes históricos."
    );
  }
  if (missing.length > 0 || falloDeLectura) {
    process.exitCode = 1;
  }
}

// Ejecución directa compatible con ESM: se compara import.meta.url con
// process.argv[1] convertido a URL de archivo.
const ejecutadoDirectamente =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (ejecutadoDirectamente) {
  principal();
}

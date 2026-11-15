import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * La demo pública (/demo) no toca la base de datos ni ninguna API autenticada.
 * Esta prueba lo comprueba en el código: lo que importa la demo en tiempo de
 * ejecución es una lista cerrada, sin base de datos, sin Supabase, sin sesión y
 * sin servicios de aplicación. Las importaciones de solo tipos se borran al
 * compilar y no cuentan.
 */

const DEMO_ROOTS = ["src/app/demo", "src/components/demo", "src/modules/demo"];

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(entry) ? [path] : [];
  });
}

const FILES = DEMO_ROOTS.flatMap(sources).map((file) => ({ file, source: readFileSync(file, "utf8") }));

/** Importaciones de ejecución: las de `import type` no cuentan. */
function runtimeImports(source: string): string[] {
  const specifiers: string[] = [];
  for (const match of source.matchAll(/^(?:import|export)\s+(type\s+)?([^'";]*?\sfrom\s+)?["']([^"']+)["']/gm)) {
    if (!match[1]) specifiers.push(match[3]);
  }
  for (const match of source.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) specifiers.push(match[1]);
  return specifiers;
}

const ALLOWED_RUNTIME_IMPORTS: readonly RegExp[] = [
  /^react$/,
  /^next\/(?:link|navigation)$/,
  /^lucide-react$/,
  /^\.\.?\//,
  /^@\/components\//,
  // Datos y lógica de la demo, y la presentación pura del portal de familias.
  /^@\/modules\/demo\//,
  /^@\/modules\/family-portal\/domain\/family-portal-presentation$/,
  /^@\/lib\/utils$/,
  // Canal de medición público que ya usa /pricing: sin datos personales.
  /^@\/lib\/growth\/client$/,
];

describe("la demo no toca la base de datos ni las APIs autenticadas", () => {
  it("encuentra los archivos de la demo", () => {
    expect(FILES.length).toBeGreaterThan(15);
  });

  it.each(FILES.map(({ file }) => file))("%s solo importa lo permitido en tiempo de ejecución", (file) => {
    const source = FILES.find((candidate) => candidate.file === file)!.source;
    const offenders = runtimeImports(source).filter((specifier) => !ALLOWED_RUNTIME_IMPORTS.some((pattern) => pattern.test(specifier)));
    expect(offenders).toEqual([]);
  });

  it("ningún archivo de la demo llama a fetch, lee variables de entorno ni usa cookies o sesión", () => {
    for (const { file, source } of FILES) {
      const code = source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
      expect(code, file).not.toMatch(/\bfetch\s*\(/);
      expect(code, file).not.toMatch(/process\.env/);
      expect(code, file).not.toMatch(/\bcookies\s*\(|getUser\s*\(|createClient\s*\(/);
    }
  });

  it("no hay rutas de API ni acciones de servidor de la demo", () => {
    for (const { file, source } of FILES) {
      expect(file, file).not.toMatch(/route\.ts$/);
      expect(source, file).not.toMatch(/["']use server["']/);
    }
  });

  it("las páginas de la demo no se prerenderizan con la fecha de compilación", () => {
    const pages = FILES.filter(({ file }) => /src\/app\/demo\/.*page\.tsx$/.test(file.replace(/\\/g, "/")));
    expect(pages.length).toBeGreaterThanOrEqual(8);
    for (const { file, source } of pages) {
      expect(source, file).toMatch(/export const dynamic = "force-dynamic"/);
    }
  });
});

describe("las acciones de la demo no escriben", () => {
  const sandbox = readFileSync("src/components/demo/DemoSandbox.tsx", "utf8");

  it("el contenedor instala la guarda de red y frena los envíos de formularios", () => {
    expect(sandbox).toContain("installDemoFetch");
    expect(sandbox).toContain("onSubmitCapture");
    expect(sandbox).toContain("event.preventDefault()");
    expect(sandbox).toContain("DEMO_NOTICE");
  });

  it("la guarda se instala antes de que los hijos lancen sus lecturas y se retira al salir", () => {
    // Durante el primer render, no en un efecto: los efectos de los hijos corren antes que los del padre.
    expect(sandbox).toMatch(/ensureGuard\(\);\s*\n\s*const showNotice/);
    expect(sandbox).toContain("releaseGuard()");
  });

  it("el layout monta el contenedor, el banner fijo y la marca noindex", () => {
    const layout = readFileSync("src/app/demo/layout.tsx", "utf8");
    expect(layout).toContain("<DemoSandbox>");
    expect(layout).toContain("<DemoBanner />");
    const banner = readFileSync("src/components/demo/DemoBanner.tsx", "utf8");
    expect(banner).toContain("Estás viendo una demo");
    expect(banner).toContain("/auth/register");
    expect(banner).toContain("sticky top-0");
  });

  it("las páginas de familia de la demo no usan el cierre de sesión", () => {
    const shell = readFileSync("src/components/family-portal/FamilyPortalShell.tsx", "utf8");
    expect(shell).toMatch(/demo \? \(\s*<span[^>]*>Demo<\/span>\s*\) : \(\s*<OwnerSignOutButton/);
  });
});

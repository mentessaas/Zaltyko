#!/usr/bin/env tsx
/**
 * Script para migrar console.log/error/warn a logger
 * 
 * Uso:
 *   pnpm tsx scripts/migrate-console-to-logger.ts [--dry-run] [--file path/to/file.ts]
 * 
 * Opciones:
 *   --dry-run: Solo muestra los cambios sin aplicarlos
 *   --file: Migrar solo un archivo específico
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

interface Replacement {
  pattern: RegExp;
  replacement: string;
  description: string;
}

const replacements: Replacement[] = [
  {
    pattern: /console\.log\(([^)]+)\)/g,
    replacement: "logger.info($1)",
    description: "console.log → logger.info",
  },
  {
    pattern: /console\.error\(([^)]+)\)/g,
    replacement: "logger.error($1)",
    description: "console.error → logger.error",
  },
  {
    pattern: /console\.warn\(([^)]+)\)/g,
    replacement: "logger.warn($1)",
    description: "console.warn → logger.warn",
  },
  {
    pattern: /console\.debug\(([^)]+)\)/g,
    replacement: "logger.debug($1)",
    description: "console.debug → logger.debug",
  },
];

function needsLoggerImport(content: string): boolean {
  return /logger\.(info|error|warn|debug|apiError|dbOperation|externalService)/.test(content) &&
    !/import.*logger.*from/.test(content);
}

function addLoggerImport(content: string): string {
  // Buscar la última línea de import
  const importLines = content.match(/^import .+$/gm) || [];
  if (importLines.length === 0) {
    // Si no hay imports, agregar al principio
    return `import { logger } from "@/lib/logger";\n\n${content}`;
  }
  
  const lastImportIndex = content.lastIndexOf(importLines[importLines.length - 1]);
  const lastImportEnd = content.indexOf("\n", lastImportIndex);
  const beforeImports = content.substring(0, lastImportEnd + 1);
  const afterImports = content.substring(lastImportEnd + 1);
  
  return `${beforeImports}import { logger } from "@/lib/logger";\n${afterImports}`;
}

function migrateFile(filePath: string, dryRun: boolean): { changed: boolean; changes: string[] } {
  const content = readFileSync(filePath, "utf-8");
  let newContent = content;
  const changes: string[] = [];
  
  // Aplicar reemplazos
  for (const { pattern, replacement, description } of replacements) {
    const matches = content.match(pattern);
    if (matches) {
      newContent = newContent.replace(pattern, replacement);
      changes.push(`${description}: ${matches.length} ocurrencias`);
    }
  }
  
  // Agregar import si es necesario
  if (needsLoggerImport(newContent)) {
    newContent = addLoggerImport(newContent);
    changes.push("Agregado import de logger");
  }
  
  const changed = newContent !== content;
  
  if (changed && !dryRun) {
    writeFileSync(filePath, newContent, "utf-8");
  }
  
  return { changed, changes };
}

function findTsFiles(dir: string, fileList: string[] = []): string[] {
  const files = readdirSync(dir);
  
  for (const file of files) {
    const filePath = join(dir, file);
    const stat = statSync(filePath);
    
    // Ignorar node_modules, .next, etc.
    if (file.startsWith(".") || file === "node_modules" || file === ".next" || file === "dist") {
      continue;
    }
    
    if (stat.isDirectory()) {
      findTsFiles(filePath, fileList);
    } else if (extname(file) === ".ts" || extname(file) === ".tsx") {
      fileList.push(filePath);
    }
  }
  
  return fileList;
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const fileArg = args.find(arg => arg.startsWith("--file="));
  const specificFile = fileArg ? fileArg.split("=")[1] : null;
  
  console.log(dryRun ? "🔍 Modo dry-run (no se aplicarán cambios)" : "🚀 Modo ejecución");
  console.log("");
  
  const files = specificFile 
    ? [specificFile]
    : findTsFiles(join(process.cwd(), "src"));
  
  let totalChanged = 0;
  let totalFiles = 0;
  
  for (const file of files) {
    const { changed, changes } = migrateFile(file, dryRun);
    
    if (changed) {
      totalFiles++;
      totalChanged += changes.length;
      console.log(`✅ ${file}`);
      changes.forEach(change => console.log(`   - ${change}`));
    }
  }
  
  console.log("");
  console.log(`📊 Resumen:`);
  console.log(`   Archivos modificados: ${totalFiles}`);
  console.log(`   Cambios totales: ${totalChanged}`);
  
  if (dryRun) {
    console.log("");
    console.log("💡 Ejecuta sin --dry-run para aplicar los cambios");
  }
}

if (require.main === module) {
  main();
}


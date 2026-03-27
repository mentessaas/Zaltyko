#!/usr/bin/env tsx
/**
 * Script para reemplazar console.log/warn/error con el logger estructurado
 *
 * Uso: npx tsx scripts/replace-console-log.ts
 *
 * ADVERTENCIA: Hacer backup antes de ejecutar. Revisar cambios después.
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

const LOG_LEVELS = ['log', 'warn', 'error', 'info', 'debug'] as const;

function shouldIgnore(filePath: string): boolean {
  const ignorePatterns = [
    'node_modules',
    '.next',
    'dist',
    'build',
    '.git',
    'scripts/replace-console-log.ts',
  ];
  return ignorePatterns.some(pattern => filePath.includes(pattern));
}

function replaceConsoleCalls(content: string, filePath: string): { content: string; count: number } {
  let count = 0;
  let result = content;

  // Skip if file already imports logger
  if (result.includes('from "@/lib/logger"') || result.includes("from '@/lib/logger'")) {
    return { content: result, count: 0 };
  }

  // Pattern: console.log/error/warn/info/debug(...)
  // We only replace simple cases, not console.assert etc.
  for (const level of LOG_LEVELS) {
    // Match console.log/error etc followed by ( but not console.log.
    const pattern = new RegExp(`console\\.(${level})\\s*\\(([^)]*)\\)`, 'g');

    result = result.replace(pattern, (match, logLevel, args) => {
      count++;

      // Simple cases - just string or variable
      if (args.trim().startsWith('"') || args.trim().startsWith("'") || args.trim().startsWith('`')) {
        // String literal - use logger.info/warn/error
        const loggerMethod = logLevel === 'log' ? 'info' : logLevel;
        return `logger.${loggerMethod}(${args})`;
      }

      // Object/array - wrap in message
      if (args.includes('{') || args.includes('[')) {
        const loggerMethod = logLevel === 'log' ? 'info' : logLevel;
        return `logger.${loggerMethod}("${logLevel === 'log' ? 'Info' : logLevel.charAt(0).toUpperCase() + logLevel.slice(1)}", ${args.trim()})`;
      }

      // Variable or expression
      const loggerMethod = logLevel === 'log' ? 'info' : logLevel;
      return `logger.${loggerMethod}(String(${args.trim()}))`;
    });
  }

  return { content: result, count };
}

function processFile(filePath: string): number {
  if (shouldIgnore(filePath)) return 0;

  const ext = extname(filePath);
  if (!['.ts', '.tsx'].includes(ext)) return 0;

  try {
    const content = readFileSync(filePath, 'utf-8');
    const { content: newContent, count } = replaceConsoleCalls(content, filePath);

    if (count > 0) {
      // Add logger import if not present and we made changes
      if (!newContent.includes('from "@/lib/logger"') && !newContent.includes("from '@/lib/logger'")) {
        // Find a good place to add the import - after the last import line
        const lines = newContent.split('\n');
        let insertIndex = 0;
        for (let i = lines.length - 1; i >= 0; i--) {
          if (lines[i].trim().startsWith('import ')) {
            insertIndex = i + 1;
            break;
          }
        }
        lines.splice(insertIndex, 0, 'import { logger } from "@/lib/logger";');
        writeFileSync(filePath, lines.join('\n'));
      } else {
        writeFileSync(filePath, newContent);
      }
      console.log(`  ✓ ${filePath}: ${count} console.* calls replaced`);
      return count;
    }
  } catch (error) {
    console.error(`  ✗ Error processing ${filePath}:`, error);
  }
  return 0;
}

function processDirectory(dirPath: string): number {
  if (shouldIgnore(dirPath)) return 0;

  let total = 0;
  try {
    const entries = readdirSync(dirPath);
    for (const entry of entries) {
      const fullPath = join(dirPath, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        total += processDirectory(fullPath);
      } else {
        total += processFile(fullPath);
      }
    }
  } catch (error) {
    console.error(`  ✗ Error reading directory ${dirPath}:`, error);
  }
  return total;
}

// Only run if called directly
if (require.main === module) {
  const srcDir = join(process.cwd(), 'src');
  console.log('Replacing console.log/warn/error with structured logger...\n');
  const total = processDirectory(srcDir);
  console.log(`\n✓ Total: ${total} console.* calls replaced`);
  console.log('\n⚠️  Please review the changes and ensure logger is properly imported.');
  console.log('⚠️  Some complex console.log calls may need manual fixing.');
}

export { processFile, processDirectory, replaceConsoleCalls };

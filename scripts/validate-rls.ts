/**
 * RLS Policy Validation Script
 *
 * Validates tenant-scoped Drizzle tables against the SQL sources used by the
 * project: supabase/rls-consolidated.sql plus supabase/migrations/*.sql.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { basename, join, relative } from "path";

interface SchemaTable {
  table: string;
  file: string;
  tenantScoped: boolean;
}

interface SqlPolicy {
  name: string;
  table: string;
  file: string;
  lineNumber: number;
}

interface ValidationResult {
  success: boolean;
  duplicatePolicies: SqlPolicy[][];
  missingRls: SchemaTable[];
  missingPolicies: SchemaTable[];
  tenantTables: SchemaTable[];
  policyTables: string[];
  coverage: number;
  errors: string[];
}

const ROOT = process.cwd();
const SCHEMA_DIR = join(ROOT, "src/db/schema");
const SUPABASE_DIR = join(ROOT, "supabase");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) return walk(fullPath);
    return entry.endsWith(".ts") ? [fullPath] : [];
  });
}

function extractSchemaTables(): SchemaTable[] {
  const files = walk(SCHEMA_DIR);
  const tables: SchemaTable[] = [];

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const matches = [...source.matchAll(/pgTable\(\s*["']([^"']+)["']/g)];

    for (let index = 0; index < matches.length; index++) {
      const match = matches[index];
      const start = match.index ?? 0;
      const end = matches[index + 1]?.index ?? source.length;
      const block = source.slice(start, end);

      tables.push({
        table: match[1],
        file: relative(ROOT, file),
        tenantScoped: /\btenantId\s*:|["']tenant_id["']/.test(block),
      });
    }
  }

  return tables.sort((a, b) => a.table.localeCompare(b.table));
}

function sqlFiles(): Array<{ path: string; name: string }> {
  const files = [{ path: join(SUPABASE_DIR, "rls-consolidated.sql"), name: "rls-consolidated.sql" }];
  const migrationsDir = join(SUPABASE_DIR, "migrations");

  if (existsSync(migrationsDir)) {
    for (const entry of readdirSync(migrationsDir).sort()) {
      if (entry.endsWith(".sql")) {
        files.push({ path: join(migrationsDir, entry), name: `migrations/${entry}` });
      }
    }
  }

  return files;
}

function extractPolicies(filePath: string, fileName: string): SqlPolicy[] {
  const content = readFileSync(filePath, "utf8");
  const policies: SqlPolicy[] = [];
  const policyRegex = /CREATE\s+POLICY\s+"([^"]+)"\s+ON\s+"?([a-zA-Z0-9_]+)"?/gi;

  let match;
  while ((match = policyRegex.exec(content)) !== null) {
    policies.push({
      name: match[1],
      table: match[2],
      file: fileName,
      lineNumber: content.slice(0, match.index).split("\n").length,
    });
  }

  return policies;
}

function extractRlsTables(filePath: string): Set<string> {
  const content = readFileSync(filePath, "utf8");
  const tables = new Set<string>();
  const rlsRegex = /ALTER\s+TABLE\s+"?([a-zA-Z0-9_]+)"?\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi;

  let match;
  while ((match = rlsRegex.exec(content)) !== null) {
    tables.add(match[1]);
  }

  return tables;
}

function findDuplicatePolicies(policies: SqlPolicy[]): SqlPolicy[][] {
  const grouped = new Map<string, SqlPolicy[]>();

  for (const policy of policies) {
    // rls-consolidated.sql is a current-state snapshot while migrations are
    // historical deltas. The same policy is expected to appear in both, or to
    // be replaced by a later migration after DROP POLICY. A duplicate is only
    // actionable when one SQL source declares the same policy more than once.
    const key = `${policy.file}:${policy.table}:${policy.name}`;
    grouped.set(key, [...(grouped.get(key) ?? []), policy]);
  }

  return [...grouped.values()].filter((items) => items.length > 1);
}

export function validateRLS(): ValidationResult {
  const errors: string[] = [];
  const schemaTables = extractSchemaTables();
  const tenantTables = schemaTables.filter((table) => table.tenantScoped);
  const files = sqlFiles();
  const allPolicies: SqlPolicy[] = [];
  const rlsTables = new Set<string>();

  for (const file of files) {
    try {
      allPolicies.push(...extractPolicies(file.path, file.name));
      for (const table of extractRlsTables(file.path)) {
        rlsTables.add(table);
      }
    } catch (error) {
      errors.push(`Error reading ${file.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const policyTables = new Set(allPolicies.map((policy) => policy.table));
  const missingRls = tenantTables.filter((table) => !rlsTables.has(table.table));
  const missingPolicies = tenantTables.filter((table) => !policyTables.has(table.table));
  const duplicatePolicies = findDuplicatePolicies(allPolicies);
  const covered = tenantTables.filter(
    (table) => rlsTables.has(table.table) && policyTables.has(table.table)
  ).length;
  const coverage = tenantTables.length === 0 ? 100 : (covered / tenantTables.length) * 100;

  return {
    success:
      errors.length === 0 &&
      duplicatePolicies.length === 0 &&
      missingRls.length === 0 &&
      missingPolicies.length === 0,
    duplicatePolicies,
    missingRls,
    missingPolicies,
    tenantTables,
    policyTables: [...policyTables].sort(),
    coverage,
    errors,
  };
}

function formatTable(table: SchemaTable) {
  return `${table.table} (${table.file})`;
}

function generateReport(result: ValidationResult): string {
  const lines: string[] = [
    "",
    "===========================================================",
    "  RLS POLICY VALIDATION REPORT",
    "===========================================================",
    "",
    `Status: ${result.success ? "PASS" : "FAIL"}`,
    `Tenant-scoped tables: ${result.tenantTables.length}`,
    `Coverage: ${result.coverage.toFixed(1)}%`,
    "",
  ];

  if (result.errors.length > 0) {
    lines.push("ERRORS:");
    result.errors.forEach((error) => lines.push(`  - ${error}`));
    lines.push("");
  }

  if (result.duplicatePolicies.length > 0) {
    lines.push(`DUPLICATE POLICIES (${result.duplicatePolicies.length}):`);
    for (const group of result.duplicatePolicies) {
      lines.push(`  - ${group[0].table}.${group[0].name}`);
      group.forEach((policy) => lines.push(`    ${policy.file}:${policy.lineNumber}`));
    }
    lines.push("");
  } else {
    lines.push("No duplicate policy declarations found inside an individual SQL source", "");
  }

  if (result.missingRls.length > 0) {
    lines.push(`TENANT TABLES WITHOUT RLS (${result.missingRls.length}):`);
    result.missingRls.forEach((table) => lines.push(`  - ${formatTable(table)}`));
    lines.push("");
  } else {
    lines.push("All tenant-scoped tables have RLS enabled in SQL sources", "");
  }

  if (result.missingPolicies.length > 0) {
    lines.push(`TENANT TABLES WITHOUT POLICIES (${result.missingPolicies.length}):`);
    result.missingPolicies.forEach((table) => lines.push(`  - ${formatTable(table)}`));
    lines.push("");
  } else {
    lines.push("All tenant-scoped tables have at least one policy in SQL sources", "");
  }

  lines.push("SQL sources checked:");
  sqlFiles().forEach((file) => lines.push(`  - ${file.name}`));
  lines.push("", "===========================================================");

  return lines.join("\n");
}

if (require.main === module) {
  const result = validateRLS();
  console.log(generateReport(result));

  if (!result.success) {
    process.exitCode = 1;
  }
}

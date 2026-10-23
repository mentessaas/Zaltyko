/**
 * RLS Policy Validation Script
 *
 * Validates tenant-scoped Drizzle tables against the SQL sources used by the
 * project: supabase/rls-consolidated.sql plus supabase/migrations/*.sql.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { dirname, isAbsolute, join, relative, resolve } from "path";

export interface TableIdentity {
  schema: string;
  table: string;
}

export interface SchemaTable extends TableIdentity {
  file: string;
  tenantScoped: boolean;
}

export interface SqlSource {
  name: string;
  content: string;
}

export interface SqlPolicy extends TableIdentity {
  name: string;
  file: string;
  lineNumber: number;
}

export interface ValidationResult {
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
const IDENTIFIER = String.raw`(?:"((?:""|[^"])*)"|([a-zA-Z_][a-zA-Z0-9_$]*))`;

function identityKey(identity: TableIdentity): string {
  return JSON.stringify([identity.schema, identity.table]);
}

function displayIdentity(identity: TableIdentity): string {
  return `${identity.schema}.${identity.table}`;
}

function normalizeIdentifier(quoted: string | undefined, unquoted: string | undefined): string {
  return quoted === undefined ? (unquoted ?? "").toLowerCase() : quoted.replace(/""/g, '"');
}

/** Replace comment characters with spaces while preserving line numbers and quoted text. */
function stripComments(source: string, sqlSource = false): string {
  const chars = source.split("");
  let quote: "'" | '"' | "`" | null = null;
  const dollarString = /^(\$[A-Za-z_][A-Za-z0-9_]*\$|\$\$)/;

  for (let index = 0; index < chars.length; index++) {
    const current = chars[index];
    const next = chars[index + 1];

    if (quote) {
      if (current === "\\") {
        index++;
      } else if (current === quote) {
        if (quote !== "`" && next === quote) {
          index++;
        } else {
          quote = null;
        }
      }
      continue;
    }

    if (current === "'" || current === '"' || current === "`") {
      quote = current;
      continue;
    }

    if (sqlSource && current === "$") {
      const delimiter = source.slice(index).match(dollarString)?.[1];
      if (delimiter) {
        const end = source.indexOf(delimiter, index + delimiter.length);
        if (end !== -1) index = end + delimiter.length - 1;
        continue;
      }
    }

    if (current === "/" && next === "/") {
      while (index < chars.length && chars[index] !== "\n") chars[index++] = " ";
      index--;
      continue;
    }

    if (current === "/" && next === "*") {
      chars[index] = " ";
      chars[++index] = " ";
      let depth = 1;
      while (index < chars.length) {
        if (chars[index] === "/" && chars[index + 1] === "*") {
          chars[index] = " ";
          chars[++index] = " ";
          depth++;
          continue;
        }
        if (chars[index] === "*" && chars[index + 1] === "/") {
          chars[index] = " ";
          chars[++index] = " ";
          if (--depth === 0) break;
          continue;
        }
        if (chars[index] !== "\n") chars[index] = " ";
        index++;
      }
      continue;
    }

    if (sqlSource && current === "-") {
      if (next === "-") {
        while (index < chars.length && chars[index] !== "\n") chars[index++] = " ";
        index--;
      }
    }
  }

  return chars.join("");
}

function maskStringLiterals(source: string): string {
  const chars = source.split("");
  let quote: "'" | '"' | "`" | null = null;

  for (let index = 0; index < chars.length; index++) {
    const current = chars[index];
    if (quote) {
      if (current === "\\") {
        if (chars[index] !== "\n") chars[index] = " ";
        index++;
        if (chars[index] !== "\n") chars[index] = " ";
      } else if (current === quote) {
        chars[index] = " ";
        quote = null;
      } else if (current !== "\n") {
        chars[index] = " ";
      }
      continue;
    }

    if (current === "'" || current === '"' || current === "`") {
      chars[index] = " ";
      quote = current;
    }
  }

  return chars.join("");
}

function maskSqlStringLiterals(source: string): string {
  const chars = source.split("");
  const dollarString = /^(\$[A-Za-z_][A-Za-z0-9_]*\$|\$\$)/;

  for (let index = 0; index < chars.length; index++) {
    if (chars[index] === "'") {
      chars[index] = " ";
      while (++index < chars.length) {
        const current = chars[index];
        if (current === "\\") {
          if (chars[index] !== "\n") chars[index] = " ";
          index++;
          if (chars[index] !== "\n") chars[index] = " ";
        } else if (current === "'") {
          if (chars[index + 1] === "'") {
            chars[index] = " ";
            chars[++index] = " ";
          } else {
            chars[index] = " ";
            break;
          }
        } else if (current !== "\n") {
          chars[index] = " ";
        }
      }
      continue;
    }

    if (chars[index] === "$") {
      const delimiter = source.slice(index).match(dollarString)?.[1];
      if (!delimiter) continue;
      const end = source.indexOf(delimiter, index + delimiter.length);
      if (end === -1) continue;
      for (let masked = index; masked < end + delimiter.length; masked++) {
        if (chars[masked] !== "\n") chars[masked] = " ";
      }
      index = end + delimiter.length - 1;
    }
  }

  return chars.join("");
}

function readQuotedString(source: string, start: number): { value: string; end: number } | null {
  let cursor = start;
  const quote = source[cursor];
  if (quote !== "'" && quote !== '"') return null;

  let value = "";
  for (cursor++; cursor < source.length; cursor++) {
    const current = source[cursor];
    if (current === "\\") {
      const escaped = source[++cursor];
      if (escaped === undefined) return null;
      value += escaped;
    } else if (current === quote) {
      return { value, end: cursor + 1 };
    } else {
      value += current;
    }
  }
  return null;
}

function readStringArgument(source: string, openingParen: number): { value: string; end: number } | null {
  let cursor = openingParen + 1;
  while (/\s/.test(source[cursor] ?? "")) cursor++;
  return readQuotedString(source, cursor);
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) return walk(fullPath);
    return entry.endsWith(".ts") ? [fullPath] : [];
  });
}

function localPgSchemas(code: string): Map<string, string> {
  const schemas = new Map<string, string>();
  const codeOnly = maskStringLiterals(code);
  const schemaDeclaration = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*pgSchema\s*\(/g;
  for (const match of codeOnly.matchAll(schemaDeclaration)) {
    const openingParen = (match.index ?? 0) + match[0].lastIndexOf("(");
    const argument = readStringArgument(code, openingParen);
    if (argument) schemas.set(match[1], argument.value);
  }
  return schemas;
}

function exportedPgSchemas(source: string): Map<string, string> {
  const code = stripComments(source);
  const schemas = localPgSchemas(code);
  const exports = new Map<string, string>();
  const exportedSchema = /\bexport\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*pgSchema\s*\(/g;
  for (const match of maskStringLiterals(code).matchAll(exportedSchema)) {
    const schema = schemas.get(match[1]);
    if (schema) exports.set(match[1], schema);
  }
  return exports;
}

function importedPgSchemas(
  source: SqlSource,
  exportsByPath: Map<string, Map<string, string>>,
  sourceRoot: string
): Map<string, string> {
  const code = stripComments(source.content);
  const codeOnly = maskStringLiterals(code);
  const schemas = new Map<string, string>();
  const importNamed = /\bimport\s*\{([^}]+)\}\s*from\b/g;
  const sourcePath = isAbsolute(source.name) ? resolve(source.name) : resolve(sourceRoot, source.name);

  for (const match of codeOnly.matchAll(importNamed)) {
    let moduleOffset = (match.index ?? 0) + match[0].length;
    while (/\s/.test(code[moduleOffset] ?? "")) moduleOffset++;
    const moduleSpecifier = readQuotedString(code, moduleOffset)?.value;
    if (!moduleSpecifier?.startsWith(".")) continue;
    const targetBase = resolve(dirname(sourcePath), moduleSpecifier);
    const targetPath = targetBase.endsWith(".ts") ? targetBase : `${targetBase}.ts`;
    const exports = exportsByPath.get(targetPath);
    if (!exports) continue;

    for (const specifier of match[1].split(",")) {
      const imported = specifier.trim().match(/^(?:type\s+)?([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
      if (!imported) continue;
      const schema = exports.get(imported[1]);
      if (schema) schemas.set(imported[2] ?? imported[1], schema);
    }
  }

  return schemas;
}

export function extractSchemaTablesFromSource(
  source: string,
  file: string,
  importedSchemas: ReadonlyMap<string, string> = new Map()
): SchemaTable[] {
  const code = stripComments(source);
  const codeOnly = maskStringLiterals(code);
  const schemas = new Map<string, string>(importedSchemas);
  for (const [alias, schema] of localPgSchemas(code)) schemas.set(alias, schema);

  const definitions: Array<{ start: number; schema: string; table: string }> = [];
  const publicTable = /\bpgTable\s*\(/g;
  const schemaTable = /\b([A-Za-z_$][\w$]*)\s*\.\s*table\s*\(/g;
  const inlineSchema = /\bpgSchema\s*\(/g;

  for (const match of codeOnly.matchAll(publicTable)) {
    const argument = readStringArgument(code, (match.index ?? 0) + match[0].lastIndexOf("("));
    if (argument) definitions.push({ start: match.index ?? 0, schema: "public", table: argument.value });
  }
  for (const match of codeOnly.matchAll(schemaTable)) {
    const schema = schemas.get(match[1]);
    const argument = readStringArgument(code, (match.index ?? 0) + match[0].lastIndexOf("("));
    if (schema && argument) definitions.push({ start: match.index ?? 0, schema, table: argument.value });
  }
  for (const match of codeOnly.matchAll(inlineSchema)) {
    const schemaArgument = readStringArgument(code, (match.index ?? 0) + match[0].lastIndexOf("("));
    if (!schemaArgument) continue;
    let cursor = schemaArgument.end;
    while (/\s/.test(code[cursor] ?? "")) cursor++;
    if (code[cursor] !== ")") continue;
    cursor++;
    while (/\s/.test(code[cursor] ?? "")) cursor++;
    if (code[cursor] !== ".") continue;
    cursor++;
    while (/\s/.test(code[cursor] ?? "")) cursor++;
    if (!code.startsWith("table", cursor) || /[\w$]/.test(code[cursor + 5] ?? "")) continue;
    cursor += "table".length;
    while (/\s/.test(code[cursor] ?? "")) cursor++;
    if (code[cursor] !== "(") continue;
    const tableArgument = readStringArgument(code, cursor);
    if (tableArgument) definitions.push({ start: match.index ?? 0, schema: schemaArgument.value, table: tableArgument.value });
  }

  definitions.sort((left, right) => left.start - right.start);
  return definitions.map((definition, index) => {
    const end = definitions[index + 1]?.start ?? code.length;
    const block = code.slice(definition.start, end);
    const blockCode = maskStringLiterals(block);
    return {
      schema: definition.schema,
      table: definition.table,
      file,
      tenantScoped: /\b(?:tenantId|organizationId)\s*:/.test(blockCode),
    };
  }).sort((left, right) => left.schema.localeCompare(right.schema) || left.table.localeCompare(right.table));
}

export function extractPoliciesFromSource(content: string, fileName: string): SqlPolicy[] {
  const sql = stripComments(content, true);
  const sqlCode = maskSqlStringLiterals(sql);
  const policyRegex = new RegExp(
    String.raw`\bCREATE\s+POLICY\s+(?:"((?:""|[^"])*)"|([a-zA-Z_][a-zA-Z0-9_$]*))\s+ON\s+(?:(${IDENTIFIER})\s*\.\s*)?(${IDENTIFIER})(?=\s|;|$)`,
    "gi"
  );
  const policies: SqlPolicy[] = [];

  for (const match of sqlCode.matchAll(policyRegex)) {
    const schema = match[3] === undefined ? "public" : normalizeIdentifier(match[4], match[5]);
    const table = normalizeIdentifier(match[7], match[8]);
    policies.push({
      name: normalizeIdentifier(match[1], match[2]),
      schema,
      table,
      file: fileName,
      lineNumber: sql.slice(0, match.index ?? 0).split("\n").length,
    });
  }

  return policies;
}

export function extractRlsTablesFromSource(content: string): Set<string> {
  const sql = stripComments(content, true);
  const sqlCode = maskSqlStringLiterals(sql);
  const rlsRegex = new RegExp(
    String.raw`\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(?:(${IDENTIFIER})\s*\.\s*)?(${IDENTIFIER})\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY\b`,
    "gi"
  );
  const tables = new Set<string>();

  for (const match of sqlCode.matchAll(rlsRegex)) {
    const schema = match[1] === undefined ? "public" : normalizeIdentifier(match[2], match[3]);
    const table = normalizeIdentifier(match[5], match[6]);
    tables.add(identityKey({ schema, table }));
  }

  return tables;
}

function findDuplicatePolicies(policies: SqlPolicy[]): SqlPolicy[][] {
  const grouped = new Map<string, SqlPolicy[]>();

  for (const policy of policies) {
    // Consolidated SQL is a current-state snapshot while migrations are
    // historical deltas. Duplicates are actionable only inside one source.
    const key = `${policy.file}:${identityKey(policy)}:${policy.name}`;
    grouped.set(key, [...(grouped.get(key) ?? []), policy]);
  }

  return [...grouped.values()].filter((items) => items.length > 1);
}

export function validateRLSFromSources(
  schemaSources: SqlSource[],
  sqlSources: SqlSource[],
  sourceErrors: string[] = [],
  sourceRoot: string = ROOT
): ValidationResult {
  const errors = [...sourceErrors];
  const exportsByPath = new Map<string, Map<string, string>>(
    schemaSources.map((source) => [
      isAbsolute(source.name) ? resolve(source.name) : resolve(sourceRoot, source.name),
      exportedPgSchemas(source.content),
    ] as const)
  );
  const schemaTables = schemaSources.flatMap((source) =>
    extractSchemaTablesFromSource(
      source.content,
      source.name,
      importedPgSchemas(source, exportsByPath, sourceRoot)
    )
  );
  const tenantTables = schemaTables.filter((table) => table.tenantScoped);
  if (tenantTables.length === 0) {
    errors.push("No tenant-scoped schema tables found; RLS coverage cannot pass with an empty inventory.");
  }
  const allPolicies = sqlSources.flatMap((source) => extractPoliciesFromSource(source.content, source.name));
  const rlsTables = new Set<string>();

  for (const source of sqlSources) {
    for (const table of extractRlsTablesFromSource(source.content)) rlsTables.add(table);
  }

  const policyIdentities = new Set(allPolicies.map((policy) => identityKey(policy)));
  const missingRls = tenantTables.filter((table) => !rlsTables.has(identityKey(table)));
  const missingPolicies = tenantTables.filter((table) => !policyIdentities.has(identityKey(table)));
  const duplicatePolicies = findDuplicatePolicies(allPolicies);
  const covered = tenantTables.filter(
    (table) => rlsTables.has(identityKey(table)) && policyIdentities.has(identityKey(table))
  ).length;
  const coverage = tenantTables.length === 0 ? 0 : (covered / tenantTables.length) * 100;

  return {
    success:
      errors.length === 0 &&
      schemaSources.length > 0 &&
      sqlSources.length > 0 &&
      tenantTables.length > 0 &&
      duplicatePolicies.length === 0 &&
      missingRls.length === 0 &&
      missingPolicies.length === 0,
    duplicatePolicies,
    missingRls,
    missingPolicies,
    tenantTables,
    policyTables: [...new Set(allPolicies.map(displayIdentity))].sort(),
    coverage,
    errors,
  };
}

function schemaFiles(root: string): string[] {
  const schemaDir = join(root, "src/db/schema");
  if (!existsSync(schemaDir) || !statSync(schemaDir).isDirectory()) {
    throw new Error("Required schema source not found: src/db/schema/");
  }
  return walk(schemaDir);
}

function sqlFiles(root: string): Array<{ path: string; name: string }> {
  const supabaseDir = join(root, "supabase");
  const files = [{ path: join(supabaseDir, "rls-consolidated.sql"), name: "rls-consolidated.sql" }];
  const migrationsDir = join(supabaseDir, "migrations");

  if (existsSync(migrationsDir) && statSync(migrationsDir).isDirectory()) {
    for (const entry of readdirSync(migrationsDir).sort()) {
      if (entry.endsWith(".sql")) files.push({ path: join(migrationsDir, entry), name: `migrations/${entry}` });
    }
  }

  return files;
}

export function validateRLS(root: string = ROOT): ValidationResult {
  const sourceErrors: string[] = [];
  const schemaSources: SqlSource[] = [];
  const sources: SqlSource[] = [];
  let schemaPaths: string[] = [];

  try {
    schemaPaths = schemaFiles(root);
    if (schemaPaths.length === 0) sourceErrors.push("Required schema source not found: src/db/schema/*.ts");
  } catch (error) {
    sourceErrors.push(error instanceof Error ? error.message : String(error));
  }

  for (const path of schemaPaths) {
    try {
      schemaSources.push({ name: relative(root, path), content: readFileSync(path, "utf8") });
    } catch (error) {
      sourceErrors.push(`Error reading schema source ${relative(root, path)}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const files = sqlFiles(root);
  for (const file of files) {
    try {
      sources.push({ name: file.name, content: readFileSync(file.path, "utf8") });
    } catch (error) {
      sourceErrors.push(`Error reading ${file.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const migrationsDir = join(root, "supabase/migrations");
  if (!existsSync(migrationsDir) || !statSync(migrationsDir).isDirectory()) {
    sourceErrors.push("Required SQL source not found: migrations/");
  } else if (!files.some((file) => file.name.startsWith("migrations/"))) {
    sourceErrors.push("Required SQL source not found: migrations/*.sql");
  }

  return validateRLSFromSources(schemaSources, sources, sourceErrors, root);
}

function formatTable(table: SchemaTable): string {
  return `${displayIdentity(table)} (${table.file})`;
}

function generateReport(result: ValidationResult, root: string = ROOT): string {
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
      lines.push(`  - ${displayIdentity(group[0])}.${group[0].name}`);
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
  sqlFiles(root).forEach((file) => lines.push(`  - ${file.name}`));
  lines.push("", "===========================================================");

  return lines.join("\n");
}

if (typeof require !== "undefined" && require.main === module) {
  const result = validateRLS();
  console.log(generateReport(result));

  if (!result.success) process.exitCode = 1;
}

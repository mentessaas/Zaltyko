import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { PgDialect, getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { PAYMENT_REMINDERS_TABLES } from "@/modules/payment-reminders/application/storage";
import { paymentReminderSettings, paymentReminders } from "@/modules/payment-reminders/infrastructure/payment-reminders-schema";

/**
 * Contrato del candidato SQL de recordatorios de impago. Las tablas no están en
 * supabase/migrations, así que este test protege que el candidato, el espejo
 * Drizzle y la detección de almacenamiento coincidan; que ambas tablas tengan
 * RLS forzado y REVOKE a clientes directos; que drizzle-kit no pueda crearlas
 * por su cuenta; y las garantías de privacidad (nada de correo ni nombre del
 * destinatario en el registro) y de ruta (solo propiedad o administración).
 */

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

const CANDIDATE_FILE = "20261114120000_payment_reminders_candidate.sql";
const CANDIDATE = `docs/deployment/candidates/${CANDIDATE_FILE}`;
const SCHEMA = "src/modules/payment-reminders/infrastructure/payment-reminders-schema.ts";
const TABLES = Object.keys(PAYMENT_REMINDERS_TABLES).sort();

const stripSqlComments = (sql: string) => sql.replace(/--[^\n]*/g, "");
const normalize = (expression: string) => expression.replace(/\s+/g, " ").trim().toLowerCase();

const SQL_TYPES: Record<string, string> = {
  uuid: "uuid",
  text: "text",
  timestamptz: "timestamp with time zone",
  integer: "integer",
  boolean: "boolean",
  bigint: "bigint",
};

type CandidateColumn = { name: string; type: string; notNull: boolean; hasDefault: boolean };

function tableBlocks(sql: string): Map<string, string> {
  const blocks = new Map<string, string>();
  for (const match of stripSqlComments(sql).matchAll(/create table zaltyko\.([a-z_]+) \(\n([\s\S]*?)\n\);/g)) {
    blocks.set(match[1], match[2]);
  }
  return blocks;
}

function candidateColumns(block: string): CandidateColumn[] {
  return block
    .split("\n")
    .map((line) => line.match(/^  ([a-z_]+) (uuid|text|timestamptz|integer|boolean|bigint)\b(.*)$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => ({
      name: match[1],
      type: SQL_TYPES[match[2]],
      notNull: /\bnot null\b|\bprimary key\b/.test(match[3]),
      hasDefault: /\bdefault\b/.test(match[3]),
    }))
    .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
}

function candidateChecks(block: string): Map<string, string> {
  const checks = new Map<string, string>();
  for (const match of block.matchAll(/constraint ([a-z_]+)\s+check \(/g)) {
    let depth = 1;
    let index = match.index! + match[0].length;
    const start = index;
    while (depth > 0) {
      const char = block[index++];
      if (char === "(") depth += 1;
      if (char === ")") depth -= 1;
      if (char === undefined) throw new Error(`CHECK sin cerrar: ${match[1]}`);
    }
    checks.set(match[1], normalize(block.slice(start, index - 1)));
  }
  return checks;
}

const named = (block: string, kind: "unique" | "foreign key") =>
  [...block.matchAll(new RegExp(`constraint ([a-z_]+)\\s+${kind} \\(`, "g"))].map((match) => match[1]).sort();

describe("candidato SQL de recordatorios de impago", () => {
  const sql = read(CANDIDATE);
  const lower = sql.toLowerCase();
  const body = stripSqlComments(lower);
  const blocks = tableBlocks(sql);
  const drizzleTables = new Map(
    [paymentReminderSettings, paymentReminders].map((table) => {
      const config = getTableConfig(table);
      return [config.name, config] as const;
    })
  );
  const dialect = new PgDialect();

  it("se marca como pendiente de autorización y no está en el historial aplicable", () => {
    expect(lower).toContain("requiere autorización de elvis");
    expect(lower).toContain("candidate only");
    expect(lower).toContain("no aplicado en ningún entorno");
    expect(existsSync(join(ROOT, "supabase/migrations", CANDIDATE_FILE))).toBe(false);
    for (const entry of readdirSync(join(ROOT, "supabase/migrations"))) {
      expect(read(`supabase/migrations/${entry}`), entry).not.toMatch(/payment_reminder_settings|payment_reminders/);
    }
    const readme = read("docs/deployment/candidates/README.md");
    expect(readme).toContain(CANDIDATE_FILE);
    expect(readme.toLowerCase()).toContain("requiere autorización de elvis");
  });

  it("crea exactamente las dos tablas y exige PostgreSQL 15+ antes de crear nada", () => {
    expect([...blocks.keys()].sort()).toEqual(TABLES);
    const firstCreate = body.indexOf("create table");
    const version = body.indexOf("current_setting('server_version_num')::integer < 150000");
    expect(version).toBeGreaterThan(0);
    expect(version).toBeLessThan(firstCreate);
    expect(body.slice(0, firstCreate)).toContain("requires postgresql 15 or later");
    // Reinstalar aborta antes de tocar nada.
    expect(body.slice(0, firstCreate)).toMatch(/to_regclass\('zaltyko\.payment_reminders'\) is not null/);
    expect(body).not.toMatch(/\b(drop|truncate|delete from|update zaltyko)\b/);
    expect(body).not.toMatch(/alter table zaltyko\.(?!payment_reminder)/);
  });

  it("repite en Drizzle y en la detección de almacenamiento las mismas columnas", () => {
    for (const table of TABLES) {
      const columns = candidateColumns(blocks.get(table)!);
      expect(columns.map((column) => column.name), table).toEqual(
        [...PAYMENT_REMINDERS_TABLES[table as keyof typeof PAYMENT_REMINDERS_TABLES]].sort()
      );
      const drizzleColumns = drizzleTables
        .get(table)!
        .columns.map((column) => ({
          name: column.name,
          type: column.getSQLType(),
          notNull: column.notNull,
          hasDefault: column.hasDefault,
        }))
        .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
      expect(drizzleColumns, table).toEqual(columns);
    }
  });

  it("la detección de almacenamiento ordena las columnas como PostgreSQL con collate C", () => {
    for (const table of TABLES) {
      const listed = PAYMENT_REMINDERS_TABLES[table as keyof typeof PAYMENT_REMINDERS_TABLES];
      expect([...listed], table).toEqual([...listed].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0)));
    }
  });

  it("repite en Drizzle los CHECK, únicos, índices y FK con los mismos nombres", () => {
    for (const table of TABLES) {
      const block = blocks.get(table)!;
      const config = drizzleTables.get(table)!;
      const drizzleChecks = Object.fromEntries(
        config.checks.map((check) => [check.name, normalize(dialect.sqlToQuery(check.value).sql)])
      );
      expect(drizzleChecks, table).toEqual(Object.fromEntries(candidateChecks(block)));
      expect(config.uniqueConstraints.map((unique) => unique.getName()).sort(), table).toEqual(named(block, "unique"));
      expect(
        config.foreignKeys.map((fk) => fk.getName()).filter((name) => !name.endsWith("_organizations_id_fk")).sort(),
        table
      ).toEqual(named(block, "foreign key"));
      for (const index of config.indexes) {
        expect(body, index.config.name).toContain(`create index ${index.config.name}\n  on zaltyko.${table}(`);
      }
    }
    const names = [...body.matchAll(/(?:constraint|create index) ([a-z_]+)/g)].map((match) => match[1]);
    for (const name of names) expect(name.length, name).toBeLessThan(63);
  });

  it("los límites de la plantilla y de los días coinciden con el dominio", () => {
    const checks = candidateChecks(blocks.get("payment_reminder_settings")!);
    expect(checks.get("payment_reminder_settings_interval_check")).toBe("min_interval_days between 1 and 90");
    expect(checks.get("payment_reminder_settings_auto_after_check")).toBe("auto_after_days between 1 and 60");
    expect(checks.get("payment_reminder_settings_subject_check")).toContain("<= 150");
    expect(checks.get("payment_reminder_settings_body_check")).toContain("<= 4000");
    expect(checks.get("payment_reminder_settings_instructions_check")).toContain("<= 1000");
    // Por defecto: 7 días y automático apagado.
    const columns = candidateColumns(blocks.get("payment_reminder_settings")!);
    expect(blocks.get("payment_reminder_settings")).toMatch(/min_interval_days integer not null default 7,/);
    expect(blocks.get("payment_reminder_settings")).toMatch(/is_auto_enabled boolean not null default false,/);
    expect(columns.find((column) => column.name === "is_auto_enabled")?.hasDefault).toBe(true);
    const reminders = candidateChecks(blocks.get("payment_reminders")!);
    expect(reminders.get("payment_reminders_origin_check")).toBe("origin in ('manual', 'automatic')");
    expect(reminders.get("payment_reminders_status_check")).toBe("status in ('pending', 'sent', 'failed')");
  });

  it("el registro no guarda correo, nombre, teléfono ni texto del mensaje del destinatario", () => {
    const columns = candidateColumns(blocks.get("payment_reminders")!).map((column) => column.name);
    for (const forbidden of ["email", "to_email", "name", "given_name", "family_name", "phone", "subject", "body", "message", "error"]) {
      expect(columns, forbidden).not.toContain(forbidden);
    }
    // Solo la ficha del tutor pagador, por id.
    expect(columns).toContain("guardian_id");
  });

  it("ningún borrado queda bloqueado: cascada en cuota y academia, SET NULL de una columna en personas", () => {
    expect(body).not.toMatch(/on delete restrict|on delete no action/);
    const fkOnDelete = (block: string) =>
      new Map(
        [...block.matchAll(/constraint ([a-z_]+)\s+foreign key \([^)]*\) references [^\n]*? on delete (cascade|set null)(?: \(([a-z_]+)\))?/g)].map(
          (match) => [match[1], { action: match[2], columns: match[3] ?? null }] as const
        )
      );
    const expected: Record<string, { action: string; columns: string | null }> = {
      payment_reminder_settings_member_fk: { action: "set null", columns: "updated_by_member_id" },
      payment_reminders_charge_fk: { action: "cascade", columns: null },
      payment_reminders_guardian_fk: { action: "set null", columns: "guardian_id" },
      payment_reminders_member_fk: { action: "set null", columns: "requested_by_member_id" },
    };
    const found = new Map([...blocks.values()].flatMap((block) => [...fkOnDelete(block)]));
    expect(Object.fromEntries(found)).toEqual(expected);
    for (const table of TABLES) {
      for (const fk of drizzleTables.get(table)!.foreignKeys) {
        const name = fk.getName();
        if (name.endsWith("_organizations_id_fk")) continue;
        expect(fk.onDelete, name).toBe(expected[name]!.action);
      }
    }
    for (const [table, column] of [
      ["payment_reminder_settings", "updated_by_member_id"],
      ["payment_reminders", "guardian_id"],
      ["payment_reminders", "requested_by_member_id"],
    ] as const) {
      expect(candidateColumns(blocks.get(table)!).find((item) => item.name === column)?.notNull, column).toBe(false);
    }
  });

  it("habilita y fuerza RLS y revoca a public, anon y authenticated en todas, sin políticas ni grants", () => {
    for (const table of TABLES) {
      expect(lower, table).toContain(`alter table zaltyko.${table} enable row level security;`);
      expect(lower, table).toContain(`alter table zaltyko.${table} force row level security;`);
      expect(lower, table).toContain(`revoke all on table zaltyko.${table} from public, anon, authenticated;`);
    }
    expect(body).not.toMatch(/\bgrant\b/);
    expect(body).not.toMatch(/create policy/);
  });

  it("ancla cada tabla a la academia y las referencias a la misma academia", () => {
    for (const table of TABLES) {
      const block = body.match(new RegExp(`create table zaltyko\\.${table} \\(([\\s\\S]*?)\\n\\);`))![1];
      expect(block, table).toContain("organization_id uuid");
      expect(block, table).toContain("references zaltyko.organizations(id) on delete cascade");
      for (const reference of block.matchAll(/foreign key \(([^)]*)\) references zaltyko\.([a-z_]+)/g)) {
        expect(reference[1].startsWith("organization_id,"), `${table} → ${reference[2]}`).toBe(true);
      }
    }
    expect(body).toContain(
      "foreign key (organization_id, charge_id) references zaltyko.charges(organization_id, id) on delete cascade"
    );
    expect(body).toContain(
      "foreign key (organization_id, guardian_id) references zaltyko.guardians(organization_id, id) on delete set null (guardian_id)"
    );
  });
});

describe("el esquema de recordatorios queda fuera de drizzle-kit y de validate:rls", () => {
  it("no se exporta desde los índices ni vive en src/db/schema", () => {
    for (const path of ["src/db/schema/index.ts", "src/db/zaltyko-schema.ts"]) {
      expect(read(path), path).not.toMatch(/modules\/payment-reminders|payment-reminders-schema/);
    }
    expect(read("drizzle.config.ts")).not.toMatch(/modules\/payment-reminders|payment-reminders-schema/);
    const schemaDir = join(ROOT, "src/db/schema");
    for (const entry of readdirSync(schemaDir)) {
      const path = join(schemaDir, entry);
      if (statSync(path).isFile()) {
        expect(readFileSync(path, "utf8"), entry).not.toMatch(/"payment_reminder_settings"|"payment_reminders"/);
      }
    }
    expect(read(SCHEMA)).toContain("NO se exporta");
  });
});

describe("rutas API de recordatorios de cuotas", () => {
  const dir = "src/app/api/v1/owner/billing/payment-reminders";
  const routes = [`${dir}/route.ts`, `${dir}/preview/route.ts`, `${dir}/settings/route.ts`];

  it("autentican antes de validar, documentan su guard y exigen mismo origen en las mutaciones", () => {
    for (const route of routes) {
      const source = read(route);
      expect(source, route).toContain("getCurrentUser(request)");
      expect(source.indexOf("getCurrentUser(request)"), route).toBeLessThan(source.indexOf("safeParse("));
      expect(source, route).toMatch(/@auth-flexible route-guard-reason: \S/);
    }
    for (const route of [routes[0], routes[1], routes[2]]) {
      const source = read(route);
      const mutation = source.match(/export async function (POST|PUT)[\s\S]*$/)![0];
      expect(mutation, route).toContain("sameOriginProblem(request)");
      expect(mutation.indexOf("sameOriginProblem(request)"), route).toBeLessThan(mutation.indexOf("safeParse("));
    }
  });

  it("no aceptan destinatarios ni correos en el cuerpo: solo cuotas de la academia", () => {
    for (const route of routes) {
      const source = read(route);
      expect(source, route).not.toMatch(/\b(to|email|recipient)\s*:\s*z\./);
    }
    const service = read("src/modules/payment-reminders/application/service.ts");
    expect(service).toContain("requireReminderRole(scope.member.role)");
  });

  it("el cron del recordatorio automático exige el secreto y no está programado en vercel.json", () => {
    const cron = read("src/app/api/cron/family-payment-reminders/route.ts");
    expect(cron).toContain("requireCronAuth(request)");
    expect(cron.indexOf("requireCronAuth(request)")).toBeLessThan(cron.indexOf("runAutomaticPaymentReminders"));
    expect(read("vercel.json")).not.toContain("family-payment-reminders");
  });
});

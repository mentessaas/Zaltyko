/**
 * Characterization tests for the monthly invoice service.
 *
 * They pin the CURRENT behaviour of `monthly-invoice-service.ts` before any
 * refactor: the monthly quote (lines, amounts, currency, blocking reasons and
 * quote hash), and issuance (lock order, re-quote under locks, replays by key
 * and by period, the ledger command, outbox and audit payloads).
 *
 * The database is real Drizzle (node-postgres dialect) with a fake session:
 * every query is compiled to SQL, classified by its text and answered by the
 * scenario. Tests pin the order of the statements (including begin, commit
 * and rollback and the collaborators below), their exact parameters and,
 * through a file snapshot, their normalized SQL. The fake does NOT evaluate
 * WHERE clauses, joins, row locks or constraints:
 * monthly-invoice-service-pg.test.ts covers those on a disposable PostgreSQL.
 *
 * Collaborators replaced by recorders: assertOperationalAccess, lockCommand,
 * appendOutboxEvent, appendAuditEntry and issueInvoiceInTransaction (the
 * ledger). assertIdempotencyPayload, keyset pagination and due-date
 * conversion stay real.
 *
 * Tests named "CURRENT BEHAVIOUR" pin behaviour that looks like a bug or an
 * inconsistency. They exist so a refactor does not change it by accident;
 * fixing it is a separate, deliberate change.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

vi.unmock("drizzle-orm");
vi.unmock("drizzle-orm/pg-core");
vi.unmock("drizzle-orm/node-postgres");

const hooks = vi.hoisted(() => ({
  query: null as
    | null
    | ((sqlText: string, params: unknown[], mapped: boolean) => Promise<unknown>),
  dependency: null as null | ((name: string, args: unknown[]) => unknown),
}));

vi.mock("@/db", async () => {
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const db = drizzle.mock();
  const session = Reflect.get(db, "session") as Record<string, unknown>;
  // Every builder, raw execute and begin/commit/rollback goes through here.
  session.prepareQuery = (query: { sql: string; params: unknown[] }, fields: unknown) => {
    const prepared = {
      joinsNotNullableMap: undefined as unknown,
      setToken: () => prepared,
      mapResult: (result: unknown) => result,
      execute: () => hooks.query!(query.sql, query.params, fields !== undefined),
      all: () => hooks.query!(query.sql, query.params, true),
    };
    return prepared;
  };
  return { db };
});

vi.mock("@/modules/shared/infrastructure/operational-authorization", () => ({
  assertOperationalAccess: async (_tx: unknown, input: unknown) =>
    hooks.dependency!("access", [input]),
}));

vi.mock("@/modules/shared/infrastructure/transactional-records", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/modules/shared/infrastructure/transactional-records")
  >()),
  lockCommand: async (_tx: unknown, organizationId: string, key: string) =>
    hooks.dependency!("lockCommand", [organizationId, key]),
  appendOutboxEvent: async (_tx: unknown, event: unknown) =>
    hooks.dependency!("appendOutbox", [event]),
  appendAuditEntry: async (_tx: unknown, entry: unknown) =>
    hooks.dependency!("appendAudit", [entry]),
}));

vi.mock("@/modules/billing/application/ledger-service", () => ({
  issueInvoiceInTransaction: async (_tx: unknown, command: unknown, options: unknown) =>
    hooks.dependency!("issueInvoice", [command, options]),
}));

import {
  getMonthlyInvoiceOptions,
  issueMonthlyInvoice,
  monthlyInvoiceReference,
} from "@/modules/billing/application/monthly-invoice-service";
import { OperationalError } from "@/modules/shared/domain/operational-error";

// ---------------------------------------------------------------------------
// Synthetic identities (ordered so keyset cursors always advance)
// ---------------------------------------------------------------------------

const id = (prefix: string, n: number) =>
  `${prefix}0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const ORG = id("1", 1);
const LOC = id("1", 2);
const LOC_2 = id("1", 3);
const ACTOR = { userId: id("1", 4), memberId: id("1", 5) };
const FAM = id("2", 1);
const FAM_2 = id("2", 2);
const PAYER = id("3", 1);
const PAYER_2 = id("3", 2);
const MEM_A = id("4", 1);
const MEM_B = id("4", 2);
const MEM_A_2 = id("4", 3);
const ATH_A = id("5", 1);
const ATH_B = id("5", 2);
const ENR_A1 = id("6", 1);
const ENR_A2 = id("6", 2);
const ENR_B1 = id("6", 3);
const CLS_1 = id("7", 1);
const CLS_2 = id("7", 2);
const PLAN = id("8", 1);
const PLAN_USD = id("8", 2);
const ASG_A1 = id("9", 1);
const ASG_A2 = id("9", 2);
const ASG_B1 = id("9", 3);
const COV_1 = id("a", 1);
const COV_2 = id("a", 2);
const COV_USD = id("a", 3);
const INVOICE = id("b", 1);
const INVOICE_2 = id("b", 2);
const LINE_A = id("c", 1);
const LINE_B = id("c", 2);
const CHARGE = id("d", 1);
const CHARGE_2 = id("d", 2);
const MARKER = id("f", 1);

const PERIOD = "2026-11";
const START = "2026-11-01";
const END = "2026-11-30";
const DUE_DATE = "2026-11-15";
// 23:59:59.999 in Europe/Madrid (UTC+1 in November).
const DUE_AT = "2026-11-15T22:59:59.999Z";
const KEY = "monthly-key-0001";
const FINANCIAL_ROLES = ["owner", "admin"];
const PRICING_NOTE =
  "Una cuota mensual completa por gimnasta; las clases incluidas se declaran explícitamente. No se prorratea.";

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
/**
 * Monthly invoice reference, written out independently of the service:
 * `MENSUAL-YYYYMM-<familyId>-<first 16 hex of the site hash>`.
 */
const siteTag = (locationId: string) =>
  sha256(`zaltyko:monthly-invoice-site:v1:${locationId}`).slice(0, 16);
const REFERENCE = `MENSUAL-202611-${FAM}-${siteTag(LOC)}`;

// ---------------------------------------------------------------------------
// Fixture rows (keys are the Drizzle field names the service selects)
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

const planRow = (overrides: Row = {}): Row => ({
  id: PLAN,
  name: "Cuota mensual",
  amountCents: 4500,
  currency: "EUR",
  cadence: "monthly",
  ...overrides,
});

const enrollmentRow = (overrides: Row = {}): Row => ({
  enrollmentId: ENR_A1,
  athleteId: ATH_A,
  classTemplateId: CLS_1,
  className: "Iniciación",
  classEffectiveFrom: "2026-09-01",
  classEffectiveTo: null,
  athleteName: "Ana Pérez",
  familySortName: "Pérez",
  givenSortName: "Ana",
  status: "active",
  startsOn: "2026-10-01",
  endsOn: null,
  ...overrides,
});
const enrollmentB = (overrides: Row = {}) =>
  enrollmentRow({
    enrollmentId: ENR_B1,
    athleteId: ATH_B,
    athleteName: "Bruno Pérez",
    givenSortName: "Bruno",
    ...overrides,
  });

const memberRow = (overrides: Row = {}): Row => ({
  memberId: MEM_A,
  familyId: FAM,
  athleteId: ATH_A,
  startsOn: "2026-01-01",
  endsOn: null,
  familyIsActive: true,
  ...overrides,
});
const memberB = (overrides: Row = {}) =>
  memberRow({ memberId: MEM_B, athleteId: ATH_B, ...overrides });

const assignmentRow = (overrides: Row = {}): Row => ({
  id: ASG_A1,
  organizationId: ORG,
  locationId: LOC,
  enrollmentId: ENR_A1,
  pricePlanId: PLAN,
  unitAmountCents: 4500,
  currency: "EUR",
  startsOn: "2026-10-01",
  endsOn: null,
  ...overrides,
});
const assignmentB = (overrides: Row = {}) =>
  assignmentRow({ id: ASG_B1, enrollmentId: ENR_B1, ...overrides });

const coverageRow = (overrides: Row = {}): Row => ({
  id: COV_1,
  pricePlanId: PLAN,
  classTemplateId: CLS_1,
  startsOn: "2026-09-01",
  endsOn: null,
  ...overrides,
});

const payerRow = (overrides: Row = {}): Row => ({
  familyId: FAM,
  familyPayerId: PAYER,
  isPrimary: true,
  displayName: "Laura Pérez",
  startsOn: "2026-01-01",
  endsOn: null,
  ...overrides,
});

// Stored with the reference format used before the site discriminator: replays
// by key and by period never read the reference.
const invoiceRow = (overrides: Row = {}): Row => ({
  id: INVOICE,
  organizationId: ORG,
  locationId: LOC,
  familyId: FAM,
  familyPayerId: PAYER,
  reference: `MENSUAL-202611-${FAM}`,
  status: "open",
  totalAmountCents: 9000,
  currency: "EUR",
  voidedAt: null,
  ...overrides,
});

const issuedLineRows = (overrides: Row = {}): Row[] => [
  {
    id: LINE_A,
    athleteId: ATH_A,
    sortAthleteId: ATH_A,
    enrollmentId: null,
    pricePlanId: PLAN,
    athleteName: "Ana Pérez",
    amountCents: 4500,
    currency: "EUR",
    ...overrides,
  },
  {
    id: LINE_B,
    athleteId: ATH_B,
    sortAthleteId: ATH_B,
    enrollmentId: null,
    pricePlanId: PLAN,
    athleteName: "Bruno Pérez",
    amountCents: 4500,
    currency: "EUR",
  },
];

const coveredRows = (): Row[] => [
  {
    invoiceLineId: LINE_A,
    enrollmentId: ENR_A1,
    classTemplateId: CLS_1,
    className: "Iniciación",
    assignmentId: ASG_A1,
  },
  {
    invoiceLineId: LINE_B,
    enrollmentId: ENR_B1,
    classTemplateId: CLS_1,
    className: "Iniciación",
    assignmentId: ASG_B1,
  },
];

const chargeRow = (overrides: Row = {}): Row => ({
  id: CHARGE,
  status: "due",
  collectionMode: "manual",
  ...overrides,
});

// ---------------------------------------------------------------------------
// Expected quote lines and hash (mirrors monthlyQuoteHash)
// ---------------------------------------------------------------------------

type HashLine = {
  athleteId: string;
  pricePlanId: string;
  amountCents: number;
  currency: string;
  coveredEnrollments: Array<{
    enrollmentId: string;
    classTemplateId: string;
    className: string;
    assignmentId: string;
  }>;
};

const covered = (enrollmentId: string, assignmentId: string, classTemplateId = CLS_1) => ({
  enrollmentId,
  classTemplateId,
  className: "Iniciación",
  assignmentId,
});

const hashLine = (overrides: Partial<HashLine> = {}): HashLine => ({
  athleteId: ATH_A,
  pricePlanId: PLAN,
  amountCents: 4500,
  currency: "EUR",
  coveredEnrollments: [covered(ENR_A1, ASG_A1)],
  ...overrides,
});
const HASH_LINE_A = hashLine();
const HASH_LINE_B = hashLine({ athleteId: ATH_B, coveredEnrollments: [covered(ENR_B1, ASG_B1)] });

function quoteHash(input: {
  lines: HashLine[];
  totalAmountCents: number;
  currency: string | null;
  blockingReasons?: string[];
  conflicts?: Array<{ athleteId: string; code: string; enrollmentIds: string[] }>;
  locationId?: string;
}): string {
  return sha256(
    JSON.stringify({
      organizationId: ORG,
      locationId: input.locationId ?? LOC,
      familyId: FAM,
      servicePeriod: PERIOD,
      lines: input.lines,
      conflicts: input.conflicts ?? [],
      blockingReasons: [...(input.blockingReasons ?? [])].sort(),
      totalAmountCents: input.totalAmountCents,
      currency: input.currency,
    })
  );
}

const QUOTE_HASH = quoteHash({
  lines: [HASH_LINE_A, HASH_LINE_B],
  totalAmountCents: 9000,
  currency: "EUR",
});

const markerRow = (payload: Row = {}): Row => ({
  id: MARKER,
  organizationId: ORG,
  locationId: LOC,
  eventName: "invoice.monthly_issued",
  aggregateType: "invoice",
  aggregateId: INVOICE,
  idempotencyKey: KEY,
  payload: {
    invoiceId: INVOICE,
    familyId: FAM,
    familyPayerId: PAYER,
    locationId: LOC,
    servicePeriod: PERIOD,
    dueAt: DUE_AT,
    quoteHash: QUOTE_HASH,
    totalAmountCents: 9000,
    currency: "EUR",
    pricingModel: "athlete_monthly_v1",
    athleteIds: [ATH_A, ATH_B],
    enrollmentIds: [ENR_A1, ENR_B1],
    ...payload,
  },
});

// ---------------------------------------------------------------------------
// Fake session: classify each compiled statement and answer from the scenario
// ---------------------------------------------------------------------------

type Statement =
  | "begin"
  | "commit"
  | "rollback"
  | "readLocation"
  | "readLocationTimezone"
  | "readPricePlans"
  | "readEnrollments"
  | "readFamilyMembers"
  | "readFamilyCohort"
  | "readPriceAssignments"
  | "readCoverage"
  | "readPayers"
  | "readExistingInvoices"
  | "readReferenceOwners"
  | "lockLocation"
  | "lockFamily"
  | "lockAthletes"
  | "lockEnrollments"
  | "lockPriceAssignments"
  | "lockCoverage"
  | "lockClassTemplates"
  | "lockPricePlans"
  | "findPriorMarker"
  | "findInvoiceMarker"
  | "findPeriodInvoices"
  | "findBilledAthletes"
  | "loadInvoice"
  | "readIssuedLines"
  | "readCoveredEnrollments"
  | "lockCharges";

type Dependency = "access" | "lockCommand" | "appendOutbox" | "appendAudit" | "issueInvoice";

const normalizeSql = (text: string) => text.replace(/\s+/g, " ").trim();

function classify(sqlText: string): Statement {
  const s = normalizeSql(sqlText).toLowerCase();
  if (s === "begin" || s === "commit" || s === "rollback") return s;
  // Raw row locks (unquoted identifiers).
  if (s.startsWith("select id from zaltyko.locations")) return "lockLocation";
  if (s.startsWith("select id from zaltyko.families")) return "lockFamily";
  if (s.startsWith("select id from zaltyko.athletes")) return "lockAthletes";
  if (s.startsWith("select id, class_template_id from zaltyko.enrollments")) return "lockEnrollments";
  if (s.startsWith("select id, price_plan_id from zaltyko.enrollment_price_assignments")) {
    return "lockPriceAssignments";
  }
  if (s.startsWith("select id from zaltyko.price_plan_class_template_coverage")) return "lockCoverage";
  if (s.startsWith("select id from zaltyko.class_templates")) return "lockClassTemplates";
  if (s.startsWith("select id from zaltyko.price_plans")) return "lockPricePlans";
  // Query builder statements.
  if (s.startsWith("select distinct")) return "findPeriodInvoices";
  const fromIndex = s.search(/ from "zaltyko"\./);
  const table = / from "zaltyko"\."([a-z_]+)"/.exec(s)?.[1];
  const selection = s.slice(0, fromIndex);
  const where = s.includes(" where ") ? s.slice(s.indexOf(" where ")) : "";
  switch (table) {
    case "locations":
      return selection.includes('"id"') ? "readLocation" : "readLocationTimezone";
    case "price_plans":
      return "readPricePlans";
    case "enrollments":
      return "readEnrollments";
    case "family_members":
      return s.includes('join "zaltyko"."families"') ? "readFamilyMembers" : "readFamilyCohort";
    case "enrollment_price_assignments":
      return "readPriceAssignments";
    case "price_plan_class_template_coverage":
      return "readCoverage";
    case "family_payers":
      return "readPayers";
    case "invoices":
      if (s.includes(" group by ")) return "readExistingInvoices";
      return where.includes('"reference" in') ? "readReferenceOwners" : "loadInvoice";
    case "outbox_events":
      return where.includes("aggregate_id") ? "findInvoiceMarker" : "findPriorMarker";
    case "invoice_lines":
      return s.includes('join "zaltyko"."invoices"') ? "findBilledAthletes" : "readIssuedLines";
    case "invoice_line_enrollments":
      return "readCoveredEnrollments";
    case "charges":
      return "lockCharges";
    default:
      throw new Error(`Unexpected SQL statement in characterization test: ${s.slice(0, 160)}`);
  }
}

type Handler = (params: unknown[], previousCalls: number) => Row[];
type Call = {
  name: Statement | Dependency;
  /** Trace label: the statement, or the collaborator with its key/intent. */
  label: string;
  params: unknown[];
  sql?: string;
};

const world: {
  handlers: Partial<Record<Statement, Handler>>;
  dependencies: Partial<Record<Dependency, (args: unknown[]) => unknown>>;
  calls: Call[];
} = { handlers: {}, dependencies: {}, calls: [] };

hooks.query = async (sqlText, params, mapped) => {
  const name = classify(sqlText);
  const previousCalls = world.calls.filter((call) => call.name === name).length;
  world.calls.push({ name, label: name, params, sql: normalizeSql(sqlText) });
  const handler = world.handlers[name];
  if (!handler) throw new Error(`No synthetic answer for SQL statement "${name}"`);
  const rows = handler(params, previousCalls);
  return mapped ? rows : { rows };
};

hooks.dependency = (name, args) => {
  const dependency = name as Dependency;
  let label: string = dependency;
  if (dependency === "access") {
    label = `access(${(args[0] as { intent?: string }).intent ?? "read"})`;
  } else if (dependency === "lockCommand") {
    label = `lockCommand(${String(args[1])})`;
  }
  world.calls.push({ name: dependency, label, params: args });
  return world.dependencies[dependency]?.(args);
};

const trace = () => world.calls.map((call) => call.label);
const callsOf = (name: Statement | Dependency) => world.calls.filter((call) => call.name === name);
const paramsOf = (name: Statement | Dependency) => callsOf(name).map((call) => call.params);

function resetWorld() {
  world.calls = [];
  world.dependencies = {
    issueInvoice: () => invoiceRow(),
  };
  world.handlers = {
    begin: () => [],
    commit: () => [],
    rollback: () => [],
    readLocation: () => [{ id: LOC, timezone: "Europe/Madrid" }],
    readLocationTimezone: () => [{ timezone: "Europe/Madrid" }],
    readPricePlans: () => [planRow()],
    readEnrollments: () => [enrollmentRow(), enrollmentB()],
    readFamilyMembers: () => [memberRow(), memberB()],
    readFamilyCohort: () => [
      { cursorId: MEM_A, athleteId: ATH_A },
      { cursorId: MEM_B, athleteId: ATH_B },
    ],
    readPriceAssignments: () => [assignmentRow(), assignmentB()],
    readCoverage: () => [coverageRow()],
    readPayers: () => [payerRow()],
    readExistingInvoices: () => [],
    readReferenceOwners: () => [],
    lockLocation: () => [{ id: LOC }],
    lockFamily: () => [{ id: FAM }],
    lockAthletes: () => [{ id: ATH_A }, { id: ATH_B }],
    lockEnrollments: () => [
      { id: ENR_A1, class_template_id: CLS_1 },
      { id: ENR_B1, class_template_id: CLS_1 },
    ],
    lockPriceAssignments: () => [
      { id: ASG_A1, price_plan_id: PLAN },
      { id: ASG_B1, price_plan_id: PLAN },
    ],
    lockCoverage: () => [{ id: COV_1 }],
    lockClassTemplates: () => [{ id: CLS_1 }],
    lockPricePlans: () => [{ id: PLAN }],
    findPriorMarker: () => [],
    findInvoiceMarker: () => [],
    findPeriodInvoices: () => [],
    findBilledAthletes: () => [],
    loadInvoice: () => [invoiceRow()],
    readIssuedLines: () => issuedLineRows(),
    readCoveredEnrollments: () => coveredRows(),
    lockCharges: () => [chargeRow()],
  };
}

/** Restricts the default fixture to athlete A (one enrollment, one family). */
function onlyAthleteA() {
  world.handlers.readEnrollments = () => [enrollmentRow()];
  world.handlers.readFamilyMembers = () => [memberRow()];
  world.handlers.readPriceAssignments = () => [assignmentRow()];
  world.handlers.readFamilyCohort = () => [{ cursorId: MEM_A, athleteId: ATH_A }];
}

// ---------------------------------------------------------------------------
// Bulk fixture for keyset pages and filter batches
// ---------------------------------------------------------------------------

const PAGE_SIZE = 200;
/**
 * 201 athletes of family FAM, each with one enrollment in a class of its own.
 * That forces a second enrollment page (200 + 1), a second athlete and
 * enrollment filter batch (200 + 1) with a cursor page inside the full batch,
 * and three (plan, class) coverage batches (100 + 100 + 1).
 */
const BULK_SIZE = 201;
const bulk = Array.from({ length: BULK_SIZE }, (_, index) => {
  const n = 1001 + index;
  return {
    athleteId: id("5", n),
    enrollmentId: id("6", n),
    classTemplateId: id("7", n),
    assignmentId: id("9", n),
    coverageId: id("a", n),
    memberId: id("4", n),
  };
});

/**
 * Answers a keyset read the way PostgreSQL would: only rows whose batch keys
 * are among the bound parameters, after the cursor (`"id" > $n`) when the
 * statement has one, ordered by id and cut at the bound limit.
 */
function keysetPager(
  rows: Row[],
  options: { idOf: (row: Row) => string; batchKeys?: string[] }
): Handler {
  return (params) => {
    const sqlText = world.calls.at(-1)!.sql!;
    const cursorPlaceholder = /"id" > \$(\d+)\) order by/.exec(sqlText)?.[1];
    const cursor = cursorPlaceholder ? String(params[Number(cursorPlaceholder) - 1]) : null;
    const limit = Number(params[params.length - 1]);
    return rows
      .filter((row) => (options.batchKeys ?? []).every((key) => params.includes(row[key])))
      .filter((row) => cursor === null || options.idOf(row) > cursor)
      .sort((left, right) => (options.idOf(left) < options.idOf(right) ? -1 : 1))
      .slice(0, limit);
  };
}

function bulkWorld() {
  world.handlers.readEnrollments = keysetPager(
    bulk.map((item) =>
      enrollmentRow({
        enrollmentId: item.enrollmentId,
        athleteId: item.athleteId,
        classTemplateId: item.classTemplateId,
      })
    ),
    { idOf: (row) => String(row.enrollmentId) }
  );
  world.handlers.readFamilyMembers = keysetPager(
    bulk.map((item) => memberRow({ memberId: item.memberId, athleteId: item.athleteId })),
    { idOf: (row) => String(row.memberId), batchKeys: ["athleteId"] }
  );
  world.handlers.readPriceAssignments = keysetPager(
    bulk.map((item) => assignmentRow({ id: item.assignmentId, enrollmentId: item.enrollmentId })),
    { idOf: (row) => String(row.id), batchKeys: ["enrollmentId"] }
  );
  world.handlers.readCoverage = keysetPager(
    bulk.map((item) => coverageRow({ id: item.coverageId, classTemplateId: item.classTemplateId })),
    { idOf: (row) => String(row.id), batchKeys: ["pricePlanId", "classTemplateId"] }
  );
}

beforeEach(() => {
  resetWorld();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ExpectedFailure = { code: string; status: number; details?: unknown };

async function expectFailure(promise: Promise<unknown>, expected: ExpectedFailure) {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught
  );
  expect(error, "expected the call to reject").toBeInstanceOf(OperationalError);
  const operational = error as OperationalError;
  expect({
    code: operational.code,
    status: operational.status,
    details: operational.details,
  }).toEqual({ code: expected.code, status: expected.status, details: expected.details });
}

const optionsInput = {
  organizationId: ORG,
  locationId: LOC,
  servicePeriod: PERIOD,
  actor: ACTOR,
};
const options = (overrides: Partial<typeof optionsInput> = {}) =>
  getMonthlyInvoiceOptions({ ...optionsInput, ...overrides });

const command = (overrides: Row = {}) =>
  ({
    organizationId: ORG,
    locationId: LOC,
    familyId: FAM,
    familyPayerId: PAYER,
    servicePeriod: PERIOD,
    dueDate: DUE_DATE,
    quoteHash: QUOTE_HASH,
    idempotencyKey: KEY,
    actor: ACTOR,
    ...overrides,
  }) as Parameters<typeof issueMonthlyInvoice>[0];

const readAccess = (locationId = LOC) => ({
  organizationId: ORG,
  locationId,
  actor: ACTOR,
  allowedRoles: FINANCIAL_ROLES,
});

/** Statements of one buildMonthlyInvoiceOptions pass for the default fixture. */
const OPTIONS_READS = [
  "access(read)",
  "readLocation",
  "readPricePlans",
  "readEnrollments",
  "readFamilyMembers",
  "readPriceAssignments",
  "readCoverage",
  "readPayers",
  "readExistingInvoices",
  "readReferenceOwners",
];

/** Locks and reads before the quote, in their fixed order. */
const ISSUE_PREFIX = [
  "begin",
  "access(read)",
  `lockCommand(monthly-period:${LOC}:${PERIOD})`,
  "lockLocation",
  `lockCommand(monthly-family:${FAM}:${PERIOD})`,
  `lockCommand(monthly-family-scope:${FAM})`,
  "lockFamily",
  "readLocationTimezone",
  "readFamilyCohort",
  "lockAthletes",
  "findPriorMarker",
];

/** Sorted per-enrollment command locks, then row locks of the priced scope. */
const ENROLLMENT_LOCKS = [
  `lockCommand(monthly-enrollment:${ENR_A1}:${PERIOD})`,
  `lockCommand(monthly-enrollment:${ENR_B1}:${PERIOD})`,
  "lockEnrollments",
  "lockPriceAssignments",
  "lockCoverage",
  "lockClassTemplates",
  "lockPricePlans",
];

const QUOTE_UNDER_LOCKS = [...ISSUE_PREFIX, ...OPTIONS_READS, ...ENROLLMENT_LOCKS, ...OPTIONS_READS];

const ISSUED_LINES = [
  {
    athleteId: ATH_A,
    enrollmentId: null,
    pricePlanId: PLAN,
    athleteName: "Ana Pérez",
    amountCents: 4500,
    currency: "EUR",
    coveredEnrollments: [covered(ENR_A1, ASG_A1)],
  },
  {
    athleteId: ATH_B,
    enrollmentId: null,
    pricePlanId: PLAN,
    athleteName: "Bruno Pérez",
    amountCents: 4500,
    currency: "EUR",
    coveredEnrollments: [covered(ENR_B1, ASG_B1)],
  },
];

// ---------------------------------------------------------------------------
// getMonthlyInvoiceOptions
// ---------------------------------------------------------------------------

describe("getMonthlyInvoiceOptions: quote", () => {
  it("quotes one monthly fee per athlete and hashes the quote", async () => {
    const result = await options();
    const assignedPrice = (assignmentId: string) => ({
      assignmentId,
      pricePlanId: PLAN,
      name: "Cuota mensual",
      amountCents: 4500,
      currency: "EUR",
      startsOn: "2026-10-01",
      endsOn: null,
    });
    expect(result).toEqual({
      organizationId: ORG,
      locationId: LOC,
      servicePeriod: PERIOD,
      servicePeriodStart: START,
      servicePeriodEnd: END,
      timezone: "Europe/Madrid",
      pricingNote: PRICING_NOTE,
      pricePlans: [planRow()],
      families: [
        {
          familyId: FAM,
          athleteNames: ["Ana Pérez", "Bruno Pérez"],
          payers: [{ familyPayerId: PAYER, displayName: "Laura Pérez", isPrimary: true }],
          enrollments: [
            {
              enrollmentId: ENR_A1,
              athleteId: ATH_A,
              athleteName: "Ana Pérez",
              status: "active",
              billable: true,
              blockingReasons: [],
              assignedPrice: assignedPrice(ASG_A1),
            },
            {
              enrollmentId: ENR_B1,
              athleteId: ATH_B,
              athleteName: "Bruno Pérez",
              status: "active",
              billable: true,
              blockingReasons: [],
              assignedPrice: assignedPrice(ASG_B1),
            },
          ],
          lines: [
            {
              athleteId: ATH_A,
              athleteName: "Ana Pérez",
              pricePlanId: PLAN,
              pricePlanName: "Cuota mensual",
              amountCents: 4500,
              currency: "EUR",
              coveredEnrollments: [covered(ENR_A1, ASG_A1)],
            },
            {
              athleteId: ATH_B,
              athleteName: "Bruno Pérez",
              pricePlanId: PLAN,
              pricePlanName: "Cuota mensual",
              amountCents: 4500,
              currency: "EUR",
              coveredEnrollments: [covered(ENR_B1, ASG_B1)],
            },
          ],
          conflicts: [],
          totalAmountCents: 9000,
          currency: "EUR",
          blockingReasons: [],
          canIssue: true,
          quoteHash: QUOTE_HASH,
          existingInvoiceId: null,
          existingInvoiceVoided: false,
        },
      ],
      unassignedEnrollments: [],
    });
    expect(trace()).toEqual(["begin", ...OPTIONS_READS, "commit"]);
  });

  it("filters every read by organization, site and the service month", async () => {
    await options();
    expect(paramsOf("access")).toEqual([[readAccess()]]);
    expect(paramsOf("readLocation")).toEqual([[ORG, LOC, true, 1]]);
    expect(paramsOf("readPricePlans")).toEqual([[ORG, true, "monthly", 200]]);
    expect(paramsOf("readEnrollments")).toEqual([
      [true, ORG, LOC, "active", "pending", END, START, 200],
    ]);
    expect(paramsOf("readFamilyMembers")).toEqual([[ORG, ATH_A, ATH_B, END, START, 200]]);
    expect(paramsOf("readPriceAssignments")).toEqual([[ORG, ENR_A1, ENR_B1, END, START, 200]]);
    // One (plan, class) pair even though two enrollments share it.
    expect(paramsOf("readCoverage")).toEqual([[ORG, LOC, END, START, PLAN, CLS_1, 200]]);
    // Payers must cover the whole month: starts_on <= start and ends_on >= end.
    expect(paramsOf("readPayers")).toEqual([[true, true, ORG, FAM, START, END, 200]]);
    expect(paramsOf("readExistingInvoices")).toEqual([
      [ORG, LOC, FAM, "monthly_fee", START, END, 200],
    ]);
    // The reference is unique per organization, so this lookup is not per site.
    expect(paramsOf("readReferenceOwners")).toEqual([[ORG, REFERENCE, 200]]);
  });

  it("rejects an invalid period with a 422 inside the transaction", async () => {
    await expectFailure(options({ servicePeriod: "2026-13" }), {
      code: "INVALID_DATE_RANGE",
      status: 422,
    });
    expect(trace()).toEqual(["begin", "rollback"]);
  });

  it.each([
    ["2026-02", "2026-02-28"],
    ["2028-02", "2028-02-29"],
    ["2026-12", "2026-12-31"],
  ])("uses the calendar month %s up to %s", async (servicePeriod, end) => {
    const result = await options({ servicePeriod });
    expect(result.servicePeriodEnd).toBe(end);
    expect(paramsOf("readEnrollments")[0]).toEqual([
      true,
      ORG,
      LOC,
      "active",
      "pending",
      end,
      `${servicePeriod}-01`,
      200,
    ]);
  });

  it("returns 404 when the site is missing or inactive", async () => {
    world.handlers.readLocation = () => [];
    await expectFailure(options(), { code: "NOT_FOUND", status: 404 });
    expect(trace()).toEqual(["begin", "access(read)", "readLocation", "rollback"]);
  });

  it("does not query members, prices or payers when there are no enrollments", async () => {
    world.handlers.readEnrollments = () => [];
    await expect(options()).resolves.toMatchObject({ families: [], unassignedEnrollments: [] });
    expect(trace()).toEqual([
      "begin",
      "access(read)",
      "readLocation",
      "readPricePlans",
      "readEnrollments",
      "commit",
    ]);
  });

  it("lists an enrollment without family as unassigned", async () => {
    onlyAthleteA();
    world.handlers.readFamilyMembers = () => [];
    const result = await options();
    expect(result.families).toEqual([]);
    expect(result.unassignedEnrollments).toEqual([
      {
        enrollmentId: ENR_A1,
        athleteId: ATH_A,
        athleteName: "Ana Pérez",
        status: "active",
        blockingReasons: ["FAMILY_REQUIRED"],
      },
    ]);
  });
});

describe("getMonthlyInvoiceOptions: blocking reasons", () => {
  // Single athlete A. The family is blocked: its only enrollment is not
  // billable, so no line is produced and NO_ACTIVE_ENROLLMENTS is added.
  it.each([
    ["a pending enrollment", () => {
      world.handlers.readEnrollments = () => [enrollmentRow({ status: "pending" })];
    }, ["ENROLLMENT_PENDING"], ["NO_ACTIVE_ENROLLMENTS"]],
    ["an enrollment starting mid-month", () => {
      world.handlers.readEnrollments = () => [enrollmentRow({ startsOn: "2026-11-05" })];
    }, ["ENROLLMENT_PERIOD_INCOMPLETE"], null],
    ["an enrollment ending before month end", () => {
      world.handlers.readEnrollments = () => [enrollmentRow({ endsOn: "2026-11-29" })];
    }, ["ENROLLMENT_PERIOD_INCOMPLETE"], null],
    ["a class that ends mid-month", () => {
      world.handlers.readEnrollments = () => [enrollmentRow({ classEffectiveTo: "2026-11-15" })];
    }, ["CLASS_PERIOD_INCOMPLETE"], null],
    ["a class starting mid-month", () => {
      world.handlers.readEnrollments = () => [enrollmentRow({ classEffectiveFrom: "2026-11-02" })];
    }, ["CLASS_PERIOD_INCOMPLETE"], null],
    ["a family membership starting mid-month", () => {
      world.handlers.readFamilyMembers = () => [memberRow({ startsOn: "2026-11-02" })];
    }, ["FAMILY_MEMBERSHIP_PERIOD_INCOMPLETE"], null],
    ["an inactive family", () => {
      world.handlers.readFamilyMembers = () => [memberRow({ familyIsActive: false })];
    }, ["FAMILY_INACTIVE"], null],
    ["no price assignment", () => {
      world.handlers.readPriceAssignments = () => [];
    }, ["PRICE_ASSIGNMENT_REQUIRED"], null],
    ["two price assignments", () => {
      world.handlers.readPriceAssignments = () => [
        assignmentRow(),
        assignmentRow({ id: ASG_A2, startsOn: "2026-11-01" }),
      ];
    }, ["PRICE_ASSIGNMENT_AMBIGUOUS"], null],
    ["an assignment starting mid-month", () => {
      world.handlers.readPriceAssignments = () => [assignmentRow({ startsOn: "2026-11-02" })];
    }, ["PRICE_ASSIGNMENT_PERIOD_INCOMPLETE"], null],
    ["a one-character class name", () => {
      world.handlers.readEnrollments = () => [enrollmentRow({ className: "  A  " })];
    }, ["CLASS_NAME_SNAPSHOT_INVALID"], null],
    ["an inactive or non-monthly plan", () => {
      world.handlers.readPricePlans = () => [];
    }, ["PRICE_PLAN_NOT_AVAILABLE"], null],
    ["an assignment in another currency than the plan", () => {
      world.handlers.readPriceAssignments = () => [assignmentRow({ currency: "USD" })];
    }, ["PRICE_ASSIGNMENT_CURRENCY_MISMATCH"], null],
    ["a plan without currency", () => {
      world.handlers.readPricePlans = () => [planRow({ currency: null })];
    }, ["PRICE_ASSIGNMENT_CURRENCY_MISMATCH"], null],
    ["a fractional amount", () => {
      world.handlers.readPriceAssignments = () => [assignmentRow({ unitAmountCents: 4500.5 })];
    }, ["PRICE_AMOUNT_UNSAFE"], null],
    ["an unsafe integer amount", () => {
      world.handlers.readPriceAssignments = () => [
        assignmentRow({ unitAmountCents: Number.MAX_SAFE_INTEGER + 1 }),
      ];
    }, ["PRICE_AMOUNT_UNSAFE"], null],
    ["a zero amount", () => {
      world.handlers.readPriceAssignments = () => [assignmentRow({ unitAmountCents: 0 })];
    }, ["PRICE_PLAN_ZERO_AMOUNT"], null],
    ["a negative amount", () => {
      world.handlers.readPriceAssignments = () => [assignmentRow({ unitAmountCents: -1 })];
    }, ["PRICE_PLAN_ZERO_AMOUNT"], null],
    ["no tariff coverage for the class", () => {
      world.handlers.readCoverage = () => [];
    }, ["TARIFF_COVERAGE_INCOMPLETE"], null],
    ["a tariff coverage ending mid-month", () => {
      world.handlers.readCoverage = () => [coverageRow({ endsOn: "2026-11-29" })];
    }, ["TARIFF_COVERAGE_INCOMPLETE"], null],
  ] as Array<[string, () => void, string[], string[] | null]>)(
    "blocks %s",
    async (_label, setup, enrollmentReasons, familyReasons) => {
      onlyAthleteA();
      setup();
      const [family] = (await options()).families;
      expect(family!.enrollments[0]).toMatchObject({
        billable: false,
        blockingReasons: enrollmentReasons,
      });
      expect(family!.lines).toEqual([]);
      expect(family!.canIssue).toBe(false);
      expect(family!.totalAmountCents).toBe(0);
      expect(family!.blockingReasons).toEqual(
        familyReasons ?? [...enrollmentReasons, "NO_ACTIVE_ENROLLMENTS"]
      );
    }
  );

  it("reports tariff coverage gaps as a conflict of the athlete", async () => {
    onlyAthleteA();
    world.handlers.readCoverage = () => [];
    const [family] = (await options()).families;
    expect(family!.conflicts).toEqual([
      { athleteId: ATH_A, code: "TARIFF_COVERAGE_INCOMPLETE", enrollmentIds: [ENR_A1] },
    ]);
    // The price is still shown even though no line can be billed.
    expect(family!.enrollments[0]!.assignedPrice).toMatchObject({ amountCents: 4500 });
  });

  it("puts an athlete with two family memberships in both families as ambiguous", async () => {
    onlyAthleteA();
    world.handlers.readFamilyMembers = () => [
      memberRow(),
      memberRow({ memberId: MEM_A_2, familyId: FAM_2 }),
    ];
    world.handlers.readPayers = () => [payerRow(), payerRow({ familyId: FAM_2, familyPayerId: PAYER_2 })];
    const { families } = await options();
    expect(families.map((family) => family.familyId)).toEqual([FAM, FAM_2]);
    for (const family of families) {
      expect(family.enrollments[0]!.blockingReasons).toEqual(["FAMILY_MEMBERSHIP_AMBIGUOUS"]);
      expect(family.canIssue).toBe(false);
    }
  });

  it("blocks a family without a payer valid for the whole month", async () => {
    world.handlers.readPayers = () => [];
    const [family] = (await options()).families;
    expect(family!.blockingReasons).toEqual(["FAMILY_PAYER_REQUIRED"]);
    expect(family!.lines).toHaveLength(2);
    expect(family!.quoteHash).toBe(
      quoteHash({
        lines: [HASH_LINE_A, HASH_LINE_B],
        totalAmountCents: 9000,
        currency: "EUR",
        blockingReasons: ["FAMILY_PAYER_REQUIRED"],
      })
    );
  });

  it.each([
    ["an open invoice", { status: "open", voidedAt: null }, "PERIOD_ALREADY_INVOICED", false],
    ["a void invoice", { status: "void", voidedAt: null }, "INVOICE_VOIDED", true],
    ["a voided timestamp", { status: "open", voidedAt: new Date("2026-11-03T10:00:00Z") }, "INVOICE_VOIDED", true],
  ])("blocks a family that already has %s for the month", async (_label, invoice, reason, voided) => {
    world.handlers.readExistingInvoices = () => [
      { familyId: FAM, invoiceId: INVOICE, locationId: LOC, ...invoice },
    ];
    const [family] = (await options()).families;
    expect(family).toMatchObject({
      existingInvoiceId: INVOICE,
      existingInvoiceVoided: voided,
      blockingReasons: [reason],
      canIssue: false,
    });
  });

  it("blocks a family with a monthly invoice for the month that has no site", async () => {
    // invoices.location_id is nullable. The per-site replay never matches such
    // an invoice, so the quote blocks instead of offering a second invoice.
    world.handlers.readExistingInvoices = () => [
      { familyId: FAM, invoiceId: INVOICE_2, locationId: null, status: "open", voidedAt: null },
    ];
    const [family] = (await options()).families;
    expect(family).toMatchObject({
      existingInvoiceId: null,
      existingInvoiceVoided: false,
      blockingReasons: ["PERIOD_INVOICED_WITHOUT_SITE"],
      canIssue: false,
    });
  });

  it("blocks a family whose reference another invoice of the organization already holds", async () => {
    world.handlers.readReferenceOwners = () => [{ invoiceId: INVOICE_2, reference: REFERENCE }];
    const [family] = (await options()).families;
    expect(family).toMatchObject({
      existingInvoiceId: null,
      blockingReasons: ["INVOICE_REFERENCE_TAKEN"],
      canIssue: false,
    });
    expect(family!.quoteHash).toBe(
      quoteHash({
        lines: [HASH_LINE_A, HASH_LINE_B],
        totalAmountCents: 9000,
        currency: "EUR",
        blockingReasons: ["INVOICE_REFERENCE_TAKEN"],
      })
    );
  });

  it("does not count the family's own invoice for the site and month as a reference collision", async () => {
    world.handlers.readExistingInvoices = () => [
      { familyId: FAM, invoiceId: INVOICE, locationId: LOC, status: "open", voidedAt: null },
    ];
    world.handlers.readReferenceOwners = () => [{ invoiceId: INVOICE, reference: REFERENCE }];
    const [family] = (await options()).families;
    expect(family!.blockingReasons).toEqual(["PERIOD_ALREADY_INVOICED"]);
  });
});

describe("getMonthlyInvoiceOptions: money", () => {
  it("charges one fee for an athlete with two classes under the same plan", async () => {
    world.handlers.readEnrollments = () => [
      enrollmentRow(),
      enrollmentRow({ enrollmentId: ENR_A2, classTemplateId: CLS_2, className: "Iniciación" }),
    ];
    world.handlers.readFamilyMembers = () => [memberRow()];
    world.handlers.readPriceAssignments = () => [
      assignmentRow(),
      assignmentRow({ id: ASG_A2, enrollmentId: ENR_A2 }),
    ];
    world.handlers.readCoverage = () => [coverageRow(), coverageRow({ id: COV_2, classTemplateId: CLS_2 })];
    const [family] = (await options()).families;
    expect(family!.lines).toEqual([
      {
        athleteId: ATH_A,
        athleteName: "Ana Pérez",
        pricePlanId: PLAN,
        pricePlanName: "Cuota mensual",
        amountCents: 4500,
        currency: "EUR",
        coveredEnrollments: [covered(ENR_A1, ASG_A1), covered(ENR_A2, ASG_A2, CLS_2)],
      },
    ]);
    expect(family!.totalAmountCents).toBe(4500);
    expect(paramsOf("readCoverage")).toEqual([
      [ORG, LOC, END, START, PLAN, CLS_1, PLAN, CLS_2, 200],
    ]);
  });

  it("refuses two classes of one athlete with different amounts (ATHLETE_TARIFF_CONFLICT)", async () => {
    world.handlers.readEnrollments = () => [
      enrollmentRow(),
      enrollmentRow({ enrollmentId: ENR_A2, classTemplateId: CLS_2 }),
    ];
    world.handlers.readFamilyMembers = () => [memberRow()];
    world.handlers.readPriceAssignments = () => [
      assignmentRow(),
      assignmentRow({ id: ASG_A2, enrollmentId: ENR_A2, unitAmountCents: 4501 }),
    ];
    world.handlers.readCoverage = () => [coverageRow(), coverageRow({ id: COV_2, classTemplateId: CLS_2 })];
    const [family] = (await options()).families;
    expect(family!.conflicts).toEqual([
      { athleteId: ATH_A, code: "ATHLETE_TARIFF_CONFLICT", enrollmentIds: [ENR_A1, ENR_A2] },
    ]);
    expect(family!.lines).toEqual([]);
    expect(family!.blockingReasons).toEqual(["ATHLETE_TARIFF_CONFLICT", "NO_ACTIVE_ENROLLMENTS"]);
  });

  it("bills no line for an athlete when one of their classes is not billable", async () => {
    world.handlers.readEnrollments = () => [
      enrollmentRow(),
      enrollmentRow({ enrollmentId: ENR_A2, classTemplateId: CLS_2, startsOn: "2026-11-10" }),
    ];
    world.handlers.readFamilyMembers = () => [memberRow()];
    world.handlers.readPriceAssignments = () => [
      assignmentRow(),
      assignmentRow({ id: ASG_A2, enrollmentId: ENR_A2 }),
    ];
    world.handlers.readCoverage = () => [coverageRow(), coverageRow({ id: COV_2, classTemplateId: CLS_2 })];
    const [family] = (await options()).families;
    expect(family!.lines).toEqual([]);
    expect(family!.blockingReasons).toEqual(["ENROLLMENT_PERIOD_INCOMPLETE", "NO_ACTIVE_ENROLLMENTS"]);
  });

  it("ignores a pending class of an athlete when pricing the active one", async () => {
    world.handlers.readEnrollments = () => [
      enrollmentRow(),
      enrollmentRow({ enrollmentId: ENR_A2, classTemplateId: CLS_2, status: "pending" }),
    ];
    world.handlers.readFamilyMembers = () => [memberRow()];
    world.handlers.readPriceAssignments = () => [
      assignmentRow(),
      assignmentRow({ id: ASG_A2, enrollmentId: ENR_A2 }),
    ];
    world.handlers.readCoverage = () => [coverageRow(), coverageRow({ id: COV_2, classTemplateId: CLS_2 })];
    const [family] = (await options()).families;
    expect(family!.lines.map((line) => line.coveredEnrollments)).toEqual([[covered(ENR_A1, ASG_A1)]]);
    expect(family!.canIssue).toBe(true);
  });

  it("charges the assignment amount, not the current plan price", async () => {
    world.handlers.readPriceAssignments = () => [
      assignmentRow({ unitAmountCents: 3999 }),
      assignmentB({ unitAmountCents: 1 }),
    ];
    const [family] = (await options()).families;
    expect(family!.lines.map((line) => line.amountCents)).toEqual([3999, 1]);
    expect(family!.totalAmountCents).toBe(4000);
    expect(family!.canIssue).toBe(true);
    expect(family!.quoteHash).toBe(
      quoteHash({
        lines: [hashLine({ amountCents: 3999 }), { ...HASH_LINE_B, amountCents: 1 }],
        totalAmountCents: 4000,
        currency: "EUR",
      })
    );
  });

  it("changes the quote hash when a single amount changes by one cent", async () => {
    world.handlers.readPriceAssignments = () => [assignmentRow({ unitAmountCents: 4501 }), assignmentB()];
    const [family] = (await options()).families;
    expect(family!.quoteHash).not.toBe(QUOTE_HASH);
    expect(family!.quoteHash).toBe(
      quoteHash({
        lines: [hashLine({ amountCents: 4501 }), HASH_LINE_B],
        totalAmountCents: 9001,
        currency: "EUR",
      })
    );
  });

  it("blocks a family whose athletes are billed in two currencies", async () => {
    world.handlers.readPricePlans = () => [planRow(), planRow({ id: PLAN_USD, name: "Monthly USD", currency: "USD" })];
    world.handlers.readPriceAssignments = () => [
      assignmentRow(),
      assignmentB({ pricePlanId: PLAN_USD, currency: "USD", unitAmountCents: 5000 }),
    ];
    world.handlers.readCoverage = () => [
      coverageRow(),
      coverageRow({ id: COV_USD, pricePlanId: PLAN_USD }),
    ];
    const [family] = (await options()).families;
    expect(family!.lines.map((line) => line.currency)).toEqual(["EUR", "USD"]);
    expect(family!.blockingReasons).toEqual(["CURRENCY_MISMATCH"]);
    expect(family!.currency).toBeNull();
    // The response hides the total, but the hash was computed with the sum.
    expect(family!.totalAmountCents).toBeNull();
    expect(family!.quoteHash).toBe(
      quoteHash({
        lines: [HASH_LINE_A, { ...HASH_LINE_B, pricePlanId: PLAN_USD, currency: "USD", amountCents: 5000 }],
        totalAmountCents: 9500,
        currency: null,
        blockingReasons: ["CURRENCY_MISMATCH"],
      })
    );
  });

  it("CURRENT BEHAVIOUR: lets a family total above Number.MAX_SAFE_INTEGER be issued (only the ledger guards it)", async () => {
    const huge = 2 ** 52;
    world.handlers.readPriceAssignments = () => [
      assignmentRow({ unitAmountCents: huge }),
      assignmentB({ unitAmountCents: huge }),
    ];
    const [family] = (await options()).families;
    expect(family!.totalAmountCents).toBe(2 ** 53);
    expect(Number.isSafeInteger(family!.totalAmountCents)).toBe(false);
    expect(family!.canIssue).toBe(true);
  });
});

describe("getMonthlyInvoiceOptions: month-end boundaries", () => {
  // An end date on the last day of the month (2026-11-30) still covers the
  // whole month; one day earlier does not. Pins every `>= end` comparison.
  it.each([
    ["an enrollment", () => {
      world.handlers.readEnrollments = () => [enrollmentRow({ endsOn: END })];
    }],
    ["a class", () => {
      world.handlers.readEnrollments = () => [enrollmentRow({ classEffectiveTo: END })];
    }],
    ["a family membership", () => {
      world.handlers.readFamilyMembers = () => [memberRow({ endsOn: END })];
    }],
    ["a price assignment", () => {
      world.handlers.readPriceAssignments = () => [assignmentRow({ endsOn: END })];
    }],
    ["a tariff coverage", () => {
      world.handlers.readCoverage = () => [coverageRow({ endsOn: END })];
    }],
    ["a payer", () => {
      world.handlers.readPayers = () => [payerRow({ endsOn: END })];
    }],
  ] as Array<[string, () => void]>)("bills %s that ends on the last day of the month", async (_label, setup) => {
    onlyAthleteA();
    setup();
    const [family] = (await options()).families;
    expect(family!.enrollments[0]).toMatchObject({ billable: true, blockingReasons: [] });
    expect(family!.lines).toEqual([
      {
        athleteId: ATH_A,
        athleteName: "Ana Pérez",
        pricePlanId: PLAN,
        pricePlanName: "Cuota mensual",
        amountCents: 4500,
        currency: "EUR",
        coveredEnrollments: [covered(ENR_A1, ASG_A1)],
      },
    ]);
    expect(family!.blockingReasons).toEqual([]);
    expect(family!.canIssue).toBe(true);
    expect(family!.quoteHash).toBe(
      quoteHash({ lines: [HASH_LINE_A], totalAmountCents: 4500, currency: "EUR" })
    );
  });

  it.each([
    ["an enrollment", () => {
      world.handlers.readEnrollments = () => [enrollmentRow({ endsOn: "2026-11-29" })];
    }, "ENROLLMENT_PERIOD_INCOMPLETE"],
    ["a class", () => {
      world.handlers.readEnrollments = () => [enrollmentRow({ classEffectiveTo: "2026-11-29" })];
    }, "CLASS_PERIOD_INCOMPLETE"],
    ["a family membership", () => {
      world.handlers.readFamilyMembers = () => [memberRow({ endsOn: "2026-11-29" })];
    }, "FAMILY_MEMBERSHIP_PERIOD_INCOMPLETE"],
    ["a price assignment", () => {
      world.handlers.readPriceAssignments = () => [assignmentRow({ endsOn: "2026-11-29" })];
    }, "PRICE_ASSIGNMENT_PERIOD_INCOMPLETE"],
    ["a tariff coverage", () => {
      world.handlers.readCoverage = () => [coverageRow({ endsOn: "2026-11-29" })];
    }, "TARIFF_COVERAGE_INCOMPLETE"],
  ] as Array<[string, () => void, string]>)("blocks %s that ends the day before", async (_label, setup, reason) => {
    onlyAthleteA();
    setup();
    const [family] = (await options()).families;
    expect(family!.enrollments[0]).toMatchObject({ billable: false, blockingReasons: [reason] });
    expect(family!.lines).toEqual([]);
    expect(family!.canIssue).toBe(false);
  });

  it("asks the database for payers valid from the first to the last day", async () => {
    // The payer window is only filtered in SQL: starts_on <= start and
    // ends_on >= end (see the snapshot). The bound values are pinned here.
    await options();
    expect(paramsOf("readPayers")).toEqual([[true, true, ORG, FAM, START, END, PAGE_SIZE]]);
  });
});

describe("getMonthlyInvoiceOptions: keyset pages and filter batches", () => {
  const athleteIds = bulk.map((item) => item.athleteId);
  const enrollmentIds = bulk.map((item) => item.enrollmentId);

  it("quotes all 201 athletes: nothing on a later page or batch is lost", async () => {
    bulkWorld();
    const result = await options();
    expect(result.unassignedEnrollments).toEqual([]);
    expect(result.families.map((family) => family.familyId)).toEqual([FAM]);
    const [family] = result.families;
    expect(family!.enrollments).toHaveLength(BULK_SIZE);
    expect(family!.enrollments.filter((enrollment) => !enrollment.billable)).toEqual([]);
    expect(family!.lines).toEqual(
      bulk.map((item) => ({
        athleteId: item.athleteId,
        athleteName: "Ana Pérez",
        pricePlanId: PLAN,
        pricePlanName: "Cuota mensual",
        amountCents: 4500,
        currency: "EUR",
        coveredEnrollments: [covered(item.enrollmentId, item.assignmentId, item.classTemplateId)],
      }))
    );
    expect(family!.totalAmountCents).toBe(BULK_SIZE * 4500);
    expect(family!.blockingReasons).toEqual([]);
    expect(family!.canIssue).toBe(true);
    expect(family!.quoteHash).toBe(
      quoteHash({
        lines: bulk.map((item) =>
          hashLine({
            athleteId: item.athleteId,
            coveredEnrollments: [covered(item.enrollmentId, item.assignmentId, item.classTemplateId)],
          })
        ),
        totalAmountCents: BULK_SIZE * 4500,
        currency: "EUR",
      })
    );
  });

  it("follows the enrollment cursor to a second page", async () => {
    bulkWorld();
    await options();
    expect(paramsOf("readEnrollments")).toEqual([
      [true, ORG, LOC, "active", "pending", END, START, PAGE_SIZE],
      [true, ORG, LOC, "active", "pending", END, START, bulk[199]!.enrollmentId, PAGE_SIZE],
    ]);
  });

  it("filters athletes and enrollments in batches of 200 and pages inside a full batch", async () => {
    bulkWorld();
    await options();
    expect(paramsOf("readFamilyMembers")).toEqual([
      [ORG, ...athleteIds.slice(0, 200), END, START, PAGE_SIZE],
      [ORG, ...athleteIds.slice(0, 200), END, START, bulk[199]!.memberId, PAGE_SIZE],
      [ORG, athleteIds[200], END, START, PAGE_SIZE],
    ]);
    expect(paramsOf("readPriceAssignments")).toEqual([
      [ORG, ...enrollmentIds.slice(0, 200), END, START, PAGE_SIZE],
      [ORG, ...enrollmentIds.slice(0, 200), END, START, bulk[199]!.assignmentId, PAGE_SIZE],
      [ORG, enrollmentIds[200], END, START, PAGE_SIZE],
    ]);
  });

  it("filters (plan, class) coverage pairs in batches of 100", async () => {
    bulkWorld();
    await options();
    const pairs = bulk.map((item) => [PLAN, item.classTemplateId]);
    expect(paramsOf("readCoverage")).toEqual([
      [ORG, LOC, END, START, ...pairs.slice(0, 100).flat(), PAGE_SIZE],
      [ORG, LOC, END, START, ...pairs.slice(100, 200).flat(), PAGE_SIZE],
      [ORG, LOC, END, START, ...pairs.slice(200).flat(), PAGE_SIZE],
    ]);
  });

  it("blocks the athlete whose rows only come in the last batch when that batch is empty", async () => {
    // Control for the batching tests: without the 201st athlete's coverage
    // the quote must change, so a skipped last batch cannot go unnoticed.
    bulkWorld();
    const answerCoverage = world.handlers.readCoverage!;
    world.handlers.readCoverage = (params, previousCalls) =>
      previousCalls === 2 ? [] : answerCoverage(params, previousCalls);
    const [family] = (await options()).families;
    expect(family!.lines).toHaveLength(BULK_SIZE - 1);
    expect(family!.conflicts).toEqual([
      { athleteId: bulk[200]!.athleteId, code: "TARIFF_COVERAGE_INCOMPLETE", enrollmentIds: [bulk[200]!.enrollmentId] },
    ]);
    expect(family!.canIssue).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// issueMonthlyInvoice
// ---------------------------------------------------------------------------

describe("issueMonthlyInvoice: new issuance", () => {
  it("locks, re-quotes under locks and issues one manual invoice", async () => {
    const result = await issueMonthlyInvoice(command());
    expect(trace()).toEqual([
      ...QUOTE_UNDER_LOCKS,
      "findPeriodInvoices",
      "findBilledAthletes",
      "access(write)",
      "issueInvoice",
      "appendOutbox",
      "appendAudit",
      "readIssuedLines",
      "readCoveredEnrollments",
      "lockCharges",
      "commit",
    ]);
    expect(result).toEqual({
      invoice: invoiceRow(),
      replayed: false,
      lines: ISSUED_LINES,
      chargeStatus: "due",
      collectionMode: "manual",
      charges: [{ id: CHARGE, status: "due" }],
    });
  });

  it("takes every lock with the organization and sorted ids", async () => {
    await issueMonthlyInvoice(command());
    expect(paramsOf("lockCommand").map(([organizationId]) => organizationId)).toEqual(
      Array(5).fill(ORG)
    );
    expect(paramsOf("lockLocation")).toEqual([[ORG, LOC]]);
    expect(paramsOf("lockFamily")).toEqual([[ORG, FAM]]);
    expect(paramsOf("readLocationTimezone")).toEqual([[ORG, LOC, true, 1]]);
    expect(paramsOf("readFamilyCohort")).toEqual([[ORG, FAM, END, START, 200]]);
    expect(paramsOf("lockAthletes")).toEqual([[ORG, ATH_A, ATH_B]]);
    expect(paramsOf("findPriorMarker")).toEqual([[ORG, "invoice.monthly_issued", KEY, 1]]);
    expect(paramsOf("lockEnrollments")).toEqual([[ORG, ENR_A1, ENR_B1]]);
    expect(paramsOf("lockPriceAssignments")).toEqual([[ORG, LOC, ENR_A1, ENR_B1, END, START]]);
    expect(paramsOf("lockCoverage")).toEqual([[ORG, LOC, PLAN, CLS_1, END, START]]);
    expect(paramsOf("lockClassTemplates")).toEqual([[ORG, LOC, CLS_1]]);
    expect(paramsOf("lockPricePlans")).toEqual([[ORG, PLAN]]);
    expect(paramsOf("findPeriodInvoices")).toEqual([["monthly_fee", START, END, ORG, FAM, LOC, 2]]);
    expect(paramsOf("findBilledAthletes")).toEqual([
      [ORG, LOC, "monthly_fee", START, END, ATH_A, ATH_B, ATH_A, ATH_B, 1],
    ]);
    expect(paramsOf("readIssuedLines")).toEqual([[ORG, INVOICE, 200]]);
    expect(paramsOf("readCoveredEnrollments")).toEqual([[ORG, LINE_A, LINE_B, 200]]);
    expect(paramsOf("lockCharges")).toEqual([[ORG, INVOICE, 200]]);
    expect(paramsOf("access")).toEqual([
      [readAccess()],
      [readAccess()],
      [readAccess()],
      [{ ...readAccess(), intent: "write" }],
    ]);
  });

  it("sends the ledger the quoted lines, amounts, currency and due date", async () => {
    await issueMonthlyInvoice(command());
    expect(paramsOf("issueInvoice")).toEqual([
      [
        {
          organizationId: ORG,
          locationId: LOC,
          familyId: FAM,
          familyPayerId: PAYER,
          reference: REFERENCE,
          currency: "EUR",
          dueAt: DUE_AT,
          idempotencyKey: KEY,
          actor: ACTOR,
          lines: [
            {
              athleteId: ATH_A,
              coveredEnrollments: [covered(ENR_A1, ASG_A1)],
              pricePlanId: PLAN,
              lineType: "monthly_fee",
              quantity: 1,
              unitAmountCents: 4500,
              servicePeriodStart: START,
              servicePeriodEnd: END,
            },
            {
              athleteId: ATH_B,
              coveredEnrollments: [covered(ENR_B1, ASG_B1)],
              pricePlanId: PLAN,
              lineType: "monthly_fee",
              quantity: 1,
              unitAmountCents: 4500,
              servicePeriodStart: START,
              servicePeriodEnd: END,
            },
          ],
        },
        { collectionMode: "manual" },
      ],
    ]);
  });

  it("records the replay marker and the audit entry", async () => {
    await issueMonthlyInvoice(command());
    expect(paramsOf("appendOutbox")).toEqual([
      [
        {
          organizationId: ORG,
          locationId: LOC,
          eventName: "invoice.monthly_issued",
          aggregateType: "invoice",
          aggregateId: INVOICE,
          idempotencyKey: KEY,
          payload: markerRow().payload,
        },
      ],
    ]);
    expect(paramsOf("appendAudit")).toEqual([
      [
        {
          organizationId: ORG,
          locationId: LOC,
          actorUserId: ACTOR.userId,
          action: "invoice.monthly_issued",
          targetType: "invoice",
          targetId: INVOICE,
          idempotencyKey: `${KEY}:monthly`,
          after: {
            familyId: FAM,
            familyPayerId: PAYER,
            servicePeriod: PERIOD,
            totalAmountCents: 9000,
            currency: "EUR",
            collectionMode: "manual",
          },
        },
      ],
    ]);
  });

  it("trims the idempotency key", async () => {
    await issueMonthlyInvoice(command({ idempotencyKey: `  ${KEY}  ` }));
    expect(paramsOf("findPriorMarker")).toEqual([[ORG, "invoice.monthly_issued", KEY, 1]]);
    expect((paramsOf("issueInvoice")[0]![0] as Row).idempotencyKey).toBe(KEY);
  });

  it.each([
    ["mixed charge statuses", [chargeRow(), chargeRow({ id: CHARGE_2, status: "paid" })], "mixed"],
    ["one partially paid charge", [chargeRow({ status: "partially_paid" })], "partially_paid"],
  ])("reports %s", async (_label, charges, chargeStatus) => {
    world.handlers.lockCharges = () => charges;
    await expect(issueMonthlyInvoice(command())).resolves.toMatchObject({
      chargeStatus,
      charges: charges.map(({ id: chargeId, status }) => ({ id: chargeId, status })),
    });
  });

  it.each([
    ["no charge", []],
    ["an automatic charge", [chargeRow({ collectionMode: "automatic" })]],
  ])("rolls the issuance back when the ledger produced %s", async (_label, charges) => {
    world.handlers.lockCharges = () => charges;
    await expectFailure(issueMonthlyInvoice(command()), {
      code: "MONTHLY_INVOICE_BLOCKED",
      status: 500,
    });
    expect(trace().slice(-2)).toEqual(["lockCharges", "rollback"]);
  });
});

describe("issueMonthlyInvoice: guards and concurrency", () => {
  it.each([
    ["an invalid period", { servicePeriod: "2026-13" }],
    ["an impossible due date", { dueDate: "2026-02-30" }],
    ["a quote hash that is not 64 hex characters", { quoteHash: "A".repeat(64) }],
    ["an idempotency key shorter than 8", { idempotencyKey: " 1234567 " }],
    ["an idempotency key longer than 180", { idempotencyKey: "k".repeat(181) }],
  ])(
    "CURRENT BEHAVIOUR: rejects %s with a raw ZodError before opening a transaction",
    async (_label, override) => {
      // getMonthlyInvoiceOptions answers an invalid period with a 422
      // OperationalError; issuance throws the validator's ZodError instead.
      await expect(issueMonthlyInvoice(command(override))).rejects.toBeInstanceOf(ZodError);
      expect(world.calls).toEqual([]);
    }
  );

  it("returns 404 when the site row cannot be locked", async () => {
    world.handlers.lockLocation = () => [];
    await expectFailure(issueMonthlyInvoice(command()), { code: "NOT_FOUND", status: 404 });
    expect(trace()).toEqual([...ISSUE_PREFIX.slice(0, 4), "rollback"]);
  });

  it("returns 404 when the site disappears before the due date is computed", async () => {
    world.handlers.readLocationTimezone = () => [];
    await expectFailure(issueMonthlyInvoice(command()), { code: "NOT_FOUND", status: 404 });
    expect(trace()).toEqual([...ISSUE_PREFIX.slice(0, 8), "rollback"]);
  });

  it("does not lock athletes when the family has no members in the month", async () => {
    world.handlers.readFamilyCohort = () => [];
    world.handlers.readEnrollments = () => [];
    await expectFailure(issueMonthlyInvoice(command()), { code: "NOT_FOUND", status: 404 });
    expect(trace()).toEqual([
      ...ISSUE_PREFIX.filter((label) => label !== "lockAthletes"),
      "access(read)",
      "readLocation",
      "readPricePlans",
      "readEnrollments",
      "rollback",
    ]);
  });

  it("re-quotes after the locks and refuses a quote that changed meanwhile", async () => {
    // A concurrent price change lands between the first read and the locks.
    world.handlers.readPriceAssignments = (_params, previousCalls) =>
      previousCalls === 0
        ? [assignmentRow(), assignmentB()]
        : [assignmentRow({ unitAmountCents: 5000 }), assignmentB()];
    await expectFailure(issueMonthlyInvoice(command()), { code: "QUOTE_STALE", status: 409 });
    expect(trace()).toEqual([...QUOTE_UNDER_LOCKS, "findPeriodInvoices", "rollback"]);
    expect(callsOf("issueInvoice")).toEqual([]);
  });

  it("refuses with QUOTE_STALE when the family leaves the quote under the locks", async () => {
    world.handlers.readEnrollments = (_params, previousCalls) =>
      previousCalls === 0 ? [enrollmentRow(), enrollmentB()] : [];
    await expectFailure(issueMonthlyInvoice(command()), { code: "QUOTE_STALE", status: 409 });
    expect(trace()).toEqual([
      ...ISSUE_PREFIX,
      ...OPTIONS_READS,
      ...ENROLLMENT_LOCKS,
      "access(read)",
      "readLocation",
      "readPricePlans",
      "readEnrollments",
      "rollback",
    ]);
  });

  it("refuses a hash that does not match the current quote", async () => {
    await expectFailure(issueMonthlyInvoice(command({ quoteHash: "f".repeat(64) })), {
      code: "QUOTE_STALE",
      status: 409,
    });
    expect(callsOf("issueInvoice")).toEqual([]);
  });

  it("refuses a blocked family with its blocking reasons", async () => {
    world.handlers.readPayers = () => [];
    const blockedHash = quoteHash({
      lines: [HASH_LINE_A, HASH_LINE_B],
      totalAmountCents: 9000,
      currency: "EUR",
      blockingReasons: ["FAMILY_PAYER_REQUIRED"],
    });
    await expectFailure(issueMonthlyInvoice(command({ quoteHash: blockedHash })), {
      code: "MONTHLY_INVOICE_BLOCKED",
      status: 422,
      details: { blockingReasons: ["FAMILY_PAYER_REQUIRED"] },
    });
    expect(trace()).toEqual([...QUOTE_UNDER_LOCKS, "findPeriodInvoices", "rollback"]);
  });

  it("refuses a payer that is not active for the whole month", async () => {
    await expectFailure(issueMonthlyInvoice(command({ familyPayerId: PAYER_2 })), {
      code: "FAMILY_PAYER_INVALID",
      status: 422,
    });
    expect(trace()).toEqual([...QUOTE_UNDER_LOCKS, "findPeriodInvoices", "rollback"]);
  });

  it("refuses an athlete already billed for the site and month in another invoice", async () => {
    world.handlers.findBilledAthletes = () => [{ invoiceId: INVOICE_2, athleteId: ATH_B }];
    await expectFailure(issueMonthlyInvoice(command()), {
      code: "ENROLLMENT_ALREADY_BILLED",
      status: 409,
      details: { invoiceId: INVOICE_2, athleteId: ATH_B },
    });
    expect(trace()).toEqual([
      ...QUOTE_UNDER_LOCKS,
      "findPeriodInvoices",
      "findBilledAthletes",
      "rollback",
    ]);
  });

  it("checks write access only right before writing", async () => {
    world.dependencies.access = ([input]) => {
      if ((input as { intent?: string }).intent === "write") {
        throw new OperationalError("PLAN_OVER_CAPACITY", "read-only", 403);
      }
      return undefined;
    };
    await expectFailure(issueMonthlyInvoice(command()), { code: "PLAN_OVER_CAPACITY", status: 403 });
    expect(trace().slice(-3)).toEqual(["findBilledAthletes", "access(write)", "rollback"]);
    expect(callsOf("issueInvoice")).toEqual([]);
  });

  it("rolls back without marker or audit when the ledger rejects the invoice", async () => {
    world.dependencies.issueInvoice = () => {
      throw new OperationalError("INVALID_RELATION", "ledger", 422);
    };
    await expectFailure(issueMonthlyInvoice(command()), { code: "INVALID_RELATION", status: 422 });
    expect(trace().slice(-2)).toEqual(["issueInvoice", "rollback"]);
    expect(callsOf("appendOutbox")).toEqual([]);
    expect(callsOf("appendAudit")).toEqual([]);
  });

  /** Shape of a node-postgres unique violation wrapped by Drizzle. */
  const uniqueViolation = (constraint: string) =>
    Object.assign(new Error("Failed query: insert into invoices"), {
      cause: Object.assign(new Error("duplicate key value violates unique constraint"), {
        code: "23505",
        table: "invoices",
        constraint,
      }),
    });

  it("reports a reference taken after the quote as INVOICE_REFERENCE_TAKEN and rolls back", async () => {
    world.dependencies.issueInvoice = () => {
      throw uniqueViolation("invoices_reference_uq");
    };
    await expectFailure(issueMonthlyInvoice(command()), {
      code: "INVOICE_REFERENCE_TAKEN",
      status: 409,
      details: { reference: REFERENCE },
    });
    expect(trace().slice(-2)).toEqual(["issueInvoice", "rollback"]);
    expect(callsOf("appendOutbox")).toEqual([]);
    expect(callsOf("appendAudit")).toEqual([]);
  });

  it("lets any other unique violation from the ledger through unchanged", async () => {
    const failure = uniqueViolation("invoices_idempotency_key_uq");
    world.dependencies.issueInvoice = () => {
      throw failure;
    };
    await expect(issueMonthlyInvoice(command())).rejects.toBe(failure);
    expect(trace().slice(-2)).toEqual(["issueInvoice", "rollback"]);
  });

  /** Shape of a node-postgres deadlock (SQLSTATE 40P01). */
  const deadlock = () =>
    Object.assign(new Error("deadlock detected"), { code: "40P01" });
  const wrappedDeadlock = () =>
    Object.assign(new Error("Failed query: select id from zaltyko.families"), {
      cause: deadlock(),
    });

  it.each([
    ["raw, on a row lock", "lockFamily", deadlock],
    ["wrapped by Drizzle, on a row lock", "lockFamily", wrappedDeadlock],
    ["wrapped by Drizzle, on the last quoted-row lock", "lockPricePlans", wrappedDeadlock],
  ] as const)(
    "turns a deadlock (%s) into a retryable CONCURRENCY_RETRY and rolls back",
    async (_label, statement, failure) => {
      world.handlers[statement] = () => {
        throw failure();
      };
      const error = await issueMonthlyInvoice(command()).then(
        () => null,
        (caught: unknown) => caught
      );
      expect(error).toBeInstanceOf(OperationalError);
      expect(error).toMatchObject({
        code: "CONCURRENCY_RETRY",
        status: 503,
        details: { retryable: true },
      });
      expect((error as OperationalError).message).toMatch(
        /se ha cancelado sin guardar nada.*Vuelve a intentarlo/
      );
      expect(trace().slice(-2)).toEqual([statement, "rollback"]);
      expect(callsOf("issueInvoice")).toEqual([]);
      expect(callsOf("appendOutbox")).toEqual([]);
      expect(callsOf("appendAudit")).toEqual([]);
    }
  );

  it("turns a deadlock on the ledger insert into CONCURRENCY_RETRY, past the reference check", async () => {
    world.dependencies.issueInvoice = () => {
      throw wrappedDeadlock();
    };
    await expectFailure(issueMonthlyInvoice(command()), {
      code: "CONCURRENCY_RETRY",
      status: 503,
      details: { retryable: true },
    });
    expect(trace().slice(-2)).toEqual(["issueInvoice", "rollback"]);
    expect(callsOf("appendOutbox")).toEqual([]);
    expect(callsOf("appendAudit")).toEqual([]);
  });

  it("lets any other database error through unchanged", async () => {
    const failure = Object.assign(new Error("could not obtain lock"), {
      cause: Object.assign(new Error("lock not available"), { code: "55P03" }),
    });
    world.handlers.lockFamily = () => {
      throw failure;
    };
    await expect(issueMonthlyInvoice(command())).rejects.toBe(failure);
    expect(trace().slice(-2)).toEqual(["lockFamily", "rollback"]);
  });

  it("refuses to issue when the family's month was invoiced without a site", async () => {
    world.handlers.readExistingInvoices = () => [
      { familyId: FAM, invoiceId: INVOICE_2, locationId: null, status: "open", voidedAt: null },
    ];
    const blockedHash = quoteHash({
      lines: [HASH_LINE_A, HASH_LINE_B],
      totalAmountCents: 9000,
      currency: "EUR",
      blockingReasons: ["PERIOD_INVOICED_WITHOUT_SITE"],
    });
    await expectFailure(issueMonthlyInvoice(command({ quoteHash: blockedHash })), {
      code: "MONTHLY_INVOICE_BLOCKED",
      status: 422,
      details: { blockingReasons: ["PERIOD_INVOICED_WITHOUT_SITE"] },
    });
    expect(trace()).toEqual([...QUOTE_UNDER_LOCKS, "findPeriodInvoices", "rollback"]);
    expect(callsOf("issueInvoice")).toEqual([]);
  });

  it("refuses to issue when the quote already reports the reference as taken", async () => {
    world.handlers.readReferenceOwners = () => [{ invoiceId: INVOICE_2, reference: REFERENCE }];
    const blockedHash = quoteHash({
      lines: [HASH_LINE_A, HASH_LINE_B],
      totalAmountCents: 9000,
      currency: "EUR",
      blockingReasons: ["INVOICE_REFERENCE_TAKEN"],
    });
    await expectFailure(issueMonthlyInvoice(command({ quoteHash: blockedHash })), {
      code: "MONTHLY_INVOICE_BLOCKED",
      status: 422,
      details: { blockingReasons: ["INVOICE_REFERENCE_TAKEN"] },
    });
    expect(trace()).toEqual([...QUOTE_UNDER_LOCKS, "findPeriodInvoices", "rollback"]);
    expect(callsOf("issueInvoice")).toEqual([]);
  });
});

describe("monthlyInvoiceReference", () => {
  // ledger-service issueInvoiceSchema: reference max 80 characters.
  const LEDGER_REFERENCE_MAX = 80;

  it("builds MENSUAL-YYYYMM-<family>-<site hash> for the fixture", () => {
    expect(
      monthlyInvoiceReference({ servicePeriod: PERIOD, familyId: FAM, locationId: LOC })
    ).toBe(REFERENCE);
  });

  it("fits the ledger limit in the worst case, with a fixed length of 68", () => {
    // Every part has a fixed width (YYYYMM, 36-character UUID, 16 hex), so
    // the longest period and an all-F upper-case UUID are the worst case.
    const worst = monthlyInvoiceReference({
      servicePeriod: "9999-12",
      familyId: "FFFFFFFF-FFFF-4FFF-BFFF-FFFFFFFFFFFF",
      locationId: "FFFFFFFF-FFFF-4FFF-BFFF-FFFFFFFFFFFF",
    });
    expect(worst).toMatch(/^MENSUAL-999912-ffffffff-ffff-4fff-bfff-ffffffffffff-[0-9a-f]{16}$/);
    expect(worst).toHaveLength(68);
    expect(worst.length).toBeLessThanOrEqual(LEDGER_REFERENCE_MAX);
  });

  it("differs between the sites of one family and month and from the pre-site format", () => {
    const first = monthlyInvoiceReference({ servicePeriod: PERIOD, familyId: FAM, locationId: LOC });
    const second = monthlyInvoiceReference({ servicePeriod: PERIOD, familyId: FAM, locationId: LOC_2 });
    expect(second).toBe(`MENSUAL-202611-${FAM}-${siteTag(LOC_2)}`);
    expect(second).not.toBe(first);
    expect(first).not.toBe(`MENSUAL-202611-${FAM}`);
    expect(first.startsWith(`MENSUAL-202611-${FAM}-`)).toBe(true);
  });

  it("does not depend on the letter case of the ids", () => {
    const familyId = "abcdef01-2345-4abc-8def-0123456789ab";
    const locationId = "fedcba98-7654-4cba-9fed-ba9876543210";
    const lower = monthlyInvoiceReference({ servicePeriod: PERIOD, familyId, locationId });
    expect(lower).toBe(`MENSUAL-202611-${familyId}-${siteTag(locationId)}`);
    expect(
      monthlyInvoiceReference({
        servicePeriod: PERIOD,
        familyId: familyId.toUpperCase(),
        locationId: locationId.toUpperCase(),
      })
    ).toBe(lower);
  });
});

describe("issueMonthlyInvoice: replay by idempotency key", () => {
  const REPLAY_TRACE = [
    ...ISSUE_PREFIX,
    "loadInvoice",
    "access(read)",
    "readIssuedLines",
    "readCoveredEnrollments",
    "lockCharges",
    "loadInvoice",
    "commit",
  ];

  it("returns the stored invoice without quoting again", async () => {
    world.handlers.findPriorMarker = () => [markerRow()];
    // Even a quote that would now differ is not read.
    world.handlers.readPriceAssignments = () => [assignmentRow({ unitAmountCents: 1 })];
    await expect(issueMonthlyInvoice(command())).resolves.toEqual({
      invoice: invoiceRow(),
      replayed: true,
      lines: ISSUED_LINES,
      chargeStatus: "due",
      collectionMode: "manual",
      charges: [{ id: CHARGE, status: "due" }],
    });
    expect(trace()).toEqual(REPLAY_TRACE);
    expect(paramsOf("loadInvoice")).toEqual([
      [ORG, INVOICE, 1],
      [ORG, INVOICE, 1],
    ]);
    expect(callsOf("issueInvoice")).toEqual([]);
  });

  it.each([
    ["another payer", { familyPayerId: PAYER_2 }],
    ["another family", { familyId: FAM_2 }],
    ["another site", { locationId: LOC_2 }],
    ["another month", { servicePeriod: "2026-10" }],
    ["another due date", { dueAt: "2026-11-16T22:59:59.999Z" }],
    ["another quote", { quoteHash: "e".repeat(64) }],
  ])("refuses a key reused with %s", async (_label, payload) => {
    world.handlers.findPriorMarker = () => [markerRow(payload)];
    await expectFailure(issueMonthlyInvoice(command()), { code: "IDEMPOTENCY_CONFLICT", status: 409 });
    expect(trace()).toEqual([...ISSUE_PREFIX, "rollback"]);
  });

  it("refuses a marker without invoice id", async () => {
    world.handlers.findPriorMarker = () => [markerRow({ invoiceId: null })];
    await expectFailure(issueMonthlyInvoice(command()), { code: "IDEMPOTENCY_CONFLICT", status: 409 });
  });

  it.each([
    ["an amount that no longer matches the quote", () => issuedLineRows({ amountCents: 4400 })],
    ["a line without price plan", () => issuedLineRows({ pricePlanId: null })],
  ])("returns 500 when the stored invoice has %s", async (_label, lines) => {
    world.handlers.findPriorMarker = () => [markerRow()];
    world.handlers.readIssuedLines = lines;
    await expectFailure(issueMonthlyInvoice(command()), {
      code: "MONTHLY_INVOICE_BLOCKED",
      status: 500,
    });
    expect(trace().slice(-2)).toEqual(["readCoveredEnrollments", "rollback"]);
  });

  it("returns 500 when a stored line lost its covered enrollments", async () => {
    world.handlers.findPriorMarker = () => [markerRow()];
    world.handlers.readCoveredEnrollments = () => coveredRows().slice(1);
    await expectFailure(issueMonthlyInvoice(command()), {
      code: "MONTHLY_INVOICE_BLOCKED",
      status: 500,
    });
  });

  it("CURRENT BEHAVIOUR: a legacy marker replays without checking coverage or the quote hash", async () => {
    world.handlers.findPriorMarker = () => [markerRow({ pricingModel: undefined })];
    world.handlers.readIssuedLines = () => issuedLineRows({ pricePlanId: null, amountCents: 1 });
    world.handlers.readCoveredEnrollments = () => [];
    await expect(issueMonthlyInvoice(command())).resolves.toEqual({
      invoice: invoiceRow(),
      replayed: true,
      // Returned as stored: no plan, 1 cent, no covered classes.
      lines: [
        { ...ISSUED_LINES[0], pricePlanId: null, amountCents: 1, coveredEnrollments: [] },
        { ...ISSUED_LINES[1], coveredEnrollments: [] },
      ],
      chargeStatus: "due",
      collectionMode: "manual",
      charges: [{ id: CHARGE, status: "due" }],
    });
    expect(trace()).toEqual(REPLAY_TRACE);
  });

  it("checks read access on the stored invoice's site", async () => {
    world.handlers.findPriorMarker = () => [markerRow({ pricingModel: "legacy" })];
    world.handlers.loadInvoice = () => [invoiceRow({ locationId: LOC_2 })];
    await expect(issueMonthlyInvoice(command())).resolves.toEqual({
      invoice: invoiceRow({ locationId: LOC_2 }),
      replayed: true,
      lines: ISSUED_LINES,
      chargeStatus: "due",
      collectionMode: "manual",
      charges: [{ id: CHARGE, status: "due" }],
    });
    expect(paramsOf("access")).toEqual([[readAccess()], [readAccess(LOC_2)]]);
    expect(trace()).toEqual(REPLAY_TRACE);
  });

  it("validates the stored invoice total, not the sum of its lines", async () => {
    // The lines still sum 9000 (the quoted total); the stored invoice says 9001.
    // Recomputing the total from the lines would replay; the service refuses.
    world.handlers.findPriorMarker = () => [markerRow()];
    world.handlers.loadInvoice = () => [invoiceRow({ totalAmountCents: 9001 })];
    await expectFailure(issueMonthlyInvoice(command()), {
      code: "MONTHLY_INVOICE_BLOCKED",
      status: 500,
    });
    expect(trace().slice(-2)).toEqual(["readCoveredEnrollments", "rollback"]);
  });

  it("CURRENT BEHAVIOUR: replays a stored total that differs from the sum of its lines when the hash used it", async () => {
    // Mirror image: the quote hash was taken over a total of 9001 while the
    // lines sum 9000. Nothing checks total = sum of lines, so it replays.
    const hash = quoteHash({ lines: [HASH_LINE_A, HASH_LINE_B], totalAmountCents: 9001, currency: "EUR" });
    world.handlers.findPriorMarker = () => [markerRow({ quoteHash: hash })];
    world.handlers.loadInvoice = () => [invoiceRow({ totalAmountCents: 9001 })];
    await expect(issueMonthlyInvoice(command({ quoteHash: hash }))).resolves.toEqual({
      invoice: invoiceRow({ totalAmountCents: 9001 }),
      replayed: true,
      lines: ISSUED_LINES,
      chargeStatus: "due",
      collectionMode: "manual",
      charges: [{ id: CHARGE, status: "due" }],
    });
    expect(trace()).toEqual(REPLAY_TRACE);
  });

  it("refuses to replay a voided invoice", async () => {
    world.handlers.findPriorMarker = () => [markerRow()];
    world.handlers.loadInvoice = () => [invoiceRow({ voidedAt: new Date("2026-11-20T10:00:00Z") })];
    await expectFailure(issueMonthlyInvoice(command()), {
      code: "INVOICE_VOIDED",
      status: 409,
      details: { invoiceId: INVOICE },
    });
    // Charges are locked before the invoice status is read.
    expect(trace().slice(-3)).toEqual(["lockCharges", "loadInvoice", "rollback"]);
  });
});

describe("issueMonthlyInvoice: an invoice already exists for the family and month", () => {
  const PERIOD_REPLAY = [
    ...QUOTE_UNDER_LOCKS,
    "findPeriodInvoices",
    "loadInvoice",
    "readIssuedLines",
    "readCoveredEnrollments",
    "lockCharges",
    "loadInvoice",
    "findInvoiceMarker",
  ];

  beforeEach(() => {
    world.handlers.findPeriodInvoices = () => [{ invoiceId: INVOICE }];
    world.handlers.findInvoiceMarker = () => [markerRow()];
  });

  it("replays it under another key when payer, due date, quote and selection match", async () => {
    await expect(issueMonthlyInvoice(command({ idempotencyKey: "monthly-key-0002" }))).resolves.toEqual({
      invoice: invoiceRow(),
      replayed: true,
      lines: ISSUED_LINES,
      chargeStatus: "due",
      collectionMode: "manual",
      charges: [{ id: CHARGE, status: "due" }],
    });
    expect(trace()).toEqual([...PERIOD_REPLAY, "commit"]);
    expect(paramsOf("findInvoiceMarker")).toEqual([[ORG, "invoice.monthly_issued", INVOICE, 1]]);
    expect(callsOf("issueInvoice")).toEqual([]);
  });

  it.each([
    ["it has no marker", () => {
      world.handlers.findInvoiceMarker = () => [];
    }],
    ["another payer", () => {
      world.handlers.findInvoiceMarker = () => [markerRow({ familyPayerId: PAYER_2 })];
    }],
    ["another due date", () => {
      world.handlers.findInvoiceMarker = () => [markerRow({ dueAt: "2026-11-16T22:59:59.999Z" })];
    }],
    ["another quote", () => {
      world.handlers.findInvoiceMarker = () => [markerRow({ quoteHash: "e".repeat(64) })];
    }],
    ["another site in the marker", () => {
      world.handlers.findInvoiceMarker = () => [markerRow({ locationId: LOC_2 })];
    }],
    ["another selection of enrollments", () => {
      world.handlers.readCoveredEnrollments = () => coveredRows().slice(0, 1);
    }],
  ])("refuses a second invoice when %s", async (_label, setup) => {
    setup();
    await expectFailure(issueMonthlyInvoice(command()), {
      code: "PERIOD_ALREADY_INVOICED",
      status: 409,
      details: { invoiceId: INVOICE },
    });
    expect(trace()).toEqual([...PERIOD_REPLAY, "rollback"]);
  });

  it("refuses when the month already has two invoices for the family", async () => {
    world.handlers.findPeriodInvoices = () => [{ invoiceId: INVOICE }, { invoiceId: INVOICE_2 }];
    await expectFailure(issueMonthlyInvoice(command()), {
      code: "PERIOD_ALREADY_INVOICED",
      status: 409,
      details: { reason: "DUPLICATE_MONTHLY_INVOICES" },
    });
    expect(trace()).toEqual([...QUOTE_UNDER_LOCKS, "findPeriodInvoices", "rollback"]);
  });

  it("refuses to replay a voided invoice for the month", async () => {
    world.handlers.loadInvoice = () => [invoiceRow({ status: "void" })];
    await expectFailure(issueMonthlyInvoice(command()), {
      code: "INVOICE_VOIDED",
      status: 409,
      details: { invoiceId: INVOICE },
    });
  });
});

// ---------------------------------------------------------------------------
// SQL text
// ---------------------------------------------------------------------------

const ALL_STATEMENTS: Statement[] = [
  "begin",
  "commit",
  "findBilledAthletes",
  "findInvoiceMarker",
  "findPeriodInvoices",
  "findPriorMarker",
  "loadInvoice",
  "lockAthletes",
  "lockCharges",
  "lockClassTemplates",
  "lockCoverage",
  "lockEnrollments",
  "lockFamily",
  "lockLocation",
  "lockPriceAssignments",
  "lockPricePlans",
  "readCoverage",
  "readCoveredEnrollments",
  "readEnrollments",
  "readExistingInvoices",
  "readFamilyCohort",
  "readFamilyMembers",
  "readIssuedLines",
  "readLocation",
  "readLocationTimezone",
  "readPayers",
  "readPriceAssignments",
  "readPricePlans",
  "readReferenceOwners",
  "rollback",
];

const SQL_SNAPSHOT = "./__snapshots__/monthly-invoice-service-sql.txt";

/**
 * Shortens what batched reads repeat: placeholder lists of four or more
 * (`in ($2, …, $201)`) and runs of four or more OR groups that only differ in
 * their placeholders. The keyset tests pin the full parameter lists.
 */
function compactSql(text: string): string {
  const lists = text.replace(
    /\$(\d+)((?:, \$\d+){3,})/g,
    (_match, first: string, rest: string) => `$${first}, …, $${/\d+$/.exec(rest)![0]}`
  );
  return lists.replace(
    /\(([^()]*)\)((?: or \([^()]*\)){3,})/g,
    (match, first: string, rest: string) => {
      const groups = [first, ...rest.slice(" or (".length, -1).split(") or (")];
      const shape = (group: string) => group.replace(/\$\d+/g, "$");
      if (groups.some((group) => shape(group) !== shape(first))) return match;
      return `(${first}) or … ${groups.length - 2} more … or (${groups.at(-1)})`;
    }
  );
}

function readStoredSnapshot(): string | null {
  try {
    return readFileSync(join(process.cwd(), "tests", SQL_SNAPSHOT), "utf8");
  } catch {
    return null;
  }
}

describe("SQL text", () => {
  // The snapshot is the contract of the SQL this service sends. Regenerating it
  // with `vitest -u` is only acceptable together with a reviewed diff of the
  // .txt file in the PR, and the PR must justify every statement that changes.
  it("pins the normalized SQL of every statement the service issues", async () => {
    const seen = new Map<string, Set<string>>();
    const scenario = async (setup: () => void, body: () => Promise<unknown>) => {
      resetWorld();
      setup();
      await body().catch(() => undefined);
      for (const call of world.calls) {
        if (call.sql === undefined) continue;
        const texts = seen.get(call.name) ?? new Set<string>();
        texts.add(compactSql(call.sql));
        seen.set(call.name, texts);
      }
    };

    // A quote over 201 athletes: second enrollment page (`"id" > $n`), cursor
    // page inside a full filter batch, a one-value batch and a 100-pair batch.
    await scenario(bulkWorld, () => options());
    // New issuance (two athletes), replay by key, replay by period and a rollback.
    await scenario(() => undefined, () => issueMonthlyInvoice(command()));
    await scenario(() => {
      world.handlers.findPriorMarker = () => [markerRow()];
    }, () => issueMonthlyInvoice(command()));
    await scenario(() => {
      world.handlers.findPeriodInvoices = () => [{ invoiceId: INVOICE }];
      world.handlers.findInvoiceMarker = () => [markerRow()];
    }, () => issueMonthlyInvoice(command()));
    await scenario(() => {
      world.handlers.lockLocation = () => [];
    }, () => issueMonthlyInvoice(command()));

    expect([...seen.keys()].sort()).toEqual(ALL_STATEMENTS);
    const listing = [...seen.keys()]
      .sort()
      .flatMap((name) => [...seen.get(name)!].sort().map((text) => `-- ${name}\n${text}\n`))
      .join("\n");
    if (readStoredSnapshot() !== listing) {
      // CI never writes snapshots: print the listing whole so a mismatch can be
      // reviewed from the job log instead of a truncated diff.
      console.log(`MONTHLY_SQL_SNAPSHOT_BEGIN\n${listing}MONTHLY_SQL_SNAPSHOT_END`);
    }
    // Regenerate with `vitest -u` only after a deliberate SQL change; see above.
    await expect(listing).toMatchFileSnapshot(SQL_SNAPSHOT);
  });
});

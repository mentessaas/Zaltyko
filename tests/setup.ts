import { vi } from "vitest";

// Create a chainable query mock that resolves properly
const createChainableMock = (resolveWith: unknown = []) => {
  const thenable: Record<string, unknown> = {
    from: vi.fn(() => thenable),
    innerJoin: vi.fn(() => thenable),
    leftJoin: vi.fn(() => thenable),
    rightJoin: vi.fn(() => thenable),
    fullJoin: vi.fn(() => thenable),
    where: vi.fn(() => thenable),
    orderBy: vi.fn(() => thenable),
    groupBy: vi.fn(() => thenable),
    limit: vi.fn(() => thenable),
    offset: vi.fn(() => thenable),
    select: vi.fn(() => thenable),
    insert: vi.fn(() => thenable),
    update: vi.fn(() => thenable),
    delete: vi.fn(() => thenable),
    values: vi.fn(() => thenable),
    set: vi.fn(() => thenable),
    returning: vi.fn(() => Promise.resolve(resolveWith)),
    onConflictDoNothing: vi.fn(() => thenable),
    onConflictDoUpdate: vi.fn(() => thenable),
  };

  // Make it thenable (mimic drizzle query behavior)
  Object.defineProperty(thenable, "then", {
    value: (onFulfilled: unknown) => Promise.resolve(resolveWith).then(onFulfilled),
    writable: true,
  });

  return thenable;
};

// Create column mock with $type support (for jsonb, json columns)
const createColumnMock = (name: string) => {
  const col: Record<string, unknown> = { _name: name };
  const methods = [
    "primaryKey", "notNull", "default", "defaultRandom", "defaultNow",
    "unique", "references", "onDelete", "onUpdate", "check", "array", "unique",
    "asc", "desc",
  ];
  methods.forEach((method) => {
    col[method] = vi.fn().mockReturnThis();
  });
  // Support $type<T>() for typed JSON columns
  col.$type = vi.fn().mockReturnThis();
  return col;
};

// Mock drizzle-orm/pg-core
vi.mock("drizzle-orm/pg-core", () => {
  // pgEnum needs to be callable
  const createPgEnum = (name: string, values: string[]) => {
    const enumFn = (...args: unknown[]) => {
      const col: Record<string, unknown> = { _name: name, _enumName: name, values };
      const methods = [
        "primaryKey", "notNull", "default", "defaultRandom", "defaultNow",
        "unique", "references", "onDelete", "onUpdate", "check", "array", "unique",
        "asc", "desc",
      ];
      methods.forEach((method) => {
        col[method] = vi.fn().mockReturnThis();
      });
      return col;
    };
    enumFn.values = values;
    enumFn._name = name;
    return enumFn;
  };

  return {
    pgTable: vi.fn((name: string, columns: Record<string, unknown>) => ({
      _name: name,
      ...columns,
    })),
    pgEnum: vi.fn((name: string, values: string[]) => createPgEnum(name, values)),
    uuid: vi.fn((name: string) => createColumnMock(name)),
    text: vi.fn((name: string) => createColumnMock(name)),
    varchar: vi.fn((name: string, opts?: unknown) => createColumnMock(name)),
    boolean: vi.fn((name: string) => createColumnMock(name)),
    timestamp: vi.fn((name: string, opts?: unknown) => createColumnMock(name)),
    date: vi.fn((name: string) => createColumnMock(name)),
    integer: vi.fn((name: string) => createColumnMock(name)),
    numeric: vi.fn((name: string, opts?: unknown) => createColumnMock(name)),
    jsonb: vi.fn((name: string) => createColumnMock(name)),
    json: vi.fn((name: string) => createColumnMock(name)),
    time: vi.fn((name: string) => createColumnMock(name)),
    serial: vi.fn((name: string) => createColumnMock(name)),
    bigint: vi.fn((name: string, opts?: unknown) => createColumnMock(name)),
    smallint: vi.fn((name: string) => createColumnMock(name)),
    real: vi.fn((name: string) => createColumnMock(name)),
    doublePrecision: vi.fn((name: string) => createColumnMock(name)),
    index: vi.fn((name: string) => ({ _name: name })),
    uniqueIndex: vi.fn((name: string) => ({ _name: name })),
    foreignKey: vi.fn((name: string) => ({ _name: name })),
    primaryKey: vi.fn(() => createColumnMock("pk")),
    pgSchema: vi.fn((name: string) => ({
      table: vi.fn((tableName: string, columns: Record<string, unknown>) => ({
        _name: `${name}.${tableName}`,
        ...columns,
      })),
    })),
  };
});

// Mock drizzle-orm
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a: unknown, b: unknown) => ({ _op: "eq", a, b })),
  ne: vi.fn((a: unknown, b: unknown) => ({ _op: "ne", a, b })),
  and: vi.fn((...args: unknown[]) => ({ _op: "and", args })),
  or: vi.fn((...args: unknown[]) => ({ _op: "or", args })),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    _op: "sql",
    sql: strings.join("?"),
    values,
  })),
  inArray: vi.fn((col: unknown, values: unknown[]) => ({ _op: "inArray", col, values })),
  notInArray: vi.fn((col: unknown, values: unknown[]) => ({ _op: "notInArray", col, values })),
  isNull: vi.fn((col: unknown) => ({ _op: "isNull", col })),
  isNotNull: vi.fn((col: unknown) => ({ _op: "isNotNull", col })),
  like: vi.fn((col: unknown, pattern: string) => ({ _op: "like", col, pattern })),
  ilike: vi.fn((col: unknown, pattern: string) => ({ _op: "ilike", col, pattern })),
  asc: vi.fn((col: unknown) => ({ _op: "asc", col })),
  desc: vi.fn((col: unknown) => ({ _op: "desc", col })),
  count: vi.fn(() => ({ _op: "count" })),
  sum: vi.fn(() => ({ _op: "sum" })),
  avg: vi.fn(() => ({ _op: "avg" })),
  max: vi.fn(() => ({ _op: "max" })),
  min: vi.fn(() => ({ _op: "min" })),
}));

// Mock environment variables
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
process.env.SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_ANON_KEY = "test-key";
process.env.STRIPE_SECRET_KEY = "sk_test_mock";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_mock";

// Mock Next.js modules
vi.mock("next/headers", () => ({
  headers: vi.fn(),
  cookies: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  })),
}));

// Mock Supabase client
vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(),
          data: [],
        })),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(),
          })),
        })),
      })),
      delete: vi.fn(() => ({
        eq: vi.fn(),
      })),
    })),
    auth: {
      getUser: vi.fn(() => ({ data: { user: null }, error: null })),
    },
  })),
}));

// Mock logger
vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

// Reset all mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
});

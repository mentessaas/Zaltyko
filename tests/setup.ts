import { vi } from "vitest";

// Helper to create chainable mock columns with all common drizzle methods
const createColumnMock = (name: string) => {
  const column: any = { _name: name };
  const methods = [
    "primaryKey",
    "notNull",
    "default",
    "defaultRandom",
    "defaultNow",
    "unique",
    "references",
    "onDelete",
    "onUpdate",
    "check",
    "array",
    "unique",
  ];
  methods.forEach((method) => {
    column[method] = vi.fn().mockReturnThis();
  });
  return column;
};

// Mock drizzle-orm/pg-core to bypass module resolution issues with pnpm
vi.mock("drizzle-orm/pg-core", () => ({
  pgTable: vi.fn((name: string, columns: any) => ({ _name: name, ...columns })),
  pgEnum: vi.fn((name: string, values: string[]) => ({ _name: name, values })),
  uuid: vi.fn((name: string) => createColumnMock(name)),
  text: vi.fn((name: string) => createColumnMock(name)),
  varchar: vi.fn((name: string, opts?: any) => createColumnMock(name)),
  boolean: vi.fn((name: string) => createColumnMock(name)),
  timestamp: vi.fn((name: string, opts?: any) => createColumnMock(name)),
  date: vi.fn((name: string) => createColumnMock(name)),
  integer: vi.fn((name: string) => createColumnMock(name)),
  numeric: vi.fn((name: string, opts?: any) => createColumnMock(name)),
  jsonb: vi.fn((name: string) => createColumnMock(name)),
  time: vi.fn((name: string) => createColumnMock(name)),
  index: vi.fn((name: string) => ({ _name: name })),
  uniqueIndex: vi.fn((name: string) => ({ _name: name })),
  foreignKey: vi.fn((name: string) => ({ _name: name })),
  pgSchema: vi.fn((name: string) => ({})),
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
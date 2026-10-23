import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Keep Drizzle's real schema and SQL implementations. Test suites that need a
// database stub mock @/db locally, while schema imports and PgDialect stay real.

// Mock environment variables.
// El test de concurrencia real de cobros (ZAL-6) usa su propio cluster
// Postgres efímero; respeta el DATABASE_URL exportado por el script para no
// desviarlo al postgres falso de tests.
if (process.env.CHARGE_CONCURRENCY_TEST === "1") {
  if (process.env.CHARGE_CONCURRENCY_DATABASE_URL) {
    // Sobreescribimos DATABASE_URL, DATABASE_URL_POOL y DATABASE_URL_DIRECT
    // porque `getDatabaseUrl()` prefiere `DATABASE_URL_POOL` y `.env` la
    // define. `dotenv/config` no machaca vars ya definidas, así que con esto
    // basta para que `@/lib/env` apunte al cluster efímero.
    process.env.DATABASE_URL = process.env.CHARGE_CONCURRENCY_DATABASE_URL;
    process.env.DATABASE_URL_POOL = process.env.CHARGE_CONCURRENCY_DATABASE_URL;
    process.env.DATABASE_URL_DIRECT = process.env.CHARGE_CONCURRENCY_DATABASE_URL;
  }
} else {
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
}
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
    apiError: vi.fn(),
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

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(path), "utf8");
}

describe("Phase 1 schema reconciliation", () => {
  it("declares every idempotency key as a unique database index", () => {
    const contracts = [
      ["src/db/schema/announcements.ts", "announcement_read_status_unique"],
      [
        "src/db/schema/direct-messages.ts",
        "conversation_participants_conversation_user_unique",
      ],
      [
        "src/db/schema/direct-messages.ts",
        "message_read_receipts_message_user_unique",
      ],
      ["src/db/schema/groups.ts", "group_athletes_unique"],
      ["src/db/schema/user-preferences.ts", "user_preferences_user_id_unique"],
      [
        "src/db/schema/push-subscriptions.ts",
        "push_subscriptions_user_endpoint_unique",
      ],
      ["src/db/schema/push-tokens.ts", "push_tokens_user_token_unique"],
    ] as const;

    for (const [path, indexName] of contracts) {
      expect(source(path)).toMatch(
        new RegExp(`uniqueIndex\\(\\s*["']${indexName}["']\\s*\\)`, "m")
      );
    }
  });

  it("models push activation as a boolean and links auth identities", () => {
    const tokens = source("src/db/schema/push-tokens.ts");
    const subscriptions = source("src/db/schema/push-subscriptions.ts");

    expect(tokens).toContain('boolean("is_active").notNull().default(true)');
    expect(tokens).toContain(
      '.references(() => profiles.userId, { onDelete: "cascade" })'
    );
    expect(subscriptions).toContain(
      '.references(() => profiles.userId, { onDelete: "cascade" })'
    );
  });

  it("keeps the Drizzle and Supabase reconciliation SQL identical and security-complete", () => {
    const supabaseSql = source(
      "supabase/migrations/20260713090000_reconcile_phase1_schema_drift.sql"
    );
    const drizzleSql = source("drizzle/0003_reconcile_phase1_schema.sql");

    expect(drizzleSql).toBe(supabaseSql);
    expect(supabaseSql).toContain(
      "ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY"
    );
    expect(supabaseSql).toContain(
      "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.push_tokens TO authenticated, service_role"
    );
    expect(supabaseSql).toContain("push_tokens_user_id_profiles_user_id_fk");
    expect(supabaseSql).toContain("settings.preference_orphan_archived");
  });
});

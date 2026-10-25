import { Client } from "pg";

const SNAPSHOT_REPLAY_MARKER =
  "SET app.schema_snapshot_replay = 'ci-empty-replay';";

/**
 * Fail closed unless the schema replay target is the disposable local
 * Supabase database. Never log or return the connection string.
 */
export function assertDisposableE2EDatabaseUrl(connectionString: string) {
  let target: URL;
  try {
    target = new URL(connectionString);
  } catch {
    throw new Error(
      "Refusing schema replay: Supabase did not provide a valid local database URL."
    );
  }

  const isLoopback = ["127.0.0.1", "[::1]"].includes(target.hostname);
  const hasExpectedDatabase = target.pathname === "/postgres";
  const hasExpectedRole = target.username === "postgres";
  const hasExplicitPort =
    target.port !== "" &&
    Number.isInteger(Number(target.port)) &&
    Number(target.port) > 0 &&
    Number(target.port) <= 65535;
  const hasNoOverrides = target.search === "" && target.hash === "";

  if (
    !["postgres:", "postgresql:"].includes(target.protocol) ||
    !isLoopback ||
    !hasExpectedDatabase ||
    !hasExpectedRole ||
    !hasExplicitPort ||
    !hasNoOverrides
  ) {
    throw new Error(
      "Refusing schema replay: only the disposable loopback Supabase postgres database is allowed."
    );
  }
}

export type PinnedSchemaSource = {
  filename: string;
  sql: Buffer;
  isGuardedSnapshot: boolean;
};

async function connectAsSchemaReplayRole(connectionString: string) {
  for (const role of ["supabase_admin", "postgres"]) {
    const target = new URL(connectionString);
    target.username = role;
    const client = new Client({
      connectionString: target.toString(),
      application_name: "zaltyko-disposable-e2e-schema-replay",
      connectionTimeoutMillis: 5_000,
      ssl: false,
    });

    try {
      await client.connect();
      const { rows } = await client.query<{
        canAlterPostgresDefaults: boolean;
        canAlterSupabaseAdminDefaults: boolean;
        canCreateInPublic: boolean;
        canCreateInTargetDatabase: boolean;
        isSuperuser: boolean;
      }>(`
        SELECT
          role.rolsuper AS "isSuperuser",
          pg_has_role(current_user, 'postgres', 'MEMBER') AS "canAlterPostgresDefaults",
          pg_has_role(current_user, 'supabase_admin', 'MEMBER') AS "canAlterSupabaseAdminDefaults",
          has_database_privilege(current_user, current_database(), 'CREATE') AS "canCreateInTargetDatabase",
          has_schema_privilege(current_user, 'public', 'CREATE') AS "canCreateInPublic"
        FROM pg_roles AS role
        WHERE role.rolname = current_user
      `);
      const privileges = rows[0];
      const canReplay =
        privileges?.isSuperuser ||
        (privileges?.canAlterPostgresDefaults &&
          privileges.canAlterSupabaseAdminDefaults &&
          privileges.canCreateInTargetDatabase &&
          privileges.canCreateInPublic);

      if (canReplay) return client;
    } catch {
      // Try the next known local role without exposing connection details.
    }

    await client.end().catch(() => undefined);
  }

  throw new Error(
    "Refusing schema replay: neither local Supabase role has the privileges required to restore the pinned default ACLs."
  );
}

/** Apply pinned source files over one connection so the guard marker stays session-local. */
export async function replayPinnedE2ESchema(
  connectionString: string,
  sources: PinnedSchemaSource[]
) {
  assertDisposableE2EDatabaseUrl(connectionString);
  if (
    sources.length === 0 ||
    !sources[0]?.isGuardedSnapshot ||
    sources.slice(1).some((source) => source.isGuardedSnapshot)
  ) {
    throw new Error(
      "Refusing schema replay: exactly one guarded snapshot must precede its overlays."
    );
  }

  const client = await connectAsSchemaReplayRole(connectionString);
  let currentSource = "snapshot replay marker";

  try {
    await client.connect();
    await client.query(SNAPSHOT_REPLAY_MARKER);

    for (const source of sources) {
      currentSource = source.filename;
      await client.query(source.sql.toString("utf8"));
    }
  } catch (error) {
    const postgresError = error as {
      code?: string;
      message?: string;
    };
    const code = postgresError.code ? ` (${postgresError.code})` : "";
    const message = postgresError.message ?? "unknown PostgreSQL error";
    throw new Error(
      `Disposable E2E schema replay failed at ${currentSource}${code}: ${message}`
    );
  } finally {
    await client.end().catch(() => undefined);
  }
}

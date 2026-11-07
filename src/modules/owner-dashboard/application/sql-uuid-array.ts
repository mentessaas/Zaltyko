import { sql } from "drizzle-orm";

export function sqlUuidArray(ids: string[]) {
  if (ids.length === 0) return sql`array[]::uuid[]`;
  return sql`array[${sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `
  )}]`;
}

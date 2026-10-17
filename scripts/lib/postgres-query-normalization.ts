export function normalizePostgresQuery(query: string): string {
  return query.toLowerCase().replaceAll('"', "").replace(/\s+/g, " ").trim();
}

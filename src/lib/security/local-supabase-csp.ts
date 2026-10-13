export type LocalSupabaseCspEnvironment = {
  nodeEnv?: string;
  isolatedE2e?: string;
  vercel?: string;
  vercelEnv?: string;
  supabaseUrl?: string;
};

/**
 * Allows only the configured loopback Supabase origin in local development or
 * in the isolated local E2E runner. A Vercel runtime can never enable it.
 */
export function getLocalSupabaseCspConnectSources(
  environment: LocalSupabaseCspEnvironment
): string[] {
  if (environment.vercel === "1" || Boolean(environment.vercelEnv)) return [];

  const localDevelopment = environment.nodeEnv === "development";
  const isolatedProductionE2e =
    environment.nodeEnv === "production" &&
    environment.isolatedE2e === "true";
  if (!localDevelopment && !isolatedProductionE2e) return [];

  if (!environment.supabaseUrl) return [];
  try {
    const supabase = new URL(environment.supabaseUrl);
    if (
      supabase.username ||
      supabase.password ||
      !["127.0.0.1", "localhost", "[::1]"].includes(supabase.hostname) ||
      !["http:", "https:"].includes(supabase.protocol)
    ) {
      return [];
    }
    return [supabase.origin, supabase.origin.replace(/^http/, "ws")];
  } catch {
    return [];
  }
}

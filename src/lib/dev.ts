export const isDevFeaturesEnabled =
  process.env.NODE_ENV !== "production" &&
  (process.env.ENABLE_DEV_FEATURES === "true" ||
    process.env.NEXT_PUBLIC_ENABLE_DEV_FEATURES === "true" ||
    process.env.NEXT_PUBLIC_DEV_FEATURES === "true" ||
    process.env.NODE_ENV === "development");

// Demo sessions use an unsigned local cookie, so keep them local and opt-in only.
/**
 * Dev sessions are a local-only escape hatch. Evaluate this at call time so
 * long-lived server processes/tests cannot retain a stale flag after runtime
 * configuration changes, and explicitly reject all Vercel deployments.
 */
export function isDevSessionEnabled() {
  return (
    process.env.NODE_ENV === "development" &&
    !process.env.VERCEL_ENV &&
    (process.env.NEXT_PUBLIC_ENABLE_DEV_SESSION === "true" ||
      process.env.NEXT_PUBLIC_USE_MOCK_AUTH === "true")
  );
}

export const isDev = () => isDevFeaturesEnabled;

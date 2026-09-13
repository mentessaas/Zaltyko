export const isDevFeaturesEnabled =
  process.env.NODE_ENV !== "production" &&
  (
    process.env.ENABLE_DEV_FEATURES === "true" ||
    process.env.NEXT_PUBLIC_ENABLE_DEV_FEATURES === "true" ||
    process.env.NEXT_PUBLIC_DEV_FEATURES === "true" ||
    process.env.NODE_ENV === "development"
  );

// Demo sessions are local-only and opt-in. Keep the Vercel preview boundary
// explicit as a defense-in-depth guard in case NODE_ENV is misconfigured.
export const isDevSessionEnabled =
  process.env.NODE_ENV === "development" &&
  (!process.env.VERCEL_ENV || process.env.VERCEL_ENV === "development") &&
  (
    process.env.NEXT_PUBLIC_ENABLE_DEV_SESSION === "true" ||
    process.env.NEXT_PUBLIC_USE_MOCK_AUTH === "true"
  );

export const isDev = () => isDevFeaturesEnabled;

export const isDevFeaturesEnabled =
  process.env.NODE_ENV !== "production" &&
  (
    process.env.ENABLE_DEV_FEATURES === "true" ||
    process.env.NEXT_PUBLIC_ENABLE_DEV_FEATURES === "true" ||
    process.env.NEXT_PUBLIC_DEV_FEATURES === "true" ||
    process.env.NODE_ENV === "development"
  );

// Demo sessions use an unsigned local cookie, so keep them local and opt-in only.
export const isDevSessionEnabled =
  process.env.NODE_ENV === "development" &&
  (
    process.env.NEXT_PUBLIC_ENABLE_DEV_SESSION === "true" ||
    process.env.NEXT_PUBLIC_USE_MOCK_AUTH === "true"
  );

export const isDev = () => isDevFeaturesEnabled;

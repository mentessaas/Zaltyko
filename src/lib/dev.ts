export const isDevFeaturesEnabled =
  process.env.NODE_ENV !== "production" ||
  process.env.ENABLE_DEV_FEATURES === "true" ||
  process.env.NEXT_PUBLIC_ENABLE_DEV_FEATURES === "true";

export const isDev = () => isDevFeaturesEnabled;

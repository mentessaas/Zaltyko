export const isDevFeaturesEnabled =
  (process.env.NEXT_PUBLIC_DEV_FEATURES ?? "").toLowerCase() === "true";

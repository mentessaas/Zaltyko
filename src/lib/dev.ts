export const isDevFeaturesEnabled =
  process.env.NODE_ENV !== "production" &&
  (
    process.env.ENABLE_DEV_FEATURES === "true" ||
    process.env.NEXT_PUBLIC_ENABLE_DEV_FEATURES === "true" ||
    process.env.NEXT_PUBLIC_DEV_FEATURES === "true" ||
    process.env.NODE_ENV === "development"
  );

// Demo sessions use an unsigned local cookie, so keep them local and opt-in only.
// Exportado como función para que el test pueda verificar transiciones de env var
// entre llamadas (ZAL-565 hardening suite líneas 232-242 requieren lazy eval).
// También rechaza si VERCEL_ENV es preview/production (en Vercel, NODE_ENV es
// "production" salvo en dev local; en preview deployments NODE_ENV sigue siendo
// "development" si no se sobreescribe, así que este check es defense-in-depth).
export function isDevSessionEnabled(): boolean {
  if (process.env.NODE_ENV !== "development") return false;
  if (process.env.VERCEL_ENV === "preview" || process.env.VERCEL_ENV === "production") {
    return false;
  }
  return (
    process.env.NEXT_PUBLIC_ENABLE_DEV_SESSION === "true" ||
    process.env.NEXT_PUBLIC_USE_MOCK_AUTH === "true"
  );
}

export function isDev(): boolean {
  return isDevFeaturesEnabled;
}

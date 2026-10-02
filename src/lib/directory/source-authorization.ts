export type SourceAuthorizationDetails = {
  termsUrl?: unknown;
  authorization?: unknown;
};

const MIN_AUTHORIZATION_REFERENCE_LENGTH = 20;

export function sourceAuthorizationProblem(
  details: SourceAuthorizationDetails
): string | null {
  const termsUrl =
    typeof details.termsUrl === "string" ? details.termsUrl.trim() : "";
  if (!termsUrl) return "Añade el enlace a las condiciones de reutilización.";

  try {
    const parsed = new URL(termsUrl);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password)
      return "Las condiciones deben tener una URL HTTPS pública.";
  } catch {
    return "Añade una URL válida a las condiciones de reutilización.";
  }

  const authorization =
    typeof details.authorization === "string"
      ? details.authorization.trim()
      : "";
  if (authorization.length < MIN_AUTHORIZATION_REFERENCE_LENGTH)
    return "Registra una referencia verificable de la autorización escrita.";

  return null;
}

export function isSourceAuthorizationAttested(
  details: SourceAuthorizationDetails & { authorizationAttested?: unknown }
): boolean {
  return (
    details.authorizationAttested === true &&
    !sourceAuthorizationProblem(details)
  );
}

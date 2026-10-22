import Stripe from "stripe";

/**
 * Extrae un valor de metadata de Stripe, probando múltiples variantes de la clave
 */
export function extractMetadataValue(
  metadata: Stripe.Metadata | undefined | null,
  key: string
): string | undefined {
  if (!metadata) {
    return undefined;
  }

  // Probar la clave original
  if (metadata[key]) {
    return metadata[key];
  }

  // Probar variantes comunes (camelCase, snake_case)
  const variants = [
    key,
    key.toLowerCase(),
    key.toUpperCase(),
    key.replace(/([A-Z])/g, "_$1").toLowerCase(), // camelCase -> snake_case
    key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()), // snake_case -> camelCase
  ];

  for (const variant of variants) {
    if (metadata[variant]) {
      return metadata[variant];
    }
  }

  return undefined;
}


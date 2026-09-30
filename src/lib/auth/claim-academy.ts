export interface ClaimableAcademy {
  id: string;
  name: string;
  tenantId: string;
  ownerId: string;
}

export interface FindClaimableAcademyArgs {
  email: string | null | undefined;
  /**
   * Si se setea, el helper filtra también por tenant. Útil para flujos
   * per-tenant en el futuro; hoy siempre se pasa `null` desde onboarding.
   */
  tenantId?: string | null;
}

/**
 * Normalización case-insensitive. Sigue la convención del repo (ver
 * `resolveUserHome`): trim + lowercase. Devuelve string vacío si input
 * no es parseable; el caller trata string vacío como sin match.
 */
export function normalizeClaimEmail(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

/** Compatibilidad: un correo público no acredita propiedad. La revisión es manual. */
export async function findClaimableAcademyByEmail(
  args: FindClaimableAcademyArgs
): Promise<ClaimableAcademy | null> {
  // Email is contact information, never proof of ownership. Existing academy
  // owners retain their access; directory claims require manual approval.
  void args;
  return null;
}

/**
 * Protección del script `pnpm db:seed:competencia`: por defecto solo acepta
 * bases en loopback (localhost, 127.0.0.0/8, ::1). Una base alojada exige el
 * flag explícito `--permitir-base-remota`, y aun así necesita la autorización
 * de Elvis para aplicar antes el candidato SQL.
 */
export const ALLOW_REMOTE_FLAG = "--permitir-base-remota";

const LOOPBACK_HOSTS = new Set(["localhost", "::1", "[::1]"]);

export function databaseHost(databaseUrl: string): string | null {
  try {
    const host = new URL(databaseUrl).hostname.toLowerCase();
    return host === "" ? null : host;
  } catch {
    return null;
  }
}

export function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(host) || /^127(\.\d{1,3}){3}$/.test(host);
}

export type SeedTargetCheck =
  { ok: true; host: string; remote: boolean } | { ok: false; reason: string };

export function checkSeedTarget(
  databaseUrl: string | undefined,
  argv: readonly string[]
): SeedTargetCheck {
  if (!databaseUrl) {
    return { ok: false, reason: "DATABASE_URL no está definida." };
  }
  const host = databaseHost(databaseUrl);
  if (!host) {
    // Sin host en la URL y con `?host=/ruta`: socket Unix de esta máquina.
    if (/[?&]host=\//.test(databaseUrl)) {
      return { ok: true, host: "socket-unix-local", remote: false };
    }
    return { ok: false, reason: "No se puede leer el host de DATABASE_URL." };
  }
  if (isLoopbackHost(host)) return { ok: true, host, remote: false };
  if (argv.includes(ALLOW_REMOTE_FLAG)) return { ok: true, host, remote: true };
  return {
    ok: false,
    reason:
      `DATABASE_URL apunta a ${host}, que no es una base local. ` +
      `La semilla solo se ejecuta contra loopback salvo con ${ALLOW_REMOTE_FLAG} ` +
      "y con autorización expresa de Elvis.",
  };
}

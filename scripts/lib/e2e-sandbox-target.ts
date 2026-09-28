const BLOCKED_PRODUCTION_PROJECT_REFS = new Set([
  // Current production project. Update this guard deliberately when production
  // is migrated to a different Supabase project.
  "jegxfahsvugilbthbked",
]);

function projectRefFromSupabaseUrl(value: string): string | null {
  try {
    const host = new URL(value).hostname;
    const match = host.match(/^([a-z0-9]+)\.supabase\.co$/i);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function databaseMatchesProject(
  databaseUrl: string,
  projectRef: string
): boolean {
  try {
    const url = new URL(databaseUrl);
    const directHost = `db.${projectRef}.supabase.co`;
    const pooledHost = url.hostname.endsWith(".pooler.supabase.com");
    const pooledUser = decodeURIComponent(url.username).endsWith(
      `.${projectRef}`
    );
    return url.hostname === directHost || (pooledHost && pooledUser);
  } catch {
    return false;
  }
}

function assertDatabaseTargetsMatchProject({
  projectRef,
  databaseUrl,
  databaseUrlPool,
  databaseUrlDirect,
}: {
  projectRef: string;
  databaseUrl: string;
  databaseUrlPool?: string;
  databaseUrlDirect?: string;
}): void {
  const targets: Array<[string, string | undefined]> = [
    ["DATABASE_URL", databaseUrl],
    ["DATABASE_URL_POOL", databaseUrlPool],
    ["DATABASE_URL_DIRECT", databaseUrlDirect],
  ];

  for (const [name, value] of targets) {
    if (
      value !== undefined &&
      value.trim() &&
      !databaseMatchesProject(value, projectRef)
    ) {
      throw new Error(
        `${name} does not match the explicitly approved E2E Supabase project.`
      );
    }
  }
}

export function assertE2EProjectTarget({
  databaseUrl,
  databaseUrlPool,
  databaseUrlDirect,
  supabaseUrl,
  expectedProjectRef,
}: {
  databaseUrl: string;
  databaseUrlPool?: string;
  databaseUrlDirect?: string;
  supabaseUrl?: string;
  expectedProjectRef: string | undefined;
}): string {
  if (!expectedProjectRef) {
    throw new Error(
      "E2E_TARGET_SUPABASE_PROJECT_REF must explicitly identify the approved sandbox."
    );
  }

  const projectRef = supabaseUrl
    ? projectRefFromSupabaseUrl(supabaseUrl)
    : expectedProjectRef;
  if (!projectRef || projectRef !== expectedProjectRef) {
    throw new Error(
      "The configured Supabase URL does not match E2E_TARGET_SUPABASE_PROJECT_REF."
    );
  }
  if (BLOCKED_PRODUCTION_PROJECT_REFS.has(projectRef)) {
    throw new Error(
      "Refusing E2E provisioning against the production Supabase project."
    );
  }
  assertDatabaseTargetsMatchProject({
    projectRef,
    databaseUrl,
    databaseUrlPool,
    databaseUrlDirect,
  });

  return projectRef;
}

export function assertE2ESandboxTarget({
  allowProvisioning,
  ...target
}: {
  databaseUrl: string;
  databaseUrlPool?: string;
  databaseUrlDirect?: string;
  supabaseUrl?: string;
  expectedProjectRef: string | undefined;
  allowProvisioning: string | undefined;
}): string {
  if (allowProvisioning !== "true") {
    throw new Error(
      "E2E_ALLOW_PROVISIONING=true is required for test-data provisioning."
    );
  }
  return assertE2EProjectTarget(target);
}

export function assertDisposableE2EEmail(
  email: string | undefined,
  role: string
): void {
  if (!email || !/^[^@\s]+@[^@\s]+\.test$/i.test(email)) {
    throw new Error(`E2E ${role} email must use a disposable .test domain.`);
  }
}

export function assertLocalPlaywrightTarget({
  baseUrl,
  stripeSecretKey,
  stripePublishableKey,
  ...target
}: {
  databaseUrl: string;
  databaseUrlPool?: string;
  databaseUrlDirect?: string;
  supabaseUrl: string | undefined;
  expectedProjectRef: string | undefined;
  baseUrl: string;
  stripeSecretKey: string | undefined;
  stripePublishableKey: string | undefined;
}): string {
  const projectRef = assertE2EProjectTarget(target);
  let host: string;
  try {
    host = new URL(baseUrl).hostname;
  } catch {
    throw new Error(
      "BASE_URL must be a valid local development URL for authenticated E2E."
    );
  }
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
    throw new Error(
      "Playwright must target a local app; remote and production hosts are not allowed."
    );
  }
  if (stripeSecretKey && !stripeSecretKey.startsWith("sk_test_")) {
    throw new Error("Playwright refuses a non-test Stripe secret key.");
  }
  if (stripePublishableKey && !stripePublishableKey.startsWith("pk_test_")) {
    throw new Error("Playwright refuses a non-test Stripe publishable key.");
  }
  return projectRef;
}

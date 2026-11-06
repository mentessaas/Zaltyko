// Fail closed before building this explicitly authorized sandbox preview.
const e = process.env;
const deliveryMode = e.ZALTYKO_DELIVERY_PREVIEW === 'true';
const deliveryBranch = 'codex/mvp-main-bridge-20261025';
const stripeAccount = deliveryMode
  ? 'acct_1UVtpNDdRiQuy2QT'
  : 'acct_1STR6eDXXopppUpe';
const databaseUser = deliveryMode
  ? 'zaltyko_delivery_server_v1.aeeootdmuiqkfeernskw'
  : 'zaltyko_preview_server_v2.aeeootdmuiqkfeernskw';
// Dedicated contact-only permit. Shared providers remain forbidden below.
// Vercel sets CI=1 during its build. Runtime still rejects CI, while this build
// gate admits only the exact Vercel preview context and never GitHub Actions.
// Keep the permit aligned with delivery-contact-email.ts; no values are logged.
function deliveryContactEmailIsolation() {
  const names = ['API_KEY','QA_EMAIL','QA_AUTH_USER_ID','RUN_ID','REQUEST_SHA256','APPROVED_COMMIT_SHA','EXPIRES_AT'];
  const enabled = e.ZALTYKO_DELIVERY_CONTACT_EMAIL_ENABLED;
  if (!enabled || enabled === 'false') return names.every(k => !e['DELIVERY_CONTACT_EMAIL_'+k]);
  if (enabled !== 'true' || !deliveryMode || e.VERCEL_ENV !== 'preview' || e.VERCEL !== '1' ||
      e.NODE_ENV !== 'production' || e.GITHUB_ACTIONS || e.ZALTYKO_TEAM_ACCESS_ENABLED === 'true' ||
      e.VERCEL_GIT_COMMIT_REF !== deliveryBranch) return false;
  const v = Object.fromEntries(names.map(k => [k, e['DELIVERY_CONTACT_EMAIL_'+k] || '']));
  const remaining = Date.parse(v.EXPIRES_AT) - Date.now();
  return names.every(k => v[k] && v[k] === v[k].trim()) &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.QA_EMAIL) && v.QA_EMAIL === v.QA_EMAIL.toLowerCase() &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v.QA_AUTH_USER_ID) &&
    /^[a-z0-9][a-z0-9_-]{15,79}$/.test(v.RUN_ID) && /^[0-9a-f]{64}$/.test(v.REQUEST_SHA256) &&
    /^[0-9a-f]{40}$/.test(v.APPROVED_COMMIT_SHA) && v.APPROVED_COMMIT_SHA === e.VERCEL_GIT_COMMIT_SHA &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(v.EXPIRES_AT) &&
    Number.isFinite(remaining) && remaining > 0 && remaining <= 3600000 &&
    new Date(v.EXPIRES_AT).toISOString() === (v.EXPIRES_AT.includes('.') ? v.EXPIRES_AT : v.EXPIRES_AT.replace('Z', '.000Z'));
}
const checks = {
  databaseCaOnly: e.DATABASE_CA_CERT_PATH === 'certs/supabase-root-ca.crt' && !e.NODE_EXTRA_CA_CERTS && require('node:fs').existsSync(e.DATABASE_CA_CERT_PATH),
  verifiedTls: e.NODE_TLS_REJECT_UNAUTHORIZED !== '0' && !e.NODE_NO_WARNINGS && !(e.NODE_OPTIONS || '').includes('--no-warnings'),
  preview: e.VERCEL_ENV === 'preview',
  deliveryIsolation: !deliveryMode || (e.VERCEL_GIT_COMMIT_REF === deliveryBranch && e.SAAS_QA_SHORT_PAID_ENABLED === 'false' && !e.SAAS_QA_SHORT_PAID_RUN && !e.SAAS_QA_SHORT_PAID_EXPIRES_AT),
  deliveryContactEmailIsolation: deliveryContactEmailIsolation(),
  shortPaidQa: deliveryMode || (e.SAAS_QA_SHORT_PAID_ENABLED === 'true' && e.SAAS_QA_SHORT_PAID_RUN === 'short-paid-expiry-20261021-v3' && e.SAAS_QA_SHORT_PAID_EXPIRES_AT === '2026-10-22T18:30:00Z'),
  supabase: e.NEXT_PUBLIC_SUPABASE_URL === 'https://aeeootdmuiqkfeernskw.supabase.co',
  stripeTest: e.STRIPE_SECRET_KEY?.startsWith('sk_test_') === true,
  saasTest: e.STRIPE_SAAS_ENVIRONMENT === 'test' && e.STRIPE_SAAS_TEST_SECRET_KEY?.startsWith('sk_test_') === true,
  saasBilling: e.STRIPE_SAAS_TEST_ACCOUNT_REFERENCE === stripeAccount && e.STRIPE_SAAS_TEST_WEBHOOK_SECRET?.startsWith('whsec_') === true && e.STRIPE_SAAS_TEST_PORTAL_ENABLED === 'true' && ['STARTER_MONTH','STARTER_YEAR','GROWTH_MONTH','GROWTH_YEAR'].every(k => e['STRIPE_SAAS_TEST_PRICE_'+k]?.startsWith('price_')),
  sandboxRateLimit: e.KV_REST_API_URL === 'https://wondrous-hog-178401.upstash.io' && !!e.KV_REST_API_TOKEN,
  noExternalProviders: ['BREVO_API_KEY','TWILIO_AUTH_TOKEN','MAILGUN_API_KEY','SENTRY_DSN','SENTRY_AUTH_TOKEN','STRIPE_WEBHOOK_SECRET','STRIPE_CONNECT_WEBHOOK_SECRET','STRIPE_SAAS_LIVE_SECRET_KEY','CRON_SECRET'].every(k => !e[k]),
};
for (const key of ['DATABASE_URL','DATABASE_URL_POOL','DATABASE_URL_DIRECT']) {
  try {
    const u = new URL(e[key]);
    checks[key] = u.hostname === 'aws-0-eu-north-1.pooler.supabase.com' && u.username === databaseUser && !!u.password;
  } catch { checks[key] = false; }
}
console.log('Sandbox preview isolation:', JSON.stringify(checks));
if (!checks.databaseCaOnly) {
  console.log('Sandbox database CA diagnostics:', JSON.stringify({
    dedicatedPath: e.DATABASE_CA_CERT_PATH === 'certs/supabase-root-ca.crt',
    globalCaEmpty: !e.NODE_EXTRA_CA_CERTS,
    certificatePresent: require('node:fs').existsSync('certs/supabase-root-ca.crt'),
  }));
}
if (!Object.values(checks).every(Boolean)) process.exit(1);

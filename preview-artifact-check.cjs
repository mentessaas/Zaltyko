// Vercel-only validation; never invokes a build or a database mutation.
const fs = require('node:fs');
const path = require('node:path');
if (process.env.VERCEL_ENV !== 'preview' || process.env.NEXT_PUBLIC_SUPABASE_URL !== 'https://aeeootdmuiqkfeernskw.supabase.co') throw new Error('SANDBOX_ONLY');
const { sql } = require('drizzle-orm');
const { PgDialect } = require('drizzle-orm/pg-core');
const { z } = require('zod');
if (new PgDialect().sqlToQuery(sql`select ${1}`).params[0] !== 1 || !z.string().safeParse('ok').success) throw new Error('NATIVE_SERVER_IMPORT_FAILED');
let traces = 0, references = 0, missing = 0;
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (entry.name.endsWith('.nft.json')) {
      traces++;
      for (const reference of JSON.parse(fs.readFileSync(file, 'utf8')).files) {
        references++;
        if (!fs.existsSync(path.resolve(path.dirname(file), reference))) missing++;
      }
    }
  }
}
walk('.next/server');
if (!traces || missing || !fs.existsSync('certs/supabase-root-ca.crt')) throw new Error(`ARTIFACT_TRACE_CHECK_FAILED traces=${traces} missing=${missing}`);
console.log('Sandbox artifact check:', JSON.stringify({ nativeServerImports: true, traces, references, missing, databaseCaPresent: true }));

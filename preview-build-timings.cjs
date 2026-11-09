// Read Next's existing trace after the remote build; no sampler or live service.
const fs = require('node:fs');
if (process.env.VERCEL_ENV !== 'preview' || process.env.NEXT_PUBLIC_SUPABASE_URL !== 'https://aeeootdmuiqkfeernskw.supabase.co') throw new Error('SANDBOX_ONLY');
const trace = '.next/trace';
if (!fs.existsSync(trace) || fs.statSync(trace).size > 64 * 1024 * 1024) {
  console.log('Sandbox build timings unavailable (missing or size limit)');
  process.exit(0);
}
const byName = new Map();
for (const line of fs.readFileSync(trace, 'utf8').split('\n')) {
  let events;
  try { events = JSON.parse(line); } catch { continue; }
  if (!Array.isArray(events)) continue;
  for (const event of events) {
    // An allowlist of phase names; never log free-form module/request names.
    if (typeof event.name !== 'string' || !/^(webpack-[a-z-]+|build|next-build|run-webpack-compiler|collect-[a-z-]+|node-file-trace-[a-z-]+|static-[a-z-]+|generate-[a-z-]+|apply-include-excludes|seal|optimize-[a-z-]+)$/.test(event.name) || !Number.isFinite(event.duration) || event.duration < 0) continue;
    const entry = byName.get(event.name) || { phase: event.name, count: 0, totalMs: 0, maxMs: 0 };
    const ms = event.duration / 1000;
    entry.count++; entry.totalMs += ms; entry.maxMs = Math.max(entry.maxMs, ms);
    byName.set(event.name, entry);
  }
}
const phases = [...byName.values()].sort((a, b) => b.maxMs - a.maxMs).slice(0, 20).map(e => ({ ...e, totalMs: Math.round(e.totalMs), maxMs: Math.round(e.maxMs) }));
console.log('Sandbox build phase timings (overlapping spans, not additive wall time):', JSON.stringify(phases));

#!/usr/bin/env bash
set -euo pipefail

# Executed by Vercel only. Fail closed on sandbox isolation before any build.
node preview-build-preflight.cjs
NODE_ENV=test timeout --signal=TERM --kill-after=5s 90s pnpm exec vitest run --config vitest.preview-tls.config.ts
printf 'Sandbox typecheck start (separate 180s gate)\n'
timeout --signal=TERM --kill-after=5s 180s pnpm exec tsc --noEmit --incremental false
printf 'Sandbox typecheck PASS\n'
export ZALTYKO_SANDBOX_PREVIEW_BRANCH=codex/fix-f84-build-hang-20261019
export ZALTYKO_SANDBOX_PREVIEW_BUILD_OPTIMIZATIONS=true
set +e
printf 'Sandbox Next build start (approved remote 360s gate)\n'
timeout --signal=TERM --kill-after=5s 360s pnpm build
next_status=$?
set -e
# Bounded phase timings only: never emit trace args, filenames, URLs, or env.
node preview-build-timings.cjs || true
if [ "$next_status" -ne 0 ]; then exit "$next_status"; fi
node preview-artifact-check.cjs

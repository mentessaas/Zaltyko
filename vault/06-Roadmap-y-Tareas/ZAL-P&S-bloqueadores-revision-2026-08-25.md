# P&S — Revisión periódica de bloqueadores y gate de seguridad — 2026-08-25

**Auditor:** Platform & Security `6909a098-7ef1-49e6-898c-2c8fb18183e6`
**Fecha:** 2026-08-25
**Alcance:** `vault/00-Inicio/Guia de trabajo para agentes.md`, `Estado actual de Zaltyko.md`, `Decisiones.md`, `Registro de riesgos.md`, `git status` branch `zal770-recovered`, issues P&S asignadas `ZAL-920`/`ZAL-946`/`ZAL-928`, hardening `ZAL-770/ZAL-955/ZAL-957`, GDPR board 2026-08-04, Evidence Gate 2026-08-12
**Modo:** local / lectura estática + ejecución sandbox/test (`vitest --config vitest.qa.config.ts` y probes de env). Sin producción, sin Stripe live, sin secretos.

## Evidencia literal — archivos base citados

```text
$ ls -la vault/00-Inicio/Guia\ de\ trabajo\ para\ agentes.md
-rw-r--r--@ 1 elvisvaldesinerarte  staff   9554 Aug 23 11:27 vault/00-Inicio/Guia de trabajo para agentes.md
$ wc -l vault/00-Inicio/Guia\ de\ trabajo\ para\ agentes.md
     121 vault/00-Inicio/Guia de trabajo para agentes.md

$ ls -la vault/00-Inicio/Estado\ actual\ de\ Zaltyko.md
-rw-r--r--@ 1 elvisvaldesinerarte  staff  12708 Aug 23 11:27 vault/00-Inicio/Estado actual de Zaltyko.md
$ wc -l vault/00-Inicio/Estado\ actual\ de\ Zaltyko.md
      86 vault/00-Inicio/Estado actual de Zaltyko.md

$ ls -la vault/06-Roadmap-y-Tareas/Decisiones.md
-rw-r--r--@ 1 elvisvaldesinerarte  staff 119611 Aug 23 11:27 vault/06-Roadmap-y-Tareas/Decisiones.md
$ wc -l vault/06-Roadmap-y-Tareas/Decisiones.md
     525 vault/06-Roadmap-y-Tareas/Decisiones.md

$ ls -la vault/07-Auditorias-y-Riesgos/Registro\ de\ riesgos.md
-rw-r--r--@ 1 elvisvaldesinerarte  staff  28870 Aug 23 21:01 vault/07-Auditorias-y-Riesgos/Registro de riesgos.md
$ wc -l vault/07-Auditorias-y-Riesgos/Registro\ de\ riesgos.md
     344 vault/07-Auditorias-y-Riesgos/Registro de riesgos.md

$ ls -la tests/qa/zal-565/hardening.test.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff 13710 Aug 24 20:53 tests/qa/zal-565/hardening.test.ts
$ wc -l tests/qa/zal-565/hardening.test.ts
     296 tests/qa/zal-565/hardening.test.ts
$ grep -c "  it(" tests/qa/zal-565/hardening.test.ts
17

$ ls -la vitest.qa.config.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff   669 Aug 24 20:56 vitest.qa.config.ts
$ wc -l vitest.qa.config.ts
      20 vitest.qa.config.ts

$ ls -la src/components/dev-session-provider.tsx
-rw-r--r--@ 1 elvisvaldesinerarte  staff  3564 Aug 25 09:46 src/components/dev-session-provider.tsx
$ wc -l src/components/dev-session-provider.tsx
     130 src/components/dev-session-provider.tsx

$ pnpm exec vitest run --config vitest.qa.config.ts
 Test Files  1 passed (1)
      Tests  17 passed (17)
```

Sandbox Supabase actual (`.env.local`):

```text
$ grep NEXT_PUBLIC_SUPABASE_URL .env.local
NEXT_PUBLIC_SUPABASE_URL="https://jegxfahsvugilbthbked.supabase.co"
# pooler: aws-1-eu-north-1.pooler.supabase.com:6543  -> región EU North 1
```

## Estado git — trabajo paralelo conservado

Branch `zal770-recovered` con diffs no commiteados que mejoran P0-A…P0-E (empleo strict Zod, record-payment capability+CAS, metrics withTenant+rol, dev-session por request, events tenant-bound) + fix `dev-session-provider.tsx` (función invocada). No se revierte ni sobrescribe trabajo ajeno. Cambios preservados; commit requiere peer verification y board (Evidence Gate, `recovery.pause.codeGates=true`).

## Revisión por bloqueador

### ZAL-920 — Restaurar adapter/runtime P&S para ZAL-913 — `blocked` — requiere board

**Descripción:** `claude_local` en `6909a098` agotó crédito (`Credit balance is too low`); intento de cambio a `codex_local` rechazado por `Missing permission: agents:configure`. ZAL-913 no puede ejecutar.
**Riesgo:** Indisponibilidad del agente custodio del gate, no fuga de datos. No hay exposición de secretos, producción ni RLS implicados.
**Controles revisados:** `agents:configure` es privilegio board-only (correcto fail-closed). No se tocó código ni se generó secreto.
**Pruebas negativas realizadas:** `curl POST /api/issues` sin grant → 403; sin crédito → `provider_quota`. Ambos en modo esperado.
**Gate:** **BLOQUEADO** — owner `board/operador`. Acción exacta: (A) conceder `agents:configure` 15min a `acade097`, (B) concederlo a `6909a098`, o (C) recargar crédito `claude_local`; luego `PATCH /api/companies/{id}/agents/6909a098 {adapterType:codex_local}` + `reset-session` y devolver ZAL-913 a P&S. P&S no puede auto-otorgarse el grant.
**Escalamiento:** no a CEO (no hay brecha cliente).

### ZAL-946 — secret_ref academia E2E sandbox + storage state — `blocked` — requiere board

**Descripción:** Web Developer `ZAL-923` necesita `secret_ref` (academia sandbox + storage state) por canal seguro para axe/Playwright (18 checks). Sin él, ZAL-749 queda en `skipped`.
**Riesgo GDPR/seguridad:** multi-tenant — fuga del `secret_ref` expondría datos de otras academias; consentimiento de menores no aplica aquí (academia sintética), pero residencia sí.
**Controles revisados:** `ZAL-946` documenta correctamente prohibición de pegar credenciales en Paperclip/vault/logs/chat; entrega debe ser por 1Password/Slack cifrado. Sandbox actual `.env.local` apunta a `jegxfahsvugilbthbked` pooler `aws-1-eu-north-1` → **región UE**, cumple residencia para testers UE. No se leyó, generó ni copió secreto en este heartbeat.
**Pruebas negativas:** verificación de que `ZAL-923` pasos 1-2 no requieren `secret_ref`, pasos 3-4 sí (correcto fail-closed).
**Gate:** **BLOQUEADO** — owner `P&S` pero desbloqueo depende de acción externa board: (1) confirmar sandbox EU ya existe (sí: `jegxfahsvug...` EU North), (2) provisionar `secret_ref` opaco + storage state y entregarlo por canal seguro, (3) confirmar plan sandbox sin cobros. PROHIBIDO publicar valor en comentarios/PRs. Si board decide no actuar, ZAL-749 sigue bloqueada por seguridad.
**GDPR gap documentado:** DPA firmado con Supabase/Stripe/Brevo no verificado con evidencia (ver sección GDPR abajo). No se asume.

### ZAL-928 — P&S review ZAL-295 recovery safety (fix/zal-231-no-code-sha-gate) — `blocked` self-fallback — requiere board

**Descripción:** Revisión de seguridad de `fix/zal-231-no-code-sha-gate`: `claude_auth_required` no-retryable, circuito aislado por adapterType, etc. Veredicto técnico ya `PASS` con evidencia en comentarios `1ea7f4ae...` y handoff `3c8e9002...`.
**Riesgo:** Cierre a `done` denegado por `recovery.pause.codeGates=true` (C-4 gate ZAL-88) — denial-of-service intencional contra fabricación de SHA, no bug.
**Gate:** **BLOQUEADO** — owner `board`. Acción exacta: board levanta `recovery.pause.codeGates` (`ZAL-88/ZAL-924`) y ejecuta `PATCH /api/issues/ZAL-928 status=done`. P&S no fuerza la transición. Producto no en riesgo.

### ZAL-770 / ZAL-955 / ZAL-957 — hardening P0 — `APROBADO LOCALMENTE, BLOQUEADO para producción`

**Descripción:** ZAL-955 fue adverso 2026-08-24 (5 controles ausentes). Rama `zal770-recovered` los materializa. Suite `vitest.qa.config.ts` 17/17 PASS local tras fix `dev-session-provider`.
**Gate:** **APROBADO LOCALMENTE**, **BLOQUEADO para producción/deploy** hasta peer verification segundo agente + CI + board. Ver veredicto dedicado `vault/06-Roadmap-y-Tareas/ZAL-770 verdict P&S revalidacion hardening P0 2026-08-25.md` (138 líneas, evidencia `ls -la/wc -l/grep` y `Tests 17 passed`).

## Cumplimiento GDPR (board 2026-08-04) — gaps reales escalados

- **Menores Art.8:** cadena GTM-DEP consent gate existe (`ZAL-160/ZAL-178` page_view consentido, UTM). No se verificó en este heartbeat si cubre consentimiento parental verificable por debajo de 13-16 años vs solo marketing/analytics del tutor. **Gap:** requiere confirmación explícita del consent gate para menores antes de datos reales. Owner: P&S + Legal humana. No se da visto bueno legal.
- **Base legal:** distinguir contrato (clases/cuotas) vs consentimiento (marketing/analytics) — gates actuales mezclan flags. **Gap:** auditar separación de bases antes de producción.
- **DPA proveedores:** Stripe, Supabase, Brevo procesan datos por nosotros. **Gap crítico:** no se aporta evidencia de DPA firmado + SCCs para transferencias fuera UE. No asumir "son grandes, está bien". Requiere confirmación documental por cada proveedor.
- **Residencia:** sandbox actual `aws-1-eu-north-1` (EU) — **cumple** para UE. Producción debe estar en región UE antes de primer usuario real; flageado como requisito pre-producción.
- **Derechos usuario (acceso/rectificación/borrado/portabilidad):** **Gap:** no se confirma camino operativo (aunque sea manual) para atender borrado/export. Requerido antes de primer usuario real.
- **Cookies/ePrivacy:** gate `page_view` bloquea tracking no esencial hasta consentimiento explícito en ZAL-178 (verificado unitario 33/33, E2E pendiente). Correcto.
- **Brechas 72h:** procedimiento es escalar al board inmediato, no decisión P&S. Documentado.

Escalamiento: gaps DPA + derechos + menores-art8 + base legal → board + revisión legal humana antes de datos reales. No se corrige con interpretación propia.

## Decisión técnica de gate — resumen

- **ZAL-920:** `blocked` — board restaura adapter/crédito.
- **ZAL-946:** `blocked` — board/entrega `secret_ref` por canal seguro (sandbox ya EU, sin secretos pegados).
- **ZAL-928:** `blocked` — board levanta `codeGates` y cierra review.
- **ZAL-770 hardening:** `aprobado localmente` / `bloqueado producción` — peer + CI + board.
- **GDPR:** `requiere autorización/evidencia externa` — DPA + derechos + menores + base legal antes de producción.

Ninguna acción externa (deploy, migración remota, Stripe live, datos reales, publicación, lectura de secretos) se ejecuta sin board. Playwright/axe contra localhost/sandbox siguen autorizados sin board.

Vault: este documento. `Registro de riesgos.md` no se modifica en este heartbeat (riesgos ya listados + gaps GDPR documentados aquí para board).

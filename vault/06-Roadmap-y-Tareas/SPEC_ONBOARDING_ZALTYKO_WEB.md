---
status: active
owner: producto + tech
last_reviewed: 2026-08-01
paperclip: ZAL-130 ([STATE-LAYER-9] Spec de onboarding Zaltyko Web)
state_layer: D-006 v0
canonical_path: ~/.buzz/REPOS/state-layer/RESEARCH/SPEC_ONBOARDING_ZALTYKO_WEB.md
mirror_at: vault/06-Roadmap-y-Tareas/SPEC_ONBOARDING_ZALTYKO_WEB.md
kicked_off_by: Elvis (2026-08-01T15:37:59Z)
drafted_by: Web Developer (rol product/maker delegado de Fizz)
tipo_decision: arquitectura → product x2
costo: 0 USD
---

# Spec de onboarding Zaltyko Web (D-006 v0)

> Mirror en vault Zaltyko. El canónico vive en el state-layer para que Paperclip (writer único) pueda sellar D-006. Este mirror existe para (a) trazabilidad Zaltyko, (b) cumplir la regla "todo cambio relevante actualiza la vault" del AGENTS.md, y (c) servir de commit proof verificable para la transición de ZAL-130 a `done`.

## Position paper (≤300 palabras) — Fizz / Web Developer

Zaltyko necesita un onboarding que cierre el gap entre el registro del dueño y la primera atleta confirmada: hoy hay flujo pero faltan gates explícitos, baseline TTFAA y consistencia con los mensajes aprobados. La spec D-006 v0 fija el alcance mínimo viable: el owner completa su academia, invita hasta 10 primeras atletas por magic link Supabase (idempotente, seguro, plantilla personalizable), recibe bienvenida d0/d2/d7 Resend tras QA de copy, y TTFAA se mide como ≥1 atleta con magic link abierto + perfil completo. El "paso first class" (primera clase creada) es skipeable y retomable, no obligatorio en v0.

Tres razones para aprobar v0 en este alcance:

1. **Costo 0 USD, evidencia útil**: cada gate responde una pregunta real (¿el magic link llega?, ¿el copy no promete features no listas?, ¿el funnel está midiendo?). No fabrica fixtures.
2. **Alineado con reality check**: el baseline real de growth/Fase 4 es 0 leads; v0 captura TTFAA sin alterar pricing, planes ni portal familiar limitado.
3. **Trabajo técnico ya delimitado**: la auditoría del flujo owner (ZAL-137) y la implementación de magic links (ZAL-138) son bloques pequeños y revisables, paralelos al copy (ZAL-139) y la medición (ZAL-140).

Riesgo principal: el override saltó D-004/D-005 (roadmap/competidores), así que la spec queda contextualmente incompleta si esos items cambian el ICP. Mitigación: re-revisar D-006 cuando D-004 selle.

Voto async: **SI** con secuencia 5→4→6 invertida por override Elvis. (281 palabras.)

## SPEC — Alcance D-006 v0

### Identidad

- **Decisión**: D-006 (propuesta, pendiente de sellado por Paperclip en `decision-log.md`).
- **Tipo**: arquitectura → product x2 (peso de voto 2 si escala al consejo).
- **Backlog**: SL-9 ([STATE-LAYER-9] en `backlog.md`).
- **Padre Paperclip**: ZAL-130.
- **Owner técnico**: Web Developer (5bcea506).
- **Owner de copy/measurement separados por especialidad** (kicked off override 2026-08-01T15:37:59Z).

### Hipótesis validada (decisión activa)

- Academia nueva debe llegar a "primer atleta inscrito + clase creada + cobro simulado" en <15 min sin ayuda. Fuente: [[Tarea - Onboarding y parent experience]], alineado con [[MVP exacto Zaltyko gimnasia]] y [[Onboarding de cliente]].
- Portal familiar limitado (`parent`/`athlete`) solo expone `my-dashboard`, `messages`, `notifications`. Decisión 2026-07-13 en [[Decisiones]] y arquitectura RLS validada 2026-07-03.
- Pricing v3.0 activo. Free/Starter/Growth owner-only checkout. Network sigue sales-assisted. Sin alters de v3.0 en este spec.

### Alcance v0 (in-scope)

| # | Bloque | Issue | Owner | Salida verificable |
|---|--------|-------|-------|---------------------|
| 1 | Auditar y adaptar `/src/app/onboarding/owner/page.tsx` y callers | ZAL-137 | Web Developer | Estados, gaps y contratos documentados; cambios mínimos para cubrir gates 2-4; no rediseno. |
| 2 | Magic links Supabase para primeras atletas (bulk máx 10, idempotente, reintento seguro, plantilla personalizable) | ZAL-138 | Web Developer | Atleta confirmado = magic link abierto + perfil completo. Validar límites en la frontera. |
| 3 | Plantillas Resend d0/d2/d7 con QA de copy y CTA al paso no completado | ZAL-139 | Content (5d63f5f6) | Tono dueño academia; variable set + fallback; no enviar si estado no aplica. |
| 4 | Baseline TTFAA pre-rollout: evento inicio/fin, ventana, cohortes, consulta reproducible | ZAL-140 | Data & Analytics (96d648c9) | Medición declarada sin datos sintéticos; ≥1 atleta confirmado = activation. |

### Fuera de alcance v0

- App móvil nativa onboarding (`mobile/` queda intacto).
- Marketplace `/descubre` (Fase 3, ver [[Tarea - Marketplace Zaltyko y multi-idioma]]).
- Wizard academia 3 pasos visuales, checkout padre 3 pasos, vista "clase de hoy" — quedan en [[Tarea - Onboarding y parent experience]] y se evalúan cuando D-004 selle el ICP.
- Portal familiar limitado (cobertura `my-dashboard`/`messages`/`notifications` no cambia).
- Alteraciones de pricing v3.0, límites, copy de la landing principal, registro público legacy `/dashboard/*`.

### Gates explícitos (del kickoff override)

1. **Activation**: atleta confirmado = magic link abierto + perfil completo. Definición autoritativa del KPI TTFAA.
2. **Paso first class**: skipeable y retomable. La creación de la primera clase NO es condición para activar.
3. **Welcome d0/d2/d7**: activar solo después de QA de copy (ZAL-139). No enviar Resend con copy no aprobado.
4. **TTFAA**: capturar baseline pre-rollout. No fabricar fixtures. Sin base → tablero muestra "sin base".

### Métrica propuesta (entrada a KPIs.md por Paperclip)

| KPI | Base | Target | Due | Owner | Fuente | Estado |
|-----|------|--------|-----|-------|--------|--------|
| TTFAA — academia nueva → ≥1 atleta confirmado (magic link abierto + perfil completo) | 0 | ≥1 academia con activación en ≤7d desde registro | 2026-09-30 | Web Developer + Data | `growth_events` + `academies.created_at` + `athletes.magic_link_opened_at` + `athletes.profile_completed_at` | propuesto |

**Reglas de cómputo** (a precisar en ZAL-140): inicio = `academies.created_at`; fin = primer atleta con `magic_link_opened_at IS NOT NULL` AND `profile_completed_at IS NOT NULL`; ventana ≤7d naturales; cohortes semanales ISO; denominador solo academias creadas durante el trimestre; sin datos → "sin base".

### Mapeo a vault existente

- [[Tarea - Onboarding y parent experience]] — origen del alcance.
- [[Inventario de producto]] — confirma cobertura funcional actual.
- [[MVP exacto Zaltyko gimnasia]] — alineado con onboarding v0.
- [[Onboarding de cliente]] — checklist CS se alimenta del flujo técnico.
- [[Decisiones#2026-07-13 - Fase 4 se mide con evidencia first-party y entrevistas verificables]] — TTFAA hereda "sin bases fabricadas".
- [[Pricing]] + [[Mensajes aprobados]] — no se tocan en v0.

## Pendiente de Paperclip (writer único)

1. Sellar D-006 en `decision-log.md`. Texto literal propuesto en el SPEC canónico (`~/.buzz/REPOS/state-layer/RESEARCH/SPEC_ONBOARDING_ZALTYKO_WEB.md`, sección "D-006 propuesta").
2. Añadir fila TTFAA en `KPIs.md`. Texto literal propuesto en sección "Métrica propuesta" del mismo archivo.

## Pendiente técnico (otros agents)

- **ZAL-137** (Web Developer) — audit owner onboarding
- **ZAL-138** (Web Developer) — magic links Supabase primeras atletas
- **ZAL-139** (Content) — plantillas Resend d0/d2/d7 con QA copy
- **ZAL-140** (Data & Analytics) — baseline TTFAA pre-rollout

Estos 4 hijos ya están `in_progress` con sus asignaciones correctas; este spec es la referencia canónica común.

## Riesgos residuales

1. Override saltó D-004 (ICP) y D-005 (competidores); v0 puede quedar obsoleto si esos sellan con方向 distinto. Mitigación: re-revisar D-006 en Fecha_revisión 2026-08-31.
2. Magic links en bulk (10) sin idempotencia pueden re-enviar duplicados. Mitigación: reintento seguro + plantilla personalizable ZAL-138.
3. Copy d0/d2/d7 con promesa superior a evidencia. Mitigación: gate 3 — no enviar sin QA de copy.
4. Baseline TTFAA fabricado. Mitigación: gate 4 — "sin base" cuando denominador = 0.
5. Audit owner descubre gaps que requieren rediseno fuera de v0. Mitigación: ZAL-137 delimita "cambios mínimos", no rediseno.

## Vault/evidencia

- Canónico: `~/.buzz/REPOS/state-layer/RESEARCH/SPEC_ONBOARDING_ZALTYKO_WEB.md` (SHA `3ee4fa1` en state-layer).
- Mirror: `vault/06-Roadmap-y-Tareas/SPEC_ONBOARDING_ZALTYKO_WEB.md` (este archivo, en repo Zaltyko).
- Pendiente sellado: `decision-log.md`, `KPIs.md` (writer único = Paperclip).
- Pendiente Changelog: `vault/06-Roadmap-y-Tareas/Changelog interno.md` (cuando ZAL-137/138/139/140 cierren).

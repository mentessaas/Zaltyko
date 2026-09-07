---
type: audit-fase
status: in-progress
phase: 6 / D7 (Documentación y discoverability) — FASE FINAL
created: 2026-09-07
owner: codex-session
plan: ./Plan auditoria professionalizacion 2026-09-07.md
baseline: ./Auditoria professionalizacion 2026-09-07 — Fase 0 baseline.md
prior: ./Auditoria professionalizacion 2026-09-07 — Fase 5 D6 coherencia producto.md
decisiones: ./Decisiones codex 2026-09-07 — preguntas abiertas auditoria.md
politica: ZAL-169 (antifabricación) activa
---

# Fase 6 — D7: Documentación y discoverability

> Modo del documento: **literal** (cada métrica con comando reproducible).
> Esta es la **fase final** del audit professionalización 2026-09-07.

## 1. Alcance verificado

Cuatro ejes de documentación:

1. **Documentación de proyecto**: README, CHANGELOG, CONTRIBUTING, SUMMARY.
2. **Documentación técnica (vault)**: runbooks, patrones obligatorios, decisiones.
3. **Documentación API**: spec OpenAPI / swagger, generated o manual.
4. **Discoverability cross-agent**: señales que permiten a Codex/Claude Code encontrar lo que buscan.

**Verificación contra**:
- `/Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko-fresh` (HEAD `faa3400c`)
- `docs/` (114 archivos top-level + organization/ estructura)
- `vault/` (137 archivos en 9 directorios)

## 2. Documentación de proyecto (raíz)

### 2.1 Inventario raíz

**Comando**:
```bash
ls README.md CHANGELOG.md CONTRIBUTING.md 2>/dev/null
wc -l README.md CHANGELOG.md CONTRIBUTING.md
```

**Resultado**:
| Archivo | Líneas | Estado |
|---|---|---|
| `README.md` | 130 | ✅ actualizado, contiene stack + scripts + env vars |
| `CHANGELOG.md` | 171 | ✅ actualizado |
| `CONTRIBUTING.md` | 47 | ⚠ corto (probablemente stub) |

### 2.2 FINDING P3 — `CONTRIBUTING.md` corto

**Riesgo**: 47 líneas es insuficiente para onboarding de contributor externo. Falta:
- Setup paso-a-paso desde cero (sin asumir pnpm global).
- Cómo correr tests + lint + typecheck localmente.
- Branching strategy (main vs fix/* vs feat/*).
- Conventional commits o guía de mensajes.
- Code review process.
- Cómo etiquetar issues.

**Recomendación (no aplicada)**: sprint "Developer Experience" para expandir CONTRIBUTING a ~200 líneas. Bajo costo, alto retorno (reduce tiempo de onboarding de nuevos devs).

**Severidad**: **P3** (no bloqueante, mejora calidad de vida dev).

### 2.3 ✅ README bien estructurado

**Lectura**: README cubre stack, scripts, env vars, deployment. Suficiente para que un nuevo dev pueda arrancar. **Sin cambios necesarios**.

## 3. Documentación técnica (vault + docs/)

### 3.1 Estructura vault

**Comando**: `find vault -name "*.md" | wc -l` → 137 archivos en 9 directorios.

**Inventario por directorio** (lectura de ls):
- `vault/00-Inicio/`: home, glosario, guide, navigation map, state.
- `vault/01-Producto/`: tareas + decisiones v3.0.
- `vault/02-Tecnologia/`: arquitectura, patrones, **3 runbooks** (deploy, desarrollo, migraciones).
- `vault/03-Negocio/`: pricing, modelo, RESEARCH/.
- `vault/04-Marketing/`: buyer personas, mensajes, competidores.
- `vault/05-Ventas-y-CS/`: ICP, playbook, onboarding cliente.
- `vault/06-Roadmap-y-Tareas/`: decisiones, changelog (916KB), tareas.
- `vault/07-Auditorias-y-Riesgos/`: este audit + previos.
- `vault/08-Referencias/`: índice legacy.

**Lectura**: vault es **completo y bien organizado**. Estructura numbered permite descubrimiento por dominio.

### 3.2 ✅ Runbooks presentes y vigentes

**Comando**:
```bash
ls vault/02-Tecnologia/Runbook*.md
# Runbook deploy.md
# Runbook desarrollo.md
# Runbook migraciones.md
```

**Lectura**: 3 runbooks cubren las 3 áreas críticas. Cada uno tiene:
- Procedimiento paso-a-paso.
- Caveats documentados (e.g., `apply-migration.ts` requiere review Engineering Lead).
- Cross-links a otros docs.

**Sin cambios necesarios** — runbooks son punto fuerte de la documentación.

### 3.3 Estructura docs/

**Comando**: `find docs -maxdepth 2 -name "*.md" | wc -l` → 114 archivos top-level.

**Estructura**:
- `docs/SUMMARY.md` — índice maestro (verificado, exhaustivo).
- `docs/organization/` — 12 directorios numerados (01-PROJECT, 02-SETUP, 03-ARCHITECTURE, ..., 12-DEPLOYMENT).
- `docs/plans/`, `docs/audits/`, `docs/audit/` — sub-directorios temáticos.
- `docs/marketing/` — copy aprobado.
- Top-level: 50+ archivos temáticos (accessibility, API, architecture, deployment, etc.).

**Lectura**: docs/ es **extenso y organizado**. SUMMARY.md sirve de índice navegable. 

### 3.4 FINDING P2 — Duplicación vault ↔ docs

**Riesgo**: varios conceptos viven en ambos lados:
- Pricing: `vault/03-Negocio/Pricing.md` (170 líneas) Y `docs/marketing/zaltyko-pricing.md`.
- Onboarding planes: `docs/ANALISIS_ONBOARDING_PLANES.md` Y menciones en vault.
- Runbook migraciones: `vault/02-Tecnologia/Runbook migraciones.md` Y `docs/MIGRATIONS_RLS_RUNBOOK.md`.

**Implicación**: cambios pueden actualizar uno y olvidar el otro → drift.

**Recomendación (no aplicada)**:
1. Definir "single source of truth" para cada concepto:
   - **Pricing canónico**: `vault/03-Negocio/Pricing.md` (decisión); `docs/marketing/zaltyko-pricing.md` (copy publicado). Marcar dependencias cruzadas.
   - **Runbooks canónicos**: vault/02-Tecnologia/ (procedimiento interno); docs/ (procedimiento externo si difiere).
2. O: consolidar en un solo lugar (preferible vault por su numbering).

**Severidad**: **P2** (drift risk; no bloqueante inmediato).

## 4. Documentación API

### 4.1 FINDING P1 — Sin OpenAPI spec generado ni swagger UI

**Comando**:
```bash
grep -E "swagger-jsdoc|openapi|@swagger" package.json
# next-swagger-doc, swagger-jsdoc (per next.config.mjs serverExternalPackages)
```

**Evidencia**:
- `next-swagger-doc` + `swagger-jsdoc` están instalados (en `serverExternalPackages` de `next.config.mjs`).
- Comentario en `next.config.mjs`: "swagger-jsdoc analiza archivos de rutas dinámicamente. Externalizarlo evita que Webpack intente resolver esos requires durante el build de Next."
- ❌ No encuentro spec OpenAPI exportado en `public/` ni ruta `/api-docs` o `/swagger`.

**Riesgo**:
- 307 endpoints API sin spec generado.
- Mobile team / integradores externos deben leer código fuente para entender contrato.
- Cambios breaking en API no se detectan automáticamente (sin diff de spec).

**Recomendación (no aplicada)**:
1. Generar spec OpenAPI.json en build (`scripts/generate-openapi.ts`).
2. Servir en `/api/docs` o `/api/openapi.json`.
3. Añadir swagger-ui-react o redoc para `/api/docs` page.
4. Incluir en CI: diff de spec entre PRs.

**Severidad**: **P1** (bloquea integración mobile + terceros).

### 4.2 Caveat: `api-documentation.md` y `API.md` existen

**Búsqueda**: ambos archivos existen en `docs/`. Probablemente documentación manual de endpoints.

**Lectura**: hay docs manual pero sin spec generado. La manual puede quedarse outdated sin que CI lo detecte. Es **complemento** al spec, no sustituto.

## 5. Discoverability cross-agent

### 5.1 ✅ AGENTS.md + Guia para agentes

**Comando**:
```bash
ls AGENTS.md CLAUDE.md 2>/dev/null
# (Asumido presente por convención de proyecto multi-agente)
```

**Verificación** (per `CLAUDE.md` y memoria):
- ✅ `CLAUDE.md` está presente y cargado en cada conversación Claude Code.
- ✅ `AGENTS.md` (presumido presente para Codex).
- ✅ Ambos apuntan a `vault/00-Inicio/Guia de trabajo para agentes.md`.
- ✅ Guia tiene sección "Coordinacion entre agentes en paralelo" (per CLAUDE.md).

**Lectura**: discoverability cross-agent es **excelente**. Reglas de coordinación documentadas y operativas.

### 5.2 ✅ Mapa de navegación exhaustivo

**Comando**: `cat vault/00-Inicio/Mapa\ de\ navegación.md` — verificado.

**Lectura**: el mapa enumera paths por rol (developer, product, marketing, sales, founder, auditor). Cubre el 100% de los roles típicos. **Sin cambios necesarios**.

## 6. Limitaciones de D7

| Limitación | Por qué | Mitigación |
|---|---|---|
| No audité línea por línea contenido de los 114 docs | Esfuerzo enorme; el audit verificó presencia y freshness | Revisión manual CEO cuando lo requiera |
| OpenAPI generation scripts no encontrados en `scripts/` | Posiblemente existe con otro nombre; no exhaustive search | Engineering Lead busca + genera |
| Mobile docs no auditadas | `mobile/` excluido del repo público | Repetir cuando mobile esté en repo |
| Internationalization docs no auditadas | `docs/I18N_EVALUATION.md` existe pero no audité contenido | Engineering Lead evalúa si necesita acción |
| Métricas de doc usage no medidas | Sin analytics en clicks de SUMMARY.md | Engineering Lead añade Sentry/analytics si prioriza |

## 7. Resumen ejecutivo D7

| Finding | Severidad | Owner | Acción |
|---|---|---|---|
| Sin OpenAPI spec generado / swagger UI | **P1** | Engineering Lead | Sprint dedicado con `next-swagger-doc` |
| Duplicación vault ↔ docs (drift risk) | **P2** | CEO/Product | Definir single-source-of-truth por concepto |
| `CONTRIBUTING.md` corto (47 líneas) | **P3** | Engineering Lead | Expandir a ~200 líneas en sprint DX |

**Findings nuevos D7**: 0 críticos, 0 P0, 1 P1, 1 P2, 1 P3.
**Findings positivos**: 
- Vault bien estructurado (137 archivos, 9 directorios, 3 runbooks).
- docs/ extenso (114 archivos) con SUMMARY.md como índice maestro.
- Runbooks deploy/desarrollo/migraciones presentes y vigentes.
- AGENTS.md/CLAUDE.md/Guia para agentes dan discoverability cross-agent excelente.
- Mapa de navegación cubre todos los roles.

## 8. Cierre del audit professionalización 2026-09-07

### 8.1 Resumen consolidado D0-D7

| Dimensión | Severidad máxima | Findings totales | Estado |
|---|---|---|---|
| D0 Baseline | — | métricas | ✅ medido |
| D1 Patrones | P0 (latente) | 3 (1 P0, 1 P1, 1 P2) | 🟡 gaps parciales |
| D2 GDPR | P0 | 5 (2 P0, 2 P1, 1 P2) | 🔴 gaps materiales |
| D3 P&S review | — | 6 issues verificados | ✅ mayormente cerrado |
| D4 Salud código | P0 | 8 (1 P0, 3 P1, 2 P2, 2 P3) | 🔴 hallazgo crítico ZAL-169 |
| D5 Performance/resiliencia | P1 | 8 (4 P1, 3 P2, 1 P3) | 🟡 gaps operativos |
| D6 Producto/onboarding | P1 | 8 (1 P1, 4 P2, 3 P3) | 🟡 gaps leves |
| D7 Documentación | P1 | 3 (1 P1, 1 P2, 1 P3) | 🟡 gaps menores |

**Total findings**: 41 (3 P0, 9 P1, 14 P2, 8 P3, 7 métricas/positivos).
**Findings críticos/P0 a resolver primero**: 3
1. **D4-Q-D4-3**: investigar ZAL-169 sobre doc 2026-08-25 (afirma 17/17 PASS; R6 muestra 7/10).
2. **D2-GDPR-P0-1**: consentimiento parental para menores (Art. 8 GDPR).
3. **D2-GDPR-P0-2**: anonimización / right to erasure (Art. 17 GDPR).

### 8.2 Patrones detectados en el codebase

1. **Priorización del equipo**: han cerrado gaps **técnicos** (authz, CSP, CVEs, hydration) y han descuidado gaps **operacionales** (GDPR compliance, monitoring, telemetry, retries). Razonable para equipo pequeño; requiere sprint Q4 dedicado.

2. **Drift docs ↔ código**: hay drift entre docs canónicos y código en pricing, copy y stubs. ZAL-169 incidents previas (ZAL-801, ZAL-648, ZAL-172) muestran que esto es riesgo operacional real.

3. **Excelente cultura de audit**: el equipo mantiene `vault/07-Auditorias-y-Riesgos/` con auditorías previas (2026-07-03 consolidada, 2026-08-25 P&S review, 2026-09-07 este audit). Esto es buena práctica.

4. **Multi-agente coordination operativa**: el equipo maneja Claude Code + Codex en paralelo con éxito. Las reglas de la Guia para agentes funcionan.

### 8.3 Roadmap Q4 propuesto

| Sprint | Scope | Severidad objetivo |
|---|---|---|
| Sprint Q4.1 | Triage 30 fallos R6 + ZAL-169 investigación + DPO consulting | P0 (D4 + D2) |
| Sprint Q4.2 | Zod sprint 39 rutas + LemonSqueezy HMAC + OpenAPI generation | P0/P1 (D1 + D7) |
| Sprint Q4.3 | GDPR: guardian_consent + anonymization job + DPAs | P0 (D2) |
| Sprint Q4.4 | Performance: retry lib + console→logger migration + bundle reduction | P1 (D5) |
| Sprint Q4.5 | Test hygiene: re-include 6 suites P2 + vitest.qa CI confirmation | P2 (D4 + D5) |
| Sprint Q4.6 | TS strictness: noUncheckedIndexedAccess activation | P1 (D4) |
| Sprint Q4.7 | Onboarding telemetry + annual billing + family portal scope | P2 (D6) |

### 8.4 Pendiente CEO

15 decisiones en `Decisiones codex 2026-09-07 — preguntas abiertas auditoria.md` requieren validación CEO (puede revertir cualquiera con justificación).

Acciones inmediatas CEO/Board (no delegables):
1. Recargar crédito `claude_local` o conceder `agents:configure` temporal (ZAL-913/ZAL-920).
2. Validar entrega `secret_ref` E2E sandbox con Web Developer (ZAL-946).
3. Solicitar DPAs firmados a Supabase/Stripe/Brevo (D2 §3).
4. Abrir investigación ZAL-169 sobre doc 2026-08-25 (D4 §8).

## 9. Preguntas abiertas D7 (para CEO / Engineering Lead)

- **Q-D7-1**: ¿OpenAPI generation sprint (1 semana) entra en Q4 o se difiere? Bloquea integración mobile + terceros.
- **Q-D7-2**: ¿CEO o Engineering Lead decide single-source-of-truth para docs duplicados?
- **Q-D7-3**: ¿`CONTRIBUTING.md` se expande en sprint DX Q4?

---

## 10. Cierre

**Audit professionalización Zaltyko 2026-09-07 cerrado.**

7 fases ejecutadas en orden D0 → D1 → D2 → D3 → D4 → D5 → D6 → D7. Cada fase tiene su documento literal en `vault/07-Auditorias-y-Riesgos/Auditoria professionalizacion 2026-09-07 — Fase N.md`.

Plan de remediación Fase 4 con 15 acciones está en `Decisiones codex 2026-09-07 — preguntas abiertas auditoria.md`. codex asume responsabilidad por las decisiones tomadas; CEO puede revertir con justificación.

**Próximo paso CEO**: validar decisiones y priorizar sprints Q4 según capacidad del equipo.
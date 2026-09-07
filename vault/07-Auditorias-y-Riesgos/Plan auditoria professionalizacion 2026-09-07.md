---
type: audit-plan
status: completed
created: 2026-09-07
closed: 2026-09-07
owner: codex-session (audit ejecutado; CEO delegó explícitamente "toma accion sobre mis pendientes decide que es lo mejor y continua")
resultados:
  - 7 fases ejecutadas D0 → D7
  - 41 findings (3 P0, 9 P1, 14 P2, 8 P3, 7 métricas)
  - 19 acciones de remediación planificadas (Q4)
  - ver: ./Decisiones codex 2026-09-07 — preguntas abiertas auditoria.md
  - ver: ./Auditoria professionalizacion 2026-09-07 — Fase N.md (N=0..7)
  - ver: ../06-Roadmap-y-Tareas/Plan sprints Q4 2026 post-audit professionalizacion.md
relacionado_con:
  - vault/07-Auditorias-y-Riesgos/Auditorias consolidadas.md (PR #8, 2026-06-26 — base de referencia)
  - vault/07-Auditorias-y-Riesgos/Auditoria UX UI integral - 2026-07-15.md (producto)
  - vault/07-Auditorias-y-Riesgos/Platform-Security-revision-bloqueadores-2026-08-26.md (P&S más reciente)
  - vault/07-Auditorias-y-Riesgos/2026-09-03-audit-akros-preliminar.md (Akros client, contexto)
  - vault/06-Roadmap-y-Tareas/Decisiones.md (Política Antifabricación ZAL-169)
politica_aplicable: Antifabricación ZAL-169 (6 reglas) — toda hallazgo debe pasar por
  resolución literal (`git rev-parse --verify <sha>`), peer-verification cruzada donde
  aplique, y backfill limpio si se descubre evidencia fabricada previa.
---

# Plan de auditoría e investigación — Profesionalización Zaltyko SaaS

> **Modo del documento**: plan de investigación, **no** informe de hallazgos.
> Cada dimensión es un método de descubrimiento a ejecutar, no una afirmación de
> problema. Los hallazgos se redactarán en documentos separados cuando se
> disponga de evidencia literal verificada (citas de código con file:line,
> reproducibilidad de CI, revisión manual documentada).
>
> Este plan **no duplica** las auditorías previas (consolidada 2026-06-26,
> UX integral 2026-07-15, P&S 2026-08-26, Akros preliminar 2026-09-03).
> Su objetivo es cubrir la **superficie nueva y la deuda acumulada** entre
> el 2026-07-03 (auditoría consolidada, 265 rutas) y hoy (2026-09-07).

---

## 1. Por qué ahora

| Señal | Dato medido el 2026-09-07 | Lectura |
|---|---|---|
| Commits desde último audit consolidado (2026-07-03) | **255** | ~60 commits/semana de superficie cambiante |
| Rutas API totales (`src/app/api/**/route.ts`) | **307** | +42 vs auditoría 2026-07-03 (265) |
| Rutas con algún wrapper de auth (`withTenant`/`withSuperAdmin`/`withBearerTenant`/`requireCronAuth`) | **238** (~77%) | Cobertura agregada — requiere auditar **corrección** del patrón, no solo presencia |
| Ficheros schema (`src/db/schema/*.ts`) | **90** | Estabilizado (3 commits de schema desde 2026-07-03) |
| Ficheros de test | **162** | Buena cobertura en nº, desconocida en % |
| `tsconfig.json` strictness | `strict: true` | Faltan `noUncheckedIndexedAccess` y `exactOptionalPropertyTypes` — superficie de bugs latente |
| Auditorías vigentes | 4 documentos | Ninguna cubre 2026-08-15 → 2026-09-07 |

**Conclusión del baseline**: la base está sana (consolidada + UX + P&S), pero han
entrado 255 commits y 42 rutas sin una revisión sistemática equivalente. El PR #110
(R2 — CSP, force-dynamic, Sentry gating) acaba de cerrar el último bloqueador
operacional, así que el siguiente esfuerzo natural es revisar el código que se
acumuló mientras esos bloqueadores dominaban el roadmap.

---

## 2. Pregunta del CEO (literal)

> «¿debemos hacer alguna revisión del código del SaaS a ver si necesita hacerce
> algún cambio o algo que quieras recomendar para que sea aún más profesional?»

Tres lecturas posibles:

1. **«Pasada de salud»** — confirmar que nada se degradó desde la auditoría
   consolidada. Output: un check corto (~3-5 días), sin reescrituras.
2. **Auditoría sistemática** — recorrer las 7 dimensiones abajo en una o dos
   fases, con entregables accionables por dimensión. Output: 4-6 semanas, con
   backlog priorizado.
3. **Auditoría + remediación** — además de descubrir, incluir el trabajo de
   remediación en el sprint (P0 se cierra en la misma fase).

**Pregunta bloqueante para el CEO antes de empezar**: ¿cuál de las tres?

> Recomendación por defecto: **opción 2** (auditoría sistemática, remediación
> P0 en sprint siguiente). La opción 3 convierte el audit en un proyecto de
> varias semanas y obliga a reservar capacidad de implementación antes de
> saber el alcance real. La opción 1 sub-utiliza la energía y deja la deuda
> oculta.

---

## 3. Alcance (7 dimensiones)

Las 7 dimensiones se eligen porque **ninguna** está cubierta al 100% por las
auditorías previas, y juntas cubren lo que un CTO externo miraría primero en
una due-diligence de SaaS multi-tenant B2B/B2B2C con datos de menores.

### D1. Re-adherencia a patrones obligatorios (P0)

**Hipótesis a investigar** (no afirmar): «desde 2026-07-03 se introdujeron
nuevas rutas que pueden no seguir `withTenant` / `apiSuccess` / Zod».

**Método** (script de grep + revisión manual):
1. Listar las 42 rutas añadidas o modificadas después de 2026-07-03
   (`git log --diff-filter=AM --since=2026-07-03 --name-only --pretty=format: --
    src/app/api | grep route.ts | sort -u`).
2. Para cada una, verificar 3 invariantes:
   - ¿Usa `withTenant` / `withSuperAdmin` / `withBearerTenant` / `requireCronAuth`
     / verificación de firma webhook / auth explícita?
   - ¿Devuelve con `apiSuccess` / `apiCreated` / `apiError` (no `NextResponse.json` crudo)?
   - ¿Valida input con Zod, con `.nullable().optional()` donde corresponde
     (recordatorio ZAL-258 / ZAL-180)?
3. Para Zod específicamente: `grep -rn "URLSearchParams\|FormData\|searchParams.get"
   src/app/api --include="*.ts"` y revisar que cada uso esté envuelto en un
   schema Zod (no `typeof === "string"` ad-hoc).
4. Para `withTenant`: verificar que las rutas tenant-scoped NO acepten
   `tenantId` del body/query — el patrón canónico es derivarlo del JWT.
5. Para webhooks: verificar `constructEvent` / verificación de firma en cada
   proveedor declarado (Stripe, Stripe Connect, LemonSqueezy, Mailgun legacy,
   Brevo inbound si existe).

**Entregable**: tabla por ruta (path | método | wrapper usado | Zod sí/no |
apiSuccess sí/no | riesgo). Sin hallazgo fabricado — si una ruta pasa, se dice
que pasa.

**Esfuerzo estimado**: 2-3 días para las 42 rutas + muestreo de las 265 previas
para detectar regresiones.

**Owner sugerido**: agente de código con experiencia en el repo (conoce los
wrappers); revisión CEO al final.

---

### D2. Auditoría GDPR Art. 8 + datos de menores (P0)

**Por qué es P0 y no P1**: Zaltyko maneja datos de **menores de edad**
(alumnos de academias deportivas, muchos <14 años). El P&S 2026-08-26 lo dejó
explícito: «GDPR Art. 8 reminder (data de menores)». DPA EU North pendiente.

**Método** (sin afirmar hallazgos hasta verificar):
1. Inventariar **todos** los puntos de tratamiento de datos de `athletes`
   (tabla + flujos). ¿Cada endpoint exige consentimiento verificable del
   titular de la patria potestad? ¿Hay registro del consentimiento
   (timestamp + IP + versión de los términos)?
2. Revisar la cadena de emails salientes (Brevo) hacia atletas/familias:
   - ¿Se incluye base legal en cada uno?
   - ¿Los enlaces de baja (ZAL-324 Gap 5, ya implementado) están firmados
     y persisten tras migraciones?
3. Revisar exports y borrados: derecho de acceso (Art. 15) y derecho al
   olvido (Art. 17). ¿Existe flujo? ¿Cuánto tarda? ¿Auditable?
4. DPA con proveedores: Supabase, Vercel, Brevo, Stripe. ¿Residency EU North
   verificada? El P&S 2026-08-26 dice «DPA residency EU North pending» —
   re-verificar estado.
5. Logs y Sentry: ¿se filtran PII de menores? El `beforeSend` en
   `instrumentation.ts` borra `authorization`/`cookie`/`x-api-key` y query
   params sensibles, pero ¿se ha verificado contra emails/nombres/direcciones?

**Entregable**: matriz (flujo | base legal | evidencia de consentimiento |
riesgo residual). Sin afirmar cumplimiento hasta tener evidencia.

**Esfuerzo estimado**: 3-5 días (con revisión legal externa idealmente, no
incluida en este plan).

**Owner sugerido**: CEO + agente técnico para la parte de inventario.
**Recomendación**: traer a un DPO externo para validar; el coste es
marginal vs el riesgo regulatorio.

---

### D3. Seguridad de superficie nueva (P1)

**No es una auditoría de seguridad completa** (eso fue la consolidada +
P&S). Es un **delta** sobre los últimos 60 días.

**Método**:
1. Diff de las 42 rutas nuevas contra los patrones de la consolidada
   2026-07-03 (IDOR, auth bypass, mass assignment).
2. Cross-tenant tests: para cada ruta tenant-scoped nueva, generar un test
   automatizado que invoque con JWT de academia A apuntando a recurso de
   academia B → debe 403/404. Hay precedente del fix `adb53d81` («cross-tenant
   por tenantId obsoleto») — replicar el patrón.
3. Re-verificar los ZAL abiertos en P&S 2026-08-26:
   - **ZAL-913** (PATCH /api/issues/:id no auth)
   - **ZAL-928** (recovery safety)
   - **ZAL-946** (E2E sandbox secret_ref)
   - **ZAL-976** (writer A3 migration)
   - **ZAL-961** (ZAL-957 hardening test)
   - **ZAL-336** (E2E Playwright signup UTM) — el P&S dejó como observación
     menor quitar `NEXT_PUBLIC_E2E_MOCK_AUTH` del OR de la condición
4. Revisar `src/lib/authz.ts` (621 líneas) y `permissions-service.ts` —
   ¿creció la matriz de roles? ¿Se rompió el fix 2026-07-03 de escalada de
   permisos por `getAllPermissions()`?

**Entregable**: lista de issues nuevos + estado de los abiertos. Cada uno
con SHA verificable.

**Esfuerzo estimado**: 3-4 días.

**Owner sugerido**: agente de seguridad + revisión CEO.

---

### D4. Salud de código y mantenibilidad (P2)

**Hipótesis**: 255 commits en 60 días pueden haber introducido:
- Tipos `any` nuevos (la consolidada bajó de 357→227)
- Componentes no memoizados en rutas calientes (la consolidada añadió `memo`
  en landing; ¿se mantuvo en product?)
- Código muerto (ficheros no importados, exports huérfanos)
- Tests con cobertura decreciente

**Método**:
1. `grep -rn ":\s*any\b\|as any\|<any>" src/ --include="*.ts" --include="*.tsx"
   | wc -l` — comparar con baseline 227.
2. `pnpm test:coverage` y leer el reporte (vitest). Identificar directorios
   con <60% lines/branches.
3. Dead code: `npx ts-unused-exports tsconfig.json` o `knip` si está
   instalado; revisar output contra conocimiento del dominio.
4. ESLint warnings: `pnpm lint 2>&1 | grep -E "warning|error" | wc -l` —
   tendencia.
5. Tamaño de bundle en rutas críticas: ejecutar `pnpm build` y leer el
   `.next/build-manifest.json`. Identificar rutas >250kb JS.

**Entregable**: snapshot de métricas + lista priorizada (no listas largas,
solo lo accionable).

**Esfuerzo estimado**: 2 días.

**Owner sugerido**: agente técnico.

---

### D5. Performance y resiliencia operativa (P2)

**Hipótesis**: el repo soporta 90 tablas, 307 rutas, 162 tests. ¿Hay
regresiones silenciosas en queries N+1, timeouts, o rate-limiting?

**Método**:
1. Listar las rutas que tocan `db.query.*` o Drizzle directamente. Para las
   20 más llamadas (según logs de Vercel — pedir acceso al dashboard), revisar
   que tengan índice apropiado (ZAL-235 está abierto en algunos hot paths,
   verificar si se cerró).
2. Rate-limiting: `grep -rn "rateLimit\|rate-limit" src/lib src/app/api
   --include="*.ts"`. Verificar que TODA ruta pública (landing, contacto,
   newsletter, login) y TODO endpoint crítico (pagos, webhooks, exports)
   tenga `rateLimit` aplicado.
3. Cron jobs: listar todos los `route.ts` con `export const dynamic =
   "force-dynamic"` + `requireCronAuth` o equivalente. ¿Hay cron huérfanos
   definidos en Vercel que apunten a rutas eliminadas?
4. CSP y headers: tras R2 (PR #110), ¿qué otros headers faltan? Diff
   contra `securityheaders.com` best practices.

**Entregable**: tabla por ruta crítica + headers.

**Esfuerzo estimado**: 2-3 días.

---

### D6. Coherencia de producto y onboarding (P2)

**No** rehace la UX integral 2026-07-15. Es un delta para los features
introducidos desde entonces (recordatorios de clase reales, baja no destructiva,
scores familia, portal familia limitado, mi eventos al portal, etc.).

**Método**:
1. Walkthrough manual con grabación (no escrito): owner login → crear academia
   → invitar familia → familia confirma → familia ve su atleta → familia
   cancela. ¿Hay puntos de fricción o copy confuso?
2. Coherencia de copy: ¿el lenguaje entre emails (Brevo) y la web es
   consistente? Hay precedente de «copy honesto» (commit `15863c5b`) — ¿se
   mantiene?
3. Feature flags documentados: ¿`ONBOARDING_OWNER_SEQUENCE_ENABLED`,
   `E2E_MOCK_AUTH`, `NEXT_PUBLIC_DEV_FEATURES` tienen doc de cuándo se
   prenden/apagan? El commit `5bd43afa` («secuencia d0/d2/d7 operativa»)
   merece verificación end-to-end.

**Entregable**: issues priorizados, no un informe narrativo.

**Esfuerzo estimado**: 2 días.

**Owner sugerido**: CEO亲自亲自 (manual) + agente para verificar flujos.

---

### D7. Documentación y Discoverability (P2)

**Hipótesis**: con 90 schemas y 307 rutas, la docs interna (`docs/`, `vault/`)
puede estar desfasada.

**Método**:
1. Diff entre `docs/API.md` (si existe) y la realidad de las 307 rutas.
   Probablemente el doc cubre <30%.
2. ¿Hay un OpenAPI / Swagger generado? Si no, ¿vale la pena?
3. ADRs (Architecture Decision Records): ¿se documentan decisiones de peso
   (Stripe Connect, RLS bypass para postgres, `permissions-service` fix)?
4. Vault: ¿`vault/00-Inicio/Guia de trabajo para agentes.md` está al día
   con los fixes de antifabricación de ZAL-169? Si no, sincronizar.
5. README y `docs/SUMMARY.md`: ¿existen, están sincronizados?

**Entregable**: lista de docs desfasadas + diff sugerido.

**Esfuerzo estimado**: 1-2 días.

---

## 4. Out of scope (deliberado)

- **Reescritura del frontend** — fuera, hay UX integral 2026-07-15 y eso se
  itera sprint a sprint.
- **Auditoría legal completa** — D2 propone inventario + DPO externo; no
  pretende sustituir el contrato con un abogado.
- **Auditoría de seguridad externa** (pentest) — la consolidada 2026-07-03
  fue interna. Un pentest externo anual es otra conversación.
- **Migración del monolito a microservicios** — especulativo y rompe el
  flujo actual.
- **Cambios de pricing o modelo de negocio** — fuera; pricing v3.0 está en
  la guía canónica.

---

## 5. Política antifabricación (recordatorio operacional)

Cualquier hallazgo que se reporte debe pasar por:

1. **Resolución literal**: `git rev-parse --verify <sha>` antes de citar un
   commit. Nunca citar commit que no se haya verificado en el checkout
   actual.
2. **Peer-verification cruzada** (ZAL-89) cuando aplique a issues con código
   (rutas, schemas). Self-peer está bloqueado por `PeerNotIndependent`.
3. **Recovery handoff no rehabilita cierres** (ZAL-90 C-4): si reabro un
   issue, no es «el mismo cierre».
4. **codeRepoPaths poblado antes de aceptar done** (ZAL-88).
5. **Extracción estricta del SHA auditado** — el SHA del que saqué la cita
   debe ser el SHA del fix, no del merge.
6. **SHA fabrication = incidente de control** — escala a CEO.

Si en el curso de la auditoría aparece evidencia fabricada previa
(precedentes: ZAL-40, 62, 63, 7, 8, 70, 71, 73, 74, 801, 648, 172), backfill
limpio en este mismo sprint, no dejar para después.

---

## 6. Fases y esfuerzo

| Fase | Dimensiones | Esfuerzo | Output |
|---|---|---|---|
| **Fase 0 — Setup** | Confirmar alcance con CEO, asignar owners, congelar scope | 0.5 día | este plan firmado |
| **Fase 1 — P0** | D1 (re-adherencia), D2 (GDPR Art. 8) | 5-8 días | 2 docs de hallazgo, backlog priorizado |
| **Fase 2 — P1** | D3 (seguridad delta) | 3-4 días | 1 doc + cierre de ZAL abiertos |
| **Fase 3 — P2** | D4, D5, D6, D7 | 7-10 días | 4 docs de hallazgo |
| **Fase 4 — Remediación P0** | (decisión post-fase 1) | depende del hallazgo | sprint separado |

**Total sin remediación**: ~16-22 días (3-4 semanas a 1 agente a tiempo
completo).

---

## 7. Entregables por dimensión

Cada dimensión entrega:
- Documento markdown en `vault/07-Auditorias-y-Riesgos/Auditoria <dim> - 2026-MM-DD.md`
- Tabla/CSV con la métrica por entidad auditada (ruta, schema, componente)
- Backlog priorizado en `vault/06-Roadmap-y-Tareas/Backlog.md` (o ZAL issues)
- Resumen ejecutivo de 1 página al CEO

---

## 8. Riesgos del propio plan

- **Scope creep**: 7 dimensiones son tentadoras. Si se intenta hacer todo en
  una fase, se entrega tarde y mal. Disciplina: fase 1 antes de fase 2.
- **Fatiga de auditoría**: 4 auditorías en 3 meses. Si esta sale larga y sin
  remediación inmediata, el equipo pierde fe. Mitigación: la fase 4 (P0
  remediación) debe calendarizarse **antes** de empezar la fase 1, no después.
- **Falsa sensación de cobertura**: si D1 no encuentra nada, no significa
  que todo esté bien — significa que los patrones conocidos se respetan. Los
  bugs interesantes son los que no encajan en patrones conocidos.

---

## 9. Preguntas abiertas (bloqueantes)

1. **¿Alcance = opción 1, 2 o 3?** (sección 2)
2. **¿CEO亲自亲自亲自亲自亲自亲自亲自亲自亲自亲自亲自亲自亲自亲自** conduce D6 (coherencia de producto) o lo delega?
3. **¿Hay presupuesto para DPO externo en D2?** Si no, ¿se acepta riesgo
   regulatorio documentado como hallazgo?
4. **¿Algún issue ZAL conocido que NO esté en el P&S 2026-08-26 y deba
   incluirse en D3?** (revisar backlog reciente)
5. **¿Esta auditoría se hace con el repo en `main` o en el branch actual?**
   Sugerencia: `main` post-R2 merge para que refleje producción real.

---

## 10. Cierre

Este plan es un **plan de investigación**, no un informe. Si se aprueba el
alcance, los hallazgos se redactarán en documentos separados cuando se
disponga de evidencia verificada. La Política Antifabricación ZAL-169 se
aplica en cada paso.

> Si la respuesta a la pregunta del CEO es «no, no hace falta», este plan
> es igualmente útil: documenta explícitamente que se decidió no auditar, y
> queda como referencia para la próxima vez que la pregunta vuelva a salir
> (probablemente tras el próximo ZAL-prefixed incidente).

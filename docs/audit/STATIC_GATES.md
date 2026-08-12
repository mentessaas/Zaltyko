# Static Gates: A2 (Unbounded Reads) + A3 (Auth Before Body Validation)

> Estado: **A2 + A3 implementados y ejecutables**, ZAL-556 entrega de Platform & Security,
> padre ZAL-551 (12 mejoras inspiradas en la comparación con BuilderHunt).

Esta es la implementación de los dos gates preventivos pedidos en el alcance
de ZAL-551: un check estático para detectar lecturas de lista sin límite y
otro para detectar handlers que validan el body antes de autenticar. Ambos
gates son **ejecutables** desde `pnpm` y emiten `archivo:línea  [regla]  motivo`,
con un `hint` accionable en cada hallazgo.

## TL;DR

```bash
pnpm gate:reads          # A2 unbounded-reads, modo advisory
pnpm gate:reads:strict   # A2 unbounded-reads, exit 1 si hay hallazgos
pnpm gate:auth           # A3 auth-before-validate, modo advisory
pnpm gate:auth:strict    # A3 auth-before-validate, exit 1 si hay hallazgos
pnpm gate:all            # corre ambos en modo --strict
pnpm gate:operational    # snapshot durable + retención 14d (ZAL-617)
pnpm gate:test           # self-test (positivos + negativos, tsx subprocess)
```

El flag `--json` produce un payload JSON para artefactos de CI:

```json
{
  "gate": "unbounded-reads",
  "scannedFiles": 1356,
  "findings": [ { "file": "...", "line": 17, "rule": "A2/unbounded-read", "reason": "...", "hint": "..." } ],
  "exit": "violations"
}
```

## Alcance respetado

Estos gates **no**:

- No adoptan el framework de BuilderHunt.
- No usan regex para decisiones semánticas en A3 (es TS compiler API puro);
  A2 solo usa regex para el escape hatch y los nombres de métodos
  reconocibles (`.from`, `.where`, `.limit`, etc.), todo el resto es AST.
- No tocan secretos, producción, datos reales, migraciones remotas ni
  Stripe live.
- No duplican `scripts/audit-api-routes.ts`: ese script ya cubre auth class,
  resource-scope, mutation-without-zod, capability, etc. Los gates
  estáticos nuevos añaden detección de **dos** clases concretas de riesgo
  que no estaban cubiertas: lecturas sin límite y orden auth-vs-validate.

## Gate A2 — `scripts/gates/unbounded-reads.ts`

### Qué detecta

Dos formas concretas de lectura potencial sin acotar:

1. **`db.select(...).from(T).where(...)`** sin `.limit(N)`/`offset(N)` en
   cualquier punto del chain. Esto cubre también `tx.*` cuando la query se
   emite dentro de una transacción.
2. **`db.query.<entity>.findMany({...})`** sin clave `limit:` (o
   `cursor:`/`offset:`) en el argumento del options literal.

### Cómo reconoce un chain (TS compiler API)

- Walk descendente por `ts.forEachChild` desde cada `SourceFile`.
- Cada `CallExpression` cuyo property-access termina en `from`,
  `leftJoin`/`innerJoin`/`rightJoin`/`fullJoin`, `where` o `findMany`
  se analiza en una pasada:
  - **Patrón A** (`findMany`): la propiedad `expression.expression.name`
    debe ser `query` y la raíz debe ser `db`.
  - **Patrón B** (`from|...|where`): se sube por el chain exigiendo que
    exista un `select(...)` y terminando en un identificador `db` o `tx`.
- Una vez detectado, se asciende a la llamada **más externa** del chain
  (caminando dos parents arriba cuando hay un PropertyAccessExpression
  intermedio) y se busca `.limit(N)` / `.offset(N)` en toda la cadena.
  - Si la llamada externa los tiene → hallazgo omitido.
  - Para `findMany`, se inspecciona el `ObjectLiteralExpression` buscando
    claves `limit`, `offset` o `cursor` con valor distinto a `undefined`.
- Si no se encuentra límite/offset, se evalúa el **escape hatch**:
  `// unbounded-read-ok: <motivo>` (o `// unbounded-read-ok <motivo>`)
  en las líneas inmediatamente anteriores al chain. No se consideran
  comentarios sueltos que sólo *mencionen* la palabra.
- Los chains repetidos dentro del mismo `await ...` o asignación se
  deduplican por anchor para que un mismo `chain` no produzca N hallazgos.

### Salida

Cada hallazgo trae:

- `file:line` del chain (no del CallExpression interno).
- `rule = A2/unbounded-read`.
- `reason` con un snippet del chain (limitado a 90 caracteres).
- `hint` explicando el fix: añadir `.limit(N)`, `.offset(M)` o el escape
  hatch.

### Falsos positivos conocidos / limitaciones declaradas

- **Aggregate reads**: `db.select({ count: sql\`count(*)\` }).from(T)` no
  necesita `.limit()`, pero el gate lo señala porque cuenta filas y puede
  tocar tablas grandes. Si la operación es intencional, marcar con
  `// unbounded-read-ok: count(*) aggregate, scope by tenant`.
- **Single-row reads** vía `.where(id)` siguen señalando. Si te importa
  sólo "lista sin tope", el comportamiento actual está alineado con el
  contrato. Si fuera insuficiente, refactorizar para usar un helper
  específico (`getOneById`) queda fuera del alcance actual.
- **Aliases**: el gate reconoce sólo `db` y `tx`. Si tu repo envuelve
  `db` en un alias distinto (p. ej. `const client = getDb(); await client.select(...)`),
  la regla cae al escape hatch; considéralo una mejora pendiente.
- **`selectDistinct`**: reconocido.
- **Cursores `findMany({ cursor })`**: reconocido (cursor cuenta como
  límite superior práctico).
- **Runtimes con paginación cursor-based distinta a Drizzle**: no
  cubiertos; misma ruta de escape hatch.
- **Estrategia de archivos**: se ignoran `node_modules`, `.next`, `.git`,
  `dist`, `coverage`. Si una ruta tiene un alias `@/...` o `~/...`, el
  walker no las procesa como archivos, sólo el código del usuario.

## Gate A3 — `scripts/gates/auth-before-validate.ts`

### Qué detecta

Handlers `route.ts` (incluidos en `src/app/api/**`) exportados como
`GET/POST/PUT/PATCH/DELETE/OPTIONS/HEAD` donde la primera operación sobre
el body del request **sucede antes** de cualquier primitiva de auth del
proyecto Zaltyko.

### Auth primitives reconocidas

Cualquier llamada a estas funciones en el orden top-down del handler:

| Función                  | Tipo                       |
|--------------------------|----------------------------|
| `withTenant`             | HOF (envuelve el handler)  |
| `withSuperAdmin`         | HOF (envuelve el handler)  |
| `resolveUserId`          | manual                     |
| `getBearerToken`         | manual                     |
| `createBearerSupabaseClient` | manual                  |
| `assertSuperAdmin`       | manual                     |
| `getCurrentProfile`      | manual                     |
| `verifyWebhookSignature` | webhook                    |

Si el handler **se exporta como resultado de `withTenant(...)` o
`withSuperAdmin(...)`**, el gate lo trata como auth-first por construcción
y no emite hallazgo.

### Validation primitives reconocidas

- `request.json()` / `request.formData()` / `request.text()` /
  `request.arrayBuffer()` / `request.blob()`.
- `<cualquier>.parse(...)`, `<cualquier>.safeParse(...)`,
  `<cualquier>.parseAsync(...)`, `<cualquier>.safeParseAsync(...)`.

### Escape hatch

Para casos intencionales (webhooks que validan la firma contra el body
crudo, jobs cron firmados por un secret, rutas en `public/`, dev tools
sin sesión), añadir en la línea inmediatamente anterior al export:

```ts
// @auth-flexible route-guard-reason: stripe webhook signature validates the raw body
export const POST = async (request: Request) => { ... };
```

El comentario debe estar pegado al export (sin líneas de código entre
medio) y contener literalmente `@auth-flexible`. La razón se acepta a
título informativo; el gate seguirá silenciando el hallazgo.

### Iteración del AST

1. Por cada `route.ts`, `getExportedHandlers` agrupa los exports cuyo
   nombre sea método HTTP.
2. `analyseWrapper` mira si el LHS del export es un HOF; si es
   `withTenant`/`withSuperAdmin`, lo clasifica como auth-first.
3. Para inline handlers (arrow/function), `unwrapHandlerExpression`
   atraviesa HOFs (e.g. `withRateLimit(withTenant(handler))`) hasta el
   handler interno.
4. `checkOrdering` recorre el body. Lleva dos banderas: `firstAuth`
   y `firstValidate`. El primero que se cruce define el orden.
   - Si `validate` aparece en o antes de `auth`, emite hallazgo.
5. Nested functions dentro del handler se **ignoran** (su orden es
   opaco al análisis estático). Ese es el punto donde el escape hatch
   entra en juego.
6. Si el export lleva `@auth-flexible` justo antes, se silencia.

### Falsos positivos conocidos / limitaciones declaradas

- **Orden dentro de un helper**: si tu handler extrae la validación a una
  función llamada primero, el gate **no** ve el orden interno y emite
  hallazgo. Trátalo con `@auth-flexible` o refactorizando para que el
  primer statement sea `resolveUserId(...)`.
- **Branching por método**: si una rama `if (req.method === "POST")`
  parsea antes de cualquier auth, el gate la señala aunque nunca se
  ejecute. Marcar con `@auth-flexible` cuando aplique.
- **Webhooks de LemonSqueezy/Stripe/etc.**: si están bajo `withTenant`
  por error, el gate no los señala. Si **no** usan `withTenant` pero el
  signature check va dentro del body parse, marcar con
  `@auth-flexible route-guard-reason: ls-signature checks body before auth`.
- **Dev routes bajo `/api/dev/...`**: actualmente se marcan como cualquier
  otra ruta; añadir `@auth-flexible` por archivo.

## Estado actual (snapshots de los escaneos reales)

| Gate | Archivos escaneados | Hallazgos | %                                                                                |
|------|---------------------|-----------|----------------------------------------------------------------------------------|
| A2   | 1.356 (`src/`)      | 514       | primeros 25 en `pnpm gate:reads`                                                 |
| A3   |   245 (`route.ts`)  | 28        |主要集中在 `onboarding/*`, `lemonsqueezy/webhook`, `contact`, `family/*`, `public/*` |

Re-medición 2026-08-11 sobre el **subconjunto legible** del árbol (962 de
1.356 archivos; ver "Limitación del entorno" abajo): A2 = 401 hallazgos,
A3 = 21. Las proporciones son consistentes con el escaneo completo previo.

Nota: la cantidad de A2 **no es un bug**; es el contrato esperado — toda
cadena Drizzle que toque más de una fila debe justificarse.

El modo `--strict` retorna exit 1 cuando hay al menos un hallazgo. En
local se trata como advisory. En CI, combinarlo con `--strict` en los
worktrees donde se exige.

## Limitación del entorno: archivos `dataless` (iCloud)

En la copia de trabajo local (`~/Desktop/_PROYECTOS/Zaltyko`, bajo sync de
iCloud Desktop) **394 de los 1.356** archivos `.ts/.tsx` de `src/` están
evictados: `ls -lO` los marca `compressed,dataless` y son placeholders sin
contenido local.

Consecuencia práctica: `fs.readFileSync` sobre uno de ellos **se bloquea
indefinidamente a 0% de CPU** esperando una descarga que no llega
(`brctl download` no los materializa). Por eso un `pnpm gate:all` sin
`--root` puede quedarse colgado sin emitir una sola línea. No es un
defecto de los gates: `tsc` y `npx` se cuelgan igual en este árbol.

Cómo distinguirlo de un bug del gate:

```sh
# Si esto imprime > 0, el árbol local está degradado, no el gate.
find src -name '*.ts' -o -name '*.tsx' | xargs ls -lO | grep -c dataless
```

En CI (checkout limpio, sin iCloud) la condición no se da. Para trabajar
en local sobre el subconjunto legible, usar `--root` apuntando a una copia
filtrada. Deliberadamente **no** se añadió detección de `dataless` a los
gates: es específico de macOS/iCloud y no corresponde a un control de
seguridad.

## Invocación de `tsx` (por qué no `npx`)

`run-all.ts` resuelve el CLI de tsx con `require.resolve("tsx/cli")` y lo
ejecuta con `process.execPath` (ver `scripts/gates/lib/run-tsx.ts`). Las
dos alternativas obvias están descartadas por motivos concretos:

- `node_modules/.bin/tsx` — bajo pnpm es un wrapper de shell; `node <wrapper>`
  falla. Además el path literal es frágil.
- `npx --no-install tsx` — la resolución depende del cwd y en este repo se
  cuelga de forma reproducible (>7 min, 0% CPU, sin proceso hijo), mientras
  que desde el directorio padre responde en ~1,7 s.

Nota de resolución: `require.resolve("tsx/dist/cli.mjs")` lanza
`ERR_PACKAGE_PATH_NOT_EXPORTED`; el subpath publicado en `exports` es
`tsx/cli`. Hay fallback al campo `bin` de `tsx/package.json`.


## Diseño experimental

- `scripts/gates/lib/walker.ts` — cache de `ts.SourceFile` y utilidades.
- `scripts/gates/lib/report.ts` — emisor de stdout + exit code.
- `scripts/gates/__fixtures__/{positive,negative}/` — casos de prueba
  manuales para cada gate.
- `scripts/gates/__tests__/gates.test.ts` — runner sin dependencia de
  vitest; se puede mover a vitest cuando exista un setup formal. Cubre
  también `run-all.ts` end-to-end: hasta 2026-08-11 nada ejercitaba el
  entrypoint de CI, así que un runner incapaz de lanzar sus gates hijos
  seguía dando verde.
- `scripts/gates/lib/run-tsx.ts` — invocación determinista de tsx.
- `scripts/gates/run-all.ts` — invoca ambos gates en modo strict y
  resume. Distingue "el gate encontró violaciones" (exit 1) de "el gate no
  llegó a ejecutarse" (`status === null`), que antes se colapsaban en el
  mismo código de salida.

## Fuera de alcance (deferred)

- Pasar `--root` a múltiples paths.
- Integrar con ESLint o lint-staged. El output ya es JSON, pero el
  day-hook queda pendiente.
- Cap numérico (e.g. `.limit(10000)` sigue pasando; la cobertura de
  `100k` filas es responsabilidad del runtime rate-limit gate).
- Soporte para `withRateLimit(withTenant(handler))` no necesita
  refactor: ya se respeta porque sube al HOF auth.

## Cómo ampliar

1. Si Zaltyko añade un nuevo helper de auth (`requireBearer(...)` etc.),
   añadirlo a `AUTH_PRIMITIVES` en `auth-before-validate.ts`.
2. Si Zaltyko adopta un wrapper específico para query-builder, añadir el
   método al set reconocido en `classifyChain`.
3. Si añades un nuevo alias para `db`/`tx`, sustituir el reconocimiento
   literal por una heurística con `lvalue.text` buscando el sufijo del
   archivo de cliente de DB.

## Operational runner (ZAL-617)

`pnpm gate:operational` ejecuta los tres gates en modo `--json`, los
combina en un manifiesto con timestamp UTC y los persiste en
`docs/audit/evidence/gates/<UTC-timestamp>.json`. Cada invocación
también aplica la política de retención: borra manifiestos con mtime
mayor a `GATE_RETENTION_DAYS` (default 14, cierra la ventana de 3 días
que ZAL-24 marcó como insuficiente).

```bash
pnpm gate:operational                  # run + retention (default 14d)
pnpm gate:operational -- --dry-run     # retention only, sin escribir
pnpm gate:retention                    # alias de dry-run
GATE_RETENTION_DAYS=30 pnpm gate:operational
```

El runner operacional **no bloquea**: corre los gates en modo
informativo (sin `--strict`), exit 0 mientras el runner mismo no
colapse. El entrypoint CI-bloqueante sigue siendo `pnpm gate:all`.

Forma del manifiesto persistido:

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-08-12T13:56:36.120Z",
  "retentionDays": 14,
  "repoRoot": "...",
  "runnerVersion": "1.0.0",
  "dryRun": false,
  "retention": { "kept": 0, "removed": 0, "symlinks": 0 },
  "gates": [
    {
      "gate": "unbounded-reads",
      "status": 0,
      "json": { "gate": "...", "scannedFiles": 1355, "findings": [...], "exit": "violations" },
      "error": null,
      "durationMs": 68175,
      "startedAt": "2026-08-12T13:55:28.000Z"
    }
  ]
}
```

`.github/workflows/gates.yml` corre el runner diario a las 02:07 UTC y
sube el directorio `docs/audit/evidence/gates/` como artifact con
`retention-days: 14`, manteniendo la cota extremo a extremo. El propio
runner está excluido del repo vía `.gitignore` (`/docs/audit/evidence/gates/*.json`)
— los manifiestos se regeneran desde cero en cualquier checkout limpio.

# Gate CI local sintético de Owner — 2026-10-15

## Cambio preparado

- `ci.yml` configura el E2E local de Owner como job bloqueante en matriz
  Chromium, Firefox y WebKit, para PR y pushes cubiertos por el workflow. Cada
  ejecución usa el proyecto Playwright correspondiente y conserva los límites,
  retries y aserciones existentes.
- El workflow instala Node 22, dependencias con `pnpm install --frozen-lockfile`
  y Supabase CLI 2.84.2. Un preloader limitado a GitHub Actions comprueba el
  daemon Docker local y descarga solo imágenes exactas del manifiesto compartido
  `REQUIRED_LOCAL_SUPABASE_IMAGES`.
- Los jobs de preparación y E2E autenticado contra `e2e-sandbox` están
  desactivados en este workflow. No se suministran secretos al gate sintético.
- Se actualizan contratos YAML y pruebas del preloader para confirmar la matriz,
  el gate, el guard de GitHub Actions, la comprobación del daemon y los tags
  permitidos. El contrato carga `ci.yml` con `js-yaml` y contiene una fixture
  que demuestra el rechazo de claves duplicadas.
- Se elimina la condición `if` duplicada de `e2e-auth`; queda una única
  condición explícita `false` mientras el Sandbox permanezca desactivado.

## Bloqueo verificado

El preflight existente fija SHA-256
`c1c2bf3cac9cfb9679be798334821910f916d1cafe2cc5dc12d55443a15e920f`, verificado
para el binario Supabase CLI macOS. No hay un SHA Linux verificado en este
checkout. El runner compara el binario instalado con ese SHA y aborta si difiere;
no se añadió una excepción por plataforma ni se relajó la verificación. Por
tanto, la matriz Linux no puede considerarse ejecutable hasta obtener una fuente
local verificada y revisar el hash Linux de CLI 2.84.2. No se hizo búsqueda de
red ni se inventó un digest.

## Verificación de este cambio

Contratos de workflow y preloader: 6/6 PASS. `tsc --noEmit --pretty false` y
Prettier `--check` de workflow, package manifest, contratos y nota QA: PASS;
`git diff --check`: PASS. Este trabajo no ejecuta `test:e2e:local`, Playwright,
Docker, Supabase, GitHub Actions ni servicios remotos. El gate configurado es un
cambio candidato; no equivale a CI verde ni a protección de rama habilitada. La
regla de branch protection debe exigir el nuevo check estable `Local Synthetic
Owner E2E Required Gate` mediante configuración humana de GitHub.

En la revisión posterior de YAML, el contrato parseado con `js-yaml` pasó 4/4,
incluida la detección de claves repetidas y la única condición `false` en cada
job remoto desactivado.

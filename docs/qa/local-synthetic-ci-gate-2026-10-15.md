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

## Pin y extracción segura de Supabase CLI Linux x64

El [release oficial v2.84.2](https://github.com/supabase/cli/releases/tag/v2.84.2)
y sus [assets oficiales](https://github.com/supabase/cli/releases/expanded_assets/v2.84.2)
identifican el artefacto `supabase_linux_amd64.tar.gz`. El SHA-256 publicado para
ese archivo es
`620a5f6ea7b60f9b4fe112a5d72464ea0e53d04022035641674a2e6d121e0eb5`.

La verificación local previamente registrada en
`/tmp/supabase-cli-2.84.2.sQ6wuV/verification.txt` coincide: archivo de
29.936.583 bytes y mismo SHA-256. El tar contenía un único miembro regular
`supabase` de 94.924.984 bytes; el binario extraído dio SHA-256
`3132b218461bf90d4cd5983b27b44031cd9b6c797c259a431b2e2520b5f7bdce`. Esa
verificación no ejecutó el binario. El runner ahora admite hashes compilados solo
para `darwin-arm64` (hash previo) y `linux-x64`; cualquier otra plataforma o
arquitectura falla cerrado.

En CI, `curl` descarga solo la URL de release fijada. El instalador Python
comprueba el SHA del archivo antes de abrirlo, exige exactamente el miembro
regular `supabase` sin rutas, links ni miembros extra, verifica tamaño y SHA del
binario y solo entonces lo coloca bajo `RUNNER_TEMP` y lo añade a `GITHUB_PATH`.
El script exige `GITHUB_ACTIONS=true` y `RUNNER_TEMP`; no usa root ni acepta
hashes suministrados por el entorno. Tests Python generan tar sintético local y
cubren digest del archivo, miembro seguro, links/path traversal, extra files y
digest del binario.

## Verificación de este cambio

En el commit de seguimiento, contratos locales Vitest (workflow YAML y runner
preflight): 20/20 PASS; pruebas Python del instalador con tar sintético: 5/5
PASS; `tsc --noEmit --pretty false`, Prettier `--check` de workflow, package
manifest, contratos y nota QA, y `git diff --check`: PASS. Los tests de
instalación no descargan ni ejecutan el artefacto oficial. Esta tarea no ejecuta
`test:e2e:local`, Playwright, Docker, Supabase, GitHub Actions ni servicios
remotos. El gate configurado es un cambio candidato; no equivale a CI verde ni a
protección de rama habilitada. La regla de branch protection debe exigir el
nuevo check estable `Local Synthetic Owner E2E Required Gate` mediante
configuración humana de GitHub.

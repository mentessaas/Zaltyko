# Primer development build de Zaltyko Mobile

Estado al 2026-08-02: el código local queda preparado, pero el proyecto todavía
no está vinculado a Expo/EAS y no existe evidencia de un binario instalado en un
dispositivo real. No sustituir ese gate por un UUID inventado o copiado de otro
proyecto.

## Preparado en el repositorio

- `eas.json` usa perfiles `development`, `development-simulator`, `preview` y
  `production`, con los entornos EAS homónimos declarados explícitamente.
- EAS usa Node 22, requerido por la versión actual de Supabase JS; las
  dependencias se instalan con npm desde `package-lock.json`.
- `development` produce un development client de distribución interna para
  dispositivo físico. `development-simulator` queda separado para iOS Simulator.
- Android development/preview produce APK instalable; production produce AAB.
- El proyecto usa npm y `package-lock.json`; no se configura pnpm en EAS.
- `expo-dev-client` está instalado.
- `.env`, credenciales, artefactos nativos y `node_modules` están ignorados.
- Las únicas variables cliente necesarias son:
  - `EXPO_PUBLIC_SUPABASE_URL`
  - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
  - `EXPO_PUBLIC_API_BASE_URL` (sin barra final)

Las variables `EXPO_PUBLIC_*` son públicas por definición y quedan embebidas en
el bundle. No poner service-role keys, secretos Stripe, tokens EAS ni credenciales
de stores en ellas.

## Gate autorizado y bloqueo observado

El board autorizó el 2026-08-02 crear/vincular el proyecto y ejecutar únicamente
el development build. En este entorno, la comprobación reproducible:

```bash
cd mobile
npx eas-cli@21.4.0 whoami
```

termina con `Not logged in` (exit 1). No existe una sesión Expo disponible para
este agente y crear la cuenta requiere identidad de acceso, verificación de
email y custodia de credenciales fuera del repositorio. Expo recomienda alojar
los proyectos de equipo en una Organization, no compartir credenciales de una
cuenta individual. Platform & Security debe custodiar el acceso y entregar al
agente una sesión ya autenticada o un `secret_ref`; nunca usuario, contraseña,
token ni códigos de verificación en la issue, el vault o archivos del repo.

Secuencia exacta de desbloqueo con una persona disponible:

```bash
cd mobile
npx eas-cli@21.4.0 login          # navegador por defecto
# alternativa solo en una terminal privada: npx eas-cli@21.4.0 login --no-browser
npx eas-cli@21.4.0 whoami
npx eas-cli@21.4.0 init --account zaltyko --non-interactive
```

Antes de `init`, crear desde el dashboard la Organization corporativa `zaltyko`
(o registrar el slug alternativo si no está disponible) e invitar a los miembros
con sus propios accesos. `init` debe crear o vincular el proyecto con slug
`zaltyko`, establecer el owner y escribir un UUID real en `app.json` bajo
`expo.extra.eas.projectId`. Verificarlo sin revelar ningún token:

```bash
npx expo config --type public
npx eas-cli@21.4.0 project:info
```

Después, configurar **solo el entorno EAS `development`** con las tres variables
públicas listadas arriba y valores de sandbox aprobados. Los perfiles preview y
production quedan declarados en `eas.json`, pero no se ejecutan ni configuran en
este alcance. La app consume Supabase Auth con Bearer y llama al backend existente
mediante `/api/*`; no requiere ni admite secretos de servidor.

## Primer build autorizado

Antes del build, ejecutar el gate local:

```bash
cd mobile
npm ci
npm run typecheck
npm run lint
npm test
npx expo-doctor
```

Para reducir alcance, el primer intento recomendado es Android sobre dispositivo
físico, porque el APK interno no requiere cuenta de store ni registro de UDID:

```bash
npx eas-cli@21.4.0 build --profile development --platform android
```

Para iOS físico, registrar primero el UDID (`eas device:create`) y disponer de
Apple Developer Program/certificados; EAS puede gestionar las credenciales. El
perfil `development-simulator` no prueba hardware real y no cuenta como cierre
del hallazgo.

No ejecutar `build:prod`, `submit:*`, publicar updates ni actuar sobre stores sin
aprobación explícita del board.

## Evidencia mínima para entregar a QA

- UUID real de `expo.extra.eas.projectId` presente en el commit, sin tokens.
- URL/ID del build EAS development y plataforma.
- Instalación y apertura en un dispositivo físico identificando modelo/OS de
  prueba, sin datos personales.
- Login con usuario aislado de sandbox; validación de Bearer contra `/api/*`.
- Smoke de navegación por rol y registro de fallos observados.
- Para auth, pagos o datos: revisión adicional de Platform & Security.

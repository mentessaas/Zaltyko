# Procedimiento de QA para Zaltyko Mobile

Estado al 2026-08-06. Documenta cómo QA debe apuntar el dev server a un backend alcanzable
desde el emulador/dispositivo, y los dos gotchas que provocaron el falso diagnóstico
de "URL horneada" en el hallazgo ZAL-212.

Aplicable a builds `development` (dev-client + Metro). Builds `preview`/`production`
tienen la URL literal inlined y no se pueden cambiar sin rebuild — ver la sección
final.

## Resumen rápido

1. Limpiar la variable de entorno en el shell que lanza Metro.
2. Elegir el valor correcto para el target:
   - Android emulator (AVD) → `http://10.0.2.2:3000`
   - iOS Simulator → `http://localhost:3000`
   - Dispositivo físico en LAN → `http://<IP-LAN-MAC-DEV>:3000`
3. Reiniciar Metro con `--clear` para forzar recarga del bundle.
4. Recargar la app (R,R en Metro, o reabrir el dev-client).

## Gotcha #1 — variables exportadas en el shell no se pisan

`@expo/env` lee `mobile/.env` y rellena `process.env.EXPO_PUBLIC_*`, pero **no sobrescribe
variables ya definidas en el shell** que lanza Metro
(`node_modules/@expo/env/build/index.js:400-402`):

```js
if (typeof process.env[key] !== 'undefined') {
  debug(`"${key}" is already defined and IS NOT overwritten`);
}
```

Consecuencia: si alguien hizo `export EXPO_PUBLIC_API_BASE_URL=...` en su `.zshrc` o en
el shell actual, editar `mobile/.env` no tiene ningún efecto. Hay que limpiar la variable
en el shell antes de arrancar Metro.

Diagnóstico:

```bash
# Debe salir vacío antes de levantar Metro:
env | grep ^EXPO_PUBLIC_

# Para ver qué está leyendo @expo/env:
DEBUG=expo:env npx expo start --dev-client --clear
```

Si la variable aparece en el output del `env | grep`, hay que hacer `unset
EXPO_PUBLIC_API_BASE_URL` antes de arrancar Metro (o abrir una shell nueva sin el export).

## Gotcha #2 — `localhost` no es válido desde un AVD Android

Dentro del emulador Android, `localhost` apunta al propio emulador. Para alcanzar la máquina
host se usa la IP magic `10.0.2.2`. Valores típicos de prueba:

| Target | Valor de `EXPO_PUBLIC_API_BASE_URL` |
|---|---|
| Android emulator (AVD) | `http://10.0.2.2:3000` |
| iOS Simulator | `http://localhost:3000` |
| Dispositivo físico Android/iOS en LAN | `http://<IP-LAN-del-MAC-dev>:3000` |
| Staging público | `https://staging.zaltyko.com` |
| Producción | `https://zaltyko.com` |

Sin barra final en la URL. La app añade `/api/*` y `/auth/*` por su cuenta.

## Procedimiento paso a paso para QA

### Setup único por máquina de desarrollo

1. Averiguar la IP LAN de la máquina que corre Metro (la máquina de Mobile Developer o la
   persona que está sirviendo el backend):
   ```bash
   # macOS:
   ipconfig getifaddr en0
   # o
   ifconfig | grep "inet " | grep -v 127.0.0.1
   ```
2. Editar `mobile/.env` con el valor elegido según el target de QA. Para QA en emulador
   Android sobre la misma máquina, suele ser `http://10.0.2.2:3000`.

### Antes de cada sesión de QA

3. Verificar que la variable NO esté exportada en el shell:
   ```bash
   env | grep EXPO_PUBLIC_API_BASE_URL
   unset EXPO_PUBLIC_API_BASE_URL
   ```

4. Arrancar Metro con cache limpia:
   ```bash
   cd mobile
   npx expo start --dev-client --clear
   ```

5. En el dev-client (APK instalado en el AVD/dispositivo):
   - Sacudir el dispositivo o Cmd+D (iOS) / Cmd+M (Android) → Reload.
   - O pulsar `r` dos veces en la terminal de Metro.

6. Verificar la URL efectiva en la UI: pulsar "Crear cuenta nueva" en la pantalla de login
   debe abrir el navegador en la URL esperada. Si abre otra distinta, repetir desde el
   paso 3 — la causa más común es una variable contaminada en el shell.

### Si QA prueba contra un backend remoto (staging/prod)

- Reemplazar `EXPO_PUBLIC_API_BASE_URL` por la URL remota.
- Comprobar que la máquina de QA tiene acceso a esa URL (`curl -I <url>`).
- Si el backend exige HTTPS y QA usa HTTP (caso `localhost`), Expo dev-client aceptará
  cleartext sólo si la app lo declara — ver `mobile/app.json` (`expo.android.networkSecurityConfig`
  o `expo.ios.infoPlist.NSAppTransportSecurity.NSAllowsLocalNetworking`). Ya viene
  configurado para desarrollo; no cambiar sin consultar a Platform & Security.

## Diferencia entre perfiles de build

`EXPO_PUBLIC_API_BASE_URL` se inlinea de forma distinta según el modo de build
(`node_modules/babel-preset-expo/build/plugins/inline-env-vars.js`):

| Perfil EAS | ¿Horneado en binario? | ¿QA puede cambiar la URL sin rebuild? |
|---|---|---|
| `development` (dev-client + Metro) | No — `expo/virtual/env` | **Sí**, con el procedimiento de arriba |
| `development-simulator` | No — idem | Sí |
| `preview` | Sí — literal inlined | **No**, requiere rebuild |
| `production` | Sí — literal inlined | **No**, requiere rebuild |

Para QA en builds `preview`/`production`, la URL **no** se puede cambiar en runtime sin
tocar código (override en `expo-secure-store`) o sin rebuild. Esa mejora no es scope
de QA hoy y está cubierta por ZAL-387 (evaluación pendiente: opción A con guardas
de Platform & Security vs dejar como backlog).

## Anti-patrones (lo que NO hacer)

- **No** exportar `EXPO_PUBLIC_*` en `.zshrc`/`.bashrc` para esta app. Si hace falta
  probar otra URL, se cambia `mobile/.env` y se reinicia Metro con `--clear`.
- **No** asumir que `localhost` sirve desde un AVD. Usar `10.0.2.2`.
- **No** cambiar `.env` sin `--clear` después — Metro cachea el bundle y los cambios
  no se ven hasta recargar.
- **No** tomar el valor de la URL como evidencia de "horneado en el binario" para
  builds `development`. Verificar antes abriendo el APK/JSA y buscando el literal
  (no aparecerá). En `preview`/`production` sí aparecerá.
- **No** pegar `EXPO_PUBLIC_SUPABASE_ANON_KEY` real en issues, vault, screenshots
  ni logs. Es pública por diseño (la app la embebe) pero no debe circular sin
  necesidad. La anon key de sandbox que usa el equipo está ya en `mobile/.env`
  local; rotarla si se compromete.

## Qué reportar a Mobile Developer si algo no funciona

1. Qué target se está usando (AVD/iOS Sim/físico/Android/iOS).
2. Output de `env | grep ^EXPO_PUBLIC_` en el shell que levanta Metro (sin pegar valores).
3. Output de `DEBUG=expo:env npx expo start --dev-client --clear` (filtrar a las
   líneas que mencionan la variable, sin pegar valores).
4. SHA del commit de `mobile/` con el que se construyó el APK (para builds EAS).
5. URL exacta que abre "Crear cuenta nueva" y la URL que se esperaba.

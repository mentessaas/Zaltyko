# Monitorización externa y política de soporte

Plan de mejora 2026-11-08, P1 #12 (parte de desarrollo). Este documento dice
qué monitorizar, cuándo alertar y cómo atender a las academias. Todo lo que es
un compromiso con clientes o una contratación queda marcado como
**[Decide Elvis]**: aquí no se promete nada que no haya decidido él.

Nada de lo descrito está dado de alta todavía: no hay cuenta en ningún
proveedor de monitorización ni reglas de alerta creadas en Sentry.

## 1. Qué URL monitorizar

| Endpoint | Qué comprueba | Respuesta | Uso |
|---|---|---|---|
| `GET https://zaltyko.com/api/health` | La app atiende **y** PostgreSQL responde a `select 1` en menos de 2 s | `200` con `data.status = "ok"`; `503` con `details.status = "degraded"` | **Monitor principal** (readiness) |
| `GET https://zaltyko.com/api/health/live` | Solo que la app atiende; no toca la base de datos | Siempre `200` mientras la app responda | Monitor secundario (liveness) para separar «app caída» de «base de datos caída» |

Contrato de ambas rutas (cubierto por `tests/health-monitor-contract.test.ts`):

- Sin sesión ni token. El middleware no aplica rate limit a estos `GET`
  (solo limita mutaciones, `/api/public/*`, `/app/*` y `/super-admin/*`), ni
  redirección de idioma, ni autenticación.
- `Cache-Control: no-store, max-age=0` en `200` y en `503`: ni Vercel ni el
  navegador pueden servir una señal antigua.
- El cuerpo solo lleva estado, latencia de la consulta y marca de tiempo. No
  lleva proveedor, host, versión, nombre de secreto ni el error crudo; el
  detalle del fallo va al logger del servidor y de ahí a Sentry.
- La comprobación de base de datos tiene un tope de 2 s
  (`DATABASE_CHECK_TIMEOUT_MS` en `src/app/api/health/route.ts`). Si se
  supera, la ruta responde `503` con `checks.database.status = "timeout"`.
- `checks.cronAuth` indica si `CRON_SECRET` está configurado (`ok`/`missing`),
  sin revelar su valor. No cambia el código HTTP: es informativo.
- `HEAD` funciona igual que `GET` (Next.js lo deriva de `GET`), pero se
  recomienda `GET` para poder validar el cuerpo.

Usar siempre el dominio canónico `https://zaltyko.com`. `www.zaltyko.com`
responde `301` y algunos monitores lo cuentan como fallo o no siguen la
redirección.

### Frecuencia y coste

- **Cada 1 minuto** sobre `/api/health`, desde **una o dos regiones** (por
  ejemplo, una en Europa y otra en Norteamérica, por España y México).
- `/api/health/live` puede ir cada 1–5 minutos; es casi gratis.
- Coste en base de datos: una consulta `select 1` por región y minuto
  (unas 1.440 al día por región) usando el pool normal (`max` 5 en
  producción). Es despreciable; aun así, no conviene activar diez regiones a
  la vez sin necesidad.
- Timeout del monitor: **10 s**. La ruta ya corta a los 2 s en la base de
  datos; si el monitor no recibe nada en 10 s, el problema está antes
  (Vercel, DNS, red).
- Validación del cuerpo: si el proveedor lo permite, exigir además que la
  respuesta contenga `"status":"ok"`.

### Relación con el workflow existente

`.github/workflows/monitoring.yml` ya comprueba `/api/health` cada 15 minutos
y abre un issue `[monitoring] Production health degraded` (ver
`docs/MONITORING.md`). Se mantiene como red de seguridad, pero GitHub puede
retrasar los workflows programados y un issue no avisa a nadie fuera de
horario: **no sustituye a un monitor externo con avisos al móvil**. Esta tarea
no añade cron ni workflows programados.

### Antes de activar el monitor

- Comprobar en Vercel que el dominio de producción no tiene activada una
  protección que desafíe a clientes automáticos (Deployment Protection,
  Attack Challenge Mode o una regla del Firewall). Si la tiene, añadir una
  excepción para la ruta o el user-agent del monitor. **No verificado en esta
  tarea**: no se ha consultado producción.
- Hacer una petición manual a ambas URL y confirmar `200`, `data.status = "ok"`
  y la cabecera `Cache-Control: no-store, max-age=0`.

## 2. Umbrales y alertas recomendadas

Son puntos de partida técnicos; ajustarlos con datos reales tras 2–4 semanas.

| Señal | Condición | Severidad | Aviso |
|---|---|---|---|
| Caída | `/api/health` ≠ `200` en **2 comprobaciones seguidas** (≈2 min) | S1 | Push/SMS/llamada a guardia + email |
| Caída de la app | `/api/health/live` ≠ `200` en 2 comprobaciones seguidas | S1 | Igual que arriba; indica Vercel/DNS, no base de datos |
| Base de datos lenta o caída | `/api/health` → `503` con `timeout` o `failed` y `live` en `200` | S1 | Igual; revisar Supabase |
| Latencia | Tiempo total > **2.500 ms** sostenido **5 min** (mismo umbral que `MAX_LATENCY_MS` del workflow) | S2 | Email/Slack, sin llamada |
| Certificado TLS | Caduca en < 14 días | S3 | Email |
| Recuperación | Vuelve a `200` | — | Aviso de cierre al mismo canal |

Evitar falsos positivos: exigir 2 fallos seguidos y, si hay dos regiones,
confirmar desde la segunda antes de llamar a nadie.

### Sentry

El logger (`src/lib/logger.ts`) envía `logger.error` a Sentry en producción,
con secretos y SQL redactados. Reglas recomendadas (crear en Sentry; **no
creadas**):

1. **Errores 5xx en API**: alerta si hay **más de 10 eventos de error en
   5 minutos** en el entorno `production`, o si aparece una **issue nueva** con
   nivel `error`. Aviso a guardia (S2; S1 si coincide con fallo del monitor).
2. **Fallo de salud**: alerta en cuanto aparezca el mensaje
   `Health check failed` (el atributo `outcome` dice `timeout` o `failed`).
   Mientras dure una caída, el monitor genera un evento por minuto; Sentry los
   agrupa en una sola issue, pero conviene limitar la regla a un aviso cada
   30 min para no saturar.
3. **Regresión**: alerta cuando una issue resuelta vuelve a aparecer tras un
   despliegue.

Cada cuánto revisar Sentry sin alerta: **[Decide Elvis]**.

## 3. Propuesta de proveedor

No se ha dado de alta ninguna cuenta. Precios, límites de cada plan y
condiciones de uso cambian: **comprobarlos en la web del proveedor antes de
decidir**; aquí no se citan cifras para no dar por buenos datos no verificados.

| Opción | Encaja porque | A tener en cuenta |
|---|---|---|
| **Better Stack (Uptime)** — *propuesta* | Monitor HTTP con validación de cuerpo, varias regiones, guardias con escalado a un suplente, llamadas/SMS y página de estado pública en una sola herramienta | Verificar qué intervalo mínimo, llamadas y escalado incluye cada plan |
| UptimeRobot | Muy sencillo, monitor HTTP con palabra clave, avisos por email/app | Verificar intervalo mínimo y si el plan gratuito admite uso comercial; el escalado a suplente es más limitado |
| Checks de Vercel | Ya integrados en los despliegues | Son comprobaciones **de despliegue**, no un monitor externo continuo: no detectan una caída a las 3:00 sin desplegar. Útiles como complemento, no como monitor principal |

Propuesta: **Better Stack** con dos monitores (sección 1), una política de
guardia Elvis → suplente y, opcionalmente, su página de estado. Alternativa
mínima: UptimeRobot con avisos al móvil de Elvis y del suplente.

Decisiones pendientes:

- Proveedor y plan: **[Decide Elvis]**
- Quién recibe las alertas S1 y por qué canal: **[Decide Elvis]**
- Si se publica una página de estado externa o basta con `/status`: **[Decide Elvis]**

Datos personales: el monitor solo recibe estado, latencia y fecha; no hay
datos de academias ni de familias. Aun así, añadir el proveedor al registro
de encargados del tratamiento si la asesoría lo pide: **[Decide Elvis]**.

## 4. Qué hacer cuando salta una alerta

1. Abrir `https://zaltyko.com/api/health/live` y `https://zaltyko.com/api/health`.
   - `live` falla → Vercel (estado del proyecto, último despliegue, DNS).
   - `live` bien y `health` en `503` → base de datos (estado de Supabase,
     conexiones del pool, sentencias lentas).
2. Revisar en Sentry la issue `Health check failed` y los errores recientes.
3. Si coincide con un despliegue reciente, valorar volver al anterior desde
   Vercel.
4. Si la caída supera **[Decide Elvis]** minutos, avisar a las academias por
   el canal acordado (sección 5) y actualizar `/status` o la página de estado.
5. Al cerrar: anotar causa, duración y acción en el issue de monitorización o
   en el registro de incidentes **[Decide Elvis: dónde]**.

Nunca pegar secretos, cadenas de conexión ni datos de academias en issues,
chats o avisos.

## 5. Plantilla de política de soporte

> Plantilla para completar. Nada de lo marcado **[Decide Elvis]** es un
> compromiso hasta que Elvis lo rellene y lo publique.

### Alcance

- Clientes cubiertos: academias con suscripción activa a Zaltyko en España y
  México. Planes incluidos: **[Decide Elvis]**.
- Qué cubre: incidencias de la plataforma, dudas de uso, acceso a cuentas.
- Qué no cubre: **[Decide Elvis]** (por ejemplo, configuración de equipos
  propios, formación a medida, migraciones de datos no contratadas).

### Canales

- Canal principal: **[Decide Elvis]** (email de soporte, formulario, WhatsApp
  Business…).
- Canal urgente para caídas (S1): **[Decide Elvis]**.
- Dónde se publica el estado del servicio: `/status` y **[Decide Elvis]**.

### Horario

| Zona | Días | Horario | Festivos |
|---|---|---|---|
| España (Europe/Madrid) | **[Decide Elvis]** | **[Decide Elvis]** | **[Decide Elvis]** |
| México (America/Mexico_City) | **[Decide Elvis]** | **[Decide Elvis]** | **[Decide Elvis]** |

Fuera de horario: **[Decide Elvis]** (por ejemplo, solo S1 vía monitor y
guardia, o nada hasta el siguiente día laborable).

### Severidades y tiempos

| Severidad | Definición | Primera respuesta | Objetivo de resolución o mitigación |
|---|---|---|---|
| S1 — Caída | Zaltyko no carga o nadie puede iniciar sesión, pasar lista o registrar cobros | **[Decide Elvis]** | **[Decide Elvis]** |
| S2 — Degradado | Una función clave falla para una o varias academias y no hay alternativa | **[Decide Elvis]** | **[Decide Elvis]** |
| S3 — Consulta | Duda de uso, petición menor o fallo con alternativa | **[Decide Elvis]** | **[Decide Elvis]** |

«Primera respuesta» es un acuse humano con siguiente paso, no un mensaje
automático. Si se publica como objetivo y no como garantía contractual,
decirlo así: **[Decide Elvis]**.

### Responsables y suplente

| Rol | Persona | Contacto | Cuándo |
|---|---|---|---|
| Responsable de soporte | Elvis | **[Decide Elvis]** | Horario normal |
| Suplente | **[Decide Elvis]** | **[Decide Elvis]** | Ausencias, vacaciones y S1 sin respuesta en **[Decide Elvis]** min |
| Guardia de alertas S1 | **[Decide Elvis]** | **[Decide Elvis]** | **[Decide Elvis]** |

El suplente necesita, como mínimo: acceso de lectura a Sentry, al proveedor de
monitorización y a los logs de Vercel, y este documento. Qué permisos más
recibe (por ejemplo, volver a un despliegue anterior): **[Decide Elvis]**.

### Comunicación de incidentes

- Aviso a academias afectadas cuando una S1 supere **[Decide Elvis]** minutos.
- Actualizaciones cada **[Decide Elvis]** minutos mientras dure.
- Resumen posterior (qué pasó, impacto, qué se cambia) en un plazo de
  **[Decide Elvis]**.

### Revisión

- Revisar esta política y los umbrales cada **[Decide Elvis]** o tras cada S1.

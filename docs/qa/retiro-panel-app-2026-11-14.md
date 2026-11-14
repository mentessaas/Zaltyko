# Retirada del panel antiguo /app — 14-11-2026

Rama `limpieza/retirar-app`, base `c77154c4` (main). Nada se ejecutó en el Mac
(instalación, build, tests, lint, servidores): la verificación es la CI de la PR.

## Hallazgos

- `/app` (`src/app/app/**`, 150 archivos de ruta) usaba solo el esquema legacy
  (`@/db/schema`). Era el único lugar donde la web leía y escribía datos de salud
  de gimnastas: documentos de la gimnasta (`athlete_documents`, con tipo
  `medical_certificate`) y la caducidad del certificado médico
  (`federative_licenses.medical_certificate_expiry`), con las APIs
  `/api/athletes/[athleteId]/documents[/upload]` y `/api/licenses`.
- `/owner` ya cubre el núcleo: gimnastas, grupos, clases, asistencia, equipo,
  cobros, solicitudes, suscripción. `/familia` cubre horario, asistencia y cuotas
  de solo lectura.
- Los enlaces a `/app` estaban en el login, `resolveUserHome`, el onboarding, el
  correo de bienvenida, las URLs de retorno de Stripe, los avisos, la navegación y
  las redirecciones de `/dashboard/*`.

## Qué se retiró

| Qué | Cantidad |
|---|---|
| Archivos de ruta bajo `src/app/app/**` | 150 |
| Componentes sin otro consumidor (`src/components`) | 208 |
| APIs sin otro consumidor (`src/app/api`) | 89 |
| Librerías, hooks y tipos huérfanos | 33 |
| Pruebas que dependían de lo retirado | 133 |

Se empezó por todo lo que trata salud: rutas `athletes/[id]/documents`,
`licenses`, la API de documentos y de licencias, `DocumentUploadModal`,
`AthleteDocumentsSection/List`, `CreateLicenseDialog`.

El criterio fue un análisis de grafo de imports (todo lo alcanzable solo desde
`src/app/app/**` y desde APIs cuyo único consumidor era `/app`) más una búsqueda
de cada ruta de API en el resto del código, el móvil y `vercel.json`.

## A dónde se redirige (308, `next.config.mjs`)

Mapa en `src/lib/launch/legacy-app-redirects.mjs`. El `academyId` de la URL no se
reutiliza (ADR-0007): `/owner` vuelve a resolver organización y sede.

| URL antigua | Destino |
|---|---|
| `/app`, `/app/:id`, `/app/:id/dashboard/**` | `/owner` |
| `/app/:id/athletes/**` | `/owner/athletes` |
| `/app/:id/classes/**` | `/owner/classes` |
| `/app/:id/groups/**` | `/owner/groups` |
| `/app/:id/attendance/**`, `/app/:id/coach/**` | `/owner/attendance` |
| `/app/:id/coaches/**` | `/owner/staff` |
| `/app/:id/billing/**` | `/owner/payments` |
| `/app/:id/trials` | `/owner/requests` |
| `/app/:id/my-dashboard`, `/app/:id/my-events` | `/familia` |
| cualquier otra (`reports`, `events`, `assessments`, `announcements`, `messages`, `notifications`, `settings`, `support`, `whatsapp`, `licenses`, `/app/{athlete,coach,supplier}/:id/public-page`…) | `/owner` |

También: el login, `resolveUserHome`, el onboarding, el correo de bienvenida,
Stripe (checkout y portal), los avisos, la navegación y las redirecciones de
`/dashboard/*` apuntan ya a `/owner` o `/familia`. `/owner` y `/owner/setup` dejan
de rebotar una cuenta legacy a `/app` (habría sido un bucle); una cuenta legacy
bloqueada sigue a `access_disabled`.

## Sin equivalente en `/owner` (se pierde el acceso web, redirige al inicio)

El código está en el historial de Git. Lo que tenía función real y no está en
`/owner`, para decidir si se reconstruye sobre el modelo canónico:

- **Informes**: asistencia, bajas (churn), por clase, por entrenadora, financiero
  (morosidad, mensual), progreso, programados, exportaciones y envío por correo.
- **Comunicación**: mensajes, avisos, notificaciones, WhatsApp, mensajes de contacto.
- **Evaluaciones** y observaciones por aparato en el modelo antiguo (el modelo
  canónico tiene objetivos y observaciones por gimnasta, P2 #17).
- **Eventos**: lista, invitaciones, inscripciones, resultados de competición.
- **Facturación accesoria**: descuentos y campañas, becas, recibos, cobros
  recurrentes del modelo antiguo.
- **Ajustes de academia**: `/owner/settings` lo crea otra sesión; no se enlaza.
- **Gimnasta**: pestañas de historial, notas de entrenadora, tutores, clases extra,
  exportación, archivado masivo y restauración, deshacer importación.
- **Otros**: auditoría, soporte con tickets, página pública de academia,
  entrenadora o proveedora, licencias federativas, tienda y subdominio (ya
  cerrados por el corte de lanzamiento).

Salud: documentos y certificado médico quedan sin equivalente **a propósito**.

## APIs conservadas sin consumidor web

Tienen pruebas propias de comportamiento financiero y no se borraron para no
perder esa cobertura; dependen de decidir su sustituto en `/owner`:
`POST /api/charges/[chargeId]/remind`, `POST /api/charges/generate-monthly`,
`POST /api/quick-actions/record-payment`, `GET /api/family/charges/[chargeId]/receipt`.
También se conserva `src/lib/dashboard.ts`, `attention-bundle` (coach y móvil) y
`/api/dashboard/[academyId]/attention` (móvil).

## Datos de salud: migración candidata (sin aplicar)

`docs/deployment/candidates/20261114120000_retire_legacy_health_data_candidate.sql`
elimina `public.athlete_documents`, `federative_licenses.medical_certificate_expiry`
y las dos columnas `medical_certificate_*` de `template_license_config`. Es
destructiva e irreversible; aborta salvo `set local zaltyko.retire_health_data =
'confirmado'`. Los espejos Drizzle (`src/db/schema`) se conservan hasta aplicarla
para no crear deriva. Los archivos de Storage (bucket `uploads`, prefijo
`…/athletes/<id>/documents/`) hay que borrarlos con la API de Storage. Ninguna
parte se aplicó ni se consultó en ningún entorno.

## Pruebas y gates

- Nueva `tests/legacy-app-retirement.test.ts`: mapa de redirecciones, que
  `next.config.mjs` las aplica como permanentes, que no quedan enlaces a `/app` en
  `src/`, que no quedan referencias a documentos ni certificados médicos fuera de
  `src/db`, y que la candidata SQL existe y está protegida.
- Ajustadas: `middleware`, `experimental-release-routes`, `product-roles-navigation`,
  `resolve-user-home-legacy-owner`, `owner-dashboard-page-operational`,
  `owner-setup-page-consent`, `onboarding-*`, `api-limits-validation` y otras que
  citaban rutas retiradas.
- `scripts/verify-zaltyko-cutover-boundary.ts` comprueba ahora la ausencia de
  `src/app/app` y la redirección a `/owner`. El gate `orphan-app-route` cuenta como
  vacía la raíz por defecto retirada (sus fixtures siguen pasando por `--root`).

## Fuera de alcance / riesgos

- Los E2E de Playwright (`tests/e2e-*.spec.ts`, fuera de la CI) siguen citando
  rutas `/app`; no se actualizaron.
- `scripts/lib/local-build-trace-catalog.ts` y los scripts `scripts/fix-*.js`
  conservan rutas antiguas en listas históricas; no se consultan en tiempo de ejecución.
- Documentación histórica (auditorías, vault, planes antiguos) sigue hablando de
  `/app`: es registro histórico, no fuente vigente.
- `src/db/seeds` y `src/types/athletes.ts` conservan `medical_certificate` hasta
  aplicar la candidata.

# Checklist de producción — Zaltyko

Fuente operativa para habilitar una academia real. No marcar una tarea como completada sin evidencia verificable.

## Estado conocido al 19 de julio de 2026

| Área | Estado | Evidencia / pendiente |
|---|---|---|
| Dominio | Operativo | `https://zaltyko.com` con SSL y canonicals consolidados |
| Migraciones | Operativas | Ledger con 38 migraciones y cero pendientes tras el módulo de cobros |
| Stripe Connect | Parcial | Webhook registrado y onboarding probado en test mode |
| Cobros E2E | Pendiente | Guardar tarjeta, off-session, SCA, rechazo, reembolso y reconciliación |
| Brevo | Bloqueado externo | Falta API key real y remitente verificado; el placeholder fue retirado |
| Cron | Configurado en código | Verificar ejecuciones y resultados en Vercel |
| E2E por roles | Parcial | Ejecutar owner, coach, familia y super-admin con cuentas aisladas |
| Comercial | No validado a escala | No declarar prueba social o resultados sin academias reales |

## 1. Base de datos y aislamiento

- [ ] `DATABASE_URL_POOL` usa pool transaccional.
- [ ] `DATABASE_URL_DIRECT` está disponible solo para tareas que lo requieren.
- [ ] `pnpm db:migrate:ledger` devuelve cero pendientes.
- [ ] `pnpm check:migrations` pasa.
- [ ] `pnpm validate:rls` pasa.
- [ ] `pnpm verify:permissive-policies` no detecta políticas inseguras.
- [ ] Owner, coach, familia y super-admin fueron probados con academias distintas.
- [ ] Ningún rol puede leer o mutar datos de otro tenant.

No ejecutar `drizzle-kit push` ni `pnpm db:migrate` contra producción.

## 2. Variables de producción

### Aplicación y seguridad

- [ ] `NEXT_PUBLIC_APP_URL=https://zaltyko.com`
- [ ] `NEXTAUTH_SECRET`
- [ ] `INTERNAL_AUTH_SECRET`
- [ ] `CRON_SECRET`
- [ ] `KV_REST_API_URL`
- [ ] `KV_REST_API_TOKEN`

### Supabase

- [ ] `DATABASE_URL`
- [ ] `DATABASE_URL_POOL`
- [ ] `DATABASE_URL_DIRECT`
- [ ] `NEXT_PUBLIC_SUPABASE_URL`
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `SUPABASE_JWT_SECRET`

### Stripe

- [ ] `STRIPE_SECRET_KEY`
- [ ] `STRIPE_WEBHOOK_SECRET`
- [ ] `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- [ ] `STRIPE_CONNECT_WEBHOOK_SECRET`

### Brevo

- [ ] `BREVO_API_KEY` es real; una llamada controlada no devuelve 401.
- [ ] `BREVO_SENDER_EMAIL` está verificado.
- [ ] `BREVO_SENDER_NAME=Zaltyko`
- [ ] `BREVO_REPLY_TO` recibe respuestas.

No existe dependencia operativa de LemonSqueezy ni Mailgun para email saliente.

## 3. Stripe de plataforma y Connect

- [ ] Webhook de plataforma apunta a `/api/stripe/webhook`.
- [ ] Webhook Connect apunta a `/api/stripe/connect/webhook`.
- [ ] Se validan firmas con secretos diferentes.
- [ ] Eventos Connect activos:
  - `account.updated`
  - `payment_intent.succeeded`
  - `payment_intent.payment_failed`
  - `payment_intent.canceled`
  - `charge.refunded`
- [ ] Onboarding refleja `charges_enabled`, `payouts_enabled` y `details_submitted`.
- [ ] SetupIntent guarda una tarjeta sin exponer PAN/CVC.
- [ ] Cobro inmediato funciona.
- [ ] Cobro off-session funciona.
- [ ] SCA/3DS produce `requires_action` y una recuperación entendible.
- [ ] Tarjeta rechazada produce `failed`, registra intento y notifica.
- [ ] Reembolso total y parcial reconcilian Stripe y el ledger.
- [ ] Un evento repetido no duplica efectos.
- [ ] Dos intentos concurrentes no generan doble cobro.
- [ ] Bizum, efectivo y transferencia continúan como pagos manuales.

## 4. Email transaccional

- [ ] Contacto público entrega un correo real.
- [ ] Contacto de academia entrega al propietario correcto.
- [ ] Recordatorio de cuota entrega al tutor correcto.
- [ ] Emails escapan contenido introducido por usuarios.
- [ ] Fallos del proveedor quedan registrados sin secretos ni PII innecesaria.
- [ ] La interfaz no confirma entrega cuando Brevo rechazó el mensaje.

## 5. Cron jobs

Verificar en Vercel cada ruta de `vercel.json`:

- [ ] `/api/cron/generate-sessions`
- [ ] `/api/cron/collect-charges`
- [ ] `/api/cron/class-reminders`
- [ ] `/api/cron/scheduled-notifications`
- [ ] `/api/cron/trial-lifecycle`
- [ ] `/api/cron/payment-reminders`

Para cada cron:

- [ ] Rechaza peticiones sin autorización.
- [ ] Registra inicio, resultado, duración y errores.
- [ ] Es idempotente o tolera reintentos.
- [ ] Tiene una ejecución real reciente sin error.
- [ ] No supera el límite de duración configurado.

## 6. Flujos por rol

### Owner / dirección

- [ ] Crear y configurar academia.
- [ ] Importar gimnastas desde CSV.
- [ ] Crear grupos, horarios y sesiones.
- [ ] Conectar Stripe.
- [ ] Generar, cobrar, marcar manualmente y reembolsar cuotas.
- [ ] Consultar morosidad y estadísticas.
- [ ] Invitar entrenadores y familias.

### Entrenador

- [ ] Solo ve clases y atletas permitidos.
- [ ] Pasa lista desde móvil, incluida recuperación offline.
- [ ] Registra evaluación y progreso técnico.
- [ ] Envía avisos internos permitidos.
- [ ] No accede a cobros ni configuración sensible.

### Familia

- [ ] Solo ve sus gimnastas.
- [ ] Consulta horarios, asistencia, progreso y cuotas.
- [ ] Guarda o elimina tarjeta.
- [ ] Paga una cuota pendiente y descarga recibo interno.
- [ ] No confunde recibo interno con factura fiscal.

### Super Admin

- [ ] Acceso restringido y auditado.
- [ ] Gestiona academias y planes sin saltarse aislamiento accidentalmente.
- [ ] Las acciones críticas requieren confirmación y quedan en auditoría.

## 7. Calidad y despliegue

- [ ] `pnpm typecheck`
- [ ] `pnpm lint`
- [ ] `pnpm test -- --run`
- [ ] `pnpm build`
- [ ] `pnpm verify:production`
- [ ] `pnpm audit:api-routes:strict`
- [ ] `pnpm audit --prod`
- [ ] E2E público.
- [ ] E2E autenticado por roles.
- [ ] WCAG 2.2 AA en flujos principales.
- [ ] Viewports móviles sin overflow.
- [ ] Preview de Vercel revisado antes de merge.
- [ ] Smoke de producción tras deploy.
- [ ] Rollback documentado.

## 8. Observabilidad

- [ ] Sentry recibe un evento de prueba en producción.
- [ ] Source maps están disponibles.
- [ ] Vercel Analytics y Speed Insights están activos.
- [ ] Alertas para 5xx, fallos de webhook, cron y email.
- [ ] Logs no contienen secretos, PAN/CVC ni datos completos de menores.

## Gate para una academia piloto

No invitar una academia real hasta completar:

- [ ] Stripe Connect E2E.
- [ ] Brevo con entrega real.
- [ ] E2E owner, coach y familia.
- [ ] Aislamiento multi-tenant verificado.
- [ ] Backup y rollback.
- [ ] Soporte y canal de incidencia definidos.

## Gate para lanzamiento amplio

Además del gate piloto:

- [ ] Tres academias piloto activas.
- [ ] Métricas verificadas de activación, cobro y uso semanal.
- [ ] Cero P0/P1 abiertos en flujos principales.
- [ ] Onboarding y migración desde Excel probados con usuarios reales.
- [ ] Claims públicos respaldados por evidencia.

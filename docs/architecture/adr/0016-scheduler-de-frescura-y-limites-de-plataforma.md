# ADR-0016: Activación de scheduler para frescura del pipeline

- Estado: aceptado como gate preproducción; ampliado el 2026-11-15 con el
  planificador de los avisos automáticos (ver más abajo)
- Fecha: 2026-10-06 (ampliación: 2026-11-15)
- Contexto: AC-10 requiere reflejo o estado explícito en ≤15 min. El worker local
  y la observabilidad por outbox ya existen, pero un schedule en código no prueba
  su ejecución ni su disponibilidad.

## Evidencia de plataforma

- Vercel Cron Jobs solo se invocan para deployments de producción, no previews.
- El plan Hobby permite una ejecución por día y rechaza expresiones más
  frecuentes. Pro y Enterprise permiten mínimo un minuto; la precisión es por
  minuto. La documentación advierte que no asegura una invocación puntual.
- Fuentes oficiales consultadas el 2026-10-06:
  - https://vercel.com/docs/cron-jobs/usage-and-pricing
  - https://vercel.com/docs/cron-jobs/manage-cron-jobs

## Decisión

- No añadir todavía `/api/cron/zaltyko-outbox` a `vercel.json` ni activarlo en
  producción. El plan activo de Vercel no está verificado y los Cron Jobs solo
  corren en producción.
- Antes de elegir scheduler, verificar plan y coste, entorno aislado, autenticación
  `CRON_SECRET`, observabilidad de invocación/lag/errores, retry y comportamiento
  ante missed runs. Si el plan no soporta cada 15 min, elegir scheduler durable
  compatible; no rebajar silenciosamente el requisito del PRD.
- Incluso con schedule cada 15 min, no afirmar un SLA 95% hasta medir cobertura,
  puntualidad, disponibilidad y recuperación end-to-end bajo prueba de carga.

## Consecuencias

- El sistema puede informar pendiente/atrasado/fallido para eventos que llegan al
  outbox, pero AC-10 queda parcial y no hay garantía de 15 min.
- La migración, worker y endpoint permanecen locales; no se crea deployment,
  schedule externo ni cambio de credenciales.

## Ampliación 2026-11-15: avisos automáticos con pg_cron en Supabase

Autorizado por Elvis el 2026-11-15. Afecta a los avisos por correo que se
encendieron en producción ese día; el outbox (`/api/cron/zaltyko-outbox`) sigue
sin programar y la decisión anterior no cambia.

### Contexto

- Plan de Vercel verificado el 2026-11-15: **Hobby**. Admite hasta 100 cron
  jobs, pero **como mucho uno al día** por entrada (una expresión más frecuente
  hace fallar el deployment) y con precisión por hora: `0 8 * * *` puede llegar
  en cualquier minuto entre 08:00 y 08:59. Fuentes oficiales consultadas ese día:
  https://vercel.com/docs/cron-jobs/usage-and-pricing y
  https://vercel.com/docs/cron-jobs/manage-cron-jobs
- El aviso a quien entrena necesita correr cada 5 minutos (avisa unos 15
  minutos antes de cada clase); con un disparo diario llegaría horas antes o
  después y no serviría. El resumen semanal está pensado para cada hora y el
  reintento de avisos a familias, cada pocos minutos.
- Vercel Pro permite un minuto de intervalo, pero las condiciones de Vercel
  reservan Hobby al uso personal y no comercial: Pro tocará cuando haya
  clientes de pago, no antes, solo por los crons.
- Supabase (plan gratis) incluye `pg_cron` y `pg_net`, que permiten programar al
  minuto desde la base de producción y llamar a las rutas por HTTP.

### Decisión

- El planificador de los avisos es **pg_cron + pg_net en la base de producción
  de Supabase**. `vercel.json` sigue con `"crons": []` y
  `git.deploymentEnabled: false`.
- SQL aplicado (sin el secreto) y operación —crear el secreto en Vault, ver
  ejecuciones, pausar, rotar— en `docs/deployment/scheduler/`.
- `zaltyko_scheduler.call_cron(route)` es `security definer`, sin permisos para
  `anon` ni `authenticated`, valida el nombre de la ruta y hace un `POST` a
  `https://zaltyko.com/api/cron/<ruta>` con el `CRON_SECRET`, que se guarda
  cifrado en Supabase Vault (`zaltyko_cron_secret`) y en Vercel producción, con
  el mismo valor. Se generó un `CRON_SECRET` nuevo para este cambio.
- Programación (UTC; pg_cron se cumple al minuto):

| Trabajo | Expresión | España (Madrid) | México (Ciudad de México) |
|---|---|---|---|
| `coach-session-reminders` | `*/5 * * * *` | cada 5 minutos | cada 5 minutos |
| `family-notices` | `*/10 * * * *` | cada 10 minutos | cada 10 minutos |
| `owner-weekly-digest` | `7 * * * *` | cada hora; el correo sale el lunes a las 08:07 | cada hora; el correo sale el lunes a las 08:07 |
| `usage-at-risk` | `0 7 * * *` | 08:00 invierno · 09:00 verano | 01:00 |
| `family-payment-reminders` | `0 16 * * *` | 17:00 invierno · 18:00 verano | 10:00 |
| limpieza del historial | `30 3 * * 0` | domingo 04:30 / 05:30 | sábado 21:30 |

- Cada ruta comprueba `CRON_SECRET` con `requireCronAuth` antes de cualquier
  trabajo, toma un lease para no solaparse y respeta su bandera. Se añade `GET`
  a `/api/cron/family-notices` para disparos manuales (pg_net llama por `POST`).
- El resumen semanal no se repite aunque se lance cada hora o dos veces seguidas:
  la clave `owner-weekly-digest:<academia>:<persona>:<semana ISO>` se comprueba
  antes de enviar y el registro de correos tiene un índice único sobre ella.
- El recordatorio automático de cuotas no limita horas en el código (es un único
  aviso por cuota): la hora la fija esta programación, de día en los dos países.
- `tests/scheduler-pg-cron-contract.test.ts` comprueba que el SQL documentado no
  lleva secretos, que programa exactamente estos avisos, que cada ruta existe y
  exige el secreto antes de trabajar y que `vercel.json` no programa nada.

### Consecuencias

- Las llamadas salen de la base de datos hacia la URL pública: si zaltyko.com no
  responde, la ejecución queda registrada en `net._http_response` y se reintenta
  sola en el siguiente disparo (no hay reintento inmediato).
- Rotar `CRON_SECRET` exige cambiarlo en Vercel y en Vault y republicar
  (procedimiento en `docs/deployment/scheduler/README.md`).
- Restaurar la base de producción o cambiar de proyecto de Supabase obliga a
  volver a crear el secreto en Vault y a reejecutar el SQL.
- Si más adelante se pasa a Vercel Pro, se puede mover la programación a
  `vercel.json` (actualizando este ADR y el test de contrato) o mantener pg_cron.

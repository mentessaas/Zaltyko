# ADR-0016: Activación de scheduler para frescura del pipeline

- Estado: aceptado como gate preproducción; ampliado el 2026-11-15 con la
  programación de los avisos automáticos (ver más abajo)
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

## Ampliación 2026-11-15: avisos automáticos en el plan Hobby

Autorizado por Elvis el 2026-11-15. Afecta solo a los avisos por correo que se
encendieron en producción ese día; el outbox (`/api/cron/zaltyko-outbox`) sigue
sin programar y la decisión anterior no cambia.

### Evidencia de plataforma (consultada el 2026-11-15)

- Plan de la cuenta verificado ese día: **Hobby**.
- Hobby admite hasta 100 cron jobs por proyecto, con un mínimo de **una
  ejecución al día**; una expresión más frecuente hace fallar el deployment.
- La precisión en Hobby es **por hora**: `0 8 * * *` puede llegar en cualquier
  minuto entre las 08:00:00 y las 08:59:59 UTC. Por eso todas las expresiones
  usan el minuto 0 y las ventanas se calculan sobre la hora completa.
- Las expresiones van en UTC y solo se invocan en el deployment de producción.
- Vercel llama con `GET` y envía `Authorization: Bearer $CRON_SECRET`.
- Se admiten varias entradas con la misma ruta y distinta expresión (la
  documentación lo muestra con `x-vercel-cron-schedule`), así que no hace falta
  un query string para distinguirlas.
- La entrega es «best effort»: puede perderse un disparo o llegar dos veces. Las
  rutas usan lease (`runCronWithLease`) y deduplicación propia.
- Fuentes oficiales:
  - https://vercel.com/docs/cron-jobs/usage-and-pricing
  - https://vercel.com/docs/cron-jobs/manage-cron-jobs

### Decisión

Programar en `vercel.json` (con `git.deploymentEnabled: false`; se publica con
`vercel deploy --prod` como siempre):

| Ruta | Expresión (UTC) | Llega entre (UTC) | España (Madrid) | México (Ciudad de México) |
|---|---|---|---|---|
| `/api/cron/usage-at-risk` | `0 7 * * *` | 07:00–07:59 | 08:00–08:59 (invierno) · 09:00–09:59 (verano) | 01:00–01:59 |
| `/api/cron/owner-weekly-digest` | `0 8 * * 1` | lunes 08:00–08:59 | 09:00–09:59 (invierno) · 10:00–10:59 (verano) | fuera de ventana (02:00) |
| `/api/cron/owner-weekly-digest` | `0 16 * * 1` | lunes 16:00–16:59 | fuera de ventana (17:00/18:00) | 10:00–10:59 |
| `/api/cron/family-payment-reminders` | `0 16 * * *` | 16:00–16:59 | 17:00–17:59 (invierno) · 18:00–18:59 (verano) | 10:00–10:59 |
| `/api/cron/family-notices` | `0 17 * * *` | 17:00–17:59 | 18:00–18:59 (invierno) · 19:00–19:59 (verano) | 11:00–11:59 |

- **Aviso de academias en riesgo:** va a Elvis; a primera hora de Madrid.
- **Resumen semanal:** el código solo envía el lunes entre las 08:00 y las 11:59
  de la sede, así que basta con dos disparos **solo los lunes** (uno por país);
  un disparo diario los demás días no enviaría nada. Con la hora completa de
  margen de Hobby, cada zona de España (Madrid, Canarias) y de México (Centro,
  Sureste, Pacífico, Noroeste/Tijuana, también con horario de verano) cae dentro
  de la ventana en uno y solo uno de los dos disparos. No se envía dos veces: la
  clave `owner-weekly-digest:<academia>:<persona>:<semana ISO>` se comprueba
  antes de enviar y la usa el emisor común como clave de idempotencia (un
  segundo intento con la misma clave no sale). Lo prueban
  `tests/habitual-use-owner-digest.test.ts` y
  `tests/habitual-use-time-and-flags.test.ts`.
- **Recordatorio automático de cuotas:** el servicio no limita horas de envío
  (ni falta: es un único aviso por cuota); la hora la fija esta programación,
  de día en los dos países.
- **Reintento de avisos a familias:** la ruta solo aceptaba `POST`; se añade
  `GET` con el mismo manejador, que comprueba `CRON_SECRET` antes de cualquier
  trabajo. Con un disparo diario, un correo que falló al guardar el aviso se
  reintenta al día siguiente (el aviso ya se ve en el portal desde el primer
  momento).
- **Aviso a quien entrena (`/api/cron/coach-session-reminders`): no se
  programa.** Tiene que correr cada 5 minutos: avisa unos 15 minutos antes de
  cada clase y una sola vez tras una clase que terminó sin lista (hasta 24 h).
  Con un disparo al día el aviso llegaría horas antes o después de la clase, o
  nunca para las clases de la tarde, y dejaría de ser útil. Necesita el plan
  **Pro** de Vercel (mínimo un minuto, precisión por minuto) o un planificador
  externo que llame a la ruta con `GET` o `POST` y el mismo `CRON_SECRET`. Su
  bandera puede seguir encendida: sin disparo no envía nada.
- Ninguna ruta programada puede saltarse `requireCronAuth`: lo exige
  `tests/deployment-lock-contract.test.ts`, que además fija la lista exacta de
  crons y falla si una expresión se dispara más de una vez al día.
- No se cambian credenciales ni `CRON_SECRET`.

### Consecuencias

- Los envíos dependen de las banderas que ya controlan cada función; apagar una
  bandera detiene su envío sin tocar `vercel.json`.
- Un disparo perdido por Vercel no se recupera hasta el día (o el lunes)
  siguiente; Hobby no reintenta.
- Si se pasa a Pro: programar el aviso a quien entrena cada 5 minutos y, si se
  quiere, volver al resumen cada hora; actualizar este ADR y el test de contrato.

# ADR-0016: Activación de scheduler para frescura del pipeline

- Estado: aceptado como gate preproducción
- Fecha: 2026-10-06
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

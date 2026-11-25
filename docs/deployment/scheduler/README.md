# Planificador de avisos en Supabase (pg_cron + pg_net)

Desde el 15 de noviembre de 2026 los avisos automáticos de Zaltyko los lanza la
base de datos de producción de Supabase, no Vercel. Decisión y motivos en
`docs/architecture/adr/0016-scheduler-de-frescura-y-limites-de-plataforma.md`.

- `20261115_pg_cron_avisos.sql`: el SQL **exacto** que se aplicó en producción.
  No contiene el secreto. Se puede volver a ejecutar: `create or replace` no
  duplica la función y `cron.schedule` con el mismo nombre actualiza el trabajo
  existente en vez de crear otro.
- `vercel.json` sigue con `"crons": []`: Vercel no programa nada.

## Cómo funciona

1. pg_cron ejecuta, a su hora, `select zaltyko_scheduler.call_cron('<ruta>')`.
2. `call_cron` lee el secreto de Vault (`zaltyko_cron_secret`) y hace un `POST`
   a `https://zaltyko.com/api/cron/<ruta>` con `Authorization: Bearer <secreto>`
   mediante pg_net (asíncrono; espera hasta 5 minutos, como el límite de las
   rutas en Vercel).
3. La ruta comprueba `CRON_SECRET` con `requireCronAuth` antes de hacer nada,
   toma un lease para no solaparse y, si su bandera está apagada, no envía.

`call_cron` es `security definer`, solo acepta nombres de ruta con letras
minúsculas y guiones, y no tiene permisos para `anon` ni `authenticated`: desde
la API pública de Supabase no se puede llamar ni leer el secreto.

## Trabajos

Las horas de pg_cron en Supabase van en UTC y se cumplen al minuto.

| Trabajo (`cron.job.jobname`) | Expresión (UTC) | España (Madrid) | México (Ciudad de México) |
|---|---|---|---|
| `zaltyko-coach-session-reminders` | `*/5 * * * *` | cada 5 minutos | cada 5 minutos |
| `zaltyko-family-notices` | `*/10 * * * *` | cada 10 minutos | cada 10 minutos |
| `zaltyko-owner-weekly-digest` | `7 * * * *` | cada hora a y 7; el correo sale el lunes a las 08:07 | cada hora a y 7; el correo sale el lunes a las 08:07 |
| `zaltyko-usage-at-risk` | `0 7 * * *` | 08:00 (invierno) · 09:00 (verano) | 01:00 |
| `zaltyko-family-payment-reminders` | `0 16 * * *` | 17:00 (invierno) · 18:00 (verano) | 10:00 |
| `zaltyko-lead-retention` | `15 3 * * *` | 04:15 (invierno) · 05:15 (verano) | 21:15 del día anterior |
| `zaltyko-cron-history-cleanup` | `30 3 * * 0` | domingo 04:30 / 05:30 | sábado 21:30 |

El resumen semanal se lanza cada hora, pero solo envía el lunes entre las 08:00
y las 11:59 en la hora de la sede, y una sola vez por persona y semana (clave de
deduplicación en `email_logs`). La limpieza borra el historial de ejecuciones de
más de 14 días.

## Crear el secreto en Vault (una vez, o al montarlo en otro proyecto)

Desde el editor SQL de Supabase, con el **mismo valor** que `CRON_SECRET` en
Vercel producción. El valor no se escribe nunca en el repositorio, en un
informe ni en un mensaje.

```sql
select vault.create_secret('<valor de CRON_SECRET>', 'zaltyko_cron_secret', 'CRON_SECRET de zaltyko.com para pg_cron');
```

Requisitos previos: extensiones `pg_cron` y `pg_net` activadas (Database →
Extensions). Después se ejecuta `20261115_pg_cron_avisos.sql`.

Este archivo describe producción: `call_cron` tiene la URL de zaltyko.com
fija. Para staging no se toca `call_cron`; se usa una función propia (ver
«Cobro automático de cuotas» más abajo).

## Ver las ejecuciones

Trabajos programados:

```sql
select jobid, jobname, schedule, active
from cron.job
where jobname like 'zaltyko-%'
order by jobname;
```

Últimas ejecuciones de pg_cron. «succeeded» solo significa que la petición se
puso en cola; la respuesta de la ruta está en `net._http_response`:

```sql
select j.jobname, d.status, d.return_message, d.start_time, d.end_time
from cron.job_run_details d
join cron.job j using (jobid)
where j.jobname like 'zaltyko-%'
order by d.start_time desc
limit 50;
```

Respuestas de zaltyko.com (pg_net las guarda unas horas). Cualquier cosa que no
sea 200 merece mirarse: 401 es un secreto distinto en Vault y en Vercel; 503
`CRON_NOT_CONFIGURED`, que falta `CRON_SECRET` en Vercel.

```sql
select id, status_code, timed_out, error_msg, created, left(content, 300) as content
from net._http_response
order by created desc
limit 50;
```

## Pausar o quitar un aviso

La forma más suave de parar un envío es apagar su bandera en Vercel: la ruta
sigue respondiendo y no envía nada. Para parar el disparo en la base:

```sql
-- Pausar (se puede reanudar con active := true)
select cron.alter_job(
  job_id := (select jobid from cron.job where jobname = 'zaltyko-coach-session-reminders'),
  active := false
);

-- Quitarlo del todo (para volver, reejecutar su línea de 20261115_pg_cron_avisos.sql)
select cron.unschedule('zaltyko-coach-session-reminders');
```

## Rotar el secreto

El secreto tiene que coincidir en Vercel y en Vault. Un deployment de Vercel
conserva el `CRON_SECRET` que tenía al construirse, así que el cambio en Vercel
no vale hasta republicar.

1. Generar un valor nuevo (al menos 32 caracteres, solo letras y números) y
   guardarlo en el gestor de secretos.
2. Vercel → proyecto → Settings → Environment Variables: cambiar `CRON_SECRET`
   en Production.
3. Republicar desde un checkout de `main`: `vercel deploy --prod`.
4. En cuanto el nuevo deployment esté «Current», cambiar Vault:

   ```sql
   select vault.update_secret(
     (select id from vault.secrets where name = 'zaltyko_cron_secret'),
     '<nuevo valor>'
   );
   ```

5. Comprobar en `net._http_response` que las siguientes llamadas devuelven 200.

Entre los pasos 3 y 4 las llamadas reciben 401 y no hacen nada; los avisos se
recuperan en el siguiente disparo (los de clase pueden perder alguno de esos
minutos). Hacer los dos cambios seguidos y fuera de la hora punta de clases.

## Cobro automático de cuotas (Fase 3, sin aplicar)

`candidates/collect-family-fees.sql` programa el trabajo
`zaltyko-collect-family-fees`, que llama a `/api/cron/collect-family-fees`.
**No está aplicado en ningún entorno.** Aplicarlo, en producción o en staging,
necesita la autorización expresa de Elvis, igual que la candidata de la base
de la Fase 3 y la bandera `ZALTYKO_FAMILY_AUTOMATIC_COLLECTION_ENABLED`.

| Trabajo (`cron.job.jobname`) | Expresión (UTC) | España (Madrid) | México (Ciudad de México) |
|---|---|---|---|
| `zaltyko-collect-family-fees` | `0 6 * * *` | 07:00 (invierno) · 08:00 (verano) | 00:00 |

Corre antes de los recordatorios de cuotas (16:00 UTC), así que el
recordatorio del día ya ve el resultado del cobro. La ruta exige el secreto,
toma el lease `cron:collect-family-fees` y responde solo contadores. Qué hace
según el entorno:

- clave de Stripe que no es de test, o base de producción: nada (cerrojos de la
  fase, en el código);
- sin las tablas del cobro: nada (`enabled: false`);
- bandera apagada: solo pone al día los cobros que quedaron a medias, para que
  lo que ya salió en Stripe quede registrado; nunca cobra nada nuevo
  (`enabled: false`);
- bandera encendida: además cobra lo que vence hoy.

La forma más suave de parar los cobros nuevos es apagar la bandera en Vercel.
Para parar también la puesta al día, quitar el trabajo:
`select cron.unschedule('zaltyko-collect-family-fees');`.

**Antes de quitar el trabajo, comprobar que no queda ningún intento abierto**
(sin la puesta al día, un cobro a medias no lo registra nadie). Consulta de
solo lectura; debe devolver cero filas:

```sql
-- Solo lectura. Intentos abiertos (reclamados, creados o en el banco).
select organization_id, invoice_id, id, status, resume_count, claimed_at, updated_at
  from zaltyko.family_collection_attempts
 where status in ('claimed', 'created', 'processing')
 order by updated_at;
```

Si queda alguno, dejar el trabajo hasta que la puesta al día lo cierre, o que
la academia use «Marcar como revisado» en `/owner/payments` (sin aviso, se
permite pasadas 24 h sin cambios; la acción lee el cobro en Stripe antes de
cerrarlo y, si el dinero salió, lo registra). Una domiciliación en el banco
(`processing`) hay que dejarla terminar.

### Producción

`candidates/collect-family-fees.sql` usa `zaltyko_scheduler.call_cron`, que
tiene fija la URL de producción (`20261115_pg_cron_avisos.sql`, línea 23:
`'https://zaltyko.com/api/cron/' || route`). Antes de programar comprueba que
la función existe. Ese archivo es solo para la base de producción.

### Staging

Staging es otro proyecto de Supabase, con su propio Vault y su propio
`CRON_SECRET`. No se reutiliza `call_cron` ni se cambia su URL: si en la base
de staging existiera una copia de `20261115_pg_cron_avisos.sql`, llamaría a
zaltyko.com. Se crea, **solo en la base de staging**, una función propia con
la URL de staging fija y se programa con ella. Nada de esto toca producción.

```sql
-- SOLO en la base de staging y con la autorización de Elvis.
-- Antes: vault.create_secret con el CRON_SECRET de staging (nunca el de
-- producción) con el nombre zaltyko_cron_secret.
begin;
create schema if not exists zaltyko_scheduler;
revoke all on schema zaltyko_scheduler from public, anon, authenticated;
create or replace function zaltyko_scheduler.call_cron_staging(route text)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
declare
  secret text;
begin
  if route !~ '^[a-z-]+$' then
    raise exception 'ruta de aviso no válida: %', route;
  end if;
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'zaltyko_cron_secret';
  if secret is null then
    raise exception 'falta el secreto zaltyko_cron_secret en Vault';
  end if;
  return net.http_post(
    url := 'https://staging.zaltyko.com/api/cron/' || route,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || secret),
    timeout_milliseconds := 300000
  );
end;
$fn$;
revoke all on function zaltyko_scheduler.call_cron_staging(text) from public, anon, authenticated;
select cron.schedule('zaltyko-collect-family-fees', '0 6 * * *', $$select zaltyko_scheduler.call_cron_staging('collect-family-fees')$$);
commit;
```

Para una prueba puntual en staging no hace falta programar nada: basta con
`select zaltyko_scheduler.call_cron_staging('collect-family-fees');` y mirar
la respuesta en `net._http_response`. Un 401 puede ser un secreto distinto en
Vault y en Vercel, o la protección de despliegues de Vercel delante de
staging. Vuelta atrás en staging, después de la misma comprobación de
intentos abiertos:
`select cron.unschedule('zaltyko-collect-family-fees');` y
`drop function if exists zaltyko_scheduler.call_cron_staging(text);`.

## Conservación de los avisos sobre contenido (sin aplicar)

`candidates/content-notices-retention.sql` programa el trabajo
`zaltyko-content-notices-retention`, que llama a
`/api/cron/content-notices-retention` (ADR-0029 §8.2). **No está aplicado en
ningún entorno** y aplicarlo necesita la autorización expresa de Elvis.

| Trabajo (`cron.job.jobname`) | Expresión (UTC) | España (Madrid) | México (Ciudad de México) |
|---|---|---|---|
| `zaltyko-content-notices-retention` | `15 3 * * *` | 04:15 (invierno) · 05:15 (verano) | 21:15 del día anterior |

La ruta exige el secreto, toma el lease `cron:content-notices-retention` y
borra nombre y correo de quien avisó en los avisos cerrados hace más de 730
días, por lotes de 100. Sin la tabla de avisos responde `enabled: false` y no
hace nada. En staging se programa con `call_cron_staging` y el mismo nombre de
ruta.

## Conservación de solicitudes de contacto (sin aplicar)

`candidates/lead-retention.sql` programa el trabajo
`zaltyko-lead-retention`, que llama a `/api/cron/lead-retention`. **No está
aplicado en ningún entorno** y aplicarlo necesita autorización expresa de Elvis.

La ruta conserva un lead si tiene `tenant_id` o `academy_id`, si alguna fila
vinculada de `academy_trials` tiene `converted_at`, o si un resultado enlazado
de `lead_trial_outcomes` tiene `outcome = 'converted'` tras normalizar espacios
y mayúsculas. El plazo se cuenta desde la actividad más reciente de `leads`,
`lead_interactions`, pruebas y resultados vinculados, entrevistas comerciales
y pruebas de academia; deben haber pasado seis meses completos.

Por lote transaccional, borra hasta 100 leads no convertidos y sus
`lead_interactions`, pruebas de prospecto, resultados y entrevistas asociadas.
Desvincula de `academy_trials` las pruebas no convertidas. Borra de
`growth_events` y `email_logs` solo filas vinculadas por el `submission_id`
exacto de la interacción: claves de idempotencia `contact:<submission_id>`,
`directory:demo:<submission_id>` y
`email:public-contact-lead:<submission_id>`. No toca eventos o correos sin esa
referencia. Cada ejecución procesa como máximo 50 lotes, usa el lease
`cron:lead-retention` y devuelve/registra solo recuentos; los lotes restantes
se procesan en la siguiente ejecución diaria. En staging se programa con
`call_cron_staging` y la misma ruta.

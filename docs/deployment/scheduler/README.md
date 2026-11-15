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

Para staging habría que cambiar la URL de `call_cron` (`https://staging.zaltyko.com`)
y usar el `CRON_SECRET` de staging; este archivo describe producción.

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

# Base de datos y Named Connection Pools

Este proyecto utiliza Supabase Postgres con dos URLs distintas:

- `DATABASE_URL_POOL`: conexión a un **Named Connection Pool (NCP)** para ejecución normal (API, SSR, edge).
- `DATABASE_URL_DIRECT`: conexión directa a la base de datos, reservada para tareas administrativas (migraciones, seeds, scripts).

## Configuración

1. Crea un pool en Supabase Dashboard → Database → Named Connection Pools.
2. Copia la URL del pool (formato `postgresql://...`) y asígnala a `DATABASE_URL_POOL` en `.env.local` y variables del deploy.
3. La URL tradicional de la DB mantenla en `DATABASE_URL_DIRECT`.

```
DATABASE_URL_POOL=postgresql://...pool
DATABASE_URL_DIRECT=postgresql://...direct
```

## Uso en código

En `src/db/index.ts` seleccionamos la URL según el entorno:

- Producción (`NODE_ENV=production`) → usa el pool.
- Desarrollo/test → usa la conexión directa para minimizar latencia en migraciones y seeds.

```ts
const connectionString = isProduction
  ? (process.env.DATABASE_URL_POOL ?? process.env.DATABASE_URL)
  : (process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL);
```

Además, el `Pool` de `pg` se instancia una sola vez, evitando abrir conexiones por request (compatible con Vercel serverless/edge).

## Migraciones y Seeds

`pnpm db:migrate` usa `drizzle-kit push` y está limitado por código a PostgreSQL local. No debe usarse contra Supabase remoto: Drizzle no representa todo el historial de RLS/policies y puede proponer desactivarlas o reconstruir el ledger.

Para staging o producción, crear y revisar un SQL versionado en `supabase/migrations/`. Antes de escribir, comprobar que el historial remoto coincide exactamente con los archivos:

```bash
pnpm db:migrate:ledger
```

Si el dry-run lista solo la migración revisada, aplicarla de forma transaccional y volver a verificar:

```bash
pnpm db:migrate:ledger --apply
pnpm db:migrate:ledger
```

El ledger `public.zaltyko_schema_migrations` usa el nombre completo del archivo como identidad (el legado tiene dos `0009_*`) y guarda el hash SHA-256. Un hash modificado o una fila sin archivo bloquean la operación; no se repara el historial de forma implícita. `pnpm db:migrate:reviewed <sql>` queda reservado para el bootstrap del ledger o una operación break-glass revisada. Verificar después constraints, RLS y `pnpm check:migrations`. `pnpm db:seed` tampoco se ejecuta en producción salvo revisión explícita de sus efectos.

### Reaplicar políticas RLS

Tras modificar `supabase/rls.sql`, vuelve a cargar las políticas en la instancia:

```bash
pnpm exec supabase db push --file supabase/rls.sql
```

Si trabajas con una base de datos remota (`supabase db remote commit`), usa:

```bash
pnpm exec supabase db execute --db-url "$DATABASE_URL_DIRECT" --file supabase/rls.sql
```

> Asegúrate de ejecutar las migraciones (`drizzle/0004_roles_guardians.sql` y siguientes) antes de aplicar RLS para evitar referencias a tablas inexistentes.

## Añadir nuevos NCPs

1. Desde Supabase crea un nuevo pool con el tamaño deseado.
2. Añade la URL a tus variables (`DATABASE_URL_POOL_READONLY`, etc.).
3. En el proyecto, amplía `src/db/index.ts` con la lógica correspondiente, por ejemplo para lecturas pesadas.
4. Actualiza esta documentación con el propósito de cada pool.

> Recuerda: los pools tienen límites de conexiones (e.g. 20). Ajusta `max` en `new Pool()` si necesitas respetar ese límite en producción.

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
  ? process.env.DATABASE_URL_POOL ?? process.env.DATABASE_URL
  : process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
```

Además, el `Pool` de `pg` se instancia una sola vez, evitando abrir conexiones por request (compatible con Vercel serverless/edge).

## Migraciones y Seeds

Las tareas administrativas (`pnpm db:migrate`, `pnpm db:seed`, scripts en `/scripts`) se ejecutan desde el mismo proyecto en desarrollo, por lo que se apoyan en `DATABASE_URL_DIRECT`. En entornos CI/CD asegúrate de exponer esta variable para el paso de migración.

## Añadir nuevos NCPs

1. Desde Supabase crea un nuevo pool con el tamaño deseado.
2. Añade la URL a tus variables (`DATABASE_URL_POOL_READONLY`, etc.).
3. En el proyecto, amplía `src/db/index.ts` con la lógica correspondiente, por ejemplo para lecturas pesadas.
4. Actualiza esta documentación con el propósito de cada pool.

> Recuerda: los pools tienen límites de conexiones (e.g. 20). Ajusta `max` en `new Pool()` si necesitas respetar ese límite en producción.


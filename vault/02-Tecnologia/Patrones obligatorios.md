---
status: active
owner: tech
last_reviewed: 2026-06-24
source:
  - ../AGENTS.md
  - ../src/lib/authz.ts
  - ../src/lib/api-response.ts
  - ../.eslintrc.json
---
# Patrones obligatorios

## ESLint config

Usar `.eslintrc.json` legacy (NO `eslint.config.mjs` flat config) mientras
el proyecto use ESLint v8. Next.js 15.5 pasa opciones legacy (`--useEslintrc`,
`--extensions`) que ESLint v8 rechaza cuando detecta flat config, rompiendo
el build con `Invalid Options`. Ver [[Runbook deploy#Pitfalls]] para detalle.

## APIs de tenant

```ts
import { withTenant } from '@/lib/authz';

export const POST = withTenant(async (request: Request) => {
  // ...
});
```

No crear APIs de tenant como funciones exportadas sin wrapper.

## Respuestas API

```ts
import { apiSuccess, apiCreated, apiError } from '@/lib/api-response';

return apiSuccess({ items }, { total, page, pageSize });
return apiCreated({ id: newId });
return apiError('ERROR_CODE', 'Mensaje legible', 400);
```

No devolver `NextResponse.json({ ok: true })` a mano cuando existe helper estandarizado.

## Componentes

- Usar patrones existentes del modulo antes de crear abstracciones nuevas.
- Memoizar cards repetidas cuando aplique.
- Mantener componentes UI dentro de convenciones shadcn/Tailwind.

## Seguridad

- No imprimir secretos en logs.
- No documentar valores reales de entorno.
- Verificar RLS cuando se cambia schema o acceso a datos.
- Rate limiting para endpoints expuestos cuando aplique.

## Documentacion

Cada cambio relevante debe actualizar la nota correspondiente en esta vault. Si no aplica, indicarlo al cerrar el trabajo.

## Prerender / build

En paginas con `generateStaticParams` + `generateMetadata` que indexan datos
por clave/slug, validar con `pnpm build` local (NO solo `pnpm dev`) porque
el dev server silencia errores de prerender con error boundary client-side.
Usar siempre las claves internas (`modalityKey`, `countryKey`) en lugar de
los slugs traducidos (`modality`, `country`) al indexar catalogos.

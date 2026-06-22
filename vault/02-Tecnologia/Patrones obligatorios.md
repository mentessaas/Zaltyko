---
status: active
owner: tech
last_reviewed: 2026-06-22
source:
  - ../AGENTS.md
  - ../src/lib/authz.ts
  - ../src/lib/api-response.ts
---
# Patrones obligatorios

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

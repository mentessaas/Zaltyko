# Zaltyko - Sports Academy Management

## Stack

- **Framework:** Next.js 14 (App Router)
- **Database:** Supabase (PostgreSQL)
- **ORM:** Drizzle ORM
- **Styling:** Tailwind CSS + shadcn/ui
- **Auth:** Supabase Auth
- **Deployment:** Vercel

## Estructura del Proyecto

```
src/
├── app/                    # Next.js App Router
│   ├── app/               # Rutas de academias (/app/[academyId]/...)
│   ├── dashboard/         # Dashboard general
│   ├── api/               # API routes
│   └── (super-admin)/    # Rutas de super admin
├── components/            # Componentes React
│   ├── athletes/         # Componentes de atletas
│   ├── ui/               # Componentes shadcn/ui
│   └── ...
├── db/                   # Schema de base de datos
│   └── schema/           # Tablas Drizzle
├── hooks/                # Custom React hooks
├── lib/                  # Utilidades y servicios
└── types/                # TypeScript types
```

## Scripts

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Iniciar servidor de desarrollo |
| `npm run build` | Build para producción |
| `npm run start` | Iniciar servidor de producción |
| `npm run db:push` | Sincronizar schema con Supabase |
| `npm run db:studio` | Abrir Drizzle Studio |

## Convenciones de Código

- **Componentes:** Functional components con TypeScript
- **Estilos:** Tailwind CSS con clases de shadcn/ui
- **Estado:** React hooks (useState, useEffect)
- **Fetching:** Server components para data fetching, client components para interactividad
- **Forms:** Controlled inputs con validación

## Workflow de Desarrollo

1. **Desarrollo local:** `npm run dev`
2. **Probar cambios**
3. **Commit:** `git add . && git commit -m "description"`
4. **Push:** `git push origin main`
5. **Verificar Vercel**

## Página Actual: Atletas

**Ubicación:** `src/app/dashboard/athletes/page.tsx`

**Estado actual:**
- Stats cards (Total, Activos, Prueba, Inactivos)
- Distribución por nivel
- Búsqueda por nombre
- Filtros (estado, nivel, academia, edad)
- Tabla con paginación

**Pendiente:** Mejorar UX/UI

## Skills Recomendados

Usa las skills personalizadas para este proyecto:
- `local-dev-verification` - Para verificar antes de commit
- `frontend-iterative` - Para desarrollo iterativo de UI
- `api-integration` - Para integrate API calls
- `react-component-structure` - Para estructura de componentes
- `responsive-design` - Para diseño responsive

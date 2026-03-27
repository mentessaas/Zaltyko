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
│   ├── (super-admin)/    # Rutas de super admin
│   ├── (site)/           # Landing pages públicas
│   │   ├── [locale]/     # i18n (es, en)
│   │   │   ├── [modality]/  # Modalidades (gimnasia-artistica, etc)
│   │   │   │   └── [country]/  # Países (espana, mexico, etc)
│   │   └── home/         # Landing principal
│   └── llms.txt/         # AI crawler compatibility
├── components/
│   ├── athletes/         # Componentes de atletas
│   ├── landing/          # Componentes de landing
│   ├── profiles/         # Perfiles (Owner, Coach, Athlete, Parent)
│   ├── ui/               # Componentes shadcn/ui
│   └── dashboard/        # Widgets de dashboard
├── content/              # Contenido estructurado (clusters JSON)
│   └── clusters/         # Contenido SEO por locale/país/modalidad
├── db/
│   ├── schema/           # Tablas Drizzle
│   └── seeds/templates/  # Seeds por país/federación
├── hooks/                # Custom React hooks
├── lib/                  # Utilidades y servicios
│   └── seo/              # Utilidades SEO/GEO (clusters.ts)
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

## Features Implementadas

### Módulos Principales
- **Atletas:** Perfiles, evaluaciones, historial, guardianes, progreso
- **Eventos:** Inscripciones, waitlist, categorías, estados
- **Clases/Grupos:** Calendario, asistencia, ocupación, políticas cancelación
- **Coach Dashboard:** Vista khusus para entrenadores
- **Facturación:** Planes, descuentos, scholarships, campañas
- **Super Admin:** Gestión centralizada de academias y usuarios

### SEO/GEO (Generative Engine Optimization)
- Rutas clusterizadas: `/es/gimnasia-artistica/espana`
- Contenido JSON en `src/content/clusters/`
- Schema markup (Organization, HowTo, FAQPage)
- `robots.txt` con AI crawlers permitidos (GPTBot, ClaudeBot, PerplexityBot)
- `llms.txt` para AI crawler compatibility
- Sitemap expandido con clusters

### APIs
- `/api/assessments` - Evaluaciones con paginación
- `/api/athletes` - Atletas con validación
- `/api/events/[id]/registrations` - Inscripciones con filtros
- `/api/guardians` - Gestión de guardianes

## Pendiente

- Testing coverage
- Mejora tipos TypeScript
- Implementación completa landing clusters
- Integración traducciones i18n

## Skills Recomendados

Usa las skills personalizadas para este proyecto:
- `local-dev-verification` - Para verificar antes de commit
- `frontend-iterative` - Para desarrollo iterativo de UI
- `api-integration` - Para integrar API calls
- `react-component-structure` - Para estructura de componentes
- `responsive-design` - Para diseño responsive

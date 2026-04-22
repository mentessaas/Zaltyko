# Zaltyko SaaS - Plataforma de Gestión para Academias de Gimnasia

![Status](https://img.shields.io/badge/Status-Hardening-yellow) ![Tech](https://img.shields.io/badge/Stack-Next.js_15_|_Supabase_|_Stripe-blue) ![License](https://img.shields.io/badge/License-Private-red)

**Zaltyko** es una plataforma SaaS multi-tenant para gestionar academias de gimnasia. Construida con Next.js 15, Supabase (PostgreSQL + RLS), y Stripe.

---

## Quick Start

```bash
# 1. Clonar
git clone https://github.com/mentessaas/Zaltyko.git
cd Zaltyko

# 2. Instalar
pnpm install

# 3. Configurar entorno
cp .env.example .env.local
# Editar .env.local con tus credenciales

# 4. Base de datos
pnpm db:generate
pnpm db:migrate
pnpm db:seed

# 5. Ejecutar
pnpm dev
```

Visita `http://localhost:3000`

---

## Stack Tecnológico

| Capa | Tecnología |
|------|------------|
| Frontend | Next.js 15 (App Router), Tailwind CSS, shadcn/ui |
| Backend | Next.js API Routes, Drizzle ORM |
| Database | Supabase PostgreSQL + Row Level Security (RLS) |
| Auth | NextAuth.js v5 (Supabase) |
| Payments | Stripe (Subscriptions, One-time) |
| Infrastructure | Vercel (Frontend), Supabase (DB) |

---

## Módulos Principales

| Módulo | Descripción | Status |
|--------|-------------|--------|
| **Athletes** | Perfiles, evaluaciones, documentos, historial | ✅ |
| **Classes** | Grupos, calendario, asistencia, sesiones | ✅ |
| **Events** | Competiciones, inscripciones, waitlist | ✅ |
| **Coaches** | Gestión de entrenadores, asignaciones | ✅ |
| **Billing** | Planes, facturas, descuentos, scholarships | ✅ |
| **Super Admin** | Gestión centralizada de academias | ✅ |
| **Landing Pages** | SEO clusterizado por modalidad/país | ✅ |

---

## Arquitectura

```
src/
├── app/                    # Next.js App Router
│   ├── app/               # Dashboard de academias (/app/[academyId]/...)
│   ├── api/               # API Routes (protegidas con withTenant)
│   ├── (site)/           # Landing pages públicas
│   └── (super-admin)/    # Panel Super Admin
├── components/
│   ├── ui/               # Componentes shadcn/ui base
│   ├── athletes/         # Componentes módulo atletas
│   ├── classes/          # Componentes módulo clases
│   ├── events/           # Componentes módulo eventos
│   ├── billing/          # Componentes módulo facturación
│   └── landing/          # Componentes landing pages
├── db/
│   └── schema/           # 68+ tablas Drizzle ORM
├── lib/
│   ├── authz.ts         # Wrapper de autenticación multi-tenant
│   ├── api-response.ts   # Respuestas API estandarizadas
│   └── seo/clusters.ts  # Utilidades SEO clusterizado
└── types/                # Tipos TypeScript centralizados
```

---

## Scripts Disponibles

```bash
pnpm dev              # Desarrollo local
pnpm build            # Build producción
pnpm start            # Iniciar producción
pnpm db:generate      # Generar migraciones Drizzle
pnpm db:migrate       # Aplicar migraciones
pnpm db:seed          # Poblar datos iniciales
pnpm lint             # Linting ESLint
pnpm typecheck        # Verificación TypeScript
pnpm test             # Ejecutar tests
```

---

## Seguridad

- **Multi-Tenancy**: Aislamiento via RLS de PostgreSQL
- **Auth**: NextAuth.js con JWT, `withTenant` wrapper obligatorio
- **Rate Limiting**: Vercel KV (Redis) con límites por ruta
- **Input Validation**: Zod schemas en todas las APIs
- **Webhook Security**: Firma verificable en Stripe/LemonSqueezy

---

## Documentación Detallada

| Documento | Descripción |
|-----------|-------------|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Arquitectura técnica profunda |
| [API.md](docs/API.md) | Referencia de APIs |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | Guía de deploy a producción |
| [DEVELOPMENT.md](docs/development-guide.md) | Guía para desarrolladores |
| [PRODUCTION_CHECKLIST.md](docs/PRODUCTION_CHECKLIST.md) | Checklist pre-lanzamiento |

---

## Variables de Entorno

```env
# Supabase (requerido)
DATABASE_URL=postgresql://...
NEXT_PUBLIC_SUPABASE_URL=https://...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

# Stripe (requerido para producción)
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...

# NextAuth
NEXTAUTH_SECRET=...
```

Ver `.env.example` para plantilla completa.

---

## Licencia

Proprietario - Todos los derechos reservados. MentesSaaS.

---

##Contacto

- **GitHub**: https://github.com/mentessaas/Zaltyko
- **Issues**: https://github.com/mentessaas/Zaltyko/issues

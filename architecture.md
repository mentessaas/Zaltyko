# Arquitectura del Sistema – Zaltyko SaaS

Este documento describe la arquitectura técnica implementada en **Zaltyko SaaS**. El sistema sigue una arquitectura monolítica modular basada en Next.js, diseñada para la escalabilidad horizontal y el aislamiento estricto de datos (Multi-tenancy).

## 🏗️ Diagrama de Alto Nivel

```mermaid
graph TD
    User[Cliente / Navegador] -->|HTTPS| CDN[Vercel Edge Network]
    CDN -->|Next.js App Router| Server[Servidor Next.js]
    
    subgraph "Capa de Aplicación"
        Server -->|Auth| NextAuth[NextAuth v5]
        Server -->|ORM| Drizzle[Drizzle ORM]
        Server -->|Pagos| StripeSDK[Stripe SDK]
    end
    
    subgraph "Capa de Datos (Supabase)"
        Drizzle -->|Conexión Pooling| Postgres[(PostgreSQL DB)]
        Postgres -->|RLS Policies| TenantData[Datos Aislados por Tenant]
        Postgres -->|Auth| SupabaseAuth[Supabase Auth]
    end
    
    subgraph "Servicios Externos"
        StripeSDK <-->|Webhooks| StripeAPI[Stripe API]
        Server -->|Emails| Mailgun[Mailgun API]
    end
```

## 🔐 Modelo de Multi-Tenancy (Aislamiento)

El núcleo de la seguridad de Zaltyko es el aislamiento de datos. No utilizamos bases de datos separadas por cliente, sino un modelo de **Discriminador de Columna** reforzado por **Row Level Security (RLS)**.

1.  **Identificación**: Cada petición HTTP identifica el `tenant_id` (Academia) basándose en la URL (`/app/[academyId]/...`) o el usuario autenticado.
2.  **Base de Datos**: Todas las tablas sensibles (`athletes`, `classes`, `payments`) tienen una columna `tenant_id`.
3.  **RLS (Postgres)**: Políticas de seguridad en la base de datos impiden físicamente que una consulta retorne datos de otro `tenant_id`, incluso si la aplicación falla en filtrar.

## 🧩 Componentes Principales

### 1. Autenticación y Autorización (`src/lib/authz.ts`)
- **Autenticación**: Manejada por NextAuth.js sincronizado con usuarios de Supabase.
- **Autorización**: Sistema de permisos basado en roles (`owner`, `admin`, `coach`, `athlete`).
- **Middleware**: Intercepta rutas protegidas y valida la sesión antes de renderizar.

### 2. Motor de Facturación (`src/lib/billing`, `src/lib/limits.ts`)
- **Suscripciones**: Sincronización bidireccional con Stripe.
- **Límites**: Lógica de negocio ("Hard Limits") que impide crear recursos (ej. más de 50 atletas) si el plan actual no lo permite.
- **Webhooks**: Procesamiento asíncrono de eventos de pago (`invoice.paid`, `customer.subscription.updated`).

### 3. Gestión de Datos (`src/db`)
- **Schema**: Definido en TypeScript usando Drizzle ORM.
- **Migraciones**: Gestionadas automáticamente para mantener la consistencia de la BD.

## 🔄 Flujos Críticos

### Onboarding de Nueva Academia
1.  Usuario se registra.
2.  Crea una organización (Academia).
3.  El sistema asigna automáticamente el plan `FREE`.
4.  Se inicializan registros base y se redirige al Dashboard.

### Upgrade de Plan
1.  Usuario selecciona Plan Pro en UI.
2.  Se genera sesión de Stripe Checkout.
3.  Usuario paga en Stripe.
4.  Webhook recibe confirmación -> Actualiza `subscriptions` en BD -> Desbloquea límites inmediatamente.

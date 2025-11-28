# Zaltyko SaaS – Plataforma de Gestión para Academias de Gimnasia

**Zaltyko SaaS** es una solución tecnológica integral diseñada para modernizar y simplificar la gestión de academias de gimnasia (artística, rítmica, trampolín, etc.). Construida con una arquitectura **multi-tenant** robusta, permite a cada academia operar en un entorno seguro y aislado, mientras escala desde pequeños clubes hasta grandes instituciones.

![Status](https://img.shields.io/badge/Status-Beta_Ready-green) ![Tech](https://img.shields.io/badge/Stack-Next.js_14_|_Supabase_|_Stripe-blue)

## 🚀 Características Principales

### 🏢 Gestión Multi-Academia (Multi-Tenancy)
- **Aislamiento Total**: Cada academia tiene sus propios datos, atletas y configuraciones, garantizado por Row Level Security (RLS) a nivel de base de datos.
- **Roles y Permisos**: Sistema granular con roles de Dueño, Entrenador, Atleta y Administrador.

### 👥 Gestión Deportiva
- **Atletas**: Perfiles completos, historial médico, niveles de habilidad y evaluaciones.
- **Clases y Asistencia**: Programación flexible de sesiones, control de aforo y registro de asistencia en tiempo real.
- **Entrenadores**: Gestión de staff, asignación a clases y control de horarios.

### 💳 Facturación y Suscripciones
- **Integración con Stripe**: Pagos seguros y automatizados.
- **Planes Flexibles**: Soporte para modelos Freemium, Pro y Premium con límites automáticos de recursos (atletas/clases).
- **Portal de Cliente**: Autogestión de métodos de pago y facturas.

### 🛠️ Herramientas Administrativas
- **Onboarding Automatizado**: Flujo guiado para configurar nuevas academias en minutos.
- **Panel Súper Admin**: Vista global para la administración de la plataforma SaaS.
- **Notificaciones**: Sistema de emails transaccionales (invitaciones, alertas de pago).

## 🛠️ Stack Tecnológico

La plataforma está construida sobre tecnologías modernas, priorizando rendimiento, seguridad y escalabilidad:

- **Frontend**: [Next.js 14](https://nextjs.org/) (App Router), [Tailwind CSS](https://tailwindcss.com/), [shadcn/ui](https://ui.shadcn.com/).
- **Backend**: Server Actions, [Drizzle ORM](https://orm.drizzle.team/).
- **Base de Datos**: [Supabase](https://supabase.com/) (PostgreSQL) con RLS.
- **Auth**: [NextAuth.js](https://next-auth.js.org/) (v5).
- **Pagos**: [Stripe](https://stripe.com/).
- **Infraestructura**: Vercel (Frontend/Edge), Supabase (DB).

## 🌱 Primeros Pasos (Desarrollo Local)

Sigue estos pasos para levantar el entorno de desarrollo:

1.  **Requisitos Previos**: Node.js 20+, pnpm, Docker (opcional, para DB local).

2.  **Instalación**:
    ```bash
    git clone <repo-url>
    cd zaltyko-saas
    pnpm install
    ```

3.  **Configuración de Entorno**:
    Copia el archivo de ejemplo y configura tus claves (Supabase, Stripe, NextAuth):
    ```bash
    cp .env.example .env.local
    ```

4.  **Base de Datos**:
    ```bash
    pnpm db:generate   # Generar esquemas SQL
    pnpm db:migrate    # Aplicar migraciones
    pnpm db:seed       # Poblar datos iniciales (Planes, Admin)
    ```

5.  **Ejecutar**:
    ```bash
    pnpm dev
    ```
    Visita `http://localhost:3000`.

## 🧪 Testing

El proyecto cuenta con una suite de tests robusta usando **Vitest**, incluyendo pruebas de aislamiento de datos entre tenants.

```bash
pnpm test        # Ejecutar todos los tests
pnpm test:ui     # Abrir interfaz gráfica de tests
```

## 📄 Licencia

Este proyecto es propiedad privada. Todos los derechos reservados.

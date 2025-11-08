# Gym SaaS – Multi-academia de gimnasia

Base tecnológica: Next.js 14 (App Router) + Drizzle ORM + Supabase + NextAuth + Stripe + Tailwind/shadcn.

Este repositorio toma ShipFree como plantilla técnica y lo transforma en un SaaS multi-tenant para academias de gimnasia: cada academia se aísla por `tenant_id`, los planes Free/Pro/Premium controlan límites de atletas y existe un panel global de Súper Admin.

## 🌱 Primeros pasos

1. **Instala dependencias**

   ```bash
   pnpm install
   ```

2. **Configura variables de entorno**

   Copia `.env.example` → `.env.local` y rellena:

   - `DATABASE_URL` (Postgres/Supabase)
   - `NEXTAUTH_*`
   - `SUPABASE_*`
   - `STRIPE_*`
   - `MAILGUN_*` (opcional, puede quedarse vacío por ahora)

3. **Genera/actualiza la base de datos**

   Asegúrate de que tu instancia de Postgres/Supabase esté **encendida** (por ejemplo, `npx supabase start` o tu cluster remoto). Luego ejecuta:

   ```bash
   pnpm db:generate   # opcional: inspeccionar SQL generado
   pnpm db:migrate    # aplica la migración 0001_init.sql y posteriores
   pnpm db:seed       # inserta planes (free/pro/premium) y el perfil admin
   ```

   > ℹ️ Puedes sobreescribir los `stripe_price_id` de los planes pagados usando
   > las variables `SEED_STRIPE_PRICE_PRO` y `SEED_STRIPE_PRICE_PREMIUM` al ejecutar el seed.

4. **Aplica RLS en Supabase**

   Abre `supabase/rls.sql` y ejecútalo en el SQL editor de tu proyecto Supabase. Activa las políticas por tenant y las funciones helper (`get_current_tenant`, `is_admin`, etc.).

5. **Ejecuta pruebas rápidas**

   ```bash
   pnpm test -- --run
   ```

   Incluye aislamiento por tenant y evaluaciones de límites básicos.

6. **Levanta el entorno de desarrollo**

   ```bash
   pnpm dev
   ```

   La app queda disponible en `http://localhost:3000`.

7. **Activa la sesión demo (sin llaves reales)**

   - Desde la portada pulsa “Crear academia demo” o visita `http://localhost:3000/api/dev/session` (POST) para generar usuario, academia y datos ficticios.
   - El `DevSessionProvider` guarda esta información en `localStorage`; los fetch del frontend envían el header `x-user-id` automáticamente.
   - Abre `http://localhost:3000/app` para saltar directo al dashboard de la academia demo.

## 📁 Scripts disponibles

| Script           | Descripción                                              |
| ---------------- | -------------------------------------------------------- |
| `pnpm dev`       | Arranca Next.js en modo desarrollo                       |
| `pnpm build`     | Compila la aplicación                                    |
| `pnpm start`     | Ejecuta el build en modo producción                      |
| `pnpm db:generate` | Genera SQL desde los schemas Drizzle (solo inspección)    |
| `pnpm db:migrate`  | Aplica las migraciones a la base de datos                 |
| `pnpm db:seed`     | Inserta planes y el perfil admin                          |
| `pnpm test`        | Ejecuta los tests de Vitest                              |

## 📦 Módulos implementados en este bloque

- **Esquema Drizzle** dividido por dominio (`src/db/schema/**`).
- **Migración inicial** (`drizzle/0001_init.sql`) con índices multi-tenant.
- **Seeds** (`scripts/seed.ts`) que crean planes y el perfil Súper Admin.
- **Políticas RLS** (`supabase/rls.sql`) con bypass para `admin`.
- **Helpers de autorización** (`src/lib/authz.ts`) con `getCurrentProfile`, `getTenantId`, `withTenant`.
- **Pruebas de aislamiento** (`tests/tenancy.test.ts`).

## ➡️ Qué sigue

1. Límites por plan + Stripe checkout/webhooks + onboarding wizard.
2. CRUDs completos y dashboards (Academia / Súper Admin).
3. Emails automáticos, eventos externos y módulos extra.

---

Cualquier contribución o feedback es bienvenido. ¡Vamos construyendo la plataforma paso a paso! 💪🤸‍♀️

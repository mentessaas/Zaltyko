# Estructura del Proyecto - Zaltyko

## Árbol de Directorios

```
zaltyko/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (public)/          # Páginas públicas (empleo, marketplace)
│   │   │   ├── empleo/
│   │   │   │   ├── [id]/
│   │   │   │   │   └── aplicar/
│   │   │   │   └── nuevo/
│   │   │   └── marketplace/
│   │   │       ├── [id]/
│   │   │       └── nuevo/
│   │   │
│   │   ├── (site)/            # Landing pages públicas
│   │   │   ├── home/
│   │   │   │   ├── HeroSection.tsx
│   │   │   │   ├── FeaturesSection.tsx
│   │   │   │   ├── ModulesSection.tsx
│   │   │   │   └── ... (15+ secciones)
│   │   │   ├── coaches/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [slug]/
│   │   │   ├── modules/
│   │   │   │   ├── clases-horarios/
│   │   │   │   ├── comunicacion/
│   │   │   │   ├── dashboard-reportes/
│   │   │   │   └── ... (6 módulos)
│   │   │   └── onboarding/
│   │   │       ├── athlete/
│   │   │       ├── coach/
│   │   │       └── parent/
│   │   │
│   │   ├── (super-admin)/     # Panel Super Admin
│   │   │   └── super-admin/
│   │   │       ├── academies/
│   │   │       │   ├── page.tsx
│   │   │       │   ├── [academyId]/
│   │   │       │   │   └── page.tsx
│   │   │       │   └── public/
│   │   │       ├── billing/
│   │   │       ├── dashboard/
│   │   │       ├── logs/
│   │   │       ├── settings/
│   │   │       ├── support/
│   │   │       └── users/
│   │   │
│   │   ├── app/               # Dashboard de Academia
│   │   │   └── [academyId]/
│   │   │       ├── athletes/
│   │   │       │   ├── page.tsx
│   │   │       │   ├── [athleteId]/
│   │   │       │   │   ├── assessments/
│   │   │       │   │   ├── documents/
│   │   │       │   │   ├── evaluate/
│   │   │       │   │   ├── guardians/
│   │   │       │   │   ├── history/
│   │   │       │   │   ├── notes/
│   │   │       │   │   └── progress/
│   │   │       │   └── new/
│   │   │       ├── billing/
│   │   │       │   ├── page.tsx
│   │   │       │   ├── campaigns/
│   │   │       │   ├── discounts/
│   │   │       │   ├── receipts/
│   │   │       │   └── scholarships/
│   │   │       ├── classes/
│   │   │       │   ├── page.tsx
│   │   │       │   ├── calendar/
│   │   │       │   ├── groups/
│   │   │       │   └── [classId]/edit/
│   │   │       ├── coaches/
│   │   │       ├── events/
│   │   │       │   ├── page.tsx
│   │   │       │   ├── new/
│   │   │       │   └── [eventId]/
│   │   │       │       ├── edit/
│   │   │       │       ├── invitations/
│   │   │       │       └── register/
│   │   │       ├── my-events/
│   │   │       └── settings/
│   │   │
│   │   ├── api/               # API Routes
│   │   │   ├── athletes/
│   │   │   │   ├── route.ts
│   │   │   │   └── [athleteId]/
│   │   │   │       ├── route.ts
│   │   │   │       ├── classes/
│   │   │   │       ├── documents/
│   │   │   │       ├── extra-classes/
│   │   │   │       ├── guardians/
│   │   │   │       └── history/
│   │   │   ├── classes/
│   │   │   ├── coaches/
│   │   │   ├── events/
│   │   │   │   ├── route.ts
│   │   │   │   ├── my-registrations/
│   │   │   │   └── [id]/
│   │   │   │       ├── categories/
│   │   │   │       ├── invitations/
│   │   │   │       ├── notify/
│   │   │   │       ├── payments/
│   │   │   │       ├── registrations/
│   │   │   │       ├── stats/
│   │   │   │       └── waitlist/
│   │   │   ├── billing/
│   │   │   ├── assessments/
│   │   │   ├── guardians/
│   │   │   ├── public/
│   │   │   │   ├── academies/
│   │   │   │   ├── clusters/
│   │   │   │   └── events/
│   │   │   ├── ai/           # AI endpoints (auth protected)
│   │   │   │   ├── attendance/
│   │   │   │   ├── billing/
│   │   │   │   └── communication/
│   │   │   ├── cron/         # Cron jobs
│   │   │   ├── mcp/           # MCP tools
│   │   │   ├── webhooks/
│   │   │   │   ├── lemon-squeezy/
│   │   │   │   └── stripe/
│   │   │   ├── metrics/      # (auth protected)
│   │   │   └── rate-limit-test/
│   │   │
│   │   ├── dashboard/
│   │   │   └── [academyId]/
│   │   ├── llms.txt/
│   │   └── pricing/
│   │
│   ├── components/
│   │   ├── ui/               # shadcn/ui base
│   │   │   ├── alert.tsx
│   │   │   ├── alert-dialog.tsx
│   │   │   ├── avatar.tsx
│   │   │   ├── badge.tsx
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── combobox.tsx    # NEW: searchable select
│   │   │   ├── data-table.tsx  # NEW: generic table
│   │   │   ├── date-picker.tsx  # NEW: date picker
│   │   │   ├── dialog.tsx
│   │   │   ├── dropdown-menu.tsx
│   │   │   ├── file-upload.tsx  # NEW: file upload
│   │   │   ├── input.tsx
│   │   │   ├── label.tsx
│   │   │   ├── modal.tsx
│   │   │   ├── page-header.tsx
│   │   │   ├── popover.tsx
│   │   │   ├── progress.tsx
│   │   │   ├── select.tsx
│   │   │   ├── skeleton.tsx
│   │   │   ├── skeletons/
│   │   │   ├── table.tsx
│   │   │   ├── tabs.tsx
│   │   │   └── toast-provider.tsx
│   │   │
│   │   ├── athletes/
│   │   │   ├── AthletesTableView.tsx
│   │   │   ├── CreateAthleteDialog.tsx
│   │   │   ├── AthleteDocumentsList.tsx
│   │   │   ├── AthleteDocumentsSection.tsx
│   │   │   ├── AthleteProfileHeader.tsx
│   │   │   ├── AthleteStatsOverview.tsx
│   │   │   ├── DocumentUploadModal.tsx
│   │   │   └── GuardianManager.tsx
│   │   │
│   │   ├── classes/
│   │   │   ├── ClassesTableView.tsx
│   │   │   ├── ClassesDashboard.tsx
│   │   │   ├── CreateClassDialog.tsx
│   │   │   ├── EditClassDialog.tsx
│   │   │   ├── EnrollmentManager.tsx
│   │   │   └── WaitingListDialog.tsx
│   │   │
│   │   ├── events/
│   │   │   ├── EventForm.tsx
│   │   │   ├── EventRegistrationsPanel.tsx
│   │   │   ├── EventsFilters.tsx      # NEW
│   │   │   ├── InvitationCard.tsx      # NEW
│   │   │   ├── RegistrationChart.tsx   # NEW
│   │   │   └── WaitlistPosition.tsx   # NEW
│   │   │
│   │   ├── billing/
│   │   │   ├── BillingPanel.tsx
│   │   │   ├── ChargesTable.tsx
│   │   │   ├── DiscountForm.tsx
│   │   │   ├── ScholarshipForm.tsx
│   │   │   └── ...
│   │   │
│   │   ├── landing/           # Landing page components
│   │   │   ├── AcademyCard.tsx        # NEW: memoized
│   │   │   ├── CoachCard.tsx         # NEW: memoized
│   │   │   ├── ClusterAcademiesSection.tsx
│   │   │   ├── ClusterCTASection.tsx
│   │   │   ├── ClusterCoachesSection.tsx
│   │   │   ├── ClusterEventsSection.tsx
│   │   │   ├── ClusterStatsSection.tsx
│   │   │   ├── ClusterDiscoverySection.tsx
│   │   │   ├── ComparisonSection.tsx
│   │   │   ├── DemoSection.tsx
│   │   │   ├── EventCard.tsx          # NEW: memoized
│   │   │   ├── FaqSection.tsx
│   │   │   ├── FinalCtaSection.tsx
│   │   │   ├── FooterSection.tsx
│   │   │   ├── HeroSection.tsx
│   │   │   ├── IntegrationsSection.tsx
│   │   │   ├── ModulesSection.tsx
│   │   │   ├── Navbar.tsx
│   │   │   ├── SeoExtendedSection.tsx
│   │   │   ├── SocialProofSection.tsx
│   │   │   ├── StickyCtaBar.tsx
│   │   │   ├── TestimonialsSection.tsx
│   │   │   └── WhyZaltykoSection.tsx
│   │   │
│   │   ├── profiles/          # User profile components
│   │   │   ├── ProfileContext.tsx
│   │   │   ├── CoachProfile.tsx
│   │   │   ├── AthleteProfile.tsx
│   │   │   └── ParentProfile.tsx
│   │   │
│   │   ├── dashboard/         # Dashboard widgets
│   │   └── reports/
│   │       └── useReportData.ts       # NEW: shared hook
│   │
│   ├── db/
│   │   ├── schema/           # 68+ tablas Drizzle
│   │   │   ├── athletes.ts
│   │   │   ├── classes.ts
│   │   │   ├── coaches.ts
│   │   │   ├── events.ts
│   │   │   ├── academies.ts
│   │   │   ├── billing/
│   │   │   │   ├── subscriptions.ts
│   │   │   │   ├── charges.ts
│   │   │   │   └── ...
│   │   │   └── ...
│   │   └── index.ts
│   │
│   ├── lib/
│   │   ├── authz.ts          # withTenant wrapper
│   │   ├── api-response.ts    # Estandarized responses
│   │   ├── seo/
│   │   │   └── clusters.ts   # SEO cluster utilities
│   │   ├── mcp/              # MCP tools
│   │   │   ├── types.ts
│   │   │   └── tools/
│   │   ├── dashboard/
│   │   │   ├── types.ts      # NEW: extracted types
│   │   │   └── gr-metrics.ts  # NEW: GR metrics
│   │   ├── geo-loader.ts      # NEW: lazy city loading
│   │   ├── queries/
│   │   │   └── entity-guard.ts  # NEW: validation helpers
│   │   ├── rate-limit.ts
│   │   ├── stripe/
│   │   ├── logger.ts
│   │   ├── validation/
│   │   └── utils.ts
│   │
│   ├── types/
│   │   ├── athletes.ts       # NEW: centralized types
│   │   └── ...
│   │
│   ├── hooks/                 # Custom React hooks
│   ├── content/
│   │   └── clusters/         # SEO content JSON
│   │       └── es/
│   │           └── espana/
│   │               ├── danza.json
│   │               └── parkour.json
│   │
│   └── data/
│       └── geo/
│           ├── cities-es.json  # NEW: lazy loaded
│           └── cities-mx.json  # NEW: lazy loaded
│
├── docs/                     # Documentación
│   ├── architecture.md
│   ├── development-guide.md
│   ├── deployment.md
│   ├── production-checklist.md
│   ├── plans/
│   └── marketing/
│
├── scripts/                 # Scripts automation
│   ├── seed.ts
│   ├── sync-stripe-plans.ts
│   └── ...
│
├── public/                  # Static assets
│   ├── fonts/
│   └── images/
│
├── .env.example              # Template variables
├── .env.local               # Local (git ignored)
├── vercel.json
├── next.config.js
├── drizzle.config.ts
├── tailwind.config.ts
└── package.json
```

---

## Convenciones de Nombres

### Archivos
- **Componentes**: PascalCase (`AthleteProfile.tsx`)
- **Utilidades**: camelCase (`api-response.ts`)
- **Rutas API**: camelCase (`route.ts`)
- **Tipos**: PascalCase (`AthleteProfile.tsx`)

### Rutas
```
/app/[academyId]/modules     → Academy-scoped routes
/api/athletes/route.ts       → API routes
/(site)/home                → Public landing pages
/(super-admin)/super-admin   → Super admin routes
```

---

## Patrones de Código

### API Response Pattern
```typescript
// ✅ Correcto
import { apiSuccess, apiCreated } from '@/lib/api-response';

export async function GET() {
  return apiSuccess({ items, total });
}

export async function POST() {
  const newItem = await createItem(data);
  return apiCreated({ id: newItem.id });
}

// ❌ Incorrecto
return NextResponse.json({ ok: true, data: items });
```

### Auth Pattern
```typescript
// ✅ Correcto - todas las APIs usan withTenant
import { withTenant } from '@/lib/authz';

export const POST = withTenant(async (request: Request) => {
  // tenant context available
});
```

### Component Pattern
```typescript
// ✅ Correcto - memoized con export default
import { memo } from 'react';

const EventCard = memo(function EventCard({ event }: Props) {
  return (...);
});

export default EventCard;
```

---

## Dependencias Principales

| Paquete | Propósito |
|---------|-----------|
| `next@14.2` | Framework |
| `react@18.3` | UI |
| `drizzle-orm` | ORM Database |
| `@supabase/supabase-js` | Database Client |
| `next-auth@5.0.0-beta` | Authentication |
| `stripe` | Payments |
| `@radix-ui/*` | UI primitives |
| `tailwindcss` | Styling |
| `zod` | Validation |
| `@modelcontextprotocol/sdk` | MCP tools |

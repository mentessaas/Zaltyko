# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary (confirmed 2026-11-08): academy direction.** The owner or director of a gymnastics club
  (artistic women's/men's, rhythmic). Runs the business and the sport at once: fees, groups, athletes,
  schedules, families. Works from a laptop at the desk and from a phone between sessions.
- Secondary: coaches on the floor (take attendance, see their group, assess) and families (limited
  portal: schedules, notices, published progress, fees). Super-admin exists for Zaltyko staff.

## Product Purpose

Management software built only for gymnastics academies: athletes by level and apparatus, recurring
fees and payments, groups and training sessions, attendance per session, technical assessments,
events/competitions, internal communication and a family portal. Success: the director knows at a
glance what is collected, who trained, which groups are full and what needs attention today, without
spreadsheets and WhatsApp threads.

## Positioning

Vertical for gymnastics, not a generic gym CRM: terminology, levels, apparatus, federations and
country clusters (ES, MX, AR, CO) are part of the model. Spanish-first.

## Operating Context

- Daily rhythm: afternoon/evening training blocks; attendance per session from the phone; monthly
  fee cycles; seasonal competitions.
- Academies migrate from Excel/Google Sheets and WhatsApp; CSV import of athletes exists.
- Multi-site academies use the Network plan.

## Capabilities and Constraints

- Stack (existing): Next.js 15 App Router, React 18, Tailwind CSS 3.4, shadcn (new-york) primitives,
  lucide-react, recharts, framer-motion, Supabase auth, Postgres/Drizzle. No new runtime framework.
- Plans (catalog `src/lib/plans/catalog.ts`): Free (30 athletes, 1 academy), Starter 19 €/mes (75),
  Growth 49 €/mes (200), Network from 99 €/mes (multi-site). 7-day Starter trial without card, one
  activation per academy every 12 months. Annual = 2 months free.
- Key routes: `/` home, `/pricing`, `/auth/login`, `/auth/register`, `/app/[academyId]/*` workspace
  (dashboard, athletes, groups, classes, attendance, billing, events, messages, coaches, assessments,
  reports, settings).
- Must keep: growth tracking (`TrackedPlanLink`, `PricingPageTracker`), SEO metadata and JSON-LD,
  existing data hooks and API calls, role gating.

## Brand Commitments

- Binding (confirmed 2026-11-08): the name **Zaltyko** and the **Z logo** (`public/branding/zaltyko/`).
- Not binding (confirmed): palette, typography, tone and existing copy may change. Product facts
  (plans, prices, limits, trial terms, legal promises) may not be invented or altered.

## Evidence on Hand

- No real customer testimonials, logos, case studies or usage metrics are confirmed. Do not
  fabricate them. The current home "social proof" is descriptive, not evidential.
- Real assets: logo SVGs in `public/branding/zaltyko/`.

## Product Principles

1. Today first: the director's next action beats historical analytics.
2. Gymnastics is the vocabulary: levels, apparatus, groups, sessions, not "members" and "classes".
3. Honest by default: show limits, trial terms and missing features plainly.
4. Desk and pista: every core flow works on a phone between sessions.

## Accessibility & Inclusion

WCAG 2.2 AA (previous work cited ZAL-575 contrast fixes). Minors' data: respect role-limited access;
no personal data in marketing surfaces.

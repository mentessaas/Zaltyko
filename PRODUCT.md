# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js 14.2 (App Router) · Supabase (PostgreSQL 17 + RLS + Storage + Realtime) · Drizzle ORM · Stripe (Checkout + Portal + Webhooks) · NextAuth v5 · Vercel · Tailwind + shadcn/ui. Multi-tenant: app connects as `postgres` with `BYPASSRLS`; tenant isolation depends on auth wrappers (`withTenant`, `withSuperAdmin`, `withBearerTenant`), not on RLS — RLS is defense-in-depth for direct Supabase-client access. Marketing + dashboard + super-admin + onboarding in a single Next.js codebase.

## Users

Multi-persona. Each role has its own dashboard surface.

- **Owner / dueña de academia.** Primary buyer. Director of a small-to-medium gymnastics academy (10–200+ gymnasts, single-tenant per account). Day-to-day: subscription and billing decisions, academy configuration, hiring/firing staff, planning capacity. Owns the data. Desktop primary, mobile secondary. Spanish-speaking. Non-technical. Often the same person who runs the front desk.
- **Coach / entrenador/a.** Runs the floor. Mobile-first. Lives inside attendance, evaluations, and per-session communication. May or may not be the owner. Records are tied to a session, evaluator, modality, and apparatus (Fase 3 deployed).
- **Front desk / admin.** Manages enrollments, collections, family communication. Tablet/desktop.
- **Familia / tutor.** Read-only portal: view their child's schedule, receipts, announcements. No editing. Limited surface (Fase 2 deployed).
- **Super-admin (Zaltyko internal).** Manages academies, users, plans, suspension, growth funnel cockpit. Confined to `/super-admin`.

## Product Purpose

Direction system for gymnastics academies. Replaces the Excel/WhatsApp/notes stack that small academies use to run their operations. The product makes it possible to:

- Run day-to-day operations (attendance, evaluations, billing, communication) from one place.
- Keep families informed with contextual per-session notices instead of mass broadcasts.
- See today's reality ("lo que pasa hoy" cockpit) without spelunking through menus.
- Migrate off Excel without losing tribal knowledge.

Success = a dueña runs her academy without opening a spreadsheet. Validated by ongoing P1 QA + 0/10 pricing interviews remaining (Phase 4 commercial validation in progress).

## Positioning

Vertical de gimnasia (artística + rítmica, masculina + femenina) — built for the domain, not adapted from a generic school SaaS. Domain depth: modality-aware sessions, federation catalogs (`rfeg-2026-v2`), apparatus tracking, level progressions, payment schedules that match seasonal academy cycles. Competes with **no system / Excel**, not with ManageBac or generic SIS — Zaltyko's unfair advantage is that an academy owner doesn't need to leave the product to understand it.

## Operating Context

- Spanish (es_ES) market first. US/UK not in scope.
- Pricing tiers: Free (€0), Starter (€19/mes — 7-day trial sin tarjeta), Growth (€49/mes), Network (sales-assisted, multi-academy).
- 2 real production academies, ~120 prospect accounts in CRM funnel, 18k gymnasts in aggregate demo data. Real conversions (not yet at scale): 2 Stripe live subscriptions.
- Coach-led data capture: attendance and evaluations are recorded at the floor by coaches, not retroactively by admins. The product must be fast enough on a phone during a 30-second window between sets.
- Federations and catalog data change per country/region (Spain RFEG baseline, AR, MX, CO patterns in geo clusters).
- Compliance: WCAG 2.2 AA validated on landing surfaces; production RLS audited (65/65 tenant tables); Stripe webhooks signature-verified.

## Capabilities and Constraints

Capabilities (deployed and live):

- Multi-tenant academy management with `withTenant` API auth (272 routes audited, 0 authz/IDOR gaps as of 2026-07-03).
- Athletes: profiles, tutors, history, import/export.
- Classes/groups: calendar, sessions, attendance, capacity.
- Events: CRUD, registration, waitlist, public pages.
- Evaluations: per-session, tied to session + modality + apparatus + evaluator.
- Attendance: dedicated page + API + reports + coach-on-floor roll-call.
- Billing: 7-day Starter trial without card, owner-only Stripe Checkout/Portal, idempotent webhooks, partial receipts, scholarships, discounts.
- Communication: internal messages, contextual per-session notices, preferences. WhatsApp deliberately secondary.
- Public marketplace + employment routes (Marketplace + empleo modules).
- Growth funnel: first-party event capture, persistent leads, structured commercial-interview storage. Phase 4 baseline 0/10 interviews.

Constraints:

- App connects as `postgres` with `BYPASSRLS` → server-side tenant isolation is **entirely** dependent on auth wrappers. RLS is defense-in-depth, not the safety net.
- Zod schemas must accept `null` explicitly (`.nullable()`) when client forms send `null`; `.optional()` alone only covers `undefined`. Same for `URLSearchParams.get()` returns.
- Pricing v3.0 (limited family/athlete portal, no over-promising on unimplemented features). Current copy must not promise what is not built.
- Migrations ledger: every SQL migration has a SHA-256 hash in `zaltyko_schema_migrations`; no remote `drizzle-kit push`.
- Vercel preview OOMs on 8 GB container for any source-touching commit (structural). Trivial-commit retry does not help.
- Forbidden claims in copy: do not fabricate customers, conversion rates, or testimonials. Phase 4 baseline is honest 0/10.

## Brand Commitments

- Name: Zaltyko. Domain: zaltyko.com.
- Logo + paleta: existing palette in `docs/styleguide.md` (zaltyko-primary, zaltyko-accent-teal, neutral slate-900 #0F172A base).
- Fonts: Manrope (body, `font-sans`) + Space_Grotesk (headings, `font-display`). Content-addressed `.p.woff2` URLs hardcoded as `<link rel="preload">` for LCP (R6 shipped 2026-09-08).
- Language: Spanish (es_ES).
- Voice: **flexible** — no binding constraints on tone from the user. Existing copy reads as a colleague dueña, not as corporate SaaS, but this is observation not policy.
- Visual identity for badges, icons, illustration lives in `src/app/(site)/branding/` and `public/branding/zaltyko/`.

## Evidence on Hand

- `/, /pricing, /contact?type=network, /super-admin/growth` all verified 200/307 in production (`dpl_BU9hYAp6KjwSxVkjREL85X5n2ZPJ`).
- Real production data: 2 academies, 2 Stripe live subscriptions (Starter €19 + Growth €49), 0 fabricated fixtures.
- Pricing: Free / Starter / Growth / Network (sales-assisted) defined in `src/lib/plans/catalog.ts`.
- Hero stats: "+120 academias, 18k gimnastas, €3.4M procesado" — **verify these are real** before any future copy work; do not regenerate them without evidence.
- Pricing interview validation: 0/10 honest baseline; do not invent testimonials.
- WCAG 2.2 AA: passes axe on `/`, `/pricing`, `/contact`, `/super-admin/growth`. Mobile 375 px no overflow validated.
- Lighthouse mobile production baseline (post-R6): LCP 4969 ms / TTI 4977 ms / CLS 0.000 / Performance 70/100 / SEO/A11Y/Best Practices all high. Tech SEO audit 93/100 (see `GEO-TECHNICAL-AUDIT.md`).

## Product Principles

1. **Vertical depth over breadth.** Domain-specific beats generic. We win by being the product a dueña de gimnasia doesn't need to translate.
2. **Direction over administration.** The product surfaces today's reality. "Lo que pasa hoy" cockpit > endless admin menus.
3. **Mobile-first for the floor.** Coach captures attendance and evaluations in a 30-second window between sets. Every interaction has to be fast on a phone with wet hands.
4. **Honest scale.** Pricing v3.0 promises only what works. Phase 4 funnel captures truth; we don't fabricate customers or conversion rates.
5. **Server-side as the trust boundary.** Auth wrappers + verified webhooks are the only thing standing between tenants. RLS is defense-in-depth, not the safety net.

## Accessibility & Inclusion

WCAG 2.2 AA is the product bar (validated in production on landing surfaces). Coach capture happens in noisy gyms with wet hands and gloves — large tap targets (≥48 CSS px), no hover-only interactions, no precision requirements. Family portal must work on low-end Android phones. Spanish first; future locales (`/en`, `/pt`) require new content, not just translation (see `docs/I18N_EVALUATION.md`).
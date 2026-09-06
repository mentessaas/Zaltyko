# Zaltyko × Akros Real-World Audit

Audit date: 2026-09-04  
Scope: repository evidence at `cc525884` plus the uncommitted working tree present on the audit date.  
Method: read-only inspection of schema, migrations, API routes, UI components, authorization, reports, tests, vault, and current official federation sources. No product code, schema, migration, configuration, production data, or credentials were changed.

## 1. Executive Verdict

**NO**

Akros should not adopt Zaltyko tomorrow as its **primary** operating system.

Zaltyko can already represent and operate a substantial part of Akros: academies, athletes and guardians, coaches, configurable sport branches, training groups, recurring weekly classes, generated sessions, attendance, assessments, internal communication, charges, events, licenses, and competition results. The core architecture is much closer to the target than a feature inventory alone suggests.

The rejection is nevertheless operational, not cosmetic. The current enrollment/capacity/billing chain has incompatible sources of truth:

- `group_athletes` is the intended many-to-many membership, but several operational paths still read or write deprecated `athletes.group_id` (`src/db/schema/athletes.ts:28-30`, `src/app/api/groups/route.ts:274-287`).
- The class enrollment UI omits the mandatory `academyId`, so its POST cannot satisfy the API contract (`src/components/classes/EnrollmentManager.tsx:170-177`; `src/app/api/class-enrollments/route.ts:11-15`).
- That API rejects a valid secondary sport by comparing only with `primarySportConfigId`, despite `athlete_sport_configs` existing (`src/app/api/class-enrollments/route.ts:100-124`).
- Capacity is calculated differently by different paths and can count only extras, only group members, or even sessions rather than athletes (`src/app/api/class-enrollments/route.ts:144-160`; `src/lib/alerts/capacity-alerts.ts:24-59`; `src/app/api/reports/leaks/route.ts:54-64`).
- Monthly charge generation selects membership through `group_athletes` but carries forward deprecated `athletes.group_id`, then skips the athlete when that legacy value is null (`src/app/api/charges/generate-monthly/route.ts:45-73,136-151`). It also enforces one charge per athlete/month, so it cannot natively bill two independently priced activities (`src/app/api/charges/generate-monthly/route.ts:158-193`).
- Events have dates, capacity, price and waitlist, but registration requires an existing authenticated `profileId`; there is no demonstrated external-participant workflow for a 60-person camp open to non-members (`src/app/api/events/[id]/registrations/route.ts:12-15,70-165`).

These are P0 because they make enrollment, occupancy, revenue collection, and external camp intake unreliable. They are general ICP problems, not Akros-specific requests.

Estimated current operational coverage: **about 65%**. After the minimum P0 changes and end-to-end verification: **about 85%**. The remaining 15% is mainly facilities/conflict planning, explicit progression history, temporary coach substitutions, richer multi-activity pricing, and federated competition administration; Akros can initially handle those with controlled procedures.

## 2. Top 5 Findings

1. **The domain foundation is broadly sound.** `academy_sport_configs`, programs, levels, categories, groups, classes, sessions, `group_athletes`, attendance, assessments, events, licenses and results cover the main entities without hardcoding Akros.
2. **Membership has two sources of truth.** The intended many-to-many `group_athletes` coexists with deprecated `athletes.group_id`; scheduling, permissions, group creation and billing do not consistently use the same one.
3. **Capacity is not decision-grade.** The stored class capacity is useful, but occupancy and availability are not consistently derived from all enrolled athletes; waiting-list automation cannot be trusted until one canonical calculation exists.
4. **Akros's weekly timetable is representable, but facilities are absent.** Each distinct day/time/group can be a class with one or more weekdays and generated sessions. Simultaneous groups are possible, but there is no room/training-area capacity or collision model.
5. **Competition readiness is adequate for records, not federation operations.** Zaltyko keeps configurable sport/category/license/result data and does not need an RFEG ERP now. It lacks an explicit season and robust competition-registration domain, but nothing requires Spain-specific hardcoding.

## 3. Current Zaltyko Architecture

Zaltyko is a Next.js 15.5 App Router application with React 18, Tailwind/shadcn UI, Supabase PostgreSQL, Drizzle ORM, Supabase Auth, Stripe, Vitest and Playwright (`package.json`). The audited repository contains 90+ schema modules, 51 Supabase SQL migrations, 6 Drizzle SQL migrations, roughly 317 `withTenant` occurrences in API routes, and 257 test files.

The primary workspace is `/app/[academyId]/*`. Tenant APIs are wrapped by `withTenant`, which resolves the authenticated profile, academy context, tenant membership, route permission and mutation rate limit before invoking a handler (`src/lib/authz.ts:166-319`). The DB connection is documented internally as privileged/BYPASSRLS, so server-side tenant predicates and authorization remain the primary isolation mechanism; RLS is defense in depth.

Sport configuration is layered as country → discipline → branch → locale configuration, with configurable programs, levels, age categories, apparatus and competition types (`src/db/schema/sport-config.ts`). An academy activates one or more of these through `academy_sport_configs` rather than receiving a fixed Akros-specific taxonomy.

## 4. Current Capability Map

Status definitions: **COMPLETE** means a coherent data + logic + UI workflow was found; **PARTIAL** means useful implementation exists but an important gap remains; **DATA MODEL ONLY** means persistence exists without a demonstrated usable workflow; **UI ONLY**, **STUB**, **NOT IMPLEMENTED**, and **UNKNOWN** retain their literal meanings.

| Area | Status | Evidence and boundary |
|---|---|---|
| Academy management | COMPLETE | `academies`, academy settings, onboarding state/checklist, `/app/[academyId]/settings`, `src/app/api/academies/*`. Multi-site commercial rules are separate from Akros's single-site need. |
| Students / athletes | PARTIAL | CRUD, import/export, guardians, documents and history exist (`src/app/api/athletes/*`, `src/components/athletes/*`), but secondary-sport editing and membership consistency are incomplete. |
| Parents / families | PARTIAL | Guardians, family contacts, link requests, limited `my-dashboard`, messages, notifications and family charges exist. Real-user portal QA remains documented as pending in the vault. |
| Coaches | PARTIAL | CRUD, sport scopes, multiple class assignments, notes and coach workspace exist. No dated substitution or per-session substitute workflow. |
| Groups | PARTIAL | M:N membership exists through `group_athletes`; group UI configures program, level, category, coaches, athletes and monthly fee (`CreateGroupDialog.tsx:41-55,217-241`). Legacy `athletes.group_id` remains operationally active. |
| Scheduling | PARTIAL | Multiple weekdays, arbitrary start/end times, generated dated sessions and exceptions exist. One class has one recurring time for all selected weekdays; different times require separate classes. No facility conflicts. |
| Attendance | COMPLETE | `attendance_records` is unique per session/athlete and coach/admin attendance workspaces exist (`src/db/schema/attendance-records.ts`; `/app/[academyId]/attendance/today`). |
| Payments / fees | PARTIAL | Group and custom athlete fees, charges, receipts, refunds, discounts, scholarships and Stripe flows exist. Multi-group monthly billing and current M:N membership handling are not reliable. |
| Communication | PARTIAL | Internal messages, group alerts, announcements and notifications have UI/API. Some reminder delivery code remains TODO (`src/lib/alerts/class-reminders.ts:102-110`). |
| Progress tracking | PARTIAL | Dated assessments and skill scores provide evidence history. No explicit level-change/promotion history. |
| Skills | PARTIAL | `skill_catalog`, rubrics, assessment scores and assessment UI exist. A configurable ordered progression path is not demonstrated. |
| Events | PARTIAL | CRUD, public listing, dates, categories, capacity, price, registration, invitations, payment records and waitlist exist. External participants and camp daily schedules are missing. |
| Camps | PARTIAL | Can be represented as an event with date range, fee and capacity. No external intake or sub-session/staff-roster model. |
| Competitions | PARTIAL | Events, configurable competition types, results and licenses exist. No season entity or federation submission workflow. |
| Facilities | NOT IMPLEMENTED | No facility, room, area or venue FK was found in schema; only event geographic location and academy address concepts exist. |
| Capacity management | PARTIAL | `classes.capacity`, event capacity, waitlists and reports exist; class occupancy algorithms disagree and do not reliably count base + extra enrollment. |
| Enrollment | PARTIAL | Group assignment and class extras exist in data/API/UI, but the class-extra UI/API contract is broken and lifecycle dates/status/reason are absent. |
| Trials | PARTIAL | Class `allowsFreeTrial`, `academy_trials`, trial flags and UI controls exist. A complete prospect → trial booking → attendance → enrollment funnel for Akros was not demonstrated. |
| Waiting lists | PARTIAL | Class/event waitlist tables and dialogs/routes exist; no atomic promote-to-enrollment workflow was found, and class capacity is unreliable. |
| Reporting / analytics | PARTIAL | Attendance, class, coach, financial, churn, progress, dashboard and leak reports exist. Revenue by program/group/facility-hour and reliable occupancy depend on corrected enrollment semantics. |
| Roles / permissions | PARTIAL | Owner/admin/coach/athlete/parent/super-admin navigation and route permissions exist (`src/lib/navigation/registry.ts:57-73`; `src/lib/authz.ts`). The workspace layout blocks billing/settings/coaches/announcements for non-admins (`layout.tsx:186-197`). Coach scope still touches legacy group relationships. |

## 5. Akros Operational Model

Akros is one academy with several concurrent operating dimensions:

- Lines of business: artistic gymnastics, intermediate/advanced artistic, aerial (silks/hoop), dance/cheer/ballet/flexibility/strength/choreography, adult floor acrobatics, and non-recurring camps/events.
- Service tiers: recreational, development, intermediate, advanced, and competitive.
- Weekly timetable: mornings, afternoons, evenings and Saturdays; durations of 60, 90 and 270 minutes; multiple groups and coaches at the same time.
- Membership: one athlete may attend multiple groups/activities/hours and may carry an internal development level separate from a competitive category.
- Revenue: recurring tuition plus independent event/camp prices; likely family-level collection and possible activity-specific fees.
- Competition: a subset of athletes needs licenses, categories, event registrations and results; most athletes do not.

The simplest faithful mapping is:

`Academy → activated Sport/Branch configurations → Program → Training Group → recurring Class → dated Session`

with independent joins for `Athlete ↔ Group`, `Coach ↔ Class`, attendance, assessments and charges. Events remain separate from recurring classes. Internal level and federation category remain separate attributes per athlete/sport participation.

## 6. Akros × Zaltyko Compatibility Matrix

| Requirement | Supported | Evidence | Gap | Severity |
|---|---|---|---|---|
| Multiple simultaneous groups | Yes, with limitation | Independent `groups` and `classes`; no uniqueness constraint on time | Cannot assign rooms/areas or detect facility conflicts | HIGH |
| Different coaches per group/class | Yes | `groups.coach_id`, assistants, `class_coach_assignments` M:N | Assignment is undated; group and class coach sources can diverge | MEDIUM |
| Multiple days with same time | Yes | `class_weekdays` + one start/end on class | None for Akros rows sharing a time | LOW |
| Different time by weekday | Configure as separate classes | One start/end per class | More setup and duplicated class identity | MEDIUM |
| 60/90/270-minute sessions | Yes | Unrestricted start/end time inputs and session fields | No duration policy needed | LOW |
| Morning/evening/Saturday | Yes | Weekday 0-6 and HTML time inputs | None found | LOW |
| Multiple activities per athlete | Data yes; workflow unreliable | `athlete_sport_configs`, `group_athletes` | UI centers one primary config; class enrollment rejects valid secondary config | BLOCKER |
| Multiple groups per athlete | Data yes; partially operated | `group_athletes` unique per pair | Legacy `athletes.group_id` still drives conflicts, permissions and billing | BLOCKER |
| Internal level | Yes | `levels`, group/athlete `level_code`, assessment history | No explicit promotion history | MEDIUM |
| Independent competitive category | Partial | category fields/config and competitive fields exist | UI and history do not consistently distinguish all concepts | MEDIUM |
| Temporary coach substitute | No coherent workflow | Session has nullable `coach_id` | No UI/lifecycle; recurring assignment lacks dates | MEDIUM |
| Room/area capacity | No | No facility schema found | Cannot prevent two groups exceeding a physical area | HIGH |
| Class capacity/occupancy | Unreliable | Stored capacity and several calculators | Inconsistent enrollment counts | BLOCKER |
| Waitlist → enrollment | Partial | Class waitlist API/UI | No demonstrated atomic promotion; capacity source unreliable | HIGH |
| Monthly group tuition | Partial | Group/custom fees and charge generator | Legacy group ID and one-charge-per-month semantics | BLOCKER |
| Family collection | Partial | Guardians, family Stripe customer, family charge routes | Revenue is athlete-centric; family consolidated invoicing not demonstrated | MEDIUM |
| Camp for existing members | Partial | Event date range, capacity, fee, registration | Registration is profile-based, not athlete/participant-based | HIGH |
| Camp for external children | No | Public event pages exist | No external participant/guardian intake and consent workflow | BLOCKER |
| Attendance | Yes | Session attendance records and coach workflow | Depends on correct roster | HIGH dependency |
| Evaluation/progress | Yes, with friction | Dated assessments, skill scores, charts | Promotion/level history absent | MEDIUM |
| Internal messaging | Yes | Conversations, alerts, notifications | Scheduled reminder delivery has TODOs | MEDIUM |
| Official competition records | Partial | Licenses, competition event types/results | No season, entry/submission lifecycle, team/ensemble model | P2 / not launch blocker |

## 7. Critical Blockers

Only five findings meet the blocker threshold for using Zaltyko as Akros's system of record:

1. **Canonical enrollment is unresolved.** M:N group membership and the deprecated single group coexist in live logic. Until all critical paths use one resolver, rosters, permissions, conflicts and billing can disagree.
2. **Additional class enrollment UI is currently non-functional against its own API contract.** The UI sends `{classId, athleteId}` while the API requires `{academyId, classId, athleteId}`.
3. **Capacity and available-place calculations are inconsistent.** Akros cannot safely sell the 14th of 15 places, operate waitlists, or trust occupancy reporting.
4. **Recurring tuition generation is unsafe for the intended M:N model.** Valid group members can be skipped, and independently priced activities collapse into a one-charge-per-athlete/month constraint.
5. **External event/camp registration is absent.** Akros's camp explicitly accepts non-members; the current event registration requires an internal profile.

Facilities are HIGH, not a launch blocker, if Akros accepts a documented manual room-allocation procedure during P0. Federation automation is not a blocker.

## 8. Works With Friction

- Representing a weekday with a different time requires a second class record.
- A long 16:00-20:30 advanced block is representable, but capacity and attendance are attached to the whole class/session, not rotating sub-blocks.
- Coaches may have many class assignments, but temporary substitution is manual at the session or by changing assignments.
- Group creation can attach athletes and fees, but also writes the deprecated single group, silently making the last created/updated group look primary.
- Sport taxonomy is configurable, but adding aerial/dance branches depends on seeded/administrable sport configurations; arbitrary `groups.discipline` is constrained by the API to `artistica`, `ritmica`, or `general` when no config supplies the value (`src/app/api/groups/route.ts:21-43`).
- Events support a date range but not daily camp times, staff roster or participant-specific medical/consent data.
- Progress charts derive from assessments; a formal promotion/demotion transaction does not exist.
- The family portal is deliberately limited and safer than exposing admin screens, but real-account acceptance testing remains necessary before onboarding Akros families.

## 9. Domain Model Audit

| Concept | Current model | Verdict |
|---|---|---|
| Academy | `academies`, tenant + owner/memberships | Sufficient |
| Season | No dedicated entity found | Add only when dated enrollment/pricing or federation workflows require it |
| Sport / modality | Global discipline/branch/locale config + academy activation | Strong and generalizable |
| Program | Configurable `programs` and `programCode` | Sufficient for Foundation/Development/etc. |
| Training group | `groups` with sport/program/level/category/coaches/fee | Structurally sufficient; remove legacy-membership dependence |
| Recurring session | `classes` + weekdays → `class_sessions` | Sufficient for current timetable with duplicated class rows when times differ |
| Coach | Coaches + sport scopes + M:N class assignments | Sufficient; substitution can be deferred |
| Facility / area | Absent | Small general entity needed soon, not a full facilities module |
| Enrollment | `group_athletes` + class extras, but no lifecycle | Needs canonical service and eventually status/effective dates |
| Attendance | Per dated session and athlete | Sufficient |
| Internal level | Configured level codes and assessments | Sufficient state; history incomplete |
| Competitive category | Config/category fields and athlete competitive fields | Sufficient state; semantics/UI need clarification |
| Event | General event with capacity/fee/registration | Good base; participant identity is too narrow |
| Competition | Event subtype + results | Adequate records, not full federation operations |

The correct minimal architecture is **not** a new universal `Activity` framework. Keep sport configuration, groups, recurring classes and events separate. Introduce shared services around enrollment and capacity before introducing new top-level tables.

## 10. Recreational + Competitive Readiness

Recreational, Development, Intermediate, Advanced and Competitive can be configured as programs and/or ordered internal levels. They should not be a hardcoded enum. The existing `programs` and `levels.sort_order` support this approach (`src/db/schema/sport-config.ts`).

The system already separates several competitive concepts from general level: `categoryCode`, `competitiveLevel`, federative licenses, competition types and results. However, `athletes` duplicates generic and competitive-looking fields while `athlete_sport_configs` carries per-sport program/level/category. For a multi-activity athlete, the join must become the canonical place for sport-specific state; the athlete row should remain profile + optional primary display choice.

P0 does not require deleting columns. It requires reads/writes to resolve sport participation consistently and the UI to label internal level versus federation category clearly.

## 11. Federation Readiness

Official evidence supports four modest conclusions:

- The RFEG operates alongside territorial/autonomous federations, which organize regional activity and participate in national competition ([RFEG autonomous federations](https://rfegimnasia.es/federaciones-autonomicas/)).
- The official license portal serves territorial/provincial federations and affiliated clubs and centralizes licenses, championships and events ([RFEG license portal terms](https://licencias.rfegimnasia.es/include/legal/TERMINOS%20Y%20CONDICIONES%20LIC%20%C3%9ANICA.pdf)).
- Current technical programs tie categories to age/birth year and require compliance with current competition and license rules ([RFEG GAM 2026 technical program](https://rfegimnasia.es/wp-content/uploads/2026/02/PROGRAMA-TECNICO-NIVELES_GAM_2026.pdf)).
- National competition registration can include provisional and final stages and discipline-specific eligibility rules; these rules change and should not be hardcoded as product enums ([RFEG rhythmic technical rules](https://rfegimnasia.es/gimnasia-ritmica/)).

Priority:

- **P0:** preserve separate internal level and external category; make license validity and federation free/configurable; do not block multiple sport participations.
- **P1:** add a generic season/cycle only when enrollment, pricing or reporting needs effective dates. A label plus start/end dates is sufficient.
- **P2:** competition entry lifecycle, team/ensemble membership, documents/music, apparatus entries, eligibility snapshots and richer results.
- **P3:** integrations/import-export with RFEG or territorial portals, only after an official stable interface and customer demand exist.

Current architectural risk: `federative_licenses.person_id` is polymorphic without an FK and defaults `country` to `ES` (`src/db/schema/federative-licenses.ts:11-24`). It does not block Akros, but a future redesign should avoid country defaults in core domain behavior and establish referential integrity without hardcoding Spain.

## 12. Complementary Activities

Artistic gymnastics, aerial, dance and cheerleading should be activated sport/activity branches; Foundation/Elite/Adults should generally be programs or groups, not new tables. Flexibility, strength and choreography may be either programs within a branch or standalone complementary activity configs depending on whether they have independent enrollment, timetable and fee.

Decision rule:

- If it has its own roster, schedule or fee, model it as an activated branch/program + group/class.
- If it is merely a training focus within a group's session, use `technicalFocus`, apparatus and session notes.
- If it is a bounded date range with independent registration, use `events`.

This keeps Zaltyko gymnastics-first while supporting common adjacent services. Do not add an `isAkrosDance` flag or fixed aerial weekdays.

## 13. Events / Camps / Internal Competitions

The event form exposes type, sport branch, registration window, event dates, location, categories, publication, capacity, fee and waitlist (`EventFormSections.tsx:79-275,434-519`). This is a strong reusable base for exhibitions, clinics and internal competitions.

For Summer Gymnastics Camp, Zaltyko can store 20-24 July, capacity 60, age/category text, price and public visibility. It cannot faithfully capture 09:30-14:00 per day, five assigned coaches, the child participant when the payer/profile is a guardian, or an external child with consent/emergency details. `event_registrations.profile_id` has no FK and models the registrant, not participant identity (`src/db/schema/event-registration.ts`).

Minimum correction: allow an event registration to reference either an internal athlete or a small external participant snapshot (name, DOB, guardian contact, emergency/consent status) with a payer/contact profile where available. Keep one `events` module; do not build separate Camp, Clinic and Exhibition modules.

## 14. Scheduling & Capacity

### Stress-test result

The Akros schedule can be entered without schema changes by creating a class for each unique `(group, weekday set, start time, end time)` combination. Monday-Friday rows sharing a time can use one class with five `class_weekdays`; Tuesday/Thursday morning adult sessions use another class; Saturday sessions use another. Two 7-16 groups at 19:00 are two groups/classes. A 90-minute or 4.5-hour block uses the same fields.

The generator creates one dated session per selected weekday, reuses class start/end time, skips exceptions and existing dates (`src/lib/generate-class-sessions.ts:23-130`). It does not enforce end > start, timezone on the class itself, coach collision, athlete capacity, or facility collision in the demonstrated creation path.

### Capacity engine verdict

- **DATA:** capacity exists on class; group memberships, class extras and waitlist rows exist.
- **LOGIC:** multiple incompatible implementations exist; no canonical roster resolver.
- **UX:** capacity and some metrics are displayed, but cannot be trusted while logic disagrees.
- **WORKFLOW:** class POST can reject extras when its extras-only count reaches capacity, but base group members are omitted; waiting-list promotion is not demonstrated.

For the example `capacity 15, enrolled 13`, Zaltyko has enough raw data only if “enrolled” is defined as the distinct union of active group members and active direct class enrollments. P0 must calculate `13`, `87%` and `2` through one tested service used by enrollment, alerts, reports and UI.

## 15. Athlete Progression

Current assessments preserve dates, evaluator, sport config, apparatus, rubric/skills, scores and comments (`src/db/schema/athlete-assessments.ts:75-101`; `assessment-scores.ts`). This supports evidence of improvement.

What is missing is a first-class progression event: from-level, to-level, effective date, sport participation, reason and actor. Updating `levelCode` overwrites current state. Group changes also do not inherently preserve promotion/demotion intent.

Recommendation: **defer a new progression-history table from P0**. First make sport participation canonical and show assessment history. Add a small level-transition ledger in P1 only after Akros confirms it needs promotion-cycle reporting rather than notes/assessments.

## 16. Payments / Enrollment

Zaltyko has the mechanics for fees and collections, but it currently conflates three contracts:

1. membership in a training group;
2. enrollment in a recurring class;
3. the billable product/fee.

For a simple one-group athlete, the group monthly fee and optional `custom_fee_cents` can work (`src/lib/billing/athlete-fees.ts:22-80`). For Akros multi-activity participation, monthly charge generation must iterate billable group memberships, not one athlete legacy group. The current uniqueness behavior treats an athlete/month as a single charge, so artistic + aerial cannot remain separate recurring line items.

P0 should support a deterministic aggregate monthly charge with per-group line-item provenance, or multiple charges unique by athlete + period + billing source. The former is smaller for family operations if the existing charge model can retain auditable line items; the exact persistence choice needs a reviewed migration design.

Do not build dynamic package pricing, usage billing or a rules engine before Akros's actual price sheet is obtained.

## 17. Roles & Permissions

The intended role boundary is sensible: owner/admin manage the academy; coaches access athletes, groups, classes, attendance, events, assessments, messages and reports; families/athletes receive a limited dashboard, events, messages and notifications (`src/lib/navigation/registry.ts:57-73`). Billing/settings/coaches/announcements are blocked for non-admins in the academy layout.

The principal risk is not the role list but resource scoping through inconsistent membership relationships. `verifyCoachAthleteAccess` considers legacy athlete group, class group and direct class enrollment (`src/lib/permissions.ts`). Once canonical membership is fixed, these permission queries must be updated and regression-tested so a coach sees only assigned athletes across all legitimate groups.

No permission expansion is recommended during this audit.

## 18. Analytics Readiness

| Metric | Classification | Reason |
|---|---|---|
| Attendance | AVAILABLE NOW | Sessions + attendance records + reports exist; accuracy depends on roster. |
| MRR / total collected revenue | AVAILABLE NOW with definition caveat | Financial calculators/charges exist; academy-customer tuition is distinct from Zaltyko SaaS subscription MRR. |
| Students per coach | MINOR CHANGE | Data exists; reconcile group/class assignment sources. |
| Occupancy per group/class/timeslot | NEW CAPABILITY (small) | Needs canonical roster and timeslot aggregation. |
| Available capacity | NEW CAPABILITY (small) | Same dependency; raw fields exist. |
| Coach/student ratio | MINOR CHANGE | Derivable after roster resolver. |
| Revenue per athlete/family | MINOR CHANGE | Athlete charges exist; family aggregation needs guardian linkage semantics. |
| Revenue per program/group | NEW CAPABILITY | Billing source provenance is incomplete. |
| Revenue per facility-hour | NOT WORTH BUILDING YET | No facilities and no validated need. |
| Retention/churn | AVAILABLE NOW with caveat | Churn/report code exists, but enrollment effective dates are weak. |
| Multi-activity participation | MINOR CHANGE | `athlete_sport_configs` and `group_athletes` exist; UI/workflows incomplete. |
| Progression/time per level | NEW CAPABILITY | No explicit level transition history. |
| Waiting-list demand | AVAILABLE NOW with caveat | Rows exist; conversion/promotion lifecycle missing. |
| Trial → enrollment | NEW CAPABILITY | Trial flags/tables exist; connected funnel not proven. |
| Unmet demand | DEFER | Needs reliable waitlist, trial and capacity data first. |

## 19. Hidden Technical Risks

1. **Dual membership cardinality:** deprecated one-group FK and M:N join are both mutated and queried.
2. **Sport participation contradiction:** class enrollment checks primary sport only while competition results correctly check primary + join rows. Identical domain rules have diverged.
3. **Capacity semantic drift:** a no-group class capacity alert counts sessions as people.
4. **Group list data loss:** GET `/api/groups` selects only basic columns and then returns `sportConfigId`, program, level code, category, technical focus and apparatus as null/empty (`src/app/api/groups/route.ts:77-132`), hiding persisted configuration from consumers.
5. **Class list data loss:** GET `/api/classes` similarly returns start/end/capacity/config/group as null unless another detail route is used (`src/app/api/classes/route.ts:70-120`).
6. **Event identity weakness:** registration/event waitlist `profileId` and `eventId` lack declared FKs in the schema module; orphan and cross-context integrity depends on code.
7. **License polymorphism:** `personId` + text `personType` lacks referential integrity; a declared pg enum exists but text columns are used.
8. **No season/effective dates:** group membership cannot answer “who was enrolled in March?”; this weakens churn, historical rosters and seasonal federation work.
9. **Time validation/timezone:** class times are local `time` values and sessions use text times; generator uses server `new Date()`/`date-fns` rather than an explicit academy timezone in the shown path.
10. **Test gap:** the existing E2E enrollment helper sends `academyId`, so it does not exercise the actual `EnrollmentManager` payload (`tests/e2e-zaltyko-p1-flows.spec.ts:181-193`). No direct tests were found for the contradictory capacity algorithms or multi-group monthly billing.

## 20. Feature Gap Matrix

| Requirement | Current implementation | Gap | Severity | Generalizability | Recommendation | Complexity | Impact |
|---|---|---|---|---|---|---|---|
| Canonical multi-group enrollment | `group_athletes` plus legacy `athletes.group_id` | Critical services disagree | BLOCKER | CORE ICP | IMPROVE | M | Activation, retention, operations |
| Additional class enrollment | UI + API exist | Missing `academyId`; secondary sport falsely rejected | BLOCKER | CORE ICP | IMPROVE | S | Activation, operations |
| Reliable class occupancy | Capacity + three calculators | No canonical distinct roster | BLOCKER | CORE ICP | IMPROVE | M | Acquisition, revenue, operations |
| Multi-activity monthly billing | Group/custom fees + charges | Legacy group and one athlete/month source | BLOCKER | CORE ICP | IMPROVE | M/L | Revenue, retention |
| External camp participant | Event registrations require profile | No external child/guardian intake | BLOCKER | COMMON | BUILD minimal | M | Acquisition, revenue |
| Room/training area | None | No conflict/capacity entity | HIGH | CORE ICP | BUILD small | M | Operations |
| Enrollment lifecycle | Join row has only createdAt | No status/effective dates | HIGH | CORE ICP | IMPROVE | M | Retention, analytics |
| Temporary substitution | Session coach field/undated assignments | No workflow/history | MEDIUM | COMMON | IMPROVE later | S/M | Operations |
| Different time by weekday | Separate class rows | Setup duplication | MEDIUM | COMMON | KEEP for now | S UX later | Operations |
| Internal vs competitive labels | Multiple fields/configs | Semantics not consistently exposed | MEDIUM | CORE ICP | IMPROVE | S | Activation |
| Progression history | Assessments + current level | No transition ledger | MEDIUM | CORE ICP | DEFER to P1 | M | Retention |
| Season | Not implemented | No bounded membership/category cycle | MEDIUM | COMMON | DEFER until evidence | M | Analytics, competition |
| Federation submission | License/results storage | No portal integration | LOW now | REGION-SPECIFIC | DO NOT BUILD | XL | Future operations |
| AI matching/prediction | Some AI endpoints/widgets | Core data is not trustworthy | LOW | COMMON | DEFER | L | Future acquisition |

## 21. What NOT To Build

- No RFEG-specific ERP, scraper or automatic federation submission.
- No hardcoded Spanish category/age enum in athlete or group tables.
- No separate modules/tables for Camp, Clinic, Exhibition and Internal Competition; extend the event participant workflow.
- No universal activity ontology that attempts to model every dance/fitness business.
- No AI “best class” recommender before occupancy, eligibility and enrollment data are reliable.
- No predictive churn/demand layer based on inconsistent membership history.
- No complex facility booking engine; one facility/area entity plus overlap checks is enough initially.
- No automatic pricing rules engine, family bundles or packs until Akros supplies real pricing cases and frequency.
- No complete season/federation schema in P0.
- No destructive removal of legacy membership columns in the first fix; migrate reads/writes, reconcile data, verify, then retire safely.
- No WhatsApp-first workflow. Keep internal communication primary per the product guide.

### Anti feature-creep assessment for recommended BUILD items

**External participant registration:** solves a demonstrated Akros camp requirement, is common across the ICP, occurs seasonally, blocks camp revenue and operation, cannot be solved by configuration alone, and needs a small new participant identity abstraction. Evidence is sufficient for a minimal build; avoid marketing automation and complex waivers.

**Facility/training area:** solves simultaneous-group safety/capacity planning, is common in gymnastics academies, occurs every operating day and can block operations. A temporary manual procedure is acceptable for P0, so build it in P1 unless Akros confirms shared-area constraints make it a launch condition. Keep architecture small.

All other new architecture is deferred pending real use.

## 22. Minimum Viable Changeset

| Problem | Proposed change | Why now | Likely files/schema affected | Migration? | Complexity | Risk | Generalizability |
|---|---|---|---|---|---|---|---|
| Membership split-brain | Define one enrollment resolver based on `group_athletes`; update scheduling, permissions, reports, billing and group mutations; treat `athletes.group_id` as compatibility-only | All core workflows depend on roster truth | `groups.ts`, athletes/groups APIs, `schedule-conflicts.ts`, `permissions.ts`, reports, tests | Data reconciliation likely; destructive removal no | M | High if partial | CORE ICP |
| Broken additional enrollment | Send/derive verified academy ID; authorize it; validate secondary membership via `athlete_sport_configs`; add UI/API contract test | Current UI request fails and blocks multiple classes | `EnrollmentManager.tsx`, class-enrollment API, tests | No | S | Low | CORE ICP |
| Capacity disagreement | Create one distinct class-roster/capacity service including base group and direct enrollment; use it for enroll, alerts, reports, waitlist and UI; transact capacity check + insert | Prevent oversell and false availability | class enrollment/waitlist APIs, alerts, reports, UI, tests | No unless constraints added | M | Medium | CORE ICP |
| Multi-activity fees | Generate from active billable group memberships; retain billing-source/line provenance; change duplicate key accordingly | Akros sells multiple activities | charge generator, fee service, charges/billing-items schema, tests | **Probably yes**, additive | M/L | High around money | CORE ICP |
| External camp intake | Let registration identify internal athlete or minimal external participant + guardian/contact; enforce capacity/waitlist/payment consistently | Explicit 60-person mixed-audience camp | event registration schema/API/UI/public form/tests | **Yes**, additive | M | Medium, privacy/consent | COMMON |
| Acceptance proof | Add one Akros-like fixture/scenario: multi-group athlete, two simultaneous groups, monthly fees, full class, waitlist, external camp; run API + browser E2E | Prevents another table-only readiness claim | test fixtures and E2E only | No production migration | M | Low | CORE ICP |

This is the smallest viable P0. Facilities, seasons, progression ledger and coach substitution stay out unless discovery proves they block day-one Akros operations.

## 23. Recommended Priorities

### P0 — AKROS READY

1. Canonicalize enrollment/membership reads and writes.
2. Repair additional class enrollment and secondary-sport validation.
3. Canonicalize and transact capacity/waitlist logic.
4. Make recurring billing correct for multiple billable groups/activities.
5. Add minimal external camp participant registration.
6. Prove the complete Akros scenario with API and browser E2E, including money and capacity assertions.

### P1 — CLEARLY BETTER

- Facility/training-area entity with overlap and capacity warnings.
- Enrollment effective dates/status and historical roster.
- Explicit internal-level versus federation-category UI.
- Session-level temporary coach substitution.
- Real-user parent/athlete portal acceptance test.

### P2 — GROWTH

- Occupancy by timeslot, revenue by program/group, family aggregation, trial conversion and waitlist conversion.
- Progression transition history and time-in-level.
- Event daily schedule/staff roster if camps validate demand.

### P3 — FUTURE INTELLIGENCE

- Federation import/export/integration.
- Eligibility assistance, class matching, cross-sell and demand prediction after reliable data accumulates.

## 24. Architecture Decision

**YES WITH CHANGES**

The current Zaltyko domain model is structurally sufficient for recreational, competitive and hybrid gymnastics academies for the next 2-3 years **if** enrollment becomes canonical and billable participation, capacity and event participants are made explicit.

It does not need a rewrite. The sport configuration model, groups/classes/sessions split, athlete-sport join, assessments, events, licenses and results are appropriate foundations. The main architectural debt is transitional duplication: a single-group athlete field remains embedded in logic after introduction of M:N membership. Leaving that unresolved would block multi-activity operation and corrupt later analytics.

An additive migration is likely for billing-source provenance and external event participants. A season/effective-date model is P1/P2, not P0. Facilities should be a small general entity, not an ERP subsystem.

## 25. Final Recommendation to Paperclip CEO

### Current state

Zaltyko is a substantial product, not a prototype: it has secure multi-tenant foundations, operational academy surfaces and a rich gymnastics-oriented model. Its strongest areas are athlete/guardian records, groups/classes/sessions, attendance, assessments, communication, general events and configurable sport taxonomy.

### Customer readiness

Do not position Akros as ready to replace its primary operational stack tomorrow. Position it as a design partner or controlled pilot only after P0 passes a production-like acceptance scenario. Current coverage is approximately 65% and is uneven: visible feature breadth is high, but enrollment, capacity and billing reliability are below system-of-record standard.

### Critical blockers

Canonical enrollment, functional multi-class/multi-sport registration, correct capacity, correct multi-activity tuition, and external camp intake.

### Minimum viable changeset

Six bounded deliverables: one membership resolver, one repaired enrollment contract, one capacity service, one multi-group billing correction, one minimal external participant path, and one Akros end-to-end acceptance suite.

### Architecture changes

Make `group_athletes` authoritative; add only the billing and event-participant fields/tables needed for demonstrated workflows. Do not rewrite sport configuration or split every activity into its own module.

### Things to defer

Federation integration, AI matching, predictive analytics, complex pricing rules, a full season engine, advanced facility booking, and separate camp/clinic products.

### Risks

The greatest risk is implementing isolated fixes while preserving conflicting sources of truth. Money and capacity changes require transaction/concurrency tests and reviewed additive migrations. External child data requires privacy, consent and retention review. The dirty working tree means implementation must first isolate parallel work and establish a reproducible baseline.

### Recommended execution order

1. Freeze and document membership semantics.
2. Reconcile data read-only, design the additive migration, and add failing contract tests.
3. Fix enrollment + permissions + schedule conflict.
4. Centralize capacity and waitlist transactions.
5. Correct billing and verify duplicate/concurrency behavior.
6. Add external camp participant intake with privacy review.
7. Run the Akros acceptance suite with representative, non-production fixtures.
8. Pilot one timetable cycle before declaring primary-system readiness.

## Mandatory Decisions

1. **¿Puede Akros comprar Zaltyko mañana?** Puede contratar un piloto condicionado; **no** debería adoptarlo mañana como sistema principal.
2. **¿Cuáles son los cinco principales motivos?** Base de dominio fuerte; matrícula con dos fuentes de verdad; capacidad inconsistente; facturación multi-actividad no fiable; campamentos externos sin flujo de participante.
3. **¿Cuáles son los blockers reales?** Matrícula canónica, alta adicional/multideporte, capacidad/lista de espera, cuotas multigrupo y participantes externos de eventos.
4. **¿Cuál es el Minimum Viable Changeset?** Los seis entregables P0 de la sección 22, sin facilities, seasons ni ERP federativo.
5. **¿Qué porcentaje aproximado de la operación de Akros cubre Zaltyko actualmente?** **65%**, estimación basada en capacidades operables, no en tablas.
6. **¿Qué porcentaje cubriría después de P0?** **85%** aproximadamente, suficiente para un piloto como sistema principal con procedimientos manuales controlados.
7. **¿Los cambios P0 son generalizables al ICP?** Sí; todos son CORE ICP o COMMON.
8. **¿Necesitamos modificar el domain model?** Sí, de forma acotada: autoridad de enrollment, procedencia facturable y participante externo. No necesita rewrite.
9. **¿Necesitamos migrations?** Probablemente dos migraciones aditivas y revisadas: billing-source/line provenance y participantes externos; además de una reconciliación de datos de membership. No migración destructiva en P0.
10. **¿Qué NO debemos construir?** ERP/integración RFEG, enums españoles hardcoded, módulos separados por tipo de evento, AI/predicción, pricing rules engine y facility ERP.
11. **¿Existe alguna decisión arquitectónica actual que pueda bloquearnos en el futuro?** Sí: mantener `athletes.group_id` como fuente operativa junto a `group_athletes`; también la identidad `profileId` de event registration y la licencia polimórfica sin FK. Son corregibles sin rewrite.
12. **¿Cuál debería ser el siguiente caso real que validemos para evitar overfitting a Akros?** Una academia española de gimnasia rítmica de 150-250 atletas, recreativa + conjuntos competitivos, con dos sedes o salas, temporadas de matrícula, cuotas familiares y sin oferta amplia de danza/aéreo. Contrasta multi-sede, conjuntos, seasonality y familia sin repetir el mix particular de Akros.

## Audit Limitations

- This was a repository audit, not a live production-data audit and not a staffed usability test.
- The working tree contained unrelated parallel changes before the audit; none were modified.
- No Akros pricing sheet, room plan, roster, consent forms or federation workflow interview was supplied. Recommendations deliberately stop before those assumptions.
- Percentages are reasoned readiness estimates, not telemetry.

Vault: no se actualizó; el entregable exigido es este informe en `docs/audits/` y la tarea prohíbe cambios adicionales. El borrador preliminar ya existente en `vault/07-Auditorias-y-Riesgos/` se conservó intacto.

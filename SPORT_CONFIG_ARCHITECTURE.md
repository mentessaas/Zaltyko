# Sport Config Architecture

Zaltyko now separates sports configuration from product logic. The goal is to let one academy activate one or more country/discipline/branch configurations without hardcoding apparatus, programs or terminology in components.

## Model

The normalized hierarchy is:

`countries -> sport_disciplines -> sport_branches -> sport_locale_configs`

Each `sport_locale_configs` row owns isolated child data:

- `terminology_dictionary`
- `apparatus`
- `programs`
- `levels`
- `categories`
- `competition_types`

An academy activates reusable configs through `academy_sport_configs`. This is the operational join table that allows one academy to run, for example, Spain GAF and Spain GAM at the same time.

Groups reference an active academy config with `groups.sport_config_id` plus optional `program_code`, `level_code` and `category_code`. Athletes can reference a primary config with `athletes.primary_sport_config_id` and multiple configs through `athlete_sport_configs`. Assessments store the config used at evaluation time in `athlete_assessments.sport_config_id`.

Coaches can be scoped to one or more academy sport configs through `coach_sport_configs`. No rows means unrestricted legacy behavior, so existing coaches keep working across all branches. Once rows exist for a coach, group and class assignments must match one of those sport configs.

## Compatibility

Existing fields are kept:

- `academies.disciplineVariant`
- `academies.discipline`
- `academies.academyType`
- `groups.discipline`
- `athletes.level`

They remain as compatibility fields while modules migrate progressively to `academy_sport_configs`. New code should prefer `sportConfigId` and config codes.

## Seeded Configurations

Initial seed data lives in `src/lib/sport-config/catalog.ts` and is persisted by `src/lib/sport-config/seed.ts`.

Seeded combinations:

- `ES:artistic_female`
- `ES:artistic_male`
- `ES:rhythmic`

These are independent objects. Changing rhythmic terminology, programs or apparatus does not mutate artistic female or artistic male.

## Runtime Usage

Use `getAcademySportConfigOptions(academyId)` from `src/lib/sport-config/service.ts` to load active configurations for UI/API flows.

Use `verifyAcademySportConfig({ academyId, tenantId, sportConfigId })` before saving group data. The groups API validates:

- the selected config belongs to the academy and tenant
- selected program is active for that config
- selected apparatus belongs to that config

Use `src/lib/sport-config/validation.ts` for branch-scoped checks instead of duplicating comparisons in route handlers. It validates program, level, category and apparatus codes, including academy-level active code overrides.

Athlete creation follows the same contract:

- if a group is selected, the athlete inherits the group's sport config, program, level and category unless explicit values are sent
- if no group is selected, the UI/API can assign any active academy sport config
- selected program, level and category are validated against that isolated config
- `athlete_sport_configs` receives a row for the active athlete/config assignment

Athlete editing preserves that contract. Moving an athlete to a group with `sport_config_id` updates the athlete's primary sport config and inherited program/level/category unless the request explicitly sends different sport codes. This keeps day-to-day group changes aligned with the branch-specific setup. The legacy `athletes.level` field remains for older screens, but configured athletes should be read through `primary_sport_config_id`, `program_code`, `level_code` and `category_code`.

Bulk import/export uses the same rules. CSV import keeps the legacy columns (`name`, `academyId`, `dob`, `level`, `status`) and also accepts:

- `groupId` or `groupName`
- `sportConfigId` or `sportConfigCode`
- `programCode`
- `levelCode`
- `categoryCode`

When a group is provided, its sport config and codes are inherited. When a sport config is provided directly, it must be active for the academy. Program, level and category codes are validated against that isolated config before the athlete is created. XLSX export includes both human-readable values and stable IDs/codes so exported data can be re-imported without losing branch assignments.

Classes and weekly schedule also carry sport context through `classes.sport_config_id`. A class can inherit its sport config from a linked group, or receive an explicit `sportConfigId`. Apparatus saved on a class is normalized to apparatus codes and, when a sport config is present, every apparatus must belong to that active config. A class cannot silently mix groups from different sport configs; if multiple branch groups are intentionally combined, the request must send an explicit sport config so the apparatus set remains deterministic.

Class sessions preserve that context in `class_sessions.sport_config_id`. Manually created and generated sessions copy the current class sport config so attendance remains auditable even if a class is later edited. Attendance writes are validated against the class roster produced by `getClassAthletes()`: an athlete must belong to the session's class, and if both the session/class and athlete have sport configs, they must match. Extra class enrollments follow the same rule and reject athletes from another branch.

Coach assignments use the same separation rule. `assertCoachesCanHandleSportConfig()` validates writes from group creation/editing, class editing and direct coach-class assignment. A scoped GAF coach cannot be assigned to a GAM or GR group/class unless that branch is added to the coach scope. The coaches UI exposes this as "Ramas habilitadas" and operational group/class/session forms filter available coaches by `coach_sport_configs`; coaches with no scope rows remain available for all branches as legacy/unrestricted behavior.

The coaches list accepts `sportConfigId` as an audit filter. A concrete config shows coaches scoped to that branch plus unrestricted coaches, while `sportConfigId=unscoped` shows only coaches with no branch scope rows so admins can finish sport assignment intentionally.

Reports expose `sportConfigId` as a filtering dimension where sport separation matters:

- attendance reports and exports filter by session/class sport config and include `bySportConfig` in general stats
- progress reports filter assessments by `athlete_assessments.sport_config_id`
- churn reports filter athletes by `athletes.primary_sport_config_id`
- class reports filter classes by `classes.sport_config_id`
- report filter options return active sport configs plus sport config ids on classes, groups and athletes

This lets a mixed academy read GAF, GAM and GR metrics separately without changing the default unfiltered report behavior.

Events, competitions and licenses are also sport-aware:

- `events.sport_config_id` links a competition/event to one academy branch
- `events.competition_type_code` stores the configured competition type for that branch
- `federative_licenses.sport_config_id` stores the branch for athlete/coach licenses
- `competition_results.sport_config_id` preserves the branch context of a result

Event creation/editing validates that the selected sport config belongs to the academy. If a configured competition type is submitted, it must belong to that sport config. The event form loads active academy configs and displays branch-specific competition types instead of hardcoding them in the component. Licenses inherit the athlete primary sport config when possible and validate explicit sport configs against the person's academy. The licenses page can create athlete licenses with an explicit branch selector, or leave the branch blank so the API inherits the athlete primary sport config.

Competition results are handled through `/api/competition-results`. Result creation resolves the sport config from the explicit payload, the event or the athlete primary config. If an event already has a sport config, the result must match it. If an athlete has configured sport assignments, the selected result sport config must be one of them. Apparatus values are normalized to apparatus codes and rejected when they do not belong to the selected branch. The event detail page includes a minimal results panel that lists and creates results with the event branch apparatus. Athlete detail also exposes a competition history tab that filters results by active branch and renders apparatus labels from the selected config.

WhatsApp communication can also be segmented by sport config. The WhatsApp page loads classes, groups and athlete recipients with `sport_config_id`, exposes a branch selector, and sends `sportConfigId` to `/api/whatsapp/send`. The API resolves recipients again on the server by academy, recipient type and branch before sending, so a client cannot broaden a GAF/GAM/GR message by tampering with selected recipient ids.

Communication templates follow the same isolation rule. `message_templates.sport_config_id` is nullable: `null` means a global tenant template, while a value points to one active academy sport config. `/api/communication/templates` can list global templates plus branch templates, create branch-specific templates after validating the academy config, and update that scope later. The WhatsApp UI receives resolved templates as data and filters them by the selected branch; default templates live in `src/lib/communication/default-whatsapp-templates.ts`, not inside the component.

Communication history is auditable by branch through `message_history.sport_config_id`. WhatsApp bulk sends write the resolved athlete branch into the history row, `/api/communication/history` can filter by `sportConfigId`, and both the WhatsApp history tab and the generic communication history component can display branch-scoped records. `message_history.meta` still stores contextual details, but filtering should use the column.

Academy settings include an operational sport configuration dashboard backed by `/api/academies/[academyId]/sport-dashboard`. It summarizes active configs and counts athletes, groups, classes, scoped coaches, licenses and messages by branch. It also surfaces legacy gaps where athletes, groups or classes still lack a sport config, and coaches without `coach_sport_configs` scope rows, so migrations and scope audits can be handled intentionally instead of silently mixing branches.

Legacy sport assignment is handled by `/api/academies/[academyId]/sport-migration` and the settings migration assistant. It lists athletes, groups and classes without sport config and coaches without `coach_sport_configs` scope rows, then lets an admin assign an active academy sport config by selection or by category-wide batch. Athlete migration also writes `athlete_sport_configs` so multi-branch queries stay consistent. Coach migration creates the first scope row and changes that coach from unrestricted legacy behavior to branch-scoped behavior. The assistant only assigns the branch; program, level and category should be refined separately when needed.

Owner onboarding creates sport-aware academies from the same catalog. The form derives available branches from `SPORT_CONFIG_SEEDS` for the selected country, lets the owner activate multiple branches, and sends selected program/apparatus codes per branch. `/api/onboarding/owner` activates each branch through `activateAcademySportConfig()`, which stores sanitized `active_program_codes` and `active_apparatus_codes` on `academy_sport_configs`. Starter groups and starter classes created during onboarding receive the resolved `sport_config_id`, so a new mixed GAF/GAM/GR academy does not start with legacy unscoped operational data.

Academy settings can update active programs and apparatus per active branch after onboarding. The UI renders all available options from the sport catalog for the selected country/variant and sends `activeProgramCodesByVariant` plus `activeApparatusCodesByVariant` to `/api/academies/[academyId]/settings`. The API sanitizes those codes against the selected seed and blocks destructive deactivation when an existing athlete/group uses a program or when groups, classes, assessments or competition results already use an apparatus. Settings GET also returns `usedProgramCodes` and `usedApparatusCodes` per config so the UI can mark those options as in use and prevent unchecking them before submit. This keeps branch configuration editable without silently invalidating operational or historical data.

Visible sport terminology should be resolved through `src/lib/sport-config/terminology.ts`. Components receive a sport config or selected sport config id, call `getTerminology()` / `getTerminologyForSportConfig()`, and render generic keys such as `athlete`, `athletes`, `group`, `groups`, `apparatus`, `coach`, `license` and `branch`. This avoids hardcoding "Atletas", "Grupos" or "Aparatos" in operational UI when a branch or recreational academy needs local language like "Gimnastas", "Grupo de entrenamiento", "Conjunto" or "Alumnos/as".

Academy-specific terminology customization is stored on `academy_sport_configs.terminology_overrides`. Settings exposes those overrides per active branch and submits them as `terminologyOverridesByVariant`. The API sanitizes the payload against the supported terminology keys before saving. Overrides are merged over the base `terminology_dictionary` for that country/discipline/branch, so changing terms for one academy's Spain + GR setup does not mutate Spain + GAF/GAM or any other academy using the same base catalog. Settings also renders a small operational preview from the same terminology keys and warning helpers, so admins can see button labels, table headers and common empty states before saving inconsistent terms.

Main operational lists also accept `sportConfigId` as a first-class filter. Athlete, group and class pages and APIs keep the filter in the URL, apply it server-side, and show the branch label in rows/cards where sport context is available. This makes dashboard links such as `/athletes?sportConfigId=...`, `/groups?sportConfigId=...` and `/classes?sportConfigId=...` safe for mixed GAF/GAM/GR academies. Creation dialogs opened from a filtered list receive that `sportConfigId` as their initial branch so new athletes, groups and classes do not accidentally start in a different configuration. Edit dialogs clear or filter branch-dependent fields when the branch changes: program, level, category, apparatus and incompatible group selections must not survive a branch switch.

Athlete and group create/edit dialogs should resolve terminology from the selected `sportConfigId` and use fallback terminology only when a record has no branch yet. This keeps modal titles, save buttons, empty states, helper copy, level/category labels and coach/group/athlete labels aligned with the branch being edited. For example, changing Spain + GR terminology from "Grupo" to "Conjunto" should affect the group dialog for that branch without changing GAF/GAM dialogs.

Class, session and attendance flows follow the same rule. Class create/edit dialogs resolve terms from the selected class/group sport config for group, coach and apparatus labels. Class detail loads active sport configs server-side and passes them to session and attendance dialogs so attendance labels, branch selectors and extra athlete enrollment copy can use the same terminology. If a class has no sport config yet, the UI falls back to generic terminology until the branch is selected.

Athlete detail, technical assessment and competition result screens should resolve terminology from the athlete/event sport config. Athlete detail receives the athlete primary sport config and group sport config, then uses the resolved terminology for athlete, level, attendance and competition labels. Assessment forms receive the selected config terminology from the server page and use it for apparatus and athlete-facing copy. Competition result panels receive event sport terminology so athlete/apparatus/competition labels match the configured branch.

Licenses, coaches and WhatsApp communication also consume branch terminology where sport config context is available. License creation resolves athlete/license labels from the selected or inherited sport config. Coach list and create/edit dialogs use the selected branch terminology for coach and group labels while keeping unscoped coaches available across branches. WhatsApp message composition accepts sport config terminology and uses it for athlete, parent and group recipient copy.

Reports consume the same terminology layer. The reports hub resolves base terminology from the academy's active sport configs for cards such as attendance, progress, coach and athlete totals. Shared report filters load active sport configs from `/api/reports/filter-options` and update athlete, group and coach filter labels from the selected branch. Attendance reports include a branch selector, pass `sportConfigId` to generation and export endpoints, and render attendance/athlete/group labels from that branch. Coach reports receive active configs from the server page and update coach, athlete and attendance labels as the branch filter changes.

Student billing follows branch separation through the charged athlete. `charges` does not need its own sport config column for the current model because each row belongs to an athlete; `/api/charges` accepts `sportConfigId` and filters by `athletes.primary_sport_config_id`. Monthly charge generation accepts the same `sportConfigId`, so a mixed academy can generate charges only for GAF, GAM or GR without creating charges for the other branches. The billing UI loads active sport configs server-side, exposes a branch selector in the student charges tab, filters groups and manual charge athlete selection by that branch, and resolves athlete/group/payment labels through the terminology dictionary. SaaS subscription plans remain global academy billing and should not be treated as branch-specific unless the product model changes.

Scholarships and discount usage history also derive branch scope from the athlete. `/api/scholarships` accepts `sportConfigId` and filters scholarship rows through the joined athlete's `primary_sport_config_id`. The scholarships page loads active sport configs, filters eligible athletes for the form by branch, and renders athlete terminology from the selected config. `/api/discounts/usage` accepts `sportConfigId`, resolves matching athlete ids, and filters usage rows before calculating totals. Discount definitions and campaigns remain academy-global for now; making a discount itself branch-specific would need explicit product rules for applicability, stacking and campaign targeting.

Assessment creation resolves the sport config in this order:

1. explicit `sportConfigId` from the form
2. `athletes.primary_sport_config_id`
3. `groups.sport_config_id`

If a config is resolved, the submitted apparatus must belong to that config's active apparatus list. This prevents, for example, a rhythmic athlete from being evaluated on GAM-only apparatus.

## Adding A New Country Or Branch

1. Add a new config object to `SPORT_CONFIG_SEEDS`.
2. Run `seedSportConfigurations()` or `pnpm db:seed`.
3. Activate it for an academy with `activateAcademySportConfig`.
4. Use `sportConfigId` in groups and athlete assignments.

For a future database-managed admin UI, write changes to the normalized tables directly instead of editing `catalog.ts`. Components should not need changes because they consume generic keys and active config rows.

## Onboarding

Current onboarding still has a primary `disciplineVariant` for compatibility, but it can accept `activeDisciplineVariants` and activates all selected configurations. Settings exposes the same concept as "Ramas activas".

## Safety Rule

Do not put country, apparatus, programs or user-facing sports terminology directly inside product components. Components should read generic labels and options from `specialization` or `getAcademySportConfigOptions`.

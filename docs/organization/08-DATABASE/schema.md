# Database Schema - 77 Tables

## Overview

Drizzle ORM with PostgreSQL (Supabase). Schema in `src/db/schema/`.

## Core Tables

### Users & Auth
| Table | Description |
|-------|-------------|
| `profiles` | User profiles with role |
| `authUsers` | Supabase auth reference |
| `memberships` | User-academy membership |
| `invitations` | Pending invitations |

### Academy
| Table | Description |
|-------|-------------|
| `academies` | Academy/gym data |
| `academy_geo_groups` | Geographic grouping |

### Athletes & Groups
| Table | Description |
|-------|-------------|
| `athletes` | Athlete records |
| `groups` | Training groups |
| `group_athletes` | Athlete-group junction |
| `guardians` | Parent/guardian contacts |
| `guardian_athletes` | Guardian-athlete links |

### Classes
| Table | Description |
|-------|-------------|
| `classes` | Class templates |
| `class_sessions` | Scheduled sessions |
| `class_enrollments` | Active enrollments |
| `class_waiting_list` | Waiting list |
| `class_weekdays` | Recurrence days |
| `class_exceptions` | Holidays/cancellations |
| `class_groups` | Group-class links |
| `class_coach_assignments` | Coach-class links |

### Attendance
| Table | Description |
|-------|-------------|
| `attendance_records` | Presence tracking |

### Events
| Table | Description |
|-------|-------------|
| `events` | Event data |
| `event_registrations` | Registrations |
| `event_waitlist` | Waiting list |
| `event_categories` | Event categories |
| `event_payments` | Payment tracking |
| `event_invitations` | Invitations |
| `event_logs` | Activity logs |

### Billing
| Table | Description |
|-------|-------------|
| `plans` | Subscription plans |
| `subscriptions` | User subscriptions |
| `charges` | Monthly charges |
| `billing_items` | Line items |
| `billing_invoices` | Stripe invoices |
| `billing_events` | Stripe events |
| `discounts` | Discount rules |
| `discount_campaigns` | Campaign discounts |
| `scholarships` | Financial aid |
| `receipts` | Local receipts |

### Assessments
| Table | Description |
|-------|-------------|
| `athlete_assessments` | Assessment records |
| `assessment_scores` | Scores |
| `assessment_videos` | Video attachments |
| `assessment_rubrics` | Rubric definitions |
| `rubric_criteria` | Criteria |
| `skill_catalog` | Skills catalog |

### Communication
| Table | Description |
|-------|-------------|
| `notifications` | In-app notifications |
| `conversations` | Direct messages |
| `conversation_messages` | Message history |
| `academy_messages` | Academy broadcasts |
| `announcements` | Announcements |
| `email_logs` | Email tracking |

### Support
| Table | Description |
|-------|-------------|
| `support_tickets` | Tickets |
| `ticket_responses` | Responses |
| `ticket_attachments` | Attachments |

### Other
| Table | Description |
|-------|-------------|
| `empleo_listings` | Job listings |
| `empleo_applications` | Applications |
| `marketplace_listings` | Marketplace items |
| `advertisements` | Ads |
| `leads` | Landing page leads |
| `audit_logs` | System audit logs |
| `scheduled_reports` | Report schedules |

## Key Patterns

### Tenant Isolation

All sensitive tables have `tenant_id` column:

```typescript
const athletes = pgTable('athletes', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => academies.id),
  // ...
});
```

### Enums

Enums defined in `enums.ts`:
- `profileRoleEnum`: super_admin, admin, owner, coach, athlete, parent
- `subscriptionStatusEnum`: active, past_due, trialing, canceled, incomplete
- `eventStatusEnum`: draft, published, cancelled, completed

## Migrations

```bash
pnpm db:generate  # Create migration
pnpm db:migrate   # Apply to database
pnpm db:studio    # Open DB browser
```

## Deprecated Fields

| Table | Field | Replacement |
|-------|-------|-------------|
| athletes | groupId | groupAthletes |
| events | country/province/city | countryName/provinceName/cityName |
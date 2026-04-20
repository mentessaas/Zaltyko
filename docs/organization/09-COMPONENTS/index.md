# Components Index

## Overview

~250 React components organized by domain.

## Base UI (shadcn/ui)

```
src/components/ui/
├── button.tsx, card.tsx, dialog.tsx
├── input.tsx, label.tsx, select.tsx
├── table.tsx, tabs.tsx, badge.tsx
├── avatar.tsx, alert.tsx, progress.tsx
├── dropdown-menu.tsx, popover.tsx
├── skeleton.tsx, toast-provider.tsx
└── (53 files total)
```

Custom additions:
- `combobox.tsx` - Searchable select
- `data-table.tsx` - Generic table
- `date-picker.tsx` - Date picker
- `file-upload.tsx` - File upload
- `modal.tsx` - Modal wrapper
- `page-header.tsx` - Page header

## Module Components

### Athletes (~23 components)
```
src/components/athletes/
├── AthletesTableView.tsx, AthletesKanbanView.tsx
├── CreateAthleteDialog.tsx, EditAthleteDialog.tsx
├── GuardianManager.tsx, ImportExportPanel.tsx
├── AthleteDetailTabs.tsx, ProgressTimeline.tsx
├── DocumentUploadModal.tsx, AthleteDocumentsList.tsx
└── (more)
```

### Classes (~17 components)
```
src/components/classes/
├── ClassesClientView.tsx, ClassesTableView.tsx
├── ClassesCalendarView.tsx, ClassesDashboard.tsx
├── CreateClassDialog.tsx, EditClassDialog.tsx
├── AttendanceDialog.tsx, EnrollmentManager.tsx
└── (more)
```

### Events (~16 components)
```
src/components/events/
├── EventForm.tsx, EventsList.tsx, EventCard.tsx
├── EventsFilters.tsx, EventRegistrationsPanel.tsx
├── InvitationCard.tsx, WaitlistPosition.tsx
└── (more)
```

### Billing (~24 components)
```
src/components/billing/
├── BillingPanel.tsx, BillingSummary.tsx
├── PlanSelector.tsx, InvoiceList.tsx
├── CreateChargeDialog.tsx, DiscountManager.tsx
├── CampaignManager.tsx, ScholarshipManager.tsx
└── (more)
```

### Dashboard (~35 components)
```
src/components/dashboard/
├── DashboardPage.tsx, DashboardCard.tsx, Sidebar.tsx
├── AttendanceRiskWidget.tsx, WelcomeBanner.tsx
├── AdvancedMetrics.tsx, RevenueTrendChart.tsx
├── QuickActions.tsx, UpcomingClasses.tsx
└── (25+ more widgets)
```

### Landing (~12 components)
```
src/components/landing/
├── ClusterHeroSection.tsx, ClusterPainPointsSection.tsx
├── AcademyCard.tsx, CoachCard.tsx, EventCard.tsx
├── ClusterAcademiesSection.tsx, ClusterCTASection.tsx
└── (more)
```

### Other Modules
| Module | Components |
|--------|------------|
| `coaches/` | 11 |
| `assessments/` | 11 |
| `groups/` | 9 |
| `reports/` | 11 |
| `public/` | 14 |
| `onboarding/` | 12 |
| `my-dashboard/` | 6 |
| `navigation/` | 4 |
| `settings/` | 5 |
| `support/` | 6 |
| `whatsapp/` | 4 |
| `chat/` | 2 |
| `calendar/` | 2 |
| `empleo/` | 3 |
| `marketplace/` | 3 |
| `messages/` | 5 |
| `notifications/` | 7 |
| `advertising/` | 1 |
| `analytics/` | 1 |
| `announcements/` | 1 |
| `audit/` | 1 |
| `providers/` | 2 |
| `shared/` | 4 |
| `search/` | 2 |
| `sessions/` | 1 |
| `tooltips/` | 1 |

## Pattern: Memoization

Landing components should be memoized:

```typescript
import { memo } from 'react';

const EventCard = memo(function EventCard({ event }: Props) {
  return (...);
});

export default EventCard;
```

## Deprecated/Unused

| Component | Status |
|-----------|--------|
| `CheckoutButton.tsx` | Unused |
| `ContactForm.tsx` | Unused |
| `lemon-button.tsx` | Unused |
| `register-form.tsx` | Duplicate |
| `landing/EventCard.tsx` | Unused (use events/EventCard) |
| `landing/AcademyCard.tsx` | Unused |
| `landing/CoachCard.tsx` | Unused |
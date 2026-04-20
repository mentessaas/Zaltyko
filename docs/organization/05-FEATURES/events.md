# Events Module

## Overview

Event management: competitions, workshops, camps with registration and invitations.

## Key Files

### Pages
```
src/app/app/[academyId]/events/
├── page.tsx                    # List events
├── new/page.tsx               # Create event
└── [eventId]/
    ├── page.tsx               # Event detail
    ├── edit/                  # Edit event
    ├── register/              # Registration page
    └── invitations/           # Invitation management
```

### Components
```
src/components/events/
├── EventForm.tsx              # Create/edit form
├── EventsList.tsx             # List view
├── EventCard.tsx              # Card display
├── EventsFilters.tsx          # Filter/search
├── EventRegistrationsPanel.tsx # Registrations list
├── EventNotifications.tsx     # Send notifications
├── RegistrationChart.tsx      # Registration chart
├── WaitlistPosition.tsx       # Waitlist display
├── CategorySelector.tsx       # Category picker
├── EventStatusBadge.tsx       # Status display
└── LocationSelect.tsx         # Location picker
```

### Libraries
```
src/lib/notifications/
├── event-recipients.ts        # Get recipients
├── event-email-content.ts    # Email templates
└── eventsNotifier.ts         # Notification sender
```

## Event Types

| Type | Description |
|------|-------------|
| `competitions` | Competitive events |
| `courses` | Educational courses |
| `camps` | Training camps |
| `workshops` | Workshop sessions |
| `clinics` | Specialized clinics |
| `evaluations` | Assessment events |
| `other` | Miscellaneous |

## Registration Flow

```
Athlete registers → event_registration (status: confirmed)
                         ↓
              If capacity full → waiting_list
                         ↓
              Payment → event_payments
```

## Invitations

Invite athletes/coaches to events:
- Email invitations with tracking
- Status: pending, viewed, registered, declined
- Follow-up reminders

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/events` | List events |
| POST | `/api/events` | Create event |
| GET | `/api/events/[id]` | Event details |
| PUT | `/api/events/[id]` | Update event |
| DELETE | `/api/events/[id]` | Delete event |
| POST | `/api/events/[id]/registrations` | Register |
| GET | `/api/events/[id]/registrations` | List registrations |
| DELETE | `/api/events/[id]/registrations/[regId]` | Cancel registration |
| POST | `/api/events/[id]/waitlist` | Join waiting list |
| GET | `/api/events/[id]/waitlist` | Get waiting list |
| GET | `/api/events/[id]/categories` | Event categories |
| POST | `/api/events/[id]/notify` | Send notification |
| GET | `/api/events/[id]/stats` | Registration stats |

## Public Events API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/public/events` | List public events |
| GET | `/api/public/events/[id]` | Event details |
| POST | `/api/public/events/[id]/contact` | Contact organizer |

## Related Tables

- `events` - Event data
- `event_registrations` - Registrations
- `event_waitlist` - Waiting list
- `event_categories` - Categories
- `event_payments` - Payment tracking
- `event_invitations` - Invitations
- `event_logs` - Activity logs
# Classes Module

## Overview

Class management with recurring sessions, enrollment, attendance, and waiting list.

## Key Files

### Pages
```
src/app/app/[academyId]/classes/
├── page.tsx                    # List classes
└── [classId]/
    ├── page.tsx               # Class detail
    ├── edit/                  # Edit class
    └── recurring/            # Recurring sessions
```

### Components
```
src/components/classes/
├── ClassesClientView.tsx       # Main list view
├── ClassesTableView.tsx        # Table format
├── ClassesCalendarView.tsx     # Calendar view
├── ClassesDashboard.tsx        # Dashboard widget
├── CreateClassDialog.tsx       # Create form
├── EditClassDialog.tsx         # Edit form
├── AttendanceDialog.tsx        # Take attendance
├── EnrollmentManager.tsx        # Manage enrollments
├── WaitingListDialog.tsx        # Waiting list
├── RecurringSessionsManager.tsx # Session generator
└── CreateSessionDialog.tsx     # Create single session
```

### Libraries
```
src/lib/classes/
├── class-utils.ts              # Class helpers
├── get-class-athletes.ts      # Get enrolled athletes
└── schedule-conflicts.ts       # Schedule validation

src/lib/sessions-generator.ts   # Generate recurring sessions
```

## Concepts

### Class vs Session

- **Class** (`classes` table): Template with recurring schedule
- **ClassSession** (`class_sessions` table): Concrete instance (e.g., "Gimnasia Nivel 2 - Monday April 14, 2026")

### Enrollment Flow

```
Athlete → ClassEnrollment → ClassSession → AttendanceRecord
              ↓
        WaitingList (if full)
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/classes` | List classes |
| POST | `/api/classes` | Create class |
| GET | `/api/classes/[id]` | Class details |
| PUT | `/api/classes/[id]` | Update class |
| DELETE | `/api/classes/[id]` | Delete class |
| POST | `/api/class-enrollments` | Enroll athlete |
| DELETE | `/api/class-enrollments/[id]` | Unenroll |
| GET | `/api/class-sessions` | List sessions |
| POST | `/api/class-sessions` | Create session |
| GET | `/api/class-sessions/[id]` | Session details |
| PUT | `/api/class-sessions/[id]` | Update session |
| POST | `/api/class-waiting-list` | Join waiting list |
| DELETE | `/api/class-waiting-list/[id]` | Leave waiting list |

## Related Tables

- `classes` - Class templates
- `class_sessions` - Scheduled sessions
- `class_enrollments` - Active enrollments
- `class_waiting_list` - Waiting list entries
- `attendance_records` - Attendance tracking
- `class_weekdays` - Recurrence days
- `class_exceptions` - Holidays/cancellations
- `class_groups` - Class-group assignments
- `class_coach_assignments` - Coach assignments

## Related Docs

- [Athletes Module](./athletes.md) - Enrollment management
- [Dashboard & Reports](./dashboard-reports.md) - Attendance reports
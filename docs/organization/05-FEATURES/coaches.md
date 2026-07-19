# Coaches Module

## Overview

Coach management with public profiles, class assignments, and notes.

## Key Files

### Pages
```
src/app/app/[academyId]/coaches/
├── page.tsx                    # List coaches
├── today/                     # Today's classes
└── [coachId]/
    └── public-settings/       # Public profile settings
```

### Components
```
src/components/coaches/
├── CoachesTableView.tsx       # List view
├── CreateCoachDialog.tsx      # Create form
├── EditCoachDialog.tsx        # Edit form
├── CoachPublicProfileEditor.tsx # Public profile
├── CoachNotesManager.tsx      # Notes on athletes
├── PublicCoachProfile.tsx     # Public display
├── CoachTodayView.tsx         # Today's schedule
├── CoachAssignmentsPanel.tsx  # Class assignments
├── CertificationsSection.tsx  # Certifications
└── PhotoGallery.tsx           # Photo gallery
```

## Features

### Public Profiles

Coaches can have public profiles visible on the landing page:
- Bio, photo, specialties
- Certifications, achievements
- Social links

### Class Assignments

```typescript
// class_coach_assignments table links coaches to classes
ClassCoachAssignment {
  classId: uuid;
  coachId: uuid;
  tenantId: uuid;
}
```

### Notes

Coaches can create private notes on athletes (visible to admin/coach only):

```typescript
// coach_notes table
CoachNote {
  id: uuid;
  tenantId: uuid;
  coachId: uuid;
  athleteId: uuid;
  content: string; // Markdown
  createdAt: timestamp;
}
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/coaches` | List coaches |
| POST | `/api/coaches` | Create coach |
| GET | `/api/coaches/[id]` | Coach details |
| PUT | `/api/coaches/[id]` | Update coach |
| DELETE | `/api/coaches/[id]` | Delete coach |

## Related Tables

- `coaches` - Main coach data
- `class_coach_assignments` - Class assignments
- `coach_notes` - Private notes
- `profiles` - User profile (linked via profileId)
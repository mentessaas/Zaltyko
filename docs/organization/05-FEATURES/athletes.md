# Athletes Module

## Overview

Complete athlete management: registration, profiles, groups, documents, guardians.

## Key Files

### Pages
```
src/app/app/[academyId]/athletes/
├── page.tsx                    # List athletes
├── new/page.tsx               # Create athlete
└── [athleteId]/
    ├── page.tsx               # Athlete detail
    ├── assessments/          # Evaluations
    ├── documents/            # File uploads
    ├── guardians/            # Guardian management
    ├── history/              # Activity history
    └── notes/                # Coach notes
```

### Components
```
src/components/athletes/
├── AthletesTableView.tsx      # Main list view
├── AthletesKanbanView.tsx     # Kanban board
├── ImportExportPanel.tsx      # CSV import/export
├── GuardianManager.tsx        # Guardian CRUD
├── AthleteDetailTabs.tsx      # Tab navigation
├── DocumentUploadModal.tsx    # File upload
├── AthleteDocumentsList.tsx  # Document list
├── ProgressTimeline.tsx       # Progress chart
└── AthleteHistoryView.tsx     # Activity history
```

### Types
```typescript
// src/types/athletes.ts
interface Athlete {
  id: string;
  tenantId: string;
  userId: string | null;
  name: string;
  dateOfBirth: Date;
  level: 'beginner' | 'intermediate' | 'advanced' | 'competition';
  status: 'active' | 'archived';
  groupId?: string; // @deprecated - use groupAthletes
  ageCategory: string;
  competitiveLevel?: string;
  primaryApparatus?: string;
}
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/athletes` | List athletes (paginated) |
| POST | `/api/athletes` | Create athlete |
| GET | `/api/athletes/[id]` | Get athlete details |
| PUT | `/api/athletes/[id]` | Update athlete |
| DELETE | `/api/athletes/[id]` | Archive athlete |
| GET | `/api/athletes/[id]/guardians` | List guardians |
| POST | `/api/athletes/[id]/guardians` | Add guardian |
| GET | `/api/athletes/[id]/documents` | List documents |
| POST | `/api/athletes/[id]/documents` | Upload document |
| GET | `/api/athletes/[id]/classes` | Enrolled classes |
| GET | `/api/athletes/[id]/history` | Activity history |
| POST | `/api/athletes/import` | Import CSV |
| GET | `/api/athletes/export` | Export CSV |

## Related Tables

- `athletes` - Main athlete data
- `guardians` - Parent/guardian contacts
- `guardian_athletes` - Junction table
- `athlete_documents` - File uploads
- `group_athletes` - Group membership
- `athlete_extra_classes` - Extra class enrollments

## Related Docs

- [Classes Module](./classes.md) - Class enrollment
- [Assessments Module](./assessments.md) - Athlete evaluations
- [Database Schema](../08-DATABASE/schema.md) - All tables
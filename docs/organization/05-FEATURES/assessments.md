# Assessments Module

## Overview

Assessment and evaluation system for tracking athlete progress.

## Key Files

### Pages
```
src/app/app/[academyId]/assessments/
├── page.tsx                   # List assessments
└── [athleteId]/
    └── assessments/          # Athlete assessments
```

### Components
```
src/components/assessments/
├── AssessmentForm.tsx        # Create/edit assessment
├── AssessmentHistory.tsx     # History timeline
├── AssessmentRubricBuilder.tsx # Create rubrics
├── AssessmentsClientView.tsx # Main list view
├── AthleteEvaluationsTab.tsx # Athlete tab view
├── ProgressChart.tsx         # Progress visualization
├── ProgressComparison.tsx    # Compare periods
└── VideoUploader.tsx         # Video attachments
```

### Tables (DB)
```
athlete_assessments  - Assessment records
assessment_scores    - Retired: no code reads or writes it (ADR-0029 §7)
assessment_videos    - Video attachments
assessment_rubrics   - Rubric definitions
rubric_criteria     - Evaluation criteria
assessment_types     - Type definitions
skill_catalog        - Retired: no code reads or writes it (ADR-0029 §7)
```

Per-element scores are no longer stored: `POST /api/assessments` and
`POST /api/assessments/[athleteId]` answer 400 if the body carries `scores`, and
the old tables are dropped by a separate candidate once they are empty
(ADR-0029 §7). Elements now live in the element library.

## Assessment Types

| Type | Description |
|------|-------------|
| `technical` | Technical skill evaluation |
| `artistic` | Artistic impression |
| `difficulty` | Difficulty level |
| `execution` | Execution quality |

## Rubric System

Rubrics define evaluation criteria with levels:

```typescript
RubricCriterion {
  name: string;        // e.g., "Salto"
  levels: {
    A: { points: 10, description: "..." }
    B: { points: 8, description: "..." }
    C: { points: 6, description: "..." }
    D: { points: 4, description: "..." }
  }
}
```

## Progress Tracking

```typescript
// AthleteAssessment → ProgressChart
AthleteAssessment {
  athleteId: string;
  date: Date;
  totalScore?: number;  // per-element scores retired (ADR-0029 §7)
  videoUrl?: string;
}
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/assessments/types` | List assessment types |
| GET | `/api/assessments/rubrics` | List rubrics |
| POST | `/api/assessments/rubrics` | Create rubric |
| GET | `/api/assessments/[athleteId]` | Athlete assessments |
| POST | `/api/assessments` | Create assessment |
| GET | `/api/assessments/export` | Export assessments |
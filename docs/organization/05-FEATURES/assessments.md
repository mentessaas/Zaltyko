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
assessment_scores    - Score per criterion
assessment_videos    - Video attachments
assessment_rubrics   - Rubric definitions
rubric_criteria     - Evaluation criteria
assessment_types     - Type definitions
skill_catalog        - Skills catalog
```

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
  scores: AssessmentScore[];
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
# Dashboard & Reports

## Overview

Dashboard with metrics, widgets, and comprehensive reporting.

## Key Files

### Dashboard Pages
```
src/app/app/[academyId]/
├── dashboard/page.tsx         # Main dashboard
└── dashboard/analytics/      # Advanced analytics
```

### Components
```
src/components/dashboard/
├── DashboardPage.tsx          # Main dashboard
├── DashboardCard.tsx          # Card component
├── Sidebar.tsx                # Navigation sidebar
├── AttendanceRiskWidget.tsx   # AI-powered risk
├── WelcomeBanner.tsx          # Welcome message
├── AdvancedMetrics.tsx        # Extended metrics
├── AlertsWidget.tsx           # Active alerts
├── AthleteRetentionWidget.tsx # Retention metrics
├── BillingRiskWidget.tsx      # Payment risk
├── FinancialMetricsWidget.tsx # Financial data
├── GroupsOverview.tsx         # Groups summary
├── GymMetricsWidget.tsx       # Gym stats
├── OnboardingChecklist.tsx   # Setup progress
├── PlanUsage.tsx             # Plan limits
├── PopularClassesWidget.tsx   # Popular classes
├── QuickActions.tsx          # Quick action buttons
├── RevenueTrendChart.tsx     # Revenue chart
├── UpcomingClasses.tsx       # Next classes
├── UpcomingEventsWidget.tsx  # Next events
└── [30+ widgets]
```

### Libraries
```
src/lib/
├── dashboard.ts               # Main dashboard service
├── dashboard/                 # Dashboard utilities
│   ├── types.ts              # Type definitions
│   ├── metrics-calculator.ts  # Advanced metrics
│   └── gr-metrics.ts         # Gymnastics-specific
├── analytics.ts               # PostHog integration
├── reports/
│   ├── attendance-calculator.ts
│   ├── churn-report.ts
│   ├── class-report.ts
│   ├── coach-report.ts
│   ├── financial-calculator.ts
│   ├── pdf-generator.ts
│   └── progress-analyzer.ts
└── metrics.ts                 # Metrics service
```

## Metrics Types

### Core Dashboard Metrics

```typescript
interface DashboardMetrics {
  totalAthletes: number;
  activeAthletes: number;
  totalCoaches: number;
  totalGroups: number;
  totalClasses: number;
  assessmentsThisMonth: number;
  attendanceRate: number;
}
```

### Financial Metrics

- Monthly recurring revenue (MRR)
- Churn rate
- Average revenue per athlete
- Outstanding payments

### AI-Powered

- Attendance risk prediction
- Churn prediction
- Delinquency risk

## Reports

| Report | Description |
|--------|-------------|
| Attendance | Attendance rates by class/coach |
| Class | Class utilization, popular times |
| Coach | Coach performance, athlete progress |
| Financial | Revenue, charges, discounts |
| Progress | Athlete progress over time |
| Churn | Attrition analysis |

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/analytics` | Dashboard analytics |
| GET | `/api/analytics/advanced` | Advanced analytics |
| GET | `/api/reports/attendance` | Attendance report |
| GET | `/api/reports/class` | Class report |
| GET | `/api/reports/coach` | Coach report |
| GET | `/api/reports/financial` | Financial report |
| GET | `/api/reports/progress` | Progress report |
| GET | `/api/reports/churn` | Churn report |
| POST | `/api/reports/run` | Run report |
| GET | `/api/reports/scheduled` | Scheduled reports |

## Export

Reports can be exported as PDF via `src/lib/reports/pdf-generator.ts`.
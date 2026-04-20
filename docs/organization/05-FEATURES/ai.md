# AI Features

## Overview

AI-powered features using MiniMax for attendance prediction, billing alerts, and communication.

## Provider

**MiniMax** (`abab6.5s-chat` model) - accessed via `src/lib/ai/client.ts`

## Key Files

### Libraries
```
src/lib/ai/
├── client.ts                 # MiniMax API client
├── orchestrator.ts           # AI orchestrator singleton
├── types.ts                  # Type definitions
├── prompts/
│   ├── attendance.ts        # Attendance prompts
│   ├── billing.ts           # Billing prompts
│   └── communication.ts    # Communication prompts
└── services/
    ├── attendance-ai.ts    # Attendance AI
    ├── billing-ai.ts       # Billing AI
    └── communication-ai.ts # Communication AI
```

### API Routes
```
src/app/api/ai/
├── attendance/
│   ├── analyze-risk/       # Analyze attendance risk
│   └── predict-absence/   # Predict absence
├── billing/
│   ├── generate-reminder/  # Generate payment reminder
│   └── predict-delinquency/ # Predict delinquency
└── communication/
    ├── chat/               # AI chat
    └── generate-progress-update/ # Generate progress report
```

## Features

### Attendance AI

- **Risk Analysis**: Identify athletes at risk of dropping out
- **Absence Prediction**: Predict which athletes will be absent

```typescript
// Example
const risk = await attendanceAI.analyzeRisk(athleteId, tenantId);
const prediction = await attendanceAI.predictAbsence(athleteId, date);
```

### Billing AI

- **Reminder Generation**: Generate personalized payment reminders
- **Delinquency Prediction**: Predict which accounts will become delinquent

```typescript
// Example
const reminder = await billingAI.generateReminder(athleteId);
const prediction = await billingAI.predictDelinquency(academyId);
```

### Communication AI

- **Chat**: Answer questions about the academy
- **Progress Updates**: Generate athlete progress reports

```typescript
// Example
const response = await communicationAI.chat(message, context);
const update = await communicationAI.generateProgressUpdate(athleteId);
```

## Caching

The AI orchestrator uses in-memory caching with 5-minute TTL to avoid repeated API calls:

```typescript
// src/lib/ai/orchestrator.ts
const orchestrator = AIOrchestrator.getInstance(cacheTTL: 5 * 60 * 1000);
```

## Related Docs

- [Notifications](./notifications.md) - AI triggers notifications
- [Dashboard & Reports](./dashboard-reports.md) - AI-powered insights
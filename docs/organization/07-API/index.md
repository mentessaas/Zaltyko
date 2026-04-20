# API Reference Index

## Overview

Zaltyko has 100+ API endpoints organized by domain.

## Response Format

```typescript
// Success
{ "ok": true, "data": {...} }

// With pagination
{ "ok": true, "data": {...}, "meta": { "total": 100, "page": 1, "pageSize": 20 } }

// Error
{ "ok": false, "error": "ERROR_CODE", "message": "Human readable" }
```

## Helpers

```typescript
import { apiSuccess, apiCreated, apiError } from '@/lib/api-response';

return apiSuccess({ items });           // GET
return apiCreated({ id: 'new-id' });    // POST
return apiError('NOT_FOUND', '...', 404); // Error
```

## Auth Pattern

All protected endpoints use `withTenant`:

```typescript
export const POST = withTenant(async (request: Request) => {
  // context: { tenantId, userId, profile }
});
```

## Endpoint Groups

### Athletes
| Endpoint | Description |
|----------|-------------|
| `GET /api/athletes` | List athletes |
| `POST /api/athletes` | Create athlete |
| `GET /api/athletes/[id]` | Get athlete |
| `PUT /api/athletes/[id]` | Update athlete |
| `DELETE /api/athletes/[id]` | Archive athlete |
| `GET /api/athletes/[id]/guardians` | Guardians |
| `POST /api/athletes/import` | Import CSV |
| `GET /api/athletes/export` | Export CSV |

### Classes
| Endpoint | Description |
|----------|-------------|
| `GET /api/classes` | List classes |
| `POST /api/classes` | Create class |
| `POST /api/class-enrollments` | Enroll athlete |
| `GET /api/class-sessions` | List sessions |
| `POST /api/class-sessions` | Create session |

### Events
| Endpoint | Description |
|----------|-------------|
| `GET /api/events` | List events |
| `POST /api/events` | Create event |
| `POST /api/events/[id]/registrations` | Register |
| `POST /api/events/[id]/waitlist` | Join waitlist |

### Billing
| Endpoint | Description |
|----------|-------------|
| `GET /api/billing/status` | Subscription status |
| `POST /api/billing/checkout` | Checkout |
| `POST /api/billing/upgrade` | Upgrade plan |
| `GET /api/charges` | List charges |
| `POST /api/discounts` | Create discount |

### AI (Protected)
| Endpoint | Description |
|----------|-------------|
| `POST /api/ai/attendance/analyze-risk` | Risk analysis |
| `POST /api/ai/billing/generate-reminder` | Generate reminder |
| `POST /api/ai/communication/chat` | AI chat |

### Public (No Auth)
| Endpoint | Description |
|----------|-------------|
| `GET /api/public/academies` | List academies |
| `GET /api/public/events` | List events |
| `POST /api/public/academies/[id]/contact` | Contact |

### Reports
| Endpoint | Description |
|----------|-------------|
| `GET /api/reports/attendance` | Attendance report |
| `GET /api/reports/financial` | Financial report |
| `POST /api/reports/run` | Run report |

## Rate Limits

| Pattern | Limit |
|---------|-------|
| `POST /api/auth/*` | 10/min |
| `POST /api/*` (auth) | 100/min |
| `GET /api/*` | 300/min |

## Error Codes

| Code | Status | Description |
|------|--------|-------------|
| `UNAUTHORIZED` | 401 | No session |
| `FORBIDDEN` | 403 | No permission |
| `NOT_FOUND` | 404 | Resource missing |
| `VALIDATION_ERROR` | 400 | Invalid input |
| `RATE_LIMITED` | 429 | Too many requests |
| `LIMIT_REACHED` | 403 | Plan limit hit |
| `INTERNAL_ERROR` | 500 | Server error |
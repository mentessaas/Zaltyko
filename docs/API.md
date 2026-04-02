# API Reference - Zaltyko

## Overview

Todas las APIs REST siguen un patrón de respuesta estandarizado y están protegidas con autenticación multi-tenant via `withTenant`.

## Response Format

### Success Response
```typescript
// API Response structure
{
  "ok": true,
  "data": { ... },      // Response data
  "meta": {             // Optional pagination
    "total": 100,
    "page": 1,
    "pageSize": 20
  }
}
```

### Error Response
```typescript
{
  "ok": false,
  "error": "ERROR_CODE",
  "message": "Human readable message"
}
```

## Standardized Helpers

```typescript
import { apiSuccess, apiCreated, apiError } from '@/lib/api-response';

// List endpoint
return apiSuccess({ items: [...], total: 100 }, { total: 100, page: 1, pageSize: 20 });

// Create endpoint
return apiCreated({ id: 'new-id' });

// Error
return apiError('NOT_FOUND', 'Resource not found', 404);
```

## Authentication

Todas las APIs (excepto endpoints públicos) usan el wrapper `withTenant`:

```typescript
import { withTenant } from '@/lib/authz';

export const POST = withTenant(async (request: Request) => {
  // Context includes: tenantId, userId, profile
  // ...
});
```

### Public Endpoints (No auth required)
- `/api/public/academies/[id]`
- `/api/public/events/[id]`
- `/api/public/clusters`
- `/api/rate-limit-test` (dev only)
- `/api/metrics` (protected)

## Core Endpoints

### Athletes
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/athletes` | List athletes (paginated) |
| POST | `/api/athletes` | Create athlete |
| GET | `/api/athletes/[id]` | Get athlete |
| PUT | `/api/athletes/[id]` | Update athlete |
| DELETE | `/api/athletes/[id]` | Delete athlete |
| GET | `/api/athletes/[id]/documents` | List documents |
| GET | `/api/athletes/[id]/classes` | List enrolled classes |
| GET | `/api/athletes/[id]/guardians` | List guardians |
| GET | `/api/athletes/[id]/history` | Get history |

### Classes
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/classes` | List classes |
| POST | `/api/classes` | Create class |
| GET | `/api/classes/[id]` | Get class |
| PUT | `/api/classes/[id]` | Update class |
| DELETE | `/api/classes/[id]` | Delete class |
| GET | `/api/classes/[id]/athletes` | List enrolled athletes |
| POST | `/api/classes/[id]/enroll` | Enroll athlete |

### Events
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/events` | List events |
| POST | `/api/events` | Create event |
| GET | `/api/events/[id]` | Get event |
| PUT | `/api/events/[id]` | Update event |
| DELETE | `/api/events/[id]` | Delete event |
| GET | `/api/events/[id]/registrations` | List registrations |
| POST | `/api/events/[id]/registrations` | Register |
| GET | `/api/events/[id]/waitlist` | Get waitlist |
| POST | `/api/events/[id]/waitlist` | Join waitlist |
| GET | `/api/events/[id]/categories` | Get categories |
| POST | `/api/events/[id]/notify` | Send notification |
| GET | `/api/events/[id]/stats` | Get statistics |
| GET | `/api/events/my-registrations` | My registrations |

### Coaches
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/coaches` | List coaches |
| POST | `/api/coaches` | Create coach |
| GET | `/api/coaches/[id]` | Get coach |
| PUT | `/api/coaches/[id]` | Update coach |
| DELETE | `/api/coaches/[id]` | Delete coach |

### Billing
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/billing/status` | Get subscription status |
| POST | `/api/billing/checkout` | Create checkout session |
| POST | `/api/billing/portal` | Create customer portal |
| GET | `/api/charges` | List charges |
| POST | `/api/discounts` | Create discount |
| POST | `/api/scholarships` | Create scholarship |

## AI Endpoints (Auth Protected)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/ai/attendance/analyze-risk` | Analyze attendance risk |
| GET | `/api/ai/attendance/predict-absence` | Predict absence |
| POST | `/api/ai/billing/generate-reminder` | Generate payment reminder |
| POST | `/api/ai/billing/predict-delinquency` | Predict delinquency |
| POST | `/api/ai/communication/chat` | Chat with AI |

## Webhooks

### Stripe
- `POST /api/webhooks/stripe` - Handle Stripe events

### LemonSqueezy
- `POST /api/webhooks/lemon-squeezy` - Handle subscription events

## Rate Limiting

Rate limits son aplicados usando Vercel KV (Redis):

| Endpoint Pattern | Limit |
|-----------------|-------|
| `POST /api/auth/*` | 10/min |
| `POST /api/*` (authenticated) | 100/min |
| `GET /api/*` | 300/min |
| `/api/rate-limit-test` | 5/min (strict) |

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHENTICATED` | 401 | No valid session |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 400 | Invalid input |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |

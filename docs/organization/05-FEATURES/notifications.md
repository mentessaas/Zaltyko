# Notifications System

## Overview

Multi-channel notifications: Email (Brevo), Push (Web Push API), WhatsApp (Twilio).

## Key Files

### Libraries
```
src/lib/
├── brevo.ts                  # Brevo email client
├── whatsapp.ts              # Twilio WhatsApp client
├── notifications/
│   ├── notification-service.ts  # CRUD operations
│   ├── email-service.ts         # Email sender
│   ├── push-service.ts          # Web push
│   ├── whatsapp-service.ts      # WhatsApp sender
│   ├── ticket-service.ts        # Support tickets
│   ├── realtime-setup.ts        # Supabase Realtime
│   ├── event-recipients.ts      # Get event recipients
│   ├── event-email-content.ts    # Event email templates
│   └── eventsNotifier.ts        # Event notifications
├── email/
│   ├── email-service.ts          # Main email service
│   ├── triggers.ts               # Email triggers
│   └── templates/                # Email templates (React)
│       ├── welcome-email.tsx
│       ├── attendance-reminder.tsx
│       ├── class-cancellation.tsx
│       ├── event-invitation.tsx
│       └── payment-reminder.tsx
└── alerts/                       # Automated alerts
    ├── attendance-alerts.ts
    ├── payment-alerts.ts
    ├── class-reminders.ts
    └── capacity-alerts.ts
```

## Channels

| Channel | Service | Use Case |
|---------|---------|----------|
| Email | Brevo (SMTP) | Transactional emails, newsletters |
| Push | Web Push API | Real-time in-app notifications |
| WhatsApp | Twilio | Urgent alerts, confirmations |
| In-App | Supabase Realtime | Live notifications |

## Email Templates

React-based email templates in `src/lib/email/templates/`:
- Welcome email for new users
- Attendance reminders
- Class cancellation notices
- Event invitations
- Payment reminders

## Notification Flow

```
1. Event occurs (e.g., class tomorrow)
2. Determine recipients
3. Create notification records
4. Dispatch via appropriate channel
5. Log delivery status
```

## Support Tickets

```typescript
// src/lib/notifications/ticket-service.ts
Ticket {
  id: uuid;
  tenantId: uuid;
  userId: uuid;
  subject: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
}
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/notifications` | List user notifications |
| PUT | `/api/notifications/[id]/read` | Mark as read |
| POST | `/api/push/subscribe` | Subscribe to push |
| POST | `/api/push/unsubscribe` | Unsubscribe push |
| POST | `/api/support/tickets` | Create ticket |
| GET | `/api/support/tickets` | List tickets |
| POST | `/api/whatsapp/send` | Send WhatsApp |

## Related Docs

- [AI Features](./ai.md) - AI triggers notifications
- [Events Module](./events.md) - Event notifications
- [Billing Module](./billing.md) - Payment alerts
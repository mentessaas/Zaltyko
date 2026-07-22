# Rutas y pantallas

## Alcance

Inventario congelado desde el filesystem del snapshot. Se enumeran los 167 archivos de página, 12 layouts y 296 Route Handlers; los grupos de rutas de Next no forman parte de la URL. El manifiesto de build generó 219 páginas, porque añade rutas parametrizadas/estáticas.

## Resumen de superficies

| Superficie | Fuente | Guarda principal | Observación |
|---|---|---|---|
| Público | `src/app/page.tsx`, `src/app/(site)` | pública/i18n | `/` es redirigida por middleware a un cluster en el árbol actual |
| Auth | `src/app/auth` | sesión Supabase | login, callback, recovery, update-password |
| Academia moderna | `src/app/app/[academyId]` | layout + `withTenant` API | 62 archivos de página |
| Legacy | `src/app/dashboard` | redirects/compatibilidad | 30 archivos; ventana de telemetría de seis meses |
| Super-admin | grupos/ruta super-admin | JWT verificado + perfil | 13 archivos de página |
| API | `src/app/api` | wrapper por categoría | 294 handlers: 204 tenant, 39 bearer, 16 públicos, 12 super-admin, 10 deprecated, 7 cron, 4 webhook y 2 dev |

## Páginas (inventario exhaustivo)

<details>
<summary>Público y global (49)</summary>

- `src/app/(public)/empleo/[id]/aplicar/page.tsx`
- `src/app/(public)/empleo/[id]/page.tsx`
- `src/app/(public)/empleo/nuevo/page.tsx`
- `src/app/(public)/empleo/page.tsx`
- `src/app/(public)/events/[id]/page.tsx`
- `src/app/(public)/events/page.tsx`
- `src/app/(public)/marketplace/[id]/page.tsx`
- `src/app/(public)/marketplace/nuevo/page.tsx`
- `src/app/(public)/marketplace/page.tsx`
- `src/app/(site)/[locale]/[modality]/[country]/page.tsx`
- `src/app/(site)/[locale]/[modality]/page.tsx`
- `src/app/(site)/[locale]/ayuda/page.tsx`
- `src/app/(site)/[locale]/page.tsx`
- `src/app/(site)/[locale]/sobre-nosotros/page.tsx`
- `src/app/(site)/coaches/[slug]/page.tsx`
- `src/app/(site)/coaches/page.tsx`
- `src/app/(site)/faq/page.tsx`
- `src/app/(site)/modules/clases-horarios/page.tsx`
- `src/app/(site)/modules/comunicacion/page.tsx`
- `src/app/(site)/modules/dashboard-reportes/page.tsx`
- `src/app/(site)/modules/directorio-academias/page.tsx`
- `src/app/(site)/modules/eventos-competiciones/page.tsx`
- `src/app/(site)/modules/gestion-atletas/page.tsx`
- `src/app/(site)/modules/pagos-administracion/page.tsx`
- `src/app/about/page.tsx`
- `src/app/academias/[id]/page.tsx`
- `src/app/academias/page.tsx`
- `src/app/app/page.tsx`
- `src/app/ayuda/page.tsx`
- `src/app/billing/page.tsx`
- `src/app/blog/page.tsx`
- `src/app/changelog/page.tsx`
- `src/app/contact/page.tsx`
- `src/app/dev/theme-preview/page.tsx`
- `src/app/docs/page.tsx`
- `src/app/features/page.tsx`
- `src/app/help/[slug]/page.tsx`
- `src/app/help/page.tsx`
- `src/app/integraciones/page.tsx`
- `src/app/integrations/page.tsx`
- `src/app/login/page.tsx`
- `src/app/page.tsx`
- `src/app/politica-privacidad/page.tsx`
- `src/app/pricing/page.tsx`
- `src/app/privacy-policy/page.tsx`
- `src/app/sobre-nosotros/page.tsx`
- `src/app/status/page.tsx`
- `src/app/terminos/page.tsx`
- `src/app/tos/page.tsx`

</details>

<details>
<summary>Auth, onboarding e invitaciones (12)</summary>

- `src/app/(site)/onboarding/athlete/page.tsx`
- `src/app/(site)/onboarding/coach/page.tsx`
- `src/app/(site)/onboarding/page.tsx`
- `src/app/(site)/onboarding/parent/page.tsx`
- `src/app/auth/invite/page.tsx`
- `src/app/auth/login/page.tsx`
- `src/app/auth/register/page.tsx`
- `src/app/auth/signup/page.tsx`
- `src/app/invite/accept/page.tsx`
- `src/app/invite/athlete/page.tsx`
- `src/app/invite/parent/page.tsx`
- `src/app/onboarding/owner/page.tsx`

</details>

<details>
<summary>Super-admin (12)</summary>

- `src/app/(super-admin)/super-admin/academies/[academyId]/page.tsx`
- `src/app/(super-admin)/super-admin/academies/page.tsx`
- `src/app/(super-admin)/super-admin/academies/public/page.tsx`
- `src/app/(super-admin)/super-admin/billing/page.tsx`
- `src/app/(super-admin)/super-admin/growth/page.tsx`
- `src/app/(super-admin)/super-admin/logs/page.tsx`
- `src/app/(super-admin)/super-admin/page.tsx`
- `src/app/(super-admin)/super-admin/settings/page.tsx`
- `src/app/(super-admin)/super-admin/support/[ticketId]/page.tsx`
- `src/app/(super-admin)/super-admin/support/page.tsx`
- `src/app/(super-admin)/super-admin/users/[profileId]/page.tsx`
- `src/app/(super-admin)/super-admin/users/page.tsx`

</details>

<details>
<summary>Legacy dashboard (32)</summary>

- `src/app/(super-admin)/super-admin/dashboard/page.tsx`
- `src/app/app/admin/dashboard/page.tsx`
- `src/app/dashboard/academies/page.tsx`
- `src/app/dashboard/announcements/[id]/page.tsx`
- `src/app/dashboard/announcements/new/page.tsx`
- `src/app/dashboard/announcements/page.tsx`
- `src/app/dashboard/assessments/page.tsx`
- `src/app/dashboard/athletes/[athleteId]/page.tsx`
- `src/app/dashboard/athletes/new/page.tsx`
- `src/app/dashboard/athletes/page.tsx`
- `src/app/dashboard/billing/page.tsx`
- `src/app/dashboard/calendar/page.tsx`
- `src/app/dashboard/classes/[classId]/edit/page.tsx`
- `src/app/dashboard/classes/calendar/page.tsx`
- `src/app/dashboard/classes/groups/page.tsx`
- `src/app/dashboard/classes/page.tsx`
- `src/app/dashboard/coaches/page.tsx`
- `src/app/dashboard/empleo/mis-postulaciones/page.tsx`
- `src/app/dashboard/events/[id]/page.tsx`
- `src/app/dashboard/events/new/page.tsx`
- `src/app/dashboard/events/page.tsx`
- `src/app/dashboard/marketplace/mis-productos/page.tsx`
- `src/app/dashboard/messages/[conversationId]/page.tsx`
- `src/app/dashboard/messages/page.tsx`
- `src/app/dashboard/page.tsx`
- `src/app/dashboard/plan-limits/page.tsx`
- `src/app/dashboard/profile/[profileId]/page.tsx`
- `src/app/dashboard/profile/page.tsx`
- `src/app/dashboard/sessions/[sessionId]/page.tsx`
- `src/app/dashboard/settings/page.tsx`
- `src/app/dashboard/users/page.tsx`
- `src/app/dashboard/view/[profileId]/page.tsx`

</details>

<details>
<summary>Academia moderna (62)</summary>

- `src/app/app/[academyId]/announcements/[id]/page.tsx`
- `src/app/app/[academyId]/announcements/new/page.tsx`
- `src/app/app/[academyId]/announcements/page.tsx`
- `src/app/app/[academyId]/assessments/page.tsx`
- `src/app/app/[academyId]/athletes/[athleteId]/assessments/page.tsx`
- `src/app/app/[academyId]/athletes/[athleteId]/documents/page.tsx`
- `src/app/app/[academyId]/athletes/[athleteId]/evaluate/page.tsx`
- `src/app/app/[academyId]/athletes/[athleteId]/guardians/page.tsx`
- `src/app/app/[academyId]/athletes/[athleteId]/history/page.tsx`
- `src/app/app/[academyId]/athletes/[athleteId]/notes/page.tsx`
- `src/app/app/[academyId]/athletes/[athleteId]/page.tsx`
- `src/app/app/[academyId]/athletes/[athleteId]/progress/page.tsx`
- `src/app/app/[academyId]/athletes/new/page.tsx`
- `src/app/app/[academyId]/athletes/page.tsx`
- `src/app/app/[academyId]/attendance/page.tsx`
- `src/app/app/[academyId]/attendance/today/[sessionId]/page.tsx`
- `src/app/app/[academyId]/attendance/today/page.tsx`
- `src/app/app/[academyId]/audit-logs/page.tsx`
- `src/app/app/[academyId]/billing/campaigns/page.tsx`
- `src/app/app/[academyId]/billing/discounts/history/page.tsx`
- `src/app/app/[academyId]/billing/discounts/page.tsx`
- `src/app/app/[academyId]/billing/page.tsx`
- `src/app/app/[academyId]/billing/receipts/page.tsx`
- `src/app/app/[academyId]/billing/scholarships/page.tsx`
- `src/app/app/[academyId]/classes/[classId]/page.tsx`
- `src/app/app/[academyId]/classes/[classId]/recurring/page.tsx`
- `src/app/app/[academyId]/classes/page.tsx`
- `src/app/app/[academyId]/coach/page.tsx`
- `src/app/app/[academyId]/coach/today/[sessionId]/page.tsx`
- `src/app/app/[academyId]/coaches/[coachId]/page.tsx`
- `src/app/app/[academyId]/coaches/[coachId]/public-settings/page.tsx`
- `src/app/app/[academyId]/coaches/page.tsx`
- `src/app/app/[academyId]/coaches/today/page.tsx`
- `src/app/app/[academyId]/comms/page.tsx`
- `src/app/app/[academyId]/contact-messages/page.tsx`
- `src/app/app/[academyId]/dashboard/analytics/page.tsx`
- `src/app/app/[academyId]/dashboard/page.tsx`
- `src/app/app/[academyId]/evaluations/page.tsx`
- `src/app/app/[academyId]/events/[eventId]/invitations/page.tsx`
- `src/app/app/[academyId]/events/[eventId]/page.tsx`
- `src/app/app/[academyId]/events/[eventId]/register/page.tsx`
- `src/app/app/[academyId]/events/page.tsx`
- `src/app/app/[academyId]/groups/[groupId]/page.tsx`
- `src/app/app/[academyId]/groups/page.tsx`
- `src/app/app/[academyId]/licenses/page.tsx`
- `src/app/app/[academyId]/messages/page.tsx`
- `src/app/app/[academyId]/my-dashboard/page.tsx`
- `src/app/app/[academyId]/my-events/page.tsx`
- `src/app/app/[academyId]/notifications/page.tsx`
- `src/app/app/[academyId]/page.tsx`
- `src/app/app/[academyId]/reports/attendance/page.tsx`
- `src/app/app/[academyId]/reports/churn/page.tsx`
- `src/app/app/[academyId]/reports/class/page.tsx`
- `src/app/app/[academyId]/reports/coach/page.tsx`
- `src/app/app/[academyId]/reports/financial/page.tsx`
- `src/app/app/[academyId]/reports/page.tsx`
- `src/app/app/[academyId]/reports/progress/page.tsx`
- `src/app/app/[academyId]/settings/page.tsx`
- `src/app/app/[academyId]/support/[ticketId]/page.tsx`
- `src/app/app/[academyId]/support/new/page.tsx`
- `src/app/app/[academyId]/support/page.tsx`
- `src/app/app/[academyId]/whatsapp/page.tsx`

</details>

## Layouts (inventario exhaustivo)

<details>
<summary>Layouts (12)</summary>

- `src/app/(public)/layout.tsx`
- `src/app/(server)/layout.tsx`
- `src/app/(site)/modules/layout.tsx`
- `src/app/(super-admin)/super-admin/layout.tsx`
- `src/app/academias/layout.tsx`
- `src/app/app/[academyId]/layout.tsx`
- `src/app/app/[academyId]/reports/layout.tsx`
- `src/app/auth/layout.tsx`
- `src/app/billing/layout.tsx`
- `src/app/dashboard/layout.tsx`
- `src/app/layout.tsx`
- `src/app/onboarding/layout.tsx`

</details>

## Route Handlers (inventario exhaustivo por primer segmento)

<details>
<summary>/api/academies (10)</summary>

- `src/app/api/academies/[academyId]/announcements/[id]/route.ts`
- `src/app/api/academies/[academyId]/announcements/route.ts`
- `src/app/api/academies/[academyId]/roles/[roleId]/members/route.ts`
- `src/app/api/academies/[academyId]/roles/[roleId]/route.ts`
- `src/app/api/academies/[academyId]/roles/route.ts`
- `src/app/api/academies/[academyId]/route.ts`
- `src/app/api/academies/[academyId]/settings/route.ts`
- `src/app/api/academies/[academyId]/sport-dashboard/route.ts`
- `src/app/api/academies/[academyId]/sport-migration/route.ts`
- `src/app/api/academies/route.ts`

</details>

<details>
<summary>/api/academy-diagnostics (1)</summary>

- `src/app/api/academy-diagnostics/route.ts`

</details>

<details>
<summary>/api/academy-expenses (1)</summary>

- `src/app/api/academy-expenses/route.ts`

</details>

<details>
<summary>/api/academy-memberships (1)</summary>

- `src/app/api/academy-memberships/[membershipId]/route.ts`

</details>

<details>
<summary>/api/admin (2)</summary>

- `src/app/api/admin/users/route.ts`
- `src/app/api/admin/verify-supabase/route.ts`

</details>

<details>
<summary>/api/advertising (1)</summary>

- `src/app/api/advertising/zones/[zone]/route.ts`

</details>

<details>
<summary>/api/ai (6)</summary>

- `src/app/api/ai/attendance/analyze-risk/route.ts`
- `src/app/api/ai/attendance/predict-absence/route.ts`
- `src/app/api/ai/billing/generate-reminder/route.ts`
- `src/app/api/ai/billing/predict-delinquency/route.ts`
- `src/app/api/ai/communication/chat/route.ts`
- `src/app/api/ai/communication/generate-progress-update/route.ts`

</details>

<details>
<summary>/api/alerts (4)</summary>

- `src/app/api/alerts/attendance/route.ts`
- `src/app/api/alerts/capacity/route.ts`
- `src/app/api/alerts/class-reminders/route.ts`
- `src/app/api/alerts/payments/route.ts`

</details>

<details>
<summary>/api/analytics (1)</summary>

- `src/app/api/analytics/advanced/route.ts`

</details>

<details>
<summary>/api/assessments (6)</summary>

- `src/app/api/assessments/[athleteId]/route.ts`
- `src/app/api/assessments/export/route.ts`
- `src/app/api/assessments/route.ts`
- `src/app/api/assessments/rubrics/route.ts`
- `src/app/api/assessments/types/route.ts`
- `src/app/api/assessments/videos/route.ts`

</details>

<details>
<summary>/api/athletes (12)</summary>

- `src/app/api/athletes/[athleteId]/classes/route.ts`
- `src/app/api/athletes/[athleteId]/documents/route.ts`
- `src/app/api/athletes/[athleteId]/export-history/route.ts`
- `src/app/api/athletes/[athleteId]/extra-classes/route.ts`
- `src/app/api/athletes/[athleteId]/family-conversation/route.ts`
- `src/app/api/athletes/[athleteId]/guardians/[linkId]/route.ts`
- `src/app/api/athletes/[athleteId]/guardians/route.ts`
- `src/app/api/athletes/[athleteId]/history/route.ts`
- `src/app/api/athletes/[athleteId]/route.ts`
- `src/app/api/athletes/export/route.ts`
- `src/app/api/athletes/import/route.ts`
- `src/app/api/athletes/route.ts`

</details>

<details>
<summary>/api/attendance (1)</summary>

- `src/app/api/attendance/route.ts`

</details>

<details>
<summary>/api/audit-logs (1)</summary>

- `src/app/api/audit-logs/route.ts`

</details>

<details>
<summary>/api/auth (1)</summary>

- `src/app/api/auth/check/route.ts`

</details>

<details>
<summary>/api/billing (17)</summary>

- `src/app/api/billing/athlete-fee/route.ts`
- `src/app/api/billing/cancel/route.ts`
- `src/app/api/billing/checkout/route.ts`
- `src/app/api/billing/collection-stats/route.ts`
- `src/app/api/billing/create-payment-intent/route.ts`
- `src/app/api/billing/downgrade/route.ts`
- `src/app/api/billing/history/route.ts`
- `src/app/api/billing/invoice-notes/route.ts`
- `src/app/api/billing/payment-method/route.ts`
- `src/app/api/billing/plans/route.ts`
- `src/app/api/billing/portal/route.ts`
- `src/app/api/billing/route.ts`
- `src/app/api/billing/status/route.ts`
- `src/app/api/billing/sync/route.ts`
- `src/app/api/billing/trial/start/route.ts`
- `src/app/api/billing/upgrade/route.ts`
- `src/app/api/billing/user-academies/route.ts`

</details>

<details>
<summary>/api/billing-items (2)</summary>

- `src/app/api/billing-items/[itemId]/route.ts`
- `src/app/api/billing-items/route.ts`

</details>

<details>
<summary>/api/charges (7)</summary>

- `src/app/api/charges/[chargeId]/collect/route.ts`
- `src/app/api/charges/[chargeId]/refund/route.ts`
- `src/app/api/charges/[chargeId]/remind/route.ts`
- `src/app/api/charges/[chargeId]/route.ts`
- `src/app/api/charges/bulk/route.ts`
- `src/app/api/charges/generate-monthly/route.ts`
- `src/app/api/charges/route.ts`

</details>

<details>
<summary>/api/class-enrollments (2)</summary>

- `src/app/api/class-enrollments/[enrollmentId]/route.ts`
- `src/app/api/class-enrollments/route.ts`

</details>

<details>
<summary>/api/class-sessions (2)</summary>

- `src/app/api/class-sessions/[sessionId]/route.ts`
- `src/app/api/class-sessions/route.ts`

</details>

<details>
<summary>/api/class-waiting-list (2)</summary>

- `src/app/api/class-waiting-list/[entryId]/route.ts`
- `src/app/api/class-waiting-list/route.ts`

</details>

<details>
<summary>/api/classes (7)</summary>

- `src/app/api/classes/[classId]/athletes/route.ts`
- `src/app/api/classes/[classId]/exceptions/[exceptionId]/route.ts`
- `src/app/api/classes/[classId]/exceptions/route.ts`
- `src/app/api/classes/[classId]/generate-sessions/route.ts`
- `src/app/api/classes/[classId]/recurring-settings/route.ts`
- `src/app/api/classes/[classId]/route.ts`
- `src/app/api/classes/route.ts`

</details>

<details>
<summary>/api/coach-compensation (1)</summary>

- `src/app/api/coach-compensation/route.ts`

</details>

<details>
<summary>/api/coach-notes (2)</summary>

- `src/app/api/coach-notes/[noteId]/route.ts`
- `src/app/api/coach-notes/route.ts`

</details>

<details>
<summary>/api/coaches (5)</summary>

- `src/app/api/coaches/[coachId]/assignments/route.ts`
- `src/app/api/coaches/[coachId]/athletes/route.ts`
- `src/app/api/coaches/[coachId]/public/route.ts`
- `src/app/api/coaches/[coachId]/route.ts`
- `src/app/api/coaches/route.ts`

</details>

<details>
<summary>/api/communication (11)</summary>

- `src/app/api/communication/groups/[groupId]/route.ts`
- `src/app/api/communication/groups/route.ts`
- `src/app/api/communication/history/route.ts`
- `src/app/api/communication/preferences/route.ts`
- `src/app/api/communication/scheduled/[notificationId]/route.ts`
- `src/app/api/communication/scheduled/route.ts`
- `src/app/api/communication/templates/[templateId]/route.ts`
- `src/app/api/communication/templates/[templateId]/use/route.ts`
- `src/app/api/communication/templates/email-seed/route.ts`
- `src/app/api/communication/templates/route.ts`
- `src/app/api/communication/templates/seed/route.ts`

</details>

<details>
<summary>/api/competition-results (1)</summary>

- `src/app/api/competition-results/route.ts`

</details>

<details>
<summary>/api/contact (1)</summary>

- `src/app/api/contact/route.ts`

</details>

<details>
<summary>/api/contact-messages (5)</summary>

- `src/app/api/contact-messages/[messageId]/archive/route.ts`
- `src/app/api/contact-messages/[messageId]/read/route.ts`
- `src/app/api/contact-messages/[messageId]/respond/route.ts`
- `src/app/api/contact-messages/[messageId]/route.ts`
- `src/app/api/contact-messages/route.ts`

</details>

<details>
<summary>/api/cron (7)</summary>

- `src/app/api/cron/class-reminders/route.ts`
- `src/app/api/cron/collect-charges/route.ts`
- `src/app/api/cron/daily-alerts/route.ts`
- `src/app/api/cron/generate-sessions/route.ts`
- `src/app/api/cron/payment-reminders/route.ts`
- `src/app/api/cron/scheduled-notifications/route.ts`
- `src/app/api/cron/trial-lifecycle/route.ts`

</details>

<details>
<summary>/api/dashboard (9)</summary>

- `src/app/api/dashboard/[academyId]/analytics/full/route.ts`
- `src/app/api/dashboard/[academyId]/analytics/route.ts`
- `src/app/api/dashboard/[academyId]/financial-metrics/route.ts`
- `src/app/api/dashboard/[academyId]/gr-metrics/route.ts`
- `src/app/api/dashboard/[academyId]/popular-classes/route.ts`
- `src/app/api/dashboard/[academyId]/retention/route.ts`
- `src/app/api/dashboard/[academyId]/revenue-trend/route.ts`
- `src/app/api/dashboard/[academyId]/route.ts`
- `src/app/api/dashboard/kpi-trends/route.ts`

</details>

<details>
<summary>/api/dev (1)</summary>

- `src/app/api/dev/session/route.ts`

</details>

<details>
<summary>/api/discounts (7)</summary>

- `src/app/api/discounts/[discountId]/route.ts`
- `src/app/api/discounts/apply/route.ts`
- `src/app/api/discounts/campaigns/[campaignId]/route.ts`
- `src/app/api/discounts/campaigns/route.ts`
- `src/app/api/discounts/route.ts`
- `src/app/api/discounts/usage/route.ts`
- `src/app/api/discounts/validate/route.ts`

</details>

<details>
<summary>/api/docs (1)</summary>

- `src/app/api/docs/route.ts`

</details>

<details>
<summary>/api/empleo (4)</summary>

- `src/app/api/empleo/[id]/apply/route.ts`
- `src/app/api/empleo/[id]/route.ts`
- `src/app/api/empleo/mis-postulaciones/route.ts`
- `src/app/api/empleo/route.ts`

</details>

<details>
<summary>/api/events (12)</summary>

- `src/app/api/events/[id]/categories/route.ts`
- `src/app/api/events/[id]/invitations/[invitationId]/route.ts`
- `src/app/api/events/[id]/invitations/route.ts`
- `src/app/api/events/[id]/notify/route.ts`
- `src/app/api/events/[id]/payments/route.ts`
- `src/app/api/events/[id]/registrations/route.ts`
- `src/app/api/events/[id]/route.ts`
- `src/app/api/events/[id]/stats/route.ts`
- `src/app/api/events/[id]/waitlist/route.ts`
- `src/app/api/events/my-registrations/route.ts`
- `src/app/api/events/route.ts`
- `src/app/api/events/upload/route.ts`

</details>

<details>
<summary>/api/family (5)</summary>

- `src/app/api/family/charges/[chargeId]/pay/route.ts`
- `src/app/api/family/charges/[chargeId]/receipt/route.ts`
- `src/app/api/family/children/route.ts`
- `src/app/api/family/payment-method/route.ts`
- `src/app/api/family/payment-method/setup-intent/route.ts`

</details>

<details>
<summary>/api/groups (5)</summary>

- `src/app/api/groups/[groupId]/athletes/route.ts`
- `src/app/api/groups/[groupId]/family-conversation/route.ts`
- `src/app/api/groups/[groupId]/route.ts`
- `src/app/api/groups/[groupId]/summary/route.ts`
- `src/app/api/groups/route.ts`

</details>

<details>
<summary>/api/growth (1)</summary>

- `src/app/api/growth/events/route.ts`

</details>

<details>
<summary>/api/guardians (2)</summary>

- `src/app/api/guardians/[guardianId]/route.ts`
- `src/app/api/guardians/route.ts`

</details>

<details>
<summary>/api/invitations (2)</summary>

- `src/app/api/invitations/complete/route.ts`
- `src/app/api/invitations/route.ts`

</details>

<details>
<summary>/api/leads (1)</summary>

- `src/app/api/leads/route.ts`

</details>

<details>
<summary>/api/leak-actions (1)</summary>

- `src/app/api/leak-actions/route.ts`

</details>

<details>
<summary>/api/licenses (1)</summary>

- `src/app/api/licenses/route.ts`

</details>

<details>
<summary>/api/limits (1)</summary>

- `src/app/api/limits/remaining/route.ts`

</details>

<details>
<summary>/api/link-requests (2)</summary>

- `src/app/api/link-requests/[requestId]/route.ts`
- `src/app/api/link-requests/route.ts`

</details>

<details>
<summary>/api/mailgun (1)</summary>

- `src/app/api/mailgun/route.ts`

</details>

<details>
<summary>/api/marketplace (5)</summary>

- `src/app/api/marketplace/[id]/ratings/route.ts`
- `src/app/api/marketplace/[id]/route.ts`
- `src/app/api/marketplace/mis-productos/[id]/route.ts`
- `src/app/api/marketplace/mis-productos/route.ts`
- `src/app/api/marketplace/route.ts`

</details>

<details>
<summary>/api/mcp (1)</summary>

- `src/app/api/mcp/route.ts`

</details>

<details>
<summary>/api/me (7)</summary>

- `src/app/api/me/attendance/route.ts`
- `src/app/api/me/charges/route.ts`
- `src/app/api/me/classes/route.ts`
- `src/app/api/me/events/route.ts`
- `src/app/api/me/home/route.ts`
- `src/app/api/me/profile/route.ts`
- `src/app/api/me/schedule/route.ts`

</details>

<details>
<summary>/api/messages (5)</summary>

- `src/app/api/messages/conversations/[id]/messages/route.ts`
- `src/app/api/messages/conversations/[id]/route.ts`
- `src/app/api/messages/conversations/route.ts`
- `src/app/api/messages/group-alert/route.ts`
- `src/app/api/messages/send/route.ts`

</details>

<details>
<summary>/api/metrics (1)</summary>

- `src/app/api/metrics/route.ts`

</details>

<details>
<summary>/api/notifications (8)</summary>

- `src/app/api/notifications/[notificationId]/read/route.ts`
- `src/app/api/notifications/[notificationId]/route.ts`
- `src/app/api/notifications/history/route.ts`
- `src/app/api/notifications/preferences/route.ts`
- `src/app/api/notifications/read-all/route.ts`
- `src/app/api/notifications/route.ts`
- `src/app/api/notifications/send/route.ts`
- `src/app/api/notifications/unread-count/route.ts`

</details>

<details>
<summary>/api/onboarding (10)</summary>

- `src/app/api/onboarding/athlete-academies/route.ts`
- `src/app/api/onboarding/checklist/mark/route.ts`
- `src/app/api/onboarding/checklist/route.ts`
- `src/app/api/onboarding/notifications/route.ts`
- `src/app/api/onboarding/owner/route.ts`
- `src/app/api/onboarding/profile/route.ts`
- `src/app/api/onboarding/state/route.ts`
- `src/app/api/onboarding/user-academies/route.ts`
- `src/app/api/onboarding/user-plan/route.ts`
- `src/app/api/onboarding/welcome-email/route.ts`

</details>

<details>
<summary>/api/payments (4)</summary>

- `src/app/api/payments/configure/route.ts`
- `src/app/api/payments/connect/onboard/route.ts`
- `src/app/api/payments/connect/refresh/route.ts`
- `src/app/api/payments/connect/status/route.ts`

</details>

<details>
<summary>/api/plans (1)</summary>

- `src/app/api/plans/route.ts`

</details>

<details>
<summary>/api/profile (7)</summary>

- `src/app/api/profile/active-academy/route.ts`
- `src/app/api/profile/adjust-plan-limits/route.ts`
- `src/app/api/profile/check-limits/route.ts`
- `src/app/api/profile/password/route.ts`
- `src/app/api/profile/preferences/route.ts`
- `src/app/api/profile/route.ts`
- `src/app/api/profile/upload-photo/route.ts`

</details>

<details>
<summary>/api/public (9)</summary>

- `src/app/api/public/academies/[id]/contact/route.ts`
- `src/app/api/public/academies/[id]/route.ts`
- `src/app/api/public/academies/filter-options/route.ts`
- `src/app/api/public/academies/route.ts`
- `src/app/api/public/clusters/route.ts`
- `src/app/api/public/events/[id]/contact/route.ts`
- `src/app/api/public/events/[id]/route.ts`
- `src/app/api/public/events/filter-options/route.ts`
- `src/app/api/public/events/route.ts`

</details>

<details>
<summary>/api/push (4)</summary>

- `src/app/api/push/send/route.ts`
- `src/app/api/push/subscribe/route.ts`
- `src/app/api/push/unsubscribe/route.ts`
- `src/app/api/push/vapid/route.ts`

</details>

<details>
<summary>/api/push-tokens (1)</summary>

- `src/app/api/push-tokens/route.ts`

</details>

<details>
<summary>/api/quick-actions (3)</summary>

- `src/app/api/quick-actions/create-class/route.ts`
- `src/app/api/quick-actions/pending-today/route.ts`
- `src/app/api/quick-actions/record-payment/route.ts`

</details>

<details>
<summary>/api/rate-limit-test (1)</summary>

- `src/app/api/rate-limit-test/route.ts`

</details>

<details>
<summary>/api/receipts (2)</summary>

- `src/app/api/receipts/[receiptId]/route.ts`
- `src/app/api/receipts/route.ts`

</details>

<details>
<summary>/api/reports (15)</summary>

- `src/app/api/reports/attendance/export/route.ts`
- `src/app/api/reports/attendance/route.ts`
- `src/app/api/reports/churn/route.ts`
- `src/app/api/reports/class/route.ts`
- `src/app/api/reports/coach/route.ts`
- `src/app/api/reports/events/export/route.ts`
- `src/app/api/reports/filter-options/route.ts`
- `src/app/api/reports/financial/export/route.ts`
- `src/app/api/reports/financial/route.ts`
- `src/app/api/reports/leaks/route.ts`
- `src/app/api/reports/progress/export/route.ts`
- `src/app/api/reports/progress/route.ts`
- `src/app/api/reports/run/route.ts`
- `src/app/api/reports/scheduled/[id]/route.ts`
- `src/app/api/reports/scheduled/route.ts`

</details>

<details>
<summary>/api/scholarships (2)</summary>

- `src/app/api/scholarships/[scholarshipId]/route.ts`
- `src/app/api/scholarships/route.ts`

</details>

<details>
<summary>/api/search (1)</summary>

- `src/app/api/search/route.ts`

</details>

<details>
<summary>/api/skills (1)</summary>

- `src/app/api/skills/route.ts`

</details>

<details>
<summary>/api/src (4)</summary>

- `src/app/auth/callback/route.ts`
- `src/app/auth/confirm/route.ts`
- `src/app/auth/redirect/route.ts`
- `src/app/llms.txt/route.ts`

</details>

<details>
<summary>/api/stripe (3)</summary>

- `src/app/api/stripe/checkout/route.ts`
- `src/app/api/stripe/connect/webhook/route.ts`
- `src/app/api/stripe/webhook/route.ts`

</details>

<details>
<summary>/api/super-admin (13)</summary>

- `src/app/api/super-admin/academies/[academyId]/public/route.ts`
- `src/app/api/super-admin/academies/[academyId]/route.ts`
- `src/app/api/super-admin/academies/route.ts`
- `src/app/api/super-admin/athletes/activate-access/route.ts`
- `src/app/api/super-admin/athletes/sync-users/route.ts`
- `src/app/api/super-admin/growth/interviews/[interviewId]/route.ts`
- `src/app/api/super-admin/growth/interviews/route.ts`
- `src/app/api/super-admin/logs/route.ts`
- `src/app/api/super-admin/metrics/route.ts`
- `src/app/api/super-admin/route.ts`
- `src/app/api/super-admin/users/[profileId]/route.ts`
- `src/app/api/super-admin/users/[profileId]/send-message/route.ts`
- `src/app/api/super-admin/users/route.ts`

</details>

<details>
<summary>/api/support (3)</summary>

- `src/app/api/support/tickets/[id]/responses/route.ts`
- `src/app/api/support/tickets/[id]/route.ts`
- `src/app/api/support/tickets/route.ts`

</details>

<details>
<summary>/api/templates (1)</summary>

- `src/app/api/templates/route.ts`

</details>

<details>
<summary>/api/tooltips (1)</summary>

- `src/app/api/tooltips/route.ts`

</details>

<details>
<summary>/api/transactions (1)</summary>

- `src/app/api/transactions/export/route.ts`

</details>

<details>
<summary>/api/upload (1)</summary>

- `src/app/api/upload/route.ts`

</details>

<details>
<summary>/api/user-preferences (2)</summary>

- `src/app/api/user-preferences/email/route.ts`
- `src/app/api/user-preferences/route.ts`

</details>

<details>
<summary>/api/users (1)</summary>

- `src/app/api/users/[userId]/activity/route.ts`

</details>

<details>
<summary>/api/whatsapp (2)</summary>

- `src/app/api/whatsapp/send/route.ts`
- `src/app/api/whatsapp/verify/route.ts`

</details>

## Guardas, consumidores y duplicación

- Las páginas modernas consumen APIs bajo `/api/**`; la seguridad efectiva está en los wrappers/route registry, no en el menú.
- Las rutas bearer de familia/móvil validan token con Supabase y deben acotar recurso propio.
- Cron usa secreto; webhooks verifican firma y quedan fuera del rate limit global para no romper proveedores.
- Legacy y moderno coexisten. La retirada está bloqueada hasta telemetría y equivalencia de permisos/QA.
- Hay 30 `loading.tsx`, 3 `error.tsx` y 2 `not-found.tsx`; la cobertura de estados no es uniforme en 167 páginas.

## Hallazgos

| ID | Archivo/símbolo | Problema y evidencia | Severidad | Riesgo de producción | Recomendación concreta | Responsable |
|---|---|---|---|---|---|---|
| ROUTE-001 | `middleware.ts:26,256-284`; `src/app/page.tsx` | El middleware afirma que no existe handler localizado raíz y redirige `/` a `/{locale}/gimnasia-artistica`, aunque sí existe una landing raíz completa. | Alta | La landing/canonical y el funnel observado en local divergen de producción. | Formalizar si `/` debe renderizar landing o redirigir; test de contrato en ES/EN y canonicals antes de deploy. | Terra |
| ROUTE-002 | `src/app/dashboard/**`; `src/app/app/[academyId]/**` | 30 páginas legacy coexisten con la superficie moderna. | Media | Duplicación de navegación, guards y enlaces profundos; drift de permisos. | Mantener redirects y telemetría seis meses; retirar solo con destinos y tests equivalentes. | Terra |
| ROUTE-003 | 42 `src/app/api/**/route.ts` | Persisten respuestas `NextResponse.json` fuera del helper estándar; 177/294 rutas tienen Zod/validación equivalente según el auditor actual. | Media | Contratos y validación heterogéneos; clientes manejan errores distintos. | Inventariar excepciones justificadas y migrar por dominio con contract tests, sin refactor masivo. | Terra |
| ROUTE-004 | rutas con permission registry | El auditor estricto no detecta por sí solo todos los contratos de rol; el test baseline actualizado cubre la firma vigente de `permission-policy.ts`. | Crítica | “294 rutas protegidas” no significa autorización correcta por rol. | Mantener casos ejecutables de permiso baseline y negativas BOLA, no solo clasificación estática. | Sol |

## Avance Día 3

El auditor mantiene la clasificación exacta de 294 handlers y emite capability por método, Zod/validación equivalente, rate limit, academia, resource scope, service role, entrada `tenantId`, datos sensibles y contrato de denegación. El gate estricto queda en cero rutas `risky`, cero riesgos semánticos y cero scopes `manual-review`; ROUTE-004 queda cerrado. Véase `API_AUTHORIZATION_MATRIX.md`.

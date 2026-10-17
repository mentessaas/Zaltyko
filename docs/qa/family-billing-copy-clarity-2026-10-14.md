# Claridad del copy de cobro familiar — 2026-10-14

## Alcance

Corrección local de mensajes en la preferencia Owner, ficha pública Growth,
artículo de cobros y formulario de registro de pago. No modifica precios,
entitlements, persistencia de preferencias, consentimiento, selección del modo
del cargo ni procesamiento. Free y trial permanecen manuales. En planes de
pago, «Solicitar automático» guarda solo una preferencia futura; el modo
efectivo sigue siendo manual y el procesamiento no está liberado.

La nota técnica de cobros ahora marca el PaymentIntent off-session automático
como previsto/no liberado. El documento de pricing histórico
`docs/marketing/zaltyko-pricing.md` ya se identifica como superseded; no se
reescribió su contenido histórico.

## Verificación local

- Vitest focal: 5 archivos, 43/43 PASS, incluidos los contratos de copy, el
  gate Free/paid, la ruta de preferencia, la elegibilidad y el loader del blog.
- `pnpm typecheck`: PASS.
- ESLint focal: PASS sin errores; conserva un warning existente de
  `react-hooks/set-state-in-effect` en `FamilyCollectionModeCard.tsx:37`.
- Prettier PASS para los archivos TS/TSX que ya siguen su formato, el nuevo
  test, el JSON y esta nota. `FamilyCollectionModeCard.tsx` ya falla Prettier
  en el SHA base; se preservó su formato y solo se cambió el copy para evitar
  churn ajeno. No se reformatearon en masa los documentos Markdown existentes.
- Sin navegador/E2E, sandbox, plataformas, producción ni Stripe Live.

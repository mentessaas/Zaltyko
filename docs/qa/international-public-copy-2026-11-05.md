# Copy público internacional para España y México

## Hallazgos

- La primera FAQ y la descripción de inicio presentaban España como único mercado. El copy ahora distingue la configuración administrativa en español para España y México.
- La FAQ aclara que las cuotas familiares se registran manualmente en EUR o MXN, según la moneda de la academia, sin conversión automática ni emisión de facturas fiscales mexicanas.
- La pregunta de planes informa que los importes SaaS se expresan en EUR y que la contratación internacional aún no está habilitada. Se conservaron los importes y el canal de contacto de Network.
- Para academias de otros países, la FAQ remite al contacto existente. No se atribuye cobertura federativa mexicana ni se afirma que el checkout esté activo en México.

## Fuente

- Código estático: `src/modules/organizations/domain/administrative-market-capabilities.ts` limita los perfiles administrativos a ES/MX y establece EUR/MXN; el perfil de México declara cobertura general de identidad, sin categorías ni requisitos federativos mexicanos.
- Pruebas fuente existentes: `tests/bootstrap-organization-canonical-profile.test.ts` y `tests/owner-setup-form.test.tsx` incluyen el perfil mexicano y la moneda MXN. Son fixtures/contratos de código, no evidencia de operación pública.
- Copy actualizado: `src/lib/launch/essential-public-catalog.ts` y `src/app/page.tsx`. Se añadió `tests/international-public-copy-contract.test.ts` como contrato estático.

## Importancia

Evita confundir el alcance administrativo y el registro manual de cuotas con la disponibilidad de contratación SaaS o capacidades fiscales/federativas no demostradas.

## Siguiente paso

La revisión de este cambio es estática. No se ejecutaron pruebas, CI, builds, checkout, alta real ni validación de runtime/publicación. Antes de ampliar la contratación o dirigir tráfico internacional, verificar por separado el acceso real, la elegibilidad de país y la disponibilidad comercial.

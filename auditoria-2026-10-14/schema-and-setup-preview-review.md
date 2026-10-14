# Revisión de esquema multiclase y vista previa de Setup

## Hallazgos clave

1. La migración WIP `20261014001209` relaciona tarifa, sede y plantilla con
   claves compuestas y exclusión temporal. Aún no integrada ni probada por Main.
2. La revisión encontró que faltaban revocación completa de grants heredados,
   protección física del historial de clases de una línea y vínculo entre sede
   de la línea y sede de su factura. Backend recibe casos negativos requeridos.
3. Revalidación de la alerta inicial sobre fechas: el esquema base del ledger
   ya declara ambos períodos NOT NULL (`20261006093047`, líneas 105–106) y
   Drizzle coincide. No existe el supuesto bypass NULL en esa instalación.
   Mantener la prueba negativa 23502; el nuevo control necesario es delimitar
   el mes completo. Una comparación con NULL por sí sola no sustituye NOT NULL.
4. El contrato puro requiere importe entero seguro y conjuntos sin duplicados.
   Estas observaciones son de código WIP, no fallos ya corregidos/verificados.
5. `/owner/setup/preview` llama al formulario sin DTO contractual. El componente
   devuelve un aviso y no el formulario que espera la prueba responsive. Es
   evidencia estática; no se atribuye una captura visual todavía.

## Decisiones y siguientes pasos

Backend mantiene ownership del esquema/contratos y sus pruebas reales.
Frontend corrige la vista previa local con un modo sintético explícito que
impida cualquier POST incluso al forzar submit. El guard de producción conserva
404; no se habilita una ruta pública de escritura para facilitar QA.

Fuente: lectura de migración y `monthly-athlete-tariff.ts` en worktree Backend,
`src/app/owner/setup/preview/page.tsx`, `OwnerSetupForm.tsx` y
`tests/audit/owner-setup-preview.spec.ts` en integración `ed2c1aa2`.
Accionable: sí. Cierre: SHA revisable, pruebas negativas PostgreSQL/contrato,
no envío en preview, y verificación responsive/Axe separada del walkthrough.

La segunda ejecución Chromium continúa en un runner único de QA. No se toca
su base ni se reinicia por una espera sin salida. Ninguna revisión aquí aplica
migraciones remotas, cambia credenciales ni demuestra DEMO/PILOT-READY.

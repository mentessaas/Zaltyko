---
status: active
owner: producto
last_reviewed: 2026-06-26
source:
  - ../README.md
  - ../AGENTS.md
  - ../docs/organization/01-PROJECT/OVERVIEW.md
---
# Glosario

| Termino | Significado |
| --- | --- |
| Academia | Tenant principal del sistema. Sus datos deben estar aislados. |
| Atleta | Alumno/deportista inscrito en una academia. En gimnasia puede mostrarse como gimnasta. |
| Coach | Entrenador asignado a clases, grupos, evaluaciones o eventos. |
| Guardian | Padre, madre o tutor responsable de un atleta. |
| Tenant | Contexto de academia usado para aislar datos por cliente. |
| `withTenant` | Wrapper obligatorio para APIs de tenant. Valida usuario, permisos y academia. |
| RLS | Row Level Security de PostgreSQL/Supabase para aislamiento de datos. |
| Drizzle | ORM usado para schema y queries TypeScript. |
| shadcn/ui | Base de componentes UI sobre Radix + Tailwind. |
| Trial | Periodo de prueba de una academia o plan. Debe estar alineado con billing y onboarding. |
| Aha moment | Primer momento donde el cliente percibe valor real. Ejemplo: procesar pago o ver reporte útil. |
| MQL | Lead cualificado por marketing. |
| ICP | Perfil de cliente ideal. |
| Churn | Cancelación o abandono de cliente. |
| Health score | Señal compuesta de uso, adopción y riesgo del cliente. |
| Cluster | Página pública generada por combinación locale/modalidad/país para SEO local (`/${locale}/${modality}/${country}`). |
| Modalidad | Disciplina deportiva (ej. gimnasia artística/rítmica). La raíz `/` redirige a la primera modalidad del catálogo. |
| RHF + Zod | React Hook Form con resolver Zod; patrón obligatorio para formularios nuevos (ver [[Patrones obligatorios]]). |

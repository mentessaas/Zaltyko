---
status: active
owner: tech
last_reviewed: 2026-07-31
source:
  - ../AGENTS.md
  - ../06-Roadmap-y-Tareas/Decisiones.md
  - ../00-Inicio/Guia de trabajo para agentes.md
---

# Decisiones

Decisiones técnicas y operativas que afectan a marketing, infraestructura de sitios y proyectos satélite. Cualquier decisión que toque repoPath canónico, dominios públicos o integraciones externas debe quedar aquí además de en `06-Roadmap-y-Tareas/Decisiones.md`.

## 2026-07-31 - Whitelist canónica de `repoPath` por proyecto

| Campo | Valor |
| --- | --- |
| Contexto | El control C-1+C-3 del gate anti-spoofing (ver `06-Roadmap-y-Tareas/Decisiones.md` 2026-07-31) exige que el `repoPath` declarado en cada WorkProduct pertenezca a una lista blanca por proyecto, almacenada operativamente en `projects.codeRepoPaths` (jsonb, migración `0196`). Sin whitelist poblada, el gate rechaza toda transición `in_review → done` con `409 RepoNotRegistered` (ZAL-118). Esta nota documenta la tabla canónica y la autoridad del seed. |
| Decisión | La whitelist canónica de `repoPath` por proyecto Paperclip es: |

| Proyecto | repoPath canónico | Working tree | HEAD de referencia | Origen del path | Estado |
| --- | --- | --- | --- | --- | --- |
| Zaltyko Web | `/Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko` | mismo path | HEAD actual de la rama base del PR | documentado en este vault | seed operativo pendiente (ZAL-118) |
| Zaltyko Mobile | `/Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko/mobile` | mismo path | HEAD actual de la rama base del PR | documentado en este vault | seed operativo pendiente (ZAL-118); pendiente confirmación con Mobile Developer |
| Paperclip Server | `/Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Paperclip` | mismo path | HEAD actual de la rama base del PR | documentado en este vault | seed operativo pendiente cuando ZAL-92+ZAL-118 cierren; sin esto ZAL-88/ZAL-89/ZAL-90 no se pueden transicionar en producción |

| Campo continuación | Valor |
| --- | --- |
| Consecuencia | Esta tabla es la **autoridad documental** de la whitelist; la autoridad operativa es `projects.codeRepoPaths` (jsonb) y ambas deben coincidir bit-a-bit al cierre de ZAL-118. Cualquier cambio de `repoPath` requiere: (1) edición de esta nota con bump de `last_reviewed`, (2) seed/migración de datos en `projects.codeRepoPaths`, (3) PR firmado con SHA + peer-verification (ZAL-89 C-2), (4) confirmación por el owner técnico del proyecto afectado (Web Developer, Mobile Developer, Engineering Lead según corresponda). Paths con `…` o aproximaciones están prohibidos: solo paths absolutos resueltos y verificables con `git -C <path> rev-parse --show-toplevel`. |
| Estado | Activa en vault; pendiente seed operativo en DB (ZAL-118). Board firma al cierre de ZAL-92. Refs: ZAL-86 (padre), ZAL-88 (gate C-1+C-3), ZAL-89 (gate C-2), ZAL-90 (gate C-4), ZAL-117 (peer-verification ZAL-88), ZAL-118 (operacional). |

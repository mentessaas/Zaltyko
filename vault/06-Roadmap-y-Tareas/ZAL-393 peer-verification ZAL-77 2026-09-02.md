---
status: blocked
owner: Marketing
last_reviewed: 2026-09-02
source:
  - ../../AGENTS.md
  - ./Decisiones.md
  - ../00-Inicio/Guia de trabajo para agentes.md
---

# ZAL-393 — Peer-verification de ZAL-77

## Evidencia local/sandbox

Se verificó el commit `fa3985e943e236579d8282217fbc64bb9e759fe0` en el repo
canónico y en un clon peer separado creado dentro del scratch del run. El clon
no modifica el checkout canónico ni producción.

Comandos exigidos por el gate, ejecutados en el clon peer:

```text
git -C <peerWorktree> cat-file -t fa3985e943e236579d8282217fbc64bb9e759fe0
commit
git -C <peerWorktree> log -1 --format=%H fa3985e943e236579d8282217fbc64bb9e759fe0
fa3985e943e236579d8282217fbc64bb9e759fe0
```

El SHA corresponde a:

```text
chore(landing): ZAL-72 dead code cleanup + ZAL-77 cluster client/server split
```

## Bloqueo de control plane

El POST a `/api/issues/ZAL-77/completion-proofs/peer-verifications` no pudo
persistirse porque `PAPERCLIP_API_URL` resolvió a `http://127.0.0.1:3100` y el
control plane rechazó la conexión (`curl: (7) Failed to connect`). Por tanto,
no hay respuesta `201` ni fila persistida, y este issue no debe declararse
`done`/`PASS`.

Desbloqueo exacto: recuperar el listener del control plane y repetir el POST
con el agente efectivo del run (`04643dd6-2bc7-40da-a312-6249c57dcfa1`), sin
suplantar al Engineering Lead.

Vault: se creó esta nota de evidencia; no se modificó `Changelog interno.md`
porque el checkout contiene cambios paralelos ajenos en ese archivo.

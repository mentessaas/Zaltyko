# ZAL-964 — Evidencia C-2 peer verification ZAL-768

Estado: `blocked` por indisponibilidad del control-plane; la verificación Git local es positiva.

Worktree independiente usado: `/private/tmp/zal-768-peer`.

Evidencia literal:

```text
$ git -C /private/tmp/zal-768-peer cat-file -t 811f5ede
commit
$ git -C /private/tmp/zal-768-peer log -1 --format=%H 811f5ede
811f5edee51f8721a765d0bf718419b0d38f8be9
```

El SHA corto enviado debe ser exactamente `811f5ede`. El POST a
`/api/issues/73cf63ab-63ab-4f97-aeaf-acdb7c3128b9/completion-proofs/peer-verifications`
no pudo completarse: conexión rechazada en `127.0.0.1:3100`, `HTTP_STATUS:000`.
El comentario y el cambio de estado remoto tampoco pudieron publicarse por la misma
indisponibilidad.

Owner de desbloqueo: runtime/control-plane. Acción: restaurar la API y reejecutar el
POST con el payload de la issue; después publicar esta evidencia y marcar la issue
según la respuesta del gate.

## Reintento 2026-08-26

Se revalidó en el worktree par separado
`/Users/elvisvaldesinerarte/Desktop/qa-worktrees/zal-964-peer`:

```text
$ git -C /Users/elvisvaldesinerarte/Desktop/qa-worktrees/zal-964-peer cat-file -t 811f5ede
commit
$ git -C /Users/elvisvaldesinerarte/Desktop/qa-worktrees/zal-964-peer log -1 --format=%H 811f5ede
811f5edee51f8721a765d0bf718419b0d38f8be9
$ git -C /Users/elvisvaldesinerarte/Desktop/qa-worktrees/zal-964-peer log --oneline -1 811f5ede
811f5ede feat(mobile): ZAL-768 contrato del rol provider + fallback seguro de rol
$ git -C /Users/elvisvaldesinerarte/Desktop/qa-worktrees/zal-964-peer status --short --branch
## HEAD (no branch)
```

Se intentó publicar el proof dos veces y ambas respuestas fueron:
`curl: (7) Failed to connect to 127.0.0.1 port 3100 after 0 ms: Couldn't connect to server`.
El GET read-only de la issue y `/health` también fueron rechazados; no se pudo
registrar el proof, comentario ni transición remota. Por la regla de dos fallos
consecutivos no se reintentará esta escritura durante el heartbeat.

Vault: este work product documenta la verificación; no cambia producto, pricing,
arquitectura, seguridad ni roadmap.

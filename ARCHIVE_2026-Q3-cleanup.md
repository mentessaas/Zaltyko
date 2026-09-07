## Archive — 2026-Q3 branch cleanup snapshot

> **Punto de referencia único para la auditoría masiva de ramas del 2026-09-07/08.**
> Esta rama `archive/2026-Q3-cleanup` y su tag anotado `archive-2026-Q3-cleanup`
> son el **snapshot nominal** del estado de limpieza. Las ramas divergentes
> individuales listadas abajo siguen existiendo como branches locales y pueden
> ser consultadas/referenciadas directamente.
>
> **Decisión del CEO (2026-09-08):** mantener todas las ramas con trabajo
> real no promovido (sección B) y archivar el resto en este punto de referencia.
> main queda intacto.

### A) Ramas eliminadas previamente en esta sesión (2026-09-07/08)

Las siguientes ramas fueron borradas porque (i) su contenido está en
`origin/main` vía merge o squash-merge, o (ii) eran orphans sin trabajo
revalorable. Los commits siguen siendo accesibles vía:

- `git reflog` (90 días)
- `git fsck --unreachable --no-reflogs`
- Cualquier otra branch que comparta esos commits

#### A.1) Locales merged → main (8)

| Rama | Tip | Recuperable via |
|------|-----|-----------------|
| `fix/r2-features-tabs-smoke-regression-2026-09-07` | merge PR #109 | `git fsck` |
| `fix/zal-1032-mobile-contrast-tokens` | merge PR #108 | `git fsck` |
| `local/feat/zal-10-sca-recovery` | merge PR #85 | `git fsck` |
| `local/fix/zal-40-country-cluster-gate` | merge main | `git fsck` |
| `local/fix/zal-770-no-node-crypto-pwned-password` | merge main | `git fsck` |
| `local/gates/ZAL-556` | merge main | `git fsck` |
| `local/tmp-merge-zal770` | merge main | `git fsck` |
| `local/zaltyko-onboarding-ZAL-137` | merge main | `git fsck` |

#### A.2) Local orphan (sin merge-base) — `local/main` (1)

| Rama | Tip | Notas |
|------|-----|-------|
| `local/main` | `45ad1ad60` | Pre-move Zaltyko snapshot (2026-07-19 a 2026-08-05), sin ancestro común con `origin/main`. Era `main` antes del move a Zaltyko-fresh. Contenido recuperable vía `local/zaltyko-onboarding-ZAL-137`, `local/zaltyko-gtm-strategy-ZAL-252`, `local/zaltyko-mobile-ZAL-396` (3+ branches comparten el grueso del contenido). |

#### A.3) Local con cherry-pick peligroso (1)

| Rama | Tip | Notas |
|------|-----|-------|
| `zal770-recovered` | `294edfa2` + 2 | Investigación del 2026-09-07: `294edfa2` es limpieza de merge markers (NO features). Cherry-pick produce **68 conflictos** y revierte el ZAL-499 security gate (PR #67). Decisión CEO: borrar aceptando perder los 3 commits — la "limpieza de merge markers" no aporta valor y el riesgo de regresión no compensa. |

#### A.4) Remotas merged → main (12)

```
origin/codex/fix-class-reminders-reporting
origin/codex/fix-confirmed-signup-routing
origin/codex/fix-daily-alerts-reporting
origin/codex/fix-trial-lifecycle-delivery
origin/codex/idempotent-payment-reminders
origin/codex/isolate-collect-charges-academies
origin/codex/isolate-session-generation-tenants
origin/design-system/brand-tokens-v1
origin/fix/r2-features-tabs-smoke-regression-2026-09-07
origin/fix/zal-1032-mobile-contrast-tokens
origin/fix/zal-686-studentrow-touch-targets
origin/worktree-zal-153-peer-verify
```

---

### B) Ramas con trabajo real NO promovido a main (KEEP)

Estas 6 ramas tienen cambios únicos cuyo destino **no es óbice de limpieza**, sino
**deuda de promoción**. El CEO (2026-09-08) decidió mantenerlas como branches para
no perder el trabajo y permitir fusión selectiva en el futuro.

#### B.1) `local/anchor/zal-376-c1-canonical`

- **Tip:** 1 commit, 1 archivo modificado, **1 línea añadida**
- **Contenido único:** `mobile/.env.example` — `# C-1 anchor for ZAL-376 peer-verification tracker — supersedes d1830026 with allowlisted repoPath`
- **Por qué KEEP:** anchor explícito de peer-verification; perderlo rompe la trazabilidad del tracker C-1.
- **Acción recomendada:** fusionar a `mobile/.env.example` cuando se promocione el C-1 peer-verify de ZAL-376.

#### B.2) `local/fix/zal-14-register-name-attr`

- **Tip:** 1 commit, 1 archivo modificado, **2 líneas añadidas**
- **Contenido único:** `.vercelignore` — añade `.claude` y `.paperclip-scratch`
- **Nota:** main tiene `mobile` en `.vercelignore` (intención distinta — excluir uploads de Vercel).
- **Por qué KEEP:** trabajo de build hygiene distinto al merged; si se necesita excluir artefactos locales del deploy de Vercel, esta rama lo hace.
- **Acción recomendada:** revisar si Vercel necesita excluir `.claude/`/`.paperclip-scratch/`. Si sí, fusionar; si no, archivar tras decisión explícita.

#### B.3) `fix/r2-csp-nonce-hydration-2026-09-07`

- **Tip:** 1 commit, 1 archivo modificado, **7 inserciones, 1 borrado (8 líneas net)**
- **Contenido único:** `tests/growth-canonical.test.ts` — **split del test "rechaza discrepancia" en dos casos separados** ("plan" vs "moneda") con cobertura más granular.
- **Nota:** main tiene un único test combinado "rechaza discrepancias de plan y moneda aunque coincidan ID y estado" (cobertura menor).
- **Por qué KEEP:** **mejora real de cobertura de tests** sobre el módulo de reconciliación de cobros (R6).
- **Acción recomendada:** fusionar a `tests/growth-canonical.test.ts` — promoción limpia de R6 testing.

#### B.4) `local/test/zal-410-sca-3ds-e2e`

- **Tip:** 2 commits, 3 archivos (`docs/RUNBOOK_E2E_SCA_3DS.md`, `tests/e2e-zaltyko-sca-3ds-flow.spec.ts`, `vault/06-Roadmap-y-Tareas/Changelog interno.md`)
- **Contenido único:** entrada de changelog `## 2026-08-07 - ZAL-410: recorrido E2E live del reto 3DS (owner + familia)` documenta el wake del board tras la aceptación de las request_confirmation.
- **Nota:** los 2 archivos técnicos (runbook + spec) son **idénticos** a los de `origin/main`; solo la entrada de changelog es única.
- **Por qué KEEP:** la entrada documenta el recorrido E2E live del reto 3DS y la decisión del board; perderla borra historia verificable.
- **Acción recomendada:** cherry-pick del commit `e4e62b33` (`docs(vault): ZAL-410 entrada del recorrido E2E live 3DS + correccion del bloqueante`) sobre `origin/main` para añadir la entrada sin afectar los archivos técnicos.

#### B.5) `local/qa/zal-554-a11y-gate-hardened`

- **Tip:** 2 commits, 1 archivo modificado, **156 inserciones, 23 borrados (179 líneas net)**
- **Contenido único:** `tests/a11y-zaltyko.spec.ts` — array `VIEWPORTS` (320px, 390px, desktop 1280×720), array `NAMED_EXCEPTIONS` (regla + ticket + review-by + razón), imports adicionales.
- **Nota:** main tiene una versión **simplificada** del archivo (sin viewports ni named exceptions). Los commits `afee9b37` y `c524b221` de ZAL-554 están en la historia de main pero la simplificación actual los revirtió.
- **Por qué KEEP:** trabajo técnico real de **WCAG 1.4.10 reflow + named exceptions** que endurece el gate de a11y. Sin esto, el gate queda con tolerancia única de viewport desktop.
- **Acción recomendada:** fusionar `c524b221` (`test(a11y): harden gate with 3 viewports, hydration signal, reflow and critical/serious filter (ZAL-554)`) — restauración de R9 a11y hardening.

#### B.6) `local/zal-296-failover-log-doc`

- **Tip:** 2 commits, 2 archivos (`vault/02-Tecnologia/ZAL-296 failover router dry-run log format.md` nuevo + changelog)
- **Contenido único:** **NUEVO archivo `vault/02-Tecnologia/ZAL-296 failover router dry-run log format.md` que NO existe en `origin/main`**.
- **Por qué KEEP:** documentación operativa del formato de log de dry-run del failover router — referencia técnica para ZAL-296 / ZAL-924.
- **Acción recomendada:** cherry-pick de ambos commits a main para añadir el documento al vault.

---

### C) Ramas divergentes / orphan restantes (NO auditadas en detalle)

Estas ~80 ramas no se han auditado commit-por-commit en esta sesión. Quedan
en `git branch` como branches locales. Antes de cualquier promoción o borrado
masivo, abrir sesión de auditoría dedicada (estimación: 2-3 horas con análisis
de overlap de archivos entre clusters `tests/a11y-zaltyko.spec.ts` (50+ ramas)
y `docs/RUNBOOK_E2E_SCA_3DS.md` (14+ ramas)).

Listado completo en `/tmp/branch-report.txt` (snapshot del 2026-09-07).

**Clusters identificados (overlap de archivos):**

- `tests/a11y-zaltyko.spec.ts` — 7 branches divergentes tocan este archivo. Probable superset del trabajo de ZAL-554 (B.5).
- `docs/RUNBOOK_E2E_SCA_3DS.md` — 14+ branches divergentes. Trabajo de E2E SCA/3DS fragmentado entre múltiples ramas.
- `vault/06-Roadmap-y-Tareas/Changelog interno.md` — la mayoría de las branches divergentes modifican el changelog. **Hallazgo:** el changelog en main ya contiene las entradas de fechas posteriores, así que muchos "ahead" son entradas de changelog obsoletas.
- `.vercelignore` — 3 branches (B.2, `local/worktree-agent-a546df88329453d01`, `pr-67`).

---

### D) Procedimiento de recuperación

Si en el futuro hace falta traer contenido de cualquiera de estas ramas:

```bash
# 1) Ver el diff único de una rama respecto a su merge-base
git diff $(git merge-base <branch> origin/main)..<branch>

# 2) Aplicar commits específicos a una rama de trabajo
git checkout -b recovery/<branch-name> origin/main
git cherry-pick <commit-sha>

# 3) Traer el árbol completo de una rama a una rama de archivo
git checkout archive/2026-Q3-cleanup
git checkout <source-branch> -- <path/to/file>
```

Para commits ya borrados pero cuyo SHA se conozca:

```bash
git fsck --unreachable --no-reflogs        # lista objetos no referenciados
git show <sha>                              # inspeccionar
git checkout <sha> -- <path/to/file>        # traer árbol
```

---

### E) Metadata de la rama

- **Branch:** `archive/2026-Q3-cleanup` (HEAD = `50193b84` = `origin/main` al 2026-09-07T22:30Z)
- **Tag:** `archive-2026-Q3-cleanup` (anotado)
- **Auditoría inicial:** 2026-09-07 (branch cleanup report → `/tmp/cleanup-report.txt`)
- **Auditoría masiva:** 2026-09-08 (6 NOT SAFE branches detail)
- **Decisión CEO:** mantener todas las NOT SAFE, archivar referencia en esta rama
- **Próxima acción:** ticket(s) de promoción individual para B.1–B.6 cuando se decida el alcance

# 📋 PLAN TÉCNICO ZALTYKO - Cofounder Review

**Fecha:** 2026-02-11  
**Proyecto:** Zaltyko - SaaS para gestión de academias de gimnasia  
**Estado:** En desarrollo activo - Necesita estabilización antes de producción

---

## 🔴 CRÍTICO - Problemas que bloquean producción

### 1. Calidad de Código
- **Scripts de fix masivos:** 10+ scripts (`fix-critical-errors.js`, `fix-all-hooks.js`, etc.) indican deuda técnica grave
- **Errores de sintaxis recurrentes:** Problemas con caracteres especiales, comillas escapadas
- **Hooks de React mal usados:** Probable violación de reglas de hooks

### 2. Testing
- **Tests existentes pero sin cobertura garantizada:** 20+ archivos de test pero estado desconocido
- **Sin CI/CD pipeline:** No hay GitHub Actions para validar PRs

### 3. Seguridad
- **RLS (Row Level Security):** Scripts `apply-rls-policies.ts` y `validate-rls.ts` indican que la seguridad de Supabase está en proceso
- **Secrets management:** `CRON_SECRET` y otros secrets necesitan rotación

### 4. Performance
- **Sin análisis de bundle:** Next.js puede tener imports pesados sin tree-shaking
- **Imágenes no optimizadas:** Script `revert-image-changes.js` sugiere problemas con next/image

---

## 🟡 IMPORTANTE - Mejoras necesarias

### 5. Arquitectura
- **Multi-tenancy:** Validar aislamiento completo entre academias
- **Rate limiting:** Implementado en middleware pero necesita tuning
- **Caching:** Sin estrategia de caché (Redis/Vercel KV poco usado)

### 6. UX/UI
- **Onboarding:** Flujo de onboarding complejo (muchos `onboarding-*` archivos)
- **Error boundaries:** Implementados genéricamente pero sin manejo específico de errores de UI

### 7. Data & Analytics
- **Event logging:** Tabla `event-logs.ts` existe pero ¿se usa?
- **Audit logs:** Implementado pero ¿se consultan?
- **Métricas de negocio:** Sin dashboard de métricas clave (MRR, churn, etc.)

---

## 🟢 NICE TO HAVE - Features futuras

### 8. Integraciones
- **Stripe:** Configurado pero ¿webhooks funcionan? (test `api-stripe-webhook.test.ts`)
- **Mailgun:** Configurado pero ¿deliverability? (tabla `email-logs.ts`)
- **LemonSqueezy:** Dependencia vieja (`lemonsqueezy.ts` deprecated)

### 9. Mobile
- **PWA:** No hay manifest ni service worker
- **Responsive:** Componentes de Radix UI pero sin testing móvil

---

## ✅ LO QUE SÍ FUNCIONA (No tocar)

1. **Auth con Supabase:** SSR configurado correctamente (`@supabase/ssr`)
2. **Base de datos:** Schema completo y bien estructurado (50+ tablas)
3. **Error handling:** Recién implementado (US-001 a US-012)
4. **TypeScript:** Configuración strict
5. **Drizzle ORM:** Buena abstracción de DB

---

## 🎯 ROADMAP TÉCNICO - Próximos 30 días

### Semana 1: Estabilización
| Día | Tarea | Prioridad | Owner |
|-----|-------|-----------|-------|
| 1-2 | Fix hooks de React (reglas de hooks) | 🔴 CRÍTICO | Elvis |
| 3 | Limpiar scripts de fix (ejecutar y eliminar) | 🔴 CRÍTICO | Elvis |
| 4-5 | Validar RLS policies en Supabase | 🔴 CRÍTICO | Elvis |
| 6-7 | Configurar CI/CD básico (GitHub Actions) | 🟡 ALTO | Elvis |

### Semana 2: Testing
| Día | Tarea | Prioridad | Owner |
|-----|-------|-----------|-------|
| 8-10 | Hacer pasar todos los tests existentes | 🔴 CRÍTICO | Elvis |
| 11-12 | Tests de integración críticos (auth, pagos) | 🟡 ALTO | Elvis |
| 13-14 | Cobertura de tests > 60% | 🟡 ALTO | Elvis |

### Semana 3: Performance & Seguridad
| Día | Tarea | Prioridad | Owner |
|-----|-------|-----------|-------|
| 15-17 | Análisis de bundle + optimización | 🟡 ALTO | Elvis |
| 18-19 | Implementar caché (Redis/Vercel KV) | 🟡 ALTO | Elvis |
| 20-21 | Security audit (OWASP Top 10) | 🟡 ALTO | Elvis |

### Semana 4: Preparación Producción
| Día | Tarea | Prioridad | Owner |
|-----|-------|-----------|-------|
| 22-24 | Beta cerrada con 5 academias | 🟢 MEDIO | Elvis |
| 25-26 | Onboarding simplificado | 🟢 MEDIO | Elvis |
| 27-28 | Dashboard de métricas básico | 🟢 MEDIO | Elvis |
| 29-30 | Launch en ProductHunt/IndieHackers | 🟢 MEDIO | Elvis |

---

## 📝 TAREAS INMEDIATAS (Hoy)

### Tarea 1: Fix React Hooks
```bash
# Ejecutar eslint con regla de hooks
npm run lint -- --rule 'react-hooks/rules-of-hooks: error'
# Corregir todos los errores
```

### Tarea 2: Ejecutar scripts de fix
```bash
# Ejecutar en orden
node scripts/fix-critical-errors.js
node scripts/fix-react-hooks.js
node scripts/fix-all-warnings.js
# Luego eliminarlos si funcionan
```

### Tarea 3: Validar tests
```bash
npm test
# Si fallan, arreglar los críticos
```

### Tarea 4: Verificar RLS
```bash
npm run validate:rls
# Aplicar si faltan
npm run apply-rls-policies
```

---

## 📊 Métricas de Éxito

| Métrica | Actual | Objetivo 30 días |
|---------|--------|------------------|
| Tests pasando | ?% | 100% |
| Cobertura | ?% | > 60% |
| Build sin warnings | ❌ | ✅ |
| Lighthouse score | ? | > 80 |
| Tiempo de carga | ? | < 3s |
| Bugs críticos | ? | 0 |
| Academias beta | 0 | 5 |

---

## ⚠️ RIESGOS

1. **Technical debt:** Demasiados scripts de fix sugieren código frágil
2. **Scope creep:** Muchas features sin terminar (scholarships, discounts, etc.)
3. **Performance:** Sin análisis real de carga con datos reales
4. **Competencia:** Pueden salir antes al mercado

---

## 💡 RECOMENDACIONES

1. **Freeze de features:** No más nuevas features hasta estabilizar
2. **Code review obligatorio:** Todos los PRs necesitan review
3. **Staging environment:** Deployar a Vercel preview antes de producción
4. **Monitoreo:** Implementar Sentry fully (configurado pero verificar)

---

**Próximo paso:** ¿Empezamos con Tarea 1 (fix hooks) o prefieres revisar algo específico primero?

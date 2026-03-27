# Roadmap Zaltyko - Q1 2026

## Visión
Construir el mejor SaaS de gestión de academias de gimnasia del mundo.

---

## Área 1: Marketplace/Empleo ✅ COMPLETO

- [x] Schema de advertising
- [x] API de advertising zones
- [x] Componente AdBanner
- [x] Páginas de detalle (marketplace/[id], empleo/[id])
- [x] Formularios de creación (nuevo)
- [x] Navegación en navbar

---

## Área 2: Código Limpio ✅ COMPLETO

- [x] Limpieza de imports no usados en APIs
- [x] Arreglar rutas dinámicas
- [x] Tipos TypeScript mejorar (formatAcademyType → lib/formatters)
- [x] Componentes duplicados (OwnerProfile → OptimizedOwnerProfile)

---

## Área 3: Estabilidad 🟡 EN PROGRESO

- [x] Rutas dinámicas arregladas
- [x] Build funciona sin errores
- [ ] Testing - coverage actual
- [ ] Errores en runtime revisar

---

## Área 4: AI ✅ FASE 1-4 COMPLETAS

- [x] Fase 1: Foundation (cliente, orchestrator, API routes)
- [x] Fase 2: Billing AI (widget de predicción)
- [x] Fase 3: Attendance AI (alertas de riesgo)
- [x] Fase 4: Communication AI (chatbot)

---

## Área 5: UX/UI ✅ COMPLETO

- [x] Empty states mejorados
- [x] Spacing mejorado
- [x] Console.logs de debug eliminados
- [x] Chatbot integrado

---

## Área 6: Eventos ✅ COMPLETO

- [x] Sistema de inscripciones
- [x] Lista de espera (waitlist)
- [x] Sistema de categorías por edad/level
- [x] Estados de evento (borrador, publicado, cancelado)
- [x] Countdown para eventos

---

## Área 7: Evaluaciones ✅ COMPLETO

- [x] Tipos de evaluación (técnica, artística, física)
- [x] Rúbricas configurables
- [x] Videos en evaluaciones
- [x] Gráficos de progreso
- [x] Export a PDF

---

## Área 8: Clases y Grupos ✅ COMPLETO

- [x] Clases de prueba gratuitas
- [x] Waiting list
- [x] Política de cancelación configurable
- [x] Vista de calendario
- [x] Indicador de ocupación
- [x] Analytics por clase

---

## Área 9: Comunicación ✅ COMPLETO

- [x] Mensajes grupales
- [x] Templates de mensajes
- [x] Historial de comunicaciones
- [x] Notificaciones programadas
- [x] Preferencias avanzadas
- [x] Integración WhatsApp

---

## Área 10: Reportes ✅ COMPLETO

- [x] Export transactions CSV/Excel
- [x] Bulk export evaluaciones
- [x] Reporte eventos PDF/Excel
- [x] Reportes programados (scheduled)
- [x] Widgets dashboard (retención, populares, ingresos)

---

## Área 11: GEO/SEO ✅ FASE 1-7 COMPLETAS

- [x] Estructura clusters (locale/modality/country)
- [x] Contenido JSON para 24 clusters (4 modalidades × 6 países)
- [x] Schema markup (Organization, HowTo)
- [x] AI crawlers en robots.txt
- [x] llms.txt route
- [x] Sitemap expandido
- [ ] Implementación completa páginas cluster
- [ ] Integración traducciones i18n

---

## Área 12: i18n 🟡 EN PROGRESO

- [x] Estructura `src/app/(site)/[locale]/`
- [x] Routes para `/es/` y `/en/`
- [ ] Traducciones completas
- [ ] Contenido localizado

---

## Estado General ✅

- Build: **COMPILANDO**
- Features: **~60+ implementados**
- Componentes nuevos: **~50+**
- APIs nuevas: **~35+**
- Clusters SEO: **24 rutas clusterizadas**

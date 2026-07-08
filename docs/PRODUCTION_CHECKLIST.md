# Checklist de Producción - Zaltyko

Este documento contiene una lista completa de verificación para asegurar que la aplicación esté lista para producción.

## 📋 Pre-Deployment

### Base de Datos

- [ ] **Connection Pool creado en Supabase**
  - [ ] Modo: Transaction
  - [ ] Pool Size: 20 (recomendado)
  - [ ] URL del pool copiada (`DATABASE_URL_POOL`)

- [ ] **Migraciones aplicadas**
  ```bash
  pnpm db:migrate
  ```

- [ ] **Políticas RLS aplicadas**
  - [ ] Ejecutado `supabase/rls.sql` en la base de datos
  - [ ] Verificado que todas las tablas tienen RLS habilitado
  - [ ] Probado acceso con diferentes roles de usuario

- [ ] **Realtime habilitado**
  - [ ] Tablas en replicación: `profiles`, `subscriptions`, `academies`, `classes`, `class_sessions`, `billing_invoices`, `contact_messages`, `notifications`
  - [ ] Verificado que las suscripciones funcionan

### Variables de Entorno

- [ ] **Base de datos**
  - [ ] `DATABASE_URL_POOL` configurada (producción)
  - [ ] `DATABASE_URL_DIRECT` configurada (backup)

- [ ] **Supabase**
  - [ ] `NEXT_PUBLIC_SUPABASE_URL` configurada
  - [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` configurada
  - [ ] `SUPABASE_SERVICE_ROLE_KEY` configurada

- [ ] **Aplicación**
  - [ ] `NEXT_PUBLIC_APP_URL` configurada con dominio de producción
  - [ ] `NODE_ENV=production`

- [ ] **Cron Jobs**
  - [ ] `CRON_SECRET` generado y configurado (usar `openssl rand -base64 32`)

- [ ] **Stripe** (si se usa)
  - [ ] `STRIPE_SECRET_KEY` configurada (sk_live_...)
  - [ ] `STRIPE_WEBHOOK_SECRET` configurada

- [ ] **Lemon Squeezy** (si se usa)
  - [ ] `LEMONSQUEEZY_API_KEY` configurada
  - [ ] `LEMONSQUEEZY_WEBHOOK_SECRET` configurada

- [ ] **Mailgun** (si se usa)
  - [ ] `MAILGUN_API_KEY` configurada
  - [ ] `MAILGUN_DOMAIN` configurada

- [ ] **Sentry** (recomendado)
  - [ ] `NEXT_PUBLIC_SENTRY_DSN` configurada
  - [ ] `SENTRY_DSN` configurada
  - [ ] `SENTRY_ORG` configurada
  - [ ] `SENTRY_PROJECT` configurada
  - [ ] `SENTRY_AUTH_TOKEN` configurada

### Webhooks

- [ ] **Stripe Webhook**
  - [ ] URL configurada: `https://tu-dominio.com/api/stripe/webhook`
  - [ ] Eventos seleccionados
  - [ ] Signing secret copiado a `STRIPE_WEBHOOK_SECRET`
  - [ ] Probado con Stripe CLI o desde dashboard

- [ ] **Lemon Squeezy Webhook** (si se usa)
  - [ ] URL configurada: `https://tu-dominio.com/api/lemonsqueezy/webhook`
  - [ ] Eventos seleccionados
  - [ ] Signing secret copiado

### Vercel

- [ ] **Proyecto creado**
  - [ ] Repositorio conectado
  - [ ] Framework detectado: Next.js
  - [ ] Build Command: `pnpm build`
  - [ ] Install Command: `pnpm install`

- [ ] **Dominio configurado**
  - [ ] Dominio personalizado agregado
  - [ ] DNS configurado correctamente
  - [ ] SSL activo (automático en Vercel)

- [ ] **Variables de entorno configuradas**
  - [ ] Todas las variables configuradas en Vercel Dashboard
  - [ ] Variables separadas por entorno (Production/Preview/Development)
  - [ ] `CRON_SECRET` configurado

- [ ] **Cron Jobs configurados**
  - [ ] Verificado en Vercel Dashboard → Settings → Cron Jobs
  - [ ] Schedules correctos:
    - Class Reminders: `0 8 * * *` (8:00 AM UTC)
    - Daily Alerts: `0 9 * * *` (9:00 AM UTC)

## 🚀 Deployment

- [ ] **Build exitoso**
  - [ ] Sin errores de TypeScript
  - [ ] Sin errores de linting
  - [ ] Sin errores de compilación
  - [ ] Bundle size razonable

- [ ] **Deploy completado**
  - [ ] Deploy exitoso en Vercel
  - [ ] URL de producción accesible
  - [ ] Sin errores en logs

## ✅ Post-Deployment

### Funcionalidad Básica

- [ ] **Autenticación**
  - [ ] Registro de usuarios funciona
  - [ ] Login funciona
  - [ ] Logout funciona
  - [ ] Recuperación de contraseña funciona (si está implementado)

- [ ] **Dashboard**
  - [ ] Dashboard carga correctamente
  - [ ] Datos se muestran correctamente
  - [ ] Navegación funciona

- [ ] **Base de Datos**
  - [ ] Conexión a base de datos funciona
  - [ ] Queries se ejecutan correctamente
  - [ ] RLS funciona (usuarios solo ven sus datos)

- [ ] **Realtime**
  - [ ] Notificaciones en tiempo real funcionan
  - [ ] Actualizaciones de datos se reflejan automáticamente

### Funcionalidad Avanzada

- [ ] **Academias**
  - [ ] Crear academia funciona
  - [ ] Editar academia funciona
  - [ ] Listar academias funciona
  - [ ] Búsqueda de academias públicas funciona

- [ ] **Atletas**
  - [ ] Crear atleta funciona
  - [ ] Editar atleta funciona
  - [ ] Listar atletas funciona
  - [ ] Importar CSV funciona (si está implementado)

- [ ] **Clases**
  - [ ] Crear clase funciona
  - [ ] Editar clase funciona
  - [ ] Calendario muestra clases correctamente
  - [ ] Sesiones se generan automáticamente

- [ ] **Pagos**
  - [ ] Checkout funciona (Stripe/Lemon Squeezy)
  - [ ] Webhooks procesan eventos correctamente
  - [ ] Pagos se generan correctamente
  - [ ] Cargos se crean correctamente

- [ ] **Emails**
  - [ ] Emails de bienvenida se envían
  - [ ] Emails de notificación se envían
  - [ ] Emails de recordatorio se envían

### Cron Jobs

- [ ] **Class Reminders**
  - [ ] Se ejecuta a las 8:00 AM UTC
  - [ ] Envía recordatorios correctamente
  - [ ] Logs muestran ejecución exitosa

- [ ] **Daily Alerts**
  - [ ] Se ejecuta a las 9:00 AM UTC
  - [ ] Crea alertas correctamente
  - [ ] Logs muestran ejecución exitosa

### Monitoreo

- [ ] **Sentry**
  - [ ] Errores se capturan correctamente
  - [ ] Source maps se suben correctamente
  - [ ] Alertas configuradas

- [ ] **Vercel Analytics**
  - [ ] Analytics habilitado
  - [ ] Speed Insights habilitado
  - [ ] Métricas se muestran en dashboard

- [ ] **Logs**
  - [ ] Logs accesibles en Vercel Dashboard
  - [ ] Logs estructurados correctamente
  - [ ] No hay información sensible en logs

### Seguridad

- [ ] **Variables de entorno**
  - [ ] No hay secrets en el código
  - [ ] Variables sensibles solo en Vercel
  - [ ] `.env.local` en `.gitignore`

- [ ] **RLS**
  - [ ] Todas las tablas tienen RLS habilitado
  - [ ] Usuarios solo acceden a sus datos
  - [ ] Super admin puede acceder a todo

- [ ] **Headers de seguridad**
  - [ ] HSTS configurado
  - [ ] X-Frame-Options configurado
  - [ ] X-Content-Type-Options configurado
  - [ ] Referrer-Policy configurado

- [ ] **HTTPS**
  - [ ] SSL activo (automático en Vercel)
  - [ ] Redirección HTTP → HTTPS funciona

### Performance

- [ ] **Optimizaciones**
  - [ ] Imágenes optimizadas con `next/image`
  - [ ] Code splitting funciona
  - [ ] Bundle size razonable
  - [ ] Lazy loading implementado donde sea apropiado

- [ ] **Base de datos**
  - [ ] Connection pool configurado
  - [ ] Índices en columnas frecuentemente consultadas
  - [ ] Queries optimizadas

- [ ] **Caching**
  - [ ] Caching configurado donde sea apropiado
  - [ ] Revalidación configurada correctamente

## 🔍 Testing

- [ ] **Funcionalidad**
  - [ ] Flujo completo de usuario probado
  - [ ] Edge cases probados
  - [ ] Errores manejados correctamente

- [ ] **Rendimiento**
  - [ ] Tiempo de carga aceptable
  - [ ] Sin memory leaks
  - [ ] Sin queries N+1

- [ ] **Compatibilidad**
  - [ ] Funciona en Chrome
  - [ ] Funciona en Firefox
  - [ ] Funciona en Safari
  - [ ] Funciona en móviles

## 📚 Documentación

- [ ] **Documentación actualizada**
  - [ ] README actualizado
  - [ ] Guía de deployment actualizada
  - [ ] Variables de entorno documentadas
  - [ ] API documentada (si aplica)

## 🎯 Checklist Final

- [ ] **Todo lo anterior completado**
- [ ] **Backup de base de datos creado**
- [ ] **Plan de rollback preparado**
- [ ] **Equipo notificado del deploy**
- [ ] **Monitoreo activo**

## 🆘 En caso de problemas

1. **Revisar logs en Vercel Dashboard**
2. **Revisar errores en Sentry**
3. **Verificar variables de entorno**
4. **Verificar conexión a base de datos**
5. **Verificar webhooks**
6. **Consultar documentación de troubleshooting**

## 📞 Contacto

Si encuentras problemas durante el deployment, consulta:
- [Documentación de Vercel](https://vercel.com/docs)
- [Documentación de Next.js](https://nextjs.org/docs)
- [Documentación de Supabase](https://supabase.com/docs)

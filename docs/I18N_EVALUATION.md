# Evaluación de Sistema i18n - Zaltyko SaaS

## 📋 Resumen Ejecutivo

Este documento evalúa las opciones para implementar internacionalización (i18n) en Zaltyko SaaS, permitiendo expandir a múltiples mercados y idiomas manteniendo una experiencia de usuario consistente.

## 🎯 Objetivos

1. **Expansión internacional**: Facilitar entrada a nuevos mercados (LATAM, Europa, Asia)
2. **Experiencia localizada**: Adaptar contenido, formatos y convenciones a cada región
3. **Mantenibilidad**: Sistema escalable que no complique el desarrollo
4. **Performance**: Sin impacto significativo en velocidad de carga

## 🌍 Mercados Objetivo

### Fase 1: España y LATAM (Actual)
- **Idioma**: Español (es-ES, es-MX, es-AR, etc.)
- **Moneda**: EUR, MXN, ARS, COP, CLP
- **Formato de fecha**: DD/MM/YYYY
- **Zona horaria**: CET, CST, ART, COT, CLT

### Fase 2: Europa Occidental
- **Idiomas**: Inglés (en-GB), Francés (fr-FR), Portugués (pt-PT), Italiano (it-IT)
- **Monedas**: EUR, GBP
- **Formatos**: Variados por país

### Fase 3: Mercados Emergentes
- **Idiomas**: Inglés (en-US), Portugués (pt-BR), Alemán (de-DE)
- **Monedas**: USD, BRL, EUR
- **Formatos**: Variados

## 🔧 Opciones de Implementación

### Opción 1: next-intl (Recomendado) ⭐⭐⭐

**Ventajas**:
- Diseñado específicamente para Next.js 14 App Router
- Type-safe translations
- Server Components support
- Routing automático por locale
- Lightweight (~5KB)

**Implementación**:
```typescript
// src/i18n/config.ts
export const locales = ['es', 'en', 'fr', 'pt'] as const;
export const defaultLocale = 'es' as const;

// src/i18n/request.ts
import {getRequestConfig} from 'next-intl/server';
 
export default getRequestConfig(async ({locale}) => ({
  messages: (await import(`../../messages/${locale}.json`)).default
}));

// src/app/[locale]/layout.tsx
import {NextIntlClientProvider} from 'next-intl';
import {getMessages} from 'next-intl/server';
 
export default async function LocaleLayout({
  children,
  params: {locale}
}: {
  children: React.node;
  params: {locale: string};
}) {
  const messages = await getMessages();
 
  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

// Uso en componentes
import {useTranslations} from 'next-intl';

function MyComponent() {
  const t = useTranslations('Dashboard');
  return <h1>{t('welcome', {name: 'Juan'})}</h1>;
}
```

**Estructura de archivos**:
```
messages/
  es.json
  en.json
  fr.json
  pt.json
```

**Ejemplo de traducciones**:
```json
// messages/es.json
{
  "Dashboard": {
    "welcome": "Bienvenido, {name}",
    "sessions": "{count, plural, =0 {Sin sesiones} =1 {1 sesión} other {# sesiones}}",
    "nextClass": "Próxima clase"
  },
  "Billing": {
    "plan": "Plan",
    "price": "{price, number, currency}",
    "upgrade": "Mejorar plan"
  }
}

// messages/en.json
{
  "Dashboard": {
    "welcome": "Welcome, {name}",
    "sessions": "{count, plural, =0 {No sessions} =1 {1 session} other {# sessions}}",
    "nextClass": "Next class"
  },
  "Billing": {
    "plan": "Plan",
    "price": "{price, number, currency}",
    "upgrade": "Upgrade plan"
  }
}
```

**Costos**: Gratis (open source)

### Opción 2: react-i18next

**Ventajas**:
- Muy popular y maduro
- Gran ecosistema de plugins
- Flexible

**Desventajas**:
- No optimizado para Next.js App Router
- Más complejo de configurar
- Menos type-safe

**Costos**: Gratis (open source)

### Opción 3: Lingui

**Ventajas**:
- Excelente DX con CLI
- Extracción automática de strings
- Type-safe

**Desventajas**:
- Menos documentación para Next.js 14
- Curva de aprendizaje

**Costos**: Gratis (open source)

### Opción 4: Crowdin/Lokalise (Gestión de traducciones)

**Ventajas**:
- Plataforma para gestionar traducciones
- Colaboración con traductores
- Integración con GitHub
- Machine translation

**Uso**: Complemento a next-intl

**Costos**: $50-500/mes según plan

## 📐 Arquitectura Propuesta

### Routing

```
app/
  [locale]/
    (dashboard)/
      page.tsx
      billing/
        page.tsx
    (site)/
      page.tsx
```

**URLs**:
- `/es/dashboard` - Español
- `/en/dashboard` - Inglés
- `/fr/dashboard` - Francés

### Middleware

```typescript
// src/middleware.ts
import createMiddleware from 'next-intl/middleware';
import {locales, defaultLocale} from './i18n/config';
 
export default createMiddleware({
  locales,
  defaultLocale,
  localePrefix: 'always' // o 'as-needed'
});
 
export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)']
};
```

### Detección de Locale

**Prioridades**:
1. URL path (`/es/...`)
2. Cookie (`NEXT_LOCALE`)
3. Header `Accept-Language`
4. Default locale (`es`)

### Formateo de Datos

```typescript
// Fechas
import {useFormatter} from 'next-intl';

function DateDisplay({date}) {
  const format = useFormatter();
  return <span>{format.dateTime(date, {dateStyle: 'long'})}</span>;
}

// Números
function PriceDisplay({amount}) {
  const format = useFormatter();
  return <span>{format.number(amount, {style: 'currency', currency: 'EUR'})}</span>;
}

// Plurales
const t = useTranslations();
<p>{t('sessions', {count: 5})}</p>
// es: "5 sesiones"
// en: "5 sessions"
```

## 🗂️ Organización de Traducciones

### Estructura por Namespace

```json
// messages/es.json
{
  "Common": {
    "save": "Guardar",
    "cancel": "Cancelar",
    "delete": "Eliminar"
  },
  "Dashboard": {...},
  "Billing": {...},
  "Athletes": {...},
  "Classes": {...},
  "Assessments": {...}
}
```

### Traducciones Dinámicas (Base de Datos)

**Casos de uso**:
- Nombres de planes de suscripción
- Descripciones de features
- Contenido de emails
- Términos y condiciones

**Implementación**:
```typescript
// Tabla: translations
CREATE TABLE translations (
  id UUID PRIMARY KEY,
  key VARCHAR(255) UNIQUE,
  locale VARCHAR(10),
  value TEXT,
  namespace VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

// Índice
CREATE INDEX idx_translations_key_locale ON translations(key, locale);

// Uso
async function getTranslation(key: string, locale: string) {
  const translation = await db
    .select()
    .from(translations)
    .where(and(
      eq(translations.key, key),
      eq(translations.locale, locale)
    ))
    .limit(1);
    
  return translation?.[0]?.value || key;
}
```

## 🌐 Contenido Específico por Región

### Adaptaciones Necesarias

**Formatos**:
- Fechas: DD/MM/YYYY (ES), MM/DD/YYYY (US)
- Horas: 24h (ES), 12h AM/PM (US)
- Números: 1.234,56 (ES), 1,234.56 (US)
- Teléfonos: +34 XXX XXX XXX (ES), +1 (XXX) XXX-XXXX (US)

**Monedas**:
- EUR (España, Francia)
- USD (Estados Unidos, LATAM)
- GBP (Reino Unido)
- MXN, ARS, COP, CLP (LATAM)

**Terminología**:
- "Gimnasia artística" (ES) vs "Artistic gymnastics" (EN)
- "Entrenador" (ES) vs "Coach" (EN)
- "Cuota" (ES) vs "Fee" (EN)

### Implementación

```typescript
// src/lib/locale-config.ts
export const localeConfig = {
  'es-ES': {
    currency: 'EUR',
    dateFormat: 'dd/MM/yyyy',
    timeFormat: 'HH:mm',
    timezone: 'Europe/Madrid'
  },
  'en-US': {
    currency: 'USD',
    dateFormat: 'MM/dd/yyyy',
    timeFormat: 'h:mm a',
    timezone: 'America/New_York'
  },
  'es-MX': {
    currency: 'MXN',
    dateFormat: 'dd/MM/yyyy',
    timeFormat: 'HH:mm',
    timezone: 'America/Mexico_City'
  }
};
```

## 🔄 Workflow de Traducción

### Proceso

1. **Desarrollo**: Desarrollador añade keys en español
2. **Extracción**: Script extrae nuevas keys
3. **Traducción**: Traductores completan en Crowdin
4. **Sincronización**: GitHub Action sincroniza traducciones
5. **Deploy**: Nuevas traducciones disponibles

### Herramientas

```bash
# Extraer nuevas keys
npm run i18n:extract

# Validar traducciones
npm run i18n:validate

# Sincronizar con Crowdin
npm run i18n:sync
```

### Scripts

```typescript
// scripts/extract-i18n.ts
import {extractMessages} from 'next-intl/cli';

extractMessages({
  sourceLocale: 'es',
  targetLocales: ['en', 'fr', 'pt'],
  messagesDir: './messages'
});
```

## 📊 Impacto en Performance

### Bundle Size

**next-intl**: ~5KB gzipped
**Traducciones**: ~20-50KB por locale

**Optimización**:
- Code splitting por locale
- Lazy loading de traducciones
- Caching agresivo

### Estrategia de Carga

```typescript
// Solo cargar locale activo
export default async function LocaleLayout({locale}) {
  // Carga dinámica
  const messages = await import(`../../messages/${locale}.json`);
  
  return (
    <NextIntlClientProvider messages={messages.default}>
      {children}
    </NextIntlClientProvider>
  );
}
```

## 💰 Análisis de Costos

| Componente | Costo | Notas |
|------------|-------|-------|
| next-intl | Gratis | Open source |
| Crowdin | $50-150/mes | Gestión de traducciones |
| Traductores profesionales | $0.08-0.15/palabra | ~$500-1000 por idioma |
| Mantenimiento | 2-4h/mes | Actualizar traducciones |

**Estimado inicial**: $2,000-3,000 (3 idiomas)
**Mantenimiento mensual**: $50-200

## 🗺️ Roadmap de Implementación

### Fase 1: Fundamentos (2-3 semanas)

- [ ] Instalar y configurar next-intl
- [ ] Migrar strings hardcodeados a traducciones
- [ ] Implementar routing por locale
- [ ] Configurar middleware
- [ ] Crear estructura de mensajes

### Fase 2: Español Completo (1-2 semanas)

- [ ] Extraer todos los strings
- [ ] Organizar por namespaces
- [ ] Implementar formateo de fechas/números
- [ ] Testing exhaustivo

### Fase 3: Inglés (2-3 semanas)

- [ ] Traducir al inglés
- [ ] Adaptar formatos US
- [ ] Testing con usuarios anglófonos
- [ ] Ajustar traducciones

### Fase 4: Idiomas Adicionales (1-2 semanas c/u)

- [ ] Francés
- [ ] Portugués
- [ ] Otros según demanda

### Fase 5: Optimización (1 semana)

- [ ] Performance tuning
- [ ] SEO multiidioma
- [ ] Analytics por locale
- [ ] Documentación

## 🎯 Criterios de Éxito

**KPIs**:
- Cobertura de traducciones: >95%
- Performance: <100ms overhead
- Adopción: >30% usuarios en idiomas no-español
- Satisfacción: NPS >8 en todos los idiomas

**Testing**:
- Unit tests para formateo
- E2E tests en cada locale
- Visual regression tests
- User testing con nativos

## 📝 Recomendación Final

**Implementar**: ✅ Sí, con next-intl

**Prioridad**: Media-Alta (antes de expansión internacional)

**Timing**: Q2 2025

**Razones**:
1. Preparación para expansión internacional
2. Mejora experiencia de usuario
3. Ventaja competitiva
4. Costo razonable vs beneficio

**Enfoque**:
- Empezar con español e inglés
- Usar next-intl por simplicidad y performance
- Crowdin para gestión de traducciones
- Traductores profesionales para calidad

---

*Documento creado: 2025-11-27*
*Próxima revisión: Trimestral*

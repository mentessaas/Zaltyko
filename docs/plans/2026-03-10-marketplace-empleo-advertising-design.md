# Diseño: Marketplace, Bolsa de Empleo y Espacios Publicitarios

**Fecha:** 2026-03-10
**Proyecto:** Zaltyko
**Objetivo:** Añadir marketplace para productos/servicios, bolsa de empleo y espacios publicitarios

---

## 1. Visión General

Plataforma marketplace y bolsa de empleo para la comunidad de gimnasia/deportes, integrada en Zaltyko. Cualquier usuario puede publicar y comprar/vender productos y servicios. Las academias pueden publicar ofertas de empleo. Sistema de espacios publicitarios en marketplace, bolsa de empleo y eventos.

---

## 2. Usuarios y Roles

### Tipos de Usuario

| Tipo | Acceso | Verificación |
|------|--------|--------------|
| Academia | Automático | Ya verificada en Zaltyko |
| Coach | Automático | Miembro de academia |
| Atleta/Padre | Automático | Cuenta en Zaltyko |
| Vendedor externo | Registro + verificación ligera | Email + documento |
| Usuario anónimo | Ver solo | Ninguna |

### Matriz de Permisos

| Acción | Anónimo | Usuario Zaltyko | Academia | Vendedor Externo |
|--------|---------|-----------------|----------|------------------|
| Ver marketplace | ✅ | ✅ | ✅ | ✅ |
| Publicar producto | ✅ (registro) | ✅ | ✅ | ✅ |
| Ver bolsa empleo | ✅ | ✅ | ✅ | ✅ |
| Publicar oferta | ❌ | ❌ | ✅ | ❌ |
| Aplicar a puesto | ✅ (registro) | ✅ | ❌ | ❌ |
| Valorar vendedor | ❌ | ✅ | ✅ | ✅ |
| Comprar advertising | ❌ | ❌ | ✅ | ✅ |

---

## 3. Marketplace

### Categorías de Productos

- Equipamiento (colchonetas, aros, cuerdas, etc.)
- Ropa y calzado
- Suplementos y nutrición
- Libros y DVDs
- Otros

### Categorías de Servicios

- Clases particulares
- Entrenamientos personalizados
- Clínicas/workshops
- Servicios de arbitraje
- Fisioterapia
- Fotografía/videografía
- Otros

### Estructura de Listing

```typescript
interface MarketplaceListing {
  id: uuid;
  userId: uuid;
  sellerId: uuid;
  sellerType: 'academy' | 'coach' | 'athlete' | 'external';
  type: 'product' | 'service';
  category: string;
  title: string;
  description: text;
  price: integer; // céntimos
  currency: 'eur';
  priceType: 'fixed' | 'negotiable' | 'contact';
  contact: {
    whatsapp?: string;
    email?: string;
    phone?: string;
  };
  images: string[]; // URLs
  location: {
    country: string;
    province?: string;
    city: string;
  };
  isFeatured: boolean;
  views: integer;
  status: 'active' | 'sold' | 'hidden';
  createdAt: timestamp;
  updatedAt: timestamp;
}
```

### Sistema de Valoraciones

```typescript
interface MarketplaceRating {
  id: uuid;
  listingId: uuid;
  sellerId: uuid;
  reviewerId: uuid;
  rating: integer; // 1-5
  comment: text;
  verified: boolean; // solo si compró
  createdAt: timestamp;
}
```

---

## 4. Bolsa de Empleo

### Categorías de Puesto

- Entrenador/Coach
- Asistente de entrenador
- Administrativo
- Fisioterapeuta
- Psicólogo deportivo
- Otro

### Estructura de Oferta

```typescript
interface EmpleoListing {
  id: uuid;
  academyId: uuid;
  userId: uuid; // quien publica
  title: string;
  category: string;
  description: text;
  requirements: text;
  location: {
    country: string;
    province?: string;
    city: string;
  };
  jobType: 'full_time' | 'part_time' | 'internship';
  salary: {
    min?: integer;
    max?: integer;
    currency: 'eur';
    type: 'fixed' | 'range' | 'contact';
  };
  howToApply: 'internal' | 'external';
  externalUrl?: string;
  deadline?: date;
  isFeatured: boolean;
  views: integer;
  status: 'active' | 'closed' | 'draft';
  createdAt: timestamp;
  updatedAt: timestamp;
}
```

### Estructura de Aplicación

```typescript
interface EmpleoApplication {
  id: uuid;
  listingId: uuid;
  userId: uuid; // applicant
  status: 'pending' | 'reviewed' | 'accepted' | 'rejected';
  message: text;
  resumeUrl?: string;
  createdAt: timestamp;
  updatedAt: timestamp;
}
```

---

## 5. Sistema de Mensajería (Opcional)

```typescript
interface Conversation {
  id: uuid;
  listingId?: uuid; // opcional
  empleoListingId?: uuid;
  participants: uuid[];
  lastMessageAt: timestamp;
  createdAt: timestamp;
}

interface Message {
  id: uuid;
  conversationId: uuid;
  senderId: uuid;
  content: text;
  readAt?: timestamp;
  createdAt: timestamp;
}
```

---

## 6. Espacios Publicitarios

### Tipos de Anuncio

| Tipo | Dimensiones | Posición |
|------|-------------|----------|
| Banner principal | 728x90 o 970x250 | Top de página |
| Banner lateral | 300x250 | Sidebar |
| Destacado/Pin | N/A | Arriba de resultados |
| Banner entre resultados | 970x90 | Cada 10 items |

### Zonas con Advertising

- Marketplace
- Bolsa de Empleo
- Eventos (ya existente)

### Estructura de Anuncio

```typescript
interface Advertisement {
  id: uuid;
  type: 'banner' | 'featured';
  position: string;
  imageUrl: string;
  linkUrl: string;
  altText?: string;
  startDate: date;
  endDate: date;
  isActive: boolean;
  views: integer;
  clicks: integer;
  createdBy: uuid;
  createdAt: timestamp;
}
```

### Modelo de Precios

- Banner: precio por día/semana/mes
- Destacado: precio por día
- Venta directa por admin o through platform

---

## 7. Rutas de la Aplicación

### Marketplace

```
/marketplace                          → Directorio público
/marketplace/nuevo                    → Crear listing
/marketplace/[id]                    → Detalle de producto/servicio
/marketplace/[id]/editar             → Editar listing
/marketplace/[category]              → Filtrar por categoría
/marketplace/buscar                 → Búsqueda avanzada
/marketplace/vendedor/[sellerId]     → Perfil de vendedor
```

### Bolsa de Empleo

```
/empleo                               → Bolsa de trabajo
/empleo/nuevo                         → Publicar oferta (requiere auth)
/empleo/[id]                         → Detalle del puesto
/empleo/[id]/editar                  → Editar oferta
/empleo/[id]/aplicar                 → Aplicar
/empleo/[id]/aplicaciones            → Ver aplicaciones (owner)
/empleo/mis-postulaciones            → Mis aplicaciones
```

### Publicidad

```
/admin/advertising                   → Gestionar anuncios
/admin/advertising/nuevo            → Crear anuncio
```

---

## 8. API Routes

### Marketplace

- `GET /api/marketplace` - Listar listings (público)
- `POST /api/marketplace` - Crear listing
- `GET /api/marketplace/[id]` - Detalle
- `PATCH /api/marketplace/[id]` - Actualizar
- `DELETE /api/marketplace/[id]` - Eliminar
- `GET /api/marketplace/categories` - Categorías
- `GET /api/marketplace/sellers/[id]` - Perfil vendedor
- `POST /api/marketplace/[id]/rate` - Valorar

### Bolsa de Empleo

- `GET /api/empleo` - Listar ofertas (público)
- `POST /api/empleo` - Crear oferta (auth academia)
- `GET /api/empleo/[id]` - Detalle
- `PATCH /api/empleo/[id]` - Actualizar
- `DELETE /api/empleo/[id]` - Eliminar
- `POST /api/empleo/[id]/apply` - Aplicar
- `GET /api/empleo/[id]/applications` - Ver aplicaciones
- `PATCH /api/empleo/applications/[id]` - Actualizar estado

### Mensajería

- `GET /api/messages/conversations` - Lista conversaciones
- `POST /api/messages` - Enviar mensaje
- `GET /api/messages/[conversationId]` - Ver mensajes

### Publicidad

- `GET /api/advertising/zones/[zone]` - Obtener anuncios activos
- `POST /api/advertising` - Crear anuncio (admin)
- `PATCH /api/advertising/[id]` - Actualizar
- `DELETE /api/advertising/[id]` - Eliminar

---

## 9. UI/UX

### Componentes Principales

**Marketplace:**
- MarketplacePage - Página principal con filtros
- ListingCard - Card de producto/servicio
- ListingForm - Formulario de creación/edición
- ListingDetail - Página de detalle
- SellerProfile - Perfil de vendedor con rating
- RatingForm - Formulario de valoración

**Bolsa de Empleo:**
- EmpleoPage - Página principal con filtros
- JobCard - Card de oferta
- JobForm - Formulario de creación/edición
- JobDetail - Página de detalle
- ApplicationForm - Formulario de aplicación
- ApplicationsList - Lista de aplicaciones (para academy)

**Publicidad:**
- AdBanner - Componente de banner
- FeaturedBadge - Badge de destacado
- AdManagementPage - Panel de gestión admin

### Diseño Visual

- Usar componentes shadcn/ui existentes
- Cards consistentes con EventCard y AcademyCard
- Filtros sidebar similares a EventsFilters
- Buscar coherencia con landing page

---

## 10. Consideraciones Adicionales

- SEO para páginas públicas (metadata, schema.org)
- Rate limiting en APIs públicas
- Moderación de contenido (reporting)
- Notificaciones para mensajes y aplicaciones
- Integración con sistema de usuarios existente
- Imágenes almacenadas en Supabase Storage

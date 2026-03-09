// Constantes del proyecto

// Paginación
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;
export const MIN_PAGE_SIZE = 10;

// Rate limiting
export const RATE_LIMITS = {
  PUBLIC: { limit: 100, window: 60 },
  AUTHENTICATED: { limit: 300, window: 60 },
  CRITICAL: { limit: 10, window: 60 },
  STRICT: { limit: 5, window: 60 },
  WEBHOOK: { limit: 1000, window: 60 },
} as const;

// Estados de atleta
export const ATHLETE_STATUS = {
  ACTIVE: "active",
  TRIAL: "trial",
  INACTIVE: "inactive",
  ARCHIVED: "archived",
} as const;

// Niveles de atleta
export const ATHLETE_LEVELS = {
  BEGINNER: "beginner",
  INTERMEDIATE: "intermediate",
  ADVANCED: "advanced",
  PROFESSIONAL: "professional",
} as const;

// Estados de asistencia
export const ATTENDANCE_STATUS = {
  PRESENT: "present",
  ABSENT: "absent",
  LATE: "late",
  EXCUSED: "excused",
} as const;

// Roles de usuario
export const USER_ROLES = {
  SUPER_ADMIN: "super_admin",
  ADMIN: "admin",
  OWNER: "owner",
  COACH: "coach",
  ATHLETE: "athlete",
  PARENT: "parent",
} as const;

// Estados de academia
export const ACADEMY_STATUS = {
  ACTIVE: "active",
  SUSPENDED: "suspended",
  INACTIVE: "inactive",
} as const;

// Tipos de clase
export const CLASS_TYPES = {
  GROUP: "group",
  INDIVIDUAL: "individual",
  WORKSHOP: "workshop",
  COMPETITION: "competition",
} as const;

// Routes
export const ROUTES = {
  DASHBOARD: "/dashboard",
  ATHLETES: "/dashboard/athletes",
  COACHES: "/dashboard/coaches",
  CLASSES: "/dashboard/classes",
  CALENDAR: "/dashboard/calendar",
  EVENTS: "/dashboard/events",
  ACADEMIES: "/dashboard/academies",
  SETTINGS: "/dashboard/settings",
  SUPER_ADMIN: "/super-admin",
} as const;

// Mensajes de error
export const ERROR_MESSAGES = {
  GENERIC: "Ha ocurrido un error. Intenta de nuevo.",
  NETWORK: "Error de conexión. Verifica tu internet.",
  UNAUTHORIZED: "No tienes permiso para realizar esta acción.",
  NOT_FOUND: "El recurso solicitado no existe.",
  VALIDATION: "Por favor, verifica los datos ingresados.",
} as const;

// Mensajes de éxito
export const SUCCESS_MESSAGES = {
  CREATED: "Elemento creado correctamente.",
  UPDATED: "Elemento actualizado correctamente.",
  DELETED: "Elemento eliminado correctamente.",
  SAVED: "Cambios guardados correctamente.",
} as const;

// Regex patterns
export const PATTERNS = {
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PHONE: /^\+?[\d\s-()]{9,}$/,
  UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
} as const;

// Códigos de error de API
export const API_ERROR_CODES = {
  // Autenticación
  UNAUTHORIZED: "UNAUTHORIZED",
  SESSION_EXPIRED: "SESSION_EXPIRED",

  // Recursos
  NOT_FOUND: "NOT_FOUND",
  ALREADY_EXISTS: "ALREADY_EXISTS",
  CLASS_FULL: "CLASS_FULL",
  INVALID_GROUP: "INVALID_GROUP",

  // Facturación
  PAYMENT_FAILED: "PAYMENT_FAILED",
  PLAN_LIMIT_EXCEEDED: "PLAN_LIMIT_EXCEEDED",

  // Validación
  VALIDATION_ERROR: "VALIDATION_ERROR",
  INVALID_INPUT: "INVALID_INPUT",
} as const;

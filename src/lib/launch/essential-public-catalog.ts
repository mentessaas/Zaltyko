/** Public launch claims. Keep visible content and structured data identical. */

/**
 * The promise the competitive research recommends («tu equipo ve las sesiones
 * de hoy y pasa lista en un toque»). Since 12-11-2026 coach access by
 * invitation is active in production, so the team half is true: the direction
 * sees today's sessions in the Resumen and each invited coach sees «Hoy» and
 * the attendance of her own sites.
 */
export const PUBLIC_PROMISE =
  "Organiza grupos, clases y asistencia de tu academia de gimnasia en un solo sitio: tu equipo ve las sesiones de hoy y pasa lista en un toque.";

/** The same promise under the H1 «El software de tu academia de gimnasia», without repeating it. */
export const HERO_LEAD =
  "Organiza grupos, clases y asistencia en un solo sitio: tu equipo ve las sesiones de hoy y pasa lista en un toque.";
export const ESSENTIAL_FEATURES = [
  {
    id: "gimnastas", label: "Gimnastas y familias", title: "Fichas y vínculos familiares",
    features: ["Alta y edición de gimnastas", "Asociación de familias y responsables", "Archivo de fichas conservando el historial"],
    impact: "Consulta la información de tu academia en un solo lugar",
  },
  {
    id: "clases", label: "Grupos y clases", title: "Grupos, horarios e inscripciones",
    features: ["Organización de grupos por sede", "Clases con horario y capacidad", "Inscripciones y cambios de estado"],
    impact: "Organiza las plazas y la actividad de cada grupo",
  },
  {
    id: "asistencia", label: "Asistencia", title: "Asistencia por sesión",
    features: ["Selección de clase y sesión", "Pase de lista", "Consulta de marcas guardadas"],
    impact: "Mantén un registro de cada sesión",
  },
  {
    id: "billing", label: "Cuotas manuales", title: "Cuotas y pagos registrados",
    features: ["Emisión de cuotas mensuales por familia", "Persona pagadora y fecha de vencimiento", "Registro manual de pagos recibidos", "Consulta de cargos pendientes"],
    impact: "Distingue lo emitido, lo pendiente y lo recibido sin iniciar cargos automáticos",
  },
  {
    id: "resumen", label: "Resumen", title: "Resumen de actividad",
    features: ["Gimnastas y grupos activos", "Registros de asistencia del periodo", "Cobros manuales registrados por moneda"],
    impact: "Consulta cifras calculadas desde los datos guardados",
  },
];

export const ESSENTIAL_FAQS = [
  { question: "¿Para qué academias está pensado?", answer: "Para academias de gimnasia artística y rítmica de cualquier país. Zaltyko funciona en cualquier país: puedes crear tu cuenta y usar las funciones generales (gimnastas y familias, grupos, clases, asistencia y cuotas registradas a mano). Nos centramos primero en España y México; las funciones específicas de cada país, como federación, competiciones, cobros locales o facturación, llegarán más adelante, sin fecha comprometida. Las cuotas familiares se registran manualmente en EUR o MXN, según la moneda de la academia; no hay conversión automática ni emisión de facturas fiscales. Si quieres que prioricemos tu país, contáctanos." },
  { question: "¿Qué planes y precios hay?", answer: "Free incluye hasta 30 gimnastas, 3 grupos y 10 clases activas. Starter cuesta 19 €/mes o 190 €/año hasta 75 gimnastas; Growth, 49 €/mes o 490 €/año hasta 200. Precios sin IVA. Network parte de 99€/mes, sin IVA; su propuesta final se acuerda mediante contacto y puesta en marcha acompañada. Los precios de los planes SaaS se expresan en EUR y la contratación internacional todavía no está habilitada." },
  { question: "¿Zaltyko cobra automáticamente a las familias?", answer: "Las cuotas familiares se emiten y sus pagos se registran manualmente. El plan de tu academia (Starter o Growth) es una contratación SaaS independiente." },
  { question: "¿Qué ocurre al cancelar o terminar la prueba?", answer: "Al finalizar el periodo de acceso, la academia vuelve a Free. Si supera sus límites, conserva sus datos y queda en solo lectura hasta archivar el excedente o contratar capacidad suficiente." },
  { question: "¿Puedo traer mis gimnastas desde un Excel?", answer: "Sí. La propiedad o la administración de la academia puede subir un Excel (.xlsx) o un CSV con sus gimnastas y, si quiere, sus tutores y su grupo, hasta 1.000 filas por fichero. Antes de guardar se ve una vista previa fila a fila con lo que se va a crear y por qué se salta cada fila. Las filas con el mismo nombre y fecha de nacimiento que una gimnasta de la academia se señalan en la vista previa y no se crean de nuevo. Las cuotas, los pagos y el historial no se importan." },
  { question: "¿Pueden entrar mis entrenadoras?", answer: "Sí, por invitación. Desde Equipo creas una invitación con el rol y las sedes de cada entrenadora y le pasas tú el enlace que aparece en pantalla, porque Zaltyko no envía el correo. Con su propia cuenta ve las sesiones de hoy de sus sedes y pasa lista, con el guion de cada sesión y los objetivos y observaciones de sus gimnastas; no ve cobros, el plan ni la configuración de la academia." },
  { question: "¿Cómo empiezo?", answer: "Crea tu cuenta, confirma el correo y configura tu academia y sede. Después puedes añadir gimnastas, familias, grupos y clases. Si necesitas varias sedes, contacta para revisar Network." },
  { question: "¿Cómo se aborda la protección de datos de menores?", answer: "Zaltyko aísla los datos por academia y aplica controles de acceso por rol. La academia debe gestionar los permisos y la información de sus familias conforme a su política de privacidad; estos controles no sustituyen sus obligaciones." },
  { question: "¿Puedo usarlo desde el móvil?", answer: "Zaltyko es una aplicación web adaptable a móvil, tableta y ordenador. No necesitas instalar una aplicación para acceder desde el navegador." },
];

/**
 * Implemented and active in production, told plainly (competitive matrix,
 * section 4). Every entry names the route or change that backs it; the
 * public-claims audit checks those files exist. The first four were activated
 * on 12-11-2026: their candidate migrations were applied in production and
 * ZALTYKO_TEAM_ACCESS_ENABLED is on.
 */
export const IMPLEMENTED_HIGHLIGHTS = [
  {
    id: "equipo",
    title: "Tus entrenadoras, con su propia cuenta",
    featureName: "Acceso de entrenadoras por invitación, limitado a las sesiones de hoy y al pase de lista de sus sedes",
    text: "Desde Equipo invitas a cada entrenadora con su rol y sus sedes. Zaltyko no envía el correo: copias el enlace que aparece en pantalla y se lo pasas tú. Es de un solo uso y caduca a los 7 días. Al aceptarlo con su correo entra con su propia cuenta y solo llega a las sesiones de hoy y al pase de lista de sus sedes: no ve cobros, el plan ni la configuración de la academia.",
    evidence: {
      route: "/owner/staff y /staff/accept (PR 277)",
      files: [
        "src/app/owner/staff/page.tsx",
        "src/components/owner/OwnerTeamAccessPanel.tsx",
        "src/modules/staff/application/canonical-team-access.ts",
        "src/modules/owner-dashboard/domain/coach-access.ts",
        "docs/deployment/candidates/20261105120000_canonical_team_access_candidate.sql",
      ],
    },
  },
  {
    id: "titulares",
    title: "Quién entrena cada clase",
    featureName: "Entrenadora titular por clase y sustituciones por sesión",
    text: "Cada clase tiene sus entrenadoras titulares, elegidas entre las que tienen acceso a su sede, y sus sesiones nuevas las heredan. Si un día entrena otra persona, cambias solo esa sesión: queda marcada como sustitución y la clase no cambia.",
    evidence: {
      route: "/owner/classes y /owner/attendance (PR 276)",
      files: [
        "src/components/owner-dashboard/OwnerClassCoaches.tsx",
        "src/components/owner-dashboard/OwnerSessionCoaches.tsx",
        "src/modules/coach-assignment/application/coach-assignment-service.ts",
        "docs/deployment/candidates/20261111180000_coach_assignment_candidate.sql",
      ],
    },
  },
  {
    id: "guion-y-seguimiento",
    title: "Guion y seguimiento técnico",
    featureName: "Guion de cada sesión y objetivos y observaciones por gimnasta",
    text: "Cada sesión puede tener su guion: el foco del día y los bloques de trabajo, que se marcan como hechos cuando empieza. Cada gimnasta tiene sus objetivos y observaciones, que se anotan desde su grupo o desde el pase de lista. Por ahora solo los ve el equipo de la academia.",
    evidence: {
      route: "/owner/attendance y /owner/groups (PR 271 y PR 279)",
      files: [
        "src/components/owner-dashboard/OwnerSessionPlanPanel.tsx",
        "src/components/owner-dashboard/OwnerAthleteProgressPanel.tsx",
        "src/modules/session-plans/application/session-plan-service.ts",
        "src/modules/athlete-progress/application/athlete-progress-service.ts",
        "docs/deployment/candidates/20261111120000_athlete_progress_candidate.sql",
        "docs/deployment/candidates/20261111200000_session_plans_candidate.sql",
      ],
    },
  },
  {
    id: "solicitudes-de-prueba",
    title: "Solicitudes de prueba",
    featureName: "Solicitudes de prueba desde el enlace público de la academia",
    text: "Activas un enlace público de tu academia y lo compartes con las familias. Quien quiera probar deja su solicitud sin crear una cuenta, y la ves en Solicitudes y en «Necesita tu atención». Desde ahí la marcas como contactada o descartada, o creas la ficha de la gimnasta y su familia. Zaltyko no envía correos ni reserva la sesión de prueba.",
    evidence: {
      route: "/solicitar-prueba/[token] y /owner/requests (PR 262)",
      files: [
        "src/app/solicitar-prueba/[token]/page.tsx",
        "src/app/api/public/trial-requests/route.ts",
        "src/app/owner/requests/page.tsx",
        "src/components/owner-dashboard/OwnerTrialRequestsWorkspace.tsx",
        "docs/deployment/candidates/20261110120000_admission_requests_candidate.sql",
      ],
    },
  },
  {
    id: "importacion",
    title: "Trae tus gimnastas desde Excel",
    featureName: "Importación de gimnastas desde Excel o CSV con vista previa",
    text: "Sube un Excel o un CSV con tus gimnastas y, si quieres, sus tutores y su grupo. Antes de guardar ves una vista previa fila a fila; las filas con el mismo nombre y fecha de nacimiento que una gimnasta de la academia se señalan y no se crean de nuevo.",
    evidence: { route: "/owner/athletes/import (PR 278)", files: ["src/app/owner/athletes/import/page.tsx", "src/modules/athlete-import/application/athlete-import-service.ts"] },
  },
  {
    id: "puesta-en-marcha",
    title: "Puesta en marcha guiada",
    featureName: "Lista de puesta en marcha para academias nuevas",
    text: "Una academia nueva ve en el Resumen sus primeros pasos: crear una sede, una clase con horario, dar de alta a sus gimnastas y pasar la primera lista.",
    evidence: { route: "/owner, panel «Puesta en marcha» (PR 252)", files: ["src/components/owner-dashboard/OwnerSetupChecklistPanel.tsx", "src/modules/owner-dashboard/application/setup-checklist-steps.ts"] },
  },
  {
    id: "sedes",
    title: "Cada sede, a su hora",
    featureName: "Zona horaria por sede y moneda de la academia (EUR o MXN)",
    text: "Cada sede tiene su zona horaria y la academia trabaja en euros o en pesos mexicanos (EUR o MXN). Las sesiones y los vencimientos de las cuotas usan la hora local de la sede.",
    evidence: { route: "zona horaria de la sede y moneda de la academia", files: ["supabase/migrations/20261006131000_add_organization_default_currency.sql", "src/modules/billing/domain/calendar-due-date.ts"] },
  },
  {
    id: "historial",
    title: "El paso por cada grupo, guardado",
    featureName: "Historial de grupos con fechas de entrada y salida",
    text: "Queda registrado cuándo entró y salió cada gimnasta de cada grupo, también después de archivar su ficha.",
    evidence: { route: "historial de grupos y archivo de fichas", files: ["src/modules/athletes/application/owner-athlete-archive.ts", "supabase/migrations/20261013170001_record_group_membership_history.sql"] },
  },
  {
    id: "sin-duplicados",
    title: "Nada se duplica",
    featureName: "Protección contra el doble envío en altas, inscripciones, cuotas, pagos y listas",
    text: "Si pulsas dos veces o se corta la conexión al guardar un alta, una inscripción, una cuota, un pago o una lista, Zaltyko lo reconoce y no lo guarda dos veces.",
    evidence: { route: "clave de idempotencia en las órdenes de /owner", files: ["src/app/api/v1/owner/athlete-intake/route.ts", "src/app/api/v1/owner/billing/monthly-invoices/issue/route.ts", "src/app/api/v1/owner/billing/manual-payments/route.ts", "src/app/api/v1/owner/sessions/[sessionId]/attendance/route.ts"] },
  },
] as const;

/**
 * Built but not available yet (dormant behind candidate migrations or
 * switched off). Shown only as «En preparación», without dates, as the
 * product discovery catalog does. Never move an entry to the lists above
 * until it is active in production.
 */
export const IN_PREPARATION = ["Portal de familias"] as const;

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
    id: "gimnastas", label: "Gimnastas y familias", title: "Cada gimnasta, con su familia",
    features: ["Alta y edición de gimnastas", "Familias y responsables en la ficha de cada gimnasta", "Archivo de fichas conservando el historial"],
    impact: "Encuentras a cualquier gimnasta y a su familia sin buscar en carpetas ni chats",
  },
  {
    id: "clases", label: "Grupos y clases", title: "El horario, una sola vez",
    features: ["Grupos por sede", "Clases semanales con horario y capacidad que crean sus sesiones", "Inscripciones y cambios de estado"],
    impact: "Defines el horario de cada clase una vez y sus sesiones se crean solas",
  },
  {
    id: "asistencia", label: "Asistencia", title: "Pase de lista en un toque",
    features: ["Sesiones del día en «Hoy en el club»", "Pase de lista desde el móvil", "Consulta de la asistencia guardada"],
    impact: "Pasas lista en la pista y la asistencia de cada sesión queda guardada",
  },
  {
    id: "billing", label: "Cuotas", title: "Cuotas al día, sin libreta",
    features: ["Emisión de cuotas mensuales por familia", "Persona pagadora y fecha de vencimiento", "Registro manual de pagos recibidos", "Consulta de cargos pendientes"],
    impact: "Ves qué familias tienen la cuota pendiente y cuáles han pagado; Zaltyko no cobra a las familias",
  },
  {
    id: "resumen", label: "Resumen", title: "Tu academia en cifras",
    features: ["Gimnastas y grupos activos", "Registros de asistencia del periodo", "Cobros manuales registrados por moneda"],
    impact: "Sabes cómo va la academia sin hacer cuentas a mano",
  },
];

/**
 * Conversion FAQ: the objections an academy owner has before signing up, in
 * order. Answer first («Sí» / «No»), real figures, one to three sentences.
 * Every claim must be true in production (tests/audit/*).
 */
export const ESSENTIAL_FAQS = [
  { question: "¿Cuánto cuesta? ¿Hay un plan gratis?", answer: "Sí: Free es gratis hasta 30 gimnastas, 3 grupos y 10 clases activas, y para crear la cuenta no te pedimos tarjeta. Starter cuesta 19 €/mes o 190 €/año hasta 75 gimnastas, y Growth, 49 €/mes o 490 €/año hasta 200. Precios en EUR sin IVA; los planes de pago todavía no se pueden contratar (se abrirán primero en España), y mientras tanto puedes empezar con Free desde cualquier país." },
  { question: "¿Sirve para mi academia y mi país?", answer: "Sí, si es de gimnasia artística o rítmica: Zaltyko funciona en cualquier país con sus funciones generales, y las cuotas se registran manualmente en EUR o MXN (no hay conversión automática ni emisión de facturas fiscales). Nos centramos primero en España y México; lo específico de cada país, como federación, competiciones, cobros locales o facturación, llegará más adelante, sin fecha comprometida. Si quieres que prioricemos tu país, contáctanos." },
  { question: "¿Puedo traer mis gimnastas desde un Excel?", answer: "Sí. Desde la cuenta de la propiedad o la administración subes un Excel o un CSV (hasta 1.000 filas) con tus gimnastas y, si quieres, sus tutores y su grupo, y antes de guardar ves una vista previa fila a fila: las filas con el mismo nombre y fecha de nacimiento que una gimnasta de la academia no se crean de nuevo. Las cuotas, los pagos y el historial no se importan." },
  { question: "¿Cuánto tardo en empezar?", answer: "Puedes empezar hoy: creas tu cuenta, confirmas el correo y configuras tu academia y su sede en un formulario breve. Después, la lista «Puesta en marcha» del Resumen te guía paso a paso hasta pasar tu primera lista." },
  { question: "¿Pueden entrar mis entrenadoras?", answer: "Sí, por invitación. Desde Equipo creas su invitación con su rol y sus sedes y le pasas tú el enlace, porque Zaltyko no envía el correo; con su propia cuenta ve las sesiones de hoy de sus sedes y pasa lista desde el móvil, sin instalar nada, con el guion de la sesión y los objetivos y observaciones de sus gimnastas. No ve cobros, el plan ni la configuración de la academia." },
  { question: "¿Zaltyko cobra a las familias?", answer: "No. Emites las cuotas mensuales de cada familia y registras tú los pagos que recibes (transferencia, efectivo, tarjeta en el local u otro), así ves qué está pendiente y qué está pagado. El plan de tu academia en Zaltyko es aparte y no se mezcla con esas cuotas." },
  { question: "¿Qué pasa con los datos de los menores?", answer: "Zaltyko aísla los datos por academia y aplica controles de acceso por rol: una entrenadora solo ve las sesiones de sus sedes, sin cobros, y los objetivos y observaciones solo los ve el equipo de la academia. Estos controles no sustituyen las obligaciones de la academia, que gestiona los permisos y la información de sus familias conforme a su política de privacidad." },
  { question: "¿Qué pasa al terminar la prueba o si cancelo?", answer: "La prueba de Starter dura 7 días, una vez por academia cada 12 meses, y no pide tarjeta ni genera cargos automáticos. Al finalizar el periodo de acceso, la academia vuelve a Free y conserva sus datos; si supera sus límites, queda en solo lectura hasta archivar el excedente o contratar capacidad suficiente." },
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
    text: "Invitas a cada entrenadora desde Equipo con su rol y sus sedes. Zaltyko no envía el correo: copias el enlace y se lo pasas tú (es de un solo uso y caduca a los 7 días). Entra con su propia cuenta y solo llega a las sesiones de hoy y al pase de lista de sus sedes: no ve cobros, el plan ni la configuración de la academia.",
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
    text: "Activas y compartes el enlace público de tu academia, y quien quiera probar deja su solicitud sin crear una cuenta. La ves en Solicitudes y en «Necesita tu atención», y desde ahí la marcas como contactada o descartada, o creas la ficha de la gimnasta y su familia. Zaltyko no envía correos ni reserva la sesión de prueba.",
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

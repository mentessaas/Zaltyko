/** Public launch claims. Keep visible content and structured data identical. */

/**
 * The promise the competitive research recommends, adapted: the academy works
 * with its direction account, so the team-access half («tu equipo ve…») waits
 * until coach access is available (see IN_PREPARATION).
 */
export const PUBLIC_PROMISE =
  "Organiza grupos, clases y asistencia de tu academia de gimnasia en un solo sitio: ves las sesiones de hoy y pasas lista en un toque.";

/** The same promise under the H1 «El software de tu academia de gimnasia», without repeating it. */
export const HERO_LEAD =
  "Organiza grupos, clases y asistencia en un solo sitio: ves las sesiones de hoy y pasas lista en un toque.";
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
  { question: "¿Para qué academias está pensado?", answer: "Para academias de gimnasia artística y rítmica. La configuración administrativa en español contempla España y México. Las cuotas familiares se registran manualmente en EUR o MXN, según la moneda de la academia; no hay conversión automática ni emisión de facturas fiscales mexicanas. Si tu academia está en otro país, contáctanos para consultar el acceso." },
  { question: "¿Qué planes y precios hay?", answer: "Free incluye hasta 30 gimnastas, 3 grupos y 10 clases activas. Starter cuesta 19 €/mes o 190 €/año hasta 75 gimnastas; Growth, 49 €/mes o 490 €/año hasta 200. Precios sin IVA. Network parte de 99€/mes, sin IVA; su propuesta final se acuerda mediante contacto y puesta en marcha acompañada. Los precios de los planes SaaS se expresan en EUR y la contratación internacional todavía no está habilitada." },
  { question: "¿Zaltyko cobra automáticamente a las familias?", answer: "Las cuotas familiares se emiten y sus pagos se registran manualmente. El plan de tu academia (Starter o Growth) es una contratación SaaS independiente." },
  { question: "¿Qué ocurre al cancelar o terminar la prueba?", answer: "Al finalizar el periodo de acceso, la academia vuelve a Free. Si supera sus límites, conserva sus datos y queda en solo lectura hasta archivar el excedente o contratar capacidad suficiente." },
  { question: "¿Puedo traer mis gimnastas desde un Excel?", answer: "Sí. La propiedad o la administración de la academia puede subir un Excel (.xlsx) o un CSV con sus gimnastas y, si quiere, sus tutores y su grupo, hasta 1.000 filas por fichero. Antes de guardar se ve una vista previa fila a fila con lo que se va a crear y por qué se salta cada fila. Avisa de las filas que coinciden en nombre y fecha de nacimiento con una gimnasta de la academia, que no se crean de nuevo. Las cuotas, los pagos y el historial no se importan." },
  { question: "¿Pueden entrar mis entrenadoras?", answer: "Todavía no. El acceso para entrenadoras, con solo las sesiones de hoy y el pase de lista de sus sedes, está en preparación. Por ahora la academia trabaja con la cuenta de dirección." },
  { question: "¿Cómo empiezo?", answer: "Crea tu cuenta, confirma el correo y configura tu academia y sede. Después puedes añadir gimnastas, familias, grupos y clases. Si necesitas varias sedes, contacta para revisar Network." },
  { question: "¿Cómo se aborda la protección de datos de menores?", answer: "Zaltyko aísla los datos por academia y aplica controles de acceso por rol. La academia debe gestionar los permisos y la información de sus familias conforme a su política de privacidad; estos controles no sustituyen sus obligaciones." },
  { question: "¿Puedo usarlo desde el móvil?", answer: "Zaltyko es una aplicación web adaptable a móvil, tableta y ordenador. No necesitas instalar una aplicación para acceder desde el navegador." },
];

/**
 * Implemented and active in production, told plainly (competitive matrix,
 * section 4). Every entry names the route or change that backs it; the
 * public-claims audit checks those files exist.
 */
export const IMPLEMENTED_HIGHLIGHTS = [
  {
    id: "importacion",
    title: "Trae tus gimnastas desde Excel",
    featureName: "Importación de gimnastas desde Excel o CSV con vista previa",
    text: "Sube un Excel o un CSV con tus gimnastas y, si quieres, sus tutores y su grupo. Antes de guardar ves una vista previa fila a fila, y te avisa de las que coinciden en nombre y fecha de nacimiento con una gimnasta de la academia, que no se crean de nuevo.",
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
export const IN_PREPARATION = [
  "Acceso para entrenadoras, que verán solo las sesiones de hoy y el pase de lista de sus sedes",
  "Entrenadora titular por clase y sustituciones",
  "Objetivos y observaciones de las gimnastas y guion de cada sesión",
  "Portal de familias",
  "Solicitudes de prueba de las familias desde el enlace público de la academia",
] as const;

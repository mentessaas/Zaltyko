# Política de privacidad — cambios propuestos

> **Borrador generado por IA, no es asesoramiento jurídico; requiere revisión por abogado o servicio jurídico antes de publicarse.**
>
> - Estado: BORRADOR PARA VALIDACIÓN. No cambia la página publicada.
> - Texto de partida: `src/app/politica-privacidad/page.tsx` («Última
>   actualización: 26 de octubre de 2026») y `docs/privacy/zaltyko-rgpd-assessment.md`.
> - Formato de cada cambio: **Texto actual → Texto propuesto → Motivo**.
> - Datos del titular como marcadores: `[NOMBRE Y APELLIDOS DEL TITULAR]`,
>   `[NIF DEL TITULAR]`, `[DOMICILIO PROFESIONAL]`.
> - Los plazos marcados «PROPUESTA» no salen de ninguna decisión aprobada:
>   `zaltyko-rgpd-assessment.md` dice expresamente que no se fija un plazo
>   «plausible» sin base real.

## Resumen de diferencias con la versión publicada

| # | Tema | Situación actual | Cambio |
| --- | --- | --- | --- |
| P1 | Responsable (art. 13.1.a) | Bloque de identificación con NIF y domicilio pendientes; §1 no nombra al responsable | Identificación completa y contacto de privacidad |
| P2 | Doble papel: responsable y encargado | No se distingue | Nueva sección que separa ambos papeles |
| P3 | Datos tratados | Lista general | Por papel; añade facturación, consentimientos y documentos |
| P4 | Finalidades y bases jurídicas | Listas separadas, sin relación entre sí | Tabla finalidad → base → plazo |
| P5 | Conservación | «Mientras mantengas una cuenta activa» | Plazos por categoría |
| P6 | Destinatarios y subencargados | «Supabase, Stripe, Brevo y herramientas de observabilidad» | Lista con función y ubicación |
| P7 | Transferencias internacionales | No se menciona | Nueva sección |
| P8 | Derechos | Sin AEPD ni plazos | Reclamación ante la AEPD, plazo y cauce cuando somos encargados |
| P9 | Seguridad | Menciona «auditoría de accesos» y MFA «cuando esté disponible» | Ajustar a lo que existe |
| P10 | Menores | «No recopilamos datos directamente de menores sin consentimiento» | Explicar el papel de la academia y la edad de 14 años |
| P11 | Datos de salud | No se menciona | Nuevo párrafo según la decisión del contrato de encargo |
| P12 | Cookies y analítica | Solo «cookies esenciales» | Analítica con consentimiento; falta política de cookies |
| P13 | Comunicaciones comerciales | «Consentimiento explícito» | Clientes: LSSI art. 21.2 con baja sencilla |
| P14 | Decisiones automatizadas | No se menciona | Declarar que no hay |

---

## P1. Identificación del responsable

**Texto actual** (§1):

> Zaltyko es una plataforma software-as-a-service operada bajo la marca Zaltyko
> que ayuda a academias de gimnasia a gestionar atletas, coaches, clases y
> cobros internos en múltiples sedes.

(El bloque `SellerIdentification` muestra el nombre, «NIF: Pendiente de
completar», «Domicilio profesional: Pendiente de completar» y hola@zaltyko.com.)

**Texto propuesto**:

> **1. Quién es el responsable**
>
> Zaltyko es el nombre comercial con el que [NOMBRE Y APELLIDOS DEL TITULAR],
> empresario individual con NIF [NIF DEL TITULAR] y domicilio profesional en
> [DOMICILIO PROFESIONAL], España, presta un servicio en línea para academias
> de gimnasia.
>
> Para cualquier cuestión de privacidad: hola@zaltyko.com, o por correo
> postal a la dirección anterior. No hemos designado delegado de protección de
> datos [PROPUESTA: confirmar que no es obligatorio].

**Motivo**: art. 13.1.a y b RGPD. «Operada bajo la marca Zaltyko» no identifica
a ninguna persona.

---

## P2. Responsable y encargado (nueva sección)

**Texto actual**: no existe. La política trata todo como si Zaltyko fuera el
único responsable (§2 incluye «información de academias, atletas, coaches,
asistencia, evaluaciones […] que tu organización introduce»).

**Texto propuesto**:

> **2. Cuándo somos responsables y cuándo encargados**
>
> **Somos responsables** de los datos que tratamos para nuestros propios fines:
>
> - las personas que visitan zaltyko.com o nos escriben;
> - las personas que crean y administran la cuenta de una academia, como
>   clientes nuestros (alta, contrato, facturación, soporte, avisos del servicio);
> - la seguridad de la plataforma (accesos, registros técnicos, prevención de
>   abusos), para todas las personas que la usan.
>
> **Somos encargados** de los datos que cada academia introduce o recoge con
> Zaltyko: gimnastas (muchos de ellos menores), familias y tutores, entrenadoras
> y demás personal, clases de prueba, asistencia, cuotas y documentos. La
> responsable de esos datos es la academia, que decide para qué se usan. Los
> tratamos solo para prestarle el servicio, según el contrato de encargo que
> firma con nosotros. Si eres familia, gimnasta o entrenadora de una academia,
> consulta su política de privacidad y dirígete a ella para ejercer tus derechos.

**Motivo**: arts. 4.7, 4.8 y 28 RGPD. El reparto coincide con el del contrato de
encargo (`contrato-encargado-tratamiento.md`). [PROPUESTA: validar quién es
responsable de las cuentas de usuario del personal y de las familias invitadas
por la academia. Este borrador las trata como datos de la academia, salvo en lo
relativo a la seguridad de la plataforma.]

---

## P3. Datos que tratamos (sección 2)

**Texto actual**:

> Datos de cuenta: nombre, apellidos, correo electrónico, contraseña (hash) y
> rol asignado dentro de la academia.
>
> Datos operativos: información de academias, atletas, coaches, asistencia,
> evaluaciones y eventos que tu organización introduce voluntariamente en la
> plataforma.
>
> Datos de suscripción y pago: identificadores de cliente en Stripe, historial
> de suscripción y metadatos de pago. No almacenamos números completos de
> tarjeta ni CVV.
>
> Datos técnicos: registros de acceso, direcciones IP, tipo de dispositivo,
> idioma, cookies esenciales y tokens de sesión para garantizar la seguridad y
> la experiencia de uso.

**Texto propuesto**:

> **3. Datos que tratamos como responsables**
>
> - **Cuenta**: nombre, correo electrónico, contraseña (guardada como hash por
>   nuestro proveedor de autenticación), rol y academia.
> - **Aceptación de condiciones**: versión de los Términos y de la Política que
>   aceptaste y fecha, y la versión de la casilla de inicio inmediato que
>   marcaste al contratar.
> - **Facturación**: nombre o razón social, NIF, dirección de facturación,
>   correo, plan, importes e identificadores del cliente y de la suscripción en
>   Stripe. Stripe recoge los datos de la tarjeta; nosotros no los vemos ni los
>   guardamos.
> - **Soporte y contacto**: lo que nos escribes y nuestras respuestas.
> - **Datos técnicos**: registros de acceso y de auditoría, dirección IP, tipo
>   de dispositivo e idioma, cookies técnicas y de sesión y, solo si lo
>   aceptas, cookies de analítica (sección 12).
>
> Los datos que la academia introduce en la plataforma (sección 2) los tratamos
> como encargados y no se enumeran aquí.

**Motivo**: los datos fiscales los recoge el Checkout (`billing_address_collection`,
`tax_id_collection`, `name_collection` en
`src/modules/saas-billing/application/saas-billing-service.ts`) y no se
mencionan hoy. La aceptación se guarda en `zaltyko.owner_signup_consents`.

---

## P4. Finalidades y bases jurídicas (secciones 3 y 4)

**Texto actual** (§3 y §4, resumido): finalidades — prestar el servicio,
procesar pagos, «generar analíticas agregadas», comunicarnos contigo sobre
novedades. Bases — ejecución de contrato, interés legítimo, «consentimiento
explícito» para comunicaciones comerciales o integraciones opcionales.

**Texto propuesto**:

> **4. Para qué usamos tus datos y con qué base**
>
> | Finalidad | Base jurídica | Plazo (sección 5) |
> | --- | --- | --- |
> | Crear y mantener la cuenta y prestar el servicio contratado | Ejecución del contrato (art. 6.1.b RGPD) | Mientras exista la cuenta |
> | Cobrar la suscripción y emitir facturas | Ejecución del contrato y obligación legal fiscal (art. 6.1.b y c) | Plazos fiscales y mercantiles |
> | Guardar la prueba de la aceptación de las condiciones y del inicio inmediato | Obligación legal y defensa de reclamaciones (art. 6.1.c y f) | Mientras puedan reclamarse |
> | Atender consultas y soporte | Ejecución del contrato o interés legítimo en responder (art. 6.1.b o f) | [PROPUESTA: 2 años tras cerrar la consulta] |
> | Seguridad de la plataforma y prevención de abusos | Interés legítimo (art. 6.1.f) | [PROPUESTA: 12 meses] |
> | Avisos del servicio (cambios, incidencias, facturación) | Ejecución del contrato (art. 6.1.b) | Mientras exista la cuenta |
> | Novedades y ofertas de Zaltyko a clientes | Interés legítimo y LSSI art. 21.2, con baja en cada envío | Hasta que te des de baja |
> | Analítica de uso de la web pública | Consentimiento (art. 6.1.a) | Según la política de cookies |
> | Mejorar el producto con estadísticas agregadas y anónimas | Interés legítimo (art. 6.1.f) | Los datos agregados no identifican a nadie |

**Motivo**: art. 13.1.c y d RGPD exige la base jurídica de cada finalidad y,
cuando sea el interés legítimo, cuál es. «Generar analíticas agregadas para
ayudarte a monitorear desempeño» es un tratamiento que hacemos como encargados
para la academia (health score, insights), no una finalidad propia: se mueve a
la sección 2.

---

## P5. Conservación (sección 5, primer párrafo)

**Texto actual**:

> Los datos se almacenan en la infraestructura de Supabase (UE) y se conservan
> mientras mantengas una cuenta activa o exista una obligación legal.
>
> Podemos anonimizar o agregar información para fines estadísticos una vez
> finalizada la relación contractual.

**Texto propuesto**:

> **5. Cuánto tiempo conservamos los datos**
>
> - **Cuenta**: mientras exista. Al cerrarla, la suprimimos en
>   [PROPUESTA: 30 días], salvo lo que debamos conservar bloqueado.
> - **Facturación**: durante los plazos que exige la normativa fiscal y
>   mercantil [PROPUESTA: confirmar con el gestor; como referencia, 4 años de
>   prescripción tributaria (art. 66 LGT) y 6 años de conservación de la
>   documentación del empresario (art. 30 del Código de Comercio)].
> - **Prueba de aceptación de condiciones y del inicio inmediato**: mientras
>   puedan exigirse responsabilidades derivadas del contrato
>   [PROPUESTA: plazo].
> - **Registros técnicos y de seguridad**: [PROPUESTA: 12 meses].
> - **Datos de las academias** (como encargados): mientras la academia tenga
>   cuenta y, al terminar, según el contrato de encargo (descarga y supresión).
> - **Copias de seguridad**: se eliminan al cumplirse su ciclo de retención
>   [PLAZO DEL PLAN DE SUPABASE — NO VERIFICADO].
>
> Pasados esos plazos, suprimimos los datos o los anonimizamos de forma que no
> permitan identificar a nadie.

**Motivo**: art. 13.2.a RGPD. Hoy no hay cuadro de conservación aprobado
(`docs/privacy/zaltyko-rgpd-assessment.md`, «Gate previo a datos reales») ni
supresión automática de academias (ver contrato de encargo, cláusula 10.2).
**No publicar plazos que la plataforma no pueda cumplir.**

---

## P6. Destinatarios y subencargados (sección 6)

**Texto actual**:

> Proveedores esenciales: Supabase, Stripe, Brevo y herramientas de
> observabilidad necesarias para operar el servicio.
>
> Cumplimiento legal: podemos divulgar información si una autoridad competente
> lo solicita conforme a la legislación aplicable.
>
> No vendemos datos personales ni los compartimos con fines publicitarios de
> terceros.

**Texto propuesto**:

> **6. Con quién compartimos datos**
>
> No vendemos datos ni los cedemos con fines publicitarios. Los comunicamos solo
> a:
>
> | Proveedor | Para qué | Dónde |
> | --- | --- | --- |
> | Supabase | Base de datos, autenticación y archivos | UE (Estocolmo) |
> | Vercel | Alojamiento de la aplicación | Funciones en la UE (Estocolmo); red global |
> | Upstash (Vercel KV) | Limitar peticiones abusivas | [REGIÓN — VERIFICAR] |
> | Brevo | Envío de correos | [UE — VERIFICAR] |
> | Sentry | Detección de errores | [REGIÓN — VERIFICAR] |
> | Hostinger | Correo de soporte hola@zaltyko.com | [VERIFICAR] |
> | Stripe | Cobro de la suscripción | UE e EE. UU. |
> | n8n y FacturaDirecta | Emisión de facturas | [VERIFICAR] |
> | PostHog y Vercel Analytics | Analítica de la web pública, solo con consentimiento | [VERIFICAR; ver sección 12] |
>
> También comunicaremos datos a la Agencia Tributaria, a juzgados y a otras
> autoridades cuando la ley lo exija.
>
> La lista actualizada de subencargados para los datos de las academias está en
> [URL de la lista].

**Motivo**: art. 13.1.e RGPD (destinatarios o categorías). La lista sale del
código (`package.json`, `.env.example`, `src/lib/email/email-service.ts`,
`src/lib/rate-limit.ts`, `instrumentation*.ts`, `src/lib/analytics.ts`) y del
contexto de facturación (n8n, FacturaDirecta). Faltan Vercel, Upstash, Sentry,
Hostinger y los proveedores de facturación. Los proveedores condicionales
(Twilio, MiniMax, Stripe Connect) solo deben añadirse si se activan; ver el
Anexo III del contrato de encargo.

---

## P7. Transferencias internacionales (nueva sección)

**Texto actual**: no existe. §5 dice solo «infraestructura de Supabase (UE)».

**Texto propuesto**:

> **7. Transferencias fuera del Espacio Económico Europeo**
>
> Guardamos los datos de la plataforma en la UE. Algunos proveedores tienen su
> matriz en Estados Unidos (por ejemplo, Vercel, Supabase, Stripe o Sentry) y
> pueden acceder a datos desde allí, por ejemplo para soporte. En esos casos la
> transferencia se ampara en el Marco de Privacidad de Datos UE-EE. UU., si el
> proveedor está certificado, o en las cláusulas contractuales tipo de la
> Comisión Europea. Puedes pedirnos más información en hola@zaltyko.com.

**Motivo**: art. 13.1.f RGPD. **Cada mecanismo debe comprobarse en el DPA de
cada proveedor antes de publicar**; no se ha hecho en este borrador.

---

## P8. Derechos (sección 7)

**Texto actual**:

> Acceder, rectificar o borrar tus datos personales.
> Limitar u oponerte a determinados tratamientos.
> Solicitar la portabilidad de la información en un formato estructurado.
> Ejercer estos derechos escribiendo a hola@zaltyko.com, indicando el rol y la
> academia a la que perteneces.

**Texto propuesto**:

> **8. Tus derechos**
>
> Puedes pedirnos acceso, rectificación, supresión, limitación, oposición y
> portabilidad de tus datos, y retirar en cualquier momento el consentimiento
> que nos hayas dado, sin que afecte a lo tratado antes.
>
> Escríbenos a hola@zaltyko.com indicando qué derecho ejerces. Si no podemos
> comprobar que eres el titular de los datos, te pediremos la información
> mínima necesaria para hacerlo. Responderemos en un mes, ampliable dos meses
> más en casos complejos, avisándote.
>
> **Si tus datos los ha introducido una academia** (eres gimnasta, familia o
> entrenadora), la responsable es la academia: dirígete a ella. Si nos escribes
> a nosotros, le trasladaremos tu solicitud y la ayudaremos a responder.
>
> Si crees que no hemos tratado bien tus datos, puedes reclamar ante la Agencia
> Española de Protección de Datos (www.aepd.es).

**Motivo**: arts. 12.3, 13.2.b, c y d, 15 a 22 RGPD. Falta hoy el derecho a
reclamar ante la AEPD, la retirada del consentimiento y el plazo. Pedir «el rol
y la academia» sirve para el cauce de encargado, que ahora se explica.
**Pendiente**: el procedimiento interno de derechos y verificación de identidad
no existe (`zaltyko-rgpd-assessment.md`).

---

## P9. Seguridad (sección 8)

**Texto actual**:

> Aplicamos políticas RLS en Supabase, cifrado TLS, almacenamiento seguro de
> contraseñas y auditoría de accesos.
>
> Recomendamos habilitar autenticación multifactor cuando esté disponible y
> limitar los accesos compartidos.

**Texto propuesto**:

> **9. Seguridad**
>
> Separamos los datos de cada academia en la base de datos (políticas de
> seguridad a nivel de fila y comprobación de la pertenencia en el servidor),
> asignamos permisos por rol y por sede, ciframos las comunicaciones (TLS),
> guardamos las contraseñas como hash, servimos los documentos con enlaces
> temporales y registramos las acciones relevantes en un registro de auditoría.
> El detalle está en el contrato de encargo.
>
> Te recomendamos no compartir cuentas y retirar el acceso a quien deje la
> academia. Zaltyko todavía no ofrece autenticación en dos pasos.

**Motivo**: lo que se afirma debe coincidir con el Anexo II del contrato de
encargo. «Auditoría de accesos» puede leerse como un registro de cada lectura,
que no se ha comprobado; el código tiene registro de auditoría de acciones
(`zaltyko.audit_log`). No se ha encontrado MFA en el código; mejor decirlo que
«recomendar habilitarla».

---

## P10. Menores de edad (sección 9)

**Texto actual**:

> Zaltyko está pensada para administradores y personal autorizado de academias.
> No recopilamos datos directamente de menores sin consentimiento de su
> representante legal.

**Texto propuesto**:

> **10. Menores de edad**
>
> Muchas academias registran en Zaltyko datos de gimnastas menores de edad. En
> ese caso la academia es la responsable y debe contar con una base jurídica
> válida y, cuando use el consentimiento, con el de los padres o tutores si el
> gimnasta tiene menos de 14 años (art. 7 LOPDGDD). Nosotros tratamos esos datos
> solo como encargados y con medidas reforzadas: no elaboramos perfiles
> individuales de menores y las estadísticas que ve la academia son agregadas.
>
> Nuestras propias cuentas de cliente están pensadas para personas adultas que
> gestionan una academia. Si una academia da acceso a un gimnasta menor, lo hace
> bajo su responsabilidad.

**Motivo**: la frase actual («no recopilamos datos directamente de menores»)
puede leerse como que no hay datos de menores, cuando son el centro del
producto. El código tiene invitaciones de acceso para gimnastas
(`src/lib/athletes/magic-link-invite-service.ts`); **no se ha verificado** si
pueden recibirlas menores de 14 años ni con qué controles.

---

## P11. Datos de salud (nuevo párrafo)

**Texto actual**: no existe.

**Hallazgo**: el producto permite subir documentos de tipo «Certificado Médico»
y guardar la caducidad del certificado médico de la licencia federativa (ver
contrato de encargo, cláusula 4.3).

**Texto propuesto** (según la opción que se elija en el contrato de encargo):

> - Opción A: «Si la academia guarda certificados médicos de aptitud deportiva,
>   son datos de salud. La academia decide si los necesita y los trata como
>   responsable. Nosotros los almacenamos con acceso restringido y no los usamos
>   para nada más.»
> - Opción B: «Zaltyko no está pensada para tratar datos de salud. Pedimos a las
>   academias que no los introduzcan.» (Solo si se retiran esas funciones.)

**Motivo**: art. 9 RGPD; coherencia con el contrato de encargo.

---

## P12. Cookies y analítica (nuevo; hoy solo «cookies esenciales» en §2)

**Texto actual** (§2, datos técnicos): «[…] cookies esenciales y tokens de
sesión […]».

**Texto propuesto**:

> **12. Cookies y analítica**
>
> Usamos cookies técnicas imprescindibles para iniciar sesión y mantener la
> seguridad. Solo si lo aceptas en el aviso de cookies, usamos herramientas de
> analítica (PostHog, Vercel Analytics y Speed Insights) en las páginas públicas
> de zaltyko.com, nunca dentro del área privada de las academias. Puedes
> cambiar tu elección en cualquier momento en [ENLACE A LA CONFIGURACIÓN]. Más
> detalle en la política de cookies.

**Motivo**: LSSI art. 22.2. El código condiciona la analítica al consentimiento
y a rutas públicas (`src/lib/analytics.ts`, `isOptionalTrackingAllowed`), pero
**no existe una página de política de cookies** en `src/app`. Además, si
`NEXT_PUBLIC_POSTHOG_HOST` no está configurado, PostHog envía los datos a
`https://app.posthog.com` (EE. UU.); hay que confirmar la configuración de
producción. Sentry detecta errores sin grabar sesiones
(`instrumentation-client.ts`); se considera necesario para la seguridad, pero el
abogado debe confirmar si requiere consentimiento.

---

## P13. Comunicaciones comerciales

**Texto actual** (§3 y §4): «Comunicarnos contigo sobre novedades del producto
[…]» y «Consentimiento explícito cuando lo requerimos para comunicaciones
comerciales […]».

**Texto propuesto**: ya incluido en la tabla de P4: a clientes, sobre productos
o servicios similares de Zaltyko, con base en el art. 21.2 LSSI y posibilidad
de baja sencilla y gratuita en cada envío; a quien no sea cliente, solo con
consentimiento.

**Motivo**: aclara cuándo se necesita consentimiento. El código ya firma los
enlaces de baja (`UNSUBSCRIBE_HMAC_SECRET` en `.env.example`).

---

## P14. Decisiones automatizadas (nueva)

**Texto propuesto**:

> No tomamos decisiones basadas únicamente en tratamientos automatizados que
> produzcan efectos jurídicos sobre ti o te afecten de forma significativa. Las
> puntuaciones del panel de la academia (por ejemplo, su «salud» como negocio)
> se refieren a la academia en conjunto, no a personas.

**Motivo**: art. 13.2.f RGPD. Coherente con `zaltyko-rgpd-assessment.md`
(`athlete_retention_risk` en `draft`). Si se activa una regla individual sobre
gimnastas, habrá que revisar este texto y hacer antes la EIPD.

---

## P15. Cambios y contacto (secciones 10 y 11)

Sin cambios de fondo. Se propone añadir un identificador de versión, como en
los Términos, y mantener el aviso por correo a las cuentas propietarias.

---

## Otros módulos a revisar antes de publicar

- **Portal de familias y avisos (dormido):** cuando se active, la política de
  la academia y este borrador (P2, P3 y P4) deben cubrir la cuenta de la
  familia invitada, los avisos del portal y por correo y sus preferencias.
  Detalle técnico: `docs/privacy/familias-acceso-y-avisos.md`.

El código contiene módulos públicos en los que Zaltyko actuaría como
responsable y que la política actual no menciona: directorio público de
academias con importaciones y comunicaciones (`DIRECTORY_*` en `.env.example`,
`docs/directory/`), eventos públicos, empleo y marketplace. No se ha verificado
cuáles están activos en producción. Si alguno lo está, necesita su propio
apartado.

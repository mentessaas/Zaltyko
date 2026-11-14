import {
  apparatusLabel,
  formatDiplomaDate,
  skillDisciplineLabels,
  type DiplomaView,
} from "@/modules/skill-levels/domain/skill-levels";

/** Colores del sistema «Magnesio sobre tapiz» (DESIGN.md), fijos para que el papel no dependa del tema. */
const MAT = "#1E3FA8";
const MAT_NIGHT = "#0B1430";
const CHALK = "#F4F6F2";
const CHALK_LINE = "#D5DAE3";
const SIGNAL = "#E5482A";
const OCHRE = "#C4851A";
const RAMP = "#3E4A66";

/** Como mucho se listan estos logros en el diploma; el resto se resume. */
const MAX_LISTED_ACHIEVEMENTS = 8;

/**
 * Diploma de paso de nivel, pensado para A4 apaisado. Lleva el nombre de la
 * academia, el de la gimnasta, la plantilla, el nivel y la fecha, y los
 * elementos obligatorios conseguidos. El diseño no copia ningún diploma
 * federativo. Se imprime desde el navegador (también como PDF): los estilos
 * de impresión ocultan todo lo que no sea el diploma.
 */
export function SkillDiploma({ diploma }: { diploma: DiplomaView }) {
  const listed = diploma.achievements.slice(0, MAX_LISTED_ACHIEVEMENTS);
  const hidden = diploma.achievements.length - listed.length;
  return (
    <>
      <style>{`
        @page { size: A4 landscape; margin: 0; }
        @media print {
          html, body { background: #ffffff !important; }
          body * { visibility: hidden; }
          .skill-diploma-sheet, .skill-diploma-sheet * { visibility: visible; }
          .skill-diploma-sheet {
            position: fixed; inset: 0; width: 297mm; height: 210mm; max-width: none;
            -webkit-print-color-adjust: exact; print-color-adjust: exact;
          }
        }
      `}</style>
      <article
        className="skill-diploma-sheet mx-auto w-full max-w-[1123px]"
        style={{ aspectRatio: "297 / 210", background: CHALK, color: MAT_NIGHT, position: "relative" }}
        aria-label={`Diploma de ${diploma.athleteName}`}
      >
        <div
          style={{
            position: "absolute",
            inset: "3%",
            border: `6px solid ${MAT}`,
            outline: `2px solid ${CHALK_LINE}`,
            outlineOffset: "-14px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "3.5% 6%",
            textAlign: "center",
          }}
        >
          <header style={{ display: "grid", gap: "0.4em", justifyItems: "center" }}>
            <p
              style={{
                margin: 0,
                fontFamily: "Archivo, ui-sans-serif, system-ui",
                fontWeight: 900,
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                fontSize: "clamp(0.8rem, 1.6vw, 1.15rem)",
                color: MAT,
              }}
            >
              {diploma.academyName}
            </p>
            <span aria-hidden="true" style={{ display: "block", width: "4.5rem", height: "4px", background: SIGNAL }} />
            <h1
              style={{
                margin: 0,
                fontFamily: "Archivo, ui-sans-serif, system-ui",
                fontWeight: 900,
                textTransform: "uppercase",
                lineHeight: 0.95,
                fontSize: "clamp(1.8rem, 5.2vw, 3.9rem)",
                color: MAT_NIGHT,
              }}
            >
              Diploma de nivel
            </h1>
          </header>

          <div style={{ display: "grid", gap: "0.5em", justifyItems: "center" }}>
            <p style={{ margin: 0, fontSize: "clamp(0.75rem, 1.5vw, 1.05rem)", color: RAMP }}>Se otorga a</p>
            <p
              style={{
                margin: 0,
                fontFamily: "Archivo, ui-sans-serif, system-ui",
                fontWeight: 900,
                lineHeight: 1,
                fontSize: "clamp(1.6rem, 4.6vw, 3.4rem)",
                color: MAT,
                overflowWrap: "anywhere",
              }}
            >
              {diploma.athleteName}
            </p>
            <p style={{ margin: 0, fontSize: "clamp(0.8rem, 1.6vw, 1.15rem)", color: MAT_NIGHT }}>
              por superar el nivel{" "}
              <strong style={{ fontWeight: 800 }}>«{diploma.levelName}»</strong> de{" "}
              <strong style={{ fontWeight: 800 }}>{diploma.templateName}</strong>
            </p>
            <p style={{ margin: 0, fontSize: "clamp(0.7rem, 1.3vw, 0.95rem)", color: RAMP }}>
              {skillDisciplineLabels[diploma.discipline]} · {formatDiplomaDate(diploma.passedOn)}
            </p>
          </div>

          {listed.length > 0 ? (
            <section
              aria-label="Elementos conseguidos"
              style={{ width: "100%", borderTop: `1px solid ${CHALK_LINE}`, paddingTop: "0.8em" }}
            >
              <p
                style={{
                  margin: "0 0 0.4em",
                  fontFamily: "Archivo, ui-sans-serif, system-ui",
                  fontWeight: 800,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  fontSize: "clamp(0.6rem, 1vw, 0.75rem)",
                  color: OCHRE,
                }}
              >
                Elementos conseguidos
              </p>
              <ul
                style={{
                  listStyle: "none",
                  margin: 0,
                  padding: 0,
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0.3em 1.2em",
                  justifyContent: "center",
                  fontSize: "clamp(0.62rem, 1.1vw, 0.82rem)",
                  color: MAT_NIGHT,
                }}
              >
                {listed.map((achievement, index) => (
                  <li key={`${achievement.name}-${index}`}>
                    {achievement.name}
                    {achievement.apparatus ? ` (${apparatusLabel(achievement.apparatus)})` : ""}
                  </li>
                ))}
                {hidden > 0 ? <li>y {hidden} más</li> : null}
              </ul>
            </section>
          ) : null}

          <footer
            style={{
              width: "100%",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
              gap: "1em",
              fontSize: "clamp(0.6rem, 1vw, 0.78rem)",
              color: RAMP,
            }}
          >
            <span style={{ display: "grid", gap: "0.2em", justifyItems: "center", minWidth: "30%" }}>
              <span style={{ display: "block", width: "100%", borderTop: `1px solid ${MAT_NIGHT}` }} />
              Dirección técnica
            </span>
            <span style={{ opacity: 0.8 }}>Generado con Zaltyko</span>
            <span style={{ display: "grid", gap: "0.2em", justifyItems: "center", minWidth: "30%" }}>
              <span style={{ display: "block", width: "100%", borderTop: `1px solid ${MAT_NIGHT}` }} />
              Entrenadora o entrenador
            </span>
          </footer>
        </div>
      </article>
    </>
  );
}

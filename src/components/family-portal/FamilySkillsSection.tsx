import { SkillTemplateProgress } from "@/components/skill-levels/SkillTemplateProgress";
import { ownerUi } from "@/components/owner-dashboard/owner-ui";
import type { FamilySkillsView } from "@/modules/skill-levels/domain/skill-levels";

/**
 * Sección de solo lectura con los niveles y la progresión de una gimnasta
 * para sus tutores. Recibe los datos ya leídos (la página los carga con
 * loadFamilySkills): sin datos, es decir, con la función no disponible o con
 * un fallo de lectura, no pinta nada y nunca rompe la página de la gimnasta.
 * Sin nombres del equipo ni formularios.
 */
export function FamilySkillsSection({ view, athleteId }: { view: FamilySkillsView | null; athleteId: string }) {
  if (!view) return null;

  return (
    <section className={`${ownerUi.card} mt-6`} aria-labelledby="family-skills-title">
      <h2 id="family-skills-title" className={ownerUi.sectionTitle}>
        Niveles y progreso
      </h2>
      <p className={`${ownerUi.help} mt-1`}>
        Lo que {view.athleteName} va consiguiendo en {view.academyName}. Lo actualiza su equipo técnico.
      </p>
      {view.templates.length === 0 ? (
        <p className={`${ownerUi.muted} mt-3`}>Todavía no hay progreso registrado.</p>
      ) : (
        <div className="mt-4 grid gap-6">
          {view.templates.map((progress) => (
            <SkillTemplateProgress
              key={progress.template.id}
              progress={progress}
              diplomaHrefFor={(passId) => `/familia/gimnastas/${athleteId}/diplomas/${passId}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}

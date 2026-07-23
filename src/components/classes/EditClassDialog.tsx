"use client";

import { type FormEvent, memo, useEffect, useMemo, useState, useTransition } from "react";

import { Modal } from "@/components/ui/modal";
import { useAcademyContext } from "@/hooks/use-academy-context";
import type { SportConfigOption } from "@/components/groups/types";
import { getTerminology } from "@/lib/sport-config/terminology";
import {
  ClassAdvancedOptionsSection,
  ClassAssignmentsSection,
  ClassNameSection,
  ClassScheduleSection,
  ClassSportSection,
  ClassTechnicalFocusSection,
  EditClassError,
  EditClassFooter,
} from "@/components/classes/EditClassDialogSections";
import {
  buildEditClassPayload,
  hasEditClassChanges,
  type ClassItem,
  type CoachOption,
  type EditClassFormState,
  type GroupOption,
} from "@/components/classes/edit-class-dialog-model";
import { logger } from "@/lib/logger";

interface EditClassDialogProps {
  classItem: ClassItem;
  availableCoaches: CoachOption[];
  availableGroups?: GroupOption[];
  sportConfigs?: SportConfigOption[];
  open: boolean;
  onClose: () => void;
  onUpdated: () => void;
  onDeleted?: () => void;
  academyId: string;
}

export const EditClassDialog = memo(function EditClassDialog({
  classItem,
  availableCoaches,
  availableGroups = [],
  sportConfigs = [],
  open,
  onClose,
  onUpdated,
  onDeleted,
  academyId,
}: EditClassDialogProps) {
  const { specialization } = useAcademyContext();
  const [name, setName] = useState(classItem.name);
  const [selectedWeekdays, setSelectedWeekdays] = useState<string[]>(
    classItem.weekdays.map((day) => String(day))
  );
  const [startTime, setStartTime] = useState(classItem.startTime ?? "");
  const [endTime, setEndTime] = useState(classItem.endTime ?? "");
  const [capacity, setCapacity] = useState(classItem.capacity ? String(classItem.capacity) : "");
  const [technicalFocus, setTechnicalFocus] = useState(classItem.technicalFocus ?? "");
  const [sportConfigId, setSportConfigId] = useState(classItem.sportConfigId ?? "");
  const [selectedApparatus, setSelectedApparatus] = useState<string[]>(classItem.apparatus ?? []);
  const [selectedCoaches, setSelectedCoaches] = useState<string[]>(
    classItem.coaches.map((coach) => coach.id)
  );
  const [selectedGroups, setSelectedGroups] = useState<string[]>(
    classItem.groups?.map((group) => group.id) ?? []
  );
  const [allowsFreeTrial, setAllowsFreeTrial] = useState(classItem.allowsFreeTrial ?? false);
  const [waitingListEnabled, setWaitingListEnabled] = useState(classItem.waitingListEnabled ?? false);
  const [cancellationHoursBefore, setCancellationHoursBefore] = useState(
    classItem.cancellationHoursBefore ?? 24
  );
  const [cancellationPolicy, setCancellationPolicy] = useState(
    classItem.cancellationPolicy ?? "standard"
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(classItem.name);
    setSelectedWeekdays(classItem.weekdays.map((day) => String(day)));
    setStartTime(classItem.startTime ?? "");
    setEndTime(classItem.endTime ?? "");
    setCapacity(classItem.capacity ? String(classItem.capacity) : "");
    setTechnicalFocus(classItem.technicalFocus ?? "");
    setSportConfigId(classItem.sportConfigId ?? "");
    setSelectedApparatus(classItem.apparatus ?? []);
    setSelectedCoaches(classItem.coaches.map((coach) => coach.id));
    setSelectedGroups(classItem.groups?.map((group) => group.id) ?? []);
    setAllowsFreeTrial(classItem.allowsFreeTrial ?? false);
    setWaitingListEnabled(classItem.waitingListEnabled ?? false);
    setCancellationHoursBefore(classItem.cancellationHoursBefore ?? 24);
    setCancellationPolicy(classItem.cancellationPolicy ?? "standard");
    setError(null);
  }, [classItem, open]);

  const selectedGroupObjects = useMemo(
    () => availableGroups.filter((group) => selectedGroups.includes(group.id)),
    [availableGroups, selectedGroups]
  );
  const groupSportConfigIds = useMemo(
    () =>
      Array.from(
        new Set(
          selectedGroupObjects
            .map((group) => group.sportConfigId)
            .filter((value): value is string => Boolean(value))
        )
      ),
    [selectedGroupObjects]
  );
  const effectiveSportConfigId =
    groupSportConfigIds.length === 1 ? groupSportConfigIds[0] : sportConfigId;
  const selectedSportConfig = useMemo(
    () => sportConfigs.find((config) => config.id === effectiveSportConfigId) ?? null,
    [effectiveSportConfigId, sportConfigs]
  );
  const terms = useMemo(() => getTerminology(selectedSportConfig), [selectedSportConfig]);
  const classTerm = specialization.labels.classLabel;
  const classTermLower = classTerm.toLowerCase();
  const groupTermLower = terms.group.toLowerCase();
  const coachTermPluralLower = `${terms.coach.toLowerCase()}s`;
  const apparatusOptions =
    selectedSportConfig?.apparatus.map((item) => ({ code: item.code, label: item.name })) ??
    specialization.evaluation.apparatus.map((item) => ({ code: item.code, label: item.label }));
  const compatibleGroups = useMemo(
    () =>
      effectiveSportConfigId
        ? availableGroups.filter((group) => !group.sportConfigId || group.sportConfigId === effectiveSportConfigId)
        : availableGroups,
    [availableGroups, effectiveSportConfigId]
  );
  const compatibleCoaches = useMemo(
    () =>
      effectiveSportConfigId
        ? availableCoaches.filter((coach) => !coach.sportConfigIds?.length || coach.sportConfigIds.includes(effectiveSportConfigId))
        : availableCoaches,
    [availableCoaches, effectiveSportConfigId]
  );
  const formState: EditClassFormState = {
    name,
    selectedWeekdays,
    startTime,
    endTime,
    capacity,
    technicalFocus,
    selectedApparatus,
    selectedCoaches,
    selectedGroups,
    allowsFreeTrial,
    waitingListEnabled,
    cancellationHoursBefore,
    cancellationPolicy,
  };
  const hasChanges = useMemo(
    () => hasEditClassChanges(classItem, formState, effectiveSportConfigId || null),
    [
      classItem,
      name,
      selectedWeekdays,
      startTime,
      endTime,
      capacity,
      technicalFocus,
      selectedApparatus,
      selectedCoaches,
      selectedGroups,
      allowsFreeTrial,
      waitingListEnabled,
      cancellationHoursBefore,
      cancellationPolicy,
      effectiveSportConfigId,
    ]
  );

  useEffect(() => {
    if (!selectedSportConfig) return;
    setSelectedApparatus((current) => {
      const allowed = new Set(selectedSportConfig.apparatus.map((item) => item.code));
      return current.filter((item) => allowed.has(item));
    });
    setSelectedCoaches((current) =>
      current.filter((coachId) => {
        const coach = availableCoaches.find((item) => item.id === coachId);
        return !coach?.sportConfigIds?.length || coach.sportConfigIds.includes(selectedSportConfig.id);
      })
    );
  }, [availableCoaches, selectedSportConfig]);

  const handleClose = () => {
    if (isPending) return;
    onClose();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      try {
        const response = await fetch(`/api/classes/${classItem.id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "x-academy-id": academyId,
          },
          body: JSON.stringify(buildEditClassPayload(formState, effectiveSportConfigId || null)),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          logger.error("EditClassDialog: Error en la respuesta", data);


          if (data.error === "SCHEDULE_CONFLICT" && data.message) {
            throw new Error(data.message);
          }

          let errorMessage = data.error || data.message || `Error ${response.status}: ${response.statusText}`;

          if (process.env.NODE_ENV === "development") {
            const details: string[] = [];
            if (data.message && data.message !== errorMessage) {
              details.push(data.message);
            }
            if (data.detail) {
              details.push(`Detalle: ${data.detail}`);
            }
            if (data.code) {
              details.push(`Código: ${data.code}`);
            }
            if (data.stack) {
              logger.error("EditClassDialog: Stack trace del error", data.stack);
            }
            if (details.length > 0) {
              errorMessage = `${errorMessage}\n\n${details.join("\n")}`;
            }
          }

          throw new Error(errorMessage);
        }

        await response.json().catch(() => ({ ok: true }));
        onUpdated();
        onClose();
      } catch (err: unknown) {
        logger.error("EditClassDialog: Error al guardar", err);
        setError(err instanceof Error ? err.message : "Error al guardar cambios. Por favor, intenta de nuevo.");
      }
    });
  };

  const handleDelete = async () => {
    if (isPending || isDeleting) return;
    const confirmed = typeof window !== "undefined"
      ? window.confirm("¿Seguro que quieres eliminar este elemento? Esta acción no se puede deshacer.")
      : true;

    if (!confirmed) return;

    setError(null);
    setIsDeleting(true);

    try {
      const response = await fetch(`/api/classes/${classItem.id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "x-academy-id": academyId,
        },
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const errorMessage =
          data.error ||
          data.message ||
          data.detail ||
          `No se pudo eliminar este elemento (código ${response.status}).`;
        throw new Error(errorMessage);
      }

      if (onDeleted) {
        onDeleted();
      } else {
        onUpdated();
      }
      onClose();
    } catch (deleteError: unknown) {
      logger.error("EditClassDialog: Error al eliminar la clase", deleteError);
      setError(deleteError instanceof Error ? deleteError.message : "No se pudo eliminar este elemento. Intenta nuevamente.");
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleApparatus = (value: string) => {
    setSelectedApparatus((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]
    );
  };

  const toggleCoach = (coachId: string) => {
    setSelectedCoaches((prev) =>
      prev.includes(coachId) ? prev.filter((id) => id !== coachId) : [...prev, coachId]
    );
  };

  const toggleWeekday = (value: string) => {
    setSelectedWeekdays((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]
    );
  };

  const toggleGroup = (groupId: string) => {
    const targetGroup = availableGroups.find((group) => group.id === groupId) ?? null;
    setSelectedGroups((prev) => {
      if (prev.includes(groupId)) {
        return prev.filter((id) => id !== groupId);
      }

      if (targetGroup?.sportConfigId && effectiveSportConfigId && targetGroup.sportConfigId !== effectiveSportConfigId) {
        return [groupId];
      }

      return [...prev, groupId];
    });
    if (targetGroup?.sportConfigId && targetGroup.sportConfigId !== effectiveSportConfigId) {
      setSportConfigId(targetGroup.sportConfigId);
      setSelectedApparatus([]);
    }
  };

  const handleSportConfigChange = (nextSportConfigId: string, groups: GroupOption[]) => {
    setSportConfigId(nextSportConfigId);
    setSelectedApparatus([]);
    setSelectedGroups((current) => {
      if (!nextSportConfigId) return current;
      return current.filter((groupId) => {
        const group = groups.find((item) => item.id === groupId);
        return !group?.sportConfigId || group.sportConfigId === nextSportConfigId;
      });
    });
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={`Editar ${classTermLower}`}
      description={`Actualiza horario, capacidad, ${coachTermPluralLower}, ${terms.group.toLowerCase()}s y ${terms.apparatus.toLowerCase()}s.`}
      footer={
        <EditClassFooter
          classTermLower={classTermLower}
          hasChanges={hasChanges}
          isDeleting={isDeleting}
          isPending={isPending}
          onClose={handleClose}
          onDelete={handleDelete}
        />
      }
    >
      <form id="edit-class-form" onSubmit={handleSubmit} className="space-y-5">
        <EditClassError error={error} />
        <ClassNameSection
          classTermLower={classTermLower}
          name={name}
          onNameChange={setName}
        />
        <ClassScheduleSection
          capacity={capacity}
          classTermLower={classTermLower}
          endTime={endTime}
          selectedWeekdays={selectedWeekdays}
          startTime={startTime}
          onCapacityChange={setCapacity}
          onClearWeekdays={() => setSelectedWeekdays([])}
          onEndTimeChange={setEndTime}
          onStartTimeChange={setStartTime}
          onToggleWeekday={toggleWeekday}
        />
        <ClassTechnicalFocusSection
          technicalFocus={technicalFocus}
          onTechnicalFocusChange={setTechnicalFocus}
        />
        <ClassSportSection
          apparatusLabel={terms.apparatus}
          apparatusOptions={apparatusOptions}
          availableGroups={availableGroups}
          effectiveSportConfigId={effectiveSportConfigId}
          groupSportConfigIds={groupSportConfigIds}
          groupTermLower={groupTermLower}
          selectedApparatus={selectedApparatus}
          sportConfigs={sportConfigs}
          onApparatusToggle={toggleApparatus}
          onSportConfigChange={handleSportConfigChange}
        />
        <ClassAssignmentsSection
          classTermLower={classTermLower}
          coachTermPluralLower={coachTermPluralLower}
          compatibleCoaches={compatibleCoaches}
          compatibleGroups={compatibleGroups}
          groupTermLower={groupTermLower}
          hasGroups={availableGroups.length > 0}
          selectedCoaches={selectedCoaches}
          selectedGroups={selectedGroups}
          terms={terms}
          onToggleCoach={toggleCoach}
          onToggleGroup={toggleGroup}
        />
        <ClassAdvancedOptionsSection
          allowsFreeTrial={allowsFreeTrial}
          cancellationHoursBefore={cancellationHoursBefore}
          cancellationPolicy={cancellationPolicy}
          classTermLower={classTermLower}
          waitingListEnabled={waitingListEnabled}
          onAllowsFreeTrialChange={setAllowsFreeTrial}
          onCancellationHoursBeforeChange={setCancellationHoursBefore}
          onCancellationPolicyChange={setCancellationPolicy}
          onWaitingListEnabledChange={setWaitingListEnabled}
        />
      </form>
    </Modal>
  );
});

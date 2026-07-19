"use client";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Modal } from "@/components/ui/modal";
import { useEditAthlete } from "@/hooks/use-edit-athlete";
import type { AthleteSummary } from "@/types/athlete-edit";
import { AthleteBasicInfoForm } from "./forms/AthleteBasicInfoForm";
import { AthleteLevelForm } from "./forms/AthleteLevelForm";
import { GuardiansSection } from "./guardians/GuardiansSection";
import type { CategoryOption, LevelOption } from "@/types/athlete-edit";
import { athleteStatusOptions } from "@/lib/athletes/constants";
import type { SportConfigOption } from "@/components/groups/types";
import type { GroupOption } from "@/types";
import { getTerminology } from "@/lib/sport-config/terminology";

interface EditAthleteDialogProps {
  athlete: AthleteSummary;
  academyId: string;
  open: boolean;
  onClose: () => void;
  onUpdated: () => void;
  onDeleted: () => void;
  groups?: GroupOption[];
  sportConfigs?: SportConfigOption[];
}

export function EditAthleteDialog({
  athlete,
  academyId,
  open,
  onClose,
  onUpdated,
  onDeleted,
  groups = [],
  sportConfigs = [],
}: EditAthleteDialogProps) {
        const {
    // Form state
    name,
    setName,
    dob,
    setDob,
    category,
    setCategory,
    level,
    setLevel,
      status,
    setStatus,
    groupId,
    setGroupId,
    sportConfigId,
    setSportConfigId,
    programCode,
    setProgramCode,
    error,
    isPending,
    deleteDialogOpen,
    setDeleteDialogOpen,
    isDeleting,
    hasChanges,
    computedAgeLabel,
    // Guardian state
    guardianForm,
    setGuardianForm,
    guardianError,
    guardians,
    guardiansLoading,
    editingGuardianId,
    editingGuardianForm,
    setEditingGuardianForm,
    isSavingGuardian,
    // Handlers
    handleSave,
    handleDelete,
    handleAddGuardian,
    handleRemoveGuardian,
    beginEditGuardian,
    cancelEditGuardian,
    handleUpdateGuardian,
  } = useEditAthlete({
    athlete,
    academyId,
    open,
    onUpdated: () => {
        onUpdated();
        onClose();
    },
    onDeleted: () => {
      onDeleted();
      onClose();
    },
  });

  const handleClose = () => {
    if (isPending) return;
    onClose();
  };

  const selectedGroup = groups.find((group) => group.id === groupId) ?? null;
  const effectiveSportConfigId = selectedGroup?.sportConfigId ?? sportConfigId;
  const selectedSportConfig = sportConfigs.find((config) => config.id === effectiveSportConfigId) ?? null;
  const terms = getTerminology(selectedSportConfig);
  const programOptions = selectedSportConfig?.programs ?? [];
  const categoryOptions =
    selectedSportConfig?.categories.map((option) => ({ code: option.code, name: option.name })) ?? undefined;
  const levelOptions =
    selectedSportConfig?.levels
      .filter((option) => !programCode || !option.programCode || option.programCode === programCode)
      .map((option) => ({ code: option.code, name: option.name })) ?? undefined;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={`Editar ${terms.athlete.toLowerCase()}`}
      description={`Actualiza la información del ${terms.athlete.toLowerCase()} y gestiona sus contactos familiares.`}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => setDeleteDialogOpen(true)}
            className="text-sm font-semibold text-red-600 hover:underline"
            disabled={isPending || isDeleting}
          >
            Eliminar {terms.athlete.toLowerCase()}
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isPending}
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="edit-athlete-form"
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white shadow hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isPending || !hasChanges}
            >
              {isPending ? "Guardando..." : "Guardar cambios"}
            </button>
          </div>
        </div>
      }
    >
      <form id="edit-athlete-form" onSubmit={handleSave} className="space-y-8">
        {error && (
          <div className="rounded-md border border-red-400 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <AthleteBasicInfoForm
          name={name}
          dob={dob}
          groupId={groupId}
          computedAgeLabel={computedAgeLabel}
          status={status}
          groups={groups}
          athleteLabel={terms.athlete}
          groupLabel={terms.group}
          onNameChange={setName}
          onDobChange={setDob}
          onGroupIdChange={(nextGroupId) => {
            const nextGroup = groups.find((group) => group.id === nextGroupId);
            setGroupId(nextGroupId);
            setSportConfigId(nextGroup?.sportConfigId ?? "");
            setProgramCode(nextGroup?.programCode ?? "");
            setCategory(nextGroup?.categoryCode ?? "");
            setLevel(nextGroup?.levelCode ?? "");
          }}
        />

        <AthleteLevelForm
          sportConfigId={effectiveSportConfigId}
          sportConfigs={sportConfigs}
          programCode={programCode}
          programOptions={programOptions}
          category={category}
          level={level}
          status={status}
          categoryOptions={categoryOptions}
          levelOptions={levelOptions}
          categoryLabel={terms.category}
          levelLabel={terms.level}
          onSportConfigChange={(value) => {
            setSportConfigId(value);
            setProgramCode("");
            setCategory("");
            setLevel("");
          }}
          onProgramChange={(value) => {
            setProgramCode(value);
            setLevel("");
          }}
          onCategoryChange={(value) => setCategory(value as CategoryOption | "")}
          onLevelChange={(value) => setLevel(value as LevelOption | "")}
          onStatusChange={(value) => setStatus(value as (typeof athleteStatusOptions)[number])}
        />
      </form>

      <GuardiansSection
        guardians={guardians}
        guardiansLoading={guardiansLoading}
        guardianError={guardianError}
        guardianForm={guardianForm}
        editingGuardianId={editingGuardianId}
        editingGuardianForm={editingGuardianForm}
        isSavingGuardian={isSavingGuardian}
        onGuardianFormChange={(updates) => setGuardianForm((prev) => ({ ...prev, ...updates }))}
        onEditingFormChange={(updates) => setEditingGuardianForm((prev) => ({ ...prev, ...updates }))}
        onAddGuardian={handleAddGuardian}
        onEditGuardian={beginEditGuardian}
        onUpdateGuardian={handleUpdateGuardian}
        onCancelEdit={cancelEditGuardian}
        onRemoveGuardian={handleRemoveGuardian}
      />

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title={`Eliminar ${terms.athlete.toLowerCase()}`}
        description={`¿Estás seguro de eliminar a "${athlete.name}"? Esta acción no se puede deshacer y eliminará todos los datos asociados al ${terms.athlete.toLowerCase()}.`}
        variant="destructive"
        confirmText="Eliminar"
        onConfirm={handleDelete}
        onCancel={() => setDeleteDialogOpen(false)}
        loading={isDeleting}
      />
    </Modal>
  );
}

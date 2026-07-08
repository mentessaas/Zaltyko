"use client";

import { memo, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { EventFormInitialData } from "@/types/event-form";
import { useAcademyContext } from "@/hooks/use-academy-context";
import { getSpecializedEventTypes } from "@/lib/specialization/registry";
import {
  buildEventFormDefaults,
  buildEventPayload,
  eventFormSchema,
  getDefaultEventDiscipline,
  getEventInitialDataFromSummary,
  type EventFormValues,
} from "./event-form-model";
import {
  EventContactSection,
  EventDetailsSection,
  EventFormActions,
  EventMediaSection,
  EventNotificationSection,
  EventRegistrationSection,
  type SportConfigOption,
} from "./EventFormSections";

interface EventFormProps {
  academyId: string;
  sportConfigs?: SportConfigOption[];
  eventId?: string;
  initialData?: EventFormInitialData;
  onSuccess?: () => void;
  open?: boolean;
  onClose?: () => void;
  event?: {
    id: string;
    title: string;
    date?: string | null;
    location?: string | null;
    status?: string | null;
  } | null;
  onSaved?: () => void;
}

export const EventForm = memo(function EventForm({
  academyId,
  sportConfigs = [],
  eventId,
  initialData,
  onSuccess,
  open,
  onClose,
  event,
  onSaved,
}: EventFormProps) {
  const router = useRouter();
  const { specialization } = useAcademyContext();
  const eventTypes = getSpecializedEventTypes(specialization);

  const effectiveEventId = eventId || event?.id;
  const effectiveInitialData: EventFormInitialData | undefined = useMemo(() => {
    return initialData || getEventInitialDataFromSummary(event);
  }, [initialData, event]);

  const defaultValues = useMemo(() => buildEventFormDefaults(effectiveInitialData), [effectiveInitialData]);

  const {
    control,
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    getValues,
    formState: { errors, isSubmitting, isValid },
  } = useForm<EventFormValues>({
    resolver: zodResolver(eventFormSchema),
    defaultValues,
    mode: "onChange",
  });

  const sportConfigIdValue = watch("sportConfigId") ?? "";
  const eventTypeValue = watch("eventType") ?? "";
  const competitionTypeCodeValue = watch("competitionTypeCode") ?? "";
  const registrationStartDateValue = watch("registrationStartDate") ?? "";
  const registrationEndDateValue = watch("registrationEndDate") ?? "";
  const startDateValue = watch("startDate") ?? "";
  const selectedSportConfig = useMemo(
    () => sportConfigs.find((config) => config.id === sportConfigIdValue) ?? null,
    [sportConfigs, sportConfigIdValue]
  );
  const displayedEventTypes = useMemo(
    () =>
      selectedSportConfig && selectedSportConfig.competitionTypes.length > 0
        ? selectedSportConfig.competitionTypes.map((item) => ({ value: item.code, label: item.name }))
        : eventTypes,
    [selectedSportConfig, eventTypes]
  );

  useEffect(() => {
    if (event || initialData) {
      reset(defaultValues);
    }
  }, [event, initialData, defaultValues, reset]);

  useEffect(() => {
    const defaultDiscipline = getDefaultEventDiscipline(specialization.disciplineVariant);
    if (!defaultDiscipline || getValues("discipline")) return;

    setValue("discipline", defaultDiscipline, { shouldValidate: false });
  }, [getValues, setValue, specialization.disciplineVariant]);

  const handleSportConfigChange = (nextId: string) => {
    const config = sportConfigs.find((item) => item.id === nextId);
    setValue("sportConfigId", nextId, { shouldValidate: true });
    if (config?.defaultDisciplineVariant) {
      setValue("discipline", config.defaultDisciplineVariant, { shouldValidate: true });
    }
    setValue("competitionTypeCode", "", { shouldValidate: true });
  };

  const onValid = async (values: EventFormValues) => {
    try {
      const payload = buildEventPayload(academyId, values);

      const url = effectiveEventId ? `/api/events/${effectiveEventId}` : "/api/events";
      const method = effectiveEventId ? "PATCH" : "POST";

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "x-academy-id": academyId,
        },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || "Error al guardar el evento");
      }

      if (onSaved) {
        onSaved();
      } else if (onSuccess) {
        onSuccess();
      } else {
        router.push(`/app/${academyId}/events`);
        router.refresh();
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Error al guardar el evento";
      throw new Error(errorMessage);
    }
  };

  const formContent = (
    <form onSubmit={handleSubmit(onValid)} className="space-y-6" noValidate>
      <div className="grid gap-6 sm:grid-cols-2">
        <EventDetailsSection
          control={control}
          register={register}
          errors={errors}
          watch={watch}
          setValue={setValue}
          sportConfigs={sportConfigs}
          sportConfigIdValue={sportConfigIdValue}
          selectedSportConfig={selectedSportConfig}
          eventTypeValue={eventTypeValue}
          competitionTypeCodeValue={competitionTypeCodeValue}
          displayedEventTypes={displayedEventTypes}
          registrationStartDateValue={registrationStartDateValue}
          registrationEndDateValue={registrationEndDateValue}
          startDateValue={startDateValue}
          disciplineName={specialization.labels.disciplineName}
          onSportConfigChange={handleSportConfigChange}
        />
        <EventMediaSection
          control={control}
          effectiveEventId={effectiveEventId}
          isSubmitting={isSubmitting}
        />
        <EventNotificationSection control={control} />
        <EventContactSection register={register} errors={errors} />
        <EventRegistrationSection control={control} register={register} />
      </div>

      <EventFormActions
        effectiveEventId={effectiveEventId}
        isSubmitting={isSubmitting}
        isValid={isValid}
        onCancel={() => router.back()}
      />
    </form>
  );

  if (open !== undefined) {
    return (
      <Dialog
        open={open}
        onOpenChange={(isOpen) => {
          if (!isOpen && onClose) {
            onClose();
          }
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto border-zaltyko-mist bg-zaltyko-warm-white">
          <DialogHeader>
            <DialogTitle className="font-display text-zaltyko-navy">
              {effectiveEventId ? "Editar evento" : "Crear nuevo evento"}
            </DialogTitle>
            <DialogDescription className="text-zaltyko-text-secondary">
              {effectiveEventId ? "Modifica los detalles del evento existente" : "Crea un nuevo evento para tu academia"}
            </DialogDescription>
          </DialogHeader>
          {formContent}
        </DialogContent>
      </Dialog>
    );
  }

  return formContent;
});

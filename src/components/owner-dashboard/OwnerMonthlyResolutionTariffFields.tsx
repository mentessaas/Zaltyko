"use client";

import {
  fieldClassName,
  formatMoney,
  primaryButtonClassName,
  secondaryButtonClassName,
  type ClassTemplateOption,
  type PricePlanDraft,
  type PricePlanOption,
} from "./owner-monthly-resolution-model";

/** Existing monthly price plan, its start date and the entry point to create another one. */
export function MonthlyPricePlanSelector({
  pricePlans,
  selectedPricePlanId,
  onSelectPricePlan,
  priceStartsOn,
  onPriceStartsOnChange,
  busy,
  beginCreationDisabled,
  onBeginCreation,
}: {
  pricePlans: PricePlanOption[];
  selectedPricePlanId: string;
  onSelectPricePlan: (pricePlanId: string) => void;
  priceStartsOn: string;
  onPriceStartsOnChange: (value: string) => void;
  busy: boolean;
  beginCreationDisabled: boolean;
  onBeginCreation: () => void;
}) {
  return (
    <>
      <label className="grid gap-2">
        <span className="text-sm font-bold">Tarifa mensual</span>
        <select
          value={selectedPricePlanId}
          onChange={(event) => onSelectPricePlan(event.target.value)}
          disabled={busy}
          className={fieldClassName}
          required
        >
          <option value="">Selecciona una tarifa</option>
          {pricePlans.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.name} ·{" "}
              {formatMoney(plan.amountCents, plan.currency)}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-2">
        <span className="text-sm font-bold">Vigente desde</span>
        <input
          type="date"
          value={priceStartsOn}
          onChange={(event) => onPriceStartsOnChange(event.target.value)}
          disabled={busy}
          required
          className={fieldClassName}
        />
      </label>
      <button
        type="button"
        onClick={onBeginCreation}
        disabled={beginCreationDisabled}
        className={`${secondaryButtonClassName} w-fit sm:col-span-2`}
      >
        Crear otra tarifa mensual
      </button>
    </>
  );
}

/** Price plans and classes could not be verified: retry before creating one. */
export function MonthlyPricePlanOptionsRetry({
  disabled,
  onRetry,
}: {
  disabled: boolean;
  onRetry: () => void;
}) {
  return (
    <div className="grid gap-3 sm:col-span-2">
      <p className="text-sm leading-6 text-z-soft">
        No se pudieron comprobar las tarifas y clases activas de esta
        sede. Reintenta antes de crear una nueva.
      </p>
      <button
        type="button"
        onClick={onRetry}
        disabled={disabled}
        className={`${secondaryButtonClassName} w-fit`}
      >
        Reintentar cargar tarifas
      </button>
    </div>
  );
}

/** New monthly price plan with explicit class coverage and validity dates. */
export function MonthlyPricePlanCreateForm({
  hasExistingPricePlans,
  onReturnToSelector,
  formDisabled,
  draft,
  onDraftChange,
  defaultCurrency,
  classTemplates,
  classTemplatesPartial,
  createDisabled,
  busy,
  onCreate,
}: {
  hasExistingPricePlans: boolean;
  onReturnToSelector: () => void;
  formDisabled: boolean;
  draft: PricePlanDraft;
  onDraftChange: (updates: Partial<Omit<PricePlanDraft, "scopeKey">>) => void;
  defaultCurrency: string;
  classTemplates: ClassTemplateOption[];
  /** More than 100 active classes exist: the list is partial. */
  classTemplatesPartial: boolean;
  createDisabled: boolean;
  busy: boolean;
  onCreate: () => void;
}) {
  return (
    <div className="grid gap-4 sm:col-span-2">
      {hasExistingPricePlans && (
        <button
          type="button"
          onClick={onReturnToSelector}
          disabled={formDisabled}
          className={`${secondaryButtonClassName} w-fit`}
        >
          Volver al selector de tarifas
        </button>
      )}
      <p className="text-sm leading-6 text-z-soft">
        {hasExistingPricePlans
          ? "Crea una tarifa adicional para esta sede y selecciona explícitamente las clases que cubrirá. La tarifa actual no se modificará."
          : "No hay tarifas mensuales para esta sede. Crea una para poder asignarla a la inscripción y selecciona las clases que cubrirá."}
      </p>
      <label className="grid gap-2">
        <span className="text-sm font-bold">Nombre de la tarifa</span>
        <input
          value={draft.name}
          onChange={(event) =>
            onDraftChange({ name: event.target.value })
          }
          maxLength={100}
          disabled={formDisabled}
          required
          className={fieldClassName}
        />
      </label>
      <div className="grid max-w-md gap-2">
        <label
          htmlFor="monthly-price-plan-amount"
          className="text-sm font-bold"
        >
          Importe mensual ({defaultCurrency})
        </label>
        <input
          id="monthly-price-plan-amount"
          type="text"
          inputMode="decimal"
          value={draft.amount}
          onChange={(event) =>
            onDraftChange({ amount: event.target.value })
          }
          placeholder="35,00"
          disabled={formDisabled}
          required
          aria-describedby="monthly-price-plan-amount-help"
          className={fieldClassName}
        />
        <p
          id="monthly-price-plan-amount-help"
          className="text-xs text-z-soft"
        >
          Se usará {defaultCurrency}, la moneda de la academia. Puedes
          usar coma o punto decimal; la tarifa será mensual.
        </p>
      </div>
      <fieldset
        aria-describedby="monthly-price-plan-coverage-help"
        className="grid gap-3 rounded-card border border-chalk-line p-4"
      >
        <legend className="px-1 text-sm font-bold">
          Clases cubiertas
        </legend>
        <p
          id="monthly-price-plan-coverage-help"
          className="text-sm leading-6 text-z-soft"
        >
          Marca cada clase activa a la que se aplicará esta tarifa. No
          se incluirán otras clases automáticamente.
        </p>
        {classTemplates.length === 0 ? (
          <p role="status" className="text-sm text-z-soft">
            No hay clases activas disponibles en esta sede. No se puede
            crear una tarifa sin cobertura explícita.
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {classTemplates.map((classTemplate) => {
              const checkboxId = `monthly-price-plan-class-${classTemplate.id}`;

              return (
                <li key={classTemplate.id}>
                  <label
                    htmlFor={checkboxId}
                    className="flex min-h-11 items-center gap-3 rounded-card border border-chalk-line px-3 py-2 text-sm font-medium text-z-ink focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-z-brand-500 has-[:checked]:border-mat has-[:checked]:bg-mat-wash"
                  >
                    <input
                      id={checkboxId}
                      type="checkbox"
                      checked={draft.classTemplateIds.includes(
                        classTemplate.id
                      )}
                      onChange={(event) => {
                        onDraftChange({
                          classTemplateIds: event.target.checked
                            ? [...new Set([
                                ...draft.classTemplateIds,
                                classTemplate.id,
                              ])]
                            : draft.classTemplateIds.filter(
                                (id) => id !== classTemplate.id
                              ),
                        });
                      }}
                      disabled={formDisabled}
                      className="size-5 shrink-0 accent-z-brand-500"
                    />
                    <span className="min-w-0">
                      {classTemplate.name}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        {classTemplatesPartial && (
          <p role="status" className="text-sm leading-6 text-ochre-ink">
            Hay más de 100 clases activas. La lista es parcial; solo se
            cubrirán las clases que marques aquí.
          </p>
        )}
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <label
          htmlFor="monthly-price-plan-coverage-starts"
          className="grid gap-2"
        >
          <span className="text-sm font-bold">Vigente desde</span>
          <input
            id="monthly-price-plan-coverage-starts"
            type="date"
            value={draft.coverageStartsOn}
            onChange={(event) =>
              onDraftChange({
                coverageStartsOn: event.target.value,
              })
            }
            disabled={formDisabled}
            required
            className={fieldClassName}
          />
        </label>
        <label className="flex min-h-11 items-center gap-3 text-sm font-medium text-z-ink">
          <input
            type="checkbox"
            checked={draft.coverageHasNoEnd}
            onChange={(event) =>
              onDraftChange({
                coverageHasNoEnd: event.target.checked,
              })
            }
            disabled={formDisabled}
            className="size-5 shrink-0 accent-z-brand-500"
          />
          <span>Sin fecha de fin</span>
        </label>
        {!draft.coverageHasNoEnd && (
          <label
            htmlFor="monthly-price-plan-coverage-ends"
            className="grid gap-2 sm:col-span-2"
          >
            <span className="text-sm font-bold">Vigente hasta</span>
            <input
              id="monthly-price-plan-coverage-ends"
              type="date"
              value={draft.coverageEndsOn}
              onChange={(event) =>
                onDraftChange({
                  coverageEndsOn: event.target.value,
                })
              }
              disabled={formDisabled}
              required
              aria-describedby="monthly-price-plan-coverage-dates-help"
              className={fieldClassName}
            />
            <span
              id="monthly-price-plan-coverage-dates-help"
              className="text-xs text-z-soft"
            >
              La fecha de fin debe ser igual o posterior al inicio.
            </span>
          </label>
        )}
      </div>
      <button
        type="button"
        onClick={onCreate}
        disabled={createDisabled}
        className={`${primaryButtonClassName} w-fit`}
      >
        {busy ? "Guardando…" : "Crear tarifa mensual"}
      </button>
    </div>
  );
}

"use client";

import {
  displayName,
  fieldClassName,
  type FamilyAssociationOption,
  type PayerRelationship,
  type ResolutionAction,
} from "./owner-monthly-resolution-model";

type FamilyPayer = FamilyAssociationOption["payers"][number];

/**
 * Family, athletes, adult payer and effective date for family and payer
 * actions. Every change that affects the payer drops the primary-payer
 * confirmation in the panel.
 */
export function MonthlyResolutionFamilyFields({
  action,
  families,
  selectedFamilyId,
  onSelectFamily,
  selectedFamily,
  athleteIds,
  onToggleAthlete,
  selectedPayerId,
  onSelectPayer,
  selectedFamilyPayer,
  givenName,
  onGivenNameChange,
  familyName,
  onFamilyNameChange,
  relationship,
  onRelationshipChange,
  primaryPayerWillChange,
  primaryPayerChangeConfirmed,
  onPrimaryPayerChangeConfirmed,
  effectiveFrom,
  onEffectiveFromChange,
  busy,
}: {
  action: Exclude<ResolutionAction, { kind: "tariff" }>;
  families: FamilyAssociationOption[];
  selectedFamilyId: string;
  onSelectFamily: (familyId: string) => void;
  selectedFamily: FamilyAssociationOption | undefined;
  athleteIds: string[];
  onToggleAthlete: (athleteId: string, checked: boolean) => void;
  selectedPayerId: string;
  onSelectPayer: (familyPayerId: string) => void;
  selectedFamilyPayer: FamilyPayer | undefined;
  givenName: string;
  onGivenNameChange: (value: string) => void;
  familyName: string;
  onFamilyNameChange: (value: string) => void;
  relationship: PayerRelationship;
  onRelationshipChange: (value: PayerRelationship) => void;
  primaryPayerWillChange: boolean;
  primaryPayerChangeConfirmed: boolean;
  onPrimaryPayerChangeConfirmed: (confirmed: boolean) => void;
  effectiveFrom: string;
  onEffectiveFromChange: (value: string) => void;
  busy: boolean;
}) {
  return (
    <div className="grid gap-4">
      {action.kind === "family" ? (
        <label className="grid gap-2">
          <span className="text-sm font-bold">Familia</span>
          <select
            value={selectedFamilyId}
            onChange={(event) => onSelectFamily(event.target.value)}
            disabled={busy}
            className={fieldClassName}
          >
            <option value="">Crear una familia nueva</option>
            {families.map((family) => (
              <option key={family.familyId} value={family.familyId}>
                {family.athletes.length
                  ? family.athletes
                      .map((athlete) =>
                        displayName(
                          athlete.athleteName,
                          "Gimnasta sin nombre"
                        )
                      )
                      .join(", ")
                  : "Familia sin gimnastas asociadas"}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="text-sm font-semibold">
          Familia:{" "}
          {selectedFamily?.athletes
            .map((athlete) =>
              displayName(athlete.athleteName, "Gimnasta sin nombre")
            )
            .join(", ") || "Familia seleccionada"}
        </p>
      )}

      {action.kind === "payer" &&
        families
          .find((family) => family.familyId === action.familyId)
          ?.athletes.map((athlete) => (
            <label
              key={athlete.athleteId}
              className="flex min-h-11 items-center gap-3 text-sm"
            >
              <input
                type="checkbox"
                checked={athleteIds.includes(athlete.athleteId)}
                onChange={(event) => onToggleAthlete(athlete.athleteId, event.target.checked)}
                disabled={busy}
                className="h-5 w-5 accent-z-brand-500"
              />
              {displayName(athlete.athleteName, "Gimnasta sin nombre")}
            </label>
          ))}

      {selectedFamily?.payers.length ? (
        <label className="grid gap-2">
          <span className="text-sm font-bold">Persona pagadora</span>
          <select
            value={selectedPayerId}
            onChange={(event) => onSelectPayer(event.target.value)}
            disabled={busy}
            className={fieldClassName}
          >
            <option value="">Añadir persona adulta nueva</option>
            {selectedFamily.payers.map((payer) => (
              <option key={payer.familyPayerId} value={payer.familyPayerId}>
                {displayName(
                  payer.displayName,
                  "Persona pagadora sin nombre"
                )}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {!selectedFamilyPayer && (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2">
            <span className="text-sm font-bold">
              Nombre de la persona adulta
            </span>
            <input
              value={givenName}
              onChange={(event) => onGivenNameChange(event.target.value)}
              disabled={busy}
              required
              maxLength={100}
              className={fieldClassName}
            />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-bold">Apellidos</span>
            <input
              value={familyName}
              onChange={(event) => onFamilyNameChange(event.target.value)}
              disabled={busy}
              required
              maxLength={100}
              className={fieldClassName}
            />
          </label>
          <label className="grid gap-2 sm:col-span-2">
            <span className="text-sm font-bold">
              Relación con la gimnasta
            </span>
            <select
              value={relationship}
              onChange={(event) => onRelationshipChange(event.target.value as PayerRelationship)}
              disabled={busy}
              className={fieldClassName}
            >
              <option value="parent">Madre o padre</option>
              <option value="legal_guardian">Tutor/a legal</option>
              <option value="foster_guardian">Acogedor/a</option>
              <option value="other">Otra relación autorizada</option>
            </select>
          </label>
        </div>
      )}

      {primaryPayerWillChange && (
        <label className="rounded-[12px] flex min-h-11 items-start gap-3 border border-amber-400 bg-amber-50 p-3 text-sm text-amber-950">
          <input
            type="checkbox"
            checked={primaryPayerChangeConfirmed}
            onChange={(event) => onPrimaryPayerChangeConfirmed(event.target.checked)}
            disabled={busy}
            className="mt-1 h-5 w-5 accent-z-brand-500"
          />
          Confirmo que esta operación cambiará el pagador principal de toda la familia.
        </label>
      )}

      <label className="grid max-w-md gap-2">
        <span className="text-sm font-bold">Fecha efectiva</span>
        <input
          type="date"
          value={effectiveFrom}
          onChange={(event) => onEffectiveFromChange(event.target.value)}
          disabled={busy}
          required
          className={fieldClassName}
          aria-describedby="family-association-effective-help"
        />
        <span
          id="family-association-effective-help"
          className="text-xs text-z-soft"
        >
          La fecha sugerida es el primer día del periodo; se usará para
          comprobar la cobertura mensual. Confírmala o ajústala antes de
          guardar.
        </span>
      </label>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { usePendingCommandExitWarning } from "./use-pending-command-exit-warning";
import {
  readPendingOwnerAthleteProfile,
  type PendingOwnerAthleteProfileUpdate,
} from "./OwnerAthleteProfileEditor";
import {
  readPendingOwnerAthleteFamilyAssociation,
  type PendingOwnerAthleteFamilyAssociation,
} from "./OwnerAthleteFamilyAssociationEditor";
import {
  readPendingOwnerAthleteArchive,
  type OwnerAthleteArchiveReceipt,
  type PendingOwnerAthleteArchive,
} from "./OwnerAthleteArchiveEditor";

/**
 * Pending athlete profile edit restored from sessionStorage, plus the editor
 * that currently holds the profile mutex. Extracted from OwnerGroupsManager.
 */
export function useOwnerAthleteProfileRecovery(organizationId: string) {
  const [profileRecoveryLoadedFor, setProfileRecoveryLoadedFor] = useState<string | null>(null);
  const [profileRecoveryIssue, setProfileRecoveryIssue] = useState<string | null>(null);
  const [pendingAthleteProfile, setPendingAthleteProfile] = useState<PendingOwnerAthleteProfileUpdate | null>(null);
  const [activeAthleteProfileKey, setActiveAthleteProfileKey] = useState<string | null>(null);
  const profilePendingRef = useRef<PendingOwnerAthleteProfileUpdate | null>(null);
  const activeAthleteProfileKeyRef = useRef<string | null>(null);
  const [profileRecoveryAttempt, setProfileRecoveryAttempt] = useState(0);
  usePendingCommandExitWarning(pendingAthleteProfile !== null, profilePendingRef);
  const profileRecoveryReady = profileRecoveryLoadedFor === organizationId;
  const profileRecoveryBlocked = !profileRecoveryReady || profileRecoveryIssue !== null || pendingAthleteProfile !== null || activeAthleteProfileKey !== null;

  function updateActiveAthleteProfile(key: string, active: boolean) {
    if (active) {
      activeAthleteProfileKeyRef.current = key;
      setActiveAthleteProfileKey(key);
    } else if (activeAthleteProfileKeyRef.current === key) {
      activeAthleteProfileKeyRef.current = null;
      setActiveAthleteProfileKey(null);
    }
  }

  function updatePendingAthleteProfile(command: PendingOwnerAthleteProfileUpdate | null) {
    if (command) {
      const current = readPendingOwnerAthleteProfile();
      if (current.kind !== "pending" || current.command.idempotencyKey !== command.idempotencyKey || current.command.body !== command.body) {
        setProfileRecoveryIssue(current.kind === "invalid"
          ? "La operación de ficha pendiente está dañada. No se permitirán cambios hasta poder recuperar su estado."
          : "No se pudo confirmar la clave de ficha guardada. No se permitirán cambios hasta verificar la operación pendiente.");
        setProfileRecoveryLoadedFor(organizationId);
        return;
      }
      profilePendingRef.current = current.command;
      setPendingAthleteProfile(current.command);
      setProfileRecoveryIssue(null);
      setProfileRecoveryLoadedFor(organizationId);
      return;
    }
    const current = readPendingOwnerAthleteProfile();
    if (current.kind === "none") {
      profilePendingRef.current = null;
      setPendingAthleteProfile(null);
      setProfileRecoveryIssue(null);
      setProfileRecoveryLoadedFor(organizationId);
    } else if (current.kind === "pending") {
      profilePendingRef.current = current.command;
      setPendingAthleteProfile(current.command);
      setProfileRecoveryIssue(null);
      setProfileRecoveryLoadedFor(organizationId);
    } else {
      setProfileRecoveryIssue(current.kind === "invalid"
        ? "La operación de ficha pendiente está dañada. No se permitirán cambios hasta poder recuperar su estado."
        : "No se pudo comprobar el almacenamiento de la sesión. No se permitirán cambios hasta verificar la operación pendiente.");
      setProfileRecoveryLoadedFor(organizationId);
    }
  }

  useEffect(() => {
    const result = readPendingOwnerAthleteProfile();
    if (result.kind === "pending") {
      profilePendingRef.current = result.command;
      setPendingAthleteProfile(result.command);
      setProfileRecoveryIssue(null);
    } else if (result.kind === "none") {
      profilePendingRef.current = null;
      setPendingAthleteProfile(null);
      setProfileRecoveryIssue(null);
    } else {
      profilePendingRef.current = null;
      setPendingAthleteProfile(null);
      setProfileRecoveryIssue(result.kind === "invalid"
        ? "La operación de ficha pendiente está dañada. No se permitirán cambios hasta poder recuperar su estado."
        : "No se pudo comprobar el almacenamiento de la sesión. No se permitirán cambios hasta verificar la operación pendiente.");
    }
    setProfileRecoveryLoadedFor(organizationId);
  }, [organizationId, profileRecoveryAttempt]);

  return {
    profileRecoveryIssue,
    pendingAthleteProfile,
    activeAthleteProfileKey,
    profilePendingRef,
    activeAthleteProfileKeyRef,
    setProfileRecoveryAttempt,
    profileRecoveryReady,
    profileRecoveryBlocked,
    updateActiveAthleteProfile,
    updatePendingAthleteProfile,
  };
}

/** Pending family association restored from sessionStorage and its editor mutex. */
export function useOwnerAthleteFamilyAssociationRecovery(organizationId: string) {
  const [familyRecoveryLoadedFor, setFamilyRecoveryLoadedFor] = useState<string | null>(null);
  const [familyRecoveryIssue, setFamilyRecoveryIssue] = useState<string | null>(null);
  const [pendingAthleteFamilyAssociation, setPendingAthleteFamilyAssociation] = useState<PendingOwnerAthleteFamilyAssociation | null>(null);
  const [activeAthleteFamilyAssociationKey, setActiveAthleteFamilyAssociationKey] = useState<string | null>(null);
  const familyPendingRef = useRef<PendingOwnerAthleteFamilyAssociation | null>(null);
  const activeAthleteFamilyAssociationKeyRef = useRef<string | null>(null);
  const [familyRecoveryAttempt, setFamilyRecoveryAttempt] = useState(0);
  usePendingCommandExitWarning(pendingAthleteFamilyAssociation !== null, familyPendingRef);
  const familyRecoveryReady = familyRecoveryLoadedFor === organizationId;
  const familyRecoveryBlocked = !familyRecoveryReady || familyRecoveryIssue !== null || pendingAthleteFamilyAssociation !== null || activeAthleteFamilyAssociationKey !== null;

  function updateActiveAthleteFamilyAssociation(key: string, active: boolean) {
    if (active) {
      activeAthleteFamilyAssociationKeyRef.current = key;
      setActiveAthleteFamilyAssociationKey(key);
    } else if (activeAthleteFamilyAssociationKeyRef.current === key) {
      activeAthleteFamilyAssociationKeyRef.current = null;
      setActiveAthleteFamilyAssociationKey(null);
    }
  }

  function updatePendingAthleteFamilyAssociation(command: PendingOwnerAthleteFamilyAssociation | null) {
    if (command) {
      familyPendingRef.current = command;
      setPendingAthleteFamilyAssociation(command);
      const current = readPendingOwnerAthleteFamilyAssociation();
      if (current.kind !== "pending" ||
        current.command.idempotencyKey !== command.idempotencyKey ||
        current.command.body !== command.body) {
        setFamilyRecoveryIssue(current.kind === "invalid"
          ? "La asociación familiar pendiente está dañada. No se permitirán cambios hasta recuperar su estado."
          : "No se pudo confirmar el cuerpo y la clave guardados de la asociación familiar. No se permitirán cambios hasta comprobar la operación.");
        setFamilyRecoveryLoadedFor(organizationId);
        return;
      }
      familyPendingRef.current = current.command;
      setPendingAthleteFamilyAssociation(current.command);
      setFamilyRecoveryIssue(null);
      setFamilyRecoveryLoadedFor(organizationId);
      return;
    }

    const current = readPendingOwnerAthleteFamilyAssociation();
    if (current.kind === "none") {
      familyPendingRef.current = null;
      setPendingAthleteFamilyAssociation(null);
      setFamilyRecoveryIssue(null);
      setFamilyRecoveryLoadedFor(organizationId);
    } else if (current.kind === "pending") {
      familyPendingRef.current = current.command;
      setPendingAthleteFamilyAssociation(current.command);
      setFamilyRecoveryIssue(null);
      setFamilyRecoveryLoadedFor(organizationId);
    } else {
      setFamilyRecoveryIssue(current.kind === "invalid"
        ? "La asociación familiar pendiente está dañada. No se permitirán cambios hasta recuperar su estado."
        : "No se pudo comprobar el almacenamiento de esta sesión. No se permitirán cambios hasta verificar la asociación pendiente.");
      setFamilyRecoveryLoadedFor(organizationId);
    }
  }

  useEffect(() => {
    const result = readPendingOwnerAthleteFamilyAssociation();
    if (result.kind === "pending") {
      familyPendingRef.current = result.command;
      setPendingAthleteFamilyAssociation(result.command);
      setFamilyRecoveryIssue(null);
    } else if (result.kind === "none") {
      familyPendingRef.current = null;
      setPendingAthleteFamilyAssociation(null);
      setFamilyRecoveryIssue(null);
    } else {
      familyPendingRef.current = null;
      setPendingAthleteFamilyAssociation(null);
      setFamilyRecoveryIssue(result.kind === "invalid"
        ? "La asociación familiar pendiente está dañada. No se permitirán cambios hasta recuperar su estado."
        : "No se pudo comprobar el almacenamiento de esta sesión. No se permitirán cambios hasta verificar la asociación pendiente.");
    }
    setFamilyRecoveryLoadedFor(organizationId);
  }, [organizationId, familyRecoveryAttempt]);

  return {
    familyRecoveryIssue,
    pendingAthleteFamilyAssociation,
    activeAthleteFamilyAssociationKey,
    familyPendingRef,
    activeAthleteFamilyAssociationKeyRef,
    setFamilyRecoveryAttempt,
    familyRecoveryReady,
    familyRecoveryBlocked,
    updateActiveAthleteFamilyAssociation,
    updatePendingAthleteFamilyAssociation,
  };
}

/** Pending athlete archive restored from sessionStorage and its editor mutex. */
export function useOwnerAthleteArchiveRecovery(organizationId: string) {
  const router = useRouter();
  const [archiveRecoveryLoadedFor, setArchiveRecoveryLoadedFor] = useState<string | null>(null);
  const [archiveRecoveryIssue, setArchiveRecoveryIssue] = useState<string | null>(null);
  const [pendingAthleteArchive, setPendingAthleteArchive] = useState<PendingOwnerAthleteArchive | null>(null);
  const [activeAthleteArchiveKey, setActiveAthleteArchiveKey] = useState<string | null>(null);
  const archivePendingRef = useRef<PendingOwnerAthleteArchive | null>(null);
  const activeAthleteArchiveKeyRef = useRef<string | null>(null);
  const [archiveRecoveryAttempt, setArchiveRecoveryAttempt] = useState(0);
  usePendingCommandExitWarning(pendingAthleteArchive !== null, archivePendingRef);
  const archiveRecoveryLoaded = archiveRecoveryLoadedFor === organizationId;
  const archiveRecoveryReady = archiveRecoveryLoaded && archiveRecoveryIssue === null;
  const archiveRecoveryBlocked = !archiveRecoveryReady || pendingAthleteArchive !== null || activeAthleteArchiveKey !== null;

  function updateActiveAthleteArchive(key: string, active: boolean) {
    if (active) {
      activeAthleteArchiveKeyRef.current = key;
      setActiveAthleteArchiveKey(key);
    } else if (activeAthleteArchiveKeyRef.current === key) {
      activeAthleteArchiveKeyRef.current = null;
      setActiveAthleteArchiveKey(null);
    }
  }

  function updatePendingAthleteArchive(command: PendingOwnerAthleteArchive | null) {
    if (command) {
      const current = readPendingOwnerAthleteArchive();
      if (current.kind !== "pending" ||
        current.command.organizationId !== command.organizationId ||
        current.command.locationId !== command.locationId ||
        current.command.groupId !== command.groupId ||
        current.command.idempotencyKey !== command.idempotencyKey ||
        current.command.body !== command.body ||
        current.command.athleteId !== command.athleteId) {
        setArchiveRecoveryIssue(current.kind === "invalid"
          ? "La operación de archivo pendiente está dañada. No iniciaremos otro archivo hasta poder recuperar su estado."
          : "No se pudo verificar la operación de archivo guardada. No iniciaremos otra escritura hasta confirmar su estado.");
        setArchiveRecoveryLoadedFor(organizationId);
        return;
      }
      archivePendingRef.current = current.command;
      setPendingAthleteArchive(current.command);
      setArchiveRecoveryIssue(null);
      setArchiveRecoveryLoadedFor(organizationId);
      return;
    }

    const current = readPendingOwnerAthleteArchive();
    if (current.kind === "none") {
      archivePendingRef.current = null;
      setPendingAthleteArchive(null);
      setArchiveRecoveryIssue(null);
      setArchiveRecoveryLoadedFor(organizationId);
    } else if (current.kind === "pending") {
      archivePendingRef.current = current.command;
      setPendingAthleteArchive(current.command);
      setArchiveRecoveryIssue(null);
      setArchiveRecoveryLoadedFor(organizationId);
    } else {
      setArchiveRecoveryIssue(current.kind === "invalid"
        ? "La operación de archivo pendiente está dañada. No iniciaremos otro archivo hasta poder recuperar su estado."
        : "No se pudo comprobar el almacenamiento de esta sesión. No iniciaremos otra escritura hasta verificar el archivo pendiente.");
      setArchiveRecoveryLoadedFor(organizationId);
    }
  }

  useEffect(() => {
    const result = readPendingOwnerAthleteArchive();
    if (result.kind === "pending") {
      archivePendingRef.current = result.command;
      setPendingAthleteArchive(result.command);
      setArchiveRecoveryIssue(null);
    } else if (result.kind === "none") {
      archivePendingRef.current = null;
      setPendingAthleteArchive(null);
      setArchiveRecoveryIssue(null);
    } else {
      archivePendingRef.current = null;
      setPendingAthleteArchive(null);
      setArchiveRecoveryIssue(result.kind === "invalid"
        ? "La operación de archivo pendiente está dañada. No iniciaremos otro archivo hasta poder recuperar su estado."
        : "No se pudo comprobar el almacenamiento de esta sesión. No iniciaremos otra escritura hasta verificar el archivo pendiente.");
    }
    setArchiveRecoveryLoadedFor(organizationId);
  }, [organizationId, archiveRecoveryAttempt]);

  function athleteArchiveMutationBlocked() {
    return !archiveRecoveryReady || archiveRecoveryIssue !== null ||
      archivePendingRef.current !== null || activeAthleteArchiveKeyRef.current !== null;
  }

  function refreshAfterAthleteArchive(receipt: OwnerAthleteArchiveReceipt, expectedAthleteId: string) {
    const current = readPendingOwnerAthleteArchive();
    if (current.kind !== "none") {
      setArchiveRecoveryIssue(current.kind === "invalid"
        ? "La ficha se archivó, pero el marcador local no se pudo limpiar. No iniciaremos otros cambios hasta resolverlo."
        : "La ficha se archivó, pero no se pudo confirmar la limpieza del marcador. No iniciaremos otros cambios hasta verificarlo.");
      setArchiveRecoveryLoadedFor(organizationId);
      return;
    }
    if (receipt.athleteId !== expectedAthleteId ||
      (pendingAthleteArchive !== null && pendingAthleteArchive.athleteId !== receipt.athleteId)) {
      setArchiveRecoveryIssue("El recibo de archivo no coincide con la ficha pendiente. No iniciaremos otros cambios hasta resolverlo.");
      setArchiveRecoveryLoadedFor(organizationId);
      return;
    }
    archivePendingRef.current = null;
    setPendingAthleteArchive(null);
    setArchiveRecoveryIssue(null);
    setArchiveRecoveryLoadedFor(organizationId);
    window.dispatchEvent(new Event("zaltyko:plan-usage-changed"));
    router.refresh();
  }

  return {
    archiveRecoveryIssue,
    pendingAthleteArchive,
    activeAthleteArchiveKey,
    archivePendingRef,
    activeAthleteArchiveKeyRef,
    setArchiveRecoveryAttempt,
    archiveRecoveryLoaded,
    archiveRecoveryReady,
    archiveRecoveryBlocked,
    updateActiveAthleteArchive,
    updatePendingAthleteArchive,
    athleteArchiveMutationBlocked,
    refreshAfterAthleteArchive,
  };
}

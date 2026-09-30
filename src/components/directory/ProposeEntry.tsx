"use client";
import { useState } from "react";
import { EntryEditor, directoryFetch, inputClass } from "./EntryEditor";
import type { DirectoryKind } from "@/lib/directory/contracts";
export function ProposeEntry() {
  const [kind, setKind] = useState<DirectoryKind>("academy"),
    [message, setMessage] = useState("");
  return (
    <div className="space-y-5">
      <label>
        Tipo de ficha
        <select
          className={inputClass}
          value={kind}
          onChange={(e) => setKind(e.target.value as DirectoryKind)}
        >
          <option value="academy">Academia</option>
          <option value="event">Evento</option>
          <option value="organization">Organización</option>
        </select>
      </label>
      <EntryEditor
        key={kind}
        kind={kind}
        onSave={async (data) => {
          await directoryFetch("/api/directory/proposals", {
            kind: "proposal",
            entry: { kind, data },
          });
          setMessage(
            "Propuesta registrada para revisión. No se publica automáticamente."
          );
        }}
      />
      <p role="status">{message}</p>
    </div>
  );
}

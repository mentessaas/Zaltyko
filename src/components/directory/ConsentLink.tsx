"use client";
import { useState } from "react";
import { directoryFetch, buttonClass } from "./EntryEditor";
export function ConsentLink({
  id,
  token,
  withdraw = false,
}: {
  id: string;
  token: string;
  withdraw?: boolean;
}) {
  const [message, setMessage] = useState(""),
    [done, setDone] = useState(false);
  return (
    <div className="space-y-4">
      <p>
        {withdraw
          ? "Confirma para cancelar esta finalidad. No necesitas iniciar sesión."
          : "Confirma solo si solicitaste esta comunicación. No autoriza otras finalidades."}
      </p>
      <button
        className={buttonClass}
        disabled={done}
        onClick={async () => {
          try {
            await directoryFetch(
              `/api/directory/subscriptions/${withdraw ? "withdraw" : "confirm"}`,
              { id, token }
            );
            setDone(true);
            setMessage(
              withdraw
                ? "Solicitud cancelada. No recibirás más envíos de esta finalidad."
                : "Solicitud confirmada."
            );
          } catch (err) {
            setMessage(err instanceof Error ? err.message : "Enlace no válido");
          }
        }}
      >
        {withdraw ? "Darme de baja" : "Confirmar mi solicitud"}
      </button>
      <p role="status">{message}</p>
    </div>
  );
}

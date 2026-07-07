"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Loader2 } from "lucide-react";

import { useToast } from "@/components/ui/toast-provider";

const ROLES = ["owner", "admin", "coach", "athlete", "parent", "super_admin"] as const;

export function SuperAdminCreateUserDialog() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<(typeof ROLES)[number]>("owner");

  function reset() {
    setEmail("");
    setPassword("");
    setName("");
    setRole("owner");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/super-admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password, name: name || undefined, role }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.pushToast({ title: "No se pudo crear", description: json?.message ?? "Error", variant: "error" });
        return;
      }
      toast.pushToast({ title: "Usuario creado", description: email, variant: "success" });
      setOpen(false);
      reset();
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
      >
        <UserPlus className="h-4 w-4" strokeWidth={1.8} />
        Crear usuario
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => !submitting && setOpen(false)}>
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSubmit}
            className="w-full max-w-md space-y-4 rounded-2xl border border-white/10 bg-[#0f1729] p-6 shadow-xl"
          >
            <h3 className="text-lg font-semibold text-white">Crear usuario</h3>

            <label className="block text-sm text-white/70">
              Email
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-white focus:border-white/40 focus:outline-none"
                placeholder="dueno@academia.com"
              />
            </label>

            <label className="block text-sm text-white/70">
              Contraseña (mín. 8)
              <input
                type="text"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-white focus:border-white/40 focus:outline-none"
                placeholder="contraseña temporal"
              />
            </label>

            <label className="block text-sm text-white/70">
              Nombre (opcional)
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-white focus:border-white/40 focus:outline-none"
              />
            </label>

            <label className="block text-sm text-white/70">
              Rol
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as (typeof ROLES)[number])}
                className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-white focus:border-white/40 focus:outline-none"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r} className="bg-[#0f1729]">
                    {r}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-4 py-2 text-sm text-white/70 hover:text-white">
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Crear
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Loader2 } from "lucide-react";

import { useToast } from "@/components/ui/toast-provider";

const ACADEMY_TYPES = [
  { value: "artistica", label: "Gimnasia artística" },
  { value: "ritmica", label: "Gimnasia rítmica" },
  { value: "general", label: "General" },
] as const;

export function SuperAdminCreateAcademyDialog() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    academyName: "",
    academyType: "artistica",
    country: "",
    region: "",
    city: "",
    ownerEmail: "",
    ownerPassword: "",
    ownerName: "",
  });

  function set(k: keyof typeof form, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/super-admin/academies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          academyName: form.academyName,
          academyType: form.academyType,
          country: form.country || undefined,
          region: form.region || undefined,
          city: form.city || undefined,
          ownerEmail: form.ownerEmail,
          ownerPassword: form.ownerPassword,
          ownerName: form.ownerName || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.pushToast({ title: "No se pudo crear", description: json?.message ?? "Error", variant: "error" });
        return;
      }
      toast.pushToast({ title: "Academia creada", description: form.academyName, variant: "success" });
      setOpen(false);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  const inputCls =
    "mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-white focus:border-white/40 focus:outline-none";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"
      >
        <Building2 className="h-4 w-4" strokeWidth={1.8} />
        Crear academia
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto" onClick={() => !submitting && setOpen(false)}>
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSubmit}
            className="my-8 w-full max-w-lg space-y-4 rounded-2xl border border-white/10 bg-[#0f1729] p-6 shadow-xl"
          >
            <h3 className="text-lg font-semibold text-white">Crear academia + dueño</h3>

            <label className="block text-sm text-white/70">
              Nombre de la academia
              <input required minLength={3} value={form.academyName} onChange={(e) => set("academyName", e.target.value)} className={inputCls} />
            </label>

            <label className="block text-sm text-white/70">
              Tipo
              <select value={form.academyType} onChange={(e) => set("academyType", e.target.value)} className={inputCls}>
                {ACADEMY_TYPES.map((t) => (
                  <option key={t.value} value={t.value} className="bg-[#0f1729]">
                    {t.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm text-white/70">
                País
                <input value={form.country} onChange={(e) => set("country", e.target.value)} className={inputCls} placeholder="España" />
              </label>
              <label className="block text-sm text-white/70">
                Provincia/Región
                <input value={form.region} onChange={(e) => set("region", e.target.value)} className={inputCls} />
              </label>
            </div>

            <label className="block text-sm text-white/70">
              Ciudad
              <input value={form.city} onChange={(e) => set("city", e.target.value)} className={inputCls} />
            </label>

            <div className="border-t border-white/10 pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-white/40">Cuenta del dueño</p>
            </div>

            <label className="block text-sm text-white/70">
              Email del dueño
              <input type="email" required value={form.ownerEmail} onChange={(e) => set("ownerEmail", e.target.value)} className={inputCls} />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm text-white/70">
                Contraseña (mín. 8)
                <input type="text" required minLength={8} value={form.ownerPassword} onChange={(e) => set("ownerPassword", e.target.value)} className={inputCls} />
              </label>
              <label className="block text-sm text-white/70">
                Nombre del dueño
                <input value={form.ownerName} onChange={(e) => set("ownerName", e.target.value)} className={inputCls} />
              </label>
            </div>

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
                Crear academia
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

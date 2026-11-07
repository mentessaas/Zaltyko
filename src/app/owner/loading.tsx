export default function OwnerDashboardLoading() {
  return (
    <main
      className="min-h-screen bg-z-canvas px-5 py-12 text-z-ink"
      aria-busy="true"
    >
      <div className="mx-auto max-w-[92rem] animate-pulse motion-reduce:animate-none">
        <p className="text-sm font-semibold text-z-soft">
          Preparando la mesa de dirección…
        </p>
        <div className="mt-6 h-16 max-w-xl bg-slate-300" />
        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          <div className="h-72 bg-white lg:col-span-1" />
          <div className="h-72 bg-white lg:col-span-2" />
        </div>
      </div>
    </main>
  );
}

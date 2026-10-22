export default function OwnerAtAGlanceLoading() {
  return (
    <main
      aria-busy="true"
      aria-live="polite"
      className="mx-auto flex max-w-5xl flex-col gap-6 p-4 sm:p-6"
    >
      <div className="h-7 w-64 animate-pulse rounded bg-muted dark:bg-slate-800" />
      <div className="h-24 w-full animate-pulse rounded-2xl bg-amber-100/60 dark:bg-amber-900/20" />
      <div className="h-48 w-full animate-pulse rounded-2xl bg-muted dark:bg-slate-800" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-32 animate-pulse rounded-2xl bg-muted dark:bg-slate-800"
          />
        ))}
      </div>
    </main>
  );
}

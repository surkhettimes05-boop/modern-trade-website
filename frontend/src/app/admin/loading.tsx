export default function AdminLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading admin page">
      <div className="h-9 w-64 animate-pulse rounded-lg bg-slate-200" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-28 animate-pulse rounded-xl bg-white ring-1 ring-slate-200"
          />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-xl bg-white ring-1 ring-slate-200" />
    </div>
  );
}

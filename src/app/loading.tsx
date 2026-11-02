// Shown instantly while a page loads, so navigation never feels stuck.
export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-6 sm:px-6" aria-busy="true">
      <div className="mb-8 flex h-16 items-center justify-between"><div className="skeleton h-8 w-28" /><div className="skeleton h-9 w-9 !rounded-full" /></div>
      <div className="skeleton mb-3 h-4 w-24" />
      <div className="skeleton mb-8 h-10 w-64" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-24" />)}</div>
      <div className="mt-6 space-y-2">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-14" />)}</div>
    </div>
  );
}

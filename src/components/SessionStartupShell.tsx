export function SessionStartupShell({ mode, hasFreshPinHint = false }: {
  mode: 'auth' | 'pin';
  hasFreshPinHint?: boolean;
}) {
  const message = mode === 'auth'
    ? 'Memulihkan sesi Firebase…'
    : hasFreshPinHint
      ? 'Petunjuk sesi lokal ditemukan; memverifikasi sesi PIN ke server…'
      : 'Memverifikasi sesi PIN ke server…';

  return (
    <main className="min-h-screen bg-[#f7f7f3] px-3 py-4 text-[#1f1f1f] sm:px-6" role="status" aria-live="polite" aria-busy="true">
      <header className="mx-auto flex min-h-12 max-w-6xl items-center justify-between rounded-[10px] border border-[#eae4d5] bg-white px-4 shadow-sm">
        <span className="text-sm font-extrabold tracking-wide">AR CRM</span>
        <span className="text-xs font-semibold text-[#6b665c]">Workspace aman</span>
      </header>
      <section aria-hidden="true" className="mx-auto mt-4 max-w-6xl space-y-4">
        <div className="h-28 animate-pulse rounded-[12px] border border-[#eae4d5] bg-white" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="h-24 animate-pulse rounded-[12px] border border-[#eae4d5] bg-white" />
          <div className="h-24 animate-pulse rounded-[12px] border border-[#eae4d5] bg-white" />
          <div className="h-24 animate-pulse rounded-[12px] border border-[#eae4d5] bg-white" />
        </div>
        <div className="h-56 animate-pulse rounded-[12px] border border-[#eae4d5] bg-white" />
      </section>
      <div className="mx-auto mt-5 max-w-6xl space-y-1 px-1 text-sm">
        <p className="font-semibold" aria-label={message}>{message}</p>
        <p className="text-xs leading-5 text-[#6b665c]">
          Data CRM dan operasi cloud tetap terkunci sampai Firebase dan server mengonfirmasi sesi.
        </p>
      </div>
    </main>
  );
}

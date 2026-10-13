export default function DashboardLoading({ label = "Loading dashboard..." }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F8FAFC]" aria-busy="true">
      <div className="text-center">
        <div
          className="mx-auto h-9 w-9 animate-spin rounded-full border-[3px] border-slate-200 border-t-[#0F172A]"
          aria-hidden="true"
        />
        <p className="mt-4 text-sm font-medium text-slate-600" role="status">{label}</p>
      </div>
    </main>
  );
}

import { Button } from "@/components/ui/button";

export function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200 bg-slate-50/90 px-4 backdrop-blur lg:px-8">
      <Button aria-label="Open navigation" className="lg:hidden" onClick={onMenuClick} variant="ghost">☰</Button>
      <div className="hidden max-w-md flex-1 lg:block">
        <label className="relative block">
          <span className="sr-only">Search workspace</span>
          <input className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100" placeholder="Search students, opportunities…" type="search" />
          <span aria-hidden="true" className="absolute left-3 top-2 text-slate-400">⌕</span>
        </label>
      </div>
      <div className="ml-auto flex items-center gap-3">
        <button aria-label="View notifications" className="relative grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900" type="button">
          ♢<span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-blue-600" />
        </button>
        <div className="flex items-center gap-2 border-l border-slate-200 pl-3">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-violet-100 text-xs font-bold text-violet-700">ST</span>
          <span className="hidden text-sm font-medium text-slate-700 sm:block">Satyam</span>
        </div>
      </div>
    </header>
  );
}

export function ProgressBar({ value, label }: { value: number; label?: string }) {
  const safeValue = Math.min(100, Math.max(0, value));
  return (
    <div>
      {label ? <div className="mb-2 flex justify-between text-xs font-medium text-slate-600"><span>{label}</span><span>{safeValue}%</span></div> : null}
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${safeValue}%` }} />
      </div>
    </div>
  );
}

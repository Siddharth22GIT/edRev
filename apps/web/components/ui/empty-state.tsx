import type { ReactNode } from "react";

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-[#E6E6E6] bg-white px-6 py-12 text-center shadow-sm">
      {icon && (
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FEF6EE] text-[#C27803] border border-[#FBD7B3]">
          {icon}
        </div>
      )}
      <p className="font-bold text-[#30343B] text-base">{title}</p>
      <p className="mx-auto mt-1.5 max-w-md text-sm leading-6 text-[#666D7A]">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

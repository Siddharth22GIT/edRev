import type { ReactNode } from "react";

interface DataTableProps {
  columns: string[];
  children: ReactNode;
}

export function DataTable({ columns, children }: DataTableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[#E6E6E6] bg-white">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-[#E6E6E6] bg-[#F7F7F6] text-[11px] font-bold uppercase tracking-wider text-[#666D7A]">
          <tr>
            {columns.map((column) => (
              <th className="px-5 py-3.5 font-bold" key={column}>
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#E6E6E6] text-[#30343B]">{children}</tbody>
      </table>
    </div>
  );
}

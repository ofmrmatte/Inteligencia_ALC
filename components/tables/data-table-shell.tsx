import type { ReactNode } from "react";

type DataTableShellProps = {
  title: string;
  children: ReactNode;
};

export function DataTableShell({ title, children }: DataTableShellProps) {
  return (
    <section className="data-table-shell" aria-label={title}>
      {children}
    </section>
  );
}

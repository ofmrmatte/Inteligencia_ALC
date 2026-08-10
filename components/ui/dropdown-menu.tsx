import type { ReactNode } from "react";

type DropdownMenuProps = {
  label: string;
  children: ReactNode;
};

export function DropdownMenu({ label, children }: DropdownMenuProps) {
  return (
    <details className="dropdown-menu">
      <summary>{label}</summary>
      <div className="dropdown-menu__content">{children}</div>
    </details>
  );
}

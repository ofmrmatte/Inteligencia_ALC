import type { ReactNode } from "react";

type TooltipProps = {
  label: string;
  children: ReactNode;
};

export function Tooltip({ label, children }: TooltipProps) {
  return (
    <span className="tooltip">
      {children}
      <span className="tooltip__content" role="tooltip">
        {label}
      </span>
    </span>
  );
}

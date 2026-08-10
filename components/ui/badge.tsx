import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

type BadgeProps = {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger";
};

export function Badge({ children, tone = "neutral" }: BadgeProps) {
  return <span className={cn("badge", `badge--${tone}`)}>{children}</span>;
}

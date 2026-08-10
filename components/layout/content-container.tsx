import type { ReactNode } from "react";

export function ContentContainer({ children }: { children: ReactNode }) {
  return <main className="content-container">{children}</main>;
}

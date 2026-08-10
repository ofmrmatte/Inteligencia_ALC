import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

type ModuleFoundationProps = {
  title: string;
  description: string;
  children?: ReactNode;
};

export function ModuleFoundation({ title, description, children }: ModuleFoundationProps) {
  return (
    <div className="page-stack">
      <Card className="module-foundation">
        <div>
          <Badge tone="warning">Em migracao</Badge>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        {children}
      </Card>
    </div>
  );
}

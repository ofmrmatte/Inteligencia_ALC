import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";

type ChartPanelProps = {
  title: string;
  children: ReactNode;
};

export function ChartPanel({ title, children }: ChartPanelProps) {
  return (
    <Card className="chart-panel">
      <div className="section-header">
        <div>
          <span>Analise</span>
          <h2>{title}</h2>
        </div>
      </div>
      {children}
    </Card>
  );
}

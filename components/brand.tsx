import { RefreshCw } from "lucide-react";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "brand brand--compact" : "brand"} aria-label="Inteligência ALC">
      <div className="brand__symbol"><RefreshCw size={compact ? 18 : 22} strokeWidth={2.6} /></div>
      {!compact && (
        <div>
          <strong>ALC</strong>
          <span>Inteligência operacional</span>
        </div>
      )}
    </div>
  );
}

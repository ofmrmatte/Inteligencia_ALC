import Image from "next/image";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "brand brand--compact" : "brand"} aria-label="Inteligência ALC">
      <div className="brand__symbol">
        <Image src="/brand/alc-symbol.png" alt="" width={compact ? 31 : 38} height={compact ? 31 : 38} priority />
      </div>
      {!compact && (
        <div>
          <strong>Inteligência <b>ALC</b></strong>
          <span>PNR • Pré-faturamento • Risco</span>
        </div>
      )}
    </div>
  );
}

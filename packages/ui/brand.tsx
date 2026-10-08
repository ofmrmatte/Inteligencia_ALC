import Image from "next/image";

export function Brand({
  compact = false,
  application = "inteligencia",
}: {
  compact?: boolean;
  application?: "inteligencia" | "atendimento";
}) {
  if (application === "atendimento")
    return (
      <div
        className={`brand brand--atendimento${compact ? " brand--compact" : ""}`}
        aria-label="ALC Atendimento"
      >
        <Image
          src={
            compact
              ? "/brand/atendimento-icon.png"
              : "/brand/atendimento-horizontal-dark.png"
          }
          alt=""
          width={compact ? 40 : 218}
          height={compact ? 40 : 46}
          priority
        />
      </div>
    );
  return (
    <div
      className={compact ? "brand brand--compact" : "brand"}
      aria-label="Inteligência ALC"
    >
      <div className="brand__symbol">
        <Image
          src="/brand/alc-symbol.png"
          alt=""
          width={compact ? 31 : 38}
          height={compact ? 31 : 38}
          priority
        />
      </div>
      {!compact && (
        <div>
          <strong>
            Inteligência <b>ALC</b>
          </strong>
          <span>PNR • Pré-faturamento • Risco</span>
        </div>
      )}
    </div>
  );
}

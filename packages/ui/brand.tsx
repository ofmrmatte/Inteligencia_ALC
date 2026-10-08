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
        {compact ? (
          <div className="brand__symbol">
            <Image src="/brand/alc-symbol.png" alt="" width={31} height={31} priority />
          </div>
        ) : (
          <Image
            src="/brand/atendimento-horizontal-dark.png"
            alt=""
            width={218}
            height={46}
            priority
          />
        )}
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

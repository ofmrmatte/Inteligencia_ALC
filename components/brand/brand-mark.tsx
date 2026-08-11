import Image from "next/image";
import { BRAND } from "@/lib/constants/brand";
import { cn } from "@/lib/utils/cn";

type BrandMarkProps = {
  variant?: "lockup" | "symbol";
  tone?: "dark" | "light";
  className?: string;
  priority?: boolean;
};

export function BrandMark({ variant = "lockup", tone = "dark", className, priority }: BrandMarkProps) {
  const src = tone === "dark" ? BRAND.assets.symbolDark : BRAND.assets.symbolLight;

  if (variant === "symbol") {
    return (
      <Image
        src={src}
        alt="ALC"
        width={48}
        height={48}
        priority={priority}
        className={cn("brand-mark brand-mark--symbol", className)}
      />
    );
  }

  return (
    <div className={cn("brand-mark brand-mark--lockup", `brand-mark--${tone}`, className)} aria-label={BRAND.productName}>
      <Image src={src} alt="" width={48} height={48} priority={priority} aria-hidden="true" />
      <div className="brand-mark__text">
        <strong>{BRAND.productName}</strong>
        <span>{BRAND.companyName}</span>
      </div>
    </div>
  );
}

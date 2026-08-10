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
  const src =
    variant === "symbol"
      ? tone === "dark"
        ? BRAND.assets.symbolDark
        : BRAND.assets.symbolLight
      : tone === "dark"
        ? BRAND.assets.lockupDark
        : BRAND.assets.lockupLight;

  return (
    <Image
      src={src}
      alt={variant === "symbol" ? "ALC" : BRAND.productName}
      width={variant === "symbol" ? 48 : 224}
      height={variant === "symbol" ? 48 : 72}
      priority={priority}
      className={cn("brand-mark", className)}
    />
  );
}

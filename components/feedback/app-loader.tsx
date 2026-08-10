import Image from "next/image";
import { BRAND } from "@/lib/constants/brand";
import { cn } from "@/lib/utils/cn";

type AppLoaderProps = {
  label?: string;
  className?: string;
};

export function AppLoader({ label = "Carregando", className }: AppLoaderProps) {
  return (
    <div className={cn("app-loader", className)} role="status" aria-live="polite">
      <Image src={BRAND.assets.loaderDark} alt="" width={58} height={58} className="app-loader__mark" />
      <span>{label}</span>
    </div>
  );
}

import { AppLoader } from "@/components/feedback/app-loader";
import { BRAND } from "@/lib/constants/brand";

export default function RootLoading() {
  return <AppLoader label={`Iniciando ${BRAND.productName}`} className="app-loader--fullscreen" />;
}

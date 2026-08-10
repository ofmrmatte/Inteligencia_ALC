import {
  AlertTriangle,
  Boxes,
  Gauge,
  PackageX,
  ReceiptText,
  Settings,
} from "lucide-react";

export const dashboardRoutes = [
  { href: "/dashboard", label: "Dashboard", icon: Gauge },
  { href: "/pre-fatura", label: "Pré-Fatura", icon: ReceiptText },
  { href: "/gestao-pacotes", label: "Gestão de Pacotes", icon: Boxes },
  { href: "/desvios-pnr", label: "Desvios PNR", icon: AlertTriangle },
  { href: "/pacotes-faltantes", label: "Pacotes Faltantes", icon: PackageX },
] as const;

export const adminRoutes = [
  { href: "/configuracoes", label: "Configurações", icon: Settings },
] as const;

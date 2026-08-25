import type { LucideIcon } from "lucide-react";
import {
  BadgeDollarSign,
  Boxes,
  ChartNoAxesCombined,
  CircleGauge,
  ClipboardCheck,
  DatabaseZap,
  FileClock,
  FileSpreadsheet,
  IdCard,
  Settings,
  UserRound,
  ReceiptText,
  ShieldAlert,
} from "lucide-react";

export const SECTION_IDS = [
  "visao-geral",
  "gestao-pnr",
  "pre-faturamento",
  "gestao-descontos",
  "relatorios-pacotes",
  "risco-lm",
  "motoristas",
  "gestao-motoristas",
  "conciliacao-ids",
  "qualidade-dados",
  "importacoes",
  "configuracoes",
  "perfil",
] as const;

export type SectionId = (typeof SECTION_IDS)[number];

export interface NavigationItem {
  id: SectionId;
  label: string;
  shortLabel: string;
  href: string;
  icon: LucideIcon;
  group: "Análises" | "Controle de dados" | "Administração";
}

export const NAVIGATION: NavigationItem[] = [
  { id: "visao-geral", label: "Visão Geral", shortLabel: "Visão geral", href: "/", icon: CircleGauge, group: "Análises" },
  { id: "gestao-pnr", label: "Gestão PNR", shortLabel: "Gestão PNR", href: "/gestao-pnr", icon: Boxes, group: "Análises" },
  { id: "pre-faturamento", label: "Pré-faturamento", shortLabel: "Pré-faturamento", href: "/pre-faturamento", icon: ReceiptText, group: "Análises" },
  { id: "gestao-descontos", label: "Gestão de Descontos", shortLabel: "Descontos", href: "/gestao-descontos", icon: BadgeDollarSign, group: "Análises" },
  { id: "relatorios-pacotes", label: "Relatórios de Pacotes", shortLabel: "Relatórios", href: "/relatorios-pacotes", icon: FileSpreadsheet, group: "Análises" },
  { id: "risco-lm", label: "Risco LM", shortLabel: "Risco LM", href: "/risco-lm", icon: ShieldAlert, group: "Análises" },
  { id: "motoristas", label: "Desempenho de motoristas", shortLabel: "Motoristas", href: "/motoristas", icon: ChartNoAxesCombined, group: "Análises" },
  { id: "gestao-motoristas", label: "Gestão de Motoristas", shortLabel: "Gestão Motoristas", href: "/gestao-motoristas", icon: IdCard, group: "Controle de dados" },
  { id: "conciliacao-ids", label: "Conciliação de IDs", shortLabel: "Conciliação", href: "/conciliacao-ids", icon: ClipboardCheck, group: "Controle de dados" },
  { id: "qualidade-dados", label: "Qualidade dos dados", shortLabel: "Qualidade", href: "/qualidade-dados", icon: DatabaseZap, group: "Controle de dados" },
  { id: "importacoes", label: "Histórico de importações", shortLabel: "Importações", href: "/importacoes", icon: FileClock, group: "Controle de dados" },
  { id: "configuracoes", label: "Configurações", shortLabel: "Configurações", href: "/configuracoes", icon: Settings, group: "Administração" },
  { id: "perfil", label: "Perfil", shortLabel: "Perfil", href: "/perfil", icon: UserRound, group: "Administração" },
];

export const SECTION_META: Record<SectionId, { title: string; eyebrow: string; description: string }> = {
  "visao-geral": { title: "Visão Geral", eyebrow: "Monitoramento executivo", description: "Leitura consolidada de pacotes, descontos, risco e nível de entrega." },
  "gestao-pnr": { title: "Gestão PNR", eyebrow: "Casos e tratativas", description: "Acompanhe status, valores e cruzamentos dos casos PNR por pacote." },
  "pre-faturamento": { title: "Pré-faturamento", eyebrow: "Conferência financeira", description: "Analise descontos SVC, XPT e PNR sem duplicar IDs de pacote." },
  "gestao-descontos": { title: "Gestão de Descontos", eyebrow: "Direcionamento financeiro", description: "Centralize decisões de desconto ou absorção por ID e cruze automaticamente com Pré-fatura e PNR." },
  "relatorios-pacotes": { title: "Relatórios de Pacotes", eyebrow: "Relatórios gerenciais", description: "Gere relatórios ALC de PNR e Pacotes Perdidos por competência, datas e escopo operacional." },
  "risco-lm": { title: "Risco LM", eyebrow: "Exposição operacional", description: "Priorize pacotes parados, motivos de insucesso e GMV exposto." },
  motoristas: { title: "Desempenho de motoristas", eyebrow: "Produtividade e qualidade", description: "Cruze entregas, incidentes, descontos e risco por transportador." },
  "gestao-motoristas": { title: "Gestão de Motoristas", eyebrow: "Portal e documentos", description: "Administre motoristas, pendências, PDFs de pagamento, contestações e bases responsáveis." },
  "conciliacao-ids": { title: "Conciliação de IDs", eyebrow: "Chaves explícitas", description: "Veja onde cada pacote aparece e identifique repetições entre fontes." },
  "qualidade-dados": { title: "Qualidade dos dados", eyebrow: "Confiabilidade", description: "Monitore lacunas de vínculo, duplicidades e campos críticos." },
  importacoes: { title: "Histórico de importações", eyebrow: "Rastreabilidade", description: "Gerencie lotes independentes e acompanhe alertas de processamento." },
  configuracoes: { title: "Configurações", eyebrow: "Administração", description: "Controle acesso, parâmetros do Supabase e regras operacionais do painel." },
  perfil: { title: "Perfil", eyebrow: "Conta e escopo", description: "Consulte sua permissão, bases autorizadas e vínculo operacional." },
};

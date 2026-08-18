export const DISCOUNT_DIRECTIONS = [
  "em_analise",
  "desconto_driver",
  "desconto_dispatcher",
  "absorvido_alc",
  "abono",
  "outro",
] as const;

export type DiscountDirection = (typeof DISCOUNT_DIRECTIONS)[number];

export const DISCOUNT_DIRECTION_LABELS: Record<DiscountDirection, string> = {
  em_analise: "Em análise",
  desconto_driver: "Desconto Driver",
  desconto_dispatcher: "Desconto Dispatcher",
  absorvido_alc: "Absorvido ALC",
  abono: "Abono",
  outro: "Outro direcionamento",
};

export function isDiscountDirection(value: unknown): value is DiscountDirection {
  return typeof value === "string" && DISCOUNT_DIRECTIONS.includes(value as DiscountDirection);
}

export function discountDirectionLabel(value: string) {
  return isDiscountDirection(value) ? DISCOUNT_DIRECTION_LABELS[value] : value || "Sem direcionamento";
}

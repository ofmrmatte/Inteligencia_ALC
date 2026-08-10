export const preFaturaMigrationRules = [
  "Cada ID de envio representa um registro próprio.",
  "IDs diferentes não podem ser agrupados por rota, valor, motorista, placa, base ou data.",
  "Somente a mesma identidade operacional pode participar de deduplicacao.",
  "Linhas de totais, subtotais e rodapés não são registros.",
  "Linhas sem identidade válida de pacote/envio não entram no cálculo.",
  "Resultados precisam reconciliar com o legado antes da troca de runtime.",
] as const;

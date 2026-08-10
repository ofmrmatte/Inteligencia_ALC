export const preFaturaMigrationRules = [
  "Cada ID de envio representa um registro proprio.",
  "IDs diferentes nao podem ser agrupados por rota, valor, motorista, placa, base ou data.",
  "Somente a mesma identidade operacional pode participar de deduplicacao.",
  "Linhas de totais, subtotais e rodapes nao sao registros.",
  "Linhas sem identidade valida de pacote/envio nao entram no calculo.",
  "Resultados precisam reconciliar com o legado antes da troca de runtime.",
] as const;

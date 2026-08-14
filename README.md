# Inteligência ALC

Aplicação web para análise operacional de PNR, pré-faturamento, risco LM e desempenho de motoristas.

## Princípios

- Importação local de `.xlsx`, `.xls`, `.xlsm`, `.csv` e `.zip`.
- Os arquivos operacionais não são enviados para um servidor: o processamento acontece no navegador.
- Cada ZIP é tratado como um lote independente; cruzamentos entre lotes usam apenas chaves explícitas.
- Cada ID de pacote representa um produto. IDs repetidos são conciliados e sinalizados, nunca somados silenciosamente.

## Desenvolvimento

```bash
npm install
npm run dev
```

Validação completa:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Fontes reconhecidas

- Hierarquia: `COORDENADOR`, `SUPERVISOR`, `SIGLA`, `BASE`.
- KPI PNR: planilha `KPI LOGISTIC PNR`.
- Pré-faturamento: abas `PERDIDOS SVC`, `PNR` e `PERDIDOS XPT`.
- Risco LM: colunas `SHP_SHIPMENT_ID`, `SHP_LG_DRIVER_ID` e `GMV_BRL`.
- Motoristas: relatório `Transportistas` com `ID do transportador`.

Macros VBA não são executadas. A aplicação lê os dados tabulares e refaz os cruzamentos com regras auditáveis.

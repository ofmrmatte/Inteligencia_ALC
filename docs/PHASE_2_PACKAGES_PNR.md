# Phase 2 packages and PNR

Branch: `feat/phase-2-packages-pnr`

## Objetivo

Esta etapa migra para o runtime Next.js os modulos `Gestao de Pacotes` e `Desvios PNR`, mantendo `legacy/app.js` apenas como especificacao de regras. As rotas novas sao:

- `/gestao-pacotes`
- `/desvios-pnr`

Nao houve alteracao de schema, limpeza de dados ou mudanca de configuracao da Vercel.

## Mapa legado -> Next

### Gestao de Pacotes

Fonte legada principal:

- `identificarPeriodoGestaoPacotes`
- `identificarAbaGestao`
- `findPackageHeaderRow`
- `isPackageTotalRow`
- `isPackageManagementDetailRow`
- `hasPackageRecordMinimum`
- `mapPackageRowToProcessedRecord`
- `buildPackageRecordDedupeKey`

Fonte Next:

- `features/gestao-pacotes/domain/index.ts`
- `features/gestao-pacotes/data/queries.ts`
- `features/gestao-pacotes/components/gestao-pacotes-workspace.tsx`
- `features/gestao-pacotes/components/import-gestao-pacotes-button.tsx`
- `app/api/gestao-pacotes/validate/route.ts`

Tabela oficial:

- `public.gestao_pacotes_records`

Controle de arquivos:

- `public.dashboard_files`
- `public.processed_dashboard_files`

Identidade/dedupe:

- `module_key = gestao_pacotes`
- `dedupe_key` inclui competencia, quinzena, base/codigo, driver normalizado, rota, ID de envio/pacote, tipo, desconto, decisao administrativa, data e valor.
- Pacotes diferentes na mesma rota nao colidem porque `id_envio` participa da chave.
- A tabela possui indice unico por `module_key,dedupe_key`.

Regras de importacao:

- Abas reconhecidas: `ALINHAMENTO`, `ALC`, `MERCADO_LIVRE`.
- Linhas de total, subtotal, soma e resumo sao ignoradas.
- Linhas sem valor ou sem qualquer ancora operacional sao ignoradas.
- A persistencia exige usuario admin pela regra consolidada `isAdminProfile(profile)`.
- O arquivo so entra como processado apos inserir `dashboard_files`, gravar/upsertar registros e atualizar `processed_dashboard_files`.

Interface:

- KPIs de valor filtrado, registros, valor de Dispatcher, Driver e ALC.
- Filtros por busca, competencia, quinzena, tipo, desconto e base.
- Tabela com paginacao e ordenacao server-side.
- Resumo operacional por decisao e bases.

## Desvios PNR

Fonte legada principal:

- `getPnrDedupeKey`
- `dedupePnrRecords`
- `mapPnrRowToProcessedRecord`
- uso de `desvios_pnr_summary`
- uso de `desvios_pnr_table`

Fonte Next:

- `features/desvios-pnr/domain/index.ts`
- `features/desvios-pnr/data/queries.ts`
- `features/desvios-pnr/components/desvios-pnr-workspace.tsx`

Tabelas oficiais:

- `public.desvios_pnr_records`
- `public.desvios_pnr_metrics_summary`

RPCs usadas:

- `public.desvios_pnr_summary(...)`
- `public.desvios_pnr_table(...)`
- `public.refresh_desvios_pnr_metrics_summary(...)` permanece disponivel para manutencao/importacao.
- `public.update_desvios_pnr_status(...)` permanece no banco; alteracao manual de status nao foi exposta nesta tela inicial.

Identidade/dedupe:

- O legado usa `idEnvio|idRota|produtos`.
- O Next consulta o estado persistido e exibe `dedupe_key`; nao recalcula nem reconsolida no componente.

Filtros migrados:

- Mes
- Quinzena
- Status
- Tipo operacional
- Estacao/origem
- Status do motorista
- Fonte do cruzamento
- Motorista
- Rota
- Busca

Interface:

- KPIs de quantidade, valor total, anulados e enviados para faturamento.
- Graficos/listas por status, estacao, driver, tipo operacional e evolucao por periodo.
- Tabela detalhada paginada no servidor por RPC.
- Refresh manual por navegacao da rota atual.

## Performance

- Gestao usa consultas Supabase server-side, com tabela paginada por `range`.
- PNR usa RPCs e `desvios_pnr_metrics_summary`, evitando full-history fetch.
- Summary e tabela PNR rodam em paralelo com `Promise.all`.
- Datasets grandes nao sao serializados em localStorage nem enviados ao browser.
- ExcelJS fica restrito a API routes de importacao, fora do bundle inicial das paginas.

## Reconciliacao

Auditoria de base antes da implementacao:

- `PRE_FATURA`: `mismatches = 0`.
- `GESTAO_PACOTES`: `rows_read = 2324`, `rows_imported = 144`, `rows_persisted = 141`, `mismatches = 0`.
- `DESVIOS_PNR`: `rows_read = 74255`, `rows_imported = 73343`, `rows_persisted = 72279`, `mismatches = 4`.

As quatro divergencias historicas de PNR sao metadados de contagem persistida em `dashboard_files`, nao divergencias introduzidas pelo Next:

| Arquivo | rows_imported | rows_persisted metadata | actual_persisted_rows | Status |
| --- | ---: | ---: | ---: | --- |
| PNR 1Q Julho 2026.xlsx | 3574 | 3594 | 3574 | metadata_persisted_count_mismatch |
| PNR 1Q Junho 2026.xlsx | 3502 | 3502 | 3481 | metadata_persisted_count_mismatch |
| PNR 2Q Junho 2026.xlsx | 3893 | 3920 | 3873 | metadata_persisted_count_mismatch |
| PNR 2Q Maio 2026.xlsx | 3124 | 3108 | 3104 | metadata_persisted_count_mismatch |

O Next reproduz o estado persistido atual consultando `desvios_pnr_records` e `desvios_pnr_metrics_summary`. Nenhuma regra foi alterada para mascarar essas quatro divergencias.

## Testes

`npm run test:rules` agora executa todas as suites em `tests/*.test.ts`.

Cobertura adicionada:

- Gestao: totais ignorados, identidade/dedupe, pacotes diferentes na mesma rota, metricas e comparacao de evento.
- PNR: normalizacao de payload RPC, colecoes vazias, parsing de filtros/paginacao e valor em formato brasileiro.

## Riscos e pendencias

- Exportacao XLSX de Gestao e PNR ainda nao foi exposta.
- Alteracao manual de status PNR via RPC segue disponivel no banco, mas nao foi aberta nesta UI para evitar ampliar superficie de escrita sem validacao visual completa.
- Importacao PNR completa continua para etapa posterior; esta entrega migra consulta, filtros, KPIs, graficos e tabela detalhada.
- As quatro divergencias historicas de PNR devem ser tratadas em uma tarefa propria de metadados/reconciliacao, sem apagar dados.

# Legacy Parity Report

## Contexto

Este relatório registra a decisão de hardening final da Fase 2 sobre o runtime legado.

A aplicação principal em produção é Next.js App Router. O runtime Next não importa `legacy/`, `assets/vendor/`, `window.supabaseClient`, `authService.js`, `config.js`, `dashboardCacheService.js` nem scripts globais do dashboard antigo.

## Inventário

Arquivos legados ainda presentes:

- `legacy/index.html`
- `legacy/app.js`
- `legacy/styles.css`
- `legacy/config.js`
- `legacy/supabaseClient.js`
- `legacy/authService.js`
- `legacy/dashboardCacheService.js`
- `legacy/railwayApiClient.js`
- `legacy/railwayStagingClient.js`
- `assets/vendor/xlsx.full.min.js`
- `assets/vendor/exceljs.min.js`
- `assets/logo-alc-dashboard.png`
- `assets/logo-alc.jpeg`

## Dependências Restantes

Os arquivos acima não são usados pelo runtime Next, mas ainda existem dependências operacionais históricas:

- `npm run check:legacy` valida sintaxe do legado enquanto os scripts antigos ainda existirem.
- `scripts/railway/07-serve-railway-dashboard.mjs` serve o dashboard legado em staging local Railway/híbrido.
- `scripts/backfill-pnr-records.mjs` ainda usa `assets/vendor/xlsx.full.min.js` para backfill histórico de PNR.
- `scripts/railway/README.md` e `scripts/railway/CUTOVER_RUNBOOK.md` documentam fluxos Railway antigos fora do runtime normal da Vercel.

Por isso, a remoção física de `legacy/` e `assets/vendor/` não é segura nesta etapa sem antes migrar ou aposentar esses scripts.

## Paridade Funcional Preservada

Regras críticas mantidas no Next:

- Pré-Fatura exige identidade real de pacote/rota.
- IDs diferentes não podem ser agrupados apenas por rota, valor, motorista, placa, base ou data.
- Linhas de totais, subtotais, rodapés e linhas sem identidade válida não entram nos cálculos.
- Gestão de Pacotes ignora totais e preserva identidade operacional.
- Desvios PNR preserva ID/reclamação e não usa rota/valor como chave única.
- Autorização admin usa somente `profile.is_admin === true` e `role` normalizada como `admin`.
- `user_metadata` não é fonte de autorização.

## Auditorias Atualizadas

As auditorias abaixo foram movidas para o runtime Next:

- `scripts/audit-dashboard-health.mjs`
- `scripts/find-dead-code.mjs`
- `scripts/audit-raw-data-compaction.mjs`

Elas não dependem mais de `legacy/app.js` para validar saúde do dashboard, dead code do runtime atual ou uso de `raw_data`.

## Critérios de Reconciliação

O script `scripts/check-row-count-reconciliation.mjs` mantém tolerância explícita:

- `PRE_FATURA`: `mismatches = 0`
- `GESTAO_PACOTES`: `mismatches = 0`
- `DESVIOS_PNR`: até `4` divergências históricas de metadado; `>= 5` é regressão
- `PACOTES_FALTANTES`: `mismatches = 0`

Nenhuma correção desta etapa altera dados do Supabase.

## Próximo Passo Recomendado

Criar uma etapa curta para aposentar o servidor Railway/híbrido e migrar `scripts/backfill-pnr-records.mjs` para `exceljs` server-side. Depois disso, remover `legacy/`, `assets/vendor/` e `check:legacy` com segurança.

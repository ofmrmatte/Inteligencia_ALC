# Cleanup report

Data: 2026-08-09
Branch: `refactor/dashboard-cleanup`
Base sincronizada: `8480b705a09917e1d150ffc416ab4532cc6b35b7`

## Objetivo

Limpeza tecnica da base atual de `ofmrmatte/dashboardfatura` sem alterar regra de negocio, schema Supabase ou dados de producao.

Regras preservadas:

- PNRs com IDs de pacote/remessa diferentes continuam separados.
- Deduplicacao so acontece para a mesma identidade de registro.
- Linhas detalhadas sao a fonte do calculo.
- Linhas de totais, subtotais, rodapes e linhas sem identidade real continuam fora dos calculos.
- `KEEP_RAW_UPLOADS_IN_STORAGE=false` continua como modo normal.

## Alteracoes aplicadas

- Sincronizacao com `main` remoto antes da branch de trabalho.
- Remocao de artefatos locais ignorados, backups antigos, logs e exportacoes locais.
- Reorganizacao do `.gitignore` por categoria.
- Remocao da dependencia `chokidar`, que nao era usada pelo codigo atual.
- Aplicacao de `npm audit fix --omit=dev` sem `--force`, atualizando dependencias transitivas vulneraveis sem quebra de API.
- Remocao da variavel `isRendering`, confirmada sem uso.
- Remocao do monkey patch global de `console.error` em `supabaseClient.js`.
- Centralizacao da regra de administrador em helper que exige `is_admin = true` e `role = admin`.
- Remocao dos scripts Railway do HTML normal de producao.
- Injecao dos clientes Railway somente no servidor local/staging de `scripts/railway/07-serve-railway-dashboard.mjs`.
- Eliminacao dos usos de `eval()` nos hotfixes inline DF55, DF63, DF71 e DF78.
- Criacao de `window.dashboardLegacyBridge` para expor apenas constantes/funcoes autorizadas aos scripts inline legados.
- Criacao dos scripts npm `check`, `audit:all` e `cleanup:local`.
- Atualizacao do README com arquitetura, modulos, comunicacoes, permissoes e regras criticas da Pre-Fatura.

## Artefatos locais removidos

Removidos apenas arquivos/diretorios ignorados ou nao versionados:

- `app.js.backup_safe_20260803_152002`
- `app.js.bak_20260803_150622`
- `app.js.bak_20260803_152330`
- `app.js.bak_calc_20260803_152520`
- `app.js.bak_regra_ids_20260803_154314`
- `app.js.backup-20260722-174822`
- `app.js.backup-20260722-175022`
- `app.js.bak`
- `app.js.before-revert-*`
- `app.js.fase*`
- `app.js.fix-*`
- `app.js.loading*`
- `app.js.perf-*`
- `app.js.pnr-dedupe-*`
- `index.html.bak`
- `conserta_tudo.py`
- `mapear_layout.py`
- `patch_layout_unificado.py`
- `mapa_layout.md`
- `scripts/logs/`
- `scripts/railway/exports/`
- `scripts/railway/logs/`

Arquivos protegidos preservados:

- `.env`
- `.env.staging.railway`
- `node_modules/`
- `supabase/`
- `assets/`

## Auditoria antes

- `npm run audit:dashboard`: OK.
  - Legacy key files: 4
  - CSS duplicate selectors sampled: 20
  - Scripts found: 32
- `npm run audit:dead-code`: OK.
  - Functions with <=1 reference: 0
  - Variables/constants with <=1 reference: 6
- `npm run audit:module-isolation`: OK.
  - `pre_fatura_records`: 8690 rows, wrong 0
  - `gestao_pacotes_records`: 141 rows, wrong 0
  - `desvios_pnr_records`: 72279 rows, wrong 0
- `npm run audit:dedupe`: OK.
  - `pre_fatura_records`: duplicate_keys 0, missing 0
  - `gestao_pacotes_records`: duplicate_keys 0, missing 0
  - `desvios_pnr_records`: duplicate_keys 0, missing 0
- `npm run audit:row-counts`: falhou antes da limpeza.
  - `DESVIOS_PNR`: mismatches 4
  - `PRE_FATURA`: mismatches 0
  - `GESTAO_PACOTES`: mismatches 0
- `npm run audit:raw-data`: OK.
  - Acao aplicada: nenhuma
- `npm run audit:supabase`: OK.
  - Database: 335 MB
  - Largest table: `desvios_pnr_records` 217 MB
  - `dashboard-files`: 0 objetos
- Check de sintaxe inicial: falhou em `scripts/railway/07-serve-railway-dashboard.mjs` por BOM antes do shebang.

## Auditoria depois

- `npm run check`: OK.
- `npm run audit:dashboard`: OK.
  - Legacy key files: 4
  - CSS duplicate selectors sampled: 20
  - Scripts found: 29
- `npm run audit:dead-code`: OK.
  - Functions with <=1 reference: 0
  - Variables/constants with <=1 reference: 5
- `npm run audit:module-isolation`: OK.
  - `pre_fatura_records`: 8690 rows, wrong 0
  - `gestao_pacotes_records`: 141 rows, wrong 0
  - `desvios_pnr_records`: 72279 rows, wrong 0
- `npm run audit:dedupe`: OK.
  - `pre_fatura_records`: rows 8690, dedupe 8690, duplicate_keys 0, missing 0
  - `gestao_pacotes_records`: rows 141, dedupe 141, duplicate_keys 0, missing 0
  - `desvios_pnr_records`: rows 72279, dedupe 72279, duplicate_keys 0, missing 0
- `npm run audit:row-counts`: continua falhando pelo mesmo problema historico de `DESVIOS_PNR`.
  - `DESVIOS_PNR`: mismatches 4
  - `PRE_FATURA`: mismatches 0
  - `GESTAO_PACOTES`: mismatches 0
- `npm run audit:raw-data`: OK.
  - Acao aplicada: nenhuma
- `npm run audit:supabase`: OK.
  - Database: 335 MB
  - Largest table: `desvios_pnr_records` 217 MB
  - `dashboard-files`: 0 objetos
- `npm audit --omit=dev`: falha residual por 2 vulnerabilidades moderadas de `uuid` via `exceljs`.

## Impacto em linhas

Arquivos de producao:

- `index.html`: 2883 para 2861 linhas, reducao de 22 linhas.
- `supabaseClient.js`: reducao de 10 linhas pelo fim do monkey patch.
- `app.js`: aumento de 53 linhas para substituir `eval()` por ponte explicita e remover acesso dinamico inseguro.

Diff versionado final:

- 12 arquivos alterados/adicionados.
- 505 insercoes.
- 217 remocoes.
- Saldo liquido: +288 linhas versionadas.

O saldo ficou positivo porque a limpeza adicionou scripts/documentacao e uma ponte explicita para remover `eval()`. A reducao real de superficie de execucao ocorreu no HTML de producao e na remocao da dependencia `chokidar`.

## Riscos residuais

- `npm audit` ainda reporta 2 vulnerabilidades moderadas em `uuid` por dependencia de `exceljs`. O npm sugere `npm audit fix --force`, mas isso instalaria `exceljs@3.4.0`, uma alteracao quebravel. Nao foi aplicado automaticamente.
- `audit:row-counts` continua acusando 4 divergencias historicas em `DESVIOS_PNR`; `PRE_FATURA` permanece reconciliada com `mismatches = 0`.
- Os hotfixes inline DFxx ainda existem em `index.html`; nesta etapa foi removido `eval()`, mas nao houve reescrita visual ampla para reduzir risco de regressao.
- Nao houve alteracao em schema Supabase nem limpeza de dados de producao.

## Arquivos alterados

- `.gitignore`
- `README.md`
- `app.js`
- `authService.js`
- `index.html`
- `package.json`
- `package-lock.json`
- `supabaseClient.js`
- `scripts/cleanup-local-artifacts.mjs`
- `scripts/run-audits.mjs`
- `scripts/railway/07-serve-railway-dashboard.mjs`
- `docs/CLEANUP_REPORT.md`

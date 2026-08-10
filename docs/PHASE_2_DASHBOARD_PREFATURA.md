# Phase 2 dashboard and pre-fatura

Branch: `feat/phase-2-dashboard-prefatura`

## Objetivo

Esta etapa transforma a foundation Next em uma aplicacao operacional. O runtime principal passa a ser Next.js App Router; o HTML/JS/CSS legado foi movido para `legacy/` para impedir publicacao acidental do app antigo pela Vercel.

## Runtime e deploy

- `vercel.json` declara framework `nextjs`, `npm run build` e `npm install`.
- `scripts/verify-production-runtime.mjs` valida se a URL publicada contem sinais de Next e nao contem sinais de `app.js`, `styles.css`, `authService.js` ou patches legados.
- O servidor Railway local continua existindo, mas serve arquivos a partir de `legacy/`.

## Dashboard

`/dashboard` usa Supabase server-side para buscar:

- contagens de `pre_fatura_records`, `gestao_pacotes_records`, `desvios_pnr_records` e `gestao_desvios_pacotes_faltantes`;
- arquivos recentes de `dashboard_files`;
- meta mensal PNR em `dashboard_settings`;
- linhas persistidas de Pre-Fatura para total financeiro, bases, drivers, rotas, IDs de envio, rankings e mix por tipo.

Consultas independentes usam `Promise.all`.

## Pre-Fatura

`/pre-fatura` agora consulta `pre_fatura_records` com:

- filtros por busca, competencia, quinzena, tipo e base;
- ordenacao por valor, data, base, driver, rota, ID de pacote e criacao;
- paginacao server-side;
- metricas do recorte filtrado;
- tabela responsiva com dados persistidos.

## Importacao Pre-Fatura

A API `POST /api/pre-fatura/validate` valida e, quando `persist=true`, importa planilhas `.xlsx`.

Regras preservadas:

- abas aceitas: `SVC PERDIDOS`, `XPT PERDIDOS`, `PNR`;
- linhas de total/subtotal/soma sao ignoradas;
- linhas vazias ou sem identidade valida de pacote/rota sao ignoradas;
- ID de envio entra no `dedupe_key`;
- IDs diferentes com mesma rota e mesmo valor nao colidem;
- gravacao usa `upsert` em `pre_fatura_records` por `module_key,dedupe_key`;
- importacao persistente exige admin pela regra unica `isAdminProfile(profile)`.

Nao houve alteracao de schema nem limpeza de dados.

## Shell e tema

- Sidebar ganhou grupos, estado ativo claro e colapso persistido.
- Topbar ganhou busca contextual preparada.
- Tema inicial passa a ser light quando nao ha preferencia local; dark continua disponivel via `data-theme`.
- Loading de navegacao permanece local com skeletons, sem overlay global.

## Testes e auditorias

- `npm run lint`
- `npm run typecheck`
- `npm run test:rules`
- `npm run build`
- `npm run check`
- `npm run check:legacy`
- `npm run audit:dashboard`
- `npm run audit:dedupe`
- `npm run audit:row-counts`
- `npm run audit:raw-data`

`audit:row-counts` pode continuar retornando falha apenas nas 4 divergencias historicas conhecidas de `DESVIOS_PNR`. `PRE_FATURA` deve permanecer com `mismatches=0`.

## Pendencias

- Migrar relatorio executivo e graficos complexos do legado para features React isoladas.
- Criar exportacao XLSX no novo modulo Pre-Fatura.
- Publicar/mesclar a branch para que `verify:runtime` passe no dominio de producao.

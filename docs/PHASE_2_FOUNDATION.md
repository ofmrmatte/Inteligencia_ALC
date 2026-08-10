# Phase 2 foundation

Branch: `feat/phase-2-next-brandkit`
Base: `1eeef09 refactor: clean dashboard foundation`

## Arquitetura adotada

A nova aplicacao usa Next.js App Router, React e TypeScript. O legado permanece em `legacy/` como referencia de regras de negocio, mas nao e importado pela nova runtime.

Estrutura principal:

- `app/`: rotas, layouts, loading e error boundaries.
- `components/`: primitives reutilizaveis, shell, navegacao, feedback, tabelas, filtros e charts.
- `features/`: modulos por dominio.
- `lib/`: auth, permissoes, Supabase, constantes e utils.
- `public/brand/`: assets oficiais ALC copiados do Brand Kit.

## Stack

- Next.js App Router `16.3.0`.
- React `19.2.8`.
- TypeScript.
- Supabase Auth via `@supabase/ssr`.
- CSS global novo com tokens ALC centralizados.
- `lucide-react` para icones leves e consistentes.

## Brand assets

Assets copiados para `public/brand/`:

- `alc-logo-primary-dark.svg`
- `alc-logo-primary-light.svg`
- `alc-logo-transparent-dark.svg`
- `alc-logo-transparent-light.svg`
- `alc-symbol-dark.svg`
- `alc-symbol-light.svg`
- `alc-favicon.svg`
- `alc-wordmark-dark.svg`
- `alc-wordmark-light.svg`
- `alc-admin-center-lockup-dark.svg`
- `alc-admin-center-lockup-light.svg`
- `alc-loader-dark.svg`
- `alc-loader-light.svg`
- `alc-brand-tokens.css`
- `alc-brand-tokens.json`

## Auth

O fluxo novo nao depende de `window.supabaseClient`, `config.js` por script ou `authService.js` global.

Arquivos:

- `lib/supabase/browser.ts`: cliente browser.
- `lib/supabase/server.ts`: cliente server usando cookies.
- `lib/auth/session.ts`: usuario atual e profile.
- `proxy.ts`: protecao de rotas privadas e refresh de sessao.

Variaveis esperadas:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

As variaveis antigas `SUPABASE_URL` e `SUPABASE_ANON_KEY` continuam aceitas no servidor para compatibilidade local/scripts.

## Autorizacao

A regra administrativa da Fase 1 foi preservada em helper unico:

`profile.is_admin === true && profile.role === "admin"`

Arquivo:

- `lib/permissions/is-admin-profile.ts`

`/configuracoes` redireciona para `/dashboard` quando o profile nao passa nessa regra.

## Login

`/login` e uma tela dedicada, dark-first, com lockup ALC Admin Center, formulario de email/senha, mostrar/ocultar senha, lembrar sessao, loading no botao e mensagens de erro discretas.

Nao ha login Google.

## Shell autenticado

`app/(dashboard)/layout.tsx` protege as rotas e renderiza um shell persistente:

- `AppSidebar`
- `AppTopbar`
- `UserMenu`
- `ThemeToggle`
- `ContentContainer`
- drawer mobile

A navegacao usa `Link` com `prefetch` e loading local por rota, sem overlay global para navegacao comum.

## Tema

Tema light e o padrao inicial quando nao ha preferencia local. O tema dark existe via `data-theme` e continua com identidade ALC forte.

- `ThemeScript` aplica o tema antes da hidratacao.
- `ThemeToggle` persiste a preferencia em `localStorage`.
- Cores ficam centralizadas em `app/globals.css` e nos assets/tokens do Brand Kit.

## Loading strategy

- `AppLoader`: boot inicial, login loading e operacoes bloqueantes.
- `PageSkeleton`: loading de paginas.
- `MetricCardSkeleton`: metric cards.
- `TableSkeleton`: superficies tabulares.

Navegacao comum usa skeletons locais.

## Rotas

- `/`: redireciona conforme proxy/sessao.
- `/login`
- `/dashboard`
- `/pre-fatura`
- `/gestao-pacotes`
- `/desvios-pnr`
- `/pacotes-faltantes`
- `/configuracoes`

## Dashboard

`/dashboard` ja busca indicadores reais simples por contagem das tabelas persistidas, usando consultas independentes em paralelo. Nao foram inventados numeros.

Tabelas consultadas:

- `pre_fatura_records`
- `gestao_pacotes_records`
- `desvios_pnr_records`
- `gestao_desvios_pacotes_faltantes`
- `dashboard_files`

## Modulos ainda legados

A logica analitica completa ainda nao foi portada para React nesta fase:

- Pre-Fatura
- Gestao de Pacotes
- Desvios PNR
- Pacotes Faltantes
- Configuracoes completas

Essas paginas tem estrutura real e estado discreto de migracao.

## Regra critica da Pre-Fatura

Quando a feature for migrada, deve preservar:

- cada ID de envio representa um produto/registro proprio;
- IDs diferentes jamais sao agrupados so por rota, valor, motorista, placa, base ou data;
- somente mesmo ID pode participar da regra de consolidacao correspondente;
- linhas de total nao sao registros;
- linhas sem identidade valida de pacote/envio nao entram;
- resultados precisam reconciliar com o legado antes da troca definitiva.

## Validacao

Executados:

- `npm run lint`: OK.
- `npm run typecheck`: OK.
- `npm run build`: OK.
- `npm run check`: OK.
- `npm run check:legacy`: OK.

Validacao HTTP local:

- `/login`: 200.
- `/dashboard` sem sessao: 307 para `/login?next=%2Fdashboard`.
- `/brand/alc-favicon.svg`: 200.
- `/brand/alc-admin-center-lockup-dark.svg`: 200.
- HTML de `/login`: inclui lockup, formulario e script de tema; nao inclui runtime antigo.
- Log de erro do dev server: vazio nas rotas testadas.
- `supabase/`: sem diff.

Validacao nao concluida nesta fase por falta de credencial local completa:

- login real;
- shell autenticado em navegador real;
- logout real.

O `.env` local nao tinha `SUPABASE_EMAIL`, portanto nao havia credencial completa para teste autenticado automatizado.

## Riscos conhecidos

- `npm audit` segue com 2 vulnerabilidades moderadas transitivas de `uuid` via `exceljs`; corrigir com `--force` faria downgrade quebravel de `exceljs`.
- O build usa Next 16/Turbopack e exige `type: module` no `package.json`.
- O legado continua grande e deve ser migrado por feature, sem transportar `renderAll()` ou hotfixes DFxx.

## Proximo passo recomendado

Migrar o Dashboard real e depois Pre-Fatura em fatias pequenas:

1. Contratos de dados em `features/dashboard`.
2. Componentes tabulares e filtros.
3. Parser/normalizacao de Pre-Fatura isolados em TypeScript.
4. Testes de reconciliacao contra os arquivos reais e auditorias existentes.

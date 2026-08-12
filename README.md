# Painel de Inteligência

Aplicação web Next.js para análise operacional de pré-fatura, descontos, PNR e gestão de pacotes por base, motorista, competência, mês e quinzena.

## Estado Atual

A aplicação principal usa Next.js App Router, React e TypeScript. O runtime estático legado foi aposentado na Fase 3A; regras críticas permanecem cobertas por módulos modernos, auditorias e testes.

Relatórios de decisão:

- `docs/HARDENING_2026-08-12.md`
- `docs/LEGACY_PARITY_REPORT.md`
- `docs/PHASE_3_QUALITY_AUTOMATION.md`
- `docs/PHASE_3_GLOBAL_SEARCH_ALERTS.md`

## Configuracao geral

- Producao: https://dashboardfatura.vercel.app
- Hospedagem: Vercel.
- Aplicação principal: Next.js App Router + React + TypeScript.
- Backend principal: Supabase.
- Runtime local para scripts: Node.js.
- Railway: usado apenas em scripts de migracao, exportacao, importacao, comparacao, validacao e sizing. Nao faz parte do runtime normal da Vercel.

Se o dominio de producao for alterado, atualize esta secao e as URLs permitidas no Supabase Auth.

## Dependencias externas

### Supabase

O painel depende do Supabase para autenticacao, perfis, permissoes, registros processados, metadados de arquivos, configuracoes globais e auditoria.

- Supabase URL: `https://kvgddwmdamnkygyarafy.supabase.co`
- Chave publica: `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Cliente publico: `lib/supabase/browser.ts`.
- Autenticacao/perfil: `lib/auth/session.ts` e Supabase Auth.

Não usar `service_role`, secret keys ou backend local no frontend. Secrets ficam apenas em `.env` local ou no ambiente do provedor que executa scripts administrativos.

### Vercel

A Vercel deve executar o build Next.js. A nova aplicacao nao depende de `index.html`, `app.js`, `authService.js`, `supabaseClient.js` ou `config.js` em runtime normal.

### Railway

Os arquivos em `scripts/railway/` continuam no repositorio para migracao, comparacao, validacao e sizing. O servidor estatico legado foi removido; staging funcional deve usar o runtime Next.js.

## Permissoes

- Nao logado:
  - nao pode baixar relatorio;
  - nao pode enviar arquivo;
  - nao pode deletar arquivo;
  - nao pode acessar Configuracoes gerais.

- Usuario comum:
  - pode acessar Perfil;
  - pode visualizar dados carregados;
  - pode baixar relatorio;
  - nao pode enviar arquivo;
  - nao pode deletar arquivo;
  - nao pode acessar Configuracoes gerais.

- Administrador:
  - pode baixar relatorio;
  - pode enviar arquivo;
  - pode deletar arquivo;
  - pode trocar arquivo ativo;
  - pode acessar Configuracoes gerais;
  - pode gerenciar usuarios, setor, cargo e permissao admin;
  - pode visualizar auditoria.

A permissao administrativa exige `profiles.is_admin = true` e `profiles.role = 'admin'`, com comparacao de `role` normalizada para caixa baixa.

## Modulos funcionais

- **Login**: rota dedicada `/login`, usando Supabase Auth pela camada nova em `lib/supabase/`.
- **Shell autenticado**: sidebar persistente, topbar, menu de usuario, tema dark/light e drawer mobile.
- **Busca Global**: topbar com Command Palette (`Ctrl+K`/`Cmd+K`), endpoint autenticado `/api/search`, resultados reais agrupados por módulo e deep links usando filtros existentes.
- **Central de Alertas Operacionais**: botão na topbar com badge, endpoint autenticado `/api/alerts`, alertas derivados de status operacionais reais e alertas técnicos restritos a admin.
- **Dashboard Next**: rota `/dashboard`, com indicadores reais de tabelas persistidas, valor consolidado de Pre-Fatura, meta PNR, rankings e arquivos recentes.
- **Pre-Fatura**: rota `/pre-fatura`, consulta registros persistidos com filtros e paginacao server-side, importa planilhas com abas `SVC PERDIDOS`, `XPT PERDIDOS` e `PNR`, ignora totais/rodapes e exige identidade de pacote/rota antes de persistir.
- **Gestao de Pacotes**: rota `/gestao-pacotes`, com dados reais de `gestao_pacotes_records`, filtros, metricas, tabela paginada, ordenacao e importacao admin de planilhas.
- **Desvios PNR**: rota `/desvios-pnr`, usando `desvios_pnr_summary`, `desvios_pnr_table` e `desvios_pnr_metrics_summary` para KPIs, filtros, graficos, tabela server-side, exportacao XLSX, importacao admin e atualizacao manual admin de status.
- **Pacotes Faltantes**: rota `/pacotes-faltantes`, com dados reais de `gestao_desvios_pacotes_faltantes`, filtros, metricas, tabela paginada, exportacao XLSX e atualizacao admin de status.
- **Relatorio Executivo**: gera resumo do recorte selecionado com KPIs, rankings e tendencia.
- **Configuracoes gerais**: permite administrar usuarios, metas e auditoria para administradores.
- **Perfil**: permite visualizar e atualizar dados do usuario autenticado, incluindo avatar no bucket `avatars`.

## Regras criticas da Pre-Fatura

- Cada linha detalhada precisa preservar sua identidade operacional.
- PNRs com IDs de pacote/remessa diferentes nao podem ser unidas apenas por mesmo valor, motorista, rota, placa, base ou data.
- Linhas de totais, subtotais, rodapes e linhas sem identidade real de pacote/rota nao entram nos calculos.
- Deduplicacao so pode acontecer quando a identidade do proprio registro for a mesma.
- A tela deve ser alimentada por registros processados persistidos, nao por reprocessamento de arquivo bruto no Storage.

## Tabelas e Storage

### Supabase Auth

- `auth.users`: usuarios autenticados pelo Supabase Auth.

### Tabelas publicas

- `public.profiles`: perfil do usuario e permissao administrativa.
- `public.dashboard_files`: metadados dos arquivos enviados.
- `public.processed_dashboard_files`: controle de processamento persistido.
- `public.pre_fatura_records`: registros detalhados de Pre-Fatura.
- `public.gestao_pacotes_records`: registros processados de Gestao de Pacotes.
- `public.desvios_pnr_records`: registros processados de Desvios PNR.
- `public.gestao_desvios_pacotes_faltantes`: registros de pacotes faltantes.
- `public.dashboard_metrics_cache`: cache de metricas processadas.
- `public.dashboard_settings`: configuracoes globais, como meta PNR/LOSS.
- `public.audit_logs`: auditoria de login, upload, exclusao, perfil, permissoes e metas.

### Buckets de Storage

- `dashboard-files`: bucket legado/operacional. Com `KEEP_RAW_UPLOADS_IN_STORAGE=false`, os arquivos brutos nao sao a fonte normal de renderizacao.
- `avatars`: imagens de perfil usadas em `profiles.avatar_url`.

## Arquivos principais

- `app/`: nova aplicacao Next.js App Router.
- `components/`: shell, primitives, feedback, filtros, tabelas e charts.
- `features/`: organizacao por modulo.
- `lib/`: Supabase, auth, permissoes, constantes e utils.
- `public/brand/`: Brand Kit oficial ALC usado pela nova interface.
- `scripts/`: auditorias, migracoes, validacoes e utilitarios locais.
- `supabase/migrations/`: migracoes SQL versionadas.

## Scripts

```powershell
npm install
npm run dev
npm run lint
npm run typecheck
npm run build
npm run test:rules
npm run check:metadata
npm run check:scripts
npm run check:ci-env
npm run check
npm run test:e2e:smoke
npm run test:e2e
npm run verify:runtime
npm run smoke:production
npm run audit:dashboard
npm run audit:dead-code
npm run audit:ci
npm run audit:db
npm run audit:module-isolation
npm run audit:dedupe
npm run audit:row-counts
npm run audit:raw-data
npm run audit:supabase
npm run cleanup:local
```

- `npm run check`: executa lint, typecheck, testes de regras e build da aplicacao Next.
- `npm run test:rules`: valida regras criticas de identidade, totais, dedupe, filtros, payloads, Pacotes Faltantes e permissao admin.
- Busca Global e Alertas: validam sanitizacao, limites, classificacao ID/texto, deep links, alerta por status real e alerta administrativo condicionado a admin.
- `npm run check:metadata`: impede que páginas dupliquem o sufixo `Inteligência ALC` no metadata.
- `npm run check:scripts`: valida sintaxe dos scripts Node ativos.
- `npm run check:ci-env`: valida presença de `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` sem imprimir valores.
- `npm run test:e2e:smoke`: executa smoke E2E sem sessão com Playwright.
- `npm run test:e2e`: executa a suíte E2E; cenários autenticados pulam quando credenciais opcionais não existem.
- `npm run verify:runtime`: verifica se a URL publicada esta servindo Next, nao o legado.
- `npm run smoke:production`: verifica `/login` e redirects privados em produção sem autenticação.
- `npm run audit:ci`: roda somente auditorias offline, adequada para PRs e Dependabot.
- `npm run audit:db`: roda auditorias PostgreSQL read-only e exige `SUPABASE_DB_URL`.
- `npm run audit:all`: roda `audit:ci` e `audit:db` para validação local/admin.
- `npm run cleanup:local`: faz dry-run de backups/logs/exportacoes locais que podem ser removidos.
- `npm run cleanup:local -- --apply`: aplica a limpeza local protegida.
- `npm run railway:*`: scripts de apoio a migracao/validacao Railway; nao incluem o frontend estatico antigo e nao fazem parte do fluxo normal da Vercel.

## Fluxo basico

1. Usuario acessa a URL de producao.
2. Faz login pelo Supabase Auth.
3. O painel carrega perfil e permissoes em `profiles`.
4. Administrador importa planilhas no navegador.
5. O parser normaliza os dados, exclui linhas de total e grava registros processados.
6. A tela consulta registros persistidos/RPCs para cards, filtros, graficos e tabelas.
7. Usuarios podem pesquisar registros pela topbar e navegar diretamente para o módulo filtrado.
8. A topbar calcula alertas operacionais atuais sem persistir lido/nao lido.
9. Usuarios podem visualizar indicadores e baixar relatorios conforme permissao.
10. Administradores podem administrar arquivos, usuarios, metas e auditoria.

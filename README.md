# Painel de Inteligencia

Dashboard web estatico para analise operacional de pre-fatura, descontos, PNR e gestao de pacotes por base, motorista, competencia, mes e quinzena.

## Configuracao geral

- Producao: https://dashboardfatura.vercel.app
- Hospedagem: Vercel.
- Aplicacao nova: Next.js App Router + React + TypeScript.
- Legado: arquivos estaticos na raiz continuam como referencia para migracao.
- Backend principal: Supabase.
- Runtime local para scripts: Node.js.
- Railway: usado apenas em scripts de migracao, validacao e servidor local de staging; os clientes Railway nao sao carregados no HTML normal de producao.

Se o dominio de producao for alterado, atualize esta secao e as URLs permitidas no Supabase Auth.

## Dependencias externas

### Supabase

O painel depende do Supabase para autenticacao, perfis, permissoes, registros processados, metadados de arquivos, configuracoes globais e auditoria.

- Supabase URL: `https://kvgddwmdamnkygyarafy.supabase.co`
- Chave publica: `APP_CONFIG.SUPABASE_ANON_KEY` em `config.js`
- Cliente publico: `supabaseClient.js`
- Autenticacao/perfil: `authService.js`

Nao usar `service_role`, secret keys ou backend local no frontend. Secrets ficam apenas em `.env` local ou no ambiente do provedor que executa scripts administrativos.

### Vercel

A Vercel deve executar o build Next.js. A nova aplicacao nao depende de `index.html`, `app.js`, `authService.js`, `supabaseClient.js` ou `config.js` em runtime normal.

### Railway

Os arquivos em `scripts/railway/` continuam no repositorio para migracao, comparacao, validacao e staging local. O servidor `scripts/railway/07-serve-railway-dashboard.mjs` injeta os clientes Railway somente quando ele serve o dashboard em modo local/staging.

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
- **Dashboard Next**: rota `/dashboard`, ja com estrutura visual nova e contagens reais simples de registros processados.
- **Pre-Fatura**: importa planilhas com abas como `SVC PERDIDOS`, `XPT PERDIDOS` e `PNR`, normaliza registros detalhados, ignora linhas de total/rodape e calcula indicadores por mes, periodo, tipo, base, motorista, rota e pacote.
- **Gestao de Pacotes**: importa e consolida eventos de pacotes conforme regras do modulo, com leitura processada pelo banco.
- **Desvios PNR**: usa tabelas/RPCs para consulta paginada e agregacoes de PNR sem baixar todo o historico para a tela.
- **Pacotes Faltantes**: mantem categoria separada dentro de gestao de desvios.
- **Relatorio Executivo**: gera resumo do recorte selecionado com KPIs, rankings e tendencia.
- **Configuracoes gerais**: permite administrar usuarios, metas e auditoria para administradores.
- **Perfil**: permite visualizar dados do usuario autenticado.

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
- `index.html`: estrutura da aplicacao e scripts inline legados de interface.
- `styles.css`: estilos, tema claro/escuro e responsividade.
- `config.js`: configuracao publica do frontend.
- `supabaseClient.js`: inicializacao do cliente Supabase e tratamento de sessao expirada.
- `authService.js`: login, sessao, perfil e usuarios.
- `dashboardCacheService.js`: cache local de dados processados.
- `app.js`: regras de negocio, parser, filtros, rankings, graficos, upload, relatorio e permissoes.
- `railwayApiClient.js` e `railwayStagingClient.js`: clientes usados apenas quando injetados pelo servidor Railway local/staging.
- `scripts/`: auditorias, migracoes, validacoes e utilitarios locais.
- `supabase/migrations/`: migracoes SQL versionadas.
- `assets/vendor/xlsx.full.min.js`: leitura de Excel no navegador.

## Scripts

```powershell
npm install
npm run dev
npm run lint
npm run typecheck
npm run build
npm run check
npm run check:legacy
npm run audit:dashboard
npm run audit:dead-code
npm run audit:module-isolation
npm run audit:dedupe
npm run audit:row-counts
npm run audit:raw-data
npm run audit:supabase
npm run cleanup:local
```

- `npm run check`: executa lint, typecheck e build da aplicacao Next.
- `npm run check:legacy`: valida sintaxe dos principais arquivos JavaScript legados.
- `npm run audit:all`: roda as auditorias locais nao destrutivas encadeadas.
- `npm run cleanup:local`: faz dry-run de backups/logs/exportacoes locais que podem ser removidos.
- `npm run cleanup:local -- --apply`: aplica a limpeza local protegida.
- `npm run railway:*`: scripts de apoio a migracao/validacao Railway; nao fazem parte do fluxo normal da Vercel.

## Fluxo basico

1. Usuario acessa a URL de producao.
2. Faz login pelo Supabase Auth.
3. O painel carrega perfil e permissoes em `profiles`.
4. Administrador importa planilhas no navegador.
5. O parser normaliza os dados, exclui linhas de total e grava registros processados.
6. A tela consulta registros persistidos/RPCs para cards, filtros, graficos e tabelas.
7. Usuarios podem visualizar indicadores e baixar relatorios conforme permissao.
8. Administradores podem administrar arquivos, usuarios, metas e auditoria.

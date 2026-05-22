# Painel de Inteligencia

Dashboard web estatico para analise de pre-fatura, descontos, PNR e pacotes perdidos por base, driver, competencia, mes e quinzena.

## URL do painel

- Producao: https://dashboardfatura.vercel.app
- Tipo de projeto no Vercel: `Other` / estatico.

Se o dominio de producao for alterado no Vercel, atualizar esta secao e tambem a configuracao de URLs do Supabase Auth.

## Dependencia do Supabase

O painel depende do Supabase para autenticacao, perfis, permissoes, arquivos persistentes e auditoria.

- Supabase URL: `https://kvgddwmdamnkygyarafy.supabase.co`
- Chave publica: definida em `config.js` como `SUPABASE_ANON_KEY`
- Cliente: `supabaseClient.js`
- Servico de autenticacao/perfil: `authService.js`

Nao usar `service_role`, secret keys ou backend local no frontend. O arquivo `config.js` precisa ser publicado junto com o projeto estatico.

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

A permissao administrativa vem da tabela `profiles`, pelos campos `role = 'admin'` e `is_admin = true`.

## Tabelas e Storage usados

### Supabase Auth

- `auth.users`: usuarios autenticados pelo Supabase Auth.

### Tabelas publicas

- `public.profiles`
  - perfil do usuario;
  - campos principais: `id`, `name`, `email`, `role`, `is_admin`, `cargo`, `setor`, `avatar_url`, `created_at`, `updated_at`.

- `public.dashboard_files`
  - metadados dos arquivos enviados para o painel;
  - campos principais: `file_name`, `storage_path`, `file_type`, `file_size`, `uploaded_by`, `uploaded_by_email`, `reference_month`, `reference_year`, `period_label`, `period_type`, `is_active`, `status`, `metadata`.

- `public.audit_logs`
  - auditoria de acoes importantes;
  - registra login, logout, upload, exclusao, troca de arquivo ativo, geracao de relatorio, alteracao de perfil, setor, permissao admin e meta PNR/LOSS.

- `public.dashboard_settings`
  - configuracoes globais do dashboard;
  - chave `pnr_goal` armazena a meta PNR/LOSS mensal e anual;
  - usuarios logados podem ler, somente administradores podem alterar.

### Buckets de Storage

- `dashboard-files`
  - bucket legado/operacional para arquivos brutos quando a configuracao permitir;
  - com `KEEP_RAW_UPLOADS_IN_STORAGE=false`, uploads do painel usam o arquivo apenas para extracao e nao dependem do bucket para renderizar as abas;
  - scripts de manutencao podem consultar ou limpar objetos brutos antigos sem transformar Storage em fonte da tela.

- `avatars`
  - imagens de perfil dos usuarios;
  - usado para `avatar_url` em `profiles`.

## Fluxo basico de uso

1. Acessar o painel pela URL de producao.
2. Clicar no icone de usuario no canto superior direito.
3. Fazer login com uma conta cadastrada no Supabase Auth.
4. Se for administrador, usar **Enviar arquivo** para carregar uma ou mais planilhas Excel/CSV.
5. O parser do modulo extrai os campos usados, grava os registros normalizados nas tabelas persistidas e registra metadados em `dashboard_files`/`processed_dashboard_files`.
6. Com `KEEP_RAW_UPLOADS_IN_STORAGE=false`, o bruto nao vira fonte da tela; o painel recarrega cards, filtros, graficos e tabelas pelos registros processados no banco/RPC.
7. A meta PNR/LOSS e carregada de `dashboard_settings` e aparece igual para todos os usuarios.
8. Usuarios comuns podem visualizar os indicadores e baixar relatorios.
9. Administradores podem excluir arquivos, trocar arquivo ativo, editar usuarios, ajustar a meta global e consultar auditoria em **Configuracoes gerais**.

## Sincronizador local de arquivos

O projeto inclui um sincronizador Node.js para Windows que monitora duas pastas locais e envia automaticamente arquivos Excel para o Supabase:

- Pre-Fatura: `C:\Users\ALC Usuario\Documents\Painel de Inteligência\Pré Fatura`
- Gestao de Pacotes: `C:\Users\ALC Usuario\Documents\Painel de Inteligência\Gestão de pacotes`

### Configuracao

1. Instale as dependencias:

```powershell
npm install
```

2. Copie `.env.example` para `.env`.

3. Preencha no `.env`:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` para uso local seguro, ou `SUPABASE_ANON_KEY` + `SUPABASE_EMAIL` + `SUPABASE_PASSWORD`
- `DASHBOARD_BUCKET=dashboard-files`
- `PRE_FATURA_FOLDER`
- `GESTAO_FOLDER`
- `SUPABASE_DB_URL` ou `DATABASE_URL` apenas para aplicar migracoes SQL pelo script local

Nao commitar o `.env`. Ele fica ignorado pelo Git.

### Registros processados

O painel usa leitura processed-only para evitar baixar e reprocessar XLSX/CSV a cada abertura. Aplique a migracao uma vez com uma URL Postgres do Supabase:

```powershell
npm run db:migrate:processed-records
```

Tabelas criadas:

- `pre_fatura_records`
- `gestao_pacotes_records`
- `desvios_pnr_records`
- `gestao_desvios_pacotes_faltantes`
- `dashboard_metrics_cache`

Se as tabelas ainda nao existirem, o dashboard exibe estado controlado e solicita nova importacao pelo upload do painel.

## Arquivos principais

- `index.html`: estrutura da aplicacao.
- `config.js`: configuracao publica do Supabase para o frontend estatico.
- `supabaseClient.js`: inicializacao do cliente Supabase.
- `authService.js`: autenticacao, sessao, perfil e permissoes via Supabase Auth.
- `app.js`: logica do dashboard, filtros, rankings, graficos, upload, relatorio e permissoes.
- `styles.css`: estilos, tema claro/escuro e responsividade.
- `scripts/apply-processed-records-migration.mjs`: aplica a migracao das tabelas de registros processados quando `SUPABASE_DB_URL` ou `DATABASE_URL` estiver configurada.
- `scripts/cleanup-unused-supabase-processes.mjs`: gera relatorio e aplica limpeza segura de metadados/processos obsoletos do Supabase.
- `assets/vendor/xlsx.full.min.js`: biblioteca usada para leitura dos arquivos Excel no navegador.

## Relatorios

O Relatorio Executivo usa o recorte selecionado para KPIs, rankings e diagnostico principal. Para comparativo e tendencia, o painel usa os registros persistidos e os metadados disponiveis em `dashboard_files`/`processed_dashboard_files` quando existir historico compativel.

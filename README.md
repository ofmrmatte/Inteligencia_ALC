# Painel de Inteligencia Operacional

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
  - bucket privado para arquivos Excel do dashboard;
  - usuarios autenticados podem ler;
  - somente administradores devem enviar e deletar.

- `avatars`
  - imagens de perfil dos usuarios;
  - usado para `avatar_url` em `profiles`.

## Fluxo basico de uso

1. Acessar o painel pela URL de producao.
2. Clicar no icone de usuario no canto superior direito.
3. Fazer login com uma conta cadastrada no Supabase Auth.
4. Se for administrador, usar **Enviar arquivo** para carregar uma ou mais planilhas Excel.
5. O arquivo e salvo no Supabase Storage e seus metadados sao salvos em `dashboard_files`.
6. O painel carrega os arquivos salvos, aplica os filtros de mes/periodo e recalcula os indicadores.
7. A meta PNR/LOSS e carregada de `dashboard_settings` e aparece igual para todos os usuarios.
8. Usuarios comuns podem visualizar os indicadores e baixar relatorios.
9. Administradores podem excluir arquivos, trocar arquivo ativo, editar usuarios, ajustar a meta global e consultar auditoria em **Configuracoes gerais**.

## Arquivos principais

- `index.html`: estrutura da aplicacao.
- `config.js`: configuracao publica do Supabase para o frontend estatico.
- `supabaseClient.js`: inicializacao do cliente Supabase.
- `authService.js`: autenticacao, sessao, perfil e permissoes via Supabase Auth.
- `app.js`: logica do dashboard, filtros, rankings, graficos, upload, relatorio e permissoes.
- `styles.css`: estilos, tema claro/escuro e responsividade.
- `assets/vendor/xlsx.full.min.js`: biblioteca usada para leitura dos arquivos Excel no navegador.

## Relatorios

O Relatorio Executivo de Performance Operacional usa o recorte selecionado para KPIs, rankings e diagnostico principal. Para comparativo e tendencia, o painel busca o historico disponivel em `dashboard_files` e compara o recorte atual com o mes anterior disponivel quando existir.

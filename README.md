# Painel de Inteligência Operacional

Dashboard web estático para análise de pré-fatura, descontos, PNR e pacotes perdidos por base, driver e competência.

## Como usar

Abra `index.html` no navegador ou publique os arquivos estáticos no Vercel.

Para importar novos dados, use o botão **Importar Excel** e selecione uma ou mais planilhas `.xlsx` ou `.xls`.

## Arquivos principais

- `index.html`: estrutura da aplicação.
- `config.js`: configuração pública do Supabase para o frontend estático.
- `supabaseClient.js`: inicialização do cliente Supabase.
- `authService.js`: autenticação, sessão, perfil e permissões via Supabase Auth.
- `app.js`: lógica do dashboard, filtros, rankings, gráficos, importação e permissões.
- `styles.css`: estilos e responsividade.
- `assets/data/seed-data.js`: dados iniciais carregados no navegador.
- `assets/vendor/xlsx.full.min.js`: biblioteca usada para leitura dos arquivos Excel no navegador.

## Autenticação

A autenticação usa Supabase Auth diretamente no frontend estático. O login fica no ícone de usuário do cabeçalho e as permissões administrativas vêm da tabela `profiles`.

O arquivo `config.js` deve ser publicado junto com o projeto estático.

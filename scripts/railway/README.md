# Migracao paralela Railway

Esta pasta contem scripts para montar e validar um banco Postgres Railway em paralelo, sem alterar a producao atual no Supabase e sem mexer na Vercel.

O objetivo e copiar o banco limpo para staging, validar o painel apontando para Railway e somente depois decidir qualquer corte definitivo.

## Variaveis

Crie um arquivo local nao versionado na raiz do projeto:

```bash
.env.staging.railway
```

Conteudo esperado:

```bash
SUPABASE_DB_URL=postgresql://...
RAILWAY_DATABASE_URL=postgresql://...
RAILWAY_ENV=staging
```

Variaveis opcionais, quando o teste local do painel precisar delas:

```bash
SUPABASE_URL=https://...
SUPABASE_SERVICE_ROLE_KEY=...
```

O arquivo `.env.staging.railway` esta no `.gitignore`. Nao use `.env` de producao para estes scripts.

## Ordem segura

1. Testar conexoes:

```bash
npm run railway:check
```

2. Simular schema:

```bash
npm run railway:schema -- --dry-run
```

3. Aplicar schema no Railway staging:

```bash
npm run railway:schema -- --apply
```

4. Exportar dados limpos do Supabase:

```bash
npm run railway:export
```

5. Simular importacao:

```bash
npm run railway:import -- --dry-run
```

6. Importar no Railway staging:

```bash
npm run railway:import -- --apply
```

Para repetir uma importacao em um banco staging ja usado, limpe somente o Railway staging:

```bash
npm run railway:import -- --apply --truncate-railway
```

7. Comparar Supabase x Railway:

```bash
npm run railway:compare
```

8. Validar queries principais do painel no Railway:

```bash
npm run railway:validate
```

Os testes de edicao em `railway:validate` rodam em transacao com rollback. Para pular esses testes:

```bash
npm run railway:validate -- --skip-edit-tests
```

## Scripts

- `01-check-railway-connection.mjs`: testa conexao Supabase e Railway, versao do Postgres, encoding, timezone, extensoes e permissao de tabela temporaria no Railway.
- `02-apply-schema.mjs`: aplica prelude de compatibilidade Supabase e migrations em ordem no Railway staging. Padrao: dry-run. Escrita somente com `--apply`.
- `03-export-supabase-clean.mjs`: exporta dados persistidos necessarios para `scripts/railway/exports/` e cria `migration_manifest.json`.
- `04-import-railway.mjs`: importa JSONL em lotes para Railway, preservando IDs, timestamps, `module_key` e `dedupe_key`. Padrao: dry-run. Escrita somente com `--apply`.
- `05-compare-supabase-railway.mjs`: compara totais, `module_key`, status, competencia, row_count, dedupe, indices unicos, tamanhos e mistura entre modulos.
- `06-validate-railway-dashboard.mjs`: valida consultas logicas do painel contra Railway para Pre-Fatura, Gestao de Pacotes, PNRs e Pacotes Faltantes.

## Dados exportados

Exportados:

- `auth.users`, quando acessivel e necessario ao teste de Auth/RPC.
- `public.profiles`, quando existir.
- `public.dashboard_settings`, quando existir.
- `public.dashboard_files`.
- `public.processed_dashboard_files`.
- `public.pre_fatura_records`.
- `public.gestao_pacotes_records`.
- `public.desvios_pnr_records`.
- `public.gestao_desvios_pacotes_faltantes`.

Nao exportados:

- Arquivos brutos de Storage.
- Caches descartaveis.
- Logs temporarios.
- Artefatos locais.
- Tabelas obsoletas nao usadas pelo painel.

Por padrao, `raw_data` de Pre-Fatura e Gestao de Pacotes e preservado para paridade de auditoria, relatorio e download. Para omitir somente depois de comprovado que nao e usado:

```bash
npm run railway:export -- --drop-raw-data
```

## Guardrails

- Nenhum script escreve no Supabase.
- Nenhum script altera Vercel.
- Nenhum script troca variavel de producao.
- Nenhum script faz corte definitivo.
- Escritas no Railway bloqueiam se `RAILWAY_DATABASE_URL` estiver vazio.
- Escritas no Railway bloqueiam se o host parecer Supabase.
- Escritas no Railway bloqueiam se `RAILWAY_DATABASE_URL` for igual a `SUPABASE_DB_URL`.
- Hosts customizados exigem `--allow-non-railway-host`, apenas para teste local controlado.
- Exportacoes locais ficam em `scripts/railway/exports/`, tambem ignorado pelo Git.

## Criterio de aprovacao

O Railway staging so deve ser considerado pronto para teste visual/local quando:

- `railway:check` passar.
- `railway:schema -- --apply` aplicar sem erro.
- `railway:export` gerar manifesto.
- `railway:import -- --apply` importar sem duplicidade.
- `railway:compare` passar com totais equivalentes.
- Dedupe duplicado = 0.
- `module_key` legado = 0.
- Mistura entre modulos = 0.
- Tabelas obrigatorias existirem.
- Indices unicos por `module_key + dedupe_key` existirem.
- `railway:validate` passar com rollback nos testes de edicao.

## O que nao fazer

- Nao apontar Vercel producao para Railway nesta etapa.
- Nao apagar Supabase.
- Nao exportar ou versionar `.env.staging.railway`.
- Nao versionar `scripts/railway/exports/`.
- Nao rodar `--truncate-railway` contra qualquer banco que nao seja staging Railway validado.
- Nao tratar a validacao logica como substituta do teste funcional real no navegador.

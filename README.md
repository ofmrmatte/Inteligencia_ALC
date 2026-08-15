# Inteligência ALC

Aplicação web para análise operacional de PNR, pré-faturamento, risco LM e desempenho de motoristas.

## Princípios

- Importação online de `.xlsx`, `.xls`, `.xlsm`, `.csv` e `.zip`, com arquivos originais no Supabase Storage.
- Login real por Supabase Auth, com perfis de Coordenador, Supervisor, Diretor e ADM.
- As importações oficiais ficam restritas a Diretor/ADM.
- Os registros processados ficam persistidos no Supabase, com RLS por perfil e escopo de base/sigla.
- Cada ZIP é tratado como um lote independente; cruzamentos entre lotes usam apenas chaves explícitas.
- Cada ID de pacote representa um produto. IDs repetidos são conciliados e sinalizados, nunca somados silenciosamente.

## Supabase

Crie `.env.local` a partir de `.env.example`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sua-chave-publicavel
```

Migrações locais:

```bash
supabase db reset
```

O schema inicial cria `profiles`, lotes de importação, arquivos processados, tabelas operacionais e políticas RLS por escopo de base/sigla.

## Desenvolvimento

```bash
npm install
npm run dev
```

Validação completa:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Fontes reconhecidas

- Hierarquia: `COORDENADOR`, `SUPERVISOR`, `SIGLA`, `BASE`.
- KPI PNR: planilha `KPI LOGISTIC PNR`.
- Pré-faturamento: abas `PERDIDOS SVC`, `PNR` e `PERDIDOS XPT`.
- Risco LM: colunas `SHP_SHIPMENT_ID`, `SHP_LG_DRIVER_ID` e `GMV_BRL`.
- Motoristas: relatório `Transportistas` com `ID do transportador`.

Macros VBA não são executadas. A aplicação lê os dados tabulares e refaz os cruzamentos com regras auditáveis.

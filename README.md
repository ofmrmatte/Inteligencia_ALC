# Inteligência ALC

Aplicação web para análise operacional de PNR, pré-faturamento, risco LM e desempenho de motoristas.

## Princípios

- Importação online de `.xlsx`, `.xls`, `.xlsm`, `.csv` e `.zip`, com arquivos originais no Supabase Storage.
- Login real por Supabase Auth, com perfis internos e portal externo do motorista.
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

### Portal do Motorista

Rotas principais:

- `/gestao-motoristas`: área interna para visão geral, motoristas, pendências, pagamentos, contestações e designação de bases.
- `/motorista/login`: login e primeiro acesso do motorista.
- `/motorista`: portal mobile-first do motorista.

Estruturas criadas pela migration `20260816110000_driver_portal_foundation.sql`:

- `operational_bases`, `alc_drivers`, `admin_base_assignments` e histórico de designações.
- `driver_payment_batches`, `driver_payment_documents` e `driver_payment_document_versions`.
- `driver_disputes`, `driver_dispute_messages`, `driver_notifications` e `driver_portal_audit_events`.
- Bucket privado `driver-payments`.

Variáveis necessárias no servidor:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Fluxo operacional:

1. Gestores acessam `Gestão de Motoristas`.
2. Bases e motoristas são sincronizados a partir dos dados operacionais já importados.
3. O administrativo envia ZIP/RAR com PDFs de pagamento; o sistema cria lote em conferência.
4. Somente PDFs identificados sem conflito podem ser publicados.
5. O motorista ativa o primeiro acesso com ID, base e confirmação segura, depois consulta PDFs e abre contestações.

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

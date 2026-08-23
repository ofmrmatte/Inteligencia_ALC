# Inteligência ALC

Plataforma web para análise operacional, prevenção de perdas e apoio à tomada de decisão em operações logísticas.

> Projeto de portfólio desenvolvido a partir de necessidades operacionais reais. Informações sensíveis, credenciais e dados de usuários não devem ser versionados neste repositório.

## Sobre o projeto

A Inteligência ALC centraliza dados provenientes de diferentes planilhas e fontes operacionais, transforma esses dados em informações auditáveis e disponibiliza indicadores para acompanhamento de PNR, pré-faturamento, risco LM, desempenho de motoristas e conciliação de registros.

O projeto foi estruturado para substituir fluxos manuais e cruzamentos descentralizados por uma aplicação web com autenticação, persistência de dados, regras de acesso e validações de negócio.

## Principais funcionalidades

- Importação de arquivos `.xlsx`, `.xls`, `.xlsm`, `.csv` e `.zip`.
- Processamento e consolidação de dados operacionais.
- Gestão de PNR e acompanhamento de status.
- Análise de pré-faturamento e descontos.
- Indicadores de risco LM.
- Acompanhamento de desempenho de motoristas.
- Conciliação de IDs e tratamento de duplicidades.
- Histórico de importações e rastreabilidade dos dados.
- Controle de acesso por perfil e escopo operacional.
- Integração com portal externo para motoristas.
- Persistência de dados e arquivos no Supabase.

## Regras de negócio relevantes

- Cada lote importado é processado de forma independente.
- Cruzamentos entre lotes utilizam chaves explícitas.
- IDs repetidos são conciliados e sinalizados, evitando somas silenciosas.
- Dados operacionais são segmentados conforme perfil, base e sigla.
- Macros VBA não são executadas; a aplicação lê os dados tabulares e reproduz os cruzamentos por regras auditáveis.

## Arquitetura e stack

### Front-end
- Next.js 16
- React 19
- TypeScript
- Zustand
- Recharts
- Lucide React

### Back-end e dados
- Next.js Server APIs
- Supabase Auth
- Supabase Database
- Supabase Storage
- PostgreSQL
- Row Level Security (RLS)
- Zod para validação de dados

### Qualidade
- ESLint
- TypeScript type checking
- Vitest
- Build automatizado com Next.js

### Deploy
- Vercel

## Estrutura do projeto

```text
app/          rotas, páginas e APIs da aplicação
components/   componentes de interface
lib/          regras, serviços e utilitários
public/       arquivos públicos
scripts/      rotinas auxiliares e sincronizações
supabase/     migrations e configuração de banco
tests/        testes automatizados
```

## Portal do Motorista

A solução também possui integração com um portal mobile-first voltado ao motorista, com fluxos de autenticação, pagamentos, documentos, notificações e contestações.

Rotas principais:

- `/gestao-motoristas` — gestão interna.
- `/motorista/login` — autenticação e primeiro acesso.
- `/motorista` — experiência mobile do motorista.

## Execução local

Requisitos:

- Node.js 20+
- Projeto Supabase configurado

```bash
npm install
npm run dev
```

Crie `.env.local` a partir de `.env.example` e informe apenas credenciais do seu próprio ambiente.

## Validação

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Competências demonstradas

Este projeto envolve levantamento de requisitos, modelagem de regras de negócio, desenvolvimento web full stack, integração com banco de dados, autenticação, controle de acesso, processamento de arquivos, testes, debugging, deploy e evolução contínua de produto.

O desenvolvimento utiliza ferramentas de IA generativa como apoio à implementação, revisão, refatoração e testes, mantendo a definição de requisitos, regras operacionais e validação funcional como parte do processo de engenharia do projeto.

## Segurança

- Não versione `.env.local` ou arquivos com credenciais reais.
- Utilize variáveis de ambiente para chaves e segredos.
- Dados operacionais reais e informações pessoais não devem ser adicionados ao repositório público.
- A `SUPABASE_SERVICE_ROLE_KEY` deve existir somente em ambiente server-side.

## Autor

**Matheus Ferreira Folgado**  
GitHub: [@ofmrmatte](https://github.com/ofmrmatte)

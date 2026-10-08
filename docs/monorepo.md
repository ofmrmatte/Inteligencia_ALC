# Organização do monorepo ALC

## Separação de código

O painel foi movido da raiz para `apps/inteligencia`, incluindo `app`, `components`, `lib`, `public`, `scripts`, `tests`, `supabase`, `db`, documentação e configurações de Next.js/TypeScript/Vitest/ESLint. Os caminhos internos do painel, seu alias `@/`, rotas, regras de negócio e destino das migrations permanecem equivalentes.

A extensão saiu de `extension-pnr` para `extensions/pnr-connector`. O painel declara esse workspace como dependência local e importa seu `package.json` para obter a versão do conector. Os testes de integração usam o novo caminho da extensão.

O build do conector continua produzindo um ZIP em `apps/inteligencia/public/downloads`. A URL pública de download do painel permanece `/downloads/alc-pnr-connector-v<versão>.zip`. A versão e as permissões do manifest não foram alteradas.

O Comunicador tem um workspace próprio em `apps/comunicador`, reservado para implementação posterior. O diretório `packages` receberá somente compartilhamentos explícitos e necessários.

## Dependências e ambiente

- A instalação ocorre na raiz: `npm ci`.
- Um único `package-lock.json` controla os workspaces.
- As dependências do painel permanecem em seu `package.json`; a extensão declara `fflate`, usado em seu próprio build.
- Os scripts npm executam no diretório do workspace, preservando os caminhos relativos dos testes, scripts e migrations locais.
- O ambiente local do painel fica em `apps/inteligencia/.env.local`. Não coloque segredos do Comunicador nesse arquivo.
- Next.js identifica a raiz do monorepo explicitamente para Turbopack e tracing de dependências.

## Railway

O serviço atual do painel utiliza a raiz do repositório, `npm run build` e `npm start`. Esses comandos permanecem compatíveis e direcionam somente ao workspace `alc-painel-inteligencia`. Não é necessário mover a Root Directory para `apps/inteligencia`: isso excluiria os arquivos de instalação compartilhados e a extensão do contexto de build.

| Serviço | Raiz | Build | Start |
| --- | --- | --- | --- |
| Inteligência ALC | Raiz do repositório | `npm run build:inteligencia` ou o atual `npm run build` | `npm run start:inteligencia` ou o atual `npm start` |
| Comunicador ALC | Raiz do repositório | Definir quando existir aplicação executável, direcionado a `@alc/comunicador` | Definir quando existir servidor próprio. |

Ao configurar os filtros de deploy do painel, incluir `/apps/inteligencia/**`, `/extensions/pnr-connector/**`, `/packages/**`, `/package.json` e `/package-lock.json`. Alterações exclusivas em `/apps/comunicador/**` devem pertencer ao serviço do Comunicador. A instalação e o lockfile compartilhados exigem incluir os arquivos da raiz nos filtros relevantes.

Esta etapa prepara o código e documenta os filtros; não altera configurações ou variáveis de produção, não cria serviços e não aplica migrations. O futuro serviço do Comunicador terá domínio, processo e variáveis próprios. O acesso pelo painel será um link para outra aba, e a Administração permanecerá dentro do Comunicador.

Referência: [monorepos no Railway](https://docs.railway.com/deployments/monorepo). Não foi introduzido `railway.json` ou `railway.toml`; os comandos existentes já são suficientes para o serviço atual.

## Vercel legado

A configuração específica do painel está em `apps/inteligencia/vercel.json`. Caso o painel volte a ser publicado no Vercel, configurar a Root Directory do projeto para `apps/inteligencia` e permitir acesso aos arquivos externos necessários ao workspace e ao build do conector. O `vercel.json` da raiz impede a publicação automática da branch desta reorganização e preserva o bloqueio da branch RH existente.

## CI e manutenção

A CI instala as dependências na raiz e usa os comandos de lint, typecheck, testes, auditoria e build do painel. O workflow de manutenção que escreve código passa a ser manual, para que a movimentação de seus caminhos não dispare uma limpeza automática ao integrar o monorepo. Seus caminhos foram atualizados.

Para revisar a mudança, conferir renomes e diferenças com `git diff --find-renames`. Uma reorganização de diretórios não deve alterar o conteúdo das rotas, componentes ou migrations.

## Validação desta reorganização

Verificações locais em 7 de outubro de 2026 (Brasil), sobre a base `6c990fa` que já inclui o módulo RH:

- `npm ci --offline --no-audit --no-fund`: instalação limpa concluída.
- `npm test`: 39 arquivos e 323 testes passaram, tanto antes quanto após a movimentação.
- `npm run typecheck`: passou.
- `npm run build`: passou e gerou o ZIP do conector no diretório público do painel.
- `npm start -- --hostname 127.0.0.1 --port 3101`: iniciou o painel pelo comando da raiz; `/login` respondeu 200, e `/` e o download protegido redirecionaram ao login sem sessão. A API de usuários respondeu 503 no ambiente sem configuração de autenticação, sem validar acesso real.
- ZIP local do conector: 4 arquivos, manifest 1.1.17 e service worker clássico preservados.
- `npm run audit:perf`: passou.
- `npm audit --omit=dev --audit-level=high`: nenhuma vulnerabilidade reportada.
- `npm run lint`: permanece com os mesmos 4 erros e 3 warnings anteriores no painel; não foi tratado como aprovação.

As versões externas do lockfile foram preservadas. O script de build preexistente prepara uma cor em `reports-view-v2.tsx`; esse efeito local não foi incluído no diff da reorganização. Não foram testadas conexões com serviços de produção, autenticação real, novas funcionalidades do Comunicador ou configurações de deploy externas.

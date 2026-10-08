# Organização do monorepo ALC

## Separação de código

O painel foi movido da raiz para `apps/inteligencia`, incluindo `app`, `components`, `lib`, `public`, `scripts`, `tests`, `supabase`, `db`, documentação e configurações de Next.js/TypeScript/Vitest/ESLint. Os caminhos internos do painel, seu alias `@/`, rotas, regras de negócio e destino das migrations permanecem equivalentes.

A extensão saiu de `extension-pnr` para `extensions/pnr-connector`. O painel declara esse workspace como dependência local e importa seu `package.json` para obter a versão do conector. Os testes de integração usam o novo caminho da extensão.

O build do conector produz o ZIP em ambas as aplicações. A URL de download permanece `/downloads/alc-pnr-connector-v<versão>.zip`. A versão atual é 1.2.0, incluindo o domínio do Atendimento e o agendamento com chrome.alarms.

O Atendimento tem um workspace próprio em `apps/atendimento`, implementado com serviço e domínio próprios. O pacote `@alc/identity` compartilha perfil, permissões e cifragem de tickets de acesso entre as aplicações.

## Dependências e ambiente

- A instalação ocorre na raiz: `npm ci`.
- Um único `package-lock.json` controla os workspaces.
- As dependências do painel permanecem em seu `package.json`; a extensão declara `fflate`, usado em seu próprio build.
- Os scripts npm executam no diretório do workspace, preservando os caminhos relativos dos testes, scripts e migrations locais.
- O ambiente local do painel fica em `apps/inteligencia/.env.local`. Não coloque segredos do Atendimento nesse arquivo.
- Next.js identifica a raiz do monorepo explicitamente para Turbopack e tracing de dependências.

## Railway

O serviço atual do painel utiliza a raiz do repositório, `npm run build` e `npm start`. Esses comandos permanecem compatíveis e direcionam somente ao workspace `alc-painel-inteligencia`. Não é necessário mover a Root Directory para `apps/inteligencia`: isso excluiria os arquivos de instalação compartilhados e a extensão do contexto de build.

| Serviço | Raiz | Build | Start |
| --- | --- | --- | --- |
| Inteligência ALC | Raiz do repositório | `npm run build:inteligencia` ou o atual `npm run build` | `npm run start:inteligencia` ou o atual `npm start` |
| Atendimento ALC | Raiz do repositório | `npm run build:atendimento` | `npm run start:atendimento` |

Ao configurar os filtros de deploy do painel, incluir `/apps/inteligencia/**`, `/extensions/pnr-connector/**`, `/packages/**`, `/package.json` e `/package-lock.json`. Alterações exclusivas em `/apps/atendimento/**` devem pertencer ao serviço do Atendimento. A instalação e o lockfile compartilhados exigem incluir os arquivos da raiz nos filtros relevantes.

O serviço ALC-Atendimento possui domínio, processo e variáveis próprios. O pré-deploy aplica somente seu schema `alc_atendimento` no Aux. O botão do menu lateral abre outra aba, e a Administração permanece dentro do Atendimento. O Supabase Auth é o mesmo do painel: login, cadastro e MFA são centralizados no Inteligência. Uma entrada de uso único transfere a mesma sessão; não existe formulário de login no Atendimento.

Referência: [monorepos no Railway](https://docs.railway.com/deployments/monorepo). Não foi introduzido `railway.json` ou `railway.toml`; os comandos existentes já são suficientes para o serviço atual.

## Vercel legado

A configuração específica do painel está em `apps/inteligencia/vercel.json`. Caso o painel volte a ser publicado no Vercel, configurar a Root Directory do projeto para `apps/inteligencia` e permitir acesso aos arquivos externos necessários ao workspace e ao build do conector. O `vercel.json` da raiz impede a publicação automática da branch desta reorganização e preserva o bloqueio da branch RH existente.

## CI e manutenção

A CI instala as dependências na raiz e usa os comandos de lint, typecheck, testes, auditoria e build do painel. O workflow de manutenção que escreve código passa a ser manual, para que a movimentação de seus caminhos não dispare uma limpeza automática ao integrar o monorepo. Seus caminhos foram atualizados.

Para revisar a mudança, conferir renomes e diferenças com `git diff --find-renames`. Uma reorganização de diretórios não deve alterar o conteúdo das rotas, componentes ou migrations.

## Validação

A organização inicial preservou os 323 testes do painel. A implementação e o ajuste de acesso exclusivo pelo Inteligência totalizam 337 testes em 40 arquivos, com typecheck e builds das duas aplicações aprovados. O lint do Atendimento passa sem erros ou warnings. O painel mantém os 4 erros e 3 warnings anteriores de lint. A auditoria de dependências de produção não apontou vulnerabilidades na publicação inicial.

A atualização concorrente de RH/configurações foi incorporada antes da publicação, incluindo setores, organograma e política de escopo operacional. O script de build preexistente prepara uma cor em `reports-view-v2.tsx`; esse efeito local foi restaurado e não integra as alterações.

A saúde do serviço Atendimento e a proteção das APIs foram verificadas em produção. A confirmação do fluxo completo com uma conta real, MFA, recebimento/envio de WhatsApp e coleta complementar requer sessão autorizada e as configurações externas indicadas no README do Atendimento. Nenhum teste enviou WhatsApp real.

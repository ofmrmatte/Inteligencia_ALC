# ALC — monorepo

Repositório de aplicações operacionais da ALC, organizado com **npm workspaces**. O painel Inteligência ALC e o Atendimento têm diretórios e responsabilidades separados; a extensão de coleta pode atender às duas aplicações.

| Diretório | Workspace | Situação |
| --- | --- | --- |
| `apps/inteligencia` | `alc-painel-inteligencia` | Painel existente, com APIs, autenticação, RH, testes, scripts e migrations próprios. |
| `apps/atendimento` | `@alc/atendimento` | Aplicação independente de atendimento, PNRs, canais WhatsApp e Administração. |
| `extensions/pnr-connector` | `alc-pnr-connector` | Extensão existente do Case Center. |
| `packages` | — | Identidade e transferência segura de acesso compartilhadas. |

O monorepo compartilha a instalação e o lockfile; cada workspace declara suas dependências. Ter o mesmo repositório não implica compartilhar processos, tokens ou acesso irrestrito aos bancos.

## Execução local

Requisito: Node.js 22 ou superior.

Na raiz:

```bash
npm ci
cp apps/inteligencia/.env.example apps/inteligencia/.env.local
npm run dev:inteligencia
```

Informe as variáveis do seu ambiente apenas em `apps/inteligencia/.env.local`. O exemplo contém valores fictícios. As variáveis do Atendimento são próprias e ficam em apps/atendimento/.env.local ou no serviço Railway. Consulte o README da aplicação.

## Comandos

| Comando na raiz | Destino |
| --- | --- |
| `npm run dev` ou `npm run dev:inteligencia` | Desenvolvimento do painel. |
| `npm run build` ou `npm run build:inteligencia` | Build do painel e geração do pacote da extensão. |
| `npm start` ou `npm run start:inteligencia` | Servidor do painel. |
| `npm run extension:build` | Extensão em `extensions/pnr-connector/dist` e ZIP para download pelo painel. |
| `npm run lint` | Scripts de lint definidos pelos workspaces. |
| `npm run typecheck` | Scripts de typecheck definidos pelos workspaces. |
| `npm test` | Testes definidos pelos workspaces; os testes do conector continuam junto aos testes do painel. |
| `npm run audit:perf` | Auditoria estática do painel. |

Os comandos `prefatura:backfill`, `drivers:sync` e `test:watch` continuam disponíveis na raiz, direcionados ao painel. Eles devem ser executados somente com o contexto e ambiente apropriados.

O Atendimento tem os comandos separados `dev:atendimento`, `build:atendimento` e `start:atendimento`. O pré-deploy aplica apenas seu schema dedicado no Aux.

## Arquitetura, segurança e operação

A documentação técnica atualizada e baseada no código está em:

- [Arquitetura dos dois aplicativos, bancos, SSO, conector e Ellie](docs/arquitetura-plataforma-alc.md)
- [Inventário das APIs e contratos de segurança](docs/api-contratos-alc.md)
- [Referências Context7 e matriz de compatibilidade](docs/referencias-context7.md)
- [Revisão de segurança, evidências, mitigação e riscos residuais](docs/seguranca-plataforma-alc.md)
- [Runbooks: desenvolvimento, Railway, coleta, MFA, WhatsApp e incidentes](docs/runbooks-plataforma-alc.md)
- [Layout de workspaces e filtros de deploy](docs/monorepo.md)

A extensão versionada neste repositório é **1.2.7**. A versão instalada em cada navegador precisa ser conferida separadamente.

## Publicação e próximos passos

Os serviços Railway utilizam a raiz compartilhada do monorepo, mas executam builds e comandos de início específicos. Atualmente existem dois Dockerfiles de serviço; a remoção planejada está isolada na PR #93 e depende da limpeza de `Dockerfile Path` em cada serviço da Railway. Veja o runbook antes de mudar o builder. A separação dos serviços e os filtros de arquivos estão descritos em [docs/monorepo.md](docs/monorepo.md).

O botão ALC Atendimento no menu lateral abre uma nova aba com a sessão já autenticada do Inteligência, preservando o mesmo Supabase Auth, MFA e perfil. A transferência usa um ticket cifrado de uso único, válido por 60 segundos. O Atendimento não possui login ou cadastro próprios; entradas diretas são encaminhadas ao painel. A Administração permanece dentro do Atendimento, na mesma aba.

- [Painel Inteligência ALC](apps/inteligencia/README.md)
- [Workspace do Atendimento](apps/atendimento/README.md)
- [Escopo inicial do Atendimento](docs/atendimento-escopo.md)
- [Conector PNR](extensions/pnr-connector/README.md)

Não versione credenciais, dados pessoais ou arquivos operacionais reais.

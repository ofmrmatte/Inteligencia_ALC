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

## Publicação e próximos passos

O contrato do Railway permanece: raiz do repositório, `npm run build` e `npm start`, publicando apenas o painel. A separação dos serviços e os filtros de arquivos estão descritos em [docs/monorepo.md](docs/monorepo.md).

O acesso ALC Atendimento no menu do painel abre uma nova aba. Uma credencial de uso único, válida por 60 segundos, transfere a sessão autenticada e preserva MFA e perfil. A Administração permanece dentro do Atendimento, na mesma aba.

- [Painel Inteligência ALC](apps/inteligencia/README.md)
- [Workspace do Atendimento](apps/atendimento/README.md)
- [Escopo inicial do Atendimento](docs/atendimento-escopo.md)
- [Conector PNR](extensions/pnr-connector/README.md)

Não versione credenciais, dados pessoais ou arquivos operacionais reais.

# ALC — monorepo

Este repositório contém aplicações operacionais distintas. Leia o README da raiz e as regras da aplicação antes de editar.

## Limites dos workspaces

- `apps/inteligencia`: painel existente, incluindo RH, APIs, testes, scripts e migrations próprios. Siga também `apps/inteligencia/AGENTS.md`.
- `apps/comunicador`: workspace reservado para o Comunicador ALC. Ainda não contém uma aplicação executável.
- `extensions/pnr-connector`: extensão compartilhada de coleta do Case Center. Preserve os contratos e permissões do navegador.
- `packages`: espaço para contratos e bibliotecas compartilhados quando houver consumidores reais.

Não importe componentes, APIs ou serviços privados de uma aplicação na outra. Compartilhamentos devem ser pacotes explícitos, sem credenciais, com contratos verificáveis. O alias `@/` do painel permanece restrito a `apps/inteligencia`.

## Dados e integração

- Nunca versione dados pessoais, IDs operacionais, tokens, documentos reais ou arquivos de ambiente.
- Credenciais privilegiadas permanecem no servidor da aplicação que as utiliza.
- Preserve autenticação, MFA, RLS, filtros por perfil/base e a separação dos bancos existentes.
- Reorganizar diretórios não autoriza migrations, disparos de mensagens ou mudanças de produção.
- O Comunicador será aberto pelo painel em outra aba; sua Administração pertencerá à mesma aplicação do Comunicador.

## Comandos e validação

Instale dependências na raiz com `npm ci`; mantenha um único `package-lock.json`. Cada workspace declara suas próprias dependências. Leia a documentação da versão instalada do Next.js antes de alterar sua configuração ou código.

Os comandos `npm run build` e `npm start` da raiz publicam e iniciam somente o painel, preservando o contrato atual do Railway. Não os transforme em um build ou start de todas as aplicações.

Para mudanças de estrutura ou aplicação, execute os gates aplicáveis na raiz:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Revise renomes, imports entre workspaces, distribuição do conector, arquivos ignorados e o diff antes de entregar. Registre falhas preexistentes e limites da validação. Mantenha serviços, variáveis e publicação de cada aplicação separados.

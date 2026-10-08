# Comunicador ALC

Workspace reservado para a aplicação própria de comunicação da ALC, separada do painel Inteligência e sem dependência de Chatwoot.

Esta etapa cria apenas a separação no monorepo. Não há páginas, APIs, agentes, banco, autenticação implementada neste workspace nem serviço publicado. Os modelos da Meta e as credenciais não fazem parte do código.

## Responsabilidades previstas

- Atendimento ao cliente para PNR aguardando comprovante ou com penalidade.
- Consulta de PNR pelos motoristas e notificação de novas ocorrências.
- Administração interna de usuários, números, integrações e automações.
- Histórico de conversas, comprovantes, tentativas de envio e intervenção humana.

O painel terá um link para abrir o Comunicador em nova aba. A Administração será uma seção da mesma aplicação, com controle de acesso próprio.

## Limites

As APIs e serviços privados do painel não devem ser importados diretamente. Contratos compartilhados, se necessários, serão pacotes explícitos em `packages`. As regras de autenticação existentes serão consideradas na implementação, preservando MFA e escopo por usuário/base.

WhatsApp, webhooks e automações pertencerão ao serviço do Comunicador, com variáveis server-side próprias. A extensão de coleta permanece em `extensions/pnr-connector`; sua expansão funcional será feita em uma etapa posterior.

Consulte [o escopo acordado](../../docs/comunicador-escopo.md) e [a organização dos serviços](../../docs/monorepo.md).

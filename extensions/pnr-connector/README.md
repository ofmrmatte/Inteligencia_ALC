# ALC PNR Connector

Extensão Chrome unpacked para consultar o Case Center e os dados do comprador no package-management pela sessão autenticada do navegador. Entrega somente dados normalizados ao Inteligência ALC e ao ALC Atendimento.

## Gerar e instalar

1. Na Bandeja PNR do painel, clique em **Instalar Conector PNR** e baixe o ZIP versionado no domínio do Inteligência ALC. Extraia o arquivo.
2. Abra `chrome://extensions`.
3. Ative **Modo do desenvolvedor**.
4. Clique em **Carregar sem compactação**.
5. Selecione a pasta extraída `alc-pnr-connector`.
6. Volte à Bandeja PNR e clique em **Verificar instalação**. Não é preciso manter a aba do Case Center aberta. A extensão prepara uma aba temporária inativa quando a consulta exige o contexto autenticado.

Ao atualizar, desative a versão anterior em `chrome://extensions` antes de carregar a nova pasta.

Na versão 1.2.4, falhas de carregamento ou redirecionamentos para login não fecham a aba auxiliar. As próximas tentativas reutilizam a mesma aba, evitando o ciclo de abrir/fechar. Autentique-se nessa aba ou abra uma listagem autenticada; erros continuam bloqueando a coleta. Abas de login não são removidas pela limpeza ociosa. Selecionar a aba transfere sua posse ao usuário, impedindo que a extensão a feche posteriormente.

O build local `npm run extension:build`, executado na raiz do monorepo, também gera `extensions/pnr-connector/dist` para instalação de desenvolvimento e o ZIP em `apps/inteligencia/public/downloads`. O build do painel gera o pacote automaticamente. O handshake prepara o contexto local do Case Center quando necessário e retorna a versão e disponibilidade, nunca cookies, tokens ou CSRF. A autenticação e as permissões de acesso são confirmadas durante as consultas reais.

## Coleta com progresso desde a versão 1.2.5

A extensão publica checkpoints por lote no Atendimento. A Visão Geral recupera o progresso após navegar para outra tela ou trocar de aba. Atualize a extensão em `chrome://extensions` para usar a coleta com progresso. O navegador e a sessão Mercado Livre precisam continuar ativos; fechar o navegador interrompe a coleta.

## Coleta incremental na versão 1.2.6

A extensão identifica as PNRs já cadastradas antes de consultar as timelines. PNRs idênticas são ignoradas; alterações no status são aplicadas sem substituir telefones, documentos ou histórico, e apenas PNRs novas (ou de outra competência) recebem o enriquecimento completo de detalhes e comprador. A contagem da sincronização inclui também os casos ignorados.

## Limites de segurança

- A extensão não usa `chrome.cookies`.
- Cookie, CSRF e sessão do Mercado Livre permanecem na origem `envios.adminml.com`.
- Somente casos PNR, timeline operacional e dados explícitos do comprador chegam às aplicações autorizadas. Documento de recebedor não é tratado como documento do comprador.
- O pacote aceita somente os dois domínios Railway oficiais e o Mercado Livre. Consulte [a revisão 1.2.3](../../docs/pnr-connector-1.2.3.md).

## Aba temporária 1.2.3

A listagem do Case Center deixa de ser um pré-requisito manual. Ao receber uma solicitação autorizada dos painéis, a extensão reutiliza a aba do Case Center já existente ou abre uma aba auxiliar `active:false`, sem roubar o foco. Ela mantém essa aba durante o processamento e a remove após cinco minutos ociosos. A extensão nunca fecha ou navega abas que o usuário abriu/ativou.

Essa aba é um detalhe técnico da integração MV3 para executar consultas no domínio Mercado Livre. O navegador deve permanecer aberto e a sessão do Mercado Livre válida; não é possível realizar coleta quando o computador estiver desligado. Sessões expiradas, respostas inválidas e erros de permissão continuam bloqueando a importação. A extensão não faz login automático nem coleta cookies. As consultas não geram disparos WhatsApp.

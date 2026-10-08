# ALC PNR Connector

Extensão Chrome unpacked para consultar o Case Center e os dados do comprador no package-management pela sessão autenticada do navegador. Entrega somente dados normalizados ao Inteligência ALC e ao ALC Atendimento.

## Gerar e instalar

1. Na Bandeja PNR do painel, clique em **Instalar Conector PNR** e baixe o ZIP versionado no domínio do Inteligência ALC. Extraia o arquivo.
2. Abra `chrome://extensions`.
3. Ative **Modo do desenvolvedor**.
4. Clique em **Carregar sem compactação**.
5. Selecione a pasta extraída `alc-pnr-connector`.
6. Volte à Bandeja PNR e clique em **Verificar instalação**. Mantenha aberta e autenticada uma aba em `https://envios.adminml.com/logistics/case-center/cases`.

Ao atualizar, desative a versão anterior em `chrome://extensions` antes de carregar a nova pasta.

O build local `npm run extension:build`, executado na raiz do monorepo, também gera `extensions/pnr-connector/dist` para instalação de desenvolvimento e o ZIP em `apps/inteligencia/public/downloads`. O build do painel gera o pacote automaticamente. O handshake retorna apenas disponibilidade da aba/sessão e versão, nunca cookies, tokens ou CSRF.

## Limites de segurança

- A extensão não usa `chrome.cookies`.
- Cookie, CSRF e sessão do Mercado Livre permanecem na origem `envios.adminml.com`.
- Somente casos PNR, timeline operacional e dados explícitos do comprador chegam às aplicações autorizadas. Documento de recebedor não é tratado como documento do comprador.
- O pacote aceita somente os dois domínios Railway oficiais e o Mercado Livre. Consulte [a validação operacional da versão 1.2.2](../../docs/pnr-connector-1.2.2.md).

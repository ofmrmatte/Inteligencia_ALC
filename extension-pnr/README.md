# ALC PNR Connector

Extensão Chrome unpacked usada somente para consultar a Bandeja PNR em uma aba já autenticada do Mercado Livre e entregar JSON normalizado ao Inteligência ALC.

## Gerar e instalar

1. Na Bandeja PNR do painel, clique em **Instalar Conector PNR** e baixe o ZIP versionado no domínio do Inteligência ALC. Extraia o arquivo.
2. Abra `chrome://extensions`.
3. Ative **Modo do desenvolvedor**.
4. Clique em **Carregar sem compactação**.
5. Selecione a pasta extraída `alc-pnr-connector`.
6. Volte à Bandeja PNR e clique em **Verificar instalação**. Mantenha aberta e autenticada uma aba em `https://envios.adminml.com/logistics/case-center/cases`.

Ao atualizar, desative a versão anterior em `chrome://extensions` antes de carregar a nova pasta.

O build local `npm run extension:build` também gera `extension-pnr/dist` para instalação de desenvolvimento e o ZIP em `public/downloads`. O build do painel gera o pacote automaticamente. O handshake retorna apenas disponibilidade da aba/sessão e versão, nunca cookies, tokens ou CSRF.

## Limites de segurança

- A extensão não usa `chrome.cookies`.
- Cookie, CSRF e sessão do Mercado Livre permanecem na origem `envios.adminml.com`.
- Somente casos PNR normalizados e a timeline operacional mínima chegam ao painel.
- A ponte aceita apenas os dois domínios oficiais, os previews Vercel deste projeto e `localhost`/`127.0.0.1` para desenvolvimento.

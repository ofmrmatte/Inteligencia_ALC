# ALC PNR Connector

Extensão Chrome unpacked usada somente para consultar a Bandeja PNR em uma aba já autenticada do Mercado Livre e entregar JSON normalizado ao Inteligência ALC.

## Gerar e instalar

1. Na raiz do projeto, execute `npm run extension:build`.
2. Abra `chrome://extensions`.
3. Ative **Modo do desenvolvedor**.
4. Clique em **Carregar sem compactação**.
5. Selecione a pasta `extension-pnr/dist`.
6. Mantenha aberta e autenticada uma aba em `https://envios.adminml.com/logistics/case-center/cases`.

## Limites de segurança

- A extensão não usa `chrome.cookies`.
- Cookie, CSRF e sessão do Mercado Livre permanecem na origem `envios.adminml.com`.
- Somente casos PNR normalizados e a timeline operacional mínima chegam ao painel.
- A ponte aceita apenas os dois domínios oficiais do painel e `localhost`/`127.0.0.1` para desenvolvimento.

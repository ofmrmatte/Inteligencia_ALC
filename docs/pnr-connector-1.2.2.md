# Conector PNR 1.2.2 — validação operacional

## Coleta de compradores

O package-management apresenta nome e telefone em inputs desabilitados na seção **Dados do comprador**, associados aos labels. O ID do envio é validado contra o ID renderizado na página. O endereço vem da seção **Endereço de entrega**. Dados e documentos da seção **Dados de quem recebeu** não são usados como identidade do comprador. Nos dois pacotes inspecionados, não apareceu documento na seção do comprador.

A extensão consulta páginas de detalhes existentes com a sessão do Mercado Livre no navegador, sem presumir uma API privada. A importação no Atendimento valida novamente envio, telefone e URL canônica antes de registrar o contato como verificado. Coletas parciais preservam complementos anteriores.

## Sincronização de detalhes

- Leitura do JSON Nordic por balanceamento do objeto, sem executar JavaScript da página nem depender do marcador de assets.
- Primeiro caso consultado antes do lote, concorrência máxima de 2, timeout por consulta e prazo por lote.
- Falhas gerais de sessão, acesso, formato, rede ou limite pausam o lote; os casos não consultados continuam pendentes.
- Timelines vazias ou incompletas não são marcadas como completas. O painel distingue falha da fonte de falha de persistência e mostra o diagnóstico.
- Consultas automáticas respeitam 30 minutos; foco na aba não inicia uma consulta adicional. Depois de falha geral, a retomada é explícita; HTTP 429 aguarda o intervalo seguinte.

## Instalação e teste real

1. Baixar a versão 1.2.2 pelo Inteligência ALC ou pelo Atendimento. O pacote oficial aceita somente os dois domínios de produção e o Mercado Livre.
2. Extrair o ZIP, carregar a pasta em `chrome://extensions` com o modo do desenvolvedor e recarregar as abas do Inteligência e do Atendimento. Remover a instalação anterior do pacote de preview, caso exista.
3. Manter o Mercado Livre autenticado no mesmo navegador, com o Case Center aberto. Conferir a versão da extensão no painel.
4. Na Bandeja PNR, retomar a sincronização de detalhes e acompanhar o primeiro diagnóstico e os contadores.
5. Para conferir um contato individual, abrir o envio em package-management, selecionar a PNR correspondente no Atendimento e usar a leitura do comprador. A coleta manual de clientes também enriquece os envios com os dados de package-management.

O pacote de preview, sua página de validação e o modo de build isolado foram removidos após autorização de publicação em produção. Não há alteração de autenticação, migração adicional de banco nem disparo manual de mensagens nesta entrega. A coleta manual mantém seu modo `collectOnly`.

## Limites da confirmação

Campos e separação entre comprador e recebedor foram conferidos em páginas reais autorizadas. Extração, pausa e persistência têm testes automatizados. O browser de inspeção não carregou a extensão unpacked; por isso a confirmação do processamento da fila real depende da versão oficial instalada no navegador com a sessão do Mercado Livre.

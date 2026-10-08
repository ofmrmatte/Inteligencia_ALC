# Conector PNR 1.2.3 — sessão auxiliar automática

## Problema corrigido
As versões anteriores exigiam uma aba aberta exatamente na URL da listagem `/logistics/case-center/cases`. O teste PING marcava a sessão como indisponível quando essa aba não existia, bloqueando o Sync PNR do Inteligência ALC e a coleta do ALC Atendimento apesar da extensão estar instalada.

## Comportamento
- No PING e nas leituras de página, competência, timeline e compradores, a extensão encontra uma listagem existente ou cria uma aba inativa para a sessão autorizada. Não é preciso abri-la manualmente.
- Consultas em lote reutilizam a aba sem roubar foco. Após cinco minutos ociosos, a extensão fecha apenas a aba criada por ela, nunca uma aba aberta/ativada pelo usuário.
- A competência usada no import do Inteligência ALC continua a ser **lida na interface do Case Center**, sem inventar outro período. Caso o Mercado Livre não informe competência, o processo deve indicar o erro e não importar período arbitrário.
- Autenticação no Mercado Livre continua obrigatória. Sem sessão válida, permissão ou resposta consistente, o conector fornece diagnóstico e não marca histórico PNR como concluído.
- O ALC Atendimento continua no modo de coleta sem envio ou enfileiramento de WhatsApp por padrão. Não foram alteradas as regras de elegibilidade do motorista.

## Atualização
Baixe a v1.2.3 na aba Conector & dados do Atendimento ou pelo Sync PNR do Inteligência; extraia; vá a `chrome://extensions`; substitua ou recarregue a versão instalada por `Carregar sem compactação`; atualize as abas dos dois painéis; clique em Verificar extensão. Para retomar os detalhes pendentes, use Sincronizar todos na área de Sync PNR. Não é necessário manter o Case Center aberto: a extensão cria e remove sua aba auxiliar automaticamente.

## Verificações
Testes de criação/reuso da aba inativa, preservação de aba aberta pelo usuário, limpeza por inatividade, leitura de competência e consulta de timelines executados no CI. Teste operacional com sessão Mercado Livre real exige a extensão instalada no navegador autorizado do usuário; o CI não reproduz o login externo.

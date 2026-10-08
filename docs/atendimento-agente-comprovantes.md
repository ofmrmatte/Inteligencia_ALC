# Agente de atendimento e comprovante da tratativa

## Motor identificado
O sistema atual usa uma árvore determinística em `lib/domain.ts` e `lib/worker.ts`, com entrega pela Meta WhatsApp Cloud API. Meta não fornece um modelo generativo ao bot. OpenAI e Gemini não estão conectados a esse fluxo de resposta. Qualquer migração para LLM exige opção explícita, credencial isolada, aprovação das instruções e testes sem mensagens reais.

## Regras de notificação
- Aguardando comprovante e Com penalidade: candidatos a notificações de motoristas, sujeitos a telefone, competência, aprovação de modelo Meta e deduplicação.
- Em aberto/revisão: **jamais** iniciar notificações a motoristas, inclusive se a conversa tiver janela de 24h. O motorista autenticado pode consultar o caso quando solicitar.
- Encerrada: somente consulta de histórico, sem disparos iniciais.
- A regra é aplicada na prévia, na criação do job e imediatamente antes do envio; também se aplica a jobs antigos ainda na fila.

## Tratativa de cliente
1. Abertura: contextualizar somente a entrega vinculada à conversa; perguntar se recebeu.
2. Recebido: perguntar a data e se o produto corresponde à compra. Não presumir nenhuma resposta.
3. Não recebido: perguntar por portaria, familiar e vizinhos. Se não localizado, registrar negativa, sinalizar equipe e não afirmar recebimento.
4. Produto divergente, dados insuficientes, solicitação de humano, ameaça ou reclamação: encaminhar para atendente sem prometer resultado do Mercado Livre.
5. Fechamento: agradecer, registrar o resultado que foi efetivamente confirmado e resolver quando o ciclo estiver concluído. Não afirmar que o caso foi alterado no Case Center.
6. Evidência: gerar somente a partir de mensagens recebidas/enviadas reais confirmadas pela Meta. Nunca usar notas internas, jobs pendentes ou texto inventado. Anexos e templates cujo texto exato não foi preservado precisam de confirmação adicional antes de servir como prova.

## Comprovante visual
O arquivo PNG apresenta um **layout inspirado no WhatsApp Web**, mas identifica claramente a origem como ALC Atendimento, não se passando por uma captura nativa. O cabeçalho mostra apenas número do cliente e avatar genérico, sem nome; mantém horário, ordem das mensagens e indicador de entrega apenas quando confirmado. A exportação é autenticada e restrita à conversa autorizada. O comprovante corresponde ao histórico completo disponível, sem editar nem escolher mensagens convenientes. Enquanto não há texto original de um template ou anexo íntegro, a exportação é bloqueada para evitar prova visual incompleta.

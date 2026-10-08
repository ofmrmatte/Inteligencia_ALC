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

## Roteiro aprovado para clientes e motoristas (2026-10-08 v2)
- **Identidade:** o nome comercial do agente será escolhido posteriormente; Tony é apenas nome de referência do guia e não deve aparecer no roteiro em produção.
- **C01:** novo modelo completo: saudação com nome do cliente, apresentação do operador como ALC Transportadora (entregas Mercado Livre), produto, valor da compra, data/hora da entrega registrada, ID de envio e pergunta aberta sobre recebimento. O template anterior `cliente_loss` não possui o campo Valor; o código exige `cliente_loss_v2` aprovado em pt_BR na Meta e os sete parâmetros de template (`customer_name`, `nome_disparou`, `product_name`, `delivery_date`, `delivery_time`, `product_id`, `purchase_value`). Se o modelo v2 não estiver aprovado ou se faltar valor, o disparo inicial é bloqueado. O modelo deve ser criado/aprovado na Meta com texto e parâmetros correspondentes antes da ativação.
- **C04:** se e somente se o cliente confirmou recebimento, informou data válida e confirmou produto correto, enviar orientação de encerramento da reclamação pelo aplicativo do Mercado Livre e concluir a conversa imediatamente, sem aguardar retorno sobre o encerramento. O registro no ALC é `recebimento_confirmado`; **não** significa reclamação encerrada nem muda a classificação da PNR no Case Center.
- **C05:** depois da negativa de recebimento, perguntar por familiar, portaria ou terceiros e aguardar resposta livre (sem botões numerados). A persistência da negativa/entrega não localizada encaminha ao setor de Loss.
- **M11:** evidência do motorista é somente a acareação manual entregue ao dispatcher responsável pela operação. Não instruir upload de foto/assinatura no agente, nem tratar arquivo recebido como comprovante. O assistente pode orientar o procedimento e transferir ao Loss.
- **M12:** não existe no roteiro dos motoristas; o relato de não recebimento é tratado pelo fluxo do cliente e, se trazido por motorista, encaminhado para análise humana.
- Os textos de referência estão versionados em `lib/agent-playbook.ts`. O motor determinístico usa os mesmos textos para C04, C05 e C07. O painel administrativo exibe os modelos e exemplos para homologação.
- **Não disparar mensagens reais em preview**, nem publicar automaticamente a PR #70 em produção.

## Inventário integral do roteiro (v3)
- **Clientes:** C01, C02, C03, C04, C05, C06, C07, C08, C09, C10, C11, C12, C13, C14 e C15. Todas as mensagens integrais estão em `CUSTOMER_STEPS` e disponíveis no painel Agente virtual e no preview.
- **Motoristas:** M01, M02, M03, M04, M05, M06, M07, M08, M09, M10, M11, M13, M14 e M15. M12 foi intencionalmente excluída do canal do motorista.
- **Fluxos executáveis em regras:** cliente: recebeu→data→produto correto→C04 (conversa concluída); não recebeu→consulta terceiros/portaria→C06 aguarda ou C07 Loss; recebimento por terceiro→autorização→data→produto; dúvida C10; produto divergente→C09 Loss; C12 dúvida sobre reclamação; C13 orientação de cartão; C14 takeover. C15 fica reservado a encerramento por equipe após tratativa humana, não é enviada depois da C04.
- **Motoristas em regras:** M01 boas-vindas, M02 nome, base e telefone/ID verificados→M03 identificação→M04 seleção por status; M05 comprovante, M06 penalidade, M07 revisão (consulta), M08 não faturado ainda sem mapeamento (Loss), M09 resultado vazio, M10 orientações, M11 acareação manual/dispatcher, M13 transferência, M14 menu, M15 encerramento. Para iniciar outra consulta após encerramento é necessário nova solicitação e validação de identidade.
- **Dados dinâmicos:** nome e base vêm do cadastro verificado; PNR e caso só são apresentados após controle de identidade. Placeholders não verificados não devem ser expostos como dados reais. O roteiro M08 não presume equivalência entre Não faturado e penalidade.
- **Preview:** simulador de cliente usa o mesmo `clientReply` determinístico do backend, com dados sintéticos e sem qualquer conexão Meta ou banco de produção; os textos completos de ambas as audiências aparecem no painel.


## Instruções editáveis e comprovantes em múltiplos prints
- Em **Ajustes → Agente virtual**, **Modelo de instruções** está separado em tratativas com clientes (C01–C15) e motoristas (M01–M15, sem M12). Cards começam recolhidos, com **Ver mais/Ver menos**, **Editar** e **Salvar**.
- Os textos, títulos e orientações de cada etapa são persistidos em `alc_atendimento.settings` sob `agent_instructions_v1`, com revisão otimista, validação de placeholders, autenticação administrativa e auditoria. Os roteiros editados passam a ser lidos pelo motor determinístico a cada nova mensagem, preservando controle de identidade, escopo, transferência e proibição de mutar automaticamente PNRs.
- As restrições no **Modelo de instruções** são editáveis como regras operacionais. Restrições mandatórias (LGPD, acesso e elegibilidade, não envio sem autorização e encerramento de PNR) permanecem impostas pelo código e não podem ser desligadas por um texto.
- O texto do primeiro contato C01 está vinculado a um **template Meta aprovado**; modificá-lo no painel não aprova nem substitui o modelo da Meta. É necessário homologar nova versão do template antes de iniciar disparos.
- A exportação autenticada passa a produzir `comprovante-<ID>.zip`, com a pasta `<ID>/print-01.png`, `print-02.png` e assim sucessivamente, mais `manifesto.json` com hash SHA-256 da conversa e de cada imagem.
- Cada print usa layout **inspirado** na conversa do WhatsApp Web (900x840), com cabeçalho contendo somente número + avatar genérico, balões, horários e sinais de entrega somente quando confirmados. O print identifica o arquivo como reconstituição do ALC, não captura nativa.
- Paginação é determinística, com verificação para não suprimir nenhum caractere ou mensagem. Em conversas muito longas, divide a fala em trechos rotulados. Se o histórico superar o limite seguro de 500 mensagens ou 80 páginas, a exportação falha explicitamente, sem cortar o comprovante.
- A pasta é entregue **dentro do ZIP baixado**. Não há escrita em disco efêmero do Railway nem retenção automática desses arquivos em um bucket. O banco continua sendo a origem do histórico real e a criação do pacote gera auditoria.
- O simulador de respostas foi removido da demonstração; os cards exibem o roteiro completo sem um teste conversacional adicional.

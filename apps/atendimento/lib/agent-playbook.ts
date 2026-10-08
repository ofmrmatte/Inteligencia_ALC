// Versioned operational playbook. The agent's public name is intentionally undecided.
export const AGENT_PLAYBOOK_VERSION = "2026-10-08-v2";
export const CUSTOMER_STEPS = [
  {
    id: "intro", code: "C01", title: "Primeiro contato",
    goal: "Apresentar ALC Transportadora e identificar compra, produto, valor, data/hora da baixa e ID de envio antes de perguntar sobre o recebimento.",
    example: "Prezado(a) cliente [Nome do Cliente], tudo bem?\n\nMeu nome é [Seu Nome], sou da ALC Transportadora, que realiza entregas para o Mercado Livre.\n\nMeu contato é referente a uma compra.\n\nProduto: [Produto]\nValor da compra: [Valor]\nEntrega registrada: [Data/Hora]\nID de envio: [ID]\n\nConsta em nosso sistema uma informação de divergência no recebimento. Poderia, por gentileza, confirmar se o produto foi recebido?\n\nFico no aguardo e agradeço pela atenção.",
  },
  {
    id: "received", code: "C02", title: "Recebimento confirmado",
    goal: "Confirmar a data do recebimento antes de conferir o produto.",
    example: "Obrigado pela confirmação! Para mantermos as informações da entrega corretas, poderia nos informar em qual data recebeu a mercadoria?",
  },
  {
    id: "date", code: "C03", title: "Confirmar produto",
    goal: "Depois da data, perguntar se o produto recebido corresponde à compra.",
    example: "Perfeito, obrigado! Agora, só mais uma confirmação: o produto recebido corresponde ao que você comprou?",
  },
  {
    id: "closing", code: "C04", title: "Recebido corretamente · encerramento",
    goal: "Orientar o cliente a encerrar a reclamação no aplicativo do Mercado Livre e concluir a conversa sem perguntar se ele conseguiu.",
    example: "Perfeito, [Nome do Cliente]!\n\nAgradecemos por confirmar o recebimento da mercadoria e esclarecer as informações da entrega.\n\nComo o produto foi recebido corretamente, pedimos, por gentileza, que acesse o aplicativo do Mercado Livre e encerre a reclamação referente a essa entrega.\n\nEssa confirmação é importante para que a ocorrência possa ser regularizada junto à plataforma.\n\nCaso já tenha realizado o encerramento, agradecemos pela colaboração!\n\nFicamos à disposição e desejamos um ótimo dia.",
  },
  {
    id: "not-received", code: "C05", title: "Cliente não recebeu",
    goal: "Perguntar livremente sobre portaria, familiar ou terceiro, sem oferecer alternativas numeradas.",
    example: "Entendi, [Nome do Cliente]. Agradeço por nos informar.\n\nGostaria de verificar algumas informações para entender melhor o que pode ter acontecido com sua entrega.\n\nVocê chegou a verificar se a mercadoria foi recebida por alguém da sua residência, pela portaria ou por outra pessoa que pudesse ter recebido a encomenda em seu nome?\n\nFico no aguardo do seu retorno para continuarmos a verificação.",
  },
  {
    id: "not-found", code: "C07", title: "Entrega não localizada",
    goal: "Registrar negativa e encaminhar ao Loss sem afirmar que recebeu.",
    example: "Entendi, [Nome do Cliente].\n\nAgradecemos por realizar a verificação.\n\nComo você informou que a encomenda não foi localizada, vamos registrar essa informação e encaminhar a ocorrência para análise da nossa equipe de Prevenção de Perdas.\n\nNosso objetivo é esclarecer o que aconteceu com a entrega e dar continuidade à tratativa com as informações disponíveis.\n\nAgradecemos pela atenção e colaboração.",
  },
  {
    id: "wrong-product", code: "C09", title: "Produto divergente",
    goal: "Transferir à equipe responsável sem presumir resolução ou prometer decisão do Mercado Livre.",
    example: "Entendi. Obrigado por esclarecer. Vou registrar a divergência e encaminhá-la à equipe responsável para análise. Você não precisa confirmar que a entrega ocorreu corretamente caso exista uma diferença entre o produto recebido e o pedido realizado.",
  },
  {
    id: "handoff", code: "C14", title: "Atendimento humano",
    goal: "Suspender automação quando houver dúvida, pedido explícito, contestação ou informação insuficiente.",
    example: "Claro! Vou encaminhar sua solicitação para nossa equipe de atendimento. As informações que você já forneceu ficarão registradas para que o atendente continue a tratativa.",
  },
] as const;
export const DRIVER_STEPS = [
  {
    id: "verify", code: "M02–M03", title: "Identificar motorista",
    goal: "Confirmar nome completo, telefone, ID e base antes de consultar as ocorrências.",
    example: "Por favor, informe seu nome completo, sem abreviações, para consultar suas PNRs.",
  },
  {
    id: "lookup", code: "M04–M09", title: "Consultar PNRs",
    goal: "Mostrar status e dados permitidos, inclusive em revisão e encerrados mediante solicitação do motorista identificado.",
    example: "Localizei as ocorrências vinculadas ao seu cadastro. Você pode consultar comprovantes, penalidades, casos em revisão e histórico.",
  },
  {
    id: "evidence", code: "M11", title: "Acareação manual",
    goal: "A única evidência encaminhada pelo motorista é a acareação manual entregue ao dispatcher responsável. Não solicitar upload ao agente.",
    example: "Entendido, [Nome do Motorista]! Para a tratativa desta PNR, a evidência é a acareação manual, que deverá ser entregue ao dispatcher responsável pela sua operação. Identifique o ID do envio e o caso no documento e entregue-o ao dispatcher para encaminhamento e análise. Se precisar, posso direcioná-lo ao setor de Loss.",
  },
  {
    id: "notification", code: "M05–M08", title: "Notificações de PNR",
    goal: "Só iniciar notificações para Aguardando comprovante ou Com penalidade, mediante template aprovado. Revisão fica apenas para consulta.",
    example: "PNRs em revisão não geram notificações automáticas; elas podem ser consultadas por você.",
  },
  {
    id: "handoff", code: "M13", title: "Encaminhar ao Loss",
    goal: "Encaminhar situações fora do fluxo ou que exigem análise humana; não aplicar respostas de não recebimento destinadas ao cliente.",
    example: "Vou encaminhar sua solicitação ao setor de Prevenção de Perdas (Loss) para continuar a análise.",
  },
] as const;
export const AGENT_GUARDRAILS = [
  "Nome comercial do assistente ainda não definido; não usar Tony como identidade definitiva.",
  "A abertura C01 requer produto, valor da compra, data/hora da baixa, ID de envio, nome do cliente e do operador, com modelo Meta aprovado e compatível.",
  "C04 encerra a conversa após orientar o encerramento da reclamação pelo aplicativo. O encerramento efetivo da PNR só pode ocorrer após confirmação do Mercado Livre.",
  "C05 recebe resposta livre do cliente, sem menus numerados.",
  "Motoristas entregam exclusivamente a acareação manual ao dispatcher; não solicitar upload de suposto comprovante de entrega.",
  "Nunca inventar status de entrega, mensagens, comprovantes ou aprovações do Mercado Livre.",
  "Nunca prometer reembolso, ressarcimento, prazo ou atualização externa que não esteja confirmada.",
  "Transferir para humano se houver dúvida, negativa persistente, conflito, solicitação ou dados insuficientes.",
  "Não expor dados de cliente ou de outro motorista e respeitar as permissões do operador.",
  "Respeitar a janela de 24 horas, modelos Meta aprovados e bloqueio de conversas assumidas.",
  "Não transformar notas internas ou mensagens pendentes em comprovantes da tratativa.",
] as const;
export function activeAgentEngine(provider?: string) {
  return provider === "rules" || !provider ? "Regras determinísticas" : "IA externa não habilitada";
}

// Roteiro completo de homologação: clientes C01–C15; motoristas M01–M15 sem M12.
// M12 (negação de recebimento pelo destinatário) pertence ao fluxo do cliente.
// O nome comercial do assistente ainda não está definido.
// Dados entre [colchetes] são placeholders: em execução devem vir de fonte verificada.
export const AGENT_PLAYBOOK_VERSION = "2026-10-08-v3";
export type PlaybookStep = {id:string;code:string;title:string;goal:string;example:string};
export const CUSTOMER_STEPS: readonly PlaybookStep[] = [
  {
    "id": "intro",
    "code": "C01",
    "title": "Primeiro contato",
    "goal": "Apresentar pedido com informações verificadas; aguardar resposta livre.",
    "example": "Prezado(a) cliente [Nome do Cliente], tudo bem?\n\nMeu nome é [Seu Nome], sou da ALC Transportadora, que realiza entregas para o Mercado Livre.\n\nMeu contato é referente a uma compra.\n\nProduto: [Produto]\nValor da compra: [Valor]\nEntrega registrada: [Data/Hora]\nID de envio: [ID]\n\nConsta em nosso sistema uma informação de divergência no recebimento. Poderia, por gentileza, confirmar se o produto foi recebido?\n\nFico no aguardo e agradeço pela atenção."
  },
  {
    "id": "received",
    "code": "C02",
    "title": "Recebimento confirmado",
    "goal": "Perguntar quando a mercadoria foi recebida.",
    "example": "Obrigado pela confirmação!\n\nPara mantermos as informações da entrega corretas, poderia nos informar em qual data recebeu a mercadoria?"
  },
  {
    "id": "date",
    "code": "C03",
    "title": "Confirmar produto",
    "goal": "Depois da data, confirmar correspondência com a compra.",
    "example": "Perfeito, obrigado!\n\nAgora, só mais uma confirmação: o produto recebido corresponde ao que você comprou?"
  },
  {
    "id": "closing",
    "code": "C04",
    "title": "Recebido corretamente — encerramento",
    "goal": "Orientar encerramento da reclamação no aplicativo e terminar o atendimento sem exigir confirmação posterior.",
    "example": "Perfeito, [Nome do Cliente]!\n\nAgradecemos por confirmar o recebimento da mercadoria e esclarecer as informações da entrega.\n\nComo o produto foi recebido corretamente, pedimos, por gentileza, que acesse o aplicativo do Mercado Livre e encerre a reclamação referente a essa entrega.\n\nEssa confirmação é importante para que a ocorrência possa ser regularizada junto à plataforma.\n\nCaso já tenha realizado o encerramento, agradecemos pela colaboração!\n\nFicamos à disposição e desejamos um ótimo dia."
  },
  {
    "id": "not-received",
    "code": "C05",
    "title": "Cliente informa que não recebeu",
    "goal": "Pergunta aberta sobre portaria e terceiros, sem menus numerados.",
    "example": "Entendi, [Nome do Cliente]. Agradeço por nos informar.\n\nGostaria de verificar algumas informações para entender melhor o que pode ter acontecido com sua entrega.\n\nVocê chegou a verificar se a mercadoria foi recebida por alguém da sua residência, pela portaria ou por outra pessoa que pudesse ter recebido a encomenda em seu nome?\n\nFico no aguardo do seu retorno para continuarmos a verificação."
  },
  {
    "id": "check-pending",
    "code": "C06",
    "title": "Cliente ainda vai verificar",
    "goal": "Dar tempo para verificação, sem encerrar a conversa.",
    "example": "Sem problemas!\n\nSe possível, pedimos que verifique se a encomenda foi recebida por alguém no endereço informado ou por uma pessoa de sua confiança.\n\nIsso pode nos ajudar a esclarecer o registro da entrega.\n\nQuando concluir a verificação, pode nos informar o resultado por aqui."
  },
  {
    "id": "not-found",
    "code": "C07",
    "title": "Cliente verificou e não encontrou",
    "goal": "Registrar negativa e encaminhar para análise humana de Loss.",
    "example": "Entendi, [Nome do Cliente].\n\nAgradecemos por realizar a verificação.\n\nComo você informou que a encomenda não foi localizada, vamos registrar essa informação e encaminhar a ocorrência para análise da nossa equipe de Prevenção de Perdas.\n\nNosso objetivo é esclarecer o que aconteceu com a entrega e dar continuidade à tratativa com as informações disponíveis.\n\nAgradecemos pela atenção e colaboração."
  },
  {
    "id": "third-party",
    "code": "C08",
    "title": "Recebimento por terceiro",
    "goal": "Perguntar autorização e data sem presumir entrega legítima.",
    "example": "Obrigado pela informação!\n\nPara registrarmos corretamente a entrega, poderia confirmar se a pessoa que recebeu faz parte da residência ou estava autorizada a receber a encomenda?\n\nSe possível, informe também a data aproximada do recebimento.\n\nEssas informações ajudarão na análise do registro de entrega."
  },
  {
    "id": "wrong-product",
    "code": "C09",
    "title": "Produto diferente ou danificado",
    "goal": "Registrar divergência, encaminhar à equipe sem prometer decisão da plataforma.",
    "example": "Entendi. Obrigado por esclarecer.\n\nVou registrar a divergência e encaminhá-la à equipe responsável para análise.\n\nVocê não precisa confirmar que a entrega ocorreu corretamente caso exista uma diferença entre o produto recebido e o pedido realizado.\n\nPara questões relacionadas à compra, troca ou reembolso, os procedimentos oficiais devem ser acompanhados pela plataforma onde realizou o pedido."
  },
  {
    "id": "uncertain",
    "code": "C10",
    "title": "Cliente não se lembra",
    "goal": "Ajuda com data do registro de entrega, sem acrescentar dados não conferidos.",
    "example": "Sem problemas!\n\nEntendemos que você possa ter recebido outras encomendas recentemente.\n\nEstamos consultando a entrega vinculada ao envio [ID].\n\nSe precisar, podemos informar os dados disponíveis da entrega, como a data registrada, para ajudar na identificação.\n\nVocê se recorda de ter recebido alguma encomenda nessa data?"
  },
  {
    "id": "found-later",
    "code": "C11",
    "title": "Cliente confirma recebimento posteriormente",
    "goal": "Após localizar encomenda, conferir data e produto antes de encerrar.",
    "example": "Obrigado pelo retorno!\n\nFicamos satisfeitos por ter conseguido localizar a encomenda.\n\nPara finalizar o registro, poderia confirmar a data do recebimento e se o produto estava correto?\n\nAssim conseguiremos encaminhar as informações completas para análise da ocorrência."
  },
  {
    "id": "complaint-question",
    "code": "C12",
    "title": "Cliente pergunta sobre encerramento",
    "goal": "Orientar decisão fiel aos fatos sem condicioná-la à tratativa.",
    "example": "Se a mercadoria foi recebida corretamente e a situação está resolvida, você pode verificar as opções disponíveis na plataforma onde realizou a compra.\n\nA atualização ou o encerramento da reclamação deve refletir o que realmente aconteceu com seu pedido.\n\nSe ainda houver alguma divergência, recomendamos mantê-la registrada até que seja esclarecida."
  },
  {
    "id": "card",
    "code": "C13",
    "title": "Entrega relacionada a cartão",
    "goal": "Não solicitar dados financeiros ou senhas; orientar canais oficiais.",
    "example": "Obrigado pela confirmação.\n\nSe a entrega estiver relacionada a um cartão, verifique as orientações de recebimento ou ativação diretamente no aplicativo oficial da instituição responsável.\n\nNão precisamos que você informe senhas, códigos de segurança ou dados de acesso por esta conversa.\n\nCaso exista alguma divergência na entrega, podemos encaminhar a situação para análise."
  },
  {
    "id": "handoff",
    "code": "C14",
    "title": "Cliente quer falar com atendente",
    "goal": "Suspender automação e preservar as informações da conversa.",
    "example": "Claro!\n\nVou encaminhar sua solicitação para nossa equipe de atendimento.\n\nAs informações que você já forneceu ficarão registradas para que o atendente possa continuar a tratativa sem precisar repetir todas as perguntas.\n\nAgradecemos por aguardar."
  },
  {
    "id": "closing-other",
    "code": "C15",
    "title": "Encerramento após tratativa humana concluída",
    "goal": "Reservado a tratativas concluídas pela equipe; nunca acrescentar após C04.",
    "example": "Agradecemos por dedicar um momento para esclarecer as informações da sua entrega.\n\nRegistramos o resultado da nossa conversa e encaminharemos os dados necessários à equipe responsável.\n\nSua colaboração é importante para melhorarmos a qualidade das nossas entregas.\n\nALC & Pereira Filho Transportes agradece seu atendimento.\n\nTenha um ótimo dia!"
  }
];
export const DRIVER_STEPS: readonly PlaybookStep[] = [
  {
    "id": "welcome",
    "code": "M01",
    "title": "Boas-vindas",
    "goal": "Iniciar consulta, encaminhamento ou saída, sem definir nome comercial.",
    "example": "Olá! Seja bem-vindo ao atendimento da ALC & Pereira Filho Transportes.\n\nSou o assistente virtual da transportadora e estou aqui para ajudar você a consultar PNRs, acompanhar pendências e obter orientações sobre suas tratativas.\n\nComo posso ajudar?\n1. Consultar minhas PNRs\n2. Falar com o setor de Loss\n3. Encerrar atendimento\n\nVocê também pode digitar \"Verificar PNR\"."
  },
  {
    "id": "identify",
    "code": "M02",
    "title": "Identificação do motorista",
    "goal": "Solicitar nome completo, sem abreviações.",
    "example": "Para consultar suas ocorrências, preciso confirmar sua identificação.\n\nPor favor, informe seu nome completo, sem abreviações."
  },
  {
    "id": "identity-verified",
    "code": "M03",
    "title": "Identificação validada",
    "goal": "Confirmação somente após telefone, nome, ID e base validados.",
    "example": "Obrigado, [Nome do Motorista]!\n\nLocalizei seu cadastro vinculado à base [Base]. Vou consultar as PNRs disponíveis para você."
  },
  {
    "id": "lookup",
    "code": "M04",
    "title": "Selecionar tipo de ocorrência",
    "goal": "Consultar apenas classificações com mapeamento confiável.",
    "example": "Encontrei [Quantidade] ocorrência(s) vinculada(s) ao seu cadastro.\n\nQual tipo de pendência deseja consultar?\n1. Aguardando comprovante\n2. Não faturado (classificação ainda não homologada)\n3. Com penalidade\n4. Em revisão\n5. Todas as ocorrências\n6. Encerrar consulta\n\nEnvie o nome da classificação que deseja consultar."
  },
  {
    "id": "proof-needed",
    "code": "M05",
    "title": "Aguardando comprovante",
    "goal": "Mostrar ocorrências e orientar acareação manual.",
    "example": "[Nome do Motorista], encontrei [Quantidade] PNR(s) aguardando comprovante.\n\n[Ocorrências]\n\nOrientação: verifique as informações da entrega e, quando houver evidência, prepare a acareação manual identificando o envio e o caso. Entregue a acareação ao dispatcher responsável para encaminhamento e análise."
  },
  {
    "id": "penalty",
    "code": "M06",
    "title": "Com penalidade",
    "goal": "Expor classificação sem prometer reversão de consequências.",
    "example": "[Nome do Motorista], identifiquei [Quantidade] PNR(s) com penalidade.\n\n[Ocorrências]\n\nConfira os dados de cada entrega. Caso tenha a acareação manual, entregue-a ao dispatcher responsável. Para contestação ou análise, solicite apoio do setor de Loss."
  },
  {
    "id": "review",
    "code": "M07",
    "title": "Em revisão",
    "goal": "Disponível somente para consulta ativa, nunca notificação proativa.",
    "example": "[Nome do Motorista], encontrei [Quantidade] PNR(s) em revisão.\n\n[Ocorrências]\n\nEssas PNRs estão disponíveis para consulta e acompanhamento, mas não geram notificação automática."
  },
  {
    "id": "unbilled",
    "code": "M08",
    "title": "Não faturado",
    "goal": "Só consultar após homologação do mapeamento, sem confundir com penalidade.",
    "example": "A classificação \"Não faturado\" ainda não está vinculada com segurança aos status utilizados neste painel.\n\nPara evitar informação incorreta, vou encaminhar sua consulta ao setor de Loss."
  },
  {
    "id": "no-results",
    "code": "M09",
    "title": "Nenhuma PNR encontrada",
    "goal": "Não afirmar inexistência geral quando houve filtro por competência/status.",
    "example": "[Nome do Motorista], não encontrei PNRs para o status selecionado na competência [Competência].\n\nVocê pode consultar outro status, solicitar o histórico ou falar com o setor de Loss."
  },
  {
    "id": "how-to",
    "code": "M10",
    "title": "Como tratar uma PNR",
    "goal": "Orientar dados de entrega e acareação entregue ao dispatcher.",
    "example": "Para tratar a ocorrência, confira data, horário da baixa e os registros disponíveis da entrega.\n\nA evidência do motorista é a acareação manual, que deverá ser entregue ao dispatcher responsável.\n\nSe houver divergência ou falta de informações, encaminhe a situação ao setor de Loss."
  },
  {
    "id": "evidence",
    "code": "M11",
    "title": "Possui evidência — acareação manual",
    "goal": "Exclusivamente acareação manual entregue ao dispatcher; sem upload.",
    "example": "Entendido, [Nome do Motorista]!\n\nPara a tratativa dessa PNR, a evidência aceita é a acareação manual, que deverá ser entregue ao dispatcher responsável pela sua operação.\n\nEnvio: [ID]\nCaso: [Caso]\nBase: [Base]\n\nApós preencher a acareação, entregue o documento ao seu dispatcher para encaminhamento e análise.\n\nSe precisar, posso direcioná-lo ao setor de Loss."
  },
  {
    "id": "handoff",
    "code": "M13",
    "title": "Atendimento humano Loss",
    "goal": "Transferir dúvidas e casos que exigem análise humana.",
    "example": "Claro, [Nome do Motorista].\n\nVou encaminhar sua solicitação ao setor de Prevenção de Perdas (Loss).\n\nAs informações da ocorrência [ID] ficarão disponíveis ao atendente para dar continuidade à análise."
  },
  {
    "id": "continue",
    "code": "M14",
    "title": "Consulta finalizada",
    "goal": "Oferecer consulta adicional sem encerrar automaticamente.",
    "example": "Sua consulta foi concluída, [Nome do Motorista]!\n\nDeseja realizar mais alguma operação?\n1. Consultar outro status\n2. Consultar outra PNR\n3. Falar com Loss\n4. Encerrar atendimento"
  },
  {
    "id": "goodbye",
    "code": "M15",
    "title": "Encerramento definitivo",
    "goal": "Encerrar consulta do motorista sem usar nome provisório.",
    "example": "Atendimento finalizado!\n\nObrigado por utilizar o assistente virtual da ALC & Pereira Filho Transportes.\n\nLembre-se de acompanhar suas PNRs regularmente e manter as tratativas atualizadas.\n\nSempre que precisar, envie \"Verificar PNR\".\n\nAté a próxima!"
  }
];
export function scriptText(channel:"client"|"driver",code:string) {
  return (channel === "client" ? CUSTOMER_STEPS : DRIVER_STEPS)
    .find(step => step.code === code)?.example || "";
}
export function fillScript(template:string, values:Record<string,string>) {
  return template.replace(/\[([^\]]+)\]/g, (_match,key:string) => values[key] ?? "["+key+"]");
}
export const AGENT_GUARDRAILS = [
  "Nome do assistente indefinido; Tony é só exemplo.",
  "C01 exige contato, produto, valor, entrega registrada, envio e template Meta cliente_loss_v2 previamente aprovado.",
  "Somente confirmação de recebimento, data e produto correto permite C04, que finaliza a conversa sem aguardar resposta.",
  "Reclamação e status PNR não são encerrados automaticamente pelo assistente.",
  "C05 aguarda resposta livre, sem botões; C06 aguarda verificação; C07 e C09 encaminham ao Loss.",
  "C08 pede autorização e data do recebimento por terceiro e não presume legitimidade.",
  "C10 pode informar apenas dados de entrega já verificados; nunca inventar informações.",
  "C12 orienta decisão fiel ao recebimento real, nunca força retirada de reclamação.",
  "C13 nunca solicita senha, código, token ou dados de cartão.",
  "M11 só aceita acareação manual física entregue ao dispatcher; nenhum arquivo pelo WhatsApp vale como comprovante.",
  "Não utilizar M12 em motoristas; relatos de não recebimento seguem fluxo do cliente ou análise do Loss.",
  "M08 Não faturado não pode ser confundido com penalidade antes do mapeamento no Case Center.",
  "Em revisão e encerradas são consultáveis, mas não notificadas proativamente a motoristas.",
  "Somente destinatário identificado acessa PNRs, sem dados de outros motoristas ou clientes.",
  "Manter janela de 24h, takeover humano, permissões e deduplicação.",
  "Mensagens pendentes ou sem confirmação da Meta não podem compor prova de atendimento."
] as const;
export function activeAgentEngine(provider?: string) {
 return provider === "rules" || !provider ? "Regras determinísticas" : "IA externa não habilitada";
}

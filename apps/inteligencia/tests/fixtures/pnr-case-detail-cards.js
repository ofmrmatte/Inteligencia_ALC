export const awaitingReceiptCase = {
  events: [{ id: 1, event_type: "CREATE_CASE_BY_CONSUMER", date_created: "2026-09-17T20:36:00Z" }],
  caseDetail: {
    billingPeriod: "202609Q2",
    cards: [
      {
        title: "Dados da reclamação",
        fields: [
          { label: "ID do envio", value: "48000000001" },
          { label: "Valor da compra", value: "R$ 23,90" },
          { label: "Nome do reclamante", value: "Compradora Homologação" },
          { label: "Designado para receber", value: "Recebedora Homologação" },
          { label: "ID de seguimento", value: "No -" },
          { label: "Mensaje del reclamo", value: "-" },
        ],
        products: [{ id: "PRODUTO-1", title: "Produto sanitizado", payment: { amount: 23.9, currency: "BRL" } }],
      },
      {
        title: "Dados de quem recebeu",
        fields: [
          { label: "Data de entrega", value: "17 de Setembro | 19:04hs" },
          { label: "Recebeu", value: "Comprador" },
          { label: "Nome completo", value: "Recebedora Homologação" },
          { label: "Documento", value: "DOC-SANITIZADO" },
        ],
      },
      {
        title: "Dados da rota",
        fields: [
          { label: "Rota", value: "ROTA-SANITIZADA" },
          { label: "Transportadora", value: "TRANSPORTADORA TESTE" },
          { label: "Transportador", value: "Motorista Homologação" },
          { label: "ID do motorista", value: "MOTORISTA-SANITIZADO" },
          { label: "Telefone", value: "TELEFONE-SANITIZADO" },
        ],
      },
    ],
  },
};

export const reviewedCancellationCase = {
  events: [
    { id: 1, event_type: "CREATE_CASE_BY_CONSUMER", date_created: "2026-09-04T14:01:00Z" },
    { id: 2, event_type: "UPDATE_STATUS_TO_BILL", date_created: "2026-09-10T22:09:00Z" },
    { id: 3, event_type: "UPDATE_STATUS_TO_ON_REVIEW", date_created: "2026-09-16T19:28:00Z", created_by: { name: "Operadora Revisão" } },
    { id: 4, event_type: "UPDATE_STATUS_TO_CLOSED_NOT_BILLED", date_created: "2026-09-16T19:29:00Z" },
  ],
  caseDetail: { billingPeriod: "202609Q2", reviewed_status: "reviewed" },
  cards: [{
    title: "Pedido de revisão",
    action: "Operadora Revisão pediu uma revisão do caso.",
    fields: [
      { label: "Mensagem", value: "Reembolso concluído" },
      { label: "Data", value: "16 de Setembro | 16:28hs" },
    ],
    files: [{ name: "evidencia_revisao.png" }],
  }],
};

export const reviewedBillingCase = {
  events: [
    { id: 1, event_type: "CREATE_CASE_BY_CONSUMER", date_created: "2026-08-01T16:26:00Z" },
    { id: 2, event_type: "ATTACHED_RECEIPT", date_created: "2026-08-03T16:18:00Z", created_by: { name: "Operador Comprovante" } },
    { id: 3, event_type: "UPDATE_STATUS_TO_ON_REVIEW", date_created: "2026-08-06T11:57:00Z", created_by: { name: "Operador Revisão" } },
    { id: 4, event_type: "UPDATE_STATUS_TO_IN_PROGRESS_ON_REVIEW", date_created: "2026-08-07T12:54:00Z" },
    { id: 5, event_type: "UPDATE_STATUS_TO_CLOSED_BILLED", date_created: "2026-08-07T13:36:00Z" },
  ],
  caseDetail: {
    billingPeriod: "202609Q2",
    preInvoiceNumber: "PREFATURA-SANITIZADA",
    reviewed_status: "reviewed",
  },
  cards: [
    {
      title: "Comprovante carregado",
      groups: [
        {
          title: "Resultado da revisão",
          fields: [
            { label: "Resultado", value: "O caso foi revisado e enviado para faturamento." },
            { label: "Mensagem", value: "A nova evidência é inválida." },
            { label: "Data", value: "7 de Agosto | 10:36hs" },
          ],
        },
        {
          title: "Comprovante",
          action: "Operador Comprovante carregou comprovante.",
          fields: [
            { label: "Descrição", value: "Produto não entregue" },
            { label: "Data", value: "3 de Agosto | 13:18hs" },
          ],
          files: [{ name: "evidencia_1.png" }, { name: "evidencia_2.png" }],
        },
      ],
    },
    {
      title: "Pedido de revisão",
      action: "Operador Revisão pediu uma revisão do caso.",
      fields: [{ label: "Data", value: "6 de Agosto | 08:57hs" }],
    },
  ],
};

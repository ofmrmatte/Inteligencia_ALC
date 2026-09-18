import { describe, expect, it } from "vitest";
import {
  extractCaseCenterDetail,
  findLabeledValue,
  normalizeCaseTimelineEvents,
} from "../extension-pnr/src/case-center.js";
import {
  awaitingReceiptCase,
  reviewedBillingCase,
  reviewedCancellationCase,
} from "./fixtures/pnr-case-detail-cards.js";

describe("extração semântica dos cards PNR", () => {
  it("extrai reclamação, recebedor e rota sem confundir placeholder com campo ausente", () => {
    const detail = extractCaseCenterDetail(awaitingReceiptCase);
    expect(detail).toMatchObject({
      buyerName: "Compradora Homologação",
      assignedReceiver: "Recebedora Homologação",
      complaintMessage: "",
      trackingId: "No -",
      deliveryAt: "17 de Setembro | 19:04hs",
      receivedBy: "Comprador",
      receiverName: "Recebedora Homologação",
      receiverDocument: "DOC-SANITIZADO",
      routeId: "ROTA-SANITIZADA",
      carrierName: "TRANSPORTADORA TESTE",
      driverName: "Motorista Homologação",
      driverId: "MOTORISTA-SANITIZADO",
      driverPhone: "TELEFONE-SANITIZADO",
    });
    expect(detail.products).toEqual([expect.objectContaining({ title: "Produto sanitizado", price: 23.9 })]);
    expect(findLabeledValue(awaitingReceiptCase, ["Mensaje del reclamo"])).toEqual({ found: true, placeholder: true, value: "-" });
    expect(findLabeledValue(awaitingReceiptCase, ["Campo inexistente"])).toEqual({ found: false, placeholder: false, value: "" });
  });

  it("separa pedido de revisão e resultado de anulação", () => {
    const detail = extractCaseCenterDetail(reviewedCancellationCase);
    expect(detail).toMatchObject({
      reviewRequestedBy: "Operadora Revisão",
      reviewRequestedAt: "16 de Setembro | 16:28hs",
      reviewMessage: "Reembolso concluído",
      reviewEvidenceNames: ["evidencia_revisao.png"],
      reviewOutcome: "Revisado pelo Mercado Livre e anulado.",
    });
    expect(normalizeCaseTimelineEvents(reviewedCancellationCase.events)).toHaveLength(4);
  });

  it("separa comprovante, revisão e resultado de faturamento", () => {
    const detail = extractCaseCenterDetail(reviewedBillingCase);
    expect(detail).toMatchObject({
      preInvoiceNumber: "PREFATURA-SANITIZADA",
      receiptStatus: "Comprovante carregado",
      receiptActorName: "Operador Comprovante",
      receiptAt: "3 de Agosto | 13:18hs",
      receiptMessage: "Produto não entregue",
      receiptEvidenceNames: ["evidencia_1.png", "evidencia_2.png"],
      reviewRequestedBy: "Operador Revisão",
      reviewOutcome: "O caso foi revisado e enviado para faturamento.",
      reviewOutcomeMessage: "A nova evidência é inválida.",
      reviewOutcomeAt: "7 de Agosto | 10:36hs",
    });
    expect(detail.reviewEvidenceNames).toEqual([]);
    expect(normalizeCaseTimelineEvents(reviewedBillingCase.events)).toHaveLength(5);
  });
});

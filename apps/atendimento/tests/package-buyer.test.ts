import { describe, expect, it } from "vitest";
import { packageBuyerFields, packageBuyerSchema } from "../lib/package-buyer";
const buyer = {
  shipmentId: "10000000001",
  name: "Cliente fictício",
  phone: "21999990000",
  address: "Rua Exemplo, 10",
  sourceUrl:
    "https://envios.adminml.com/logistics/package-management/package/10000000001",
  capturedAt: "2026-10-08T12:00:00Z",
};
describe("validação da coleta complementar do comprador", () => {
  it("valida o contato somente quando o envio e a fonte correspondem", () => {
    expect(packageBuyerFields(buyer, buyer.shipmentId)).toMatchObject({
      customerName: buyer.name,
      customerPhone: "5521999990000",
      customerVerified: true,
      customerSource: buyer.sourceUrl,
    });
    expect(packageBuyerFields(buyer, buyer.shipmentId)).not.toHaveProperty(
      "customerDocument",
    );
    expect(() => packageBuyerFields(buyer, "10000000002")).toThrow(
      "não corresponde",
    );
  });
  it.each([
    "http://envios.adminml.com/logistics/package-management/package/10000000001",
    "https://envios.adminml.com.evil.example/logistics/package-management/package/10000000001",
    "https://envios.adminml.com/logistics/package-management/package/10000000002",
    "https://envios.adminml.com/logistics/package-management/package/10000000001?token=test",
  ])("rejeita uma fonte incompatível", (sourceUrl) => {
    expect(packageBuyerSchema.safeParse({ ...buyer, sourceUrl }).success).toBe(
      false,
    );
  });
  it("não perde os contatos antigos em uma coleta parcial", () => {
    expect(packageBuyerFields(undefined, buyer.shipmentId)).toEqual({});
  });
});

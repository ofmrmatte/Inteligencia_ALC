import { templateContractContentVersion, type TemplateContract } from "../lib/template-contract";
import type { Channel, ChannelConfig } from "../lib/meta";

// Synthetic reviewed copy; this is not the text/category of the real Meta templates.
export const mockSender: ChannelConfig = {
  phoneId: "synthetic-phone-id", wabaId: "synthetic-waba-id", token: "synthetic-token",
  appSecret: "synthetic-secret", verifyToken: "", number: "",
};
const reviewedDriver: Omit<TemplateContract, "contentVersion"> = {
  channel: "driver", name: "pnraberta", language: "pt_BR", category: "UTILITY",
  sender: { phoneId: mockSender.phoneId, wabaId: mockSender.wabaId },
  headerText: "Olá {{nome_motorista}}", bodyText: "Motorista {{nome_motorista}}",
  footerText: "Mensagem automática", buttons: [{ type: "QUICK_REPLY", text: "Recebi" }],
  parameters: { header: ["nome_motorista"], body: ["nome_motorista"] },
};
const reviewedClient: Omit<TemplateContract, "contentVersion"> = {
  channel: "client", name: "cliente_loss_v2", language: "pt_BR", category: "UTILITY",
  sender: { phoneId: mockSender.phoneId, wabaId: mockSender.wabaId },
  headerText: null, footerText: null, buttons: [],
  bodyText: "Cliente {{customer_name}}, {{nome_disparou}}: {{product_name}}, {{delivery_date}}, {{delivery_time}}, {{product_id}}, {{purchase_value}}.",
  parameters: { header: [], body: ["customer_name", "nome_disparou", "product_name", "delivery_date", "delivery_time", "product_id", "purchase_value"] },
};
export const driverContract: TemplateContract = { ...reviewedDriver, contentVersion: templateContractContentVersion(reviewedDriver) };
export const clientContract: TemplateContract = { ...reviewedClient, contentVersion: templateContractContentVersion(reviewedClient) };
export const providerCatalog = [
  { id: "synthetic-driver-template", name: "pnraberta", status: "APPROVED", language: "pt_BR", category: "UTILITY", parameter_format: "NAMED", components: [
    { type: "HEADER", format: "TEXT", text: "Olá {{nome_motorista}}" },
    { type: "BODY", text: "Motorista {{nome_motorista}}" },
    { type: "FOOTER", text: "Mensagem automática" },
    { type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: "Recebi" }] },
  ] },
  { id: "synthetic-client-template", name: "cliente_loss_v2", status: "APPROVED", language: "pt_BR", category: "UTILITY", parameter_format: "NAMED", components: [
    { type: "BODY", text: "Cliente {{customer_name}}, {{nome_disparou}}: {{product_name}}, {{delivery_date}}, {{delivery_time}}, {{product_id}}, {{purchase_value}}." },
  ] },
];
export const reviewerId = "33333333-3333-4333-8333-333333333333";
export function reviewedRow(channel: Channel, revision = 1) {
  return { channel, revision, baseline: channel === "driver" ? driverContract : clientContract, reviewed_by: reviewerId };
}

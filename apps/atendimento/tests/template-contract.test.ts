import { describe, expect, it } from "vitest";
import {
  validateTemplateContract,
  type TemplateContract,
} from "../lib/template-contract";
import type { MetaTemplate } from "../lib/meta";

const template: MetaTemplate = {
  id: "provider-mock-id",
  name: "pnraberta",
  status: "APPROVED",
  language: "pt_BR",
  category: "UTILITY",
  components: [
    {
      type: "HEADER",
      format: "TEXT",
      text: "Olá {{nome_motorista}}",
    },
    {
      type: "BODY",
      text: "PNR de {{nome_motorista}}: {{shipment_id}}",
    },
    { type: "FOOTER", text: "Mensagem automática" },
    {
      type: "BUTTONS",
      buttons: [
        { type: "QUICK_REPLY", text: "Recebi" },
        { type: "URL", text: "Acompanhar", url: "https://example.test/status" },
      ],
    },
  ],
};
const contract: TemplateContract = {
  channel: "driver",
  name: template.name,
  language: "pt_BR",
  category: "UTILITY",
  bodyText: "PNR de {{nome_motorista}}: {{shipment_id}}",
  headerText: "Olá {{nome_motorista}}",
  buttons: [
    { type: "QUICK_REPLY", text: "Recebi" },
    { type: "URL", text: "Acompanhar", url: "https://example.test/status" },
  ],
  parameterValues: {
    nome_motorista: "Nome do responsável verificado",
    shipment_id: "mock-shipment-id",
  },
};
const payload = [
  {
    type: "header",
    parameters: [
      { type: "text", parameter_name: "nome_motorista", text: "Nome do responsável verificado" },
    ],
  },
  {
    type: "body",
    parameters: [
      { type: "text", parameter_name: "nome_motorista", text: "Nome do responsável verificado" },
      { type: "text", parameter_name: "shipment_id", text: "mock-shipment-id" },
    ],
  },
];

describe("Meta approved template contract", () => {
  it("validates provider catalog and returns rendered text plus content hash", () => {
    const evidence = validateTemplateContract(template, contract, payload);
    expect(evidence).toMatchObject({
      channel: "driver",
      category: "UTILITY",
      approvedBodyText: contract.bodyText,
      renderedBodyText: "PNR de Nome do responsável verificado: mock-shipment-id",
      approvedHeaderText: contract.headerText,
      renderedHeaderText: "Olá Nome do responsável verificado",
      approvedFooterText: "Mensagem automática",
      renderedFooterText: "Mensagem automática",
      buttons: contract.buttons,
    });
    expect(evidence.contentVersion).toMatch(/^[a-f0-9]{64}$/);
  });

  it.each([
    ["status", { ...template, status: "PENDING" }],
    ["language", { ...template, language: "en_US" }],
    ["category", { ...template, category: "MARKETING" }],
    ["body text", { ...template, components: [{ type: "BODY", text: "Different {{nome_motorista}} {{shipment_id}}" }, ...template.components.slice(1)] }],
    ["unknown component", { ...template, components: [...template.components, { type: "CAROUSEL" }] }],
    ["unsupported header", { ...template, components: template.components.map((c) => c.type === "HEADER" ? { ...c, format: "IMAGE" } : c) }],
    ["unsupported button", { ...template, components: template.components.map((c) => c.type === "BUTTONS" ? { type: "BUTTONS", buttons: [{ type: "COPY_CODE", text: "Copiar" }] } : c) }],
  ])("blocks an incompatible provider %s", (_reason, candidate) => {
    expect(() => validateTemplateContract(candidate as MetaTemplate, contract, payload)).toThrow(
      "Contrato do modelo Meta incompatível:",
    );
  });

  it("blocks reordered, missing, and semantically wrong parameters", () => {
    const bodyOnly = [payload[1]];
    expect(() => validateTemplateContract(template, contract, bodyOnly)).toThrow(/nomes ou ordem/);
    expect(() => validateTemplateContract(template, contract, [
      payload[0],
      { ...payload[1], parameters: [...payload[1].parameters].reverse() },
    ])).toThrow(/nomes ou ordem/);
    expect(() => validateTemplateContract(template, {
      ...contract,
      parameterValues: { ...contract.parameterValues, nome_motorista: "Nome de outro usuário" },
    }, payload)).toThrow(/semântica/);
  });

  it("fails closed on positional variables and dynamic URL buttons", () => {
    const positional = {
      ...template,
      components: template.components.map((c) => c.type === "BODY" ? { ...c, text: "Olá {{1}}" } : c),
    };
    expect(() => validateTemplateContract(positional, contract, payload)).toThrow();
    const dynamicButton = {
      ...template,
      components: template.components.map((c) => c.type === "BUTTONS" ? {
        type: "BUTTONS",
        buttons: [{ type: "URL", text: "Acompanhar", url: "https://example.test/{{shipment_id}}" }],
      } : c),
    };
    expect(() => validateTemplateContract(dynamicButton, contract, payload)).toThrow(/URL dinâmica/);
  });

  it("fails safely for malformed provider records and wrong channel names", () => {
    expect(() => validateTemplateContract(null, contract, payload)).toThrow(
      "Contrato do modelo Meta incompatível: estrutura desconhecida.",
    );
    expect(() => validateTemplateContract(
      { ...template, name: "cliente_loss_v2" },
      contract,
      payload,
    )).toThrow(/status, nome, idioma ou categoria/);
  });
});

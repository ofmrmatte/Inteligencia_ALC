import { describe, expect, it } from "vitest";
import { parseTemplateCatalog, parseTemplateContract, reviewTemplateContract, templateContractContentVersion, validateTemplateContract } from "../lib/template-contract";
import { clientContract, driverContract, providerCatalog } from "./meta-contract-fixtures";

const values = { nome_motorista: "Synthetic driver" };
const payload = ["header", "body"].map((type) => ({ type, parameters: [
  { type: "text", parameter_name: "nome_motorista", text: values.nome_motorista },
] }));

describe("reviewed Meta contract", () => {
  it("preserves exact rendered header/body/footer/buttons and a content hash", () => {
    const evidence = validateTemplateContract(providerCatalog[0], driverContract, payload, values);
    expect(evidence).toMatchObject({
      contentVersion: driverContract.contentVersion,
      renderedHeaderText: "Olá Synthetic driver", renderedBodyText: "Motorista Synthetic driver",
      approvedFooterText: "Mensagem automática", renderedFooterText: "Mensagem automática",
      renderedText: "Olá Synthetic driver\n\nMotorista Synthetic driver\n\nMensagem automática\n\nRecebi",
    });
    expect(reviewTemplateContract(driverContract, providerCatalog)).toEqual(driverContract);
  });

  it.each(["status", "language", "category", "body", "header", "footer", "buttons", "parameters"])(
    "blocks a provider change to %s instead of deriving a new baseline", (field) => {
      const candidate = structuredClone(providerCatalog[0]);
      if (field === "status") candidate.status = "PENDING";
      else if (field === "language") candidate.language = "en_US";
      else if (field === "category") candidate.category = "MARKETING";
      else if (field === "buttons") candidate.components[3].buttons![0].text = "Changed";
      else candidate.components[field === "header" ? 0 : field === "footer" ? 2 : 1].text = field === "parameters" ? "Motorista {{unknown}}" : "Changed";
      expect(() => reviewTemplateContract(driverContract, [candidate])).toThrow("Contrato do modelo Meta bloqueado");
      expect(driverContract.footerText).toBe("Mensagem automática");
    },
  );

  it.each([
    { ...driverContract, footerText: undefined },
    { ...driverContract, extra: true },
    { ...driverContract, contentVersion: "0".repeat(64) },
  ])("rejects incomplete, open-key or tampered baselines", (candidate) => {
    expect(() => parseTemplateContract(candidate)).toThrow();
  });

  it.each([
    { catalog: [{ ...providerCatalog[0], category: undefined }] }, { catalog: [null] },
    { catalog: [providerCatalog[0], providerCatalog[0]] },
    { catalog: [{ ...providerCatalog[0], unexpected: true }] },
  ])("rejects malformed or ambiguous catalogs", ({ catalog }) => {
    expect(() => parseTemplateCatalog(catalog)).toThrow();
  });

  it("checks named example structure without treating provider examples as send values", () => {
    const named = {
      ...providerCatalog[0], parameter_format: "NAMED",
      components: [
        { ...providerCatalog[0].components[0], example: { header_text_named_params: [{ param_name: "nome_motorista", example: "Example only" }] } },
        { ...providerCatalog[0].components[1], example: { body_text_named_params: [{ param_name: "nome_motorista", example: "Example only" }] } },
        ...providerCatalog[0].components.slice(2),
      ],
    };
    expect(validateTemplateContract(named, driverContract, payload, values).renderedText).not.toContain("Example only");
    expect(() => reviewTemplateContract(driverContract, [{ ...named, parameter_format: "POSITIONAL" }])).toThrow();
    const wrong = { ...named, components: [named.components[0], { ...named.components[1], example: { body_text_named_params: [{ param_name: "wrong", example: "Example only" }] } }, ...named.components.slice(2)] };
    expect(() => reviewTemplateContract(driverContract, [wrong])).toThrow(/nomes/);
    expect(() => reviewTemplateContract(driverContract, [{ ...named, components: [{ ...named.components[0], example: { body_text_named_params: [] } }, ...named.components.slice(1)] }])).toThrow(/schema/);
  });

  it("supports only static reviewed URL and phone buttons and preserves their destinations in evidence", () => {
    const buttons = [
      { type: "URL" as const, text: "View", url: "https://example.test/order" },
      { type: "PHONE_NUMBER" as const, text: "Call", phone_number: "+5511900000000" },
    ];
    const candidate = { ...driverContract, buttons };
    const contract = { ...candidate, contentVersion: templateContractContentVersion(candidate) };
    const provider = { ...providerCatalog[0], components: [...providerCatalog[0].components.slice(0, 3), { type: "BUTTONS", buttons }] };
    expect(validateTemplateContract(provider, contract, payload, values).buttons).toEqual(buttons);
    const dynamic = { ...contract, buttons: [{ type: "URL" as const, text: "View", url: "https://example.test/{{product_id}}" }] };
    expect(() => parseTemplateContract({ ...dynamic, contentVersion: templateContractContentVersion(dynamic) })).toThrow();
    const unknown = { ...contract, buttons: [{ type: "FLOW", text: "Open" }] };
    expect(() => parseTemplateContract(unknown)).toThrow();
  });

  it.each([
    { type: "text", parameter_name: "nome_motorista", text: "x".repeat(1025) },
    { type: "text", parameter_name: "nome_motorista", text: "line\nbreak" },
    { type: "text", parameter_name: "nome_motorista", text: values.nome_motorista, extra: true },
    { type: "text", parameter_name: "constructor", text: values.nome_motorista },
  ])("rejects unknown keys/names and unbounded parameter values", (parameter) => {
    expect(() => validateTemplateContract(providerCatalog[0], driverContract, [payload[0], { type: "body", parameters: [parameter] }], values)).toThrow();
  });

  it("rejects wrong semantic owner values, extra components and header overflow", () => {
    expect(() => validateTemplateContract(providerCatalog[0], driverContract, payload, { nome_motorista: "Other driver" })).toThrow(/semântica/);
    expect(() => validateTemplateContract(providerCatalog[0], driverContract, [...payload, payload[0]], values)).toThrow();
    expect(() => validateTemplateContract(providerCatalog[0], driverContract, payload, { ...values, constructor: "unexpected" })).toThrow();
    const longValues = { nome_motorista: "x".repeat(60) };
    const longPayload = payload.map((component) => ({ ...component, parameters: [{ ...component.parameters[0], text: longValues.nome_motorista }] }));
    expect(() => validateTemplateContract(providerCatalog[0], driverContract, longPayload, longValues)).toThrow(/renderizado/);
  });
  it("bounds approved body and the expanded body independently", () => {
    expect(() => parseTemplateContract({ ...driverContract, bodyText: "x".repeat(1025) })).toThrow();
    const clientValues = Object.fromEntries(clientContract.parameters.body.map((name) => [name, "x".repeat(900)]));
    const components = [{ type: "body", parameters: clientContract.parameters.body.map((name) => ({ type: "text", parameter_name: name, text: clientValues[name] })) }];
    expect(() => validateTemplateContract(providerCatalog[1], clientContract, components, clientValues)).toThrow(/renderizado/);
  });
});

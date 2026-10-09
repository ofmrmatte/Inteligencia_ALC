import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { templateParameters, type CaseRecord } from "./domain";
import { HttpError } from "./auth";
import type { Channel, ChannelConfig } from "./meta";
import { templateContractDraftSchema, templateParameterNameSchema as parameterName, templateButtonSchema as buttonSchema, templateCategorySchema as categorySchema } from "./template-contract-fields";

export class TemplateContractError extends HttpError {
  constructor(reason: string) {
    super(409, `Contrato do modelo Meta bloqueado: ${reason}.`);
  }
}
function parse<T>(schema: z.ZodType<T>, input: unknown, reason: string): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new TemplateContractError(reason);
  return result.data;
}

const valueSchema = z.string().min(1).max(1024).refine(
  (value) => Boolean(value.trim()) && !/[\u0000-\u001f\u007f]/.test(value),
);
const driverValues = z.object({ nome_motorista: valueSchema }).strict();
const clientValues = z.object({
  customer_name: valueSchema, nome_disparou: valueSchema, product_name: valueSchema,
  delivery_date: valueSchema, delivery_time: valueSchema,
  product_id: valueSchema, purchase_value: valueSchema,
}).strict();
const exampleParameter = z.object({ param_name: z.string().min(1).max(100), example: z.string().max(1024) }).strict();
const headerExampleSchema = z.object({
  header_text: z.array(z.string().max(1024)).max(10).optional(),
  header_text_named_params: z.array(exampleParameter).max(20).optional(),
}).strict();
const bodyExampleSchema = z.object({
  body_text: z.array(z.array(z.string().max(1024)).max(20)).max(10).optional(),
  body_text_named_params: z.array(exampleParameter).max(20).optional(),
}).strict();
const componentSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("HEADER"), format: z.literal("TEXT"), text: z.string().min(1).max(60), example: headerExampleSchema.optional() }).strict(),
  z.object({ type: z.literal("BODY"), text: z.string().min(1).max(1024), example: bodyExampleSchema.optional() }).strict(),
  z.object({ type: z.literal("FOOTER"), text: z.string().min(1).max(60) }).strict(),
  z.object({ type: z.literal("BUTTONS"), buttons: z.array(buttonSchema).min(1).max(10) }).strict(),
]);
const catalogEntrySchema = z.object({
  id: z.string().min(1).max(200).optional(),
  name: z.string().regex(/^[a-z0-9_]{1,512}$/),
  status: z.enum(["APPROVED", "PENDING", "REJECTED", "PAUSED", "DISABLED"]),
  language: z.string().min(1).max(35),
  category: categorySchema,
  parameter_format: z.enum(["NAMED", "POSITIONAL"]),
  components: z.array(componentSchema).min(1).max(4),
}).strict();
const contractSchema = templateContractDraftSchema.extend({
  sender: z.object({ phoneId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/), wabaId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/) }).strict(),
  contentVersion: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type TemplateContract = z.infer<typeof contractSchema>;

function variables(text: string) {
  const names: string[] = [];
  const remainder = text.replace(/{{([^{}]*)}}/g, (_, name: string) => {
    if (!/^[a-z][a-z0-9_]*$/.test(name)) throw new TemplateContractError("parâmetro nomeado desconhecido");
    if (!names.includes(name)) names.push(name);
    return "";
  });
  if (remainder.includes("{{") || remainder.includes("}}")) throw new TemplateContractError("marcação de parâmetro inválida");
  return names;
}
function content(contract: Omit<TemplateContract, "channel" | "sender" | "contentVersion">) {
  return {
    name: contract.name, status: "APPROVED", language: contract.language,
    category: contract.category, bodyText: contract.bodyText,
    headerText: contract.headerText, footerText: contract.footerText,
    buttons: contract.buttons, parameters: contract.parameters,
  };
}
export function templateContractContentVersion(contract: Parameters<typeof content>[0]) {
  return createHash("sha256").update(JSON.stringify(content(contract))).digest("hex");
}
export function parseTemplateContract(input: unknown): TemplateContract {
  const contract = parse(contractSchema, input, "baseline ausente, desconhecido ou inválido");
  const expectedNames = contract.channel === "driver"
    ? { header: ["nome_motorista"], body: ["nome_motorista"] }
    : { header: [], body: Object.keys(clientValues.shape) };
  if (
    contract.name !== (contract.channel === "driver" ? "pnraberta" : "cliente_loss_v2") ||
    !isDeepStrictEqual(contract.parameters, expectedNames) ||
    !isDeepStrictEqual(variables(contract.bodyText), contract.parameters.body) ||
    !isDeepStrictEqual(contract.headerText === null ? [] : variables(contract.headerText), contract.parameters.header) ||
    (contract.footerText !== null && variables(contract.footerText).length) ||
    contract.buttons.some((button) => variables(button.text).length || (button.type === "URL" && (variables(button.url).length || !/^https?:\/\//.test(button.url)))) ||
    templateContractContentVersion(contract) !== contract.contentVersion
  ) throw new TemplateContractError("baseline diverge do canal, parâmetros ou hash revisados");
  return contract;
}
export function parseTemplateCatalog(input: unknown) {
  let serialized: string | undefined;
  try { serialized = JSON.stringify(input); } catch { /* malformed non-JSON input */ }
  if (!serialized || serialized.length > 262144) throw new TemplateContractError("catálogo ausente ou acima do limite");
  const catalog = parse(z.array(catalogEntrySchema).max(100), input, "schema do catálogo inválido");
  const identities = catalog.map((entry) => `${entry.name}:${entry.language}`);
  if (new Set(identities).size !== identities.length) throw new TemplateContractError("catálogo ambíguo");
  return catalog;
}
function matchApproved(templateValue: unknown, contract: TemplateContract) {
  const template = parse(catalogEntrySchema, templateValue, "schema do modelo inválido");
  if (template.status !== "APPROVED" || template.parameter_format === "POSITIONAL")
    throw new TemplateContractError("modelo não APPROVED ou parâmetros incompatíveis");
  const components = parse(z.array(componentSchema).min(1).max(4), template.components, "componente, cabeçalho ou botão não suportado");
  if (new Set(components.map((entry) => entry.type)).size !== components.length)
    throw new TemplateContractError("componentes duplicados");
  const body = components.find((entry) => entry.type === "BODY");
  if (!body) throw new TemplateContractError("corpo aprovado ausente");
  const header = components.find((entry) => entry.type === "HEADER");
  const footer = components.find((entry) => entry.type === "FOOTER");
  const buttons = components.find((entry) => entry.type === "BUTTONS");
  if (header?.example?.header_text || body.example?.body_text)
    throw new TemplateContractError("exemplos posicionais incompatíveis com parâmetros nomeados");
  for (const [examples, names] of [
    [header?.example?.header_text_named_params, header ? variables(header.text) : []],
    [body.example?.body_text_named_params, variables(body.text)],
  ] as const) {
    if (examples && !isDeepStrictEqual(examples.map((example) => example.param_name), names))
      throw new TemplateContractError("nomes dos parâmetros do catálogo divergentes");
  }
  const actual = {
    name: template.name, status: template.status, language: template.language,
    category: template.category, bodyText: body.text, headerText: header?.text ?? null,
    footerText: footer?.text ?? null, buttons: buttons?.buttons ?? [],
    parameters: { header: header ? variables(header.text) : [], body: variables(body.text) },
  };
  if (!isDeepStrictEqual(actual, content(contract)))
    throw new TemplateContractError("catálogo diverge do texto, rodapé, botões ou parâmetros revisados");
  if (templateContractContentVersion(contract) !== contract.contentVersion)
    throw new TemplateContractError("hash de conteúdo divergente");
}
export function reviewTemplateContract(input: unknown, catalogValue: unknown) {
  const contract = parseTemplateContract(input);
  const catalog = parseTemplateCatalog(catalogValue);
  const approved = catalog.find((entry) => entry.name === contract.name && entry.language === contract.language);
  if (!approved) throw new TemplateContractError("Modelo aprovado indisponível");
  matchApproved(approved, contract);
  return contract;
}
export function assertTemplateSender(contract: TemplateContract, config: ChannelConfig) {
  if (contract.sender.phoneId !== config.phoneId || contract.sender.wabaId !== config.wabaId)
    throw new TemplateContractError("canal remetente diverge do baseline revisado");
}

const payloadComponentsSchema = z.array(z.object({
  type: z.enum(["header", "body"]),
  parameters: z.array(z.object({ type: z.literal("text"), parameter_name: parameterName, text: valueSchema }).strict()).min(1).max(7),
}).strict()).max(2);
export function semanticTemplateValues(channel: Channel, record: CaseRecord, operator: string) {
  return Object.fromEntries(templateParameters(channel, record, operator)
    .flatMap((component) => component.parameters.map((parameter) => [parameter.parameter_name, parameter.text])));
}
export function validateTemplateContract(
  templateValue: unknown, expected: unknown, payloadComponents: unknown, parameterValues: unknown,
) {
  const contract = parseTemplateContract(expected);
  matchApproved(templateValue, contract);
  const values = parse<Record<string, string>>(contract.channel === "driver" ? driverValues : clientValues, parameterValues, "valores semânticos ausentes, desconhecidos ou acima do limite");
  const components = parse(payloadComponentsSchema, payloadComponents, "chaves ou valores dos parâmetros de envio inválidos");
  const requiredTypes = ["header", "body"] as const;
  for (const type of requiredTypes) {
    const matched = components.filter((component) => component.type === type);
    const names = contract.parameters[type];
    if (matched.length !== (names.length ? 1 : 0) || !isDeepStrictEqual(matched[0]?.parameters.map((parameter) => parameter.parameter_name) ?? [], names))
      throw new TemplateContractError("nomes ou ordem dos parâmetros divergentes");
    if (matched[0]?.parameters.some((parameter) => values[parameter.parameter_name] !== parameter.text))
      throw new TemplateContractError("semântica dos parâmetros divergente");
  }
  const render = (text: string | null) => text === null ? null : text.replace(/{{([a-z][a-z0-9_]*)}}/g, (_, name: string) => values[name]);
  const renderedHeaderText = render(contract.headerText);
  const renderedBodyText = render(contract.bodyText)!;
  if ((renderedHeaderText?.length ?? 0) > 60 || renderedBodyText.length > 4096)
    throw new TemplateContractError("texto renderizado acima do limite");
  return {
    channel: contract.channel, name: contract.name, language: contract.language,
    category: contract.category, contentVersion: contract.contentVersion,
    approvedBodyText: contract.bodyText, renderedBodyText,
    approvedHeaderText: contract.headerText, renderedHeaderText,
    approvedFooterText: contract.footerText, renderedFooterText: contract.footerText,
    buttons: contract.buttons, parameterValues: values,
    renderedText: [renderedHeaderText, renderedBodyText, contract.footerText, ...contract.buttons.map((button) => button.text)]
      .filter((text) => text !== null).join("\n\n"),
  };
}
export type TemplateEvidence = ReturnType<typeof validateTemplateContract>;

const graphTemplatePayloadSchema = z.object({
  messaging_product: z.literal("whatsapp"), to: z.string().regex(/^[1-9]\d{7,14}$/),
  type: z.literal("template"),
  template: z.object({ name: z.string(), language: z.object({ code: z.literal("pt_BR") }).strict(), components: payloadComponentsSchema }).strict(),
}).strict();
export function parseTemplatePayload(input: unknown, contract: TemplateContract, recipient: string) {
  const payload = parse(graphTemplatePayloadSchema, input, "payload Graph desconhecido ou inválido");
  if (payload.to !== recipient || payload.template.name !== contract.name)
    throw new TemplateContractError("telefone ou modelo do payload diverge da fila");
  return payload;
}

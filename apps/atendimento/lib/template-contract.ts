import {
  templateContentVersion,
  type Channel,
  type MetaTemplate,
} from "./meta";

type SupportedButton = {
  type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER";
  text: string;
  url?: string;
  phone_number?: string;
};

export type TemplateContract = {
  channel: Channel;
  name: string;
  language: string;
  category: "UTILITY" | "MARKETING" | "AUTHENTICATION";
  bodyText: string;
  headerText: string | null;
  buttons: SupportedButton[];
  parameterValues: Record<string, string>;
};

export type TemplateEvidence = {
  channel: Channel;
  name: string;
  language: string;
  category: string;
  contentVersion: string;
  approvedBodyText: string;
  renderedBodyText: string;
  approvedHeaderText: string | null;
  renderedHeaderText: string | null;
  approvedFooterText: string | null;
  renderedFooterText: string | null;
  buttons: SupportedButton[];
};

function fail(reason: string): never {
  throw new Error(`Contrato do modelo Meta incompatível: ${reason}.`);
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return fail("estrutura desconhecida");
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  if (typeof value !== "string") return fail("texto ausente ou inválido");
  return value;
}

function variables(value: string) {
  const found: string[] = [];
  const stripped = value.replace(/{{([^{}]*)}}/g, (_, name: string) => {
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name))
      fail("parâmetro nomeado desconhecido");
    if (!found.includes(name)) found.push(name);
    return "";
  });
  if (stripped.includes("{{") || stripped.includes("}}"))
    fail("marcação de parâmetro desconhecida");
  return found;
}

function render(value: string | null, values: Record<string, string>) {
  if (value === null) return null;
  return value.replace(/{{([A-Za-z][A-Za-z0-9_]*)}}/g, (_, name: string) => {
    if (!(name in values)) fail("parâmetro sem valor semântico");
    return values[name];
  });
}

function normalizeButtons(component: Record<string, unknown> | undefined) {
  if (!component) return [] as SupportedButton[];
  if (!Array.isArray(component.buttons)) return fail("botões desconhecidos");
  return component.buttons.map((value) => {
    const button = object(value);
    const type = text(button.type) as SupportedButton["type"];
    const label = text(button.text);
    if (variables(label).length) return fail("variável em rótulo de botão");
    if (type === "QUICK_REPLY") return { type, text: label };
    if (type === "URL") {
      const url = text(button.url);
      if (variables(url).length) return fail("URL dinâmica não suportada");
      return { type, text: label, url };
    }
    if (type === "PHONE_NUMBER")
      return { type, text: label, phone_number: text(button.phone_number) };
    return fail("tipo de botão não suportado");
  });
}

function payloadParameters(components: unknown) {
  if (!Array.isArray(components)) return fail("parâmetros de envio ausentes");
  const result: Record<string, string[]> = {};
  const values: Record<string, string> = {};
  for (const raw of components) {
    const component = object(raw);
    const type = text(component.type);
    if (type !== "body" && type !== "header")
      return fail("componente de envio não suportado");
    if (type in result || !Array.isArray(component.parameters))
      return fail("parâmetros duplicados ou inválidos");
    result[type] = [];
    for (const rawParameter of component.parameters) {
      const parameter = object(rawParameter);
      const name = text(parameter.parameter_name);
      const value = text(parameter.text);
      if (
        parameter.type !== "text" ||
        result[type].includes(name) ||
        (name in values && values[name] !== value) ||
        !value.trim()
      )
        return fail("parâmetro nomeado inválido");
      result[type].push(name);
      values[name] = value;
    }
  }
  return { names: result, values };
}

export function validateTemplateContract(
  templateValue: unknown,
  expected: TemplateContract,
  payloadComponents: unknown,
): TemplateEvidence {
  const catalog = object(templateValue);
  const template = catalog as unknown as MetaTemplate;
  const name = text(catalog.name);
  const status = text(catalog.status);
  const language = text(catalog.language);
  const category = text(catalog.category);
  if (
    status !== "APPROVED" ||
    name !== expected.name ||
    name !== (expected.channel === "driver" ? "pnraberta" : "cliente_loss_v2") ||
    language !== "pt_BR" ||
    language !== expected.language ||
    category !== expected.category
  )
    fail("status, nome, idioma ou categoria divergente");
  if (!Array.isArray(template.components)) return fail("componentes ausentes");

  let body: Record<string, unknown> | undefined;
  let header: Record<string, unknown> | undefined;
  let buttons: Record<string, unknown> | undefined;
  let footer: Record<string, unknown> | undefined;
  for (const raw of template.components) {
    const component = object(raw);
    switch (component.type) {
      case "BODY":
        if (body) return fail("corpos duplicados");
        body = component;
        break;
      case "HEADER":
        if (header) return fail("cabeçalhos duplicados");
        header = component;
        break;
      case "BUTTONS":
        if (buttons) return fail("grupos de botões duplicados");
        buttons = component;
        break;
      case "FOOTER":
        if (footer) return fail("rodapés duplicados");
        footer = component;
        break;
      default:
        return fail("componente Meta não suportado");
    }
  }

  const bodyText = text(body?.text);
  const headerText = header
    ? header.format === "TEXT"
      ? text(header.text)
      : fail("formato de cabeçalho não suportado")
    : null;
  const footerText = footer ? text(footer.text) : null;
  if (bodyText !== expected.bodyText || headerText !== expected.headerText)
    fail("texto aprovado diverge do baseline");
  if (footerText !== null && variables(footerText).length)
    fail("variável em rodapé não suportada");
  const actualButtons = normalizeButtons(buttons);
  if (JSON.stringify(actualButtons) !== JSON.stringify(expected.buttons))
    fail("botões aprovados divergem do baseline");

  const { names, values } = payloadParameters(payloadComponents);
  const expectedNames = Object.keys(expected.parameterValues);
  for (const [componentName, componentText] of [
    ["body", bodyText],
    ["header", headerText],
  ] as const) {
    const variablesInText = componentText === null ? [] : variables(componentText);
    const payloadNames = names[componentName] || [];
    if (
      JSON.stringify(payloadNames) !== JSON.stringify(variablesInText) ||
      payloadNames.some((name) => !(name in expected.parameterValues))
    )
      fail("nomes ou ordem dos parâmetros divergentes");
  }
  if (
    Object.keys(values).length !== expectedNames.length ||
    expectedNames.some((name) => values[name] !== expected.parameterValues[name])
  )
    fail("semântica dos parâmetros divergente");

  return {
    channel: expected.channel,
    name,
    language,
    category,
    contentVersion: templateContentVersion(template),
    approvedBodyText: bodyText,
    renderedBodyText: render(bodyText, values)!,
    approvedHeaderText: headerText,
    renderedHeaderText: render(headerText, values),
    approvedFooterText: footerText,
    renderedFooterText: footerText,
    buttons: actualButtons,
  };
}

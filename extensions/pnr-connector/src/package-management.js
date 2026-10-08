// This function is self-contained because Chrome serializes it into the ML tab.
// Buyer fields are scoped to their card; receiver documents are never promoted.
export async function readPackageBuyersInTab({
  shipmentIds = [],
  currentPageOnly = false,
} = {}) {
  const failure = (code, message) => ({ ok: false, code, message });
  if (location.hostname !== "envios.adminml.com")
    return failure(
      "MERCADO_LIVRE_NOT_DETECTED",
      "Abra uma aba autenticada do Mercado Livre.",
    );
  const normalize = (value) =>
    String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();
  const clean = (value) =>
    String(value || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 500);
  const parse = (root, shipmentId, sourceUrl, live = false) => {
    const visible = (el) => !live || Boolean(el?.getClientRects().length);
    const card = (title) => {
      const heading = [...root.querySelectorAll("h3")].find(
        (el) => visible(el) && normalize(el.textContent) === normalize(title),
      );
      let parent = heading?.parentElement;
      while (parent && parent !== root.body) {
        if (parent.querySelectorAll("h3").length !== 1) return null;
        if (parent.querySelector("label,input,dt")) return parent;
        parent = parent.parentElement;
      }
      return null;
    };
    const field = (scope, names) => {
      if (!scope) return "";
      const wanted = new Set(names.map(normalize));
      for (const label of scope.querySelectorAll("label,dt")) {
        if (!visible(label) || !wanted.has(normalize(label.textContent)))
          continue;
        const targetId = label.getAttribute("for");
        const input = targetId
          ? [...scope.querySelectorAll("input,textarea")].find(
              (el) => el.id === targetId,
            )
          : label.querySelector("input,textarea");
        if (input && visible(input)) return clean(input.value);
        const next = label.nextElementSibling;
        if (next && visible(next)) return clean(next.textContent);
      }
      return "";
    };
    const renderedId = [...root.querySelectorAll("h4")]
      .filter(visible)
      .map((el) => clean(el.textContent))
      .find((text) => /^\d{1,30}$/.test(text));
    if (renderedId !== shipmentId)
      return failure(
        "SHIPMENT_MISMATCH",
        "O ID exibido no pacote não corresponde ao envio solicitado.",
      );
    const buyer = card("Dados do comprador");
    if (!buyer)
      return failure(
        "INVALID_RESPONSE",
        "Dados do comprador não encontrados no package-management.",
      );
    const name = field(buyer, ["Nome completo", "Nome do comprador"]);
    const phone = field(buyer, ["Telefone", "Telefone do comprador"]);
    if (
      !name ||
      !phone ||
      !/^\+?[\d\s().-]{10,25}$/.test(phone) ||
      /[*•]/.test(phone)
    )
      return failure(
        "BUYER_CONTACT_INCOMPLETE",
        "Nome ou telefone do comprador indisponível ou mascarado neste envio.",
      );
    const addressCard = card("Endereço de entrega");
    const addressFields = Object.fromEntries(
      Object.entries({
        street: ["Rua"],
        number: ["Número"],
        postalCode: ["CEP"],
        neighborhood: ["Bairro"],
        city: ["Cidade"],
        state: ["Estado"],
        extra: ["Mais dados"],
        reference: ["Referências (opcional)", "Referência (opcional)"],
        type: ["Tipo de endereço"],
      }).map(([key, labels]) => [key, field(addressCard, labels)]),
    );
    const address = clean(
      [
        addressFields.street,
        addressFields.number,
        addressFields.neighborhood,
        addressFields.city,
        addressFields.state,
        addressFields.postalCode,
        addressFields.extra,
        addressFields.reference,
      ]
        .filter(Boolean)
        .join(", "),
    );
    return {
      ok: true,
      data: {
        shipmentId,
        name,
        phone,
        document: field(buyer, [
          "CPF",
          "CPF do comprador",
          "Documento",
          "Documento do comprador",
        ]),
        address,
        addressFields,
        sourceUrl,
        capturedAt: new Date().toISOString(),
      },
    };
  };
  if (currentPageOnly) {
    const match =
      /^\/logistics\/package-management\/package\/(\d{1,30})\/?$/.exec(
        location.pathname,
      );
    if (!match)
      return failure(
        "INVALID_RESPONSE",
        "Abra os detalhes de um envio em package-management.",
      );
    if (
      shipmentIds.length &&
      (shipmentIds.length !== 1 || shipmentIds[0] !== match[1])
    )
      return failure(
        "SHIPMENT_MISMATCH",
        "O envio aberto não corresponde a esta PNR.",
      );
    return parse(
      document,
      match[1],
      `${location.origin}/logistics/package-management/package/${match[1]}`,
      true,
    );
  }
  const ids = [...new Set(shipmentIds.map(String))];
  if (
    !ids.length ||
    ids.length > 50 ||
    ids.some((id) => !/^\d{1,30}$/.test(id))
  )
    return failure("INVALID_RESPONSE", "Lote de envios inválido.");
  const results = [];
  let stopped = false;
  for (const shipmentId of ids) {
    if (stopped) {
      results.push({
        shipmentId,
        ...failure(
          "BATCH_PAUSED",
          "Lote interrompido pela falha anterior; envio permanece pendente.",
        ),
      });
      continue;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const sourceUrl = `${location.origin}/logistics/package-management/package/${shipmentId}`;
      const response = await fetch(sourceUrl, {
        credentials: "include",
        signal: controller.signal,
      });
      let result;
      const target = response.url ? new URL(response.url) : new URL(sourceUrl);
      if (
        response.status === 401 ||
        target.origin !== location.origin ||
        target.pathname !== new URL(sourceUrl).pathname
      )
        result = failure(
          "MERCADO_LIVRE_SESSION_REQUIRED",
          "Entre novamente no Mercado Livre para consultar o package-management.",
        );
      else if (response.status === 403)
        result = failure(
          "MERCADO_LIVRE_ACCESS_DENIED",
          "A sessão não possui acesso ao package-management.",
        );
      else if (response.status === 429)
        result = failure(
          "RATE_LIMITED",
          "Mercado Livre limitou a coleta do package-management (HTTP 429).",
        );
      else if (!response.ok)
        result = failure(
          "HTTP_ERROR",
          `Package-management respondeu HTTP ${response.status}.`,
        );
      else
        result = parse(
          new DOMParser().parseFromString(await response.text(), "text/html"),
          shipmentId,
          sourceUrl,
        );
      results.push({ shipmentId, ...result });
      stopped =
        !result.ok &&
        [
          "MERCADO_LIVRE_SESSION_REQUIRED",
          "MERCADO_LIVRE_ACCESS_DENIED",
          "RATE_LIMITED",
          "INVALID_RESPONSE",
        ].includes(result.code);
    } catch (error) {
      results.push({
        shipmentId,
        ...failure(
          error?.name === "AbortError" ? "REQUEST_TIMEOUT" : "HTTP_ERROR",
          "Não foi possível carregar os dados do comprador; nenhuma informação foi substituída.",
        ),
      });
      stopped = true;
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: true, data: { results } };
}

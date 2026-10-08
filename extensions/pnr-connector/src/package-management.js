// Reads only explicit buyer labels in a page the user already opened.
// It never treats a receiver/porter as the buyer or guesses a private API.
export function readPackageBuyerInTab() {
  if (
    location.hostname !== "envios.adminml.com" ||
    !location.pathname.includes("package-management")
  )
    return {
      ok: false,
      message: "Abra os detalhes do envio em package-management.",
    };
  const labels = {
    shipmentId: ["ID do envio", "ID de envio", "Shipment ID"],
    name: ["Nome do comprador", "Comprador", "Nombre del comprador"],
    phone: ["Telefone do comprador", "Teléfono del comprador"],
    document: ["CPF do comprador", "Documento do comprador"],
    address: [
      "Endereço do comprador",
      "Endereço de entrega",
      "Dirección de entrega",
    ],
  };
  const normal = (text) =>
    String(text || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();
  const read = (names) => {
    const wanted = new Set(names.map(normal));
    for (const element of document.querySelectorAll(
      "dt,label,th,[data-testid]",
    )) {
      if (
        !element.getClientRects().length ||
        !wanted.has(normal(element.textContent))
      )
        continue;
      const next = element.nextElementSibling;
      if (next?.getClientRects().length)
        return String(next.textContent || "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 500);
    }
    return "";
  };
  const fields = Object.fromEntries(
    Object.entries(labels).map(([key, names]) => [key, read(names)]),
  );
  if (!fields.shipmentId || !fields.name || !fields.phone)
    return {
      ok: false,
      message:
        "A página não expõe ID do envio, nome e telefone com identificação explícita de comprador. Não foi inferido nenhum contato.",
    };
  return {
    ok: true,
    data: {
      ...fields,
      sourceUrl: location.href,
      capturedAt: new Date().toISOString(),
    },
  };
}

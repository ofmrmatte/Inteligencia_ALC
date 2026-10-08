import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import { readPackageBuyersInTab } from "../../../extensions/pnr-connector/src/package-management.js";
const shipmentId = "10000000001";
const html = (id = shipmentId, phone = "21999990000") => `<h4>${id}</h4>
<section><div><h3>Dados do comprador</h3></div><label for="buyer-name">Nome completo</label><div><input id="buyer-name" disabled value="Compradora Fictícia"></div><label for="buyer-phone">Telefone</label><div><input id="buyer-phone" disabled value="${phone}"></div></section>
<section><h3>Endereço de entrega</h3><label for="street">Rua</label><input id="street" disabled value="Rua Exemplo"><label for="number">Número</label><input id="number" disabled value="10"><label for="city">Cidade</label><input id="city" disabled value="Cidade Exemplo"><label for="zip">CEP</label><input id="zip" disabled value="00000000"></section>
<section><h3>Dados de quem recebeu</h3><label for="receiver-name">Nome completo</label><input id="receiver-name" disabled value="Recebedor Fictício"><label for="receiver-doc">Documento</label><input id="receiver-doc" disabled value="CPF fictício"></section>`;
beforeEach(() => {
  const dom = new JSDOM(html());
  dom.window.HTMLElement.prototype.getClientRects = () => [{}];
  vi.stubGlobal("document", dom.window.document);
  vi.stubGlobal("DOMParser", dom.window.DOMParser);
  vi.stubGlobal("location", {
    hostname: "envios.adminml.com",
    origin: "https://envios.adminml.com",
    pathname: `/logistics/package-management/package/${shipmentId}`,
  });
});
afterEach(() => vi.unstubAllGlobals());
describe("dados do comprador no package-management", () => {
  it("lê inputs desabilitados dentro do cartão do comprador, sem copiar o CPF do recebedor", async () => {
    const result = await readPackageBuyersInTab({
      currentPageOnly: true,
      shipmentIds: [shipmentId],
    });
    expect(result).toMatchObject({
      ok: true,
      data: {
        shipmentId,
        name: "Compradora Fictícia",
        phone: "21999990000",
        document: "",
        address: "Rua Exemplo, 10, Cidade Exemplo, 00000000",
        addressFields: {
          street: "Rua Exemplo",
          number: "10",
          city: "Cidade Exemplo",
        },
      },
    });
    expect(JSON.stringify(result)).not.toContain("Recebedor Fictício");
    expect(JSON.stringify(result)).not.toContain("CPF fictício");
  });
  it("rejeita o envio aberto diferente da PNR selecionada", async () => {
    expect(
      await readPackageBuyersInTab({
        currentPageOnly: true,
        shipmentIds: ["10000000002"],
      }),
    ).toMatchObject({ ok: false, code: "SHIPMENT_MISMATCH" });
  });
  it("consulta HTML pela sessão da origem e valida o ID renderizado", async () => {
    const fetch = vi.fn(async () => new Response(html(), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    expect(
      await readPackageBuyersInTab({ shipmentIds: [shipmentId] }),
    ).toMatchObject({
      ok: true,
      data: {
        results: [
          { ok: true, data: { shipmentId, name: "Compradora Fictícia" } },
        ],
      },
    });
    expect(fetch.mock.calls[0][1].credentials).toBe("include");
    fetch.mockResolvedValueOnce(new Response(html("10000000002")));
    expect(
      (await readPackageBuyersInTab({ shipmentIds: [shipmentId] })).data
        .results[0],
    ).toMatchObject({ ok: false, code: "SHIPMENT_MISMATCH" });
  });
  it("interrompe o lote quando falta acesso e deixa os outros envios pendentes", async () => {
    const fetch = vi.fn(async () => new Response("", { status: 403 }));
    vi.stubGlobal("fetch", fetch);
    const result = await readPackageBuyersInTab({
      shipmentIds: [shipmentId, "10000000002"],
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.data.results.map((x) => x.code)).toEqual([
      "MERCADO_LIVRE_ACCESS_DENIED",
      "BATCH_PAUSED",
    ]);
  });
  it("não valida telefone vazio ou mascarado", async () => {
    const dom = new JSDOM(html(shipmentId, "***90000"));
    dom.window.HTMLElement.prototype.getClientRects = () => [{}];
    vi.stubGlobal("document", dom.window.document);
    expect(await readPackageBuyersInTab({ shipmentIds: [shipmentId], currentPageOnly: true })).toMatchObject({ ok: false, code: "BUYER_CONTACT_INCOMPLETE" });
  });
});

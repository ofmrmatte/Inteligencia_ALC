import { describe, expect, it } from "vitest";
import { assertSafeArchivePath, classifyPaymentArchive, pdfLooksValid, pnrStatusToTicket } from "@/lib/driver-portal";

const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);

describe("portal do motorista", () => {
  it("bloqueia path traversal em arquivo compactado", () => {
    expect(() => assertSafeArchivePath("../base/motorista.pdf")).toThrow("caminho inválido");
    expect(() => assertSafeArchivePath("base/app.exe")).toThrow("executáveis");
  });

  it("reconhece assinatura de PDF", () => {
    expect(pdfLooksValid(pdfBytes)).toBe(true);
    expect(pdfLooksValid(new Uint8Array([1, 2, 3]))).toBe(false);
  });

  it("classifica PDF identificado e duplicado por hash", async () => {
    const drivers = [{ id: "d1", driverCode: "MOT123", fullName: "João Silva", baseKey: "BASE1", baseName: "Base 1" }];
    const first = await classifyPaymentArchive([{ path: "BASE1/JULHO 2026/MOT123 pagamento.pdf", bytes: pdfBytes, size: pdfBytes.length }], drivers, new Set());
    expect(first[0]).toMatchObject({ status: "identified", driverCode: "MOT123", period: "2026-07" });
    const duplicated = await classifyPaymentArchive([{ path: "BASE1/JULHO 2026/MOT123 copia.pdf", bytes: pdfBytes, size: pdfBytes.length }], drivers, new Set([first[0].fileHash]));
    expect(duplicated[0].status).toBe("duplicate");
  });

  it("não identifica PDF usando apenas nome do motorista", async () => {
    const drivers = [{ id: "d1", driverCode: "MOT123", fullName: "João Silva", baseKey: "BASE1", baseName: "Base 1" }];
    const [result] = await classifyPaymentArchive([{ path: "BASE1/JULHO 2026/Joao Silva pagamento.pdf", bytes: pdfBytes, size: pdfBytes.length }], drivers, new Set());
    expect(result.status).toBe("unidentified");
    expect(result.driverCode).toBe("");
  });

  it("mapeia status PNR para categorias do portal", () => {
    expect(pnrStatusToTicket("Aguardando comprovante")).toBe("aguardando_comprovante");
    expect(pnrStatusToTicket("Enviado para faturamento")).toBe("enviado_faturamento");
    expect(pnrStatusToTicket("Anulado")).toBe("anulado");
  });
});

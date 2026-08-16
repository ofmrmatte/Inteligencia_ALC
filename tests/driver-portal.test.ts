import { describe, expect, it } from "vitest";
import { zipSync } from "fflate";
import { assertSafeArchivePath, classifyPaymentArchive, extractArchiveFiles, paymentArchiveContext, pdfLooksValid, pnrStatusToTicket } from "@/lib/driver-portal";

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

  it("ignora entradas de diretório em ZIP", async () => {
    const zip = zipSync({
      "BASE_BARUERI_02-08-26_A_08-08-26/": new Uint8Array(),
      "BASE_BARUERI_02-08-26_A_08-08-26/JOAO SILVA_08-08-26.pdf": pdfBytes,
    });
    const files = await extractArchiveFiles("BASE_BARUERI_02-08-26_A_08-08-26.zip", zip);
    expect(files).toHaveLength(1);
    expect(files[0].path).toContain("JOAO SILVA_08-08-26.pdf");
  });

  it("extrai base e semana do padrão DDS", () => {
    const context = paymentArchiveContext("BASE_BARUERI_02-08-26_A_08-08-26.zip", [
      { baseKey: "BARUERI", baseName: "Barueri", sigla: "SSP5" },
    ]);
    expect(context).toEqual({
      baseKey: "BARUERI",
      baseName: "Barueri",
      sigla: "SSP5",
      period: "02/08/2026 a 08/08/2026",
      periodStart: "2026-08-02",
      periodEnd: "2026-08-08",
    });
  });

  it("classifica PDF identificado e duplicado por hash", async () => {
    const drivers = [{ id: "d1", driverCode: "123456", fullName: "João Silva", baseKey: "BASE1", baseName: "Base 1" }];
    const first = await classifyPaymentArchive([{ path: "BASE1/JULHO 2026/123456 pagamento.pdf", bytes: pdfBytes, size: pdfBytes.length }], drivers, new Set());
    expect(first[0]).toMatchObject({ status: "identified", driverCode: "123456", period: "2026-07" });
    const duplicated = await classifyPaymentArchive([{ path: "BASE1/JULHO 2026/123456 copia.pdf", bytes: pdfBytes, size: pdfBytes.length }], drivers, new Set([first[0].fileHash]));
    expect(duplicated[0].status).toBe("duplicate");
  });

  it("identifica por nome exato quando existe um único ID numérico canônico", async () => {
    const drivers = [
      { id: "d1", driverCode: "3465555", fullName: "Antonio Carlos Lima Araujo", baseKey: "BARUERI", baseName: "Barueri", sigla: "SSP5" },
      { id: "legacy", driverCode: "ANTONIOCARLOSLIMAARAUJO", fullName: "Antonio Carlos Lima Araujo", baseKey: "BARUERI", baseName: "Barueri", sigla: "SSP5" },
    ];
    const [result] = await classifyPaymentArchive(
      [{ path: "BASE_BARUERI_02-08-26_A_08-08-26/ANTONIO CARLOS LIMA ARAUJO_08-08-26.pdf", bytes: pdfBytes, size: pdfBytes.length }],
      drivers,
      new Set(),
      { archiveName: "BASE_BARUERI_02-08-26_A_08-08-26.zip", bases: [{ baseKey: "BARUERI", baseName: "Barueri", sigla: "SSP5" }] },
    );
    expect(result).toMatchObject({
      status: "identified",
      driverCode: "3465555",
      baseKey: "BARUERI",
      sigla: "SSP5",
      period: "02/08/2026 a 08/08/2026",
      documentDate: "2026-08-08",
    });
  });

  it("mantém ambiguidade de nome como conflito", async () => {
    const drivers = [
      { id: "d1", driverCode: "111111", fullName: "João Silva", baseKey: "BASE1", baseName: "Base 1" },
      { id: "d2", driverCode: "222222", fullName: "João Silva", baseKey: "BASE1", baseName: "Base 1" },
    ];
    const [result] = await classifyPaymentArchive([{ path: "BASE1/JULHO 2026/Joao Silva.pdf", bytes: pdfBytes, size: pdfBytes.length }], drivers, new Set());
    expect(result.status).toBe("conflict");
  });

  it("mapeia status PNR para categorias do portal", () => {
    expect(pnrStatusToTicket("Aguardando comprovante")).toBe("aguardando_comprovante");
    expect(pnrStatusToTicket("Enviado para faturamento")).toBe("enviado_faturamento");
    expect(pnrStatusToTicket("Anulado")).toBe("anulado");
  });
});

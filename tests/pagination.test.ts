import { describe, expect, it } from "vitest";
import { readPaged } from "@/lib/pagination";

async function fakeRead(total: number, pageSize: number) {
  const rows = Array.from({ length: total }, (_, id) => ({ id }));
  return readPaged(async (offset, size) => ({
    rows: rows.slice(offset, offset + size),
    count: total,
  }), pageSize);
}

describe("paginação Supabase/PostgREST", () => {
  it("lê 1.786 registros sem corte em 1.000", async () => {
    await expect(fakeRead(1786, 1000)).resolves.toHaveLength(1786);
  });

  it("lê mais de 10.000 registros em páginas", async () => {
    await expect(fakeRead(10037, 1000)).resolves.toHaveLength(10037);
  });

  it("falha quando a contagem informada diverge da carga", async () => {
    await expect(readPaged(async (offset, size) => ({
      rows: Array.from({ length: offset === 0 ? size : 0 }, (_, id) => ({ id })),
      count: 1001,
    }), 1000)).rejects.toThrow("Divergência de paginação");
  });
});

import { describe, expect, it } from "vitest";
import { findDuplicateFileHash } from "@/lib/import-dedupe";

describe("bloqueio de arquivo duplicado", () => {
  it("identifica hash já importado em outro lote", () => {
    const duplicate = findDuplicateFileHash(
      { batchId: "novo", fileHash: "hash-igual" },
      [
        { batchId: "novo", fileHash: "hash-igual" },
        { batchId: "anterior", fileHash: "hash-igual" },
      ],
    );
    expect(duplicate?.batchId).toBe("anterior");
  });
});

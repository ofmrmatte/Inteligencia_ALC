import { readFileSync, writeFileSync } from "node:fs";

const path = "components/views/reports-view-v2.tsx";
const source = readFileSync(path, "utf8");
const original = '  const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });';
const replacement = '  const blobBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;\n  const blob = new Blob([blobBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });';

if (source.includes(original)) {
  writeFileSync(path, source.replace(original, replacement), "utf8");
} else if (!source.includes("const blobBuffer = bytes.buffer.slice")) {
  throw new Error("Não foi possível preparar o gerador de relatórios para o build.");
}

import { readFileSync, writeFileSync } from "node:fs";

const path = "components/views/reports-view-v2.tsx";
const source = readFileSync(path, "utf8");
let next = source;

const originalBlob = '  const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });';
const replacementBlob = '  const blobBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;\n  const blob = new Blob([blobBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });';

if (next.includes(originalBlob)) {
  next = next.replace(originalBlob, replacementBlob);
} else if (!next.includes("const blobBuffer = bytes.buffer.slice")) {
  throw new Error("Não foi possível preparar o gerador de relatórios para o build.");
}

next = next.replace(
  '<fill><patternFill patternType="solid"><fgColor rgb="${BRAND.black}"/><bgColor indexed="64"/></patternFill></fill>',
  '<fill><patternFill patternType="solid"><fgColor rgb="${BRAND.red}"/><bgColor indexed="64"/></patternFill></fill>',
);

next = next.replace(
  'background: "#090909", borderRadius: 10',
  'background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 10',
);

if (next !== source) writeFileSync(path, next, "utf8");

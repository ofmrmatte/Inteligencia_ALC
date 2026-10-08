export interface ImportedFileFingerprint {
  batchId: string;
  fileHash: string;
}

export function findDuplicateFileHash(file: ImportedFileFingerprint, importedFiles: ImportedFileFingerprint[]) {
  if (!file.fileHash) return null;
  return importedFiles.find((importedFile) => importedFile.fileHash === file.fileHash && importedFile.batchId !== file.batchId) ?? null;
}

export function duplicateFileImportError(originalName: string, duplicateBatchId: string) {
  return `${originalName}: arquivo já importado anteriormente no lote ${duplicateBatchId}.`;
}

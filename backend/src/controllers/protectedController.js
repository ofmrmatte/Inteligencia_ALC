import { getLibrary, saveLibrary } from "../services/libraryService.js";

export function getLibraryController(_req, res) {
  res.json({ library: getLibrary() });
}

export function saveLibraryController(req, res) {
  res.json({ library: saveLibrary(req.body?.library || req.body) });
}

export function uploadPermissionController(_req, res) {
  res.status(201).json({ message: "Upload autorizado para administrador." });
}

export function deleteFilePermissionController(req, res) {
  res.json({ message: `Exclusão autorizada para o arquivo ${req.params.id}.` });
}

export function downloadReportPermissionController(_req, res) {
  res.json({ message: "Download de relatório autorizado." });
}


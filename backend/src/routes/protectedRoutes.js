import { Router } from "express";
import {
  deleteFilePermissionController,
  downloadReportPermissionController,
  getLibraryController,
  saveLibraryController,
  uploadPermissionController,
} from "../controllers/protectedController.js";
import { adminMiddleware } from "../middlewares/adminMiddleware.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";

export const protectedRoutes = Router();

protectedRoutes.get("/library", authMiddleware, getLibraryController);
protectedRoutes.put("/library", authMiddleware, adminMiddleware, saveLibraryController);
protectedRoutes.post("/files/upload", authMiddleware, adminMiddleware, uploadPermissionController);
protectedRoutes.delete("/files/:id", authMiddleware, adminMiddleware, deleteFilePermissionController);
protectedRoutes.get("/reports/download", authMiddleware, downloadReportPermissionController);


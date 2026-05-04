import { Router } from "express";
import {
  createUserController,
  deleteUserController,
  listUsersController,
  profileController,
  updateUserAdminController,
  updateUserController,
} from "../controllers/userController.js";
import { adminMiddleware } from "../middlewares/adminMiddleware.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";

export const userRoutes = Router();

userRoutes.get("/me", authMiddleware, profileController);
userRoutes.use(authMiddleware, adminMiddleware);
userRoutes.get("/", listUsersController);
userRoutes.post("/", createUserController);
userRoutes.patch("/:id", updateUserController);
userRoutes.patch("/:id/admin", updateUserAdminController);
userRoutes.delete("/:id", deleteUserController);


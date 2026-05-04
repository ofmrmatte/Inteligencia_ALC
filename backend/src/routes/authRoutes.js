import { Router } from "express";
import { loginController, logoutController, meController, registerController } from "../controllers/authController.js";
import { authMiddleware, optionalAuth } from "../middlewares/authMiddleware.js";

export const authRoutes = Router();

authRoutes.post("/login", loginController);
authRoutes.post("/register", optionalAuth, registerController);
authRoutes.post("/signup", optionalAuth, registerController);
authRoutes.post("/logout", logoutController);
authRoutes.get("/me", authMiddleware, meController);
authRoutes.get("/session", authMiddleware, meController);


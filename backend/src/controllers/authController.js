import { env } from "../config/env.js";
import { login, register } from "../services/authService.js";
import { signToken } from "../utils/jwt.js";

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: env.nodeEnv === "production",
    maxAge: 1000 * 60 * 60 * 24 * 7,
  };
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isAdmin: Boolean(user.isAdmin),
  };
}

export async function loginController(req, res, next) {
  try {
    const result = await login(req.body || {});
    res.cookie("auth_token", result.token, cookieOptions());
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function registerController(req, res, next) {
  try {
    const user = await register({ ...(req.body || {}), requester: req.user });
    const responseUser = publicUser(user);
    const token = signToken({ sub: responseUser.id, email: responseUser.email, role: responseUser.role, isAdmin: responseUser.isAdmin });
    res.cookie("auth_token", token, cookieOptions());
    res.status(201).json({ user: responseUser, token });
  } catch (error) {
    next(error);
  }
}

export function logoutController(_req, res) {
  res.clearCookie("auth_token", cookieOptions());
  res.json({ message: "Sessão encerrada." });
}

export function meController(req, res) {
  res.json({ user: publicUser(req.user) });
}

import { comparePassword } from "../utils/password.js";
import { signToken } from "../utils/jwt.js";
import { createUser, getPrivateUserByEmail, getPrivateUserById, listUsers } from "./userService.js";

export async function login({ email, password }) {
  const user = getPrivateUserByEmail(email);
  if (!user || !user.active) {
    const error = new Error("E-mail ou senha inválidos.");
    error.status = 401;
    throw error;
  }

  const validPassword = await comparePassword(password, user.passwordHash);
  if (!validPassword) {
    const error = new Error("E-mail ou senha inválidos.");
    error.status = 401;
    throw error;
  }

  const publicUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isAdmin: user.isAdmin,
  };
  const token = signToken({ sub: user.id, email: user.email, role: user.role, isAdmin: user.isAdmin });

  return { user: publicUser, token };
}

export async function register({ name, email, password, role, isAdmin, requester }) {
  const hasUsers = listUsers().length > 0;
  const requesterIsAdmin = requester?.isAdmin === true || requester?.role === "admin";

  return createUser({
    name,
    email,
    password,
    role: hasUsers ? (requesterIsAdmin ? role || "user" : "user") : "admin",
    isAdmin: hasUsers ? requesterIsAdmin && Boolean(isAdmin) : true,
  });
}

export function getUserFromTokenPayload(payload) {
  return getPrivateUserById(payload.sub);
}

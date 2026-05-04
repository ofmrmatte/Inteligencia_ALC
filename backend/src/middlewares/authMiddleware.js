import { verifyToken } from "../utils/jwt.js";
import { getUserFromTokenPayload } from "../services/authService.js";

function parseCookies(header = "") {
  return Object.fromEntries(
    String(header)
      .split(";")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const index = entry.indexOf("=");
        return index === -1 ? [entry, ""] : [entry.slice(0, index), decodeURIComponent(entry.slice(index + 1))];
      }),
  );
}

export function getTokenFromRequest(req) {
  const authorization = req.headers.authorization || "";
  const bearerMatch = String(authorization).match(/^Bearer\s+(.+)$/i);
  if (bearerMatch) return bearerMatch[1].trim();
  return parseCookies(req.headers.cookie).auth_token || "";
}

export function optionalAuth(req, _res, next) {
  const token = getTokenFromRequest(req);
  if (!token) return next();
  try {
    const payload = verifyToken(token);
    const user = getUserFromTokenPayload(payload);
    if (user?.active) req.user = user;
  } catch {
    req.user = null;
  }
  return next();
}

export function authMiddleware(req, res, next) {
  const token = getTokenFromRequest(req);
  if (!token) {
    return res.status(401).json({ message: "Faça login para acessar esta função." });
  }
  try {
    const payload = verifyToken(token);
    const user = getUserFromTokenPayload(payload);
    if (!user?.active) {
      return res.status(401).json({ message: "Faça login para acessar esta função." });
    }
    req.user = user;
    return next();
  } catch {
    return res.status(401).json({ message: "Faça login para acessar esta função." });
  }
}


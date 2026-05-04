export function adminMiddleware(req, res, next) {
  if (req.user?.isAdmin === true || req.user?.role === "admin") {
    return next();
  }
  return res.status(403).json({ message: "Apenas administradores podem realizar esta ação." });
}


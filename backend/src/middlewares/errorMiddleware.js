export function notFoundMiddleware(req, res) {
  res.status(404).json({ message: "Rota não encontrada." });
}

export function errorMiddleware(error, _req, res, _next) {
  const status = Number(error.status || error.statusCode || 500);
  const message = status >= 500 ? "Erro interno do servidor." : error.message;
  if (status >= 500) console.error(error);
  res.status(status).json({ message });
}


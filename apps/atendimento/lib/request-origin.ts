import { HttpError } from "./auth";

/**
 * Browser Origin must match a server-configured public origin.
 * On Railway, Next.js may see a private URL after proxy routing;
 * neither Request.url nor client-controlled X-Forwarded-* headers
 * are authoritative for public origin validation.
 */
function configuredOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    if (
      (url.protocol !== "https:" &&
        !(process.env.NODE_ENV !== "production" &&
          url.protocol === "http:" &&
          ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) ||
      url.username || url.password || url.search || url.hash ||
      (url.pathname !== "/" && url.pathname !== "")
    ) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function assertTrustedOrigin(request: Request, errorMessage = "Origem da requisicao invalida.") {
  const received = request.headers.get("origin");
  if (!received || received === "null") throw new HttpError(403, errorMessage);
  let origin: URL;
  try {
    origin = new URL(received);
    // Origin is a serialized scheme + host + optional port, not a full URL.
    if (origin.origin !== received) throw new Error("Invalid Origin");
  } catch {
    throw new HttpError(403, errorMessage);
  }

  const allowed = new Set(
    [process.env.ATENDIMENTO_PUBLIC_URL, process.env.RAILWAY_PUBLIC_DOMAIN]
      .map(configuredOrigin)
      .filter((value): value is string => Boolean(value)),
  );
  // Local development/test deployments without an explicitly configured
  // public origin keep strict Request.url equality.
  if (!allowed.size) allowed.add(new URL(request.url).origin);
  if (!allowed.has(origin.origin)) throw new HttpError(403, errorMessage);
}

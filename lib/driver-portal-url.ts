export function driverPortalUrl(path = "") {
  const base = process.env.NEXT_PUBLIC_DRIVER_PORTAL_URL?.trim();
  if (!base) return "";
  const normalizedBase = base.replace(/\/+$/, "");
  const normalizedPath = path ? `/${path.replace(/^\/+/, "")}` : "";
  return `${normalizedBase}${normalizedPath}`;
}


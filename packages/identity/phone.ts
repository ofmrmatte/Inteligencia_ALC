// Formatting proves neither ownership nor availability on WhatsApp.
export function phone(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  const raw = String(value).trim();
  if (raw.length > 40 || !/^\+?[\d\s().-]+$/.test(raw)) return "";
  let number = raw.replace(/\D/g, "");
  if (raw.startsWith("+") && !/^55\d{10,11}$/.test(number)) return "";
  if (/^\d{10,11}$/.test(number)) number = "55" + number;
  if (!/^55\d{10,11}$/.test(number)) return "";
  const national = number.slice(2);
  if (!/^[1-9]\d/.test(national)) return "";
  const subscriber = national.slice(2);
  return /^(?:[2-5]\d{7}|9\d{8})$/.test(subscriber) ? number : "";
}

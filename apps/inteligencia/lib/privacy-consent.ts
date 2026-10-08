export type PrivacyConsentLevel = "essential" | "all";

export const PRIVACY_CONSENT_COOKIE = "alc_privacy_consent";
export const PRIVACY_CONSENT_VERSION = "1";
export const PRIVACY_CONSENT_EVENT = "alc-inteligencia:privacy-consent";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function readPrivacyConsent(): PrivacyConsentLevel | null {
  if (typeof document === "undefined") return null;
  const raw = document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${PRIVACY_CONSENT_COOKIE}=`))
    ?.slice(PRIVACY_CONSENT_COOKIE.length + 1);

  if (!raw) return null;
  const [version, level] = decodeURIComponent(raw).split(":");
  if (version !== PRIVACY_CONSENT_VERSION) return null;
  return level === "all" || level === "essential" ? level : null;
}

export function writePrivacyConsent(level: PrivacyConsentLevel) {
  if (typeof document === "undefined") return;
  const value = encodeURIComponent(`${PRIVACY_CONSENT_VERSION}:${level}`);
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${PRIVACY_CONSENT_COOKIE}=${value}; Path=/; Max-Age=${MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
  window.dispatchEvent(new CustomEvent(PRIVACY_CONSENT_EVENT, { detail: { level } }));
}

export function optionalStorageAllowed() {
  return readPrivacyConsent() === "all";
}

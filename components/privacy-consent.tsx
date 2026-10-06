"use client";

import { useEffect, useState } from "react";
import { Cookie, ShieldCheck, X } from "lucide-react";
import {
  PRIVACY_CONSENT_EVENT,
  readPrivacyConsent,
  writePrivacyConsent,
  type PrivacyConsentLevel,
} from "@/lib/privacy-consent";

export function PrivacyConsent() {
  const [consent, setConsent] = useState<PrivacyConsentLevel | null>(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const current = readPrivacyConsent();
    setConsent(current);
    setOpen(!current);
    setReady(true);

    const sync = () => {
      const next = readPrivacyConsent();
      setConsent(next);
      setOpen(!next);
    };
    window.addEventListener(PRIVACY_CONSENT_EVENT, sync);
    return () => window.removeEventListener(PRIVACY_CONSENT_EVENT, sync);
  }, []);

  const choose = (level: PrivacyConsentLevel) => {
    writePrivacyConsent(level);
    setConsent(level);
    setOpen(false);
  };

  if (!ready) return null;

  return (
    <>
      {open ? (
        <div className="privacy-consent" role="dialog" aria-modal="true" aria-labelledby="privacy-consent-title">
          <div className="privacy-consent__icon"><Cookie size={19} /></div>
          <div className="privacy-consent__copy">
            <strong id="privacy-consent-title">Cookies, sessão e cache local</strong>
            <p>
              O Inteligência ALC usa cookies essenciais para autenticação e segurança. Também usa armazenamento local/IndexedDB
              para preservar o cache operacional e acelerar a navegação entre telas. O cache não é usado para publicidade nem
              rastreamento. Cookies opcionais permanecem desativados sem sua autorização.
            </p>
            <div className="privacy-consent__facts">
              <span><ShieldCheck size={13} /> Essenciais e cache operacional: sempre ativos</span>
              <span>Publicidade e analytics de terceiros: não utilizados atualmente</span>
            </div>
          </div>
          <div className="privacy-consent__actions">
            <button type="button" className="privacy-consent__secondary" onClick={() => choose("essential")}>Recusar opcionais</button>
            <button type="button" className="privacy-consent__primary" onClick={() => choose("all")}>Aceitar opcionais</button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="privacy-consent__manage"
          onClick={() => setOpen(true)}
          aria-label="Gerenciar cookies e privacidade"
          title="Gerenciar cookies e privacidade"
        >
          <Cookie size={15} />
          <span>Cookies</span>
        </button>
      )}

      {open && consent && (
        <button type="button" className="privacy-consent__close" onClick={() => setOpen(false)} aria-label="Fechar aviso de cookies">
          <X size={16} />
        </button>
      )}
    </>
  );
}

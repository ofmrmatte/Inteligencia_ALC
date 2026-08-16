"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, Check, Database, HardDriveUpload, LogOut, Menu, ShieldCheck, TriangleAlert, XCircle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { signOutAction } from "@/app/login/actions";
import { ROLE_LABELS, type AuthProfile } from "@/lib/auth";
import { useDashboardStore } from "@/lib/store";
import { SECTION_META, type SectionId } from "@/lib/navigation";
import styles from "./topbar.module.css";

interface NotificationItem {
  id: string;
  title: string;
  detail: string;
  tone: "warning" | "error";
  time?: string;
}

export function Topbar({ section, profile, canImport, onImport, onMobileMenu }: { section: SectionId; profile: AuthProfile; canImport: boolean; onImport: () => void; onMobileMenu: () => void }) {
  const data = useDashboardStore((state) => state.data);
  const hydrated = useDashboardStore((state) => state.hydrated);
  const refreshing = useDashboardStore((state) => state.refreshing);
  const loadError = useDashboardStore((state) => state.loadError);
  const meta = SECTION_META[section];
  const last = data.imports[0];
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [readIds, setReadIds] = useState<string[]>([]);
  const notificationRef = useRef<HTMLDivElement>(null);
  const storageKey = `alc-notifications-read:${profile.id}`;

  const dataLabel = !hydrated
    ? "Carregando dados…"
    : refreshing
      ? last ? "Sincronizando dados…" : "Carregando dados…"
      : loadError
        ? last ? "Dados em cache" : "Falha na sincronização"
        : last
          ? `Atualizado ${format(new Date(last.importedAt), "dd MMM, HH:mm", { locale: ptBR })}`
          : "Nenhum dado importado";

  const notifications = useMemo<NotificationItem[]>(() => {
    const items: NotificationItem[] = [];
    if (loadError) {
      items.push({ id: `sync:${loadError}`, title: "Falha na sincronização", detail: loadError, tone: "error" });
    }

    for (const entry of data.imports.slice(0, 10)) {
      const issues = Array.isArray(entry.issues) ? entry.issues.filter(Boolean) : [];
      if (entry.status !== "erro" && entry.status !== "com-alertas" && issues.length === 0) continue;
      const tone: NotificationItem["tone"] = entry.status === "erro" ? "error" : "warning";
      items.push({
        id: `import:${entry.batchId}:${entry.status}:${issues.length}`,
        title: entry.status === "erro" ? "Lote com erro" : "Lote com alertas",
        detail: issues[0] || `${entry.name} requer conferência.`,
        tone,
        time: entry.importedAt,
      });
    }
    return items.slice(0, 8);
  }, [data.imports, loadError]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
      setReadIds(Array.isArray(saved) ? saved.filter((value): value is string => typeof value === "string") : []);
    } catch {
      setReadIds([]);
    }
  }, [storageKey]);

  useEffect(() => {
    function handleOutside(event: MouseEvent) {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) setNotificationOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  const unreadCount = notifications.filter((item) => !readIds.includes(item.id)).length;

  function persistRead(next: string[]) {
    const compact = [...new Set(next)].slice(-80);
    setReadIds(compact);
    try { localStorage.setItem(storageKey, JSON.stringify(compact)); } catch { /* storage indisponível */ }
  }

  function markRead(id: string) {
    if (!readIds.includes(id)) persistRead([...readIds, id]);
  }

  function markAllRead() {
    persistRead([...readIds, ...notifications.map((item) => item.id)]);
  }

  return (
    <header className="topbar">
      <button className="icon-button mobile-only" onClick={onMobileMenu} aria-label="Abrir menu"><Menu size={20} /></button>
      <div className="topbar__title">
        <span>{meta.eyebrow}</span>
        <h1>{meta.title}</h1>
      </div>
      <div className="topbar__actions">
        <div className="data-state" title={loadError || (refreshing ? "Atualizando dados em segundo plano" : "Dados sincronizados no Supabase")}>
          <Database size={16} />
          <span>{dataLabel}</span>
          <i className={hydrated && last ? "status-dot status-dot--ok" : "status-dot"} />
        </div>
        <div className="user-chip" title={profile.email}>
          <ShieldCheck size={15} />
          <span>{ROLE_LABELS[profile.role]}</span>
        </div>

        <div className={styles.notificationWrap} ref={notificationRef}>
          <button
            className="icon-button"
            type="button"
            aria-label={unreadCount ? `Notificações, ${unreadCount} não lida(s)` : "Notificações"}
            aria-expanded={notificationOpen}
            onClick={() => setNotificationOpen((open) => !open)}
          >
            <Bell size={19} />
            {unreadCount > 0 ? <span className={styles.badge}>{unreadCount > 99 ? "99+" : unreadCount}</span> : null}
          </button>

          {notificationOpen ? (
            <div className={styles.notificationPanel} role="dialog" aria-label="Central de notificações">
              <div className={styles.notificationHeader}>
                <div><strong>Notificações</strong><span>{notifications.length ? `${unreadCount} não lida(s)` : "Nenhum alerta pendente"}</span></div>
                {unreadCount > 0 ? <button type="button" onClick={markAllRead}><Check size={13} />Marcar todas como lidas</button> : null}
              </div>
              <div className={styles.notificationList}>
                {notifications.map((item) => {
                  const unread = !readIds.includes(item.id);
                  return (
                    <button key={item.id} type="button" className={`${styles.notificationItem} ${unread ? styles.notificationUnread : ""}`} onClick={() => markRead(item.id)}>
                      <span className={`${styles.notificationIcon} ${item.tone === "error" ? styles.notificationError : styles.notificationWarning}`}>{item.tone === "error" ? <XCircle size={16} /> : <TriangleAlert size={16} />}</span>
                      <span className={styles.notificationBody}><strong>{item.title}</strong><span>{item.detail}</span>{item.time ? <small>{format(new Date(item.time), "dd MMM, HH:mm", { locale: ptBR })}</small> : null}</span>
                      {unread ? <i className={styles.unreadDot} /> : null}
                    </button>
                  );
                })}
                {!notifications.length ? <div className={styles.emptyNotifications}><Bell size={22} /><strong>Tudo em ordem</strong><span>Alertas de sincronização e importação aparecerão aqui.</span></div> : null}
              </div>
            </div>
          ) : null}
        </div>

        <button className="primary-button primary-button--small" onClick={onImport} disabled={!canImport} title={canImport ? "Importar dados" : "Importação restrita a perfis autorizados"}><HardDriveUpload size={17} />Importar</button>
        <form action={signOutAction}>
          <button className="icon-button" aria-label="Sair" title="Sair"><LogOut size={18} /></button>
        </form>
      </div>
    </header>
  );
}

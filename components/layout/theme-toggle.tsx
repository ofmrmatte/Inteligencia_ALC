"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

export function ThemeToggle() {
  const theme = useSyncExternalStore(
    (callback) => {
      window.addEventListener("alc-theme-change", callback);
      return () => window.removeEventListener("alc-theme-change", callback);
    },
    () => (document.documentElement.dataset.theme === "light" ? "light" : "dark"),
    () => "dark",
  );

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("alc-theme", next);
    window.dispatchEvent(new Event("alc-theme-change"));
  }

  return (
    <button type="button" className="icon-button" onClick={toggleTheme} aria-label="Alternar tema">
      {theme === "dark" ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
    </button>
  );
}

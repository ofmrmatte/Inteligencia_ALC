"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export function ManagementDialog({
  title,
  children,
  busy = false,
  onClose,
}: {
  title: string;
  children: ReactNode;
  busy?: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="management-dialog"
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header>
        <h2>{title}</h2>
        <button
          className="icon-button"
          type="button"
          title="Fechar"
          aria-label="Fechar"
          disabled={busy}
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </header>
      {children}
    </dialog>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Skeleton } from "@/components/feedback/skeletons";
import {
  GLOBAL_SEARCH_MIN_LENGTH,
  normalizeSearchQuery,
  type GlobalSearchResponse,
  type SearchResultItem,
} from "@/features/global-search/domain";

type SearchState = "idle" | "loading" | "ready" | "error";

function emptyResponse(query = ""): GlobalSearchResponse {
  return { query, minLength: GLOBAL_SEARCH_MIN_LENGTH, groups: [], total: 0, errors: [] };
}

function flattenResults(data: GlobalSearchResponse) {
  return data.groups.flatMap((group) => group.items);
}

export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [data, setData] = useState<GlobalSearchResponse>(() => emptyResponse());
  const [state, setState] = useState<SearchState>("idle");
  const [activeIndex, setActiveIndex] = useState(0);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const results = useMemo(() => flattenResults(data), [data]);

  function closePalette() {
    setOpen(false);
    abortRef.current?.abort();
    buttonRef.current?.focus();
  }

  function openPalette() {
    if (normalizeSearchQuery(query).length >= GLOBAL_SEARCH_MIN_LENGTH) {
      setState("loading");
    }
    setOpen(true);
  }

  function goTo(item: SearchResultItem) {
    closePalette();
    router.push(item.href);
  }

  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (normalizeSearchQuery(query).length >= GLOBAL_SEARCH_MIN_LENGTH) {
          setState("loading");
        }
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const timeout = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timeout);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const normalized = normalizeSearchQuery(query);
    abortRef.current?.abort();

    if (normalized.length < GLOBAL_SEARCH_MIN_LENGTH) {
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(normalized)}`, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        if (!response.ok) throw new Error("Falha ao buscar no painel.");
        const payload = await response.json() as GlobalSearchResponse;
        setData(payload);
        setState("ready");
      } catch {
        if (controller.signal.aborted) return;
        setData(emptyResponse(normalized));
        setState("error");
      }
    }, 300);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [open, query]);

  function onDialogKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closePalette();
      return;
    }
    if (event.key === "Tab") {
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
      return;
    }
    if (!results.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % results.length);
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => (current - 1 + results.length) % results.length);
    }
    if (event.key === "Enter" && document.activeElement === inputRef.current) {
      event.preventDefault();
      goTo(results[activeIndex]);
    }
  }

  const normalizedQuery = normalizeSearchQuery(query);
  const activeId = results[activeIndex] ? `global-search-result-${results[activeIndex].module}-${results[activeIndex].id}` : undefined;

  return (
    <>
      <button ref={buttonRef} type="button" className="global-search-trigger" onClick={openPalette}>
        <Search size={16} aria-hidden="true" />
        <span>Pesquisar no painel...</span>
        <kbd>Ctrl K</kbd>
      </button>

      {open ? (
        <div className="command-palette" role="presentation" onKeyDown={onDialogKeyDown}>
          <button className="command-palette__scrim" type="button" aria-label="Fechar busca" onClick={closePalette} />
          <div ref={panelRef} className="command-palette__panel" role="dialog" aria-modal="true" aria-label="Busca global">
            <div className="command-palette__search">
              <Search size={18} aria-hidden="true" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => {
                  const nextQuery = event.target.value;
                  const normalized = normalizeSearchQuery(nextQuery);
                  setQuery(nextQuery);
                  setActiveIndex(0);
                  if (normalized.length < GLOBAL_SEARCH_MIN_LENGTH) {
                    abortRef.current?.abort();
                    setData(emptyResponse(normalized));
                    setState("idle");
                  } else {
                    setState("loading");
                  }
                }}
                placeholder="Buscar ID, rota, motorista, base ou caso"
                aria-label="Pesquisar no painel"
                aria-activedescendant={activeId}
                aria-controls="global-search-results"
                autoComplete="off"
              />
              <button type="button" className="icon-button" aria-label="Fechar busca" onClick={closePalette}>
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div id="global-search-results" className="command-palette__results" role="listbox" aria-label="Resultados da busca">
              {state === "idle" ? (
                <div className="command-palette__empty">
                  Digite pelo menos {GLOBAL_SEARCH_MIN_LENGTH} caracteres para pesquisar.
                </div>
              ) : null}

              {state === "loading" ? (
                <div className="command-palette__loading" aria-live="polite">
                  <Skeleton className="skeleton--line" />
                  <Skeleton className="skeleton--line" />
                  <Skeleton className="skeleton--line" />
                </div>
              ) : null}

              {state === "error" ? (
                <div className="command-palette__empty" role="alert">
                  Não foi possível buscar agora. Tente novamente.
                </div>
              ) : null}

              {state === "ready" && data.total === 0 ? (
                <div className="command-palette__empty">
                  Nenhum resultado encontrado para “{normalizedQuery}”.
                </div>
              ) : null}

              {state === "ready" && data.groups.map((group) => (
                <section className="command-palette__group" key={group.module} aria-label={group.label}>
                  <div className="command-palette__group-title">
                    <span>{group.label}</span>
                    <Link href={`${group.href}?q=${encodeURIComponent(data.query)}`} onClick={closePalette}>Ver no módulo</Link>
                  </div>
                  {group.items.map((item) => {
                    const index = results.findIndex((result) => result.id === item.id && result.module === item.module);
                    const active = index === activeIndex;
                    return (
                      <button
                        id={`global-search-result-${item.module}-${item.id}`}
                        key={`${item.module}-${item.id}`}
                        type="button"
                        role="option"
                        aria-selected={active}
                        className="command-palette__item"
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => goTo(item)}
                      >
                        <strong>{item.title}</strong>
                        <span>{item.subtitle}</span>
                        <small>{item.meta}</small>
                      </button>
                    );
                  })}
                </section>
              ))}

              {data.errors.length ? (
                <div className="command-palette__warning" role="status">
                  Alguns módulos não responderam à busca.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

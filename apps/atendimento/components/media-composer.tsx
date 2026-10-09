"use client";
/* eslint-disable @next/next/no-img-element -- Blob previews must not pass through the public image optimizer. */
import { useEffect, useRef, useState } from "react";
import { Plus, RefreshCw, Send, X } from "lucide-react";
import { api } from "./data";
type Uploaded = { id: string; status: string; type: string };
const accept =
  ".jpg,.jpeg,.png,.webp,.mp4,.3gp,.pdf,.txt,.doc,.xls,.ppt,.docx,.xlsx,.pptx";
export function MediaComposer({
  conversationId,
  disabled,
  onQueued,
}: {
  conversationId: string;
  disabled: boolean;
  onQueued: () => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState(""),
    [caption, setCaption] = useState(""),
    [uploaded, setUploaded] = useState<Uploaded | null>(null),
    [progress, setProgress] = useState(0),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const input = useRef<HTMLInputElement>(null),
    uploadId = useRef(""),
    active = useRef<XMLHttpRequest | null>(null),
    previewUrl = useRef("");
  useEffect(
    () => () => {
      active.current?.abort();
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    },
    [],
  );
  function clear() {
    setFile(null);
    setUploaded(null);
    setCaption("");
    setNotice("");
    setPreview("");
    uploadId.current = "";
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = "";
    if (input.current) input.current.value = "";
  }
  function upload() {
    return new Promise<Uploaded>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      active.current = xhr;
      const query = new URLSearchParams({
        id: uploadId.current,
        conversationId,
        filename: file!.name,
      });
      xhr.open("POST", `/api/media/upload?${query}`);
      xhr.setRequestHeader(
        "Content-Type",
        file!.type ||
          (file!.name.toLowerCase().endsWith(".txt")
            ? "text/plain"
            : "application/octet-stream"),
      );
      xhr.timeout = 90_000;
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable)
          setProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        active.current = null;
        let result;
        try {
          result = JSON.parse(xhr.responseText);
        } catch {
          reject(
            new Error(
              "Resposta de upload não confirmada. Verifique o status antes de repetir.",
            ),
          );
          return;
        }
        if (xhr.status >= 200 && xhr.status < 300) resolve(result);
        else reject(new Error(result.error || "Upload não confirmado."));
      };
      xhr.onerror =
        xhr.ontimeout =
        xhr.onabort =
          () => {
            active.current = null;
            reject(
              new Error(
                "Upload não confirmado. Verifique o status antes de repetir.",
              ),
            );
          };
      xhr.send(file);
    });
  }
  async function verify() {
    setBusy(true);
    try {
      if (uploaded?.status === "quarantined")
        await fetch(`/api/media/${uploadId.current}`, { method: "POST" });
      const response = await fetch(
        `/api/media/${uploadId.current}?status=true`,
        { cache: "no-store" },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Upload não encontrado.");
      setUploaded(result);
      setNotice(
        result.status === "ready"
          ? "Anexo liberado para envio."
          : result.status === "quarantined" || result.status === "pending"
            ? "Aguardando verificação de segurança. Nenhuma mensagem enviada."
            : "Anexo não liberado. Selecione novamente o arquivo.",
      );
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function send() {
    if (!file || disabled || busy) return;
    setBusy(true);
    setNotice("");
    try {
      const media = uploaded || (await upload());
      setUploaded(media);
      if (media.type === "audio") {
        setNotice("Áudio não suportado");
        return;
      }
      if (media.status !== "ready") {
        setNotice("Anexo em quarentena. Aguarde a verificação de segurança.");
        return;
      }
      await api("conversation", {
        id: conversationId,
        action: "attachment",
        mediaId: media.id,
        ...(caption.trim() ? { body: caption.trim() } : {}),
      });
      clear();
      setNotice("Anexo na fila de envio.");
      await onQueued();
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const noCaption = file?.type === "image/webp";
  return (
    <div className="media-composer">
      <input
        ref={input}
        type="file"
        accept={accept}
        className="sr-only"
        aria-label="Selecionar anexo"
        disabled={disabled || busy}
        onChange={(e) => {
          const selected = e.target.files?.[0];
          if (!selected) return;
          if (
            selected.type.startsWith("audio/") ||
            /\.(aac|amr|mp3|m4a|ogg|opus|wav|weba|flac|aiff|aif)$/i.test(
              selected.name,
            )
          ) {
            clear();
            setNotice("Áudio não suportado");
            return;
          }
          if (selected.size <= 0 || selected.size > 25 * 1024 * 1024) {
            setNotice("Selecione um arquivo de até 25 MB.");
            e.target.value = "";
            return;
          }
          setFile(selected);
          setUploaded(null);
          setCaption("");
          setProgress(0);
          setNotice("");
          uploadId.current = crypto.randomUUID();
          if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
          previewUrl.current = URL.createObjectURL(selected);
          setPreview(previewUrl.current);
        }}
      />
      <button
        type="button"
        className="icon-button"
        disabled={disabled || busy}
        aria-label="Anexar arquivo"
        title="Anexar arquivo"
        onClick={() => input.current?.click()}
      >
        <Plus size={22} />
      </button>
      {file && (
        <div className="media-selection">
          <div className="media-selection-title">
            <strong>{file.name}</strong>
            <small>
              {(file.size / 1024).toLocaleString("pt-BR", {
                maximumFractionDigits: 1,
              })}{" "}
              KB
            </small>
            <button
              type="button"
              className="icon-button"
              disabled={busy}
              aria-label="Remover anexo"
              title="Remover anexo"
              onClick={clear}
            >
              <X size={17} />
            </button>
          </div>
          {preview && file.type.startsWith("image/") && (
            <img
              className="media-preview"
              src={preview}
              alt="Prévia do anexo selecionado"
            />
          )}
          {preview && file.type.startsWith("video/") && (
            <video
              className="media-preview"
              src={preview}
              controls
              preload="metadata"
            />
          )}
          {!noCaption && (
            <label>
              Legenda
              <input
                value={caption}
                maxLength={1024}
                onChange={(e) => setCaption(e.target.value)}
                disabled={busy}
              />
            </label>
          )}
          {busy && (
            <progress
              value={progress}
              max={100}
              aria-label="Progresso do upload"
            />
          )}
          <div className="media-selection-actions">
            <button type="button" disabled={busy} onClick={() => void verify()}>
              <RefreshCw size={16} />
              Verificar upload
            </button>
            <button
              type="button"
              className="primary"
              disabled={
                disabled ||
                busy ||
                uploaded?.type === "audio" ||
                Boolean(uploaded && uploaded.status !== "ready")
              }
              onClick={() => void send()}
            >
              <Send size={16} />
              Enviar anexo
            </button>
          </div>
        </div>
      )}
      {notice && (
        <p role="status" className="media-state">
          {notice}
        </p>
      )}
    </div>
  );
}

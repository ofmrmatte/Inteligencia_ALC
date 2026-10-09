"use client";
/* eslint-disable @next/next/no-img-element -- Authenticated private media must bypass the public image optimizer. */
import { useRef, useState } from "react";
import { Download, Eye, File, X } from "lucide-react";
export type ChatAttachment = {
  internalId?: string;
  id?: string;
  filename?: string;
  mime?: string;
  type?: string;
  size?: number;
  status?: string;
  voice?: boolean;
};
export function MediaViewer({
  attachment,
  messageId,
}: {
  attachment: ChatAttachment;
  messageId: string;
}) {
  const [error, setError] = useState(false),
    audio = useRef<HTMLAudioElement>(null),
    dialog = useRef<HTMLDialogElement>(null);
  const src = attachment.internalId
    ? `/api/media/${attachment.internalId}`
    : `/api/media?id=${messageId}`;
  if (!attachment.internalId || attachment.status !== "ready")
    return (
      <p className="media-state" role="status">
        {attachment.status === "rejected"
          ? "Anexo rejeitado pela verificação de segurança."
          : attachment.status === "failed"
            ? "Não foi possível arquivar este anexo."
            : attachment.status === "deleted"
              ? "Anexo removido pela política de retenção."
              : "Anexo aguardando arquivamento ou verificação de segurança."}
      </p>
    );
  const image = attachment.type === "image" || attachment.type === "sticker",
    pdf = attachment.mime === "application/pdf";
  return (
    <div className="chat-media">
      {image && !error && (
        <button
          type="button"
          className={`media-image-button${
            attachment.type === "sticker" ? " media-sticker" : ""
          }`}
          aria-label="Ampliar imagem"
          title="Ampliar imagem"
          onClick={() => dialog.current?.showModal()}
        >
          <img
            src={src}
            alt={
              attachment.type === "sticker"
                ? "Figurinha recebida"
                : `Imagem${
                    attachment.filename ? `: ${attachment.filename}` : " anexada"
                  }`
            }
            loading="lazy"
            onError={() => setError(true)}
          />
        </button>
      )}
      {attachment.type === "audio" && (
        <div className="media-audio">
          <small>{attachment.voice ? "Mensagem de voz" : "Áudio"}</small>
          <audio
            ref={audio}
            controls
            preload="metadata"
            src={src}
            onError={() => setError(true)}
            aria-label="Reproduzir áudio"
          />
          <label className="audio-speed">
            <span>Velocidade</span>
            <select
              aria-label="Velocidade do áudio"
              defaultValue="1"
              onChange={(e) => {
                if (audio.current)
                  audio.current.playbackRate = Number(e.target.value);
              }}
            >
              <option value="1">1x</option>
              <option value="1.5">1,5x</option>
              <option value="2">2x</option>
            </select>
          </label>
        </div>
      )}
      {attachment.type === "video" && (
        <video
          controls
          playsInline
          preload="metadata"
          src={src}
          onError={() => setError(true)}
          aria-label="Reproduzir vídeo"
        />
      )}
      {attachment.type === "document" && (
        <div className="media-document">
          <File size={22} />
          <span>{attachment.filename}</span>
          {pdf && (
            <button
              type="button"
              className="icon-button"
              aria-label="Visualizar PDF"
              title="Visualizar PDF"
              onClick={() => dialog.current?.showModal()}
            >
              <Eye size={17} />
            </button>
          )}
        </div>
      )}
      {error && (
        <p className="message-error" role="alert">
          Este formato não pôde ser reproduzido. Baixe o arquivo para abri-lo em
          um aplicativo compatível.
        </p>
      )}
      <small>
        {attachment.mime} ·{" "}
        {((attachment.size || 0) / 1024).toLocaleString("pt-BR", {
          maximumFractionDigits: 1,
        })}{" "}
        KB
      </small>
      <a
        className="attachment"
        href={`${src}?download=true`}
        download
      >
        <Download size={15} />
        {attachment.filename || "Baixar anexo"}
      </a>
      {(image || pdf) && (
        <dialog
          ref={dialog}
          className="modal media-dialog"
          aria-label={pdf ? "Documento PDF" : "Imagem ampliada"}
          onClick={(e) => {
            if (e.target === dialog.current) dialog.current?.close();
          }}
        >
          <header>
            <strong>{attachment.filename}</strong>
            <button
              type="button"
              className="icon-button"
              aria-label="Fechar visualizador"
              title="Fechar"
              onClick={() => dialog.current?.close()}
            >
              <X size={20} />
            </button>
          </header>
          {image ? (
            <img src={src} alt={attachment.filename || "Imagem ampliada"} />
          ) : (
            <iframe
              src={src}
              sandbox=""
              title={attachment.filename || "Documento PDF"}
            />
          )}
          <a href={`${src}?download=true`} download>
            <Download size={16} />
            Baixar arquivo
          </a>
        </dialog>
      )}
    </div>
  );
}

"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils/cn";

type UserAvatarProps = {
  name?: string | null;
  email?: string | null;
  src?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
  decorative?: boolean;
};

function avatarInitials(name?: string | null, email?: string | null) {
  const label = (name || email || "Usuário").trim();
  const words = label.split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    return `${words[0]?.[0] || ""}${words[words.length - 1]?.[0] || ""}`.toUpperCase();
  }
  return label.replace(/[^a-zA-Z0-9À-ÿ]/g, "").slice(0, 2).toUpperCase() || "US";
}

function validAvatarSrc(src?: string | null) {
  const value = src?.trim();
  if (!value) return null;
  if (value.startsWith("/")) return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? value : null;
  } catch {
    return null;
  }
}

export function UserAvatar({ name, email, src, size = "md", className, decorative = true }: UserAvatarProps) {
  const [failed, setFailed] = useState(false);
  const initials = useMemo(() => avatarInitials(name, email), [email, name]);
  const avatarSrc = !failed ? validAvatarSrc(src) : null;
  const label = name || email || "Usuário";

  return (
    <span
      className={cn("user-avatar", `user-avatar--${size}`, className)}
      aria-hidden={decorative ? "true" : undefined}
      aria-label={decorative ? undefined : `Avatar de ${label}`}
      title={decorative ? undefined : label}
    >
      {avatarSrc ? (
        <Image
          src={avatarSrc}
          alt=""
          width={size === "lg" ? 72 : size === "sm" ? 32 : 36}
          height={size === "lg" ? 72 : size === "sm" ? 32 : 36}
          className="user-avatar__image"
          unoptimized
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="user-avatar__initials">{initials}</span>
      )}
    </span>
  );
}

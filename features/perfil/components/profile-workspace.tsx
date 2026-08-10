"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Camera, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Profile } from "@/lib/auth/types";

export function ProfileWorkspace({ profile }: { profile: Profile | null }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function save(formData: FormData) {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/perfil", {
        method: "POST",
        body: JSON.stringify({ name: formData.get("name") }),
        headers: { "content-type": "application/json" },
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Falha ao salvar perfil.");
      setMessage("Perfil atualizado.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao salvar perfil.");
    } finally {
      setLoading(false);
    }
  }

  async function uploadAvatar(formData: FormData) {
    setAvatarLoading(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/perfil/avatar", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Falha ao atualizar avatar.");
      setMessage("Avatar atualizado.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao atualizar avatar.");
    } finally {
      setAvatarLoading(false);
    }
  }

  return (
    <div className="page-stack">
      <Card className="profile-card">
        <div className="profile-card__avatar">
          {profile?.avatar_url ? (
            <Image src={profile.avatar_url} alt="" width={72} height={72} unoptimized />
          ) : (
            <span>{(profile?.name || profile?.email || "US").slice(0, 2).toUpperCase()}</span>
          )}
        </div>
        <div>
          <span>Conta</span>
          <h2>{profile?.name || "Usuario"}</h2>
          <p>{profile?.email || "Sessao autenticada"}</p>
        </div>
      </Card>

      <div className="dashboard-grid">
        <Card className="settings-panel">
          <div className="section-header">
            <div>
              <span>Perfil</span>
              <h2>Dados pessoais</h2>
            </div>
            <Save size={20} aria-hidden="true" />
          </div>
          <form action={save} className="settings-form">
            <Input label="Nome" name="name" defaultValue={profile?.name || ""} autoComplete="name" />
            <Input label="E-mail" name="email" defaultValue={profile?.email || ""} disabled />
            <div className="read-only-grid">
              <div>
                <span>Setor</span>
                <strong>{profile?.setor || "Nao definido"}</strong>
              </div>
              <div>
                <span>Cargo</span>
                <strong>{profile?.cargo || "Nao definido"}</strong>
              </div>
              <div>
                <span>Perfil</span>
                <strong>{profile?.role === "admin" && profile.is_admin ? "Admin" : "Usuario"}</strong>
              </div>
            </div>
            {error ? <div className="form-alert">{error}</div> : null}
            {message ? <div className="validation-result"><strong>{message}</strong></div> : null}
            <Button type="submit" disabled={loading} icon={<Save size={16} aria-hidden="true" />}>{loading ? "Salvando..." : "Salvar"}</Button>
          </form>
        </Card>

        <Card className="settings-panel">
          <div className="section-header">
            <div>
              <span>Avatar</span>
              <h2>Imagem de perfil</h2>
            </div>
            <Camera size={20} aria-hidden="true" />
          </div>
          <form action={uploadAvatar} className="settings-form">
            <label>
              <span>Arquivo</span>
              <input name="avatar" type="file" accept="image/jpeg,image/png,image/webp" required />
            </label>
            <p className="muted-copy">PNG, JPG ou WebP ate 5 MB. O arquivo fica no bucket publico de avatars.</p>
            <Button type="submit" disabled={avatarLoading} variant="secondary" icon={<Camera size={16} aria-hidden="true" />}>
              {avatarLoading ? "Enviando..." : "Atualizar avatar"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Profile } from "@/lib/auth/types";

export function AdminUserControl({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function save(formData: FormData) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/configuracoes/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: profile.id,
          name: formData.get("name"),
          setor: formData.get("setor"),
          cargo: formData.get("cargo"),
          admin: formData.get("admin") === "on",
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Falha ao atualizar usuário.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao atualizar usuário.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form action={save} className="admin-user-form">
      <input name="name" defaultValue={profile.name || ""} aria-label="Nome" />
      <input name="setor" defaultValue={profile.setor || ""} aria-label="Setor" />
      <input name="cargo" defaultValue={profile.cargo || ""} aria-label="Cargo" />
      <label className="checkbox-row">
        <input name="admin" type="checkbox" defaultChecked={profile.role === "admin" && profile.is_admin === true} />
        <span>Admin</span>
      </label>
      <Button type="submit" size="sm" variant="secondary" disabled={loading} icon={<ShieldCheck size={14} aria-hidden="true" />}>
        {loading ? "Salvando" : "Salvar"}
      </Button>
      {error ? <small>{error}</small> : null}
    </form>
  );
}

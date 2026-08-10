"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Target } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PnrGoalForm({ monthlyGoal, annualGoal }: { monthlyGoal: number; annualGoal: number }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function save(formData: FormData) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/configuracoes/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          key: "pnr_goal",
          monthly_goal: Number(formData.get("monthly_goal")),
          annual_goal: Number(formData.get("annual_goal")),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Falha ao salvar meta.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao salvar meta.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form action={save} className="settings-form settings-form--inline">
      <label>
        <span>Meta mensal PNR</span>
        <input name="monthly_goal" type="number" min="0" step="0.01" defaultValue={monthlyGoal} />
      </label>
      <label>
        <span>Meta anual PNR</span>
        <input name="annual_goal" type="number" min="0" step="0.01" defaultValue={annualGoal} />
      </label>
      <Button type="submit" disabled={loading} icon={<Target size={16} aria-hidden="true" />}>{loading ? "Salvando..." : "Salvar meta"}</Button>
      {error ? <div className="form-alert">{error}</div> : null}
    </form>
  );
}

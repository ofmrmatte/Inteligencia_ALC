"use client";

import type { AuthProfile } from "@/lib/auth";
import { SettingsViewV2 } from "./settings-view-v2";

export function SettingsViewV3({ profile }: { profile: AuthProfile }) {
  return (
    <div className="view-stack">
      <SettingsViewV2 profile={profile} />
    </div>
  );
}

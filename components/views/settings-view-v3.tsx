"use client";

import { canManageUsers, type AuthProfile } from "@/lib/auth";
import { OperationalUnitsPanel } from "./operational-units-panel";
import { SettingsViewV2 } from "./settings-view-v2";

export function SettingsViewV3({ profile }: { profile: AuthProfile }) {
  return (
    <div className="view-stack">
      <SettingsViewV2 profile={profile} />
      {canManageUsers(profile) ? <OperationalUnitsPanel /> : null}
    </div>
  );
}

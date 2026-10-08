import { normalize, phone, type CaseRecord } from "./domain";

export type DriverCaseRow = {
  case_id: string;
  competence: string;
  classification: string;
  record: Pick<
    CaseRecord,
    "driverId" | "driverPhone" | "driverName" | "baseKey" | "sigla"
  >;
};

export type DriverCaseGroup<T extends DriverCaseRow> = {
  key: string;
  name: string;
  bases: string[];
  rows: T[];
  counts: {
    aberta: number;
    aguardando_comprovante: number;
    penalidade: number;
    encerrada: number;
  };
};

export function groupCasesByDriver<T extends DriverCaseRow>(
  rows: readonly T[],
): DriverCaseGroup<T>[] {
  const groups = new Map<string, DriverCaseGroup<T>>();
  for (const row of rows) {
    const driver = row.record;
    const driverId = normalize(driver.driverId);
    const driverPhone = phone(driver.driverPhone);
    const name = normalize(driver.driverName);
    const base = normalize(driver.baseKey || driver.sigla);
    // Prefer the unique driver ID. With only a name, include the base to
    // avoid merging different people who happen to share the same name.
    // Unknown drivers must never be grouped together as if one person.
    const key = driverId
      ? `id:${driverId}`
      : driverPhone
        ? `phone:${driverPhone}`
        : name
          ? `name:${name}|base:${base}`
          : `unidentified:${row.case_id}`;

    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        name: driver.driverName.trim() || "Motorista não identificado",
        bases: [],
        rows: [],
        counts: {
          aberta: 0,
          aguardando_comprovante: 0,
          penalidade: 0,
          encerrada: 0,
        },
      };
      groups.set(key, group);
    }
    if (driver.driverName.trim() && group.name === "Motorista não identificado")
      group.name = driver.driverName.trim();
    const displayedBase = (driver.baseKey || driver.sigla).trim();
    if (displayedBase && !group.bases.some((item) => normalize(item) === normalize(displayedBase)))
      group.bases.push(displayedBase);
    group.rows.push(row);
    if (row.classification in group.counts) {
      group.counts[row.classification as keyof typeof group.counts] += 1;
    }
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      bases: group.bases.sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" })),
    }))
    .sort((a, b) =>
      a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }) ||
      (a.bases[0] || "").localeCompare(b.bases[0] || "", "pt-BR", { sensitivity: "base" }) ||
      a.key.localeCompare(b.key),
    );
}

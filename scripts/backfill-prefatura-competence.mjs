import pg from "pg";

const { Client } = pg;
const APPLY = process.argv.includes("--apply");

const MONTHS = {
  JANEIRO: "01", JAN: "01", FEVEREIRO: "02", FEV: "02", MARCO: "03", MAR: "03",
  ABRIL: "04", ABR: "04", MAIO: "05", MAI: "05", JUNHO: "06", JUN: "06",
  JULHO: "07", JUL: "07", AGOSTO: "08", AGO: "08", SETEMBRO: "09", SET: "09",
  OUTUBRO: "10", OUT: "10", NOVEMBRO: "11", NOV: "11", DEZEMBRO: "12", DEZ: "12",
};
const MONTH_PATTERN = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|");

function normalize(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[ªº]/g, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().toUpperCase();
}

function fullYear(value) {
  return value.length === 2 ? String(2000 + Number(value)) : value;
}

function build(half, month, year) {
  const parsedHalf = Number(half);
  const parsedMonth = String(month ?? "").padStart(2, "0");
  const parsedYear = fullYear(String(year ?? ""));
  if (![1, 2].includes(parsedHalf) || !/^(0[1-9]|1[0-2])$/.test(parsedMonth) || !/^20\d{2}$/.test(parsedYear)) return null;
  return { fortnight: `0${parsedHalf}Q${parsedMonth}${parsedYear}`, month: `${parsedYear}-${parsedMonth}` };
}

function normalizeFortnight(value) {
  const text = normalize(value);
  const compact = text.replace(/\s+/g, "");
  const yearFirst = /(\d{4})(\d{2})Q?([12])/.exec(compact);
  if (yearFirst) return build(yearFirst[3], yearFirst[2], yearFirst[1]);
  const compactMatch = /(?:0?([12])Q|Q0?([12]))(\d{2})(\d{4}|\d{2})/.exec(compact);
  if (compactMatch) return build(compactMatch[1] || compactMatch[2], compactMatch[3], compactMatch[4]);
  const half = halfFromText(text);
  const monthYear = monthYearFromText(text);
  return half && monthYear ? build(half, monthYear.month, monthYear.year) : null;
}

function halfFromText(text) {
  const normalized = normalize(text);
  if (/(^|\D)(?:0?1\s*Q|Q\s*0?1|1A\s+QUINZENA|1\s+QUINZENA|PRIMEIRA\s+QUINZENA)(\D|$)/.test(normalized)) return 1;
  if (/(^|\D)(?:0?2\s*Q|Q\s*0?2|2A\s+QUINZENA|2\s+QUINZENA|SEGUNDA\s+QUINZENA)(\D|$)/.test(normalized)) return 2;
  return null;
}

function monthYearFromText(text) {
  const normalized = normalize(text);
  const numeric = /(^|\D)(0?[1-9]|1[0-2])\s*[/-]\s*(\d{4}|\d{2})(\D|$)/.exec(normalized);
  if (numeric) return { month: numeric[2].padStart(2, "0"), year: numeric[3] };
  const after = new RegExp(`(^|\\D)(${MONTH_PATTERN})\\s+(\\d{4}|\\d{2})(\\D|$)`).exec(normalized);
  if (after) return { month: MONTHS[after[2]], year: after[3] };
  const before = new RegExp(`(^|\\D)(\\d{4}|\\d{2})\\s+(${MONTH_PATTERN})(\\D|$)`).exec(normalized);
  if (before) return { month: MONTHS[before[3]], year: before[2] };
  return null;
}

function parseRecord(row, batchName) {
  const direct = normalizeFortnight(row.period);
  if (direct) return direct;
  for (const source of [row.source_file, batchName, row.source_sheet]) {
    const parsed = normalizeFortnight(source);
    if (parsed) return parsed;
  }
  return null;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Defina DATABASE_URL para executar o backfill.");
  process.exit(1);
}

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();

const batches = await client.query("select id, name, file_hash, started_at from public.import_batches order by started_at, id");
const batchById = new Map(batches.rows.map((row) => [row.id, row]));
const records = await client.query("select id, batch_id, period, source_file, source_sheet, route_date, shipment_id, operation, value, fortnight, month from public.prefatura_records order by batch_id, id");

const updates = [];
const unidentified = [];
for (const row of records.rows) {
  const parsed = parseRecord(row, batchById.get(row.batch_id)?.name ?? "");
  if (!parsed) {
    unidentified.push(row);
    continue;
  }
  if (row.period !== parsed.fortnight || row.fortnight !== parsed.fortnight || row.month !== parsed.month) {
    updates.push({ id: row.id, ...parsed, before: { period: row.period, fortnight: row.fortnight, month: row.month }, sourceFile: row.source_file });
  }
}

const duplicates = [];
const byHash = new Map();
for (const batch of batches.rows.filter((row) => row.file_hash)) {
  const group = byHash.get(batch.file_hash) ?? [];
  group.push(batch);
  byHash.set(batch.file_hash, group);
}
for (const group of byHash.values()) {
  if (group.length < 2) continue;
  const [original, ...copies] = group;
  copies.forEach((copy) => duplicates.push({ id: copy.id, duplicateOf: original.id, name: copy.name, hash: copy.file_hash }));
}

const duplicateIds = new Set(duplicates.map((duplicate) => duplicate.id));
const batchRecordKeys = new Map();
for (const row of records.rows) {
  const parsed = parseRecord(row, batchById.get(row.batch_id)?.name ?? "");
  if (!parsed) continue;
  const key = [parsed.fortnight, row.shipment_id].join("|");
  batchRecordKeys.set(row.batch_id, [...(batchRecordKeys.get(row.batch_id) ?? []), key]);
}

const signatures = [...batchRecordKeys.entries()]
  .map(([batchId, keys]) => ({ batch: batchById.get(batchId), keys: keys.sort() }))
  .filter((entry) => entry.batch && entry.keys.length > 0)
  .sort((a, b) => {
    const dateCompare = String(a.batch.started_at).localeCompare(String(b.batch.started_at));
    return dateCompare || String(a.batch.id).localeCompare(String(b.batch.id));
  });

function isSubset(sourceKeys, targetKeys) {
  if (sourceKeys.length === 0 || sourceKeys.length > targetKeys.length) return false;
  let targetIndex = 0;
  for (const sourceKey of sourceKeys) {
    while (targetIndex < targetKeys.length && targetKeys[targetIndex] < sourceKey) targetIndex += 1;
    if (targetKeys[targetIndex] !== sourceKey) return false;
  }
  return true;
}

for (let sourceIndex = 0; sourceIndex < signatures.length; sourceIndex += 1) {
  const source = signatures[sourceIndex];
  if (duplicateIds.has(source.batch.id)) continue;
  const duplicateOf = signatures.find((target, targetIndex) => {
    if (sourceIndex === targetIndex) return false;
    if (target.keys.length < source.keys.length) return false;
    if (source.keys.length === target.keys.length && targetIndex > sourceIndex) return false;
    return isSubset(source.keys, target.keys);
  });
  if (!duplicateOf) continue;
  duplicates.push({
    id: source.batch.id,
    duplicateOf: duplicateOf.batch.id,
    name: source.batch.name,
    contentRows: source.keys.length,
  });
  duplicateIds.add(source.batch.id);
}

console.log(JSON.stringify({
  mode: APPLY ? "apply" : "diagnostic",
  prefaturaRecords: records.rowCount,
  recordsToUpdate: updates.length,
  unidentified: unidentified.length,
  duplicateBatches: duplicates.length,
  sampleUpdates: updates.slice(0, 20),
  sampleUnidentified: unidentified.slice(0, 20).map((row) => ({ id: row.id, batchId: row.batch_id, sourceFile: row.source_file, sheet: row.source_sheet })),
  duplicates,
}, null, 2));

if (APPLY) {
  await client.query("begin");
  try {
    const updatesByPeriod = new Map();
    for (const update of updates) {
      const key = `${update.fortnight}|${update.month}`;
      updatesByPeriod.set(key, [...(updatesByPeriod.get(key) ?? []), update.id]);
    }
    for (const [key, ids] of updatesByPeriod.entries()) {
      const [fortnight, month] = key.split("|");
      await client.query(
        "update public.prefatura_records set period = $2, fortnight = $2, month = $3 where id = any($1::uuid[])",
        [ids, fortnight, month],
      );
    }

    const grouped = await client.query(`
      select b.id,
             array_agg(distinct p.fortnight order by p.fortnight) filter (where p.fortnight is not null and p.fortnight <> '') as fortnights,
             array_agg(distinct p.month order by p.month) filter (where p.month is not null and p.month <> '') as months
      from public.import_batches b
      left join public.prefatura_records p on p.batch_id = b.id
      group by b.id
    `);
    for (const row of grouped.rows) {
      const fortnights = unique(row.fortnights ?? []);
      const months = unique(row.months ?? []);
      await client.query(
        "update public.import_batches set fortnights = $2, months = $3, fortnight = $4, month = $5, competence = $5 where id = $1",
        [row.id, fortnights, months, fortnights.length === 1 ? fortnights[0] : null, months.length === 1 ? months[0] : null],
      );
    }

    for (const duplicate of duplicates) {
      await client.query(
        "update public.import_batches set analysis_excluded = true, duplicate_of = $2 where id = $1",
        [duplicate.id, duplicate.duplicateOf],
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

await client.end();

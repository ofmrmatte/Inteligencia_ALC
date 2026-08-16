import pg from "pg";

const { Client } = pg;

if (!process.env.DATABASE_URL) {
  console.error("Defina DATABASE_URL para executar o backfill.");
  process.exit(1);
}

const dryRun = process.argv.includes("--dry-run");
const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function count(sql) {
  const result = await client.query(sql);
  return Number(result.rows[0]?.count ?? 0);
}

async function execute(label, updateSql, countSql) {
  const before = await count(countSql);
  if (dryRun || before === 0) return { label, candidates: before, updated: 0 };
  const result = await client.query(updateSql);
  return { label, candidates: before, updated: result.rowCount ?? 0 };
}

await client.connect();
try {
  await client.query("begin");
  const results = [];

  results.push(await execute(
    "mark_existing_complete",
    `
      update public.prefatura_records
      set quality_status = 'COMPLETE'
      where quality_status = 'PENDING'
        and (coalesce(base_key, '') <> '' or coalesce(sigla, '') <> '')
        and (coalesce(driver_id, '') <> '' or coalesce(driver_name, '') <> '')
    `,
    `
      select count(*)
      from public.prefatura_records
      where quality_status = 'PENDING'
        and (coalesce(base_key, '') <> '' or coalesce(sigla, '') <> '')
        and (coalesce(driver_id, '') <> '' or coalesce(driver_name, '') <> '')
    `,
  ));

  results.push(await execute(
    "driver_id_to_master",
    `
      update public.prefatura_records p
      set
        driver_name = case when coalesce(p.driver_name, '') = '' then d.full_name else p.driver_name end,
        base_key = case when coalesce(p.base_key, '') = '' then d.base_key else p.base_key end,
        base_name = case when coalesce(p.base_name, '') = '' then coalesce(b.base_name, d.base_key) else p.base_name end,
        base_label = case when coalesce(p.base_label, '') = '' then coalesce(b.base_name, d.base_key) else p.base_label end,
        sigla = case when coalesce(p.sigla, '') = '' then coalesce(d.sigla, b.sigla) else p.sigla end,
        quality_status = 'ENRICHED',
        enrichment_source = coalesce(p.enrichment_source, 'DRIVER_MASTER_BACKFILL'),
        base_source = case when coalesce(p.base_key, '') = '' then coalesce(p.base_source, 'DRIVER_MASTER') else p.base_source end,
        driver_name_source = case when coalesce(p.driver_name, '') = '' then coalesce(p.driver_name_source, 'DRIVER_MASTER') else p.driver_name_source end,
        driver_id_source = coalesce(p.driver_id_source, 'UPLOAD'),
        enriched_at = now()
      from public.alc_drivers d
      left join public.operational_bases b on b.base_key = d.base_key
      where p.driver_id = d.driver_code
        and coalesce(p.driver_id, '') <> ''
        and (coalesce(p.driver_name, '') = '' or coalesce(p.base_key, '') = '' or coalesce(p.sigla, '') = '')
    `,
    `
      select count(*)
      from public.prefatura_records p
      join public.alc_drivers d on d.driver_code = p.driver_id
      where coalesce(p.driver_id, '') <> ''
        and (coalesce(p.driver_name, '') = '' or coalesce(p.base_key, '') = '' or coalesce(p.sigla, '') = '')
    `,
  ));

  results.push(await execute(
    "unique_name_to_master",
    `
      with unique_drivers as (
        select min(driver_code) as driver_code, min(full_name) as full_name, min(base_key) as base_key, min(sigla) as sigla, public.normalize_scope_text(full_name) as name_key
        from public.alc_drivers
        where coalesce(full_name, '') <> ''
        group by public.normalize_scope_text(full_name)
        having count(*) = 1
      )
      update public.prefatura_records p
      set
        base_key = case when coalesce(p.base_key, '') = '' then d.base_key else p.base_key end,
        base_name = case when coalesce(p.base_name, '') = '' then coalesce(b.base_name, d.base_key) else p.base_name end,
        base_label = case when coalesce(p.base_label, '') = '' then coalesce(b.base_name, d.base_key) else p.base_label end,
        sigla = case when coalesce(p.sigla, '') = '' then coalesce(d.sigla, b.sigla) else p.sigla end,
        quality_status = 'ENRICHED',
        enrichment_source = coalesce(p.enrichment_source, 'DRIVER_MASTER_NAME_BACKFILL'),
        base_source = case when coalesce(p.base_key, '') = '' then coalesce(p.base_source, 'DRIVER_MASTER_NAME') else p.base_source end,
        enriched_at = now()
      from unique_drivers d
      left join public.operational_bases b on b.base_key = d.base_key
      where public.normalize_scope_text(p.driver_name) = d.name_key
        and coalesce(p.driver_name, '') <> ''
        and coalesce(p.base_key, '') = ''
    `,
    `
      with unique_drivers as (
        select public.normalize_scope_text(full_name) as name_key
        from public.alc_drivers
        where coalesce(full_name, '') <> ''
        group by public.normalize_scope_text(full_name)
        having count(*) = 1
      )
      select count(*)
      from public.prefatura_records p
      join unique_drivers d on d.name_key = public.normalize_scope_text(p.driver_name)
      where coalesce(p.driver_name, '') <> ''
        and coalesce(p.base_key, '') = ''
    `,
  ));

  results.push(await execute(
    "historical_shipment",
    `
      with complete_shipments as (
        select
          shipment_id,
          min(driver_id) as driver_id,
          min(driver_name) as driver_name,
          min(base_label) as base_label,
          min(base_name) as base_name,
          min(base_key) as base_key,
          min(sigla) as sigla
        from public.prefatura_records
        where coalesce(shipment_id, '') <> ''
          and (coalesce(base_key, '') <> '' or coalesce(sigla, '') <> '')
          and (coalesce(driver_id, '') <> '' or coalesce(driver_name, '') <> '')
        group by shipment_id
        having count(distinct coalesce(nullif(base_key, ''), nullif(sigla, ''))) = 1
          and count(distinct coalesce(nullif(driver_id, ''), public.normalize_scope_text(driver_name))) = 1
      )
      update public.prefatura_records p
      set
        driver_id = case when coalesce(p.driver_id, '') = '' then h.driver_id else p.driver_id end,
        driver_name = case when coalesce(p.driver_name, '') = '' then h.driver_name else p.driver_name end,
        base_label = case when coalesce(p.base_label, '') = '' then h.base_label else p.base_label end,
        base_name = case when coalesce(p.base_name, '') = '' then h.base_name else p.base_name end,
        base_key = case when coalesce(p.base_key, '') = '' then h.base_key else p.base_key end,
        sigla = case when coalesce(p.sigla, '') = '' then h.sigla else p.sigla end,
        quality_status = 'ENRICHED',
        enrichment_source = coalesce(p.enrichment_source, 'HISTORICAL_SHIPMENT_BACKFILL'),
        base_source = case when coalesce(p.base_key, '') = '' then coalesce(p.base_source, 'HISTORICAL_SHIPMENT') else p.base_source end,
        driver_name_source = case when coalesce(p.driver_name, '') = '' then coalesce(p.driver_name_source, 'HISTORICAL_SHIPMENT') else p.driver_name_source end,
        driver_id_source = case when coalesce(p.driver_id, '') = '' then coalesce(p.driver_id_source, 'HISTORICAL_SHIPMENT') else p.driver_id_source end,
        enriched_at = now()
      from complete_shipments h
      where p.shipment_id = h.shipment_id
        and (coalesce(p.driver_name, '') = '' or coalesce(p.base_key, '') = '')
    `,
    `
      with complete_shipments as (
        select shipment_id
        from public.prefatura_records
        where coalesce(shipment_id, '') <> ''
          and (coalesce(base_key, '') <> '' or coalesce(sigla, '') <> '')
          and (coalesce(driver_id, '') <> '' or coalesce(driver_name, '') <> '')
        group by shipment_id
        having count(distinct coalesce(nullif(base_key, ''), nullif(sigla, ''))) = 1
          and count(distinct coalesce(nullif(driver_id, ''), public.normalize_scope_text(driver_name))) = 1
      )
      select count(*)
      from public.prefatura_records p
      join complete_shipments h on h.shipment_id = p.shipment_id
      where coalesce(p.driver_name, '') = '' or coalesce(p.base_key, '') = ''
    `,
  ));

  if (dryRun) await client.query("rollback");
  else await client.query("commit");
  console.log(JSON.stringify({ dryRun, results }, null, 2));
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}

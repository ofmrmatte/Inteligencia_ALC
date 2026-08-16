import pg from "pg";

const { Client } = pg;

if (!process.env.DATABASE_URL) {
  console.error("Defina DATABASE_URL para executar o diagnóstico.");
  process.exit(1);
}

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function scalar(sql) {
  const result = await client.query(sql);
  return Number(result.rows[0]?.count ?? 0);
}

async function rows(sql) {
  const result = await client.query(sql);
  return result.rows;
}

await client.connect();
try {
  const diagnostics = {
    profiles_without_scope: await rows(`
      select email, role::text as role, global_access, coalesce(array_length(base_scope, 1), 0) as base_scope_count, coalesce(array_length(sigla_scope, 1), 0) as sigla_scope_count
      from public.profiles
      where active = true
        and role::text in ('coordinator', 'supervisor')
        and global_access = false
        and coalesce(array_length(base_scope, 1), 0) = 0
        and coalesce(array_length(sigla_scope, 1), 0) = 0
      order by email
    `),
    coordinators_with_multiple_bases: await rows(`
      select coordinator_name, count(distinct base_key) as bases
      from public.hierarchy_scopes
      where coalesce(base_key, '') <> ''
      group by coordinator_name
      having count(distinct base_key) > 1
      order by bases desc, coordinator_name
      limit 20
    `),
    supervisors_with_multiple_bases: await rows(`
      select supervisor_name, count(distinct base_key) as bases
      from public.hierarchy_scopes
      where coalesce(base_key, '') <> ''
      group by supervisor_name
      having count(distinct base_key) > 1
      order by bases desc, supervisor_name
      limit 20
    `),
    prefatura_records: await scalar("select count(*) from public.prefatura_records"),
    prefatura_without_base: await scalar("select count(*) from public.prefatura_records where coalesce(base_key, '') = '' and coalesce(sigla, '') = ''"),
    prefatura_without_driver: await scalar("select count(*) from public.prefatura_records where coalesce(driver_id, '') = '' and coalesce(driver_name, '') = ''"),
    prefatura_pending: await scalar("select count(*) from public.prefatura_records where quality_status = 'PENDING'"),
    prefatura_enrichable_by_driver_id: await scalar(`
      select count(*)
      from public.prefatura_records p
      join public.alc_drivers d on d.driver_code = p.driver_id
      where coalesce(p.driver_id, '') <> ''
        and (coalesce(p.base_key, '') = '' or coalesce(p.driver_name, '') = '')
    `),
    prefatura_enrichable_by_unique_name: await scalar(`
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
      where coalesce(p.driver_id, '') = ''
        and coalesce(p.driver_name, '') <> ''
        and coalesce(p.base_key, '') = ''
    `),
    drivers_without_base: await scalar("select count(*) from public.alc_drivers where coalesce(base_key, '') = ''"),
    duplicated_driver_codes: await rows(`
      select driver_code, count(*) as total
      from public.alc_drivers
      group by driver_code
      having count(*) > 1
      order by total desc, driver_code
      limit 20
    `),
    duplicated_driver_names: await rows(`
      select full_name, count(*) as total
      from public.alc_drivers
      where coalesce(full_name, '') <> ''
      group by public.normalize_scope_text(full_name), full_name
      having count(*) > 1
      order by total desc, full_name
      limit 20
    `),
  };
  console.log(JSON.stringify(diagnostics, null, 2));
} finally {
  await client.end();
}

import 'dotenv/config';
import postgres from 'postgres';

const databaseUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
const apply = process.argv.includes('--apply');

if (!databaseUrl) {
  console.error('[PNR File Role Fix] Configure SUPABASE_DB_URL ou DATABASE_URL.');
  process.exit(1);
}

function normalizeText(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function normalizePnrMasterCandidateName(fileName = '') {
  const withoutPath = String(fileName || '').split(/[\\/]/).pop() || '';
  const withoutExtension = withoutPath.replace(/\.(xlsx|xls|xltx|csv)$/i, '');
  return normalizeText(withoutExtension);
}

function isPnrMasterFile(fileName = '') {
  return normalizePnrMasterCandidateName(fileName) === 'pnr mestre 2024 2025';
}

function getExpectedRole(fileName = '') {
  return isPnrMasterFile(fileName) ? 'master' : 'incremental';
}

function isBaseMestreLabel(value = '') {
  return normalizeText(value) === 'base mestre';
}

function getNonMasterDisplayName(metadata = {}, fileName = '') {
  if (metadata.display_name && !isBaseMestreLabel(metadata.display_name)) return metadata.display_name;
  if (metadata.fileDisplayName && !isBaseMestreLabel(metadata.fileDisplayName)) return metadata.fileDisplayName;
  return metadata.original_name || fileName || '';
}

function buildMetadata(metadata = {}, fileName = '') {
  const role = getExpectedRole(fileName);
  const isMaster = role === 'master';
  const nextDisplayName = isMaster ? 'Base mestre' : getNonMasterDisplayName(metadata, fileName);
  return {
    ...metadata,
    display_name: isMaster ? (metadata.display_name || 'PNR MESTRE 2024-2025') : nextDisplayName,
    file_role: role,
    pnr_file_role: role,
    pnr_master_file: isMaster,
    isMasterFile: isMaster,
    is_master_file: isMaster,
    fileDisplayName: nextDisplayName,
    fileDescription: isMaster ? 'Histórico consolidado' : '',
  };
}

function needsMetadataFix(metadata = {}, fileName = '') {
  const role = getExpectedRole(fileName);
  const isMaster = role === 'master';
  return metadata.file_role !== role ||
    metadata.pnr_file_role !== role ||
    metadata.pnr_master_file !== isMaster ||
    metadata.isMasterFile !== isMaster ||
    metadata.is_master_file !== isMaster ||
    (isMaster && metadata.fileDisplayName !== 'Base mestre') ||
    (!isMaster && isBaseMestreLabel(metadata.fileDisplayName)) ||
    (!isMaster && isBaseMestreLabel(metadata.display_name)) ||
    (!isMaster && metadata.fileDescription === 'Histórico consolidado');
}

const sql = postgres(databaseUrl, { ssl: 'require', max: 1 });

try {
  const processed = await sql`
    select id, file_name, file_role, row_count, status, metadata
    from public.processed_dashboard_files
    where module_key in ('desvios_pnr', 'desvios-pnr', 'gestao-desvios-pnr')
    order by created_at nulls last, file_name
  `;
  const dashboard = await sql`
    select id, file_name, status, metadata
    from public.dashboard_files
    where file_type = 'DESVIOS_PNR'
       or metadata->>'file_category' = 'DESVIOS_PNR'
       or metadata->>'semantic_file_type' = 'DESVIOS_PNR'
    order by created_at nulls last, file_name
  `;

  const processedFixes = processed
    .map((record) => {
      const expectedRole = getExpectedRole(record.file_name || record.metadata?.original_name || '');
      const oldRole = record.file_role || record.metadata?.file_role || record.metadata?.pnr_file_role || '';
      const metadataFix = needsMetadataFix(record.metadata || {}, record.file_name || record.metadata?.original_name || '');
      return {
        table: 'processed_dashboard_files',
        id: record.id,
        fileName: record.file_name,
        oldRole,
        newRole: expectedRole,
        rowCount: record.row_count,
        status: record.status,
        needsFix: oldRole !== expectedRole || metadataFix,
        reason: isPnrMasterFile(record.file_name || record.metadata?.original_name || '')
          ? 'nome exato PNR MESTRE 2024-2025'
          : 'nome diferente do mestre exato',
        metadata: buildMetadata(record.metadata || {}, record.file_name || record.metadata?.original_name || ''),
      };
    })
    .filter((item) => item.needsFix);

  const dashboardFixes = dashboard
    .map((record) => {
      const fileName = record.file_name || record.metadata?.original_name || '';
      const expectedRole = getExpectedRole(fileName);
      const oldRole = record.metadata?.file_role || record.metadata?.pnr_file_role || '';
      return {
        table: 'dashboard_files',
        id: record.id,
        fileName: record.file_name,
        oldRole,
        newRole: expectedRole,
        status: record.status,
        needsFix: oldRole !== expectedRole || needsMetadataFix(record.metadata || {}, fileName),
        reason: isPnrMasterFile(fileName) ? 'nome exato PNR MESTRE 2024-2025' : 'nome diferente do mestre exato',
        metadata: buildMetadata(record.metadata || {}, fileName),
      };
    })
    .filter((item) => item.needsFix);

  console.log('[PNR File Role Fix] modo', apply ? 'apply' : 'dry-run');
  console.log('[PNR File Role Fix] processed_dashboard_files analisados:', processed.length, 'correções:', processedFixes.length);
  console.log('[PNR File Role Fix] dashboard_files analisados:', dashboard.length, 'correções:', dashboardFixes.length);

  for (const item of [...processedFixes, ...dashboardFixes]) {
    console.log('[PNR File Role Fix]', {
      tabela: item.table,
      arquivo: item.fileName,
      roleAntigo: item.oldRole || '(vazio)',
      roleNovo: item.newRole,
      status: item.status,
      rowCount: item.rowCount,
      motivo: item.reason,
    });
  }

  if (apply) {
    for (const item of processedFixes) {
      await sql`
        update public.processed_dashboard_files
        set file_role = ${item.newRole}, metadata = ${sql.json(item.metadata)}
        where id = ${item.id}
      `;
    }
    for (const item of dashboardFixes) {
      await sql`
        update public.dashboard_files
        set metadata = ${sql.json(item.metadata)}, updated_at = now()
        where id = ${item.id}
      `;
    }
    console.log('[PNR File Role Fix] correções aplicadas:', processedFixes.length + dashboardFixes.length);
  } else {
    console.log('[PNR File Role Fix] nenhuma alteração executada. Use --apply para aplicar.');
  }
} finally {
  await sql.end();
}

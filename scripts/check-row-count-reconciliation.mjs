import { createSql, printSection, writeAuditReport } from "./audit-utils.mjs";

const sql = createSql();
const expectedMismatches = {
  PRE_FATURA: { expected: [], note: "Pré-Fatura precisa reconciliar sem divergências." },
  GESTAO_PACOTES: { expected: [], note: "Gestão de Pacotes precisa reconciliar sem divergências." },
  DESVIOS_PNR: {
    expected: [
      { fileName: "PNR 1Q Julho 2026.xlsx", rowsPersisted: 3594, actualPersistedRows: 3574 },
      { fileName: "PNR 1Q Junho 2026.xlsx", rowsPersisted: 3502, actualPersistedRows: 3481 },
      { fileName: "PNR 2Q Junho 2026.xlsx", rowsPersisted: 3920, actualPersistedRows: 3873 },
      { fileName: "PNR 2Q Maio 2026.xlsx", rowsPersisted: 3108, actualPersistedRows: 3104 },
    ],
    note: "Quatro divergências históricas de metadado PNR identificadas na Fase 2. Qualquer arquivo diferente é regressão.",
  },
  PACOTES_FALTANTES: { expected: [], note: "Pacotes Faltantes precisa reconciliar sem divergências." },
};

function mismatchKey(row) {
  return [
    row.file_type,
    row.file_name,
    Number(row.rows_persisted || 0),
    Number(row.actual_persisted_rows || 0),
  ].join("|");
}

function expectedKey(fileType, item) {
  return [fileType, item.fileName, item.rowsPersisted, item.actualPersistedRows].join("|");
}

try {
  const rows = await sql.unsafe(`
    with persisted as (
      select 'PRE_FATURA'::text as file_type, file_id, count(*)::int as persisted_rows
      from public.pre_fatura_records
      group by file_id
      union all
      select 'GESTAO_PACOTES', file_id, count(*)::int
      from public.gestao_pacotes_records
      group by file_id
      union all
      select 'DESVIOS_PNR', file_id, count(*)::int
      from public.desvios_pnr_records
      group by file_id
      union all
      select 'PACOTES_FALTANTES', source_file_id as file_id, count(*)::int
      from public.gestao_desvios_pacotes_faltantes
      group by source_file_id
    ),
    dashboard as (
      select
        d.id,
        d.file_name,
        d.file_type,
        d.status,
        coalesce(nullif(d.metadata->>'row_count_read', '')::int, nullif(d.metadata->>'total_rows_read', '')::int, nullif(d.metadata->>'original_rows', '')::int, nullif(d.metadata->>'parsed_rows', '')::int, 0) as rows_read,
        coalesce(nullif(d.metadata->>'row_count_imported', '')::int, nullif(d.metadata->>'total_rows_imported', '')::int, nullif(d.metadata->>'consolidated_rows', '')::int, nullif(d.metadata->>'record_count', '')::int, nullif(d.metadata->>'parsed_rows', '')::int, 0) as rows_imported,
        coalesce(nullif(d.metadata->>'row_count_persisted', '')::int, p.persisted_rows, 0) as rows_persisted,
        coalesce(p.persisted_rows, 0) as actual_persisted_rows
      from public.dashboard_files d
      left join persisted p on p.file_type = d.file_type and p.file_id = d.id
    )
    select
      file_type,
      file_name,
      status,
      rows_read,
      rows_imported,
      rows_persisted,
      actual_persisted_rows,
      rows_read - rows_imported as read_minus_imported,
      rows_imported - actual_persisted_rows as imported_minus_persisted,
      case
        when rows_persisted = actual_persisted_rows then 'ok'
        else 'metadata_persisted_count_mismatch'
      end as reconciliation_status
    from dashboard
    order by file_type, file_name
  `);

  const summary = rows.reduce((acc, row) => {
    const key = row.file_type || "UNKNOWN";
    acc[key] ||= {
      files: 0,
      rowsRead: 0,
      rowsImported: 0,
      rowsPersisted: 0,
      mismatches: 0,
    };
    acc[key].files += 1;
    acc[key].rowsRead += Number(row.rows_read || 0);
    acc[key].rowsImported += Number(row.rows_imported || 0);
    acc[key].rowsPersisted += Number(row.actual_persisted_rows || 0);
    if (row.reconciliation_status !== "ok") acc[key].mismatches += 1;
    return acc;
  }, {});

  const report = {
    generatedAt: new Date().toISOString(),
    contract: {
      row_count_read: "linhas lidas do arquivo/parser",
      row_count_imported: "linhas normalizadas aceitas para importação antes do efeito final de dedupe/upsert",
      row_count_persisted: "linhas que permanecem na tabela persistida e alimentam o painel",
      note: "Diferenças entre importado e persistido são esperadas quando há dedupe, atualização ou reprocessamento.",
    },
    summary,
    expectedMismatches,
    observedMismatches: rows.filter((row) => row.reconciliation_status !== "ok"),
    rows,
  };
  const reportPath = await writeAuditReport("row-count-reconciliation", report);

  printSection("Row count reconciliation");
  console.table(Object.entries(summary).map(([fileType, item]) => ({
    file_type: fileType,
    files: item.files,
    rows_read: item.rowsRead,
    rows_imported: item.rowsImported,
    rows_persisted: item.rowsPersisted,
    mismatches: item.mismatches,
  })));
  const observedMismatchRows = rows.filter((row) => row.reconciliation_status !== "ok");
  const observedMismatchKeys = new Set(observedMismatchRows.map(mismatchKey));
  const expectedMismatchKeys = new Set(Object.entries(expectedMismatches).flatMap(([fileType, rule]) =>
    rule.expected.map((item) => expectedKey(fileType, item))
  ));
  const unexpectedMismatches = observedMismatchRows.filter((row) => !expectedMismatchKeys.has(mismatchKey(row)));
  const missingExpectedMismatches = [...expectedMismatchKeys].filter((key) => !observedMismatchKeys.has(key));
  const strictRegressions = [
    ...unexpectedMismatches.map((row) => ({
      type: "unexpected_mismatch",
      fileType: row.file_type,
      fileName: row.file_name,
      rowsPersisted: row.rows_persisted,
      actualPersistedRows: row.actual_persisted_rows,
    })),
    ...missingExpectedMismatches.map((key) => ({
      type: "expected_mismatch_changed_or_missing",
      key,
    })),
  ];
  const totalMismatches = Object.values(summary).reduce((sum, item) => sum + item.mismatches, 0);
  console.log(`Persisted metadata mismatches: ${totalMismatches}`);
  console.table(Object.entries(expectedMismatches).map(([fileType, rule]) => ({
    file_type: fileType,
    expected_mismatches: rule.expected.length,
    observed_mismatches: summary[fileType]?.mismatches ?? 0,
  })));
  if (strictRegressions.length) console.table(strictRegressions);
  console.log(`Relatorio: ${reportPath}`);

  if (strictRegressions.length) process.exitCode = 2;
} catch (error) {
  console.error("[Row Count] Falha:", error);
  process.exit(1);
} finally {
  await sql.end();
}

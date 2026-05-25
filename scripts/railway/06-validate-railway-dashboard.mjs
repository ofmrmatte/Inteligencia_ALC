#!/usr/bin/env node
import {
  assertRailwayWriteTarget,
  closeSql,
  countRows,
  createSql,
  duplicateDedupeCount,
  loadRailwayEnv,
  parseArgs,
  printCheck,
  printHelp,
  printWarn,
  qualifyName,
  requireEnv,
  scriptHeader,
  tableColumns,
  tableExists,
} from './lib/railway-utils.mjs';

const args = parseArgs();

if (args.has('help')) {
  printHelp('06-validate-railway-dashboard.mjs', [
    'Executa validacao logica do painel contra Railway staging.',
    'As edicoes de status rodam dentro de transacao com rollback.',
    'Opcoes especificas:',
    '  --skip-edit-tests             Pula testes transacionais de edicao',
  ]);
  process.exit(0);
}

const envInfo = loadRailwayEnv(args);
const skipEditTests = args.has('skip-edit-tests') || args.has('dry-run');

scriptHeader('Railway dashboard logical validation', [
  `Env file: ${envInfo.loaded ? envInfo.envFile : '(nao encontrado; usando ambiente atual)'}`,
  `Edit tests: ${skipEditTests ? 'pulados' : 'rollback transacional'}`,
  'Producao: validacao somente contra Railway staging; nenhuma alteracao permanente.',
]);

async function hasColumn(sql, table, column) {
  const columns = await tableColumns(sql, 'public', table);
  return columns.some((entry) => entry.name === column);
}

async function runCheck(label, failures, callback) {
  try {
    const ok = await callback();
    printCheck(label, ok);
    return ok ? failures : failures + 1;
  } catch (error) {
    printCheck(label, false, error.message);
    return failures + 1;
  }
}

async function tableTotal(sql, table, moduleKey = null) {
  if (!(await tableExists(sql, 'public', table))) {
    throw new Error(`Tabela ausente: public.${table}`);
  }

  const qualified = qualifyName('public', table);
  if (moduleKey && (await hasColumn(sql, table, 'module_key'))) {
    const rows = await sql.unsafe(
      `
        select count(*)::bigint as total
        from ${qualified}
        where module_key = $1
      `,
      [moduleKey],
    );
    return Number(rows[0]?.total ?? 0);
  }

  return countRows(sql, 'public', table);
}

async function validateFilterQuery(sql, table, moduleKey, filterColumn) {
  if (!(await hasColumn(sql, table, filterColumn))) {
    printWarn(`${table}.${filterColumn}`, 'coluna ausente; filtro nao aplicavel');
    return true;
  }

  const qualified = qualifyName('public', table);
  const modulePredicate = (await hasColumn(sql, table, 'module_key')) ? 'where module_key = $1' : '';
  const sampleRows = await sql.unsafe(
    `
      select ${filterColumn}::text as value, count(*)::bigint as total
      from ${qualified}
      ${modulePredicate}
      group by ${filterColumn}
      order by total desc
      limit 1
    `,
    modulePredicate ? [moduleKey] : [],
  );

  if (sampleRows.length === 0 || sampleRows[0].value === null) {
    printWarn(`${table}.${filterColumn}`, 'sem valor de amostra');
    return true;
  }

  const filteredRows = await sql.unsafe(
    `
      select count(*)::bigint as total
      from ${qualified}
      where ${modulePredicate ? 'module_key = $1 and' : ''} ${filterColumn} = ${modulePredicate ? '$2' : '$1'}
    `,
    modulePredicate ? [moduleKey, sampleRows[0].value] : [sampleRows[0].value],
  );

  return Number(filteredRows[0]?.total ?? 0) > 0;
}

async function validatePagedQuery(sql, table, moduleKey) {
  const qualified = qualifyName('public', table);
  const columns = await tableColumns(sql, 'public', table);
  const columnNames = new Set(columns.map((column) => column.name));
  const orderColumn = columnNames.has('created_at')
    ? 'created_at'
    : columnNames.has('imported_at')
      ? 'imported_at'
      : 'id';
  const whereClause = (await hasColumn(sql, table, 'module_key')) ? 'where module_key = $1' : '';
  const rows = await sql.unsafe(
    `
      select *
      from ${qualified}
      ${whereClause}
      order by ${orderColumn} desc nulls last, id desc
      limit 25 offset 0
    `,
    whereClause ? [moduleKey] : [],
  );

  return Array.isArray(rows);
}

async function validateReportSummary(sql, table, moduleKey, groupColumn) {
  if (!(await hasColumn(sql, table, groupColumn))) {
    printWarn(`${table}.${groupColumn}`, 'coluna ausente; resumo usa total geral');
    return true;
  }

  const qualified = qualifyName('public', table);
  const whereClause = (await hasColumn(sql, table, 'module_key')) ? 'where module_key = $1' : '';
  const rows = await sql.unsafe(
    `
      select ${groupColumn}::text as label,
             count(*)::bigint as total
      from ${qualified}
      ${whereClause}
      group by ${groupColumn}
      order by total desc
      limit 20
    `,
    whereClause ? [moduleKey] : [],
  );

  return Array.isArray(rows);
}

async function validatePrefatura(sql) {
  let failures = 0;
  const table = 'pre_fatura_records';
  const moduleKey = 'pre_fatura';

  failures = await runCheck('Pre-Fatura: total de registros', failures, async () => (await tableTotal(sql, table, moduleKey)) >= 0);
  failures = await runCheck('Pre-Fatura: cards base', failures, async () => {
    const rows = await sql`
      select count(*)::bigint as total,
             coalesce(sum(valor), 0)::numeric as valor_total,
             count(distinct base)::bigint as bases,
             count(distinct driver_normalizado)::bigint as drivers
      from public.pre_fatura_records
      where module_key = 'pre_fatura'
    `;
    return rows.length === 1;
  });
  failures = await runCheck('Pre-Fatura: filtro competencia', failures, () =>
    validateFilterQuery(sql, table, moduleKey, 'competencia'),
  );
  failures = await runCheck('Pre-Fatura: filtro quinzena', failures, () =>
    validateFilterQuery(sql, table, moduleKey, 'quinzena'),
  );
  failures = await runCheck('Pre-Fatura: download query base', failures, () =>
    validatePagedQuery(sql, table, moduleKey),
  );
  failures = await runCheck('Pre-Fatura: relatorio query base', failures, () =>
    validateReportSummary(sql, table, moduleKey, 'base'),
  );

  return failures;
}

async function validateGestaoPacotes(sql) {
  let failures = 0;
  const table = 'gestao_pacotes_records';
  const moduleKey = 'gestao_pacotes';

  failures = await runCheck('Gestao de Pacotes: total de registros', failures, async () => (await tableTotal(sql, table, moduleKey)) >= 0);
  failures = await runCheck('Gestao de Pacotes: cards/graficos base', failures, async () => {
    const rows = await sql`
      select count(*)::bigint as total,
             coalesce(sum(valor), 0)::numeric as valor_total,
             count(distinct desconto)::bigint as tipos_desconto,
             count(distinct driver_normalizado)::bigint as drivers
      from public.gestao_pacotes_records
      where module_key = 'gestao_pacotes'
    `;
    return rows.length === 1;
  });
  failures = await runCheck('Gestao de Pacotes: filtro competencia', failures, () =>
    validateFilterQuery(sql, table, moduleKey, 'competencia'),
  );
  failures = await runCheck('Gestao de Pacotes: filtro desconto', failures, () =>
    validateFilterQuery(sql, table, moduleKey, 'desconto'),
  );
  failures = await runCheck('Gestao de Pacotes: download query base', failures, () =>
    validatePagedQuery(sql, table, moduleKey),
  );
  failures = await runCheck('Gestao de Pacotes: relatorio query base', failures, () =>
    validateReportSummary(sql, table, moduleKey, 'desconto'),
  );

  return failures;
}

async function validatePnrStatusRollback(sql) {
  const userRows = await sql`
    select id
    from auth.users
    order by created_at nulls last, id
    limit 1
  `;
  if (userRows.length === 0) {
    throw new Error('auth.users sem usuario para simular auth.uid()');
  }

  const recordRows = await sql`
    select id, coalesce(nullif(status_current, ''), nullif(status_normalizado, ''), 'Anulado') as current_status
    from public.desvios_pnr_records
    where module_key = 'desvios_pnr'
    order by created_at desc nulls last, id desc
    limit 1
  `;
  if (recordRows.length === 0) {
    printWarn('PNRs: edicao de status', 'sem registros para testar');
    return true;
  }

  const nextStatus = recordRows[0].current_status === 'Em Revisão' ? 'Anulado' : 'Em Revisão';

  try {
    await sql.begin(async (transaction) => {
      await transaction`select set_config('request.jwt.claim.sub', ${userRows[0].id}, true)`;
      const result = await transaction`
        select public.update_desvios_pnr_status(${recordRows[0].id}, ${nextStatus}) as payload
      `;
      if (!result[0]?.payload) {
        throw new Error('RPC nao retornou payload');
      }
      throw new Error('ROLLBACK_TEST_OK');
    });
  } catch (error) {
    if (error.message === 'ROLLBACK_TEST_OK') {
      return true;
    }
    throw error;
  }

  return false;
}

async function validatePnrs(sql) {
  let failures = 0;
  const table = 'desvios_pnr_records';
  const moduleKey = 'desvios_pnr';

  failures = await runCheck('PNRs: total de registros', failures, async () => (await tableTotal(sql, table, moduleKey)) >= 0);
  failures = await runCheck('PNRs: dedupe sem duplicidade', failures, async () => (await duplicateDedupeCount(sql, 'public', table)) === 0);
  failures = await runCheck('PNRs: summary', failures, async () => {
    const rows = await sql`
      select count(*)::bigint as total,
             count(*) filter (where status_normalizado = 'Anulado')::bigint as anulado,
             count(*) filter (where status_normalizado = 'Enviado para faturamento')::bigint as faturamento
      from public.desvios_pnr_records
      where module_key = 'desvios_pnr'
    `;
    return rows.length === 1;
  });
  failures = await runCheck('PNRs: filtro status', failures, () =>
    validateFilterQuery(sql, table, moduleKey, 'status_normalizado'),
  );
  failures = await runCheck('PNRs: tabela paginada', failures, () =>
    validatePagedQuery(sql, table, moduleKey),
  );
  if (!skipEditTests) {
    failures = await runCheck('PNRs: edicao de status com rollback', failures, () =>
      validatePnrStatusRollback(sql),
    );
  }
  failures = await runCheck('PNRs: relatorio/download query base', failures, () =>
    validateReportSummary(sql, table, moduleKey, 'status_normalizado'),
  );

  return failures;
}

async function validateMissingPackagesEditRollback(sql) {
  const rows = await sql`
    select id, status_caso, status_contato_meli
    from public.gestao_desvios_pacotes_faltantes
    where module_key = 'pacotes_faltantes'
    order by imported_at desc nulls last, id desc
    limit 1
  `;

  if (rows.length === 0) {
    printWarn('Pacotes Faltantes: edicao', 'sem registros para testar');
    return true;
  }

  const nextCaseStatus = rows[0].status_caso === 'Pendente' ? 'Em rota' : 'Pendente';
  const nextMeliStatus =
    rows[0].status_contato_meli === 'Aguardando Méli' ? 'Em tratativa' : 'Aguardando Méli';

  try {
    await sql.begin(async (transaction) => {
      const [updated] = await transaction`
        update public.gestao_desvios_pacotes_faltantes
        set status_caso = ${nextCaseStatus},
            status_contato_meli = ${nextMeliStatus},
            status_updated_at = now(),
            contato_updated_at = now(),
            updated_at = now()
        where id = ${rows[0].id}
        returning status_caso, status_contato_meli
      `;

      if (updated.status_caso !== nextCaseStatus || updated.status_contato_meli !== nextMeliStatus) {
        throw new Error('Update de Pacotes Faltantes nao refletiu valores esperados');
      }

      throw new Error('ROLLBACK_TEST_OK');
    });
  } catch (error) {
    if (error.message === 'ROLLBACK_TEST_OK') {
      return true;
    }
    throw error;
  }

  return false;
}

async function validateMissingPackages(sql) {
  let failures = 0;
  const table = 'gestao_desvios_pacotes_faltantes';
  const moduleKey = 'pacotes_faltantes';

  failures = await runCheck('Pacotes Faltantes: total de registros', failures, async () =>
    (await tableTotal(sql, table, moduleKey)) >= 0,
  );
  failures = await runCheck('Pacotes Faltantes: status do caso', failures, () =>
    validateFilterQuery(sql, table, moduleKey, 'status_caso'),
  );
  failures = await runCheck('Pacotes Faltantes: status contato Meli', failures, () =>
    validateFilterQuery(sql, table, moduleKey, 'status_contato_meli'),
  );
  failures = await runCheck('Pacotes Faltantes: prazo 48h', failures, async () => {
    const rows = await sql`
      select count(*)::bigint as total,
             count(*) filter (where prazo_tratativa is not null)::bigint as com_prazo,
             count(*) filter (where situacao_prazo is not null)::bigint as com_situacao
      from public.gestao_desvios_pacotes_faltantes
      where module_key = 'pacotes_faltantes'
    `;
    return Number(rows[0].total) === 0 || Number(rows[0].total) === Number(rows[0].com_prazo);
  });
  failures = await runCheck('Pacotes Faltantes: download query base', failures, () =>
    validatePagedQuery(sql, table, moduleKey),
  );
  if (!skipEditTests) {
    failures = await runCheck('Pacotes Faltantes: edicao com rollback', failures, () =>
      validateMissingPackagesEditRollback(sql),
    );
  }

  return failures;
}

let sql;

try {
  const railwayUrl = requireEnv('RAILWAY_DATABASE_URL');
  const target = assertRailwayWriteTarget(railwayUrl, args);
  console.log(`Alvo Railway: ${target.host}/${target.database}`);

  sql = createSql(railwayUrl, {
    max: 1,
  });

  let failures = 0;
  failures += await validatePrefatura(sql);
  failures += await validateGestaoPacotes(sql);
  failures += await validatePnrs(sql);
  failures += await validateMissingPackages(sql);

  if (failures > 0) {
    process.exitCode = 1;
    printCheck('Resultado final', false, `${failures} validacao(oes) falharam`);
  } else {
    printCheck('Resultado final', true, 'Queries principais do painel validas contra Railway staging');
  }
} catch (error) {
  process.exitCode = 1;
  printCheck('Validate Railway dashboard', false, error.message);
} finally {
  await closeSql(sql);
}

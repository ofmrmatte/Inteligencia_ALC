import "server-only";
import pg from "pg";

const { Pool } = pg;

const OPERATIONAL_TABLES = new Set([
  "dashboard_files",
  "audit_logs",
  "dashboard_settings",
  "pre_fatura_records",
  "processed_dashboard_files",
  "desvios_pnr_metrics_summary",
  "import_batches",
  "imported_files",
  "hierarchy_scopes",
  "prefatura_records",
  "pnr_records",
  "risk_lm_records",
  "driver_records",
  "audit_events",
  "operational_bases",
  "alc_drivers",
  "operational_units",
  "operational_unit_supervisors",
  "operational_xpts",
  "discount_cases",
  "discount_case_events",
  "global_data_revision",
  "reconciliation_merge_audit",
  "pnr_case_center_cases",
  "pnr_case_events",
  "pnr_case_detail_snapshots",
  "discount_case_current",
]);

type QueryResult<T = unknown> = {
  data: T | null;
  error: null | { message: string; code?: string; details?: string; hint?: string };
  count?: number | null;
};

type Filter = { sql: string; values: unknown[] };

type QueryAction = "select" | "insert" | "update" | "upsert" | "delete";

const globalPool = globalThis as typeof globalThis & { __alcRailwayPool?: pg.Pool };

function pool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL não configurada.");
  if (!globalPool.__alcRailwayPool) {
    globalPool.__alcRailwayPool = new Pool({
      connectionString,
      max: 12,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
      ssl: false,
      application_name: "inteligencia-alc",
    });
  }
  return globalPool.__alcRailwayPool;
}

function ident(value: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`Identificador SQL inválido: ${value}`);
  }
  return `"${value.replaceAll('"', '""')}"`;
}

function selectList(raw: string) {
  const value = (raw || "*").trim();
  if (value === "*") return "*";
  return value.split(",").map((piece) => {
    const token = piece.trim();
    if (!token) return null;
    const alias = token.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([A-Za-z_][A-Za-z0-9_]*)$/);
    if (alias) return `${ident(alias[2])} AS ${ident(alias[1])}`;
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(token)) return ident(token);
    throw new Error(`Seleção SQL não suportada: ${token}`);
  }).filter(Boolean).join(", ");
}

function pgError(error: unknown) {
  const value = error as { message?: string; code?: string; detail?: string; hint?: string };
  return {
    message: value?.message || "Falha no PostgreSQL da Railway.",
    ...(value?.code ? { code: value.code } : {}),
    ...(value?.detail ? { details: value.detail } : {}),
    ...(value?.hint ? { hint: value.hint } : {}),
  };
}

function splitOrExpression(expression: string) {
  const out: string[] = [];
  let current = "";
  let depth = 0;
  for (const char of expression) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      out.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  if (current) out.push(current);
  return out.map((value) => value.trim()).filter(Boolean);
}

class RailwayQueryBuilder implements PromiseLike<QueryResult<unknown>> {
  private action: QueryAction = "select";
  private selected = "*";
  private returning: string | null = null;
  private payload: unknown = null;
  private filters: Filter[] = [];
  private orders: string[] = [];
  private maxRows: number | null = null;
  private offsetRows: number | null = null;
  private countMode: string | null = null;
  private headOnly = false;
  private singleMode: "single" | "maybeSingle" | null = null;
  private conflictColumns: string[] = [];
  private ignoreDuplicates = false;

  constructor(private readonly table: string) {}

  select(columns = "*", options?: { count?: string; head?: boolean }) {
    if (this.action === "select") this.selected = columns;
    else this.returning = columns;
    this.countMode = options?.count || this.countMode;
    this.headOnly = Boolean(options?.head);
    return this;
  }

  insert(payload: unknown) {
    this.action = "insert";
    this.payload = payload;
    return this;
  }

  update(payload: unknown) {
    this.action = "update";
    this.payload = payload;
    return this;
  }

  upsert(payload: unknown, options?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.action = "upsert";
    this.payload = payload;
    this.conflictColumns = (options?.onConflict || "").split(",").map((value) => value.trim()).filter(Boolean);
    this.ignoreDuplicates = Boolean(options?.ignoreDuplicates);
    return this;
  }

  delete() {
    this.action = "delete";
    return this;
  }

  private addFilter(sql: string, ...values: unknown[]) {
    this.filters.push({ sql, values });
    return this;
  }

  eq(column: string, value: unknown) {
    return value === null
      ? this.addFilter(`${ident(column)} IS NULL`)
      : this.addFilter(`${ident(column)} = ?`, value);
  }

  neq(column: string, value: unknown) {
    return value === null
      ? this.addFilter(`${ident(column)} IS NOT NULL`)
      : this.addFilter(`${ident(column)} <> ?`, value);
  }

  gt(column: string, value: unknown) { return this.addFilter(`${ident(column)} > ?`, value); }
  gte(column: string, value: unknown) { return this.addFilter(`${ident(column)} >= ?`, value); }
  lt(column: string, value: unknown) { return this.addFilter(`${ident(column)} < ?`, value); }
  lte(column: string, value: unknown) { return this.addFilter(`${ident(column)} <= ?`, value); }

  in(column: string, values: unknown[]) {
    if (!values.length) return this.addFilter("FALSE");
    return this.addFilter(`${ident(column)} = ANY(?::text[])`, values.map((value) => String(value)));
  }

  is(column: string, value: unknown) {
    if (value === null) return this.addFilter(`${ident(column)} IS NULL`);
    if (value === true) return this.addFilter(`${ident(column)} IS TRUE`);
    if (value === false) return this.addFilter(`${ident(column)} IS FALSE`);
    return this.addFilter(`${ident(column)} IS NOT DISTINCT FROM ?`, value);
  }

  not(column: string, operator: string, value: unknown) {
    if (operator === "is" && value === null) return this.addFilter(`${ident(column)} IS NOT NULL`);
    if (operator === "eq") return this.neq(column, value);
    throw new Error(`Filtro .not não suportado: ${operator}`);
  }

  contains(column: string, value: unknown) {
    return this.addFilter(`${ident(column)} @> ?::jsonb`, JSON.stringify(value));
  }

  or(expression: string) {
    const clauses: string[] = [];
    const values: unknown[] = [];
    for (const term of splitOrExpression(expression)) {
      const match = term.match(/^([A-Za-z_][A-Za-z0-9_]*)\.(eq|neq|gt|gte|lt|lte|is)\.(.*)$/s);
      if (!match) throw new Error(`Filtro .or não suportado: ${term}`);
      const [, column, op, raw] = match;
      if (op === "is" && raw === "null") {
        clauses.push(`${ident(column)} IS NULL`);
        continue;
      }
      const operator = ({ eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=" } as Record<string, string>)[op];
      clauses.push(`${ident(column)} ${operator} ?`);
      values.push(raw);
    }
    return this.addFilter(`(${clauses.join(" OR ")})`, ...values);
  }

  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) {
    const direction = options?.ascending === false ? "DESC" : "ASC";
    const nulls = options?.nullsFirst === true ? " NULLS FIRST" : options?.nullsFirst === false ? " NULLS LAST" : "";
    this.orders.push(`${ident(column)} ${direction}${nulls}`);
    return this;
  }

  limit(value: number) {
    this.maxRows = Math.max(0, Math.floor(value));
    return this;
  }

  range(from: number, to: number) {
    this.offsetRows = Math.max(0, Math.floor(from));
    this.maxRows = Math.max(0, Math.floor(to) - this.offsetRows + 1);
    return this;
  }

  single() {
    this.singleMode = "single";
    this.maxRows = this.maxRows ?? 2;
    return this;
  }

  maybeSingle() {
    this.singleMode = "maybeSingle";
    this.maxRows = this.maxRows ?? 2;
    return this;
  }

  then<TResult1 = QueryResult<unknown>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<unknown>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private compileFilters(values: unknown[]) {
    if (!this.filters.length) return "";
    const sql = this.filters.map((filter) => {
      let text = filter.sql;
      for (const value of filter.values) {
        values.push(value);
        text = text.replace("?", `$${values.length}`);
      }
      return text;
    });
    return " WHERE " + sql.join(" AND ");
  }

  private async execute(): Promise<QueryResult<unknown>> {
    try {
      const db = pool();
      const values: unknown[] = [];
      const table = ident(this.table);
      const where = this.compileFilters(values);
      let sql = "";

      if (this.action === "select") {
        const columns = selectList(this.selected);
        if (this.countMode) {
          const countSql = `SELECT count(*)::bigint AS count FROM ${table}${where}`;
          const countResult = await db.query(countSql, values);
          const count = Number(countResult.rows[0]?.count || 0);
          if (this.headOnly) return { data: null, error: null, count };
        }
        sql = `SELECT ${columns} FROM ${table}${where}`;
        if (this.orders.length) sql += " ORDER BY " + this.orders.join(", ");
        if (this.maxRows !== null) sql += ` LIMIT ${this.maxRows}`;
        if (this.offsetRows !== null) sql += ` OFFSET ${this.offsetRows}`;
        const result = await db.query(sql, values);
        return this.shapeRows(result.rows, this.countMode ? Number(result.rowCount) : undefined);
      }

      if (this.action === "insert" || this.action === "upsert") {
        const rows = Array.isArray(this.payload) ? this.payload : [this.payload];
        if (!rows.length || !rows[0] || typeof rows[0] !== "object") return { data: null, error: null };
        const columns = [...new Set(rows.flatMap((row) => Object.keys(row as Record<string, unknown>)))];
        const groups = rows.map((row) => {
          const record = row as Record<string, unknown>;
          return "(" + columns.map((column) => {
            values.push(record[column] ?? null);
            return `$${values.length}`;
          }).join(", ") + ")";
        });
        sql = `INSERT INTO ${table} (${columns.map(ident).join(", ")}) VALUES ${groups.join(", ")}`;

        if (this.action === "upsert" && this.conflictColumns.length) {
          sql += ` ON CONFLICT (${this.conflictColumns.map(ident).join(", ")}) `;
          if (this.ignoreDuplicates) sql += "DO NOTHING";
          else {
            const updates = columns.filter((column) => !this.conflictColumns.includes(column));
            sql += updates.length
              ? "DO UPDATE SET " + updates.map((column) => `${ident(column)} = EXCLUDED.${ident(column)}`).join(", ")
              : "DO NOTHING";
          }
        }
        if (this.returning) sql += " RETURNING " + selectList(this.returning);
        const result = await db.query(sql, values);
        if (!this.returning) return { data: null, error: null };
        return this.shapeRows(result.rows);
      }

      if (this.action === "update") {
        const record = (this.payload || {}) as Record<string, unknown>;
        const entries = Object.entries(record);
        if (!entries.length) return { data: null, error: null };
        const setSql = entries.map(([column, value]) => {
          values.push(value);
          return `${ident(column)} = $${values.length}`;
        }).join(", ");

        // Filters were compiled before SET values; rebuild them after SET placeholders.
        values.length = 0;
        const setValues: unknown[] = [];
        const setClause = entries.map(([column, value]) => {
          setValues.push(value);
          return `${ident(column)} = $${setValues.length}`;
        }).join(", ");
        values.push(...setValues);
        const updateWhere = this.compileFilters(values);
        sql = `UPDATE ${table} SET ${setClause}${updateWhere}`;
        if (this.returning) sql += " RETURNING " + selectList(this.returning);
        const result = await db.query(sql, values);
        if (!this.returning) return { data: null, error: null };
        return this.shapeRows(result.rows);
      }

      if (this.action === "delete") {
        sql = `DELETE FROM ${table}${where}`;
        if (this.returning) sql += " RETURNING " + selectList(this.returning);
        const result = await db.query(sql, values);
        if (!this.returning) return { data: null, error: null };
        return this.shapeRows(result.rows);
      }

      return { data: null, error: { message: "Operação PostgreSQL desconhecida." } };
    } catch (error) {
      return { data: null, error: pgError(error) };
    }
  }

  private shapeRows(rows: unknown[], count?: number): QueryResult<unknown> {
    if (this.singleMode === "single") {
      if (rows.length !== 1) {
        return { data: null, error: { message: rows.length ? "Mais de um registro retornado." : "Registro não encontrado.", code: "PGRST116" }, ...(count !== undefined ? { count } : {}) };
      }
      return { data: rows[0], error: null, ...(count !== undefined ? { count } : {}) };
    }
    if (this.singleMode === "maybeSingle") {
      if (rows.length > 1) return { data: null, error: { message: "Mais de um registro retornado.", code: "PGRST116" }, ...(count !== undefined ? { count } : {}) };
      return { data: rows[0] ?? null, error: null, ...(count !== undefined ? { count } : {}) };
    }
    return { data: rows, error: null, ...(count !== undefined ? { count } : {}) };
  }
}

async function railwayRpc(name: string, args: Record<string, unknown> = {}): Promise<QueryResult<unknown>> {
  try {
    const db = pool();
    if (name === "dashboard_overview_v1") {
      const values = [
        args.p_pairs ?? null,
        args.p_month ?? null,
        args.p_fortnight ?? null,
        args.p_operation ?? null,
        args.p_driver ?? null,
      ];
      const result = await db.query(
        "SELECT public.dashboard_overview_v1($1::text[], $2::text, $3::text, $4::text, $5::text) AS data",
        values,
      );
      return { data: result.rows[0]?.data ?? null, error: null };
    }
    if (name === "merge_reconciliation_duplicates_admin") {
      const result = await db.query(
        "SELECT public.merge_reconciliation_duplicates_admin($1::text, $2::uuid) AS data",
        [args.p_shipment_id ?? null, args.p_merged_by ?? null],
      );
      return { data: result.rows[0]?.data ?? null, error: null };
    }
    return { data: null, error: { message: `RPC Railway não mapeada: ${name}` } };
  } catch (error) {
    return { data: null, error: pgError(error) };
  }
}

export function isRailwayOperationalTable(table: string) {
  return Boolean(process.env.DATABASE_URL) && OPERATIONAL_TABLES.has(table);
}

export function createRailwayHybridClient<T extends object>(supabase: T): T {
  if (!process.env.DATABASE_URL) return supabase;
  return new Proxy(supabase, {
    get(target, property, receiver) {
      if (property === "from") {
        return (table: string) => {
          if (OPERATIONAL_TABLES.has(table)) return new RailwayQueryBuilder(table);
          const original = Reflect.get(target, property, receiver) as (name: string) => unknown;
          return original.call(target, table);
        };
      }
      if (property === "rpc") {
        return (name: string, args?: Record<string, unknown>) => {
          if (name === "dashboard_overview_v1" || name === "merge_reconciliation_duplicates_admin") {
            return railwayRpc(name, args);
          }
          const original = Reflect.get(target, property, receiver) as (fn: string, params?: Record<string, unknown>) => unknown;
          return original.call(target, name, args);
        };
      }
      return Reflect.get(target, property, receiver);
    },
  });
}

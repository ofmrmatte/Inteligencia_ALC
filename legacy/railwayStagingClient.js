(function initRailwayStagingClient() {
  function normalizeApiUrl(apiUrl) {
    return String(apiUrl || "").replace(/\/+$/, "");
  }

  function createDashboardFilesStorageStub() {
    return {
      async upload(path) {
        console.warn("[Railway Staging] Upload de dashboard-files ignorado no modo processed-only.", { path });
        return { data: { path }, error: null };
      },
      async remove(paths) {
        console.info("[Railway Staging] Remocao de dashboard-files ignorada no staging.", { paths });
        return { data: [], error: null };
      },
      async download(path) {
        return { data: null, error: new Error(`Arquivo bruto indisponivel no staging Railway: ${path}`) };
      },
      getPublicUrl(path) {
        return { data: { publicUrl: "" }, error: null };
      },
    };
  }

  function createStorageAdapter(authClient) {
    return {
      from(bucket) {
        if (bucket === "dashboard-files") {
          return createDashboardFilesStorageStub();
        }
        return authClient.storage.from(bucket);
      },
    };
  }

  class RailwayQueryBuilder {
    constructor(client, table) {
      this.client = client;
      this.payload = {
        table,
        action: "select",
        select: "*",
        filters: [],
        orders: [],
        limit: null,
        range: null,
        count: null,
        head: false,
        values: null,
        onConflict: null,
        returning: false,
        single: false,
        maybeSingle: false,
      };
    }

    select(columns = "*", options = {}) {
      if (this.payload.action === "select") {
        this.payload.select = columns || "*";
      }
      this.payload.returning = true;
      this.payload.count = options.count || this.payload.count;
      this.payload.head = options.head === true;
      return this;
    }

    insert(values, options = {}) {
      this.payload.action = "insert";
      this.payload.values = values;
      this.payload.count = options.count || this.payload.count;
      return this;
    }

    update(values, options = {}) {
      this.payload.action = "update";
      this.payload.values = values;
      this.payload.count = options.count || this.payload.count;
      return this;
    }

    upsert(values, options = {}) {
      this.payload.action = "upsert";
      this.payload.values = values;
      this.payload.onConflict = options.onConflict || null;
      this.payload.count = options.count || this.payload.count;
      return this;
    }

    delete(options = {}) {
      this.payload.action = "delete";
      this.payload.count = options.count || this.payload.count;
      return this;
    }

    eq(column, value) {
      return this.addFilter("eq", column, value);
    }

    neq(column, value) {
      return this.addFilter("neq", column, value);
    }

    gt(column, value) {
      return this.addFilter("gt", column, value);
    }

    gte(column, value) {
      return this.addFilter("gte", column, value);
    }

    lt(column, value) {
      return this.addFilter("lt", column, value);
    }

    lte(column, value) {
      return this.addFilter("lte", column, value);
    }

    is(column, value) {
      return this.addFilter("is", column, value);
    }

    in(column, values) {
      return this.addFilter("in", column, values);
    }

    contains(column, value) {
      return this.addFilter("contains", column, value);
    }

    like(column, value) {
      return this.addFilter("like", column, value);
    }

    ilike(column, value) {
      return this.addFilter("ilike", column, value);
    }

    addFilter(op, column, value) {
      this.payload.filters.push({ op, column, value });
      return this;
    }

    order(column, options = {}) {
      this.payload.orders.push({
        column,
        ascending: options.ascending !== false,
        nullsFirst: options.nullsFirst === true,
      });
      return this;
    }

    limit(value) {
      this.payload.limit = Number(value);
      return this;
    }

    range(from, to) {
      this.payload.range = [Number(from), Number(to)];
      return this;
    }

    single() {
      this.payload.single = true;
      return this;
    }

    maybeSingle() {
      this.payload.maybeSingle = true;
      return this;
    }

    then(resolve, reject) {
      return this.execute().then(resolve, reject);
    }

    catch(reject) {
      return this.execute().catch(reject);
    }

    finally(callback) {
      return this.execute().finally(callback);
    }

    async execute() {
      return this.client.request("/query", this.payload);
    }
  }

  window.createRailwayStagingClient = function createRailwayStagingClient({ apiUrl, authClient }) {
    const normalizedApiUrl = normalizeApiUrl(apiUrl);

    async function getAuthHeader() {
      try {
        const { data } = await authClient.auth.getSession();
        const token = data?.session?.access_token;
        return token ? { Authorization: `Bearer ${token}` } : {};
      } catch (error) {
        console.warn("[Railway Staging] Nao foi possivel obter sessao Supabase.", error);
        return {};
      }
    }

    async function request(path, payload) {
      const headers = {
        "Content-Type": "application/json",
        ...(await getAuthHeader()),
      };

      const response = await fetch(`${normalizedApiUrl}${path}`, {
        method: "POST",
        headers,
        cache: "no-store",
        body: JSON.stringify(payload || {}),
      });

      const result = await response.json().catch(() => ({
        data: null,
        error: { message: "Resposta invalida da API Railway staging." },
      }));

      if (!response.ok && !result.error) {
        result.error = { message: `Railway staging API HTTP ${response.status}` };
      }

      return result;
    }

    return {
      auth: authClient.auth,
      storage: createStorageAdapter(authClient),
      from(table) {
        return new RailwayQueryBuilder(this, table);
      },
      rpc(name, args = {}) {
        return request("/rpc", { name, args });
      },
      request,
      railwayStaging: {
        enabled: true,
        apiUrl: normalizedApiUrl,
      },
    };
  };
})();

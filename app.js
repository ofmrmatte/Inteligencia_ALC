/* global XLSX */

const STORAGE_KEY = "alc-pre-fatura-dashboard-state-v1";
const LIBRARY_STORAGE_KEY = "alc-pre-fatura-dashboard-library-v1";
const THEME_STORAGE_KEY = "alc-pre-fatura-dashboard-theme-v1";
const BACKEND_STORAGE_KEY = "alc-pre-fatura-dashboard-backend-v1";
const AUTH_STORAGE_KEY = "alc-pre-fatura-dashboard-auth-v1";
const EMPTY_DATASET_ID = "__empty";
const MONTHLY_BASE_VIEW = "Evolução mensal";
const DEFAULT_PNR_GOAL_LIMIT = 20000;
const SHEET_ORDER = ["Todos", "SVC PERDIDOS", "XPT PERDIDOS", "PNR"];
const SHEET_TABS = [...SHEET_ORDER, MONTHLY_BASE_VIEW];
const SHEET_COLORS = {
  "SVC PERDIDOS": "#ff9f43",
  "XPT PERDIDOS": "#58d68d",
  PNR: "#3ba6ff",
};
const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

const STATE_DEFAULT = {
  query: "",
  sheet: "Todos",
  tipo: "Todos",
  base: "Todos",
  motorista: "Todos",
  period: "active",
  sortKey: "valor_numerico",
  sortDir: "desc",
  page: 1,
  pageSize: 50,
  fileName: "PRE FATURA 2 Q MARÇO 26.xlsx",
  activeDatasetId: "seed",
  theme: "dark",
  apiBaseUrl: "",
  pnrGoalLimit: DEFAULT_PNR_GOAL_LIMIT,
};

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 2,
});

const compactCurrency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 2,
});

const integer = new Intl.NumberFormat("pt-BR");

const seedRows = Array.isArray(window.__PRE_FATURA_ROWS) ? window.__PRE_FATURA_ROWS.slice() : [];
const state = loadState();
const forcedTheme = new URLSearchParams(window.location.search).get("theme");
state.theme = forcedTheme === "light" || forcedTheme === "dark" ? forcedTheme : state.theme === "light" ? "light" : "dark";
state.apiBaseUrl = String(state.apiBaseUrl || window.__PRE_FATURA_BACKEND?.baseUrl || "").trim();
state.period = state.period || "active";
let library = loadLibrary();
let activeDataset = getActiveDataset();
let allRows = activeDataset.rows.slice();
let fileMeta = activeDataset;
let workbookEnginePromise = null;
let backendSyncPromise = null;
let backendStatus = "local";
let backendMessage = "Modo local";
let authToken = loadAuthToken();
let currentUser = null;
let knownUsers = [];
let sidebarAnimationTimer = null;

const el = {};

async function bootstrapDashboard() {
  cacheDom();
  bindEvents();
  hydrateThemeControls();
  hydrateControls();
  applyTheme(state.theme);
  if (!allRows.length) {
    showToast("Base inicial vazia. Use Upload Excel para carregar a planilha real.", "warn", 5200);
  }
  renderAll();
  updateTopbar();
  updateAccessControls();
  void hydrateSession();
  void hydrateRemoteLibrary();
}

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    () => {
      void bootstrapDashboard().catch((error) => console.error(error));
    },
    { once: true },
  );
} else {
  void bootstrapDashboard().catch((error) => console.error(error));
}

function cacheDom() {
  el.layout = document.querySelector(".layout");
  el.sidebar = document.getElementById("sidebar");
  el.sidebarToggle = document.getElementById("sidebar-toggle");
  el.uploadButton = document.getElementById("upload-button");
  el.refreshButton = document.getElementById("refresh-button");
  el.deleteActiveButton = document.getElementById("delete-active-button");
  el.themeToggle = document.getElementById("theme-toggle");
  el.fileInput = document.getElementById("file-input");
  el.datasetSelect = document.getElementById("dataset-select");
  el.datasetCount = document.getElementById("dataset-count");
  el.datasetNote = document.getElementById("dataset-note");
  el.backendStatus = document.getElementById("backend-status");
  el.backendInput = document.getElementById("backend-input");
  el.backendSave = document.getElementById("backend-save");
  el.backendSync = document.getElementById("backend-sync");
  el.authStatus = document.getElementById("auth-status");
  el.authEmail = document.getElementById("auth-email");
  el.authPassword = document.getElementById("auth-password");
  el.authLogin = document.getElementById("auth-login");
  el.authSignup = document.getElementById("auth-signup");
  el.authLogout = document.getElementById("auth-logout");
  el.authNote = document.getElementById("auth-note");
  el.usersCard = document.getElementById("users-card");
  el.usersCount = document.getElementById("users-count");
  el.usersList = document.getElementById("users-list");
  el.sourceLine = document.getElementById("source-line");
  el.statusText = document.getElementById("status-text");
  el.lastUpdate = document.getElementById("last-update");
  el.syncStatus = document.getElementById("sync-status");
  el.sheetTabs = document.getElementById("sheet-tabs");
  el.monthlyBaseView = document.getElementById("monthly-base-view");
  el.kpiGrid = document.getElementById("kpi-grid");
  el.baseBars = document.getElementById("base-bars");
  el.driverRank = document.getElementById("driver-rank");
  el.donutChart = document.getElementById("donut-chart");
  el.donutLegend = document.getElementById("donut-legend");
  el.donutTotal = document.getElementById("donut-total");
  el.monthlyComparison = document.getElementById("monthly-comparison");
  el.comparisonMeta = document.getElementById("comparison-meta");
  el.tableBody = document.getElementById("table-body");
  el.tableRange = document.getElementById("table-range");
  el.pageIndicator = document.getElementById("page-indicator");
  el.prevPage = document.getElementById("prev-page");
  el.nextPage = document.getElementById("next-page");
  el.activeFiltersCount = document.getElementById("active-filters-count");
  el.filterSummary = document.getElementById("filter-summary");
  el.resultCount = document.getElementById("result-count");
  el.toast = document.getElementById("toast");
  el.clearFilters = document.getElementById("clear-filters");
  el.searchInput = document.getElementById("search-input");
  el.periodSelect = document.getElementById("period-select");
  el.sheetSelect = document.getElementById("sheet-select");
  el.typeSelect = document.getElementById("type-select");
  el.baseSelect = document.getElementById("base-select");
  el.driverSelect = document.getElementById("driver-select");
  el.pageSize = document.getElementById("page-size");
  el.sortHigh = document.getElementById("sort-high");
  el.sortLow = document.getElementById("sort-low");
}

function bindEvents() {
  el.sidebarToggle.addEventListener("click", () => {
    setSidebarCollapsed(!el.sidebar.classList.contains("is-collapsed"));
  });

  el.uploadButton.addEventListener("click", () => el.fileInput.click());
  if (el.refreshButton) {
    el.refreshButton.addEventListener("click", () => {
      void hydrateRemoteLibrary(true);
    });
  }
  if (el.themeToggle) {
    el.themeToggle.addEventListener("click", () => {
      state.theme = state.theme === "dark" ? "light" : "dark";
      applyTheme(state.theme);
      persistState();
      hydrateThemeControls();
    });
  }
  if (el.backendSave) {
    el.backendSave.addEventListener("click", async () => {
      state.apiBaseUrl = normalizeBaseUrl(el.backendInput ? el.backendInput.value : "");
      persistState();
      hydrateThemeControls();
      showToast(state.apiBaseUrl ? "Conexão do backend salva." : "Conexão removida. Voltando para o modo local.", "good");
      await hydrateRemoteLibrary(true);
    });
  }
  if (el.backendSync) {
    el.backendSync.addEventListener("click", async () => {
      await hydrateRemoteLibrary(true);
    });
  }
  if (el.authLogin) {
    el.authLogin.addEventListener("click", async () => {
      await loginUser();
    });
  }
  if (el.authSignup) {
    el.authSignup.addEventListener("click", async () => {
      await signupUser();
    });
  }
  if (el.authLogout) {
    el.authLogout.addEventListener("click", async () => {
      await logoutUser();
    });
  }
  if (el.usersList) {
    el.usersList.addEventListener("click", async (event) => {
      const button = event.target.closest("button[data-user-id][data-role]");
      if (!button) return;
      await updateUserRole(button.dataset.userId, button.dataset.role);
    });
  }
  if (el.deleteActiveButton) {
    el.deleteActiveButton.addEventListener("click", async () => {
      await deleteActiveDataset();
    });
  }
  el.fileInput.addEventListener("change", handleUpload);
  el.datasetSelect.addEventListener("change", (event) => {
    state.activeDatasetId = event.target.value;
    state.page = 1;
    syncActiveDataset();
    persistState();
    void persistLibrary();
    void syncLibraryToBackend();
    hydrateControls();
    renderAll();
  });

  el.clearFilters.addEventListener("click", () => {
    Object.assign(state, {
      query: "",
      sheet: "Todos",
      tipo: "Todos",
      base: "Todos",
      motorista: "Todos",
      period: "active",
      sortKey: "valor_numerico",
      sortDir: "desc",
      page: 1,
      pageSize: Number(el.pageSize.value || 50),
    });
    hydrateControls();
    persistState();
    renderAll();
    showToast("Filtros limpos.", "info");
  });

  [
    ["searchInput", "query"],
    ["sheetSelect", "sheet"],
    ["typeSelect", "tipo"],
    ["baseSelect", "base"],
    ["driverSelect", "motorista"],
  ].forEach(([key, prop]) => {
    if (!el[key]) return;
    el[key].addEventListener("input", (event) => {
      state[prop] = event.target.value;
      state.page = 1;
      persistState();
      renderAll();
    });
  });

  if (el.periodSelect) {
    el.periodSelect.addEventListener("change", (event) => {
      state.period = event.target.value || "active";
      if (state.period !== "active") {
        state.activeDatasetId = state.period;
        syncActiveDataset();
      }
      state.page = 1;
      hydrateControls();
      persistState();
      renderAll();
    });
  }

  if (el.sortHigh) {
    el.sortHigh.addEventListener("click", () => setValueSort("desc"));
  }
  if (el.sortLow) {
    el.sortLow.addEventListener("click", () => setValueSort("asc"));
  }

  el.pageSize.addEventListener("change", (event) => {
    state.pageSize = Number(event.target.value) || 50;
    state.page = 1;
    persistState();
    renderAll();
  });

  el.prevPage.addEventListener("click", () => {
    state.page = Math.max(1, state.page - 1);
    persistState();
    renderAll();
  });

  el.nextPage.addEventListener("click", () => {
    const totalPages = Math.max(1, Math.ceil(getFilteredRows().length / state.pageSize));
    state.page = Math.min(totalPages, state.page + 1);
    persistState();
    renderAll();
  });

  el.sheetTabs.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-sheet]");
    if (!button) return;
    state.sheet = button.dataset.sheet;
    state.page = 1;
    persistState();
    hydrateControls();
    renderAll();
  });

  el.baseBars.addEventListener("click", (event) => {
    const row = event.target.closest("[data-base]");
    if (!row) return;
    state.base = row.dataset.base;
    state.page = 1;
    hydrateControls();
    renderAll();
    showToast(`Filtro aplicado: ${state.base}`, "info");
  });

  el.driverRank.addEventListener("click", (event) => {
    const row = event.target.closest("[data-driver]");
    if (!row) return;
    state.motorista = row.dataset.driver;
    state.page = 1;
    hydrateControls();
    renderAll();
    showToast(`Driver filtrado: ${state.motorista}`, "info");
  });

  el.donutLegend.addEventListener("click", (event) => {
    const row = event.target.closest("[data-sheet]");
    if (!row) return;
    state.sheet = row.dataset.sheet;
    state.page = 1;
    hydrateControls();
    renderAll();
    showToast(`Aba filtrada: ${state.sheet}`, "info");
  });

  el.donutChart.addEventListener("click", (event) => {
    const segment = event.target.closest("[data-sheet]");
    if (!segment) return;
    state.sheet = segment.dataset.sheet;
    state.page = 1;
    hydrateControls();
    renderAll();
    showToast(`Aba filtrada: ${state.sheet}`, "info");
  });

  el.donutChart.addEventListener("pointerover", (event) => {
    const segment = event.target.closest(".donut-segment");
    if (!segment) return;
    showDonutTooltip(segment);
  });

  el.donutChart.addEventListener("pointerout", (event) => {
    if (!event.target.closest(".donut-segment")) return;
    hideDonutTooltip();
  });

  if (el.monthlyBaseView) {
    el.monthlyBaseView.addEventListener("change", (event) => {
      const input = event.target.closest("[data-pnr-goal-input]");
      if (!input) return;
      const value = parseCurrencyInput(input.value);
      state.pnrGoalLimit = value > 0 ? value : DEFAULT_PNR_GOAL_LIMIT;
      persistState();
      renderAll();
    });
  }

  if (el.monthlyComparison) {
    el.monthlyComparison.addEventListener("click", (event) => {
      const row = event.target.closest("[data-dataset-id]");
      if (!row) return;
      state.activeDatasetId = row.dataset.datasetId;
      state.page = 1;
      syncActiveDataset();
      hydrateControls();
      renderAll();
      void syncLibraryToBackend(false);
    });
  }

  document.querySelector("table thead").addEventListener("click", (event) => {
    const th = event.target.closest("th[data-sort]");
    if (!th) return;
    const sortKey = th.dataset.sort;
    if (state.sortKey === sortKey) {
      state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
    } else {
      state.sortKey = sortKey;
      state.sortDir = sortKey === "valor_numerico" ? "desc" : "asc";
    }
    persistState();
    hydrateValueSortControls();
    renderAll();
  });
}

function setValueSort(direction) {
  state.sortKey = "valor_numerico";
  state.sortDir = direction === "asc" ? "asc" : "desc";
  state.page = 1;
  persistState();
  hydrateValueSortControls();
  renderAll();
}

function setSidebarCollapsed(collapsed) {
  el.sidebar.classList.toggle("is-collapsed", collapsed);
  if (el.layout) {
    el.layout.classList.toggle("is-sidebar-collapsed", collapsed);
    el.layout.classList.remove("is-layout-animating");
    void el.layout.offsetWidth;
    el.layout.classList.add("is-layout-animating");
    clearTimeout(sidebarAnimationTimer);
    sidebarAnimationTimer = setTimeout(() => {
      el.layout.classList.remove("is-layout-animating");
    }, 520);
  }
  el.sidebarToggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
}

function ensureWorkbookEngine() {
  if (window.XLSX && typeof window.XLSX.read === "function" && window.XLSX.utils && typeof window.XLSX.utils.sheet_to_json === "function") {
    return true;
  }

  if (el.statusText) {
    el.statusText.textContent = "Leitor de Excel indisponível nesta abertura";
  }
  if (el.sourceLine) {
    el.sourceLine.textContent = "O parser local do Excel não carregou";
  }
  if (el.datasetNote) {
    el.datasetNote.textContent = "O arquivo xlsx.full.min.js não foi carregado. Reabra a página a partir desta pasta.";
  }
  if (el.uploadButton) {
    el.uploadButton.disabled = true;
  }
  showToast("Parser de Excel indisponível. Verifique xlsx.full.min.js.", "error", 7000);
  return false;
}

function renderOfflineShell() {
  renderDatasetSelect();
  renderTabs();
  el.kpiGrid.innerHTML = emptyState("Excel indisponível", "A base não pode ser processada porque o parser local não carregou.");
  el.baseBars.innerHTML = emptyState("Sem leitura", "Abra a página pela pasta correta para carregar xlsx.full.min.js.");
  el.driverRank.innerHTML = emptyState("Sem leitura", "O arquivo Excel não pôde ser interpretado.");
  el.donutLegend.innerHTML = emptyState("Sem leitura", "A importação está indisponível até o parser carregar.");
  el.tableBody.innerHTML = `
    <tr>
      <td colspan="9">
        <div class="empty-state">
          <strong>Excel não carregado</strong>
          <span>Reabra o HTML nesta mesma pasta ou use a versão online publicada.</span>
        </div>
      </td>
    </tr>
  `;
}

function hydrateControls() {
  syncActiveDataset();
  const options = buildOptions(allRows);
  renderDatasetSelect();
  renderPeriodSelect();
  populateSelect(el.sheetSelect, SHEET_ORDER, state.sheet);
  populateSelect(el.typeSelect, options.tipos, state.tipo);
  populateSelect(el.baseSelect, options.bases, state.base);
  populateSelect(el.driverSelect, options.motoristas, state.motorista);

  el.searchInput.value = state.query;
  el.pageSize.value = String(state.pageSize || 50);
  hydrateValueSortControls();

  updateDatasetMeta();
  hydrateThemeControls();

  renderTabs();
}

function renderPeriodSelect() {
  if (!el.periodSelect) return;
  const datasets = library.datasets.filter((dataset) => dataset && dataset.id !== EMPTY_DATASET_ID && Array.isArray(dataset.rows) && dataset.rows.length);
  const activeId = state.period === "active" ? state.activeDatasetId : state.period;
  el.periodSelect.innerHTML = datasets.length
    ? datasets
        .map((dataset) => {
          const selected = dataset.id === activeId ? "selected" : "";
          return `<option value="${escapeAttribute(dataset.id)}" ${selected}>${escapeHtml(getDatasetPeriodLabel(dataset))}</option>`;
        })
        .join("")
    : `<option value="active">Sem quinzena</option>`;
  if (state.period !== "active" && !datasets.some((dataset) => dataset.id === state.period)) {
    state.period = "active";
  }
}

function hydrateValueSortControls() {
  const isLow = state.sortKey === "valor_numerico" && state.sortDir === "asc";
  if (el.sortHigh) el.sortHigh.classList.toggle("is-active", !isLow);
  if (el.sortLow) el.sortLow.classList.toggle("is-active", isLow);
}

function renderDatasetSelect() {
  const datasets = library.datasets.length ? library.datasets : [buildEmptyDataset()];
  el.datasetSelect.innerHTML = datasets
    .map((dataset) => {
      const selected = dataset.id === state.activeDatasetId ? "selected" : "";
      const count = integer.format(dataset.rows.length);
      return `<option value="${escapeAttribute(dataset.id)}" ${selected}>${escapeHtml(dataset.label)} (${count})</option>`;
    })
    .join("");
}

function updateDatasetMeta() {
  const totalFiles = library.datasets.length;
  const active = getActiveDataset();
  el.datasetCount.textContent = `${integer.format(totalFiles)} arquivo${totalFiles === 1 ? "" : "s"}`;
  el.datasetNote.textContent = active
    ? `${integer.format(active.rows.length)} registros neste arquivo. Você pode importar meses anteriores e alternar sem perder os dados já carregados.`
    : "Carregue meses anteriores e troque sem reimportar o workbook.";
  if (el.deleteActiveButton) {
    const deletable = Boolean(active && active.id !== EMPTY_DATASET_ID && canEdit());
    el.deleteActiveButton.hidden = !deletable;
    el.deleteActiveButton.disabled = !deletable;
    el.deleteActiveButton.textContent = active?.id === "seed" ? "Zerar base fixa" : "Excluir arquivo";
  }
}

function renderTabs() {
  const counts = countBySheet(allRows);
  el.sheetTabs.innerHTML = SHEET_TABS.map((sheet) => {
    const isActive = state.sheet === sheet ? "is-active" : "";
    const count = sheet === "Todos" ? allRows.length : counts[sheet] || 0;
    if (sheet === MONTHLY_BASE_VIEW) {
      return `
        <button type="button" class="sheet-tab ${isActive}" data-sheet="${sheet}">
          ${sheet}
        </button>
      `;
    }
    return `
      <button type="button" class="sheet-tab ${isActive}" data-sheet="${sheet}">
        ${sheet}
        <span class="sheet-tab__count">${integer.format(count)}</span>
      </button>
    `;
  }).join("");
}

function renderAll() {
  syncActiveDataset();
  const filtered = getFilteredRows();
  const sorted = sortRows(filtered);
  const paged = paginateRows(sorted);
  const summary = buildSummary(filtered);

  const monthlyView = state.sheet === MONTHLY_BASE_VIEW;
  toggleDashboardView(monthlyView);
  if (monthlyView) {
    renderMonthlyBaseEvolution();
  } else {
    renderKpis(summary);
    renderInsights(filtered, summary);
    renderMonthlyComparison();
    renderTable(paged, summary);
  }
  renderFilterSummary();
  updateTopbar(summary);
  updateAccessControls();
  persistState();
  persistLibrary();
}

function toggleDashboardView(monthlyView) {
  if (el.monthlyBaseView) el.monthlyBaseView.hidden = !monthlyView;
  [el.kpiGrid, document.querySelector(".insight-grid"), document.querySelector(".comparison-panel"), document.querySelector(".table-panel")].forEach((node) => {
    if (node) node.hidden = monthlyView;
  });
}

function renderKpis(summary) {
  const monthlyStatus = getActiveMonthlyStatus();
  const cards = [
    {
      label: "Total de descontos",
      value: currency.format(summary.totalValue),
      tone: "kpi-card--accent",
      delta: monthlyStatus,
    },
    {
      label: "Registros válidos",
      value: integer.format(summary.count),
      tone: "kpi-card--teal",
      delta: `${integer.format(summary.baseCount)} bases e ${integer.format(summary.routeCount)} rotas`,
    },
    {
      label: "Bases",
      value: integer.format(summary.baseCount),
      tone: "kpi-card--blue",
      delta: `${summary.topBase ? summary.topBase.label : "Sem base"} com maior desconto`,
    },
    {
      label: "Drivers",
      value: integer.format(summary.driverCount),
      tone: "kpi-card--blue",
      delta: `${summary.topDriver ? summary.topDriver.label : "Sem driver"} com maior desconto`,
    },
    {
      label: "Pacotes perdidos",
      value: integer.format(summary.packageCount),
      tone: "kpi-card--critical",
      delta: `${summary.packageShare}% do total filtrado`,
    },
    {
      label: "PNR",
      value: integer.format(summary.pnrCount),
      tone: "kpi-card--critical",
      delta: `${summary.pnrShare}% do total filtrado`,
    },
  ];

  el.kpiGrid.innerHTML = cards
    .map(
      (card, index) => `
      <article class="kpi-card ${card.tone}" style="--reveal-index:${index}">
        <div class="kpi-card__label">
          <span>${card.label}</span>
          <span class="kpi-card__icon">i</span>
        </div>
        <div class="kpi-card__value">${card.value}</div>
        <div class="kpi-card__delta">${card.delta}</div>
      </article>
    `,
    )
    .join("");
}

function renderInsights(filtered, summary) {
  const worstBases = topBy(filtered, "base", "valor_numerico", 5);
  const bestBases = bottomBy(filtered, "base", "valor_numerico", 5);
  const worstDrivers = topBy(filtered, "motorista", "valor_numerico", 5);
  const bestDrivers = bottomBy(filtered, "motorista", "valor_numerico", 5);
  const sheetShare = shareBySheet(filtered);
  const baseScale = Math.max(...worstBases.concat(bestBases).map((item) => item.total), 1);

  el.baseBars.innerHTML = worstBases.length || bestBases.length
    ? `${renderBaseRankingGroup("5 bases menos ofensivas", bestBases, baseScale, 0)}
       ${renderBaseRankingGroup("5 bases mais ofensivas", worstBases, baseScale, bestBases.length)}`
    : emptyState("Nenhum dado após os filtros", "Ajuste os filtros ou importe outra planilha.");

  el.driverRank.innerHTML = worstDrivers.length || bestDrivers.length
    ? `${renderDriverRankingGroup("5 drivers menos ofensivos", bestDrivers, 0)}
       ${renderDriverRankingGroup("5 drivers mais ofensivos", worstDrivers, bestDrivers.length)}`
    : emptyState("Sem drivers no recorte", "Importe o Excel ou libere os filtros.");

  const colors = sheetShare.map((item) => SHEET_COLORS[item.label] || "#9aa8b8");
  renderDonutChart(summary, sheetShare, colors);
  el.donutLegend.innerHTML = sheetShare.length
    ? sheetShare
        .map((item, index) => {
          const color = colors[index];
          return `
            <button class="legend__row" type="button" data-sheet="${escapeAttribute(item.label)}" style="--reveal-index:${index}">
              <span class="legend__swatch" style="background:${color}"></span>
              <div>
                <div class="legend__title">
                  <span>${escapeHtml(item.label)}</span>
                  <span>${item.share.toFixed(1)}%</span>
                </div>
                <div class="legend__value">${currency.format(item.total)} em descontos · ${integer.format(item.count)} registros</div>
              </div>
            </button>
          `;
        })
        .join("")
    : emptyState("Sem mix por aba", "Os dados filtrados não têm distribuição.");
}

function renderDonutChart(summary, sheetShare, colors) {
  const circumference = 2 * Math.PI * 42;
  let offset = 0;
  const segments = sheetShare
    .map((item, index) => {
      const length = (item.share / 100) * circumference;
      const dashOffset = -offset;
      offset += length;
      return `
        <circle
          class="donut-segment"
          cx="50"
          cy="50"
          r="42"
          fill="none"
          stroke="${colors[index]}"
          stroke-width="18"
          stroke-dasharray="${length.toFixed(3)} ${(circumference - length).toFixed(3)}"
          stroke-dashoffset="${dashOffset.toFixed(3)}"
          data-sheet="${escapeAttribute(item.label)}"
          data-title="${escapeAttribute(item.label)}"
          data-value="${escapeAttribute(currency.format(item.total))}"
          data-count="${escapeAttribute(integer.format(item.count))}"
          data-share="${escapeAttribute(`${item.share.toFixed(1)}%`)}"
        ></circle>
      `;
    })
    .join("");

  el.donutChart.style.background = "transparent";
  el.donutChart.innerHTML = `
    <svg class="donut-svg" viewBox="0 0 100 100" aria-hidden="true">
      <g transform="rotate(-90 50 50)">
        <circle class="donut-track" cx="50" cy="50" r="42" fill="none" stroke-width="18"></circle>
        ${segments}
      </g>
    </svg>
    <div class="donut__center">
      <strong id="donut-total">${currency.format(summary.totalValue)}</strong>
      <span>Total de descontos</span>
    </div>
    <div class="donut-tooltip" id="donut-tooltip" hidden></div>
  `;
  el.donutTotal = document.getElementById("donut-total");
  el.donutTooltip = document.getElementById("donut-tooltip");
}

function showDonutTooltip(segment) {
  if (!el.donutTooltip) return;
  el.donutTooltip.innerHTML = `
    <strong>${escapeHtml(segment.dataset.title || "")}</strong>
    <span>${escapeHtml(segment.dataset.value || "")} em descontos</span>
    <span>${escapeHtml(segment.dataset.count || "0")} registros · ${escapeHtml(segment.dataset.share || "0%")}</span>
  `;
  el.donutTooltip.hidden = false;
}

function hideDonutTooltip() {
  if (el.donutTooltip) el.donutTooltip.hidden = true;
}

function renderMonthlyComparison() {
  if (!el.monthlyComparison) return;
  const rows = buildMonthlyComparison();
  const scopeLabel = state.sheet === "Todos" ? "geral" : state.sheet;
  if (el.comparisonMeta) {
    el.comparisonMeta.textContent = rows.length ? `${integer.format(rows.length)} competências · ${scopeLabel}` : `sem histórico · ${scopeLabel}`;
  }
  if (!rows.length) {
    el.monthlyComparison.innerHTML = emptyState("Sem comparação mensal", "Importe pré-faturas de meses diferentes para comparar esta aba.");
    return;
  }

  const maxValue = Math.max(...rows.map((row) => row.totalValue), 1);
  el.monthlyComparison.innerHTML = rows
    .map((row, index) => {
      const pct = (row.totalValue / maxValue) * 100;
      const trendClass = row.deltaValue > 0 ? "is-up" : row.deltaValue < 0 ? "is-down" : "is-flat";
      const deltaLabel = row.previous
        ? `${row.deltaValue > 0 ? "+" : ""}${row.deltaPct.toFixed(1)}% em descontos vs. mês anterior`
        : "primeira competência";
      return `
        <button class="month-row ${row.datasetId === state.activeDatasetId ? "is-active" : ""}" type="button" data-dataset-id="${escapeAttribute(row.datasetId)}" style="--reveal-index:${index}">
          <div class="month-row__main">
            <strong>${escapeHtml(row.label)}</strong>
            <span>${integer.format(row.count)} registros · ${integer.format(row.pnrCount)} PNR · ${integer.format(row.packageCount)} perdidos</span>
          </div>
          <div class="month-row__bar">
            <span style="width:${pct.toFixed(1)}%"></span>
          </div>
          <div class="month-row__value">
            <strong>${currency.format(row.totalValue)}</strong>
            <span class="${trendClass}">${deltaLabel}</span>
          </div>
        </button>
      `;
    })
    .join("");
}

function renderMonthlyBaseEvolution() {
  if (!el.monthlyBaseView) return;
  const sheets = ["SVC PERDIDOS", "XPT PERDIDOS", "PNR"];
  const datasets = getComparableDatasets();
  if (!datasets.length) {
    el.monthlyBaseView.innerHTML = emptyState("Sem histórico mensal", "Importe pré-faturas de meses diferentes para comparar a evolução por base.");
    return;
  }

  el.monthlyBaseView.innerHTML = `
    <div class="monthly-view__header">
      <div>
        <h2>EVOLUÇÃO</h2>
      </div>
      <span class="panel__meta">${integer.format(datasets.length)} competências</span>
    </div>
    <div class="monthly-tower-grid">
      ${sheets.map((sheet, index) => renderSheetEvolutionCard(sheet, datasets, index)).join("")}
    </div>
  `;
}

function getComparableDatasets() {
  return library.datasets
    .filter((dataset) => dataset && dataset.id !== EMPTY_DATASET_ID && Array.isArray(dataset.rows) && dataset.rows.length)
    .map((dataset) => ({ dataset, period: getDatasetPeriod(dataset), label: getDatasetPeriodLabel(dataset) }))
    .sort((a, b) => a.period.sort - b.period.sort || a.label.localeCompare(b.label, "pt-BR"));
}

function renderSheetEvolutionCard(sheet, datasets, index) {
  const metricLabel = sheet === "PNR" ? "PNR" : "pacotes perdidos";
  const rowsByDataset = datasets.map(({ dataset, label }) => ({
    label,
    rows: dataset.rows.filter((row) => row.aba_origem === sheet),
  }));
  const baseTotals = new Map();
  for (const period of rowsByDataset) {
    for (const row of period.rows) {
      const base = row.base || "Sem base";
      baseTotals.set(base, (baseTotals.get(base) || 0) + 1);
    }
  }
  const bases = Array.from(baseTotals.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"))
    .map(([base]) => base);
  const totals = bases.flatMap((base) =>
    rowsByDataset.map((period) => period.rows.filter((row) => row.base === base).length),
  );
  const max = Math.max(...totals, 1);
  const sheetTotal = rowsByDataset.reduce((acc, period) => acc + period.rows.reduce((sum, row) => sum + Number(row.valor_numerico || 0), 0), 0);
  const sheetCount = rowsByDataset.reduce((acc, period) => acc + period.rows.length, 0);
  const pnrGoal = sheet === "PNR" ? getPnrGoalStatus(sheetTotal) : null;

  return `
    <article class="panel tower-card" style="--reveal-index:${index}">
      <div class="panel__header">
        <div>
          <h2>${escapeHtml(sheet)}</h2>
          <div class="tower-summary">
            <span>${integer.format(sheetCount)} ${metricLabel}</span>
            <span>${currency.format(sheetTotal)} em descontos</span>
          </div>
        </div>
        ${pnrGoal ? renderPnrGoalGauge(pnrGoal) : ""}
      </div>
      ${
        bases.length
          ? `<div class="tower-chart clustered-chart">
              ${bases.map((base) => renderBaseTower(base, rowsByDataset, max, metricLabel)).join("")}
            </div>
            <div class="tower-legend">
              <span><i style="background:#58d68d"></i>Menos ofensiva</span>
              <span><i style="background:#3ba6ff"></i>Baixa</span>
              <span><i style="background:#ffb454"></i>Atenção</span>
              <span><i style="background:#ff6b6b"></i>Mais ofensiva</span>
            </div>`
          : emptyState("Sem dados nesta aba", "Não há registros para comparar neste recorte.")
      }
    </article>
  `;
}

function renderBaseTower(base, rowsByDataset, max, metricLabel) {
  const values = rowsByDataset.map((period, index) => {
    const rows = period.rows.filter((row) => row.base === base);
    const total = rows.length;
    const value = rows.reduce((acc, row) => acc + Number(row.valor_numerico || 0), 0);
    return { index, label: period.label, total, value };
  });
  const evolution = getBaseEvolution(values);
  const bars = values.map((period, index) => {
    const width = period.total ? Math.max(3, (period.total / max) * 100) : 0;
    const comparison = index ? getPairEvolution(values[index - 1].total, period.total) : null;
    const color = getOffenseColor(period.total, max);
    return `
      <span class="timeline-period">
        <span class="timeline-period__label">${escapeHtml(shortPeriodLabel(period.label))}</span>
        <span
        class="tower-bar"
          style="width:${width.toFixed(1)}%; background:${color}"
          title="${escapeAttribute(`${formatBaseCode(base)} · ${period.label}: ${integer.format(period.total)} ${metricLabel} · ${currency.format(period.value)}`)}"
        ></span>
        ${comparison ? `<span class="tower-evolution ${comparison.tone}" title="${escapeAttribute(`${formatBaseCode(base)}: ${comparison.label} vs. ${values[index - 1].label}`)}"><strong>${escapeHtml(comparison.arrow)}</strong> ${escapeHtml(comparison.label)}</span>` : ""}
      </span>
    `;
  }).join("");
  const total = values.reduce((acc, period) => acc + period.total, 0);
  const code = formatBaseCode(base);
  return `
    <div class="tower-base">
      <strong>${escapeHtml(code)}</strong>
      <div class="tower-bars">${bars}</div>
      <span class="tower-status ${evolution.tone}">${escapeHtml(evolution.status)}</span>
    </div>
  `;
}

function getBaseEvolution(values) {
  const first = values[0]?.total || 0;
  const last = values[values.length - 1]?.total || 0;
  if (!values.length || values.length < 2) {
    return { arrow: "→", label: "sem histórico", tone: "is-flat", status: "Histórico curto" };
  }
  if (!first && !last) return { arrow: "→", label: "0.0%", tone: "is-flat", status: "Estável" };
  const delta = first ? ((last - first) / first) * 100 : 100;
  const label = `${delta > 0 ? "+" : ""}${delta.toFixed(1)}%`;
  if (delta < 0) return { arrow: "↓", label, tone: "is-good", status: "Menos ofensiva" };
  if (delta > 0) return { arrow: "↑", label, tone: "is-bad", status: "Mais ofensiva" };
  return { arrow: "→", label, tone: "is-flat", status: "Estável" };
}

function getPairEvolution(previous, current) {
  if (!previous && !current) return { arrow: "→", label: "0.0%", tone: "is-flat" };
  const delta = previous ? ((current - previous) / previous) * 100 : 100;
  const label = `${delta > 0 ? "+" : ""}${delta.toFixed(1)}%`;
  if (delta < 0) return { arrow: "↓", label, tone: "is-good" };
  if (delta > 0) return { arrow: "↑", label, tone: "is-bad" };
  return { arrow: "→", label, tone: "is-flat" };
}

function getPnrGoalStatus(totalValue) {
  const limit = Number(state.pnrGoalLimit || DEFAULT_PNR_GOAL_LIMIT);
  const ok = totalValue <= limit;
  const ratio = Math.min(totalValue / (limit * 2), 1);
  const angle = -70 + ratio * 140;
  return {
    tone: ok ? "is-good" : "is-bad",
    label: ok ? "OK" : "atenção",
    angle: angle.toFixed(1),
    valueLabel: currency.format(totalValue),
    limit,
    limitLabel: currency.format(limit),
  };
}

function renderPnrGoalGauge(goal) {
  return `
    <div
      class="pnr-gauge ${goal.tone}"
      style="--needle-angle:${goal.angle}deg"
      title="${escapeAttribute(`Meta PNR: abaixo de ${goal.limitLabel} está OK. Atual: ${goal.valueLabel}`)}"
    >
      <span class="pnr-gauge__label">Meta PNR</span>
      <span class="pnr-gauge__dial"><i></i></span>
      <strong>${escapeHtml(goal.label)}</strong>
      <details class="pnr-goal-menu">
        <summary title="Editar meta PNR">⚙</summary>
        <label>
          Meta
          <input type="number" min="1" step="100" value="${escapeAttribute(goal.limit)}" data-pnr-goal-input>
        </label>
      </details>
    </div>
  `;
}

function formatBaseCode(base) {
  const parts = splitBase(base);
  return parts.sigla_base || parts.cidade_base || String(base || "Sem base");
}

function getOffenseColor(value, max) {
  const ratio = max ? value / max : 0;
  if (ratio >= 0.72) return "#ff6b6b";
  if (ratio >= 0.45) return "#ffb454";
  if (ratio >= 0.22) return "#3ba6ff";
  return "#58d68d";
}

function shortPeriodLabel(label) {
  const text = String(label || "");
  const quarter = text.match(/(\d+)[ªa]?\s*(?:quinzena|q)/i);
  const month = text.match(/(janeiro|fevereiro|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)/i);
  const q = quarter ? `${quarter[1]}Q` : "";
  const m = month ? month[1].slice(0, 3).replace(/^mar$/i, "Mar") : text.slice(0, 3);
  return `${q} ${m}`.trim();
}

function parseCurrencyInput(value) {
  const normalized = String(value || "")
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getActiveMonthlyStatus() {
  const rows = buildMonthlyComparison();
  const active = rows.find((row) => row.datasetId === state.activeDatasetId) || rows[rows.length - 1] || null;
  if (!active) return "Sem histórico mensal";
  if (!active.previous) return "Sem mês anterior carregado";
  const prefix = active.deltaValue > 0 ? "+" : "";
  return `${prefix}${active.deltaPct.toFixed(1)}% vs. mês anterior`;
}

function renderBaseRankingGroup(title, items, maxValue, offset) {
  if (!items.length) return "";
  return `
    <div class="rank-section">
      <h3>${escapeHtml(title)}</h3>
      ${items
        .map((item, index) => {
          const pct = maxValue > 0 ? (item.total / maxValue) * 100 : 0;
          return `
            <button class="bar-row" type="button" data-base="${escapeAttribute(item.label)}" style="--reveal-index:${offset + index}">
              <div class="bar-row__label">${escapeHtml(item.label)}</div>
              <div class="bar-row__track"><div class="bar-row__fill" style="width:${pct.toFixed(1)}%"></div></div>
              <div class="bar-row__value">${compactCurrency.format(item.total)}</div>
            </button>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderDriverRankingGroup(title, items, offset) {
  if (!items.length) return "";
  return `
    <div class="rank-section">
      <h3>${escapeHtml(title)}</h3>
      <div class="mini-table__head">
        <span>#</span>
        <span>Driver</span>
        <span class="is-right">Desconto</span>
        <span class="is-right">Registros</span>
      </div>
      ${items
        .map(
          (item, index) => `
            <button class="mini-table__row" type="button" data-driver="${escapeAttribute(item.label)}" style="--reveal-index:${offset + index}">
              <span class="mini-table__rank">${index + 1}</span>
              <span class="mini-table__name">${escapeHtml(item.label)}</span>
              <span class="mini-table__value">${compactCurrency.format(item.total)}</span>
              <span class="mini-table__count">${integer.format(item.count)}</span>
            </button>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderTable(rows, summary) {
  const totalRows = getFilteredRows().length;
  const pageCount = Math.max(1, Math.ceil(totalRows / state.pageSize));
  state.page = Math.min(state.page, pageCount);
  const start = totalRows === 0 ? 0 : (state.page - 1) * state.pageSize + 1;
  const end = totalRows === 0 ? 0 : Math.min(start + rows.length - 1, totalRows);

  el.resultCount.textContent = integer.format(totalRows);
  el.tableRange.textContent = `${integer.format(start)}-${integer.format(end)} de ${integer.format(totalRows)}`;
  el.pageIndicator.textContent = `Página ${integer.format(state.page)} de ${integer.format(pageCount)}`;
  el.prevPage.disabled = state.page <= 1;
  el.nextPage.disabled = state.page >= pageCount;

  if (!rows.length) {
    el.tableBody.innerHTML = `
      <tr>
        <td colspan="9">
          <div class="empty-state">
            <strong>Nenhum registro encontrado</strong>
            <span>Tente limpar os filtros ou enviar outro Excel.</span>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  el.tableBody.innerHTML = rows
    .map((row, index) => {
      const badgeClass = row.tipo_registro === "PNR" ? "badge--pnr" : row.aba_origem === "XPT PERDIDOS" ? "badge--xpt" : "badge--svc";
      return `
        <tr style="--reveal-index:${index}">
          <td>
            <strong>${escapeHtml(row.base)}</strong>
            <span class="cell-subtle">${escapeHtml(row.cidade_base || row.sigla_base || "Base")}</span>
          </td>
          <td>
            <strong>${escapeHtml(row.motorista || "Sem driver")}</strong>
            <span class="cell-subtle">${escapeHtml(row.n_rota ? `Rota ${row.n_rota}` : "Sem rota")}</span>
          </td>
          <td>${escapeHtml(row.placa || "Sem placa")}</td>
          <td><span class="badge ${badgeClass}">${escapeHtml(row.tipo_desconto || row.tipo_registro)}</span></td>
          <td><span class="badge badge--sheet">${escapeHtml(row.aba_origem)}</span></td>
          <td>${formatDate(row.data_normalizada)}</td>
          <td>${escapeHtml(row.id_pacote || "—")}</td>
          <td>${escapeHtml(row.n_rota || "—")}</td>
          <td class="is-right"><strong>${currency.format(row.valor_numerico || 0)}</strong></td>
        </tr>
      `;
    })
    .join("");
}

function renderFilterSummary() {
  const applied = [];
  const push = (label, value) => {
    if (value && value !== "Todos") applied.push({ label, value });
  };

  push("Aba", state.sheet);
  push("Tipo", state.tipo);
  push("Base", state.base);
  push("Driver", state.motorista);
  if (state.period !== "active") push("Quinzena", getDatasetPeriodLabel(getDatasetById(state.period)));
  if (state.query) applied.push({ label: "Busca", value: state.query });

  el.activeFiltersCount.textContent = `${applied.length} filtro${applied.length === 1 ? "" : "s"} ativo${applied.length === 1 ? "" : "s"}`;
  el.filterSummary.innerHTML = applied.length
    ? `
      <div class="filter-pill-row">
        ${applied.map((item) => `<span class="filter-pill"><strong>${escapeHtml(item.label)}:</strong> ${escapeHtml(item.value)}</span>`).join("")}
      </div>
    `
    : `
      <div class="status-row">
        <strong>Sem filtros ativos</strong>
        <span>Mostrando a base inteira</span>
      </div>
    `;
}

function updateTopbar(summary = buildSummary(getFilteredRows())) {
  el.sourceLine.textContent = fileMeta.label
    ? `Arquivo ativo: ${fileMeta.label}`
    : fileMeta.fileName
      ? `Arquivo ativo: ${humanizeWorkbookName(fileMeta.fileName)}`
      : "Arquivo ativo: pré-fatura";
  el.statusText.textContent = summary.count
    ? `${integer.format(summary.count)} registros filtrados em tempo real`
    : "Nenhum registro no recorte atual";
  if (el.syncStatus) {
    el.syncStatus.textContent = backendMessage || (getBackendBaseUrl() ? "Backend configurado" : "Modo local");
  }
  el.lastUpdate.textContent = `Última atualização: ${summary.lastUpdate || "--"}`;
}

function buildSummary(rows) {
  const count = rows.length;
  const totalValue = rows.reduce((acc, row) => acc + Number(row.valor_numerico || 0), 0);
  const baseCount = uniqueCount(rows, "base");
  const driverCount = uniqueCount(rows, "motorista");
  const routeCount = uniqueCount(rows, "n_rota");
  const packageCount = rows.filter((row) => row.tipo_registro === "PACOTE PERDIDO").length;
  const pnrCount = rows.filter((row) => row.tipo_registro === "PNR").length;
  const topBase = topBy(rows, "base", "valor_numerico", 1)[0] || null;
  const topDriver = topBy(rows, "motorista", "valor_numerico", 1)[0] || null;
  const packageShare = count ? ((packageCount / count) * 100).toFixed(1) : "0.0";
  const pnrShare = count ? ((pnrCount / count) * 100).toFixed(1) : "0.0";
  const lastUpdate = rows.length ? formatDate(maxDate(rows)) : "--";

  return {
    count,
    totalValue,
    baseCount,
    driverCount,
    routeCount,
    packageCount,
    pnrCount,
    topBase,
    topDriver,
    packageShare,
    pnrShare,
    fileName: fileMeta.label || humanizeWorkbookName(fileMeta.fileName || ""),
    lastUpdate,
  };
}

function buildMonthlyComparison() {
  const map = new Map();
  for (const dataset of library.datasets) {
    if (!dataset || dataset.id === EMPTY_DATASET_ID || !Array.isArray(dataset.rows) || !dataset.rows.length) continue;
    const scopedRows = getMonthlyComparisonRows(dataset.rows);
    if (!scopedRows.length) continue;
    const period = getDatasetPeriod({ ...dataset, rows: scopedRows });
    const key = period.key;
    if (!map.has(key)) {
      map.set(key, {
        key,
        sort: period.sort,
        label: period.monthLabel,
        datasetId: dataset.id,
        count: 0,
        totalValue: 0,
        pnrCount: 0,
        packageCount: 0,
      });
    }
    const bucket = map.get(key);
    bucket.datasetId = dataset.id;
    bucket.count += scopedRows.length;
    bucket.totalValue += scopedRows.reduce((acc, row) => acc + Number(row.valor_numerico || 0), 0);
    bucket.pnrCount += scopedRows.filter((row) => row.tipo_registro === "PNR").length;
    bucket.packageCount += scopedRows.filter((row) => row.tipo_registro === "PACOTE PERDIDO").length;
  }

  const rows = Array.from(map.values()).sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label, "pt-BR"));
  return rows.map((row, index) => {
    const previous = rows[index - 1] || null;
    const deltaValue = previous ? row.totalValue - previous.totalValue : 0;
    const deltaPct = previous && previous.totalValue ? (deltaValue / previous.totalValue) * 100 : 0;
    return { ...row, previous, deltaValue, deltaPct };
  });
}

function getMonthlyComparisonRows(rows) {
  if (state.sheet === "Todos") return rows;
  return rows.filter((row) => row.aba_origem === state.sheet);
}

function getDatasetPeriod(dataset) {
  const fromName = String(dataset.label || dataset.fileName || "");
  const month = detectMonth(fromName) || detectMonthFromRows(dataset.rows);
  const year = detectYear(fromName) || detectYearFromRows(dataset.rows) || String(new Date().getFullYear());
  const monthIndex = monthNumber(month) || 1;
  const monthLabel = month ? `${capitalize(month)} / ${year}` : `Sem mês / ${year}`;
  return {
    key: `${year}-${String(monthIndex).padStart(2, "0")}`,
    sort: Number(year) * 100 + monthIndex,
    monthLabel,
  };
}

function detectMonthFromRows(rows) {
  const dated = rows.find((row) => row.data_normalizada || row.data_sort);
  if (!dated) return "";
  const date = dated.data_normalizada ? new Date(`${dated.data_normalizada}T00:00:00Z`) : new Date(dated.data_sort);
  if (Number.isNaN(date.getTime())) return "";
  return MONTHS[date.getUTCMonth()] || "";
}

function detectYearFromRows(rows) {
  const dated = rows.find((row) => row.data_normalizada || row.data_sort);
  if (!dated) return "";
  const date = dated.data_normalizada ? new Date(`${dated.data_normalizada}T00:00:00Z`) : new Date(dated.data_sort);
  if (Number.isNaN(date.getTime())) return "";
  return String(date.getUTCFullYear());
}

function getFilteredRows() {
  const query = normalize(state.query);

  return allRows.filter((row) => {
    if (SHEET_ORDER.includes(state.sheet) && state.sheet !== "Todos" && row.aba_origem !== state.sheet) return false;
    if (state.tipo !== "Todos" && row.tipo_desconto !== state.tipo) return false;
    if (state.base !== "Todos" && row.base !== state.base) return false;
    if (state.motorista !== "Todos" && row.motorista !== state.motorista) return false;

    if (!query) return true;
    return row._search.includes(query);
  });
}

function sortRows(rows) {
  const dir = state.sortDir === "desc" ? -1 : 1;
  const sortKey = state.sortKey;
  const sorted = rows.slice();

  sorted.sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];

    if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;

    const as = av == null ? "" : String(av);
    const bs = bv == null ? "" : String(bv);
    if (as === bs) return 0;

    return as.localeCompare(bs, "pt-BR", { numeric: true, sensitivity: "base" }) * dir;
  });

  return sorted;
}

function paginateRows(rows) {
  const start = (state.page - 1) * state.pageSize;
  return rows.slice(start, start + state.pageSize);
}

function populateSelect(select, values, current) {
  const unique = Array.from(new Set(values.filter(Boolean)));
  const opts = ["Todos", ...unique];
  select.innerHTML = opts
    .map((value) => `<option value="${escapeAttribute(value)}">${escapeHtml(value)}</option>`)
    .join("");
  select.value = current && opts.includes(current) ? current : "Todos";
}

function buildOptions(rows) {
  const normalizeSort = (values) =>
    Array.from(
      new Set(
        values
          .map((value) => (value == null ? "" : String(value).trim()))
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
  return {
    tipos: normalizeSort(rows.map((row) => row.tipo_desconto)),
    bases: normalizeSort(rows.map((row) => row.base)),
    motoristas: normalizeSort(rows.map((row) => row.motorista)),
  };
}

function countBySheet(rows) {
  return rows.reduce((acc, row) => {
    acc[row.aba_origem] = (acc[row.aba_origem] || 0) + 1;
    return acc;
  }, {});
}

function shareBySheet(rows) {
  const totals = rows.reduce((acc, row) => {
    const label = row.aba_origem || "Sem aba";
    if (!acc[label]) acc[label] = { label, total: 0, count: 0 };
    acc[label].total += Number(row.valor_numerico || 0);
    acc[label].count += 1;
    return acc;
  }, {});

  const list = Object.values(totals).sort((a, b) => b.total - a.total);
  const grand = list.reduce((acc, item) => acc + item.total, 0) || 1;
  let cursor = 0;
  return list.map((item) => {
    const share = (item.total / grand) * 100;
    const start = cursor;
    const end = cursor + share;
    cursor = end;
    return { ...item, share, start, end };
  });
}

function topBy(rows, key, metric, limit) {
  const map = new Map();
  for (const row of rows) {
    const label = row[key] == null || row[key] === "" ? "Sem valor" : String(row[key]);
    if (!map.has(label)) {
      map.set(label, { label, total: 0, count: 0 });
    }
    const item = map.get(label);
    item.total += Number(row[metric] || 0);
    item.count += 1;
  }
  return Array.from(map.values())
    .sort((a, b) => b.total - a.total || b.count - a.count || String(a.label).localeCompare(String(b.label), "pt-BR"))
    .slice(0, limit);
}

function bottomBy(rows, key, metric, limit) {
  const map = new Map();
  for (const row of rows) {
    const label = row[key] == null || row[key] === "" ? "Sem valor" : String(row[key]);
    if (!map.has(label)) {
      map.set(label, { label, total: 0, count: 0 });
    }
    const item = map.get(label);
    item.total += Number(row[metric] || 0);
    item.count += 1;
  }
  return Array.from(map.values())
    .sort((a, b) => a.total - b.total || a.count - b.count || String(a.label).localeCompare(String(b.label), "pt-BR"))
    .slice(0, limit);
}

function uniqueCount(rows, key) {
  return new Set(rows.map((row) => row[key]).filter(Boolean)).size;
}

function maxDate(rows) {
  return rows.reduce((max, row) => {
    if (!row.data_sort) return max;
    return !max || row.data_sort > max ? row.data_sort : max;
  }, null);
}

function normalizeHeader(value) {
  return normalize(String(value || ""))
    .replace(/[^a-z0-9]+/g, "")
    .toUpperCase();
}

function findHeaderIndex(headers, aliases) {
  const normalizedAliases = aliases.map(normalizeHeader);
  for (let i = 0; i < headers.length; i += 1) {
    const header = headers[i];
    if (!header) continue;
    const normalized = normalizeHeader(header);
    if (normalizedAliases.includes(normalized)) return i;
  }
  for (let i = 0; i < headers.length; i += 1) {
    const header = normalizeHeader(headers[i]);
    if (normalizedAliases.some((alias) => header.includes(alias))) return i;
  }
  return -1;
}

function normalizeWorkbook(workbook) {
  const records = [];
  const seen = new Set();
  let duplicatesSkipped = 0;

  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
    if (!matrix.length) return;

    const headers = (matrix[0] || []).map((value) => String(value || "").trim());
    const idx = {
      base: findHeaderIndex(headers, ["BASE"]),
      motorista: findHeaderIndex(headers, ["MOTORISTA"]),
      placa: findHeaderIndex(headers, ["PLACA"]),
      tipo: findHeaderIndex(headers, ["DESCONTO PACOTE PERDIDO", "DESCONTO PNR"]),
      data: findHeaderIndex(headers, ["DATA DA ROTA", "DATA"]),
      pacote: findHeaderIndex(headers, ["ID DO PACOTE"]),
      rota: findHeaderIndex(headers, ["Nº ROTA", "N° ROTA", "NRO ROTA", "NUMERO ROTA", "ROTA"]),
      valor: findHeaderIndex(headers, ["VALOR"]),
      descricao: findHeaderIndex(headers, ["DESCRIÇÃO"]),
    };

    for (let i = 1; i < matrix.length; i += 1) {
      const row = matrix[i];
      if (!row || row.every((cell) => cell == null || String(cell).trim() === "")) continue;

      const base = readCell(row, idx.base);
      if (!base || normalize(base) === "total") continue;

      const motorista = readCell(row, idx.motorista);
      const placa = readCell(row, idx.placa);
      const tipoDesc = readCell(row, idx.tipo) || (sheetName === "PNR" ? "DESCONTO PNR" : "DESCONTO PACOTE PERDIDO");
      const dataValue = readCell(row, idx.data);
      const idPacote = readCell(row, idx.pacote);
      const rota = readCell(row, idx.rota);
      const valor = readCell(row, idx.valor);
      const descricao = readCell(row, idx.descricao);
      const parsedDate = parseDateValue(dataValue);

      const normalized = {
        aba_origem: sheetName,
        tipo_desconto: tipoDesc,
        base,
        cidade_base: splitBase(base).cidade_base,
        sigla_base: splitBase(base).sigla_base,
        motorista: motorista || "",
        placa: placa || "",
        descricao: descricao || "",
        data_normalizada: parsedDate.iso,
        data_sort: parsedDate.ts,
        id_pacote: formatId(idPacote),
        n_rota: formatId(rota),
        valor_numerico: parseMoney(valor),
      };

      normalized.tipo_registro = sheetName === "PNR" ? "PNR" : "PACOTE PERDIDO";
      normalized._search = normalize(
        [
          normalized.aba_origem,
          normalized.tipo_desconto,
          normalized.base,
          normalized.cidade_base,
          normalized.sigla_base,
          normalized.motorista,
          normalized.placa,
          normalized.descricao,
          normalized.id_pacote,
          normalized.n_rota,
          normalized.data_normalizada,
        ]
          .filter(Boolean)
          .join(" "),
      );

      const signature = [
        normalized.base,
        normalized.motorista,
        normalized.placa,
        normalized.tipo_desconto,
        normalized.data_normalizada,
        normalized.id_pacote,
        normalized.n_rota,
        normalized.valor_numerico,
      ]
        .map((value) => normalize(value))
        .join("|");

      if (seen.has(signature)) {
        duplicatesSkipped += 1;
        continue;
      }
      seen.add(signature);
      records.push(normalized);
    }
  });

  normalizeWorkbook.lastStats = { duplicatesSkipped };
  return records;
}

async function handleUpload(event) {
  const files = Array.from((event.target && event.target.files) || []);
  if (!files.length) return;
  if (!canEdit()) {
    showToast("Seu usuário é somente visualização.", "warn", 5200);
    event.target.value = "";
    return;
  }

  try {
    const engineReady = await loadWorkbookEngine();
    if (!engineReady || !window.XLSX || typeof window.XLSX.read !== "function") {
      showToast("Não foi possível ler o Excel porque o parser local não carregou.", "error", 7000);
      event.target.value = "";
      return;
    }

    const imported = [];
    for (const file of files) {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
      const rows = normalizeWorkbook(workbook);
      const duplicatesSkipped = normalizeWorkbook.lastStats?.duplicatesSkipped || 0;
      const dataset = {
        id: makeDatasetId(file.name),
        fileName: file.name,
        label: humanizeWorkbookName(file.name),
        source: "upload",
        importedAt: new Date().toISOString(),
        rows,
      };
      imported.push(dataset);
    }

    if (!imported.length) return;

    for (const dataset of imported) {
      upsertDataset(dataset);
    }

    state.activeDatasetId = imported[imported.length - 1].id;
    state.fileName = imported[imported.length - 1].fileName;
    state.page = 1;
    syncActiveDataset();
    hydrateControls();
    persistState();
    persistLibrary();
    renderAll();
    void syncLibraryToBackend();
    showToast(
      imported.length === 1
        ? `Arquivo carregado: ${imported[0].label}${(normalizeWorkbook.lastStats?.duplicatesSkipped || 0) ? ` · ${normalizeWorkbook.lastStats.duplicatesSkipped} duplicatas ignoradas` : ""}`
        : `${imported.length} arquivos carregados na biblioteca`,
      "good",
      5200,
    );
  } catch (error) {
    console.error(error);
    showToast("Não foi possível ler esse Excel.", "error", 5200);
  } finally {
    event.target.value = "";
  }
}


async function loadWorkbookEngine() {
  if (window.XLSX && typeof window.XLSX.read === "function" && window.XLSX.utils && typeof window.XLSX.utils.sheet_to_json === "function") {
    return true;
  }

  if (!workbookEnginePromise) {
    workbookEnginePromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = new URL("./xlsx.full.min.js", document.baseURI).href;
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => reject(new Error("Failed to load xlsx.full.min.js"));
      document.head.appendChild(script);
    });
  }

  try {
    await workbookEnginePromise;
    return true;
  } catch (error) {
    console.error(error);
    showToast("Não foi possível carregar o parser do Excel.", "error", 7000);
    return false;
  } finally {
    workbookEnginePromise = null;
  }
}

function normalizeBaseUrl(value) {
  const raw = String(value || "")
    .trim()
    .replace(/\/+$/, "");
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

function getBackendBaseUrl() {
  return normalizeBaseUrl(state.apiBaseUrl || window.__PRE_FATURA_BACKEND?.baseUrl || "");
}

async function apiFetch(path, options = {}) {
  const baseUrl = getBackendBaseUrl();
  if (!baseUrl) {
    const error = new Error("Backend não configurado");
    error.status = 0;
    throw error;
  }

  const headers = new Headers(options.headers || {});
  if (authToken) headers.set("Authorization", `Bearer ${authToken}`);
  const response = await fetch(new URL(path, baseUrl).href, {
    ...options,
    headers,
  });
  if (response.status === 401) {
    authToken = "";
    currentUser = null;
    persistAuthToken();
    updateAccessControls();
  }
  return response;
}

function buildSeedDataset() {
  const seedMeta = window.__PRE_FATURA_META || {};
  return {
    id: "seed",
    fileName: seedMeta.fileName || STATE_DEFAULT.fileName,
    label: humanizeWorkbookName(seedMeta.fileName || STATE_DEFAULT.fileName),
    source: "seed",
    importedAt: seedMeta.importedAt || new Date().toISOString(),
    rows: seedRows.slice(),
  };
}

function buildEmptyDataset() {
  return {
    id: EMPTY_DATASET_ID,
    fileName: "",
    label: "Nenhum arquivo carregado",
    source: "empty",
    importedAt: new Date().toISOString(),
    rows: [],
  };
}

function mergeSeedIntoLibrary(store) {
  const rawDatasets = Array.isArray(store?.datasets) ? store.datasets : [];
  const normalized = rawDatasets.map(normalizeDatasetRecord).filter(Boolean);
  const uploaded = normalized.filter((dataset) => dataset.source !== "seed" && dataset.id !== "seed");
  const seed = buildSeedDataset();
  const seedDeleted = Boolean(store?.seedDeleted);
  const datasets = seedDeleted ? uploaded : [seed, ...uploaded];
  const desiredActive = String(store?.activeDatasetId || (seedDeleted ? uploaded[0]?.id || EMPTY_DATASET_ID : "seed"));
  const activeDatasetId = datasets.some((dataset) => dataset.id === desiredActive) ? desiredActive : datasets[0]?.id || EMPTY_DATASET_ID;
  return {
    activeDatasetId,
    seedDeleted,
    datasets,
  };
}

function updateBackendStatus(kind, message) {
  backendStatus = kind;
  backendMessage = message;
  if (el.backendStatus) {
    el.backendStatus.textContent = message;
    el.backendStatus.dataset.state = kind;
  }
  if (el.syncStatus) {
    el.syncStatus.textContent = message;
    el.syncStatus.dataset.state = kind;
  }
}

function hydrateThemeControls() {
  if (el.backendInput) {
    el.backendInput.value = getBackendBaseUrl();
  }
  if (el.themeToggle) {
    const label = state.theme === "dark" ? "Modo claro" : "Modo escuro";
    el.themeToggle.setAttribute("aria-label", label);
    el.themeToggle.textContent = state.theme === "dark" ? "◐" : "◑";
  }
  updateBackendStatus(
    getBackendBaseUrl() ? backendStatus : "local",
    getBackendBaseUrl() ? backendMessage || "Backend configurado" : "Modo local",
  );
}

function applyTheme(theme) {
  const resolved = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
  document.body.dataset.theme = resolved;
  state.theme = resolved;
}

function canEdit() {
  if (!getBackendBaseUrl()) return true;
  return currentUser?.role === "admin";
}

function updateAccessControls() {
  const backendConfigured = Boolean(getBackendBaseUrl());
  const isAdmin = canEdit();
  if (el.authStatus) {
    el.authStatus.textContent = currentUser ? (currentUser.role === "admin" ? "Admin" : "Visualização") : backendConfigured ? "Login necessário" : "Modo local";
    el.authStatus.dataset.state = currentUser?.role || (backendConfigured ? "required" : "local");
  }
  if (el.authNote) {
    el.authNote.textContent = currentUser
      ? `${currentUser.email} · ${currentUser.role === "admin" ? "pode editar e administrar" : "somente visualização"}`
      : backendConfigured
        ? "Entre para sincronizar. O primeiro usuário criado vira Admin."
        : "Configure a API para usar login online. No modo local, a edição continua liberada.";
  }
  if (el.authLogin) el.authLogin.hidden = Boolean(currentUser);
  if (el.authSignup) el.authSignup.hidden = Boolean(currentUser);
  if (el.authLogout) el.authLogout.hidden = !currentUser;
  if (el.uploadButton) el.uploadButton.disabled = backendConfigured && !isAdmin;
  if (el.backendSync) el.backendSync.disabled = backendConfigured && !isAdmin;
  if (el.deleteActiveButton) el.deleteActiveButton.disabled = el.deleteActiveButton.disabled || (backendConfigured && !isAdmin);
  if (el.usersCard) el.usersCard.hidden = currentUser?.role !== "admin";
  renderUsers();
}

async function hydrateSession() {
  if (!getBackendBaseUrl()) {
    currentUser = null;
    knownUsers = [];
    updateAccessControls();
    return;
  }
  try {
    const response = await apiFetch("/api/auth/session", {
      headers: { Accept: "application/json" },
    });
    const data = await response.json();
    currentUser = data.user || null;
    updateAccessControls();
    if (currentUser?.role === "admin") await loadUsers();
  } catch (error) {
    console.error(error);
    updateAccessControls();
  }
}

async function loginUser() {
  await authenticateUser("/api/auth/login", "Login realizado.");
}

async function signupUser() {
  await authenticateUser("/api/auth/signup", "Acesso criado.");
}

async function authenticateUser(path, successMessage) {
  if (!getBackendBaseUrl()) {
    showToast("Configure a API Base URL antes de usar login.", "warn", 5200);
    return;
  }
  const email = String(el.authEmail?.value || "").trim();
  const password = String(el.authPassword?.value || "");
  if (!email || password.length < 6) {
    showToast("Informe email e senha com pelo menos 6 caracteres.", "warn", 5200);
    return;
  }
  try {
    const response = await apiFetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ email, password }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Falha de autenticação");
    authToken = data.token || "";
    currentUser = data.user || null;
    persistAuthToken();
    if (el.authPassword) el.authPassword.value = "";
    updateAccessControls();
    if (currentUser?.role === "admin") await loadUsers();
    await hydrateRemoteLibrary(true);
    showToast(successMessage, "good", 4200);
  } catch (error) {
    console.error(error);
    showToast(error.message || "Não foi possível autenticar.", "error", 5200);
  }
}

async function logoutUser() {
  try {
    if (getBackendBaseUrl() && authToken) {
      await apiFetch("/api/auth/logout", { method: "POST" });
    }
  } catch {
    // The local session is cleared even if the server is offline.
  }
  authToken = "";
  currentUser = null;
  knownUsers = [];
  persistAuthToken();
  updateAccessControls();
  showToast("Sessão encerrada.", "info", 4200);
}

async function loadUsers() {
  if (!getBackendBaseUrl() || currentUser?.role !== "admin") return;
  try {
    const response = await apiFetch("/api/users", { headers: { Accept: "application/json" } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Falha ao carregar usuários");
    knownUsers = Array.isArray(data.users) ? data.users : [];
    renderUsers();
  } catch (error) {
    console.error(error);
    showToast("Não foi possível carregar usuários.", "warn", 5200);
  }
}

async function updateUserRole(userId, role) {
  if (!userId || currentUser?.role !== "admin") return;
  try {
    const response = await apiFetch(`/api/users/${encodeURIComponent(userId)}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ role }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Falha ao atualizar usuário");
    knownUsers = Array.isArray(data.users) ? data.users : [];
    renderUsers();
    showToast("Permissão atualizada.", "good", 4200);
  } catch (error) {
    console.error(error);
    showToast(error.message || "Não foi possível atualizar permissão.", "error", 5200);
  }
}

function renderUsers() {
  if (!el.usersList || !el.usersCount) return;
  el.usersCount.textContent = integer.format(knownUsers.length);
  if (currentUser?.role !== "admin") {
    el.usersList.innerHTML = "";
    return;
  }
  el.usersList.innerHTML = knownUsers.length
    ? knownUsers
        .map(
          (user) => `
            <div class="user-row">
              <div>
                <strong>${escapeHtml(user.email)}</strong>
                <span>${user.role === "admin" ? "Admin" : "Visualização"}</span>
              </div>
              <button class="secondary-button" type="button" data-user-id="${escapeAttribute(user.id)}" data-role="${user.role === "admin" ? "viewer" : "admin"}">
                ${user.role === "admin" ? "Tornar viewer" : "Tornar admin"}
              </button>
            </div>
          `,
        )
        .join("")
    : emptyState("Sem usuários", "Crie acessos para visualizar ou administrar.");
}

async function hydrateRemoteLibrary(force = false) {
  const baseUrl = getBackendBaseUrl();
  if (!baseUrl) {
    updateBackendStatus("local", "Modo local");
    return false;
  }

  if (backendSyncPromise && !force) {
    return backendSyncPromise;
  }

  backendSyncPromise = (async () => {
    updateBackendStatus("connecting", "Sincronizando backend...");
    try {
      const response = await apiFetch("/api/library", {
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        const error = new Error(`GET /api/library failed (${response.status})`);
        error.status = response.status;
        throw error;
      }

      const remote = await response.json();
      const remoteLibrary = mergeSeedIntoLibrary(remote);
      const remoteHasUploads = remoteLibrary.datasets.some((dataset) => dataset.source !== "seed");
      if (remoteHasUploads || remoteLibrary.seedDeleted) {
        library = remoteLibrary;
        state.activeDatasetId = remoteLibrary.activeDatasetId;
        syncActiveDataset();
        persistLibrary();
        hydrateControls();
        renderAll();
        updateBackendStatus("online", "Backend online");
      } else {
        persistLibrary();
        updateBackendStatus("online", "Backend online");
        if (library.datasets.some((dataset) => dataset.source !== "seed")) {
          await syncLibraryToBackend(false);
        }
      }
      return true;
    } catch (error) {
      console.error(error);
      updateBackendStatus(error.status === 401 ? "offline" : "offline", error.status === 401 ? "Login necessário" : "Backend offline");
      if (force) {
        showToast("Não foi possível sincronizar com o backend. Mantendo o modo local.", "warn", 6000);
      }
      return false;
    } finally {
      backendSyncPromise = null;
    }
  })();

  return backendSyncPromise;
}

async function syncLibraryToBackend(showToastOnFailure = true) {
  const baseUrl = getBackendBaseUrl();
  if (!baseUrl) return false;

  try {
    const response = await apiFetch("/api/library", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        activeDatasetId: library.activeDatasetId || state.activeDatasetId || "seed",
        seedDeleted: Boolean(library.seedDeleted),
        datasets: library.datasets.filter((dataset) => dataset.id !== EMPTY_DATASET_ID),
      }),
    });

    if (!response.ok) {
      const error = new Error(`PUT /api/library failed (${response.status})`);
      error.status = response.status;
      throw error;
    }

    updateBackendStatus("online", "Backend online");
    persistLibrary();
    return true;
  } catch (error) {
    console.error(error);
    updateBackendStatus(error.status === 403 ? "offline" : "offline", error.status === 403 ? "Sem permissão de edição" : "Backend offline");
    if (showToastOnFailure) {
      showToast("Não foi possível salvar no backend. O cache local foi mantido.", "warn", 6000);
    }
    return false;
  }
}

async function deleteActiveDataset() {
  const active = getActiveDataset();
  if (!active || active.id === EMPTY_DATASET_ID) {
    showToast("Não há arquivo ativo para excluir.", "info", 5000);
    return;
  }
  if (!canEdit()) {
    showToast("Seu usuário é somente visualização.", "warn", 5200);
    return;
  }

  const message =
    active.id === "seed"
      ? `Zerar a base fixa "${active.label}"? O dashboard ficará vazio até importar outro Excel.`
      : `Excluir o arquivo "${active.label}"? Essa ação remove a biblioteca local e o backend.`;
  const confirmed = window.confirm(message);
  if (!confirmed) return;

  const index = library.datasets.findIndex((dataset) => dataset.id === active.id);
  if (active.id === "seed") {
    library.seedDeleted = true;
  }
  if (index < 0) return;

  library.datasets.splice(index, 1);
  const nextActive = library.datasets[index] || library.datasets[index - 1] || buildEmptyDataset();
  library.activeDatasetId = nextActive.id;
  state.activeDatasetId = nextActive.id;
  state.fileName = nextActive.fileName;
  syncActiveDataset();
  hydrateControls();
  persistState();
  persistLibrary();
  renderAll();
  await syncLibraryToBackend();
  showToast(active.id === "seed" ? "Base fixa zerada." : `Arquivo "${active.label}" excluído.`, "good", 5000);
}

function parseDateValue(value) {
  if (value == null || value === "") return { iso: "", ts: null };

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return {
      iso: value.toISOString().slice(0, 10),
      ts: Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
    };
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const serial = Math.floor(value);
    const utcDays = serial - 25569;
    const ts = utcDays * 86400 * 1000;
    const iso = new Date(ts).toISOString().slice(0, 10);
    return { iso, ts };
  }

  const raw = String(value).trim();
  const match = raw.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/);
  if (match) {
    const [, d, m, y] = match;
    const ts = Date.UTC(Number(y), Number(m) - 1, Number(d));
    return {
      iso: `${y}-${m}-${d}`,
      ts,
    };
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return { iso: parsed.toISOString().slice(0, 10), ts: parsed.getTime() };
  }

  return { iso: raw, ts: null };
}

function parseMoney(value) {
  if (value == null || value === "") return 0;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = String(value).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function splitBase(base) {
  const parts = String(base || "")
    .split(" - ")
    .map((part) => part.trim())
    .filter(Boolean);
  return {
    cidade_base: parts[0] || "",
    sigla_base: parts[1] || "",
  };
}

function readCell(row, index) {
  if (index == null || index < 0) return "";
  const value = row[index];
  if (value == null) return "";
  return typeof value === "string" ? value.trim() : value;
}

function formatId(value) {
  if (value == null || value === "") return "";
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  return String(value).trim();
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function formatDate(value) {
  if (!value) return "—";
  if (typeof value === "string") {
    const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) {
      const [, year, month, day] = iso;
      return `${day}/${month}/${year}`;
    }
    const br = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (br) return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(value));
  }

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(parsed);
}

function emptyState(title, description) {
  return `
    <div class="empty-state">
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(description)}</span>
    </div>
  `;
}

function showToast(message, tone = "info", timeout = 3800) {
  if (!el.toast) return;
  el.toast.textContent = message;
  el.toast.style.borderColor =
    tone === "good" ? "rgba(88, 214, 141, 0.28)" : tone === "warn" ? "rgba(255, 159, 67, 0.28)" : tone === "error" ? "rgba(255, 107, 107, 0.28)" : "rgba(59, 166, 255, 0.22)";
  el.toast.classList.add("is-visible");
  window.clearTimeout(showToast._timer);
  showToast._timer = window.setTimeout(() => {
    el.toast.classList.remove("is-visible");
  }, timeout);
}

function loadState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...STATE_DEFAULT };
    return { ...STATE_DEFAULT, ...JSON.parse(raw) };
  } catch {
    return { ...STATE_DEFAULT };
  }
}

function persistState() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // no-op
  }
}

function loadAuthToken() {
  try {
    return String(window.localStorage.getItem(AUTH_STORAGE_KEY) || "");
  } catch {
    return "";
  }
}

function persistAuthToken() {
  try {
    if (authToken) {
      window.localStorage.setItem(AUTH_STORAGE_KEY, authToken);
    } else {
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  } catch {
    // no-op
  }
}

function loadLibrary() {
  try {
    const raw = window.localStorage.getItem(LIBRARY_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const datasets = Array.isArray(parsed.datasets) ? parsed.datasets : [];
      const normalized = datasets
        .map(normalizeDatasetRecord)
        .filter(Boolean);
      const hasUploadedDatasets = normalized.some((dataset) => dataset.source === "upload");
      if ((normalized.length && hasUploadedDatasets) || parsed.seedDeleted) {
        return {
          activeDatasetId: parsed.activeDatasetId || normalized[0]?.id || EMPTY_DATASET_ID,
          seedDeleted: Boolean(parsed.seedDeleted),
          datasets: normalized,
        };
      }
    }
  } catch {
    // fall through to seed
  }

  return {
    activeDatasetId: "seed",
    seedDeleted: false,
    datasets: [buildSeedDataset()],
  };
}

function persistLibrary() {
  try {
    window.localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(library));
  } catch {
    // no-op
  }
}

function normalizeDatasetRecord(dataset) {
  if (!dataset || !Array.isArray(dataset.rows)) return null;
  if (dataset.id === EMPTY_DATASET_ID || dataset.source === "empty") return buildEmptyDataset();
  return {
    id: String(dataset.id || makeDatasetId(dataset.fileName || "arquivo")),
    fileName: String(dataset.fileName || "arquivo.xlsx"),
    label: String(dataset.label || humanizeWorkbookName(dataset.fileName || "arquivo.xlsx")),
    source: String(dataset.source || "upload"),
    importedAt: dataset.importedAt || new Date().toISOString(),
    rows: dataset.rows,
  };
}

function upsertDataset(dataset) {
  const normalized = normalizeDatasetRecord(dataset);
  if (!normalized) return;
  const index = library.datasets.findIndex((entry) => entry.id === normalized.id);
  if (index >= 0) {
    library.datasets[index] = normalized;
    return;
  }
  library.datasets.push(normalized);
}

function setActiveDataset(id) {
  state.activeDatasetId = id;
  syncActiveDataset();
}

function getActiveDataset() {
  if (!library || !Array.isArray(library.datasets) || !library.datasets.length) {
    return buildEmptyDataset();
  }

  const found = library.datasets.find((dataset) => dataset.id === state.activeDatasetId);
  return found || library.datasets[0] || buildEmptyDataset();
}

function getDatasetById(id) {
  if (!id || !library || !Array.isArray(library.datasets)) return null;
  return library.datasets.find((dataset) => dataset.id === id) || null;
}

function syncActiveDataset() {
  activeDataset = getActiveDataset();
  allRows = activeDataset.rows.slice();
  fileMeta = activeDataset;
  library.activeDatasetId = activeDataset.id;
  if (state.activeDatasetId !== activeDataset.id) {
    state.activeDatasetId = activeDataset.id;
  }
}

function makeDatasetId(fileName) {
  const base = String(fileName || "arquivo")
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `${base || "arquivo"}-${Date.now()}`;
}

function humanizeWorkbookName(fileName) {
  const raw = String(fileName || "arquivo")
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const period = detectQuinzena(raw);
  const month = detectMonth(raw);
  const year = detectYear(raw);
  if (month && period) {
    return `${capitalize(month)} - ${period}${year ? ` / ${year}` : ""}`;
  }
  return capitalize(raw.replace(/\b1\s*q\b/gi, "1ª quinzena").replace(/\b1q\b/gi, "1ª quinzena"));
}

function getDatasetPeriodLabel(dataset) {
  if (!dataset) return "Quinzena";
  const label = String(dataset.label || humanizeWorkbookName(dataset.fileName || ""));
  const period = detectQuinzena(label) || detectQuinzena(dataset.fileName || "");
  const month = detectMonth(label) || detectMonthFromRows(dataset.rows);
  const year = detectYear(label) || detectYearFromRows(dataset.rows);
  if (month && period) return `${compactQuinzena(period)} ${capitalize(month)}${year ? ` ${year}` : ""}`;
  return label;
}

function compactQuinzena(period) {
  return String(period || "")
    .replace("1ª quinzena", "1ªQ")
    .replace("2ª quinzena", "2ªQ");
}

function detectQuinzena(text) {
  const normalized = normalize(text);
  if (/(^|\s)(1\s*q|1q|1a quinzena|1ª quinzena)(\s|$)/i.test(text)) return "1ª quinzena";
  if (/(^|\s)(2\s*q|2q|2a quinzena|2ª quinzena)(\s|$)/i.test(text)) return "2ª quinzena";
  return "";
}

function detectMonth(text) {
  const normalized = normalize(text);
  const months = [
    ["janeiro", "janeiro"],
    ["fevereiro", "fevereiro"],
    ["marco", "março"],
    ["abril", "abril"],
    ["maio", "maio"],
    ["junho", "junho"],
    ["julho", "julho"],
    ["agosto", "agosto"],
    ["setembro", "setembro"],
    ["outubro", "outubro"],
    ["novembro", "novembro"],
    ["dezembro", "dezembro"],
  ];
  for (const [needle, display] of months) {
    if (normalized.includes(needle)) return display;
  }
  return "";
}

function monthNumber(month) {
  const normalized = normalize(month);
  const index = MONTHS.findIndex((item) => normalize(item) === normalized);
  return index >= 0 ? index + 1 : 0;
}

function detectYear(text) {
  const match = String(text || "").match(/(?:19|20)\d{2}|\b\d{2}\b/);
  if (!match) return "";
  const value = match[0];
  return value.length === 2 ? `20${value}` : value;
}

function capitalize(text) {
  const value = String(text || "").trim();
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}






















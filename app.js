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
const DONUT_SHEETS = ["PNR", "SVC PERDIDOS", "XPT PERDIDOS"];
const DONUT_LABELS = {
  PNR: "PNR",
  "SVC PERDIDOS": "SVC Perd.",
  "XPT PERDIDOS": "XPT Perd.",
};
const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

const STATE_DEFAULT = {
  query: "",
  sheet: "Todos",
  tipo: "Todos",
  base: "Todos",
  motorista: "Todos",
  period: "month",
  sortKey: "valor_numerico",
  sortDir: "desc",
  page: 1,
  pageSize: 15,
  fileName: "PRE FATURA 2 Q MARÇO 26.xlsx",
  activeDatasetId: "seed",
  monthFilter: "",
  deleteDatasetId: "",
  appView: "dashboard",
  theme: "dark",
  apiBaseUrl: "",
  pnrGoalLimit: DEFAULT_PNR_GOAL_LIMIT,
  metaMensal: DEFAULT_PNR_GOAL_LIMIT,
  metaAnual: 0,
  metaAnualEditada: false,
  accountPanelOpen: false,
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
const liveClockFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

const seedRows = Array.isArray(window.__PRE_FATURA_ROWS) ? window.__PRE_FATURA_ROWS.slice() : [];
const state = loadState();
const forcedTheme = new URLSearchParams(window.location.search).get("theme");
state.theme = forcedTheme === "light" || forcedTheme === "dark" ? forcedTheme : state.theme === "light" ? "light" : "dark";
state.apiBaseUrl = String(state.apiBaseUrl || window.__PRE_FATURA_BACKEND?.baseUrl || "").trim();
state.period = normalizePeriodMode(state.period);
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
let liveClockTimer = null;

const el = {};

async function bootstrapDashboard() {
  cacheDom();
  startLiveClock();
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
  el.content = document.querySelector(".content");
  el.sidebar = document.getElementById("sidebar");
  el.sidebarToggle = document.getElementById("sidebar-toggle");
  el.uploadButton = document.getElementById("upload-button");
  el.refreshButton = document.getElementById("refresh-button");
  el.deleteActiveButton = document.getElementById("delete-active-button");
  el.themeToggle = document.getElementById("theme-toggle");
  el.accountToggle = document.getElementById("account-toggle");
  el.fileInput = document.getElementById("file-input");
  el.reportButton = document.getElementById("report-button");
  el.fileSelectButton = document.getElementById("file-select-button");
  el.fileDeleteMenu = document.getElementById("file-delete-menu");
  el.accountMenu = document.getElementById("account-menu");
  el.datasetSelect = document.getElementById("dataset-select");
  el.datasetCount = document.getElementById("dataset-count");
  el.datasetNote = document.getElementById("dataset-note");
  el.backendStatus = document.getElementById("backend-status");
  el.settingsCard = document.getElementById("settings-card");
  el.accountCard = document.getElementById("account-card");
  el.settingsPageSize = document.getElementById("settings-page-size");
  el.settingsPnrGoal = document.getElementById("settings-pnr-goal");
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
  el.profileView = document.getElementById("profile-view");
  el.settingsView = document.getElementById("settings-view");
  el.settingsUsersList = document.getElementById("settings-users-list");
  el.profileAvatar = document.getElementById("profile-avatar");
  el.profileName = document.getElementById("profile-name");
  el.profileRoleTitle = document.getElementById("profile-role-title");
  el.profileEmail = document.getElementById("profile-email");
  el.profilePassword = document.getElementById("profile-password");
  el.profileSave = document.getElementById("profile-save");
  el.kpiGrid = document.getElementById("kpi-grid");
  el.baseBars = document.getElementById("base-bars");
  el.driverRank = document.getElementById("driver-rank");
  el.donutChart = document.getElementById("donut-chart");
  el.donutLegend = document.getElementById("donut-legend");
  el.donutTotal = document.getElementById("donut-total");
  el.pnrGoalSummary = document.getElementById("pnr-goal-summary");
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
  el.monthSelect = document.getElementById("month-select");
  el.periodSelect = document.getElementById("period-select");
  el.sheetSelect = document.getElementById("sheet-select");
  el.typeSelect = document.getElementById("type-select");
  el.baseSelect = document.getElementById("base-select");
  el.driverSelect = document.getElementById("driver-select");
  el.pageSize = document.getElementById("page-size");
  el.sortHigh = document.getElementById("sort-high");
  el.sortLow = document.getElementById("sort-low");
}

function startLiveClock() {
  updateLiveClock();
  window.clearInterval(liveClockTimer);
  liveClockTimer = window.setInterval(updateLiveClock, 30000);
}

function updateLiveClock() {
  if (!el.lastUpdate) return;
  el.lastUpdate.textContent = `Última atualização: ${liveClockFormatter.format(new Date())}`;
}

function bindEvents() {
  el.sidebarToggle.addEventListener("click", () => {
    setSidebarCollapsed(!el.sidebar.classList.contains("is-collapsed"));
  });

  if (el.uploadButton) {
    el.uploadButton.addEventListener("click", () => {
      if (!canEdit()) {
        showToast("Upload disponível apenas para Admin.", "warn", 5200);
        return;
      }
      el.fileInput.click();
    });
  }
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
  if (el.accountToggle) {
    el.accountToggle.addEventListener("click", () => {
      state.accountPanelOpen = !state.accountPanelOpen;
      persistState();
      updateAccessControls();
    });
  }
  if (el.accountMenu) {
    el.accountMenu.addEventListener("click", (event) => {
      const button = event.target.closest("[data-account-page]");
      if (!button) return;
      openAccountPage(button.dataset.accountPage);
    });
  }
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-account-home]");
    if (!button) return;
    state.appView = "dashboard";
    state.accountPanelOpen = false;
    persistState();
    renderAll();
    updateAccessControls();
  });
  if (el.profileSave) {
    el.profileSave.addEventListener("click", () => {
      if (el.profilePassword) el.profilePassword.value = "";
      showToast("Perfil salvo localmente.", "good", 4200);
    });
  }
  if (el.settingsUsersList) {
    el.settingsUsersList.addEventListener("click", async (event) => {
      const button = event.target.closest("button[data-user-id][data-role]");
      if (!button) return;
      if (!getBackendBaseUrl()) {
        showToast("Permissões de usuários dependem da API configurada.", "info", 5200);
        return;
      }
      await updateUserRole(button.dataset.userId, button.dataset.role);
    });
  }
  if (el.reportButton) {
    el.reportButton.addEventListener("click", () => {
      downloadMonthlyReport();
    });
  }
  document.addEventListener("keydown", handleEscapeFilter);
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
  if (el.settingsPageSize) {
    el.settingsPageSize.addEventListener("change", (event) => {
      state.pageSize = Number(event.target.value) || 15;
      state.page = 1;
      if (el.pageSize) el.pageSize.value = String(state.pageSize);
      persistState();
      renderAll();
    });
  }
  if (el.settingsPnrGoal) {
    el.settingsPnrGoal.addEventListener("change", (event) => {
      const value = parseCurrencyInput(event.target.value);
      setPnrGoalByMode("monthly", value > 0 ? value : DEFAULT_PNR_GOAL_LIMIT);
      persistState();
      renderAll();
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
  if (el.fileSelectButton) {
    el.fileSelectButton.addEventListener("click", () => {
      if (!canEdit()) {
        showToast("Seleção de arquivo disponível apenas para Admin.", "warn", 5200);
        return;
      }
      renderFileDeleteMenu();
      if (el.fileDeleteMenu) el.fileDeleteMenu.hidden = !el.fileDeleteMenu.hidden;
    });
  }
  if (el.fileDeleteMenu) {
    el.fileDeleteMenu.addEventListener("click", (event) => {
      const button = event.target.closest("[data-delete-dataset-id]");
      if (!button) return;
      state.deleteDatasetId = button.dataset.deleteDatasetId;
      persistState();
      renderFileDeleteMenu();
      updateDatasetMeta();
      el.fileDeleteMenu.hidden = true;
      showToast("Arquivo selecionado para exclusão.", "info", 3500);
    });
    document.addEventListener("click", (event) => {
      if (el.fileDeleteMenu.hidden || event.target.closest("#file-delete-picker")) return;
      el.fileDeleteMenu.hidden = true;
    });
  }
  el.fileInput.addEventListener("change", handleUpload);
  if (el.datasetSelect) el.datasetSelect.addEventListener("change", (event) => {
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
      period: "month",
      monthFilter: "",
      appView: "dashboard",
      sortKey: "valor_numerico",
      sortDir: "desc",
      page: 1,
      pageSize: Number(el.pageSize.value || 15),
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
      state.period = normalizePeriodMode(event.target.value);
      state.page = 1;
      hydrateControls();
      persistState();
      renderAll();
    });
  }
  if (el.monthSelect) {
    el.monthSelect.addEventListener("change", (event) => {
      state.monthFilter = event.target.value;
      state.page = 1;
      syncActiveDataset();
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
    state.pageSize = Number(event.target.value) || 15;
    state.page = 1;
    if (el.settingsPageSize) el.settingsPageSize.value = String(state.pageSize);
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
    state.appView = "dashboard";
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
    const segment = event.target.closest(".mix-chart__segment");
    if (!segment) return;
    showDonutTooltip(segment, event);
  });

  el.donutChart.addEventListener("pointermove", (event) => {
    const segment = event.target.closest(".mix-chart__segment");
    if (!segment) return;
    positionDonutTooltip(event);
  });

  el.donutChart.addEventListener("pointerout", (event) => {
    if (!event.target.closest(".mix-chart__segment")) return;
    hideDonutTooltip();
  });

  if (el.pnrGoalSummary) {
    const pnrGoalPanel = el.pnrGoalSummary.closest(".goal-card");
    const goalTarget = pnrGoalPanel || el.pnrGoalSummary;
    goalTarget.addEventListener("click", handlePnrGoalConfig);
    goalTarget.addEventListener("submit", handlePnrGoalConfig);
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

function handlePnrGoalConfig(event) {
  const form = event.target.closest("[data-goal-config-form]");
  const cancelButton = event.target.closest("[data-goal-config-cancel]");
  const saveButton = event.target.closest("[data-goal-config-save]");
  if (!form && !cancelButton && !saveButton) return;
  if (event.type === "submit" || cancelButton || saveButton) event.preventDefault();

  const panel = (form || cancelButton || saveButton).closest(".goal-config");
  if (cancelButton) {
    if (panel) panel.removeAttribute("open");
    return;
  }

  if (event.type !== "submit" && !saveButton) return;
  const input = panel ? panel.querySelector("[data-pnr-goal-input]") : null;
  if (!input) return;
  const mode = input.dataset.goalMode === "annual" ? "annual" : "monthly";
  const value = parseCurrencyInput(input.value);
  setPnrGoalByMode(mode, value > 0 ? value : DEFAULT_PNR_GOAL_LIMIT);
  if (panel) panel.removeAttribute("open");
  hydrateControls();
  persistState();
  renderAll();
  showToast(mode === "annual" ? "Meta anual atualizada." : "Meta mensal atualizada.", "good");
}

function handleEscapeFilter(event) {
  if (event.key !== "Escape") return;
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const resetById = {
    "search-input": () => {
      if (!state.query) return false;
      state.query = "";
      return true;
    },
    "period-select": () => {
      if (state.period === "month") return false;
      state.period = "month";
      return true;
    },
    "month-select": () => {
      const activeMonth = getDatasetPeriod(getActiveDataset()).key;
      if (!state.monthFilter || state.monthFilter === activeMonth) return false;
      state.monthFilter = activeMonth;
      return true;
    },
    "sheet-select": () => {
      if (state.sheet === "Todos") return false;
      state.sheet = "Todos";
      return true;
    },
    "type-select": () => {
      if (state.tipo === "Todos") return false;
      state.tipo = "Todos";
      return true;
    },
    "base-select": () => {
      if (state.base === "Todos") return false;
      state.base = "Todos";
      return true;
    },
    "driver-select": () => {
      if (state.motorista === "Todos") return false;
      state.motorista = "Todos";
      return true;
    },
  };
  const reset = resetById[target.id];
  if (!reset || !reset()) return;
  event.preventDefault();
  state.page = 1;
  hydrateControls();
  persistState();
  renderAll();
  target.blur();
  showToast("Filtro removido.", "info");
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
    clearTimeout(sidebarAnimationTimer);
  }
  el.sidebarToggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
}

function hydrateControls() {
  syncActiveDataset();
  const options = buildOptions(allRows);
  renderDatasetSelect();
  renderPeriodSelect();
  renderMonthSelect();
  renderFileDeleteMenu();
  populateSelect(el.sheetSelect, SHEET_ORDER, state.sheet);
  populateSelect(el.typeSelect, options.tipos, state.tipo);
  populateSelect(el.baseSelect, options.bases, state.base);
  populateSelect(el.driverSelect, options.motoristas, state.motorista);

  el.searchInput.value = state.query;
  el.pageSize.value = String(state.pageSize || 15);
  if (el.settingsPageSize) el.settingsPageSize.value = String(state.pageSize || 15);
  if (el.settingsPnrGoal) el.settingsPnrGoal.value = String(getMonthlyPnrGoalLimit());
  hydrateValueSortControls();

  updateDatasetMeta();
  hydrateThemeControls();

  renderTabs();
}

function renderPeriodSelect() {
  if (!el.periodSelect) return;
  state.period = normalizePeriodMode(state.period);
  const options = [
    ["month", "Mês completo"],
    ["q1", "1ª quinzena"],
    ["q2", "2ª quinzena"],
  ];
  el.periodSelect.innerHTML = options
    .map(([value, label]) => `<option value="${value}" ${state.period === value ? "selected" : ""}>${escapeHtml(label)}</option>`)
    .join("");
}

function renderMonthSelect() {
  if (!el.monthSelect) return;
  const months = getAvailableMonthOptions();
  const activePeriod = getDatasetPeriod(getActiveDataset());
  if (!state.monthFilter) state.monthFilter = activePeriod.key;
  if (state.monthFilter !== "all" && !months.some((month) => month.key === state.monthFilter)) {
    state.monthFilter = activePeriod.key;
  }
  el.monthSelect.innerHTML = [
    `<option value="all" ${state.monthFilter === "all" ? "selected" : ""}>Todos</option>`,
    ...months.map(
      (month) =>
        `<option value="${escapeAttribute(month.key)}" ${state.monthFilter === month.key ? "selected" : ""}>${escapeHtml(shortMonthYear(month.label))}</option>`,
    ),
  ].join("");
}

function getAvailableMonthOptions() {
  const months = new Map();
  library.datasets
    .filter((dataset) => dataset && dataset.id !== EMPTY_DATASET_ID && Array.isArray(dataset.rows) && dataset.rows.length)
    .forEach((dataset) => {
      const period = getDatasetPeriod(dataset);
      if (!months.has(period.key)) {
        months.set(period.key, { key: period.key, label: period.monthLabel, sort: period.sort });
      }
    });
  return Array.from(months.values()).sort((a, b) => a.sort - b.sort);
}

function hydrateValueSortControls() {
  const isLow = state.sortKey === "valor_numerico" && state.sortDir === "asc";
  if (el.sortHigh) el.sortHigh.classList.toggle("is-active", !isLow);
  if (el.sortLow) el.sortLow.classList.toggle("is-active", isLow);
}

function renderDatasetSelect() {
  if (!el.datasetSelect) return;
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
  if (el.datasetCount) el.datasetCount.textContent = `${integer.format(totalFiles)} arquivo${totalFiles === 1 ? "" : "s"}`;
  if (el.datasetNote) el.datasetNote.textContent = active
    ? `${integer.format(allRows.length)} registros no recorte atual. O mês completo é consolidado automaticamente.`
    : "Carregue meses anteriores e troque sem reimportar o workbook.";
  if (el.deleteActiveButton) {
    const selected = getSelectedDeleteDataset();
    const deletable = Boolean(selected && selected.id !== EMPTY_DATASET_ID && canEdit());
    el.deleteActiveButton.hidden = false;
    el.deleteActiveButton.disabled = !deletable;
    const label = selected ? `Excluir ${selected.label}` : "Selecione um arquivo antes de excluir";
    el.deleteActiveButton.setAttribute("aria-label", label);
    el.deleteActiveButton.setAttribute("title", label);
  }
  if (el.fileSelectButton) {
    const selected = getSelectedDeleteDataset();
    el.fileSelectButton.disabled = !canEdit();
    el.fileSelectButton.classList.toggle("is-active", Boolean(selected));
    el.fileSelectButton.setAttribute("title", selected ? `Selecionado: ${selected.label}` : "Selecionar arquivo para exclusão");
  }
}

function getDeletableDatasets() {
  return library.datasets.filter((dataset) => dataset && dataset.id !== EMPTY_DATASET_ID && Array.isArray(dataset.rows) && dataset.rows.length);
}

function getSelectedDeleteDataset() {
  return getDeletableDatasets().find((dataset) => dataset.id === state.deleteDatasetId) || null;
}

function renderFileDeleteMenu() {
  if (!el.fileDeleteMenu) return;
  const datasets = getDeletableDatasets();
  if (!datasets.length) {
    el.fileDeleteMenu.innerHTML = `<p class="file-delete-menu__empty">Nenhum arquivo disponível.</p>`;
    return;
  }
  el.fileDeleteMenu.innerHTML = datasets
    .map((dataset) => {
      const selected = dataset.id === state.deleteDatasetId ? "is-selected" : "";
      return `
        <button type="button" class="${selected}" data-delete-dataset-id="${escapeAttribute(dataset.id)}">
          <span>${escapeHtml(dataset.label)}</span>
          <small>${integer.format(dataset.rows.length)} registros</small>
        </button>
      `;
    })
    .join("");
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

  if (state.appView === "settings" && !canEdit()) {
    state.appView = "dashboard";
  }
  const accountView = state.appView === "profile" || state.appView === "settings";
  toggleAccountView(accountView);
  if (accountView) {
    renderAccountPage();
    renderFilterSummary();
    updateTopbar(summary);
    updateAccessControls();
    return;
  }

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

function toggleAccountView(accountView) {
  if (el.content) el.content.classList.toggle("is-account-page", accountView);
  if (el.profileView) el.profileView.hidden = state.appView !== "profile";
  if (el.settingsView) el.settingsView.hidden = state.appView !== "settings";
}

function openAccountPage(page) {
  if (page === "settings" && !canEdit()) {
    showToast("Configurações gerais disponíveis apenas para Admin.", "warn", 5200);
    return;
  }
  state.appView = page === "settings" ? "settings" : "profile";
  state.accountPanelOpen = false;
  persistState();
  renderAll();
}

function renderAccountPage() {
  renderProfilePage();
  renderSettingsPage();
}

function renderProfilePage() {
  if (!el.profileView) return;
  const user = currentUser || { email: "admin@empresa.com", role: "admin" };
  const email = user.email || "admin@empresa.com";
  const initials =
    email
      .split("@")[0]
      .split(/[.\s_-]+/)
      .map((part) => part.charAt(0))
      .join("")
      .slice(0, 2)
      .toUpperCase() || "AL";
  if (el.profileAvatar) el.profileAvatar.textContent = initials;
  if (el.profileName) el.profileName.value = user.name || email.split("@")[0] || "Usuário";
  if (el.profileRoleTitle) el.profileRoleTitle.value = user.role === "admin" ? "Administrador" : "Visualização";
  if (el.profileEmail) el.profileEmail.value = email;
}

function renderSettingsPage() {
  if (!el.settingsUsersList) return;
  if (!canEdit()) {
    el.settingsUsersList.innerHTML = emptyState("Acesso restrito", "Somente administradores podem editar usuários.");
    return;
  }
  const users = knownUsers.length
    ? knownUsers
    : [{ id: "local-admin", email: currentUser?.email || "admin@empresa.com", role: "admin" }];
  el.settingsUsersList.innerHTML = users
    .map((user) => {
      const isAdmin = user.role === "admin";
      const name = user.name || (user.email ? user.email.split("@")[0] : "Usuário");
      return `
        <div class="settings-user">
          <div class="settings-user__identity">
            <strong>${escapeHtml(name)}</strong>
            <span>${escapeHtml(user.email || "Sem e-mail")}</span>
          </div>
          <span class="settings-user__badge ${isAdmin ? "is-admin" : "is-viewer"}">${isAdmin ? "Admin" : "Visualização"}</span>
          <button class="secondary-button secondary-button--mini settings-user__action" type="button" data-user-id="${escapeAttribute(user.id)}" data-role="${isAdmin ? "viewer" : "admin"}">
            ${isAdmin ? "Remover admin" : "Tornar admin"}
          </button>
        </div>
      `;
    })
    .join("");
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
      tone: "kpi-card--finance",
      delta: monthlyStatus,
    },
    {
      label: "Registros válidos",
      value: integer.format(summary.count),
      tone: "kpi-card--volume",
      delta: `${integer.format(summary.baseCount)} bases e ${integer.format(summary.routeCount)} rotas`,
    },
    {
      label: "Pacotes perdidos",
      value: integer.format(summary.packageCount),
      tone: "kpi-card--problem",
      delta: `${summary.packageShare}% do total filtrado`,
    },
    {
      label: "PNR",
      value: integer.format(summary.pnrCount),
      tone: "kpi-card--problem",
      delta: `${summary.pnrShare}% do total filtrado`,
    },
    {
      label: "Drivers",
      value: integer.format(summary.driverCount),
      tone: "kpi-card--volume",
      delta: `${summary.topDriver ? summary.topDriver.label : "Sem driver"} com maior desconto`,
    },
    {
      label: "Bases",
      value: integer.format(summary.baseCount),
      tone: "kpi-card--neutral",
      delta: `${summary.topBase ? summary.topBase.label : "Sem base"} com maior desconto`,
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
  const mixRows = buildMixRows(filtered);
  const baseScale = Math.max(...worstBases.concat(bestBases).map((item) => item.total), 1);

  el.baseBars.innerHTML = worstBases.length || bestBases.length
    ? `${renderBaseRankingGroup("5 bases menos ofensivas", bestBases, baseScale, 0)}
       ${renderBaseRankingGroup("5 bases mais ofensivas", worstBases, baseScale, bestBases.length)}`
    : emptyState("Nenhum dado após os filtros", "Ajuste os filtros ou importe outra planilha.");

  el.driverRank.innerHTML = worstDrivers.length || bestDrivers.length
    ? `${renderDriverRankingGroup("5 drivers menos ofensivos", bestDrivers, 0)}
       ${renderDriverRankingGroup("5 drivers mais ofensivos", worstDrivers, bestDrivers.length)}`
    : emptyState("Sem drivers no recorte", "Importe o Excel ou libere os filtros.");

  renderDonutChart(mixRows);
  renderMixLegend(mixRows);

  renderPnrGoalSummary(filtered);
}

function renderDonutChart(mixRows) {
  const circumference = 2 * Math.PI * 42;
  const totalMix = mixRows.reduce((acc, item) => acc + Number(item.total || 0), 0);
  let offset = 0;
  const labels = [];
  const segments = mixRows
    .map((item, index) => {
      const start = offset;
      const length = (item.share / 100) * circumference;
      const dashOffset = -offset;
      offset += length;
      if (item.share >= 8 && length > 22) {
        const midpoint = start + length / 2;
        const angle = (midpoint / circumference) * Math.PI * 2 - Math.PI / 2;
        const x = 50 + Math.cos(angle) * 41;
        const y = 50 + Math.sin(angle) * 41;
        labels.push(`
          <text
            class="mix-chart__percent"
            x="${x.toFixed(2)}"
            y="${y.toFixed(2)}"
          >${formatPercent(item.share)}</text>
        `);
      }
      return `
        <circle
            class="mix-chart__segment"
            cx="50"
            cy="50"
            r="42"
            fill="none"
            stroke="${item.color}"
            stroke-width="18"
            stroke-dasharray="${length.toFixed(3)} ${(circumference - length).toFixed(3)}"
            stroke-dashoffset="${dashOffset.toFixed(3)}"
            data-sheet="${escapeAttribute(item.label)}"
            data-title="${escapeAttribute(item.shortLabel)}"
            data-value="${escapeAttribute(currency.format(item.total))}"
            data-count="${escapeAttribute(integer.format(item.count))}"
            data-share="${escapeAttribute(formatPercent(item.share))}"
        ></circle>
      `;
    })
    .join("");

  el.donutChart.innerHTML = `
    <svg class="mix-chart__svg" viewBox="0 0 100 100" aria-hidden="true">
      <g transform="rotate(-90 50 50)">
        <circle class="mix-chart__track" cx="50" cy="50" r="42" fill="none" stroke-width="18"></circle>
        ${segments}
      </g>
      ${labels.join("")}
    </svg>
    <div class="mix-chart__center">
      <strong class="mix-center-value" id="donut-total">${formatCurrencyShort(totalMix)}</strong>
      <span>Total de descontos</span>
    </div>
    <div class="mix-tooltip" id="donut-tooltip" hidden></div>
  `;
  el.donutTotal = document.getElementById("donut-total");
  el.donutTooltip = document.getElementById("donut-tooltip");
}

function renderMixLegend(mixRows) {
  el.donutLegend.innerHTML = `
    <div class="mix-legend__head" aria-hidden="true">
      <span>Categoria</span>
      <span>Valor</span>
      <span>Qtd.</span>
      <span>%</span>
    </div>
    ${mixRows
    .map((item) => `
      <button class="mix-legend__row" type="button" data-sheet="${escapeAttribute(item.label)}">
        <span class="mix-legend__category">
          <i style="background:${item.color}"></i>
          ${escapeHtml(item.shortLabel)}
        </span>
        <span class="mix-legend__value">${formatCurrencyShort(item.total)}</span>
        <span class="mix-legend__count">${integer.format(item.count)}</span>
        <span class="mix-legend__share">${formatPercent(item.share)}</span>
      </button>
    `)
    .join("")}
  `;
}

function showDonutTooltip(segment, event) {
  if (!el.donutTooltip) return;
  el.donutTooltip.innerHTML = `
    <strong>${escapeHtml(segment.dataset.title || "")}</strong>
    <span>${escapeHtml(segment.dataset.value || "")} em descontos</span>
    <span>${escapeHtml(segment.dataset.count || "0")} registros · ${escapeHtml(segment.dataset.share || "0%")}</span>
  `;
  el.donutTooltip.hidden = false;
  positionDonutTooltip(event);
}

function positionDonutTooltip(event) {
  if (!el.donutTooltip || el.donutTooltip.hidden || !event) return;
  const gap = 14;
  const tooltipRect = el.donutTooltip.getBoundingClientRect();
  const width = tooltipRect.width || 220;
  const height = tooltipRect.height || 72;
  const left = Math.min(window.innerWidth - width - 12, Math.max(12, event.clientX + gap));
  const top = Math.min(window.innerHeight - height - 12, Math.max(12, event.clientY + gap));
  el.donutTooltip.style.left = `${left}px`;
  el.donutTooltip.style.top = `${top}px`;
}

function hideDonutTooltip() {
  if (el.donutTooltip) el.donutTooltip.hidden = true;
}

function renderPnrGoalSummary(filtered) {
  if (!el.pnrGoalSummary) return;
  const pnrRows = filtered.filter((row) => normalizeDonutSheet(row) === "PNR");
  const pnrValue = pnrRows.reduce((acc, row) => acc + Number(row.valor_numerico || 0), 0);
  const isAnnual = state.monthFilter === "all";
  const monthCount = isAnnual ? countScopedGoalMonths(filtered) : 1;
  const periodLabel = isAnnual ? "anual" : "mensal";
  const title = isAnnual ? "Meta PNR anual" : "Meta PNR mensal";
  const goalMode = isAnnual ? "annual" : "monthly";
  const goalLimit = isAnnual ? getAnnualPnrGoalLimit(monthCount) : getMonthlyPnrGoalLimit();
  const goal = getPnrGoalStatus(pnrValue, goalLimit);
  const panel = el.pnrGoalSummary.closest(".goal-card");
  const titleNode = panel?.querySelector(".panel__header h2");
  const actionsNode = panel?.querySelector(".goal-card__actions");
  if (panel) {
    panel.dataset.goalPeriod = periodLabel;
    panel.dataset.goalStatus = goal.tone;
  }
  if (titleNode) titleNode.textContent = title;
  if (actionsNode) {
    const configTitle = isAnnual ? "Configurar meta anual" : "Configurar meta mensal";
    actionsNode.innerHTML = `
      <span class="goal-status ${goal.tone}">${escapeHtml(goal.label)}</span>
      <details class="goal-config" data-goal-mode="${goalMode}">
        <summary title="${escapeAttribute(configTitle)}" aria-label="${escapeAttribute(configTitle)}">⚙</summary>
        <form class="goal-config__panel" data-goal-config-form>
          <strong>${escapeHtml(configTitle)}</strong>
          <label>
            <span>Valor em reais</span>
            <input
              class="goal-config__input"
              type="text"
              inputmode="decimal"
              placeholder="R$ 0,00"
              value="${escapeAttribute(currency.format(goalLimit))}"
              data-pnr-goal-input
              data-goal-mode="${goalMode}"
            >
          </label>
          <div class="goal-config__actions">
            <button type="button" data-goal-config-cancel>Cancelar</button>
            <button type="submit" data-goal-config-save>Salvar</button>
          </div>
        </form>
      </details>
    `;
  }
  el.pnrGoalSummary.innerHTML = `
    <div class="goal-body">
      <div class="goal-copy">
        <span class="goal-eyebrow">Valor atual</span>
        <strong class="goal-value">${escapeHtml(goal.valueLabel)}</strong>
        <span>Meta ${periodLabel}: ${escapeHtml(goal.limitLabel)}</span>
        <small>${integer.format(pnrRows.length)} registros PNR · ${formatPercent(goal.percent)} da meta ${periodLabel}</small>
      </div>
      ${renderPnrGoalGauge(goal)}
    </div>
    <div class="goal-progress" title="${escapeAttribute(`${formatPercent(goal.percent)} da meta ${periodLabel}`)}" aria-hidden="true">
      <span style="width:${goal.progress.toFixed(1)}%"></span>
    </div>
  `;
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

  const maxCount = Math.max(...rows.map((row) => row.pnrCount + row.packageCount), 1);
  el.monthlyComparison.innerHTML = `
    <div class="month-columns">
      ${rows
    .map((row, index) => {
      const offenseTotal = row.pnrCount + row.packageCount;
      const pct = (offenseTotal / maxCount) * 100;
      const previousOffense = row.previous ? row.previous.pnrCount + row.previous.packageCount : 0;
      const deltaOffense = row.previous ? offenseTotal - previousOffense : 0;
      const deltaOffensePct = row.previous && previousOffense ? (deltaOffense / previousOffense) * 100 : 0;
      const trendClass = deltaOffense > 0 ? "is-up" : deltaOffense < 0 ? "is-down" : "is-flat";
      const trendLabel = row.previous
        ? `${deltaOffense > 0 ? "+" : ""}${deltaOffensePct.toFixed(1)}% ${deltaOffense > 0 ? "mais ofensivo" : deltaOffense < 0 ? "menos ofensivo" : "estável"}`
        : "Base";
      const monthTone = getOffenseColor(offenseTotal, maxCount);
      return `
        <button class="month-column ${row.datasetId === state.activeDatasetId ? "is-active" : ""}" type="button" data-dataset-id="${escapeAttribute(row.datasetId)}" style="--reveal-index:${index}">
          <div class="month-column__plot">
            <span class="month-column__fill" style="height:${Math.max(12, pct).toFixed(1)}%; background:${monthTone}">
              <span class="month-column__stats">
              <strong>${integer.format(row.count)}</strong>
              <span>PNR ${integer.format(row.pnrCount)}</span>
              <span>Perd. ${integer.format(row.packageCount)}</span>
              </span>
            </span>
          </div>
          <div class="month-column__meta">
            <strong>${escapeHtml(shortMonthYear(row.label))}</strong>
            <strong>${currency.format(row.totalValue)}</strong>
            <span class="${trendClass}">${escapeHtml(trendLabel)}</span>
          </div>
        </button>
      `;
    })
    .join("")}
    </div>`;
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
  const currentPnrRows = sheet === "PNR" ? getFilteredRows().filter((row) => row.aba_origem === "PNR") : [];
  const currentPnrValue = currentPnrRows.reduce((acc, row) => acc + Number(row.valor_numerico || 0), 0);
  const pnrGoal = sheet === "PNR" ? getPnrGoalStatus(currentPnrValue) : null;

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
          ? `<div class="tower-chart tower-chart--horizontal">
              ${bases.map((base) => renderBaseHorizontalGroup(base, rowsByDataset, max, metricLabel)).join("")}
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

function renderBaseHorizontalGroup(base, rowsByDataset, max, metricLabel) {
  const values = rowsByDataset.map((period) => {
    const rows = period.rows.filter((row) => row.base === base);
    const total = rows.length;
    const value = rows.reduce((acc, row) => acc + Number(row.valor_numerico || 0), 0);
    return { label: period.label, total, value };
  });
  const evolution = getBaseEvolution(values);
  const bars = values.map((period) => {
    const width = period.total ? Math.max(0.8, (period.total / max) * 100) : 0;
    const color = getOffenseColor(period.total, max);
    const canShowValue = period.total && width >= 7;
    return `
      <span class="timeline-period timeline-period--horizontal">
        <span class="timeline-period__label">${escapeHtml(shortPeriodLabel(period.label))}</span>
        <span class="tower-bar-rail">
          <span
            class="tower-bar tower-bar--horizontal${canShowValue ? "" : " is-tiny"}"
            style="width:${width.toFixed(1)}%; background:${color}"
            title="${escapeAttribute(`${formatBaseCode(base)} · ${period.label}: ${integer.format(period.total)} ${metricLabel} · ${currency.format(period.value)}`)}"
          ><em>${canShowValue ? integer.format(period.total) : ""}</em></span>
        </span>
      </span>
    `;
  }).join("");
  return `
    <div class="tower-base tower-base--horizontal">
      <strong>${escapeHtml(formatBaseCode(base))}</strong>
      <div class="tower-bars tower-bars--horizontal">${bars}</div>
      <span class="tower-status ${evolution.tone}">${escapeHtml(`${evolution.arrow} ${evolution.label} ${evolution.status}`)}</span>
    </div>
  `;
}

function getBaseEvolution(values) {
  const first = values[0]?.total || 0;
  const last = values[values.length - 1]?.total || 0;
  if (!values.length || values.length < 2) {
    return { arrow: "→", label: "sem histórico", tone: "is-flat", status: "Histórico curto" };
  }
  if (!first && !last) return { arrow: "→", label: "0.0%", tone: "is-flat", status: "estável" };
  const delta = first ? ((last - first) / first) * 100 : 100;
  const label = `${delta > 0 ? "+" : ""}${delta.toFixed(1)}%`;
  if (delta < 0) return { arrow: "↓", label, tone: "is-good", status: "menos ofensiva" };
  if (delta > 0) return { arrow: "↑", label, tone: "is-bad", status: "mais ofensiva" };
  return { arrow: "→", label, tone: "is-flat", status: "estável" };
}

function getPnrGoalStatus(totalValue, limitOverride) {
  const limit = Number(limitOverride || getMonthlyPnrGoalLimit());
  const percent = limit > 0 ? (Number(totalValue || 0) / limit) * 100 : 0;
  let tone = "is-under";
  let label = "Abaixo da meta";
  if (percent < 70) {
    tone = "is-under";
    label = "Abaixo da meta";
  } else if (percent < 100) {
    tone = "is-warning";
    label = "Em atenção";
  } else if (percent <= 150) {
    tone = "is-hit";
    label = "Meta atingida";
  } else {
    tone = "is-over";
    label = "Acima do previsto";
  }
  const progress = Math.min(percent, 100);
  const angle = -180 + (progress / 100) * 180;
  return {
    tone,
    label,
    angle: angle.toFixed(1),
    valueLabel: currency.format(totalValue),
    limit,
    limitLabel: currency.format(limit),
    percent,
    progress,
  };
}

function renderPnrGoalGauge(goal) {
  return `
    <div
      class="goal-gauge"
      style="--needle-angle:${goal.angle}deg; --goal-progress:${goal.progress.toFixed(1)}%"
      title="${escapeAttribute(`${formatPercent(goal.percent)} da meta`)}"
    >
      <span class="goal-gauge__label">Progresso</span>
      <span class="goal-gauge__dial">
        <span class="goal-gauge__needle"></span>
        <span class="goal-gauge__pivot"></span>
      </span>
      <strong>${formatPercent(goal.percent)}</strong>
    </div>
  `;
}

function getMonthlyPnrGoalLimit() {
  const monthlyGoal = Number(state.metaMensal || state.pnrGoalLimit || DEFAULT_PNR_GOAL_LIMIT);
  return monthlyGoal > 0 ? monthlyGoal : DEFAULT_PNR_GOAL_LIMIT;
}

function getAnnualPnrGoalLimit(monthCount = 1) {
  const savedAnnualGoal = Number(state.metaAnual || 0);
  if (state.metaAnualEditada && savedAnnualGoal > 0) return savedAnnualGoal;
  return getMonthlyPnrGoalLimit() * Math.max(Number(monthCount) || 1, 1);
}

function setPnrGoalByMode(mode, value) {
  const safeValue = Number(value) > 0 ? Number(value) : DEFAULT_PNR_GOAL_LIMIT;
  if (mode === "annual") {
    state.metaAnual = safeValue;
    state.metaAnualEditada = true;
    return;
  }
  state.metaMensal = safeValue;
  state.pnrGoalLimit = safeValue;
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

function shortMonthYear(label) {
  const match = String(label || "").match(/([A-Za-zÀ-ÿ]+)\s*\/\s*(\d{4})/);
  if (!match) return String(label || "");
  return `${match[1].slice(0, 3)}/${String(match[2]).slice(2)}`.replace(/^mar/i, "Mar");
}

function parseCurrencyInput(value) {
  const normalized = String(value || "")
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function downloadMonthlyReport() {
  const allMonthlyRows = buildMonthlyComparison();
  const filteredRows = getFilteredRows();
  const summary = buildSummary(filteredRows);
  const analysis = buildReportAnalysis({ rows: allMonthlyRows, filteredRows, summary });
  const pdf = buildReportPdfBlob({ analysis, filteredRows, summary });
  downloadBlob(pdf, analysis.fileName);
  showToast("Relatório LOSS baixado.", "good", 4200);
}

function buildReportPdfBlob({ analysis, summary }) {
  const pages = [];
  let commands = [];
  let y = 740;
  const page = { width: 595, height: 842, margin: 34, bottom: 38 };
  const contentW = page.width - page.margin * 2;
  const colors = {
    ink: "0.06 0.13 0.22",
    muted: "0.36 0.44 0.55",
    soft: "0.95 0.98 1",
    line: "0.82 0.87 0.93",
    tableHead: "0.90 0.94 0.98",
    navy: "0.04 0.18 0.31",
    teal: "0.05 0.55 0.48",
    blue: "0.08 0.47 0.78",
    green: "0.08 0.52 0.28",
    orange: "0.74 0.35 0",
    red: "0.76 0.16 0.18",
    white: "1 1 1",
    warm: "1 0.95 0.88",
    dangerSoft: "1 0.92 0.93",
    blueSoft: "0.91 0.96 1",
    greenSoft: "0.91 0.98 0.94",
  };
  const addPage = () => {
    if (commands.length) pages.push(commands.join("\n"));
    commands = [];
    commands.push(`${colors.soft} rg 0 0 ${page.width} ${page.height} re f`);
    commands.push(`${colors.navy} rg 0 764 ${page.width} 78 re f`);
    commands.push("0.09 0.48 0.54 rg 442 764 153 78 re f");
    addText("Dashboard Pré-Fatura", page.margin, 822, 9.5, "0.74 0.88 1");
    addText("Relatório Executivo LOSS", page.margin, 803, 19, colors.white);
    addText(`Período: ${analysis.scopeLabel}`, page.margin, 784, 10, colors.white);
    addText(analysis.generatedAt, page.margin, 770, 8.5, "0.78 0.88 0.96");
    y = 734;
  };
  const addText = (text, x, yy, size = 10, color = "0.08 0.14 0.22", align = "left") => {
    const value = String(text ?? "");
    const offset = align === "right" ? estimatePdfTextWidth(value, size) : align === "center" ? estimatePdfTextWidth(value, size) / 2 : 0;
    commands.push(`${color} rg BT /F1 ${size} Tf ${Math.max(0, x - offset).toFixed(1)} ${yy.toFixed(1)} Td <${pdfTextHex(value)}> Tj ET`);
  };
  const addRect = (x, yy, w, h, color) => {
    commands.push(`${color} rg ${x.toFixed(1)} ${yy.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)} re f`);
  };
  const addStrokeRect = (x, yy, w, h, color = colors.line) => {
    commands.push(`${color} RG ${x.toFixed(1)} ${yy.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)} re S`);
  };
  const addLine = (x1, y1, x2, y2, color = colors.line, width = 0.7) => {
    commands.push(`${color} RG ${width} w ${x1.toFixed(1)} ${y1.toFixed(1)} m ${x2.toFixed(1)} ${y2.toFixed(1)} l S`);
  };
  const ensure = (height) => {
    if (y - height < page.bottom) addPage();
  };
  const card = (x, top, w, h, fill = colors.white, accent = "") => {
    addRect(x, top - h, w, h, fill);
    addStrokeRect(x, top - h, w, h);
    if (accent) addRect(x, top - h, 4, h, accent);
  };
  const addWrappedText = (text, x, top, width, size = 9.5, color = colors.ink, lineHeight = 13, maxLines = 6, clip = false) => {
    const lines = wrapPdfText(text, width, size, maxLines);
    const drawable = clip ? lines : wrapPdfText(text, width, size, 60);
    lines.forEach((line, index) => addText(line, x, top - index * lineHeight, size, color));
    return Math.min(drawable.length, lines.length) * lineHeight;
  };
  const sectionTitle = (title, meta = "") => {
    ensure(38);
    addText(title, page.margin, y, 13, colors.ink);
    if (meta) addText(meta, page.width - page.margin, y, 9, colors.muted, "right");
    y -= 10;
    addLine(page.margin, y, page.width - page.margin, y, colors.line, 0.6);
    y -= 16;
  };
  const metricCard = (x, top, w, h, label, value, note, accent, fill) => {
    card(x, top, w, h, fill, accent);
    addText(label, x + 12, top - 17, 7.8, colors.muted);
    addWrappedText(value, x + 12, top - 36, w - 24, value.length > 18 ? 11.5 : 14.5, accent, 13, 2, true);
    addWrappedText(note, x + 12, top - 55, w - 24, 7.2, colors.muted, 8.5, 2, true);
  };
  const drawParagraphCard = (title, text, height, accent = colors.teal, fill = colors.white) => {
    ensure(height + 26);
    sectionTitle(title, analysis.scope.mode === "annual" ? "consolidado anual" : "mês selecionado");
    card(page.margin, y, contentW, height, fill, accent);
    const paragraphs = String(text).split(/\n+/).filter(Boolean);
    let textY = y - 18;
    paragraphs.forEach((paragraph) => {
      const used = addWrappedText(paragraph, page.margin + 16, textY, contentW - 32, 9.5, colors.ink, 12.5, 8);
      textY -= used + 6;
    });
    y -= height + 22;
  };
  const drawKpiGrid = () => {
    const gap = 10;
    const cols = 4;
    const w = (contentW - gap * (cols - 1)) / cols;
    const h = 64;
    const metrics = [
      ["Impacto financeiro", currency.format(summary.totalValue), `Ticket médio: ${currency.format(analysis.ticketAverage)} por ocorrência`, colors.orange, colors.warm],
      ["Ticket médio", currency.format(analysis.ticketAverage), "por ocorrência válida", colors.teal, colors.white],
      ["PNR", integer.format(summary.pnrCount), `${analysis.pnrShare}% dos registros`, colors.red, colors.dangerSoft],
      ["Pacotes perdidos", integer.format(summary.packageCount), `${analysis.packageShare}% dos registros`, colors.blue, colors.blueSoft],
      ["Registros", integer.format(summary.count), `${integer.format(summary.baseCount)} bases`, colors.blue, colors.white],
      ["Média mensal", currency.format(analysis.monthlyAverage), `Mês crítico: ${analysis.criticalMonthLabel}`, colors.orange, colors.white],
      ["Mês crítico", analysis.criticalMonthLabel, formatCurrencyShort(analysis.criticalMonth.totalValue), colors.red, colors.dangerSoft],
      ["Categoria líder", analysis.dominantCategoryLabel, `${analysis.dominantCategoryShare}% do impacto`, colors.teal, colors.greenSoft],
    ];
    ensure(160);
    for (let index = 0; index < metrics.length; index += 1) {
      const row = Math.floor(index / cols);
      const col = index % cols;
      metricCard(page.margin + col * (w + gap), y - row * (h + 10), w, h, ...metrics[index]);
    }
    y -= h * 2 + 32;
  };
  const drawDiagnosticCards = () => {
    ensure(154);
    sectionTitle("Diagnóstico operacional", "leitura automática");
    const gap = 10;
    const w = (contentW - gap) / 2;
    const h = 72;
    analysis.diagnostics.slice(0, 4).forEach((item, index) => {
      const row = Math.floor(index / 2);
      const col = index % 2;
      const x = page.margin + col * (w + gap);
      const top = y - row * (h + 10);
      const accent = index === 0 ? colors.red : index === 1 ? colors.orange : index === 2 ? colors.blue : colors.teal;
      const fill = index === 0 ? colors.dangerSoft : index === 1 ? colors.warm : colors.white;
      card(x, top, w, h, fill, accent);
      addText(item.title, x + 12, top - 17, 9, accent);
      addWrappedText(item.text, x + 12, top - 34, w - 24, 8.2, colors.ink, 10.5, 4);
    });
    y -= h * 2 + 34;
  };
  const drawTable = (x, top, w, title, headers, rows, widths, height, accent = colors.blue, aligns = []) => {
    card(x, top, w, height, colors.white, accent);
    addText(title, x + 12, top - 18, 10.5, colors.ink);
    const tableTop = top - 32;
    addRect(x + 10, tableTop - 14, w - 20, 18, colors.tableHead);
    let cursor = x + 14;
    headers.forEach((header, index) => {
      const align = aligns[index] || (index >= 2 ? "right" : "left");
      addText(header, align === "right" ? cursor + widths[index] - 4 : cursor, tableTop - 8, 7.3, colors.muted, align);
      cursor += widths[index];
    });
    rows.forEach((row, rowIndex) => {
      const rowY = tableTop - 29 - rowIndex * 18;
      if (rowIndex % 2 === 1) addRect(x + 10, rowY - 7, w - 20, 16, "0.97 0.985 1");
      cursor = x + 14;
      row.forEach((cell, index) => {
        const text = String(cell ?? "");
        const align = aligns[index] || (index >= 2 ? "right" : "left");
        const size = index === 1 && text.length > 28 ? 7.2 : 8;
        if (index === 1) {
          addWrappedText(text, cursor, rowY, widths[index] - 8, size, colors.ink, 8.5, 2, true);
        } else {
          addText(text, align === "right" ? cursor + widths[index] - 4 : cursor, rowY, 8, colors.ink, align);
        }
        cursor += widths[index];
      });
    });
  };
  const drawMonthlyTable = () => {
    ensure(150);
    sectionTitle("Comparativo mensal", analysis.scope.mode === "annual" ? "ano consolidado" : "mês selecionado");
    const rows = analysis.timelineRows.slice(-8).map((row, index) => [
      shortMonthYear(row.label),
      integer.format(row.count || 0),
      formatCurrencyShort(row.totalValue),
      index === 0 || !row.previous ? "—" : formatSignedPct(row.deltaPct),
    ]);
    drawTable(page.margin, y, contentW, "Evolução por competência", ["Mês", "Ocorrências", "Descontos", "Variação"], rows, [110, 100, 150, 120], 48 + rows.length * 18, colors.blue, ["left", "right", "right", "right"]);
    y -= 68 + rows.length * 18;
  };
  const drawAlertCards = () => {
    ensure(150);
    sectionTitle("Alertas críticos", `${analysis.alerts.length} alertas`);
    const h = 54;
    analysis.alerts.slice(0, 5).forEach((alert, index) => {
      ensure(h + 8);
      card(page.margin, y, contentW, h, index === 0 ? colors.dangerSoft : colors.white, colors.red);
      addText(alert.title, page.margin + 14, y - 17, 9, colors.red);
      addWrappedText(alert.text, page.margin + 14, y - 33, contentW - 28, 8.4, colors.ink, 10.5, 2);
      y -= h + 8;
    });
    y -= 8;
  };
  const drawRankings = () => {
    ensure(210);
    sectionTitle("Rankings de concentração financeira", "base e driver");
    const gap = 10;
    const w = (contentW - gap) / 2;
    const h = 178;
    const baseRows = analysis.topBases.slice(0, 6).map((item, index) => [`${index + 1}`, item.label, formatCurrencyShort(item.total), `${item.share}%`]);
    const driverRows = analysis.topDrivers.slice(0, 6).map((item, index) => [`${index + 1}`, item.label, formatCurrencyShort(item.total), `${item.share}%`]);
    drawTable(page.margin, y, w, "Bases com maior prejuízo", ["#", "Nome", "Valor", "%"], baseRows, [22, 116, 62, 34], h, colors.orange);
    drawTable(page.margin + w + gap, y, w, "Drivers com maior impacto", ["#", "Nome", "Valor", "%"], driverRows, [22, 116, 62, 34], h, colors.blue);
    y -= h + 26;
  };
  const drawCategoryTable = () => {
    ensure(124);
    sectionTitle("Participação por categoria", "impacto total");
    const rows = analysis.categoryTotals.map((item) => [reportCategoryLabel(item.label), `${analysis.categoryShareMap[item.label] || "0,0"}%`, formatCurrencyShort(item.total)]);
    drawTable(page.margin, y, contentW, "Mix financeiro LOSS", ["Categoria", "Percentual", "Valor"], rows, [230, 120, 150], 104, colors.teal, ["left", "right", "right"]);
    y -= 130;
  };
  const drawNumberedList = (title, meta, items, accent = colors.green) => {
    ensure(128);
    sectionTitle(title, meta);
    const h = Math.max(96, 26 + items.length * 22);
    card(page.margin, y, contentW, h, colors.greenSoft, accent);
    items.forEach((item, index) => {
      const rowY = y - 22 - index * 21;
      addText(`${index + 1}.`, page.margin + 16, rowY, 8.8, accent);
      addWrappedText(item, page.margin + 36, rowY, contentW - 52, 8.8, colors.ink, 10.5, 2);
    });
    y -= h + 24;
  };
  const drawConclusion = () => {
    ensure(160);
    sectionTitle("Conclusão executiva", "prioridade operacional");
    const h = 132;
    card(page.margin, y, contentW, h, colors.white, colors.navy);
    analysis.conclusionItems.forEach((item, index) => {
      const rowY = y - 20 - index * 22;
      addText(`${item.label}:`, page.margin + 16, rowY, 8.8, colors.navy);
      addWrappedText(item.text, page.margin + 122, rowY, contentW - 138, 8.8, colors.ink, 10.5, 2);
    });
    y -= h + 18;
  };

  addPage();
  drawKpiGrid();
  drawParagraphCard("Análise inteligente do período", analysis.intelligentSummary, 132);
  drawDiagnosticCards();
  drawMonthlyTable();
  drawAlertCards();
  drawRankings();
  drawCategoryTable();
  drawNumberedList("Recomendações de ação", "próximos passos", analysis.recommendations);
  drawConclusion();

  pages.push(commands.join("\n"));
  return createPdfBlob(pages);
}

function buildReportAnalysis({ rows, filteredRows, summary }) {
  const scope = getReportScope();
  const yearRows = rows.filter((row) => String(row.key).startsWith(`${scope.year}-`));
  const allRowsForScope = scope.mode === "annual" ? yearRows : rows;
  const activeMonth = scope.mode === "monthly" ? rows.find((row) => row.key === scope.key) || null : null;
  const activeIndex = activeMonth ? rows.findIndex((row) => row.key === activeMonth.key) : -1;
  const previousMonth = activeIndex > 0 ? rows[activeIndex - 1] : null;
  const fallbackRow = {
    key: scope.key || `${scope.year}-01`,
    label: scope.mode === "annual" ? `Anual / ${scope.year}` : scope.label.replace("/", " / "),
    count: summary.count,
    totalValue: summary.totalValue,
    pnrCount: summary.pnrCount,
    packageCount: summary.packageCount,
    previous: previousMonth,
    deltaValue: activeMonth && previousMonth ? activeMonth.totalValue - previousMonth.totalValue : 0,
    deltaPct: activeMonth && previousMonth && previousMonth.totalValue ? ((activeMonth.totalValue - previousMonth.totalValue) / previousMonth.totalValue) * 100 : 0,
  };
  const timelineRows = (scope.mode === "annual" ? yearRows : activeMonth ? [activeMonth] : [fallbackRow]).filter(Boolean);
  const comparisonRows = timelineRows.length ? timelineRows : [fallbackRow];
  const topBases = reportTopBy(filteredRows, "base", "valor_numerico", 8);
  const topDrivers = reportTopBy(filteredRows, "motorista", "valor_numerico", 8);
  const topBaseByCount = reportTopBy(filteredRows, "base", null, 5);
  const categoryTotals = DONUT_SHEETS.map((sheet) => {
    const rowsForSheet = filteredRows.filter((row) => normalizeDonutSheet(row) === sheet);
    return {
      label: sheet,
      total: rowsForSheet.reduce((acc, row) => acc + Number(row.valor_numerico || 0), 0),
      count: rowsForSheet.length,
    };
  });
  const totalCategoryValue = Math.max(categoryTotals.reduce((acc, item) => acc + item.total, 0), 1);
  const categoryShareMap = categoryTotals.reduce((acc, item) => {
    acc[item.label] = formatNumberPt((item.total / totalCategoryValue) * 100, 1);
    return acc;
  }, {});
  const dominantCategory = categoryTotals.reduce((best, item) => (item.total > best.total ? item : best), categoryTotals[0] || { label: "PNR", total: 0, count: 0 });
  const totalOccurrences = Math.max(summary.count, 1);
  const ticketAverage = summary.count ? summary.totalValue / summary.count : 0;
  const monthlyAverage = comparisonRows.length ? comparisonRows.reduce((acc, row) => acc + Number(row.totalValue || 0), 0) / comparisonRows.length : summary.totalValue;
  const criticalMonth = comparisonRows.reduce((best, row) => (Number(row.totalValue || 0) > Number(best.totalValue || 0) ? row : best), comparisonRows[0] || fallbackRow);
  const volumeMonth = comparisonRows.reduce((best, row) => (Number(row.count || 0) > Number(best.count || 0) ? row : best), comparisonRows[0] || fallbackRow);
  const topBase = topBases[0] || { label: "Não identificado", total: 0, count: 0 };
  const topDriver = topDrivers[0] || { label: "Não identificado", total: 0, count: 0 };
  const topBaseShareNumber = summary.totalValue ? (topBase.total / summary.totalValue) * 100 : 0;
  const topDriverShareNumber = summary.totalValue ? (topDriver.total / summary.totalValue) * 100 : 0;
  const topBaseShare = formatNumberPt(topBaseShareNumber, 1);
  const topDriverShare = formatNumberPt(topDriverShareNumber, 1);
  const topBasesWithShare = topBases.map((item) => ({ ...item, share: formatNumberPt(summary.totalValue ? (item.total / summary.totalValue) * 100 : 0, 1) }));
  const topDriversWithShare = topDrivers.map((item) => ({ ...item, share: formatNumberPt(summary.totalValue ? (item.total / summary.totalValue) * 100 : 0, 1) }));
  const missingBaseCount = filteredRows.filter((row) => !hasReportLabel(row.base)).length;
  const missingDriverCount = filteredRows.filter((row) => !hasReportLabel(row.motorista)).length;
  const pnrShare = formatNumberPt((summary.pnrCount / totalOccurrences) * 100, 1);
  const packageShare = formatNumberPt((summary.packageCount / totalOccurrences) * 100, 1);
  const trend = buildReportTrend(scope, activeMonth, previousMonth, comparisonRows);
  const diagnostics = buildReportDiagnostics({
    scope,
    summary,
    criticalMonth,
    volumeMonth,
    dominantCategory,
    topBase,
    topDriver,
    ticketAverage,
    trend,
  });
  const alerts = buildReportAlerts({
    scope,
    summary,
    comparisonRows,
    monthlyAverage,
    topBase,
    topDriver,
    topBaseShare,
    topDriverShare,
    topBaseShareNumber,
    topDriverShareNumber,
    topBaseByCount,
    dominantCategory,
    categoryShareMap,
    missingBaseCount,
    missingDriverCount,
    trend,
  });
  const recommendations = buildReportRecommendations({
    topBase,
    topDriver,
    dominantCategory,
    missingBaseCount,
    missingDriverCount,
    trend,
  });
  const conclusion = buildReportConclusionText({
    scope,
    topBase,
    topDriver,
    dominantCategory,
    criticalMonth,
    trend,
    recommendations,
  });

  return {
    title: scope.title,
    fileName: scope.fileName,
    scope,
    scopeLabel: scope.label,
    generatedAt: `Gerado em: ${liveClockFormatter.format(new Date())}`,
    timelineRows: comparisonRows,
    ticketAverage,
    monthlyAverage,
    criticalMonth,
    volumeMonth,
    criticalMonthLabel: shortMonthYear(criticalMonth.label),
    volumeMonthLabel: shortMonthYear(volumeMonth.label),
    pnrShare,
    packageShare,
    dominantCategoryLabel: reportCategoryLabel(dominantCategory.label),
    dominantCategoryShare: categoryShareMap[dominantCategory.label] || "0,0",
    categoryTotals,
    categoryShareMap,
    topBases: topBasesWithShare,
    topDrivers: topDriversWithShare,
    topBaseShare,
    topDriverShare,
    diagnostics,
    alerts,
    recommendations,
    conclusion,
    conclusionItems: buildReportConclusionItems({
      scope,
      topBase,
      topDriver,
      dominantCategory,
      criticalMonth,
      trend,
      recommendations,
    }),
    intelligentSummary: buildIntelligentSummary({
      scope,
      summary,
      criticalMonth,
      volumeMonth,
      dominantCategory,
      topBase,
      topDriver,
      topBaseShare,
      topDriverShare,
      trend,
      ticketAverage,
      pnrShare,
      packageShare,
    }),
  };
}

function getReportScope() {
  const referencePeriod = getDatasetPeriod(getActiveDataset());
  const selectedKey = state.monthFilter || referencePeriod.key;
  const key = selectedKey === "all" ? referencePeriod.key : selectedKey;
  const year = String(key || referencePeriod.key).slice(0, 4) || String(new Date().getFullYear());
  if (selectedKey === "all") {
    return {
      mode: "annual",
      key: "all",
      year,
      label: `Anual ${year}`,
      title: `Relatório Executivo LOSS — Anual ${year}`,
      fileName: `relatorio-executivo-loss-anual-${year}.pdf`,
    };
  }
  const monthIndex = Number(String(key).slice(5, 7)) || 1;
  const monthName = MONTHS[monthIndex - 1] || "período";
  const label = `${capitalize(monthName)}/${year}`;
  return {
    mode: "monthly",
    key,
    year,
    label,
    title: `Relatório Executivo LOSS — ${label}`,
    fileName: `relatorio-executivo-loss-${slugify(`${monthName}-${year}`)}.pdf`,
  };
}

function buildReportTrend(scope, activeMonth, previousMonth, comparisonRows) {
  if (scope.mode === "monthly") {
    if (!activeMonth || !previousMonth) {
      return { direction: "neutral", pct: 0, text: "não há mês anterior carregado para comparação direta." };
    }
    const deltaPct = previousMonth.totalValue ? ((activeMonth.totalValue - previousMonth.totalValue) / previousMonth.totalValue) * 100 : 0;
    if (deltaPct > 0.5) return { direction: "up", pct: deltaPct, text: `aumento de ${formatSignedPct(deltaPct)} em descontos vs. ${shortMonthYear(previousMonth.label)}.` };
    if (deltaPct < -0.5) return { direction: "down", pct: deltaPct, text: `queda de ${Math.abs(deltaPct).toFixed(1)}% em descontos vs. ${shortMonthYear(previousMonth.label)}.` };
    return { direction: "neutral", pct: deltaPct, text: "estabilidade financeira frente ao mês anterior." };
  }
  const first = comparisonRows[0] || null;
  const last = comparisonRows[comparisonRows.length - 1] || null;
  if (!first || !last || first.key === last.key || !first.totalValue) {
    return { direction: "neutral", pct: 0, text: "histórico anual insuficiente para tendência robusta." };
  }
  const deltaPct = ((last.totalValue - first.totalValue) / first.totalValue) * 100;
  if (deltaPct > 0.5) return { direction: "up", pct: deltaPct, text: `o ano mostra aumento de ${formatSignedPct(deltaPct)} do primeiro para o último mês carregado.` };
  if (deltaPct < -0.5) return { direction: "down", pct: deltaPct, text: `o ano mostra redução de ${Math.abs(deltaPct).toFixed(1)}% do primeiro para o último mês carregado.` };
  return { direction: "neutral", pct: deltaPct, text: "o ano permanece praticamente estável entre início e fim do período carregado." };
}

function buildIntelligentSummary({ scope, summary, criticalMonth, volumeMonth, dominantCategory, topBase, topDriver, topBaseShare, topDriverShare, trend, ticketAverage, pnrShare, packageShare }) {
  const period = scope.mode === "annual" ? `No consolidado anual de ${scope.year}` : `Em ${scope.label}`;
  const impactSentence =
    scope.mode === "annual"
      ? `${shortMonthYear(criticalMonth.label)} teve o maior impacto financeiro, com ${currency.format(criticalMonth.totalValue)} em descontos.`
      : `o recorte registra ${currency.format(summary.totalValue)} em descontos e ticket médio de ${currency.format(ticketAverage)} por ocorrência.`;
  return [
    `${period}, ${impactSentence}`,
    `A categoria ${reportCategoryLabel(dominantCategory.label)} concentra ${currency.format(dominantCategory.total)} e lidera a pressão operacional.`,
    `A base ${topBase.label} responde por ${topBaseShare}% do impacto financeiro, enquanto o driver ${topDriver.label} concentra ${topDriverShare}%.`,
    `O volume de PNR representa ${pnrShare}% dos registros e pacotes perdidos representam ${packageShare}%.`,
    `A tendência indica que ${trend.text}`,
  ].join("\n");
}

function buildReportDiagnostics({ scope, summary, criticalMonth, volumeMonth, dominantCategory, topBase, topDriver, ticketAverage, trend }) {
  return [
    {
      title: scope.mode === "annual" ? "Mês mais crítico" : "Impacto do mês",
      text:
        scope.mode === "annual"
          ? `${shortMonthYear(criticalMonth.label)} concentrou ${currency.format(criticalMonth.totalValue)} em descontos.`
          : `${scope.label} concentrou ${currency.format(summary.totalValue)} em descontos, com ticket médio de ${currency.format(ticketAverage)}.`,
    },
    {
      title: "Volume operacional",
      text: `${shortMonthYear(volumeMonth.label)} teve ${integer.format(volumeMonth.count)} ocorrências; a categoria ${reportCategoryLabel(dominantCategory.label)} foi a mais relevante.`,
    },
    {
      title: "Prioridade",
      text: `Tratar primeiro a base ${topBase.label} e acompanhar o driver ${topDriver.label}.`,
    },
    {
      title: "Tendência",
      text: trend.text,
    },
  ];
}

function buildReportAlerts({ scope, summary, comparisonRows, monthlyAverage, topBase, topDriver, topBaseShare, topDriverShare, topBaseShareNumber, topDriverShareNumber, topBaseByCount, dominantCategory, categoryShareMap, missingBaseCount, missingDriverCount, trend }) {
  const alerts = [];
  if (topBase.total > 0) alerts.push({ title: "Base crítica", text: `${topBase.label} concentra ${topBaseShare}% do impacto financeiro do recorte.` });
  if (topDriver.total > 0) alerts.push({ title: "Driver crítico", text: `${topDriver.label} soma ${currency.format(topDriver.total)} em descontos.` });
  if (topBaseShareNumber >= 30) alerts.push({ title: "Concentração em bases", text: "Há concentração relevante de prejuízo em poucas bases, exigindo ação direcionada." });
  if (topDriverShareNumber >= 20) alerts.push({ title: "Concentração em driver", text: "Há concentração financeira em driver específico, exigindo acompanhamento individual." });
  if (topBaseByCount[0]?.count >= Math.max(3, summary.count * 0.08)) {
    alerts.push({ title: "Reincidência", text: `${topBaseByCount[0].label} também lidera reincidência, com ${integer.format(topBaseByCount[0].count)} registros.` });
  }
  if (scope.mode === "annual") {
    comparisonRows
      .filter((row) => row.totalValue > monthlyAverage * 1.2)
      .slice(0, 3)
      .forEach((row) => alerts.push({ title: "Mês acima da média", text: `${shortMonthYear(row.label)} ficou acima da média mensal em valor de descontos.` }));
  }
  if (trend.direction === "up") alerts.push({ title: "Tendência de alta", text: "O período apresenta aumento de ofensividade financeira e precisa de plano de contenção." });
  if (missingBaseCount) alerts.push({ title: "Cadastro de base", text: `${integer.format(missingBaseCount)} registro(s) sem base identificada exigem correção cadastral.` });
  if (missingDriverCount) alerts.push({ title: "Cadastro de driver", text: `${integer.format(missingDriverCount)} registro(s) sem driver identificado exigem correção cadastral.` });
  if (dominantCategory.total > 0) alerts.push({ title: "Categoria líder", text: `${reportCategoryLabel(dominantCategory.label)} representa ${categoryShareMap[dominantCategory.label] || "0,0"}% do impacto financeiro por categoria.` });
  return alerts.length ? alerts : [{ title: "Sem alerta crítico", text: "Não foram encontrados alertas críticos relevantes no recorte atual." }];
}

function buildReportRecommendations({ topBase, topDriver, dominantCategory, missingBaseCount, missingDriverCount, trend }) {
  const recommendations = [
    `Priorizar a tratativa da base ${topBase.label}, que lidera o impacto financeiro.`,
    `Acompanhar o driver ${topDriver.label} com plano de redução de recorrência.`,
    "Separar a análise de PNR, SVC Perdidos e XPT Perdidos para validar causa raiz.",
    `Investigar a categoria ${reportCategoryLabel(dominantCategory.label)} para identificar causa raiz.`,
    "Medir a evolução no próximo fechamento para confirmar eficiência das ações.",
  ];
  if (trend.direction === "up") recommendations.unshift("Criar plano de contenção imediato para reduzir a ofensividade no próximo mês.");
  if (missingBaseCount || missingDriverCount) recommendations.push("Corrigir cadastros e registros não identificados antes da próxima análise.");
  return recommendations;
}

function buildReportConclusionText({ scope, topBase, topDriver, dominantCategory, criticalMonth, trend, recommendations }) {
  const periodText = scope.mode === "annual" ? `O período anual ${scope.year}` : `O mês ${scope.label}`;
  const criticalText = scope.mode === "annual" ? `O mês de maior impacto foi ${shortMonthYear(criticalMonth.label)}.` : "A leitura está concentrada no mês selecionado.";
  return `${periodText} mostra que o principal problema está em ${reportCategoryLabel(dominantCategory.label)}, com maior impacto financeiro na base ${topBase.label} e prioridade de acompanhamento para o driver ${topDriver.label}. ${criticalText} A tendência indica que ${trend.text} A primeira ação recomendada é: ${recommendations[0]}`;
}

function buildReportConclusionItems({ scope, topBase, topDriver, dominantCategory, criticalMonth, trend, recommendations }) {
  return [
    { label: "Principal problema", text: reportCategoryLabel(dominantCategory.label) },
    { label: "Maior impacto financeiro", text: scope.mode === "annual" ? `${shortMonthYear(criticalMonth.label)} com ${currency.format(criticalMonth.totalValue)}` : `${scope.label} com ${currency.format(criticalMonth.totalValue)}` },
    { label: "Prioridade operacional", text: `Base ${topBase.label}; driver ${topDriver.label}.` },
    { label: "Tendência", text: trend.text },
    { label: "Primeira ação recomendada", text: recommendations[0] },
  ];
}

function reportTopBy(rows, key, metric, limit) {
  const map = new Map();
  for (const row of rows) {
    const label = reportLabel(row[key]);
    if (!map.has(label)) map.set(label, { label, total: 0, count: 0 });
    const item = map.get(label);
    item.total += metric ? Number(row[metric] || 0) : 1;
    item.count += 1;
  }
  return Array.from(map.values())
    .sort((a, b) => b.total - a.total || b.count - a.count || String(a.label).localeCompare(String(b.label), "pt-BR"))
    .slice(0, limit);
}

function hasReportLabel(value) {
  const text = String(value ?? "").trim();
  if (!text) return false;
  const normalized = normalize(text);
  return !["undefined", "null", "sem valor", "sem base", "sem driver", "nao informado", "nao identificada", "nao identificado", "nao identificados"].includes(normalized);
}

function reportLabel(value) {
  return hasReportLabel(value) ? String(value).trim() : "Não identificado";
}

function reportCategoryLabel(label) {
  const raw = String(label || "");
  return DONUT_LABELS[raw] || reportLabel(raw);
}

function getReportCategoryColor(label) {
  if (label === "PNR") return "0.08 0.47 0.78";
  if (label === "SVC PERDIDOS") return "1 0.62 0.26";
  if (label === "XPT PERDIDOS") return "0.32 0.78 0.50";
  return "0.36 0.44 0.55";
}

function getReportOffenseColor(value, max) {
  const ratio = max ? Number(value || 0) / max : 0;
  if (ratio >= 0.72) return "0.76 0.16 0.18";
  if (ratio >= 0.45) return "0.95 0.51 0.10";
  if (ratio >= 0.22) return "0.08 0.47 0.78";
  return "0.08 0.52 0.28";
}

function formatSignedPct(value) {
  const number = Number(value || 0);
  return `${number >= 0 ? "+" : ""}${formatNumberPt(number, 1)}%`;
}

function formatNumberPt(value, digits = 1) {
  return Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function estimatePdfTextWidth(text, size) {
  return String(text ?? "").length * size * 0.5;
}

function wrapPdfText(text, width, size = 10, maxLines = 6) {
  const maxChars = Math.max(12, Math.floor(width / (size * 0.52)));
  const words = String(text ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  const lines = [];
  let line = "";
  words.forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (next.length <= maxChars) {
      line = next;
      return;
    }
    if (line) lines.push(line);
    line = word;
  });
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const clipped = lines.slice(0, maxLines);
    clipped[maxLines - 1] = `${clipped[maxLines - 1].slice(0, Math.max(0, maxChars - 3))}...`;
    return clipped;
  }
  return lines.length ? lines : [""];
}

function pdfEscape(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[–—]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function pdfTextHex(value) {
  const winAnsi = {
    "€": 0x80,
    "‚": 0x82,
    "ƒ": 0x83,
    "„": 0x84,
    "…": 0x85,
    "†": 0x86,
    "‡": 0x87,
    "ˆ": 0x88,
    "‰": 0x89,
    "Š": 0x8a,
    "‹": 0x8b,
    "Œ": 0x8c,
    "Ž": 0x8e,
    "‘": 0x91,
    "’": 0x92,
    "“": 0x93,
    "”": 0x94,
    "•": 0x95,
    "–": 0x96,
    "—": 0x97,
    "˜": 0x98,
    "™": 0x99,
    "š": 0x9a,
    "›": 0x9b,
    "œ": 0x9c,
    "ž": 0x9e,
    "Ÿ": 0x9f,
  };
  return Array.from(String(value ?? "")).map((char) => {
    const code = char.charCodeAt(0);
    const byte = winAnsi[char] || (code <= 0xff ? code : 0x20);
    return byte.toString(16).padStart(2, "0").toUpperCase();
  }).join("");
}

function createPdfBlob(pageCommands) {
  const objects = [];
  const addObject = (content) => {
    objects.push(content);
    return objects.length;
  };
  const fontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const pageIds = pageCommands.map((content) => {
    const streamId = addObject(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    return addObject(`<< /Type /Page /Parent 0 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${streamId} 0 R >>`);
  });
  const pagesId = addObject(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`);
  const catalogId = addObject(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  pageIds.forEach((id) => {
    objects[id - 1] = objects[id - 1].replace("/Parent 0 0 R", `/Parent ${pagesId} 0 R`);
  });
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([pdf], { type: "application/pdf" });
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function slugify(value) {
  return normalize(value).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "relatorio";
}

function getActiveMonthlyStatus() {
  const rows = buildMonthlyComparison();
  const activeKey = getDatasetPeriod(getActiveDataset()).key;
  const active = rows.find((row) => row.key === activeKey) || rows[rows.length - 1] || null;
  if (!active) return "Sem histórico mensal";
  if (!active.previous) return "Sem mês anterior carregado";
  const prefix = active.deltaValue > 0 ? "+" : "";
  return `${prefix}${active.deltaPct.toFixed(1)}% vs. mês anterior`;
}

function renderBaseRankingGroup(title, items, maxValue, offset) {
  if (!items.length) return "";
  const isLessOffensive = title.toLowerCase().includes("menos");
  return `
    <div class="rank-section rank-section--base ${isLessOffensive ? "rank-section--simple" : "rank-section--bars"}">
      <h3>${escapeHtml(title)}</h3>
      ${items
        .map((item, index) => {
          const pct = maxValue > 0 ? (item.total / maxValue) * 100 : 0;
          return `
            <button class="bar-row ${isLessOffensive ? "bar-row--simple" : ""}" type="button" data-base="${escapeAttribute(item.label)}" style="--reveal-index:${offset + index}" title="${escapeAttribute(item.label)}">
              <div class="bar-row__label">${escapeHtml(item.label)}</div>
              <div class="bar-row__track"><div class="bar-row__fill" style="width:${pct.toFixed(1)}%"></div></div>
              <div class="bar-row__value">${formatCurrencyShort(item.total)}</div>
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
    <div class="rank-section rank-section--drivers">
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
              <span class="mini-table__name" title="${escapeAttribute(item.label)}">${escapeHtml(item.label)}</span>
              <span class="mini-table__value">${formatCurrencyShort(item.total)}</span>
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
  el.pageIndicator.textContent = `${integer.format(state.page)}/${integer.format(pageCount)}`;
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
  if (normalizePeriodMode(state.period) !== "month") push("Período", getPeriodModeLabel(state.period));
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
  if (el.syncStatus) {
    const label = backendStatus === "online" ? "Online" : backendStatus === "connecting" ? "Sync" : backendStatus === "offline" ? "Offline" : "Local";
    const textNode = el.syncStatus.querySelector(".connection-indicator__label");
    if (textNode) textNode.textContent = label;
    el.syncStatus.setAttribute("title", `Status da conexão: ${label}`);
    el.syncStatus.setAttribute("aria-label", `Status da conexão: ${label}`);
  }
  updateLiveClock();
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
  const unique = Array.from(new Set(values.filter(Boolean).filter((value) => value !== "Todos")));
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

function buildMixRows(rows) {
  const totals = DONUT_SHEETS.reduce((acc, label) => {
    acc[label] = { label, total: 0, count: 0 };
    return acc;
  }, {});

  rows.forEach((row) => {
    const label = normalizeDonutSheet(row);
    if (!DONUT_SHEETS.includes(label)) return;
    totals[label].total += Number(row.valor_numerico || 0);
    totals[label].count += 1;
  });

  const valorPNR = totals.PNR.total;
  const valorSVCPerdidos = totals["SVC PERDIDOS"].total;
  const valorXPTPerdidos = totals["XPT PERDIDOS"].total;
  const totalMix = valorPNR + valorSVCPerdidos + valorXPTPerdidos;
  const percentualPNR = totalMix > 0 ? (valorPNR / totalMix) * 100 : 0;
  const percentualSVC = totalMix > 0 ? (valorSVCPerdidos / totalMix) * 100 : 0;
  const percentualXPT = totalMix > 0 ? (valorXPTPerdidos / totalMix) * 100 : 0;
  const shares = {
    PNR: percentualPNR,
    "SVC PERDIDOS": percentualSVC,
    "XPT PERDIDOS": percentualXPT,
  };

  let cursor = 0;
  return DONUT_SHEETS.map((label) => {
    const item = totals[label];
    const share = shares[label] || 0;
    const start = cursor;
    const end = cursor + share;
    cursor = end;
    return {
      ...item,
      color: SHEET_COLORS[label],
      shortLabel: DONUT_LABELS[label],
      share,
      start,
      end,
    };
  });
}

function normalizeDonutSheet(row) {
  if (!row || typeof row !== "object") return "";
  const label = normalizeSheetLabel(row.aba_origem || row.aba || row.sheetName, row.tipo_desconto || row.tipo_registro);
  return DONUT_SHEETS.includes(label) ? label : "";
}

function countScopedGoalMonths(rows) {
  const months = new Set();
  const datasets = Array.isArray(fileMeta?.scopedDatasets) ? fileMeta.scopedDatasets : [];
  datasets.forEach((dataset) => {
    const key = getDatasetPeriod(dataset).key;
    if (key) months.add(key);
  });
  if (!months.size) {
    rows.forEach((row) => {
      const key = getRowMonthKey(row);
      if (key) months.add(key);
    });
  }
  return Math.max(months.size, 1);
}

function getRowMonthKey(row) {
  const rawDate = row?.data_normalizada || row?.data_sort || row?.data || "";
  if (!rawDate) return "";
  const parsed = row?.data_normalizada ? new Date(`${rawDate}T00:00:00Z`) : new Date(rawDate);
  if (Number.isNaN(parsed.getTime())) return "";
  return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatCurrencyShort(value) {
  const number = Number(value || 0);
  if (Math.abs(number) >= 1000) {
    return `R$ ${(number / 1000).toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} mil`;
  }
  return currency.format(number);
}

function formatPercent(value) {
  return `${Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
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

function normalizeSheetLabel(value, type = "") {
  const raw = normalize(`${value || ""} ${type || ""}`);
  if (raw.includes("pnr")) return "PNR";
  if (raw.includes("xpt")) return "XPT PERDIDOS";
  if (raw.includes("svc") || raw.includes("service") || raw.includes("servico")) return "SVC PERDIDOS";
  return String(value || "").trim() || "Sem aba";
}

function normalizeStoredRow(row) {
  if (!row || typeof row !== "object") return row;
  const sheet = normalizeSheetLabel(row.aba_origem || row.aba || row.sheetName, row.tipo_desconto || row.tipo_registro);
  const baseParts = splitBase(row.base);
  const normalized = {
    ...row,
    aba_origem: sheet,
    cidade_base: row.cidade_base || baseParts.cidade_base,
    sigla_base: row.sigla_base || baseParts.sigla_base,
    tipo_registro: sheet === "PNR" ? "PNR" : "PACOTE PERDIDO",
  };

  normalized._search = normalize(
    [
      normalized.aba_origem,
      normalized.tipo_desconto,
      normalized.tipo_registro,
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

  return normalized;
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
      const canonicalSheet = normalizeSheetLabel(sheetName, tipoDesc);
      const dataValue = readCell(row, idx.data);
      const idPacote = readCell(row, idx.pacote);
      const rota = readCell(row, idx.rota);
      const valor = readCell(row, idx.valor);
      const descricao = readCell(row, idx.descricao);
      const parsedDate = parseDateValue(dataValue);

      const normalized = {
        aba_origem: canonicalSheet,
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

      normalized.tipo_registro = canonicalSheet === "PNR" ? "PNR" : "PACOTE PERDIDO";
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
      script.src = new URL("./assets/vendor/xlsx.full.min.js", document.baseURI).href;
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
    rows: seedRows.map(normalizeStoredRow),
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
    el.syncStatus.dataset.state = kind;
    const textNode = el.syncStatus.querySelector(".connection-indicator__label");
    const label = kind === "online" ? "Online" : kind === "connecting" ? "Sync" : kind === "offline" ? "Offline" : "Local";
    if (textNode) {
      textNode.textContent = label;
    }
    el.syncStatus.setAttribute("title", `Status da conexão: ${label}`);
    el.syncStatus.setAttribute("aria-label", `Status da conexão: ${label}`);
  }
}

function hydrateThemeControls() {
  if (el.backendInput) {
    el.backendInput.value = getBackendBaseUrl();
  }
  if (el.themeToggle) {
    const label = state.theme === "dark" ? "Modo claro" : "Modo escuro";
    el.themeToggle.setAttribute("aria-label", label);
    el.themeToggle.dataset.theme = state.theme;
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
  const showAccount = Boolean(state.accountPanelOpen || currentUser);
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
  if (el.uploadButton) {
    el.uploadButton.disabled = backendConfigured && !isAdmin;
    el.uploadButton.hidden = backendConfigured && !isAdmin;
  }
  if (el.fileSelectButton) {
    el.fileSelectButton.disabled = backendConfigured && !isAdmin;
    el.fileSelectButton.hidden = backendConfigured && !isAdmin;
  }
  if (el.backendSync) el.backendSync.disabled = backendConfigured && !isAdmin;
  if (el.deleteActiveButton) el.deleteActiveButton.disabled = el.deleteActiveButton.disabled || (backendConfigured && !isAdmin);
  if (el.usersCard) el.usersCard.hidden = currentUser?.role !== "admin";
  if (el.settingsCard) el.settingsCard.hidden = !(currentUser?.role === "admin" && showAccount);
  if (el.accountCard) el.accountCard.hidden = !showAccount;
  if (el.accountToggle) {
    el.accountToggle.dataset.state = currentUser?.role || (backendConfigured ? "required" : "local");
    el.accountToggle.classList.toggle("is-active", showAccount);
  }
  if (el.accountMenu) {
    const settingsButton = el.accountMenu.querySelector('[data-account-page="settings"]');
    if (settingsButton) settingsButton.hidden = backendConfigured && !isAdmin;
  }
  renderUsers();
  renderFileDeleteMenu();
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
  const active = getSelectedDeleteDataset();
  if (!active || active.id === EMPTY_DATASET_ID) {
    showToast("Selecione um arquivo antes de excluir.", "warn", 5000);
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
  const nextActive =
    state.activeDatasetId === active.id ? library.datasets[index] || library.datasets[index - 1] || buildEmptyDataset() : getActiveDataset();
  library.activeDatasetId = nextActive.id;
  state.activeDatasetId = nextActive.id;
  state.deleteDatasetId = "";
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
    if (!raw) return normalizeLoadedState({ ...STATE_DEFAULT });
    return normalizeLoadedState({ ...STATE_DEFAULT, ...JSON.parse(raw) });
  } catch {
    return normalizeLoadedState({ ...STATE_DEFAULT });
  }
}

function normalizeLoadedState(loadedState) {
  const monthlyGoal = Number(loadedState.metaMensal || loadedState.pnrGoalLimit || DEFAULT_PNR_GOAL_LIMIT);
  loadedState.metaMensal = monthlyGoal > 0 ? monthlyGoal : DEFAULT_PNR_GOAL_LIMIT;
  loadedState.pnrGoalLimit = loadedState.metaMensal;
  loadedState.metaAnual = Number(loadedState.metaAnual || 0);
  loadedState.metaAnualEditada = Boolean(loadedState.metaAnualEditada && loadedState.metaAnual > 0);
  return loadedState;
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
    rows: dataset.rows.map(normalizeStoredRow),
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

function getActiveDataset() {
  if (!library || !Array.isArray(library.datasets) || !library.datasets.length) {
    return buildEmptyDataset();
  }

  const found = library.datasets.find((dataset) => dataset.id === state.activeDatasetId);
  return found || library.datasets[0] || buildEmptyDataset();
}

function syncActiveDataset() {
  activeDataset = getActiveDataset();
  state.period = normalizePeriodMode(state.period);
  const scope = buildActiveDatasetScope(activeDataset);
  allRows = scope.rows;
  fileMeta = {
    ...activeDataset,
    rows: allRows,
    label: scope.label,
    scopedDatasets: scope.datasets,
  };
  library.activeDatasetId = activeDataset.id;
  if (state.activeDatasetId !== activeDataset.id) {
    state.activeDatasetId = activeDataset.id;
  }
}

function normalizePeriodMode(value) {
  return value === "q1" || value === "q2" ? value : "month";
}

function buildActiveDatasetScope(referenceDataset) {
  const reference = referenceDataset || buildEmptyDataset();
  if (!reference.rows?.length || reference.id === EMPTY_DATASET_ID) {
    return { rows: reference.rows ? reference.rows.slice() : [], datasets: [reference], label: reference.label || "Sem dados" };
  }
  const referencePeriod = getDatasetPeriod(reference);
  const monthKey = state.monthFilter || referencePeriod.key;
  const year = String(referencePeriod.key).slice(0, 4);
  const monthDatasets = monthKey === "all" ? getDatasetsForYear(year) : getDatasetsForMonth(monthKey);
  const periodMode = normalizePeriodMode(state.period);
  const filteredDatasets =
    periodMode === "month" ? monthDatasets : monthDatasets.filter((dataset) => getDatasetQuarterMode(dataset) === periodMode);
  const selectedDatasets = filteredDatasets.length || periodMode !== "month" ? filteredDatasets : [reference];
  const rows = selectedDatasets.flatMap((dataset) => (Array.isArray(dataset.rows) ? dataset.rows : []));
  const selectedPeriod = monthKey === "all" ? null : getAvailableMonthOptions().find((month) => month.key === monthKey);
  return {
    rows,
    datasets: selectedDatasets,
    label:
      monthKey === "all"
        ? `${year} · todos os meses${periodMode === "month" ? "" : ` · ${getPeriodModeLabel(periodMode)}`}`
        : `${selectedPeriod?.label || referencePeriod.monthLabel}${periodMode === "month" ? " · mês completo" : ` · ${getPeriodModeLabel(periodMode)}`}`,
  };
}

function getDatasetsForMonth(monthKey) {
  return library.datasets
    .filter((dataset) => dataset && dataset.id !== EMPTY_DATASET_ID && Array.isArray(dataset.rows) && dataset.rows.length)
    .filter((dataset) => getDatasetPeriod(dataset).key === monthKey)
    .sort((a, b) => {
      const qa = getDatasetQuarterOrder(a);
      const qb = getDatasetQuarterOrder(b);
      return qa - qb || String(a.label || "").localeCompare(String(b.label || ""), "pt-BR");
    });
}

function getDatasetsForYear(year) {
  return library.datasets
    .filter((dataset) => dataset && dataset.id !== EMPTY_DATASET_ID && Array.isArray(dataset.rows) && dataset.rows.length)
    .filter((dataset) => String(getDatasetPeriod(dataset).key).startsWith(`${year}-`))
    .sort((a, b) => {
      const pa = getDatasetPeriod(a);
      const pb = getDatasetPeriod(b);
      return pa.sort - pb.sort || getDatasetQuarterOrder(a) - getDatasetQuarterOrder(b) || String(a.label || "").localeCompare(String(b.label || ""), "pt-BR");
    });
}

function getDatasetQuarterMode(dataset) {
  const text = `${dataset?.label || ""} ${dataset?.fileName || ""}`;
  const labelQuarter = detectQuinzena(text);
  if (labelQuarter.includes("1")) return "q1";
  if (labelQuarter.includes("2")) return "q2";
  const rows = Array.isArray(dataset?.rows) ? dataset.rows : [];
  const days = rows
    .map((row) => {
      const date = row.data_normalizada ? new Date(`${row.data_normalizada}T00:00:00Z`) : row.data_sort ? new Date(row.data_sort) : null;
      return date && !Number.isNaN(date.getTime()) ? date.getUTCDate() : null;
    })
    .filter((day) => day != null);
  if (!days.length) return "month";
  const averageDay = days.reduce((acc, day) => acc + day, 0) / days.length;
  return averageDay <= 15 ? "q1" : "q2";
}

function getDatasetQuarterOrder(dataset) {
  const mode = getDatasetQuarterMode(dataset);
  return mode === "q1" ? 1 : mode === "q2" ? 2 : 3;
}

function getPeriodModeLabel(mode) {
  if (mode === "q1") return "1ª quinzena";
  if (mode === "q2") return "2ª quinzena";
  return "Mês completo";
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






















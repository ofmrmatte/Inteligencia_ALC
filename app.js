/* global XLSX */

const STORAGE_KEY = "alc-pre-fatura-dashboard-state-v1";
const THEME_STORAGE_KEY = "alc-pre-fatura-dashboard-theme-v1";
const EVOLUTION_PERIOD_VIEW_STORAGE_KEY = "evolutionPeriodView";
const COMPARISON_PERIOD_VIEW_STORAGE_KEY = "comparisonPeriodView";
const PDF_LOGO_IMAGE = {
  name: "ImLogo",
  width: 1080,
  height: 1080,
  src: "assets/logo-alc.jpeg",
  base64: "",
};
const DEBUG_AUTH_FLOW = false;
const EMPTY_DATASET_ID = "__empty";
const PRE_FATURA_VIEW = "Pré-Fatura";
const MONTHLY_BASE_VIEW = "Evolução mensal";
const PACKAGE_MANAGEMENT_VIEW = "Gestão de Pacotes";
const DEVIATION_MANAGEMENT_VIEW = "Gestão de Desvios";
const PRE_FATURA_FILE_CATEGORY = "PRE_FATURA";
const PACKAGE_MANAGEMENT_FILE_CATEGORY = "GESTAO_PACOTES";
const DEVIATION_PNR_FILE_CATEGORY = "DESVIOS_PNR";
const DEVIATION_CATEGORY_PNRS = "PNRS";
const DEVIATION_CATEGORIES = [
  { key: "SAFETY_OCORRENCIAS", label: "Safety - Ocorrências", enabled: false },
  { key: "SAFETY_MULTAS", label: "Safety - Multas", enabled: false },
  { key: "SAFETY_TELEMETRIA_MM", label: "Safety - Telemetria MM", enabled: false },
  { key: "SAFETY_BRIEFING", label: "Safety - Briefing", enabled: false },
  { key: "SAFETY_RELATOS", label: "Safety - Relatos", enabled: false },
  { key: DEVIATION_CATEGORY_PNRS, label: "PNRs", enabled: true },
  { key: "JURIDICO", label: "Jurídico", enabled: false },
];
const PNR_STANDARD_HEADERS = [
  "ID DO CASO",
  "DATA DO CASO",
  "STATUS",
  "PERÍODO DE FATURAMENTO",
  "DATA DO PEDIDO DE REVISÃO",
  "PEDIDO DE REVISÃO",
  "DATA DE ENCERRAMENTO DO CASO",
  "REP - ASSISTENTE",
  "COMENTÁRIO DE ENCERRAMENTO",
  "N° DA PRÉ-FATURA",
  "ID DE ENVIO",
  "PRODUTOS",
  "VALOR DA COMPRA",
  "REP TRANSPORTADORA",
  "ESTAÇÃO DE ORIGEM",
  "ID DA ROTA",
  "ID DO MOTORISTA",
  "DATA DE ENTREGA",
  "ID DA RECLAMAÇÃO",
  "MÊS",
  "QUINZENA REF.",
  "VAL. COMPRA",
];
const PNR_CALCULATED_HEADERS = ["MÊS", "QUINZENA REF.", "VAL. COMPRA"];
const PNR_GOAL_SETTINGS_KEY = "pnr_goal";
const DEFAULT_PNR_GOAL_SETTINGS = {
  monthly_goal: 40000,
  annual_goal: 160000,
  currency: "BRL",
  goal_type: "loss_limit",
};
const DEFAULT_PNR_GOAL_LIMIT = DEFAULT_PNR_GOAL_SETTINGS.monthly_goal;
const SUPABASE_QUERY_TIMEOUT_MS = 25000;
const STORAGE_DOWNLOAD_TIMEOUT_MS = 45000;
const XLSX_PROCESS_TIMEOUT_MS = 60000;
const PROCESSED_RECORDS_BATCH_SIZE = 500;
const PROCESSED_RECORDS_PAGE_SIZE = 1000;
let processedRecordsUnavailable = false;
let isExportingPackageExcel = false;
const SHEET_ORDER = ["SVC PERDIDOS", "XPT PERDIDOS", "PNR"];
const SHEET_TABS = [PRE_FATURA_VIEW, MONTHLY_BASE_VIEW, PACKAGE_MANAGEMENT_VIEW, DEVIATION_MANAGEMENT_VIEW];
const SHEET_DISPLAY_LABELS = {
  [PRE_FATURA_VIEW]: "Pré-Fatura",
  Todos: "Todos",
  "SVC PERDIDOS": "SVC Perdidos",
  "XPT PERDIDOS": "XPT Perdidos",
  PNR: "PNR",
  [MONTHLY_BASE_VIEW]: "Evolução mensal",
  [PACKAGE_MANAGEMENT_VIEW]: "Gestão de Pacotes",
  [DEVIATION_MANAGEMENT_VIEW]: "Gestão de Desvios",
};
const PACKAGE_CATEGORY_LABELS = {
  ALC: "ALC",
  DRIVER: "Driver",
  DISPATCHER: "Dispatcher",
  MERCADO_LIVRE: "Mercado Livre",
  INDEFINIDO: "Indefinido",
};
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
const PREFATURA_TYPE_TO_DIVISION = {
  SVC: "SVC PERDIDOS",
  XPT: "XPT PERDIDOS",
  PNR: "PNR",
};
const PREFATURA_DIVISION_TO_TYPE = {
  "SVC PERDIDOS": "SVC",
  "XPT PERDIDOS": "XPT",
  PNR: "PNR",
};
const MAIN_TYPE_OPTIONS = ["SVC", "XPT", "PNR"];
const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const MONTH_ABBR = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
const SETOR_OPTIONS = ["LOSS", "Operação", "Administrativo", "Financeiro", "Qualidade", "Monitoramento", "Suporte", "Desenvolvimento T.I", "Outros"];

const STATE_DEFAULT = {
  query: "",
  sheet: PRE_FATURA_VIEW,
  tipo: "Todos",
  prefaturaTipo: "Todos",
  packageTipo: "Todos",
  prefaturaMonths: [],
  packageMonths: [],
  prefaturaPeriod: "month",
  packagePeriod: "month",
  activeDesvioCategory: null,
  pnrQuery: "",
  pnrMonths: [],
  pnrQuinzena: "all",
  pnrStatus: "Todos",
  pnrTipoOperacional: "Todos",
  pnrEstacao: "Todos",
  base: "Todos",
  motorista: "Todos",
  period: "month",
  sortKey: "valor_numerico",
  sortDir: "desc",
  page: 1,
  pageSize: 15,
  fileName: "",
  activeDatasetId: EMPTY_DATASET_ID,
  monthFilter: "",
  appView: "dashboard",
  theme: "dark",
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

const state = loadState();
const forcedTheme = new URLSearchParams(window.location.search).get("theme");
state.theme = forcedTheme === "light" || forcedTheme === "dark" ? forcedTheme : state.theme === "light" ? "light" : "dark";
state.period = normalizePeriodMode(state.period);
state.prefaturaPeriod = normalizePeriodMode(state.prefaturaPeriod || state.period);
state.packagePeriod = normalizePeriodMode(state.packagePeriod || "month");
let library = loadLibrary();
let activeDataset = getActiveDataset();
let allRows = activeDataset.rows.slice();
let packageManagementRows = [];
let pnrRows = [];
let fileMeta = activeDataset;
let workbookEnginePromise = null;
let excelExportEnginePromise = null;
let currentUser = null;
let currentProfile = null;
let knownUsers = [];
let auditLogs = [];
let dashboardFileRecords = [];
let currentActiveFile = null;
let dashboardFilesLoading = false;
let dashboardVisualState = "loading-session";
let hasInitialLoadCompleted = false;
let isLoadingDashboardData = false;
let isRefreshingFilesList = false;
let dashboardPermissionTimer = null;
let liveClockTimer = null;
let accountMenuCloseTimer = null;
let comparisonTooltipHideTimer = null;
let searchDebounceTimer = null;
let activeComparisonTooltipColumn = null;
let evolutionTooltipHideTimer = null;
let activeEvolutionTooltipBar = null;
let packageMixTooltipHideTimer = null;
let activePackageMixSegment = null;
let donutTooltipHideTimer = null;
let isDeviationCategoryMenuOpen = false;
let activeDropdownPortalKind = "";
let chartViewportObserver = null;
let chartAnimationFrame = 0;
let chartAnimationToken = 0;
let evolutionScrollObservers = [];
let pdfLogoLoadPromise = null;
let supabaseAuthListenerBound = false;
let pendingAvatarFile = null;
let pendingAvatarPreviewUrl = "";
let pendingAvatarSourceUrl = "";
let evolutionPeriodView = loadEvolutionPeriodView();
let comparisonPeriodView = loadComparisonPeriodView();
let settingsFilesTab = PRE_FATURA_FILE_CATEGORY;
const selectedSettingsFileIds = new Set();
let totalDiscountComparisonRequest = 0;
let globalGoalSettings = getDefaultGoalSettings();
let packageManagementRowsLoadedKey = "";
let pnrRowsLoadedKey = "";
let pnrDriverEnrichmentKey = "";
let isLoadingPnrRows = false;
const derivedDataCache = {
  prefaturaKey: "",
  prefaturaRows: [],
  packageKey: "",
  packageRows: [],
  pnrKey: "",
  pnrRows: [],
  packageMonthOptionsKey: "",
  packageMonthOptions: [],
  pnrMonthOptionsKey: "",
  pnrMonthOptions: [],
};
const prefaturaMatchIndexCache = new WeakMap();
const prefaturaDriverIndexCache = new WeakMap();

function resetDerivedDataCache() {
  derivedDataCache.prefaturaKey = "";
  derivedDataCache.prefaturaRows = [];
  derivedDataCache.packageKey = "";
  derivedDataCache.packageRows = [];
  derivedDataCache.pnrKey = "";
  derivedDataCache.pnrRows = [];
  derivedDataCache.packageMonthOptionsKey = "";
  derivedDataCache.packageMonthOptions = [];
  derivedDataCache.pnrMonthOptionsKey = "";
  derivedDataCache.pnrMonthOptions = [];
  pnrDriverEnrichmentKey = "";
}

const DASHBOARD_STATE_CONFIG = {
  "loading-session": {
    state: "loading-session",
    title: "Carregando sessão",
    description: "Estamos verificando seu acesso ao painel.",
    loading: true,
  },
  "loading-files": {
    state: "loading-files",
    title: "Carregando arquivos salvos",
    description: "Buscando arquivos vinculados ao dashboard.",
    loading: true,
  },
  "processing-file": {
    state: "processing-file",
    title: "Processando arquivo",
    description: "Estamos lendo os dados e atualizando os indicadores.",
    loading: true,
  },
  "not-authenticated": {
    state: "not-authenticated",
    title: "Aguardando autenticação",
    description: "Faça login para carregar os arquivos salvos e visualizar os indicadores do painel.",
    action: "login",
    actionLabel: "Entrar na conta",
  },
  "no-active-file": {
    state: "no-active-file",
    title: "Nenhum arquivo ativo",
    description: "Nenhum arquivo foi encontrado. Faça upload de um arquivo para iniciar a análise.",
    action: "upload",
    actionLabel: "Enviar arquivo",
  },
  "no-filter-results": {
    state: "no-filter-results",
    title: "Nenhum registro encontrado",
    description: "Não há dados para o mês, período ou categoria selecionados.",
    action: "clear-filters",
    actionLabel: "Limpar filtros",
  },
  "supabase-error": {
    state: "supabase-error",
    title: "Erro ao carregar dados",
    description: "Não foi possível conectar ao Supabase. Verifique sua conexão ou tente novamente.",
    action: "retry",
    actionLabel: "Tentar novamente",
  },
  "permission-denied": {
    state: "permission-denied",
    title: "Acesso restrito",
    description: "Apenas administradores podem realizar esta ação.",
  },
};

const auditActionLabels = {
  login: "Login",
  logout: "Logout",
  upload_file: "Upload de arquivo",
  delete_file: "Exclusão de arquivo",
  set_active_file: "Alteração de arquivo ativo",
  generate_report: "Geração de relatório",
  update_profile: "Alteração de perfil",
  update_user_setor: "Alteração de setor",
  update_user_admin: "Alteração de permissão admin",
  update_goal_settings: "Alteração da meta PNR/LOSS",
};

const el = {};

async function bootstrapDashboard() {
  cacheDom();
  startLiveClock();
  bindEvents();
  hydrateThemeControls();
  hydrateControls();
  applyTheme(state.theme);
  if (!allRows.length) {
    showToast("Nenhum arquivo carregado. Faça upload de um arquivo para iniciar.", "info", 5200);
  }
  renderAll();
  updateTopbar();
  updateAccessControls();
  markDashboardReady();
  bindSupabaseAuthState();
  void loadCurrentSession();
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
  el.uploadButton = document.getElementById("upload-button");
  el.refreshButton = document.getElementById("refresh-button");
  el.themeToggle = document.getElementById("theme-toggle");
  el.accountToggle = document.getElementById("account-toggle");
  el.fileInput = document.getElementById("file-input");
  el.reportButton = document.getElementById("report-button");
  el.accountMenu = document.getElementById("account-menu");
  el.accountIdentity = document.getElementById("account-identity");
  el.datasetSelect = document.getElementById("dataset-select");
  el.datasetCount = document.getElementById("dataset-count");
  el.datasetNote = document.getElementById("dataset-note");
  el.accountCard = document.getElementById("account-card");
  el.settingsPageSize = document.getElementById("settings-page-size");
  el.settingsPnrGoal = document.getElementById("settings-pnr-goal");
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
  el.viewToolbar = document.querySelector(".view-toolbar");
  el.sheetTabs = document.getElementById("sheet-tabs");
  el.monthlyBaseView = document.getElementById("monthly-base-view");
  el.deviationManagementView = document.getElementById("deviation-management-view");
  el.insightGrid = document.querySelector(".insight-grid");
  el.comparisonPanel = document.querySelector(".comparison-panel");
  el.tablePanel = document.querySelector(".table-panel");
  el.comparisonViewControl = document.getElementById("comparison-view-control");
  el.profileView = document.getElementById("profile-view");
  el.settingsView = document.getElementById("settings-view");
  el.settingsUsersList = document.getElementById("settings-users-list");
  el.settingsAuditList = document.getElementById("settings-audit-list");
  el.settingsFilesSection = document.getElementById("settings-files-section");
  el.settingsFilesTabs = document.getElementById("settings-files-tabs");
  el.settingsFilesList = document.getElementById("settings-files-list");
  el.settingsFilesDelete = document.getElementById("settings-files-delete");
  el.profileAvatar = document.getElementById("profile-avatar");
  el.profileAvatarFile = document.getElementById("profile-avatar-file");
  el.profileCropPanel = document.getElementById("profile-crop-panel");
  el.profileCropImage = document.getElementById("profile-crop-image");
  el.profileCropZoom = document.getElementById("profile-crop-zoom");
  el.profileCropX = document.getElementById("profile-crop-x");
  el.profileCropY = document.getElementById("profile-crop-y");
  el.profileCropApply = document.getElementById("profile-crop-apply");
  el.profileCropCancel = document.getElementById("profile-crop-cancel");
  el.profileHeading = document.getElementById("profile-heading");
  el.profileSummary = document.getElementById("profile-summary");
  el.profileAccessBadge = document.getElementById("profile-access-badge");
  el.profileCreatedAt = document.getElementById("profile-created-at");
  el.profileName = document.getElementById("profile-name");
  el.profileRoleTitle = document.getElementById("profile-role-title");
  el.profileSector = document.getElementById("profile-sector");
  el.profileAccessType = document.getElementById("profile-access-type");
  el.profileEmail = document.getElementById("profile-email");
  el.profilePassword = document.getElementById("profile-password");
  el.profilePasswordConfirm = document.getElementById("profile-password-confirm");
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
  el.tableHead = document.querySelector("table thead");
  el.tableTitle = document.querySelector(".table-panel__header h2");
  el.tableDescription = document.querySelector(".table-panel__header p");
  el.tableActions = document.querySelector(".table-actions");
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
  el.searchToggle = document.getElementById("search-toggle");
  el.searchFilter = document.getElementById("top-search-filter");
  el.monthSelect = document.getElementById("month-select");
  el.periodSelect = document.getElementById("period-select");
  el.monthFilter = document.getElementById("month-filter");
  el.monthFilterToggle = document.getElementById("month-filter-toggle");
  el.monthFilterLabel = document.getElementById("month-filter-label");
  el.monthFilterMenu = document.getElementById("month-filter-menu");
  el.periodFilter = document.getElementById("period-filter");
  el.periodFilterToggle = document.getElementById("period-filter-toggle");
  el.periodFilterLabel = document.getElementById("period-filter-label");
  el.periodFilterMenu = document.getElementById("period-filter-menu");
  el.typeFilter = document.getElementById("type-filter");
  el.typeFilterToggle = document.getElementById("type-filter-toggle");
  el.typeFilterLabel = document.getElementById("type-filter-label");
  el.typeFilterMenu = document.getElementById("type-filter-menu");
  el.typeFilterOptions = Array.from(document.querySelectorAll("[data-type-option]"));
  el.packageTypeFilter = el.typeFilter;
  el.packageTypeToggle = el.typeFilterToggle;
  el.packageTypeLabel = el.typeFilterLabel;
  el.packageTypeMenu = el.typeFilterMenu;
  el.packageTypeOptions = el.typeFilterOptions;
  el.pageSize = document.getElementById("page-size");
  el.sortHigh = document.getElementById("sort-high");
  el.sortLow = document.getElementById("sort-low");
}

function startLiveClock() {
  updateLiveClock();
  window.clearInterval(liveClockTimer);
  liveClockTimer = window.setInterval(updateLiveClock, 60000);
}

function formatCurrentDateTime(date = new Date()) {
  const data = date.toLocaleDateString("pt-BR");
  const hora = date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${data} · ${hora}`;
}

function updateLiveClock() {
  if (!el.lastUpdate) return;
  el.lastUpdate.textContent = formatCurrentDateTime(new Date());
}

function bindEvents() {
  if (el.uploadButton) {
    el.uploadButton.addEventListener("click", () => {
      if (!ensureUploadPermission()) {
        return;
      }
      el.fileInput.click();
    });
  }
  if (el.refreshButton) {
    el.refreshButton.addEventListener("click", async () => {
      await loadCurrentSession({ forceReload: true, showLoading: true });
      showToast("Painel atualizado.", "info", 3200);
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
    el.accountToggle.addEventListener("click", (event) => {
      event.stopPropagation();
      setAccountMenuOpen(!state.accountPanelOpen);
    });
    el.accountToggle.addEventListener("mouseenter", clearAccountMenuCloseTimer);
  }
  if (el.accountMenu) {
    el.accountMenu.addEventListener("mouseenter", clearAccountMenuCloseTimer);
    el.accountMenu.addEventListener("click", (event) => {
      const button = event.target.closest("[data-account-page]");
      if (!button) return;
      openAccountPage(button.dataset.accountPage);
    });
  }
  document.addEventListener("click", (event) => {
    if (!state.accountPanelOpen) return;
    if (event.target.closest("#account-toggle") || event.target.closest("#account-menu")) return;
    setAccountMenuOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !state.accountPanelOpen) return;
    setAccountMenuOpen(false);
    el.accountToggle?.focus();
  });
  window.addEventListener("resize", positionAccountMenu);
  window.addEventListener("scroll", positionAccountMenu, true);
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-account-home]");
    if (!button) return;
    state.appView = "dashboard";
    state.accountPanelOpen = false;
    persistState();
    renderAll();
    updateAccessControls();
  });
  document.addEventListener("click", (event) => {
    const action = event.target.closest("[data-empty-action]");
    if (!action) return;
    if (action.dataset.emptyAction === "login") {
      setAccountMenuOpen(true);
      window.setTimeout(() => el.authEmail?.focus(), 80);
    }
    if (action.dataset.emptyAction === "upload") {
      if (ensureUploadPermission()) el.fileInput?.click();
    }
    if (action.dataset.emptyAction === "clear-filters") {
      resetDashboardFilters();
    }
    if (action.dataset.emptyAction === "retry") {
      void retryDashboardLoad();
    }
  });
  if (el.profileSave) {
    el.profileSave.addEventListener("click", async () => {
      await saveProfile();
    });
  }
  if (el.profileAvatarFile) {
    el.profileAvatarFile.addEventListener("change", (event) => {
      handleAvatarSelection(event);
    });
  }
  [el.profileCropZoom, el.profileCropX, el.profileCropY].forEach((control) => {
    if (!control) return;
    control.addEventListener("input", updateAvatarCropPreview);
  });
  if (el.profileCropCancel) {
    el.profileCropCancel.addEventListener("click", cancelAvatarCrop);
  }
  if (el.profileCropApply) {
    el.profileCropApply.addEventListener("click", applyAvatarCrop);
  }
  if (el.settingsUsersList) {
    el.settingsUsersList.addEventListener("click", async (event) => {
      const button = event.target.closest("button[data-user-id][data-role]");
      if (!button) return;
      await updateUserRole(button.dataset.userId, button.dataset.role);
    });
    el.settingsUsersList.addEventListener("change", async (event) => {
      const field = event.target.closest("[data-user-field]");
      if (!field) return;
      await updateUserProfileField(field.dataset.userId, field.dataset.userField, field.value);
    });
  }
  if (el.reportButton) {
    el.reportButton.addEventListener("click", () => {
      if (!ensureReportPermission()) {
        return;
      }
      void downloadMonthlyReport();
    });
  }
  document.addEventListener("keydown", handleEscapeFilter);
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
    el.settingsPnrGoal.addEventListener("change", async (event) => {
      const value = parseCurrencyInput(event.target.value);
      await savePnrGoalByMode("monthly", value > 0 ? value : getMonthlyPnrGoalLimit());
    });
  }
  if (el.authLogin) {
    el.authLogin.addEventListener("click", async (event) => {
      await loginUser(event);
    });
  }
  if (el.authSignup) {
    el.authSignup.addEventListener("click", async (event) => {
      event.preventDefault();
      await signupUser();
    });
  }
  if (el.authLogout) {
    el.authLogout.addEventListener("click", async (event) => {
      event.preventDefault();
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
  if (el.settingsFilesTabs) {
    el.settingsFilesTabs.addEventListener("click", (event) => {
      const button = event.target.closest("[data-settings-files-tab]");
      if (!button) return;
      settingsFilesTab = isDashboardFileCategory(button.dataset.settingsFilesTab) ? button.dataset.settingsFilesTab : PRE_FATURA_FILE_CATEGORY;
      selectedSettingsFileIds.clear();
      renderSettingsFileManagement();
    });
  }
  if (el.settingsFilesList) {
    el.settingsFilesList.addEventListener("change", (event) => {
      const selectAll = event.target.closest("[data-settings-file-select-all]");
      if (selectAll) {
        const files = getSettingsFilesForActiveTab();
        selectedSettingsFileIds.clear();
        if (selectAll.checked) files.forEach((file) => selectedSettingsFileIds.add(file.id));
        renderSettingsFileManagement();
        return;
      }
      const input = event.target.closest("[data-settings-file-id]");
      if (!input) return;
      if (input.checked) selectedSettingsFileIds.add(input.value);
      else selectedSettingsFileIds.delete(input.value);
      renderSettingsFileManagement();
    });
  }
  if (el.settingsFilesDelete) {
    el.settingsFilesDelete.addEventListener("click", async () => {
      await deleteSelectedSettingsFiles();
    });
  }
  el.fileInput.addEventListener("change", handleUpload);
  if (el.datasetSelect) el.datasetSelect.addEventListener("change", async (event) => {
    await handleDatasetSelection(event.target.value);
  });

  if (el.clearFilters) {
    el.clearFilters.addEventListener("click", () => {
      resetDashboardFilters();
    });
  }

  if (el.searchToggle) {
    el.searchToggle.addEventListener("click", () => {
      setSearchExpanded(!el.searchFilter?.classList.contains("is-expanded"), { focus: true });
    });
  }
  if (el.searchInput) {
    el.searchInput.addEventListener("input", (event) => {
      state.query = event.target.value;
      state.page = 1;
      persistState();
      setSearchExpanded(Boolean(state.query), { focus: false });
      scheduleSearchRender();
    });
  }

  if (el.periodSelect) {
    el.periodSelect.addEventListener("change", async (event) => {
      state.period = normalizePeriodMode(event.target.value);
      state.page = 1;
      persistState();
      if (state.sheet === PACKAGE_MANAGEMENT_VIEW) {
        hydrateControls();
        renderAll();
        return;
      }
      if (applyDashboardScopeFromLoadedDatasets()) {
        hydrateControls();
        renderAll();
        return;
      }
      hydrateControls();
      renderAll();
    });
  }
  if (el.monthFilterToggle) {
    el.monthFilterToggle.addEventListener("click", (event) => {
      event.preventDefault();
      toggleCustomFilterMenu("month");
    });
  }
  if (el.periodFilterToggle) {
    el.periodFilterToggle.addEventListener("click", (event) => {
      event.preventDefault();
      toggleCustomFilterMenu("period");
    });
  }
  if (el.monthFilterMenu) {
    el.monthFilterMenu.addEventListener("change", (event) => {
      const input = event.target.closest("[data-month-option]");
      if (input) applyMonthOptionChange(input);
    });
  }
  if (el.periodFilterMenu) {
    el.periodFilterMenu.addEventListener("click", (event) => {
      const button = event.target.closest("[data-period-option]");
      if (button) applyPeriodOptionChange(button.dataset.periodOption);
    });
  }
  if (el.monthSelect) {
    el.monthSelect.addEventListener("change", async (event) => {
      state.monthFilter = event.target.value;
      state.page = 1;
      ensureCurrentPeriodIsAvailable();
      persistState();
      if (state.sheet === PACKAGE_MANAGEMENT_VIEW) {
        hydrateControls();
        renderAll();
        return;
      }
      if (applyDashboardScopeFromLoadedDatasets()) {
        hydrateControls();
        renderAll();
        return;
      }
      hydrateControls();
      renderAll();
    });
  }
  if (el.packageTypeToggle) {
    el.packageTypeToggle.addEventListener("click", (event) => {
      event.preventDefault();
      togglePackageTypeMenu();
    });
  }
  if (el.packageTypeOptions?.length) {
    el.packageTypeOptions.forEach((input) => {
      input.addEventListener("change", (event) => {
        applyPackageTypeOptionChange(event.target);
      });
    });
    document.addEventListener("click", (event) => {
      if (
        event.target.closest("#type-filter") ||
        event.target.closest("#month-filter") ||
        event.target.closest("#period-filter") ||
        event.target.closest(".sheet-tab-wrapper--deviation") ||
        isDropdownPortalTarget(event.target)
      ) return;
      closePackageTypeMenu();
      closeCustomFilterMenu("month");
      closeCustomFilterMenu("period");
      closeDeviationCategoryMenu({ render: true });
    });
  }

  if (el.sortHigh) {
    el.sortHigh.addEventListener("click", () => setValueSort("desc"));
  }
  if (el.sortLow) {
    el.sortLow.addEventListener("click", () => setValueSort("asc"));
  }
  document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-package-export-excel]");
    if (!button) return;
    event.preventDefault();
    await exportPackageManagementExcel(button);
  });
  document.addEventListener("input", (event) => {
    const input = event.target.closest("[data-pnr-query]");
    if (!input) return;
    window.clearTimeout(searchDebounceTimer);
    searchDebounceTimer = window.setTimeout(() => {
      state.pnrQuery = input.value || "";
      state.page = 1;
      resetDerivedDataCache();
      persistState();
      renderAll();
    }, 300);
  });
  document.addEventListener("change", (event) => {
    const field = event.target.closest("[data-pnr-filter]");
    if (!field) return;
    const name = field.dataset.pnrFilter;
    if (name === "pageSize") {
      state.pageSize = Number(field.value) || 15;
    } else if (name === "month") {
      state.pnrMonths = field.value === "Todos" ? [] : [field.value];
    } else if (name === "quinzena") {
      state.pnrQuinzena = field.value || "all";
    } else if (name === "status") {
      state.pnrStatus = normalizePnrSelectValue(field.value);
    } else if (name === "tipo") {
      state.pnrTipoOperacional = normalizePnrSelectValue(field.value);
    } else if (name === "estacao") {
      state.pnrEstacao = normalizePnrSelectValue(field.value);
    }
    state.page = 1;
    resetDerivedDataCache();
    persistState();
    renderAll();
  });
  document.addEventListener("click", (event) => {
    const clear = event.target.closest("[data-pnr-clear]");
    if (clear) {
      state.pnrQuery = "";
      state.pnrMonths = [];
      state.pnrQuinzena = "all";
      state.pnrStatus = "Todos";
      state.pnrTipoOperacional = "Todos";
      state.pnrEstacao = "Todos";
      state.page = 1;
      resetDerivedDataCache();
      persistState();
      renderAll();
      return;
    }
    const pageButton = event.target.closest("[data-pnr-page]");
    if (pageButton) {
      const totalRows = sortPnrRows(getFilteredPnrRows()).length;
      const totalPages = Math.max(1, Math.ceil(totalRows / state.pageSize));
      state.page = pageButton.dataset.pnrPage === "next"
        ? Math.min(totalPages, state.page + 1)
        : Math.max(1, state.page - 1);
      persistState();
      renderAll();
      return;
    }
    const sortHeader = event.target.closest("[data-pnr-sort]");
    if (sortHeader) {
      const sortKey = sortHeader.dataset.pnrSort;
      if (state.sortKey === sortKey) {
        state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
      } else {
        state.sortKey = sortKey;
        state.sortDir = sortKey === "valorCompraNumerico" || sortKey === "dataCaso" ? "desc" : "asc";
      }
      persistState();
      renderAll();
    }
  });
  document.addEventListener("pointerover", (event) => {
    const target = event.target.closest(".pnr-tooltip-target");
    if (!target) return;
    showPnrTooltip(target, event);
  });
  document.addEventListener("pointermove", (event) => {
    const target = event.target.closest(".pnr-tooltip-target");
    if (!target) return;
    positionPnrTooltip(event);
  });
  document.addEventListener("pointerout", (event) => {
    const target = event.target.closest(".pnr-tooltip-target");
    if (!target || (event.relatedTarget && target.contains(event.relatedTarget))) return;
    hidePnrTooltip();
  });

  el.pageSize.addEventListener("change", (event) => {
    state.pageSize = Number(event.target.value) || 15;
    state.page = 1;
    if (el.settingsPageSize) el.settingsPageSize.value = String(state.pageSize);
    persistState();
    renderCurrentTablePageOnly();
  });

  el.prevPage.addEventListener("click", () => {
    state.page = Math.max(1, state.page - 1);
    persistState();
    renderCurrentTablePageOnly();
  });

  el.nextPage.addEventListener("click", () => {
    const totalRows = state.sheet === PACKAGE_MANAGEMENT_VIEW ? getPackageManagementRowsForView().length : getFilteredRows().length;
    const totalPages = Math.max(1, Math.ceil(totalRows / state.pageSize));
    state.page = Math.min(totalPages, state.page + 1);
    persistState();
    renderCurrentTablePageOnly();
  });

  el.sheetTabs.addEventListener("click", (event) => {
    const deviationCategory = event.target.closest("[data-deviation-category]");
    if (deviationCategory) {
      event.preventDefault();
      handleDeviationCategorySelection(deviationCategory.dataset.deviationCategory);
      return;
    }

    const deviationToggle = event.target.closest("[data-deviation-toggle]");
    if (deviationToggle) {
      event.preventDefault();
      toggleDeviationCategoryMenu();
      return;
    }

    const button = event.target.closest("button[data-sheet]");
    if (!button) return;
    const previousCategory = getCurrentFileCategory();
    closeTopFilterOverlays();
    clearTransientDashboardStateForNavigation();
    state.appView = "dashboard";
    state.sheet = button.dataset.sheet;
    state.page = 1;
    persistState();
    hydrateControls();
    renderAll();
    if (state.sheet === DEVIATION_MANAGEMENT_VIEW) {
      return;
    }
    if (getCurrentFileCategory() !== previousCategory) {
      if (getCurrentFileCategory() === PACKAGE_MANAGEMENT_FILE_CATEGORY) {
        void ensurePackageManagementRowsLoaded(dashboardFileRecords).finally(() => {
          hydrateControls();
          renderAll();
        });
        return;
      }
      if (applyDashboardScopeFromLoadedDatasets()) {
        hydrateControls();
        renderAll();
      }
      return;
    }
  });

  document.addEventListener("click", (event) => {
    if (!isDeviationCategoryMenuOpen) return;
    if (event.target.closest(".sheet-tab-wrapper--deviation") || isDropdownPortalTarget(event.target)) return;
    closeDeviationCategoryMenu({ render: true });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (activeDropdownPortalKind) {
      const closingKind = activeDropdownPortalKind;
      if (closingKind === "deviation") closeDeviationCategoryMenu({ render: true });
      else closeDropdownPortal(closingKind, { focus: true });
      event.preventDefault();
      return;
    }
    if (!isDeviationCategoryMenuOpen) return;
    closeDeviationCategoryMenu({ render: true });
    el.sheetTabs?.querySelector("[data-deviation-toggle]")?.focus();
  });

  document.addEventListener("click", (event) => {
    const deviationCategory = event.target.closest("body > .deviation-category-menu [data-deviation-category]");
    if (!deviationCategory) return;
    event.preventDefault();
    handleDeviationCategorySelection(deviationCategory.dataset.deviationCategory);
  });

  window.addEventListener("resize", () => positionDropdownPortal());
  window.addEventListener("scroll", () => positionDropdownPortal(), true);

  el.baseBars.addEventListener("click", (event) => {
    const row = event.target.closest("[data-base]");
    if (!row) return;
    showToast(`Base em destaque: ${row.dataset.base}`, "info");
  });

  el.driverRank.addEventListener("click", (event) => {
    const row = event.target.closest("[data-driver]");
    if (!row) return;
    showToast(`Driver em destaque: ${row.dataset.driver}`, "info");
  });

  el.donutLegend.addEventListener("click", (event) => {
    const row = event.target.closest("[data-sheet]");
    if (!row) return;
    state.sheet = PRE_FATURA_VIEW;
    state.prefaturaTipo = getPrefaturaTypeForDivision(row.dataset.sheet);
    state.page = 1;
    hydrateControls();
    renderAll();
    showToast(`Tipo filtrado: ${state.prefaturaTipo}`, "info");
  });

  el.donutChart.addEventListener("click", (event) => {
    const segment = event.target.closest("[data-sheet]");
    if (!segment) return;
    state.sheet = PRE_FATURA_VIEW;
    state.prefaturaTipo = getPrefaturaTypeForDivision(segment.dataset.sheet);
    state.page = 1;
    hydrateControls();
    renderAll();
    showToast(`Tipo filtrado: ${state.prefaturaTipo}`, "info");
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

  if (el.kpiGrid) {
    el.kpiGrid.addEventListener("pointerover", (event) => {
      const segment = event.target.closest(".package-mix-card .mix-chart__segment");
      if (!segment) return;
      showPackageMixTooltip(segment, event);
    });

    el.kpiGrid.addEventListener("pointermove", (event) => {
      const segment = event.target.closest(".package-mix-card .mix-chart__segment");
      if (!segment) return;
      positionPackageMixTooltip(segment, event);
    });

    el.kpiGrid.addEventListener("pointerout", (event) => {
      if (!event.target.closest(".package-mix-card .mix-chart__segment")) return;
      hidePackageMixTooltip(event.target.closest(".package-mix-card .mix-chart__segment"));
    });
  }

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
    });

    el.monthlyComparison.addEventListener("pointerover", (event) => {
      const column = event.target.closest(".month-column");
      if (!column || !el.monthlyComparison.contains(column)) return;
      showComparisonTooltip(column);
      positionComparisonTooltip(event);
    });

    el.monthlyComparison.addEventListener("pointermove", (event) => {
      const column = event.target.closest(".month-column");
      if (!column || !el.monthlyComparison.contains(column)) return;
      showComparisonTooltip(column);
      positionComparisonTooltip(event);
    });

    el.monthlyComparison.addEventListener("pointerout", (event) => {
      const column = event.target.closest(".month-column");
      if (!column || (event.relatedTarget && column.contains(event.relatedTarget))) return;
      hideComparisonTooltip();
    });
  }

  if (el.comparisonViewControl) {
    el.comparisonViewControl.addEventListener("click", (event) => {
      const button = event.target.closest("[data-comparison-view]");
      if (!button) return;
      const nextView = button.dataset.comparisonView === "biweekly" ? "biweekly" : "monthly";
      if (nextView === comparisonPeriodView) return;
      hideComparisonTooltip();
      setComparisonPeriodView(nextView);
      renderMonthlyComparison();
      scheduleChartAnimations();
    });
  }

  if (el.monthlyBaseView) {
    el.monthlyBaseView.addEventListener("click", (event) => {
      const button = event.target.closest("[data-evolution-view]");
      if (!button) return;
      const nextView = button.dataset.evolutionView === "biweekly" ? "biweekly" : "monthly";
      if (nextView === evolutionPeriodView) return;
      hideEvolutionTooltip();
      setEvolutionPeriodView(nextView);
      renderMonthlyBaseEvolution();
      scheduleChartAnimations();
    });

    el.monthlyBaseView.addEventListener("pointerover", (event) => {
      const bar = event.target.closest(".tower-bar--horizontal");
      if (!bar || !el.monthlyBaseView.contains(bar)) return;
      showEvolutionTooltip(bar);
      positionEvolutionTooltip(event);
    });

    el.monthlyBaseView.addEventListener("pointermove", (event) => {
      const bar = event.target.closest(".tower-bar--horizontal");
      if (!bar || !el.monthlyBaseView.contains(bar)) return;
      showEvolutionTooltip(bar);
      positionEvolutionTooltip(event);
    });

    el.monthlyBaseView.addEventListener("pointerout", (event) => {
      const bar = event.target.closest(".tower-bar--horizontal");
      if (!bar || (event.relatedTarget && bar.contains(event.relatedTarget))) return;
      hideEvolutionTooltip();
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
    renderCurrentTablePageOnly();
  });
}

function getSheetDisplayLabel(sheet) {
  return SHEET_DISPLAY_LABELS[sheet] || String(sheet || "");
}

function getDropdownPortalConfig(kind) {
  if (kind === "type") {
    return {
      kind,
      trigger: el.typeFilterToggle,
      menu: el.typeFilterMenu,
      minWidth: 192,
      align: "right",
      focusTarget: el.typeFilterToggle,
    };
  }
  if (kind === "month") {
    return {
      kind,
      trigger: el.monthFilterToggle,
      menu: el.monthFilterMenu,
      minWidth: 192,
      align: "left",
      focusTarget: el.monthFilterToggle,
    };
  }
  if (kind === "period") {
    return {
      kind,
      trigger: el.periodFilterToggle,
      menu: el.periodFilterMenu,
      minWidth: 192,
      align: "left",
      focusTarget: el.periodFilterToggle,
    };
  }
  if (kind === "deviation") {
    const trigger = el.sheetTabs?.querySelector("[data-deviation-toggle]");
    return {
      kind,
      trigger,
      menu: document.querySelector(".deviation-category-menu"),
      minWidth: 280,
      align: "left",
      focusTarget: trigger,
    };
  }
  return null;
}

function isDropdownPortalTarget(target) {
  return Boolean(target?.closest?.("[data-dropdown-portal-menu], .type-filter__menu, .deviation-category-menu"));
}

function positionDropdownPortal(kind = activeDropdownPortalKind) {
  const config = getDropdownPortalConfig(kind);
  if (!config?.trigger || !config?.menu || config.menu.hidden) return;
  const { trigger, menu } = config;
  const rect = trigger.getBoundingClientRect();
  const viewportPadding = 8;
  const gap = 8;
  const minWidth = Math.max(Math.ceil(rect.width), config.minWidth || 0);

  menu.style.position = "fixed";
  menu.style.right = "auto";
  menu.style.bottom = "auto";
  menu.style.minWidth = `${minWidth}px`;
  menu.style.maxWidth = `calc(100vw - ${viewportPadding * 2}px)`;
  menu.style.maxHeight = `calc(100vh - ${viewportPadding * 2}px)`;
  menu.style.overflowY = "auto";
  menu.style.zIndex = "9999";

  const menuRect = menu.getBoundingClientRect();
  const menuWidth = Math.max(menuRect.width, minWidth);
  const menuHeight = menuRect.height;
  let left = config.align === "right" ? rect.right - menuWidth : rect.left;
  left = Math.min(Math.max(viewportPadding, left), Math.max(viewportPadding, window.innerWidth - menuWidth - viewportPadding));
  let top = rect.bottom + gap;
  if (top + menuHeight > window.innerHeight - viewportPadding && rect.top - menuHeight - gap >= viewportPadding) {
    top = rect.top - menuHeight - gap;
  }
  top = Math.min(Math.max(viewportPadding, top), Math.max(viewportPadding, window.innerHeight - Math.min(menuHeight, window.innerHeight - viewportPadding * 2) - viewportPadding));

  menu.style.left = `${Math.round(left)}px`;
  menu.style.top = `${Math.round(top)}px`;
}

function openDropdownPortal(kind) {
  const config = getDropdownPortalConfig(kind);
  if (!config?.trigger || !config?.menu) return false;
  closeDropdownPortal(activeDropdownPortalKind && activeDropdownPortalKind !== kind ? activeDropdownPortalKind : "", { focus: false });
  if (config.menu.parentElement !== document.body) document.body.appendChild(config.menu);
  config.menu.dataset.dropdownPortalMenu = kind;
  config.menu.hidden = false;
  config.trigger.setAttribute("aria-expanded", "true");
  activeDropdownPortalKind = kind;
  positionDropdownPortal(kind);
  return true;
}

function closeDropdownPortal(kind = activeDropdownPortalKind, options = {}) {
  if (!kind) return;
  const config = getDropdownPortalConfig(kind);
  if (config?.menu) {
    config.menu.hidden = true;
    config.menu.removeAttribute("data-dropdown-portal-menu");
    config.menu.style.left = "";
    config.menu.style.top = "";
    config.menu.style.right = "";
    config.menu.style.bottom = "";
    config.menu.style.minWidth = "";
    config.menu.style.maxWidth = "";
    config.menu.style.maxHeight = "";
    config.menu.style.overflowY = "";
    config.menu.style.zIndex = "";
  }
  config?.trigger?.setAttribute("aria-expanded", "false");
  if (activeDropdownPortalKind === kind) activeDropdownPortalKind = "";
  if (options.focus) config?.focusTarget?.focus?.();
}

function closeAllFloatingDropdowns(options = {}) {
  ["type", "month", "period", "deviation"].forEach((kind) => closeDropdownPortal(kind, options));
  isDeviationCategoryMenuOpen = false;
}

function removeDetachedDeviationMenus() {
  document.querySelectorAll("body > .deviation-category-menu").forEach((menu) => menu.remove());
  if (activeDropdownPortalKind === "deviation") activeDropdownPortalKind = "";
}

function getCurrentFileCategory(sheet = state.sheet) {
  if (sheet === DEVIATION_MANAGEMENT_VIEW) return DEVIATION_PNR_FILE_CATEGORY;
  return sheet === PACKAGE_MANAGEMENT_VIEW ? PACKAGE_MANAGEMENT_FILE_CATEGORY : PRE_FATURA_FILE_CATEGORY;
}

function normalizeMainTypeFilter(value) {
  return MAIN_TYPE_OPTIONS.includes(value) ? value : "Todos";
}

function normalizePackageTypeSelection(value) {
  const source = Array.isArray(value)
    ? value
    : String(value || "")
      .split(/[,+;|]/)
      .map((item) => item.replace(/\s*\+\s*/g, "+"))
      .flatMap((item) => item.split("+"));
  const requested = source
    .map((item) => String(item || "").trim().toUpperCase())
    .filter(Boolean);
  if (!requested.length || requested.includes("TODOS")) return MAIN_TYPE_OPTIONS.slice();
  const selected = MAIN_TYPE_OPTIONS.filter((type) => requested.includes(type));
  return selected.length ? selected : MAIN_TYPE_OPTIONS.slice();
}

function normalizeTypeSelection(value) {
  return normalizePackageTypeSelection(value);
}

function getPackageTypeSelection(value = state.packageTipo) {
  return normalizeTypeSelection(value);
}

function getPrefaturaTypeSelection(value = state.prefaturaTipo) {
  return normalizeTypeSelection(value);
}

function getTypeSelectionValues(value) {
  return normalizeTypeSelection(value);
}

function getPackageTypeSelectionValues(value = state.packageTipo) {
  return getTypeSelectionValues(value);
}

function getPrefaturaTypeSelectionValues(value = state.prefaturaTipo) {
  return getTypeSelectionValues(value);
}

function isPackageTypeSelectionAll(value = state.packageTipo) {
  return normalizeTypeSelection(value).length === MAIN_TYPE_OPTIONS.length;
}

function getTypeFilterLabel(value) {
  const selection = normalizeTypeSelection(value);
  if (selection.length === MAIN_TYPE_OPTIONS.length) return "Todos";
  return selection.join(" + ");
}

function getPackageTypeFilterLabel(value = state.packageTipo) {
  return getTypeFilterLabel(value);
}

function getActiveTypeFilter() {
  return state.sheet === PACKAGE_MANAGEMENT_VIEW ? getTypeFilterLabel(state.packageTipo) : getTypeFilterLabel(state.prefaturaTipo);
}

function setActiveTypeFilter(value) {
  if (state.sheet === PACKAGE_MANAGEMENT_VIEW) {
    state.packageTipo = normalizeTypeSelection(value);
  } else {
    state.prefaturaTipo = normalizeTypeSelection(value);
  }
}

function syncPackageTypeFilterControl() {
  if (!el.typeFilterToggle || !el.typeFilterLabel || !el.typeFilterOptions?.length) return;
  const activeValue = state.sheet === PACKAGE_MANAGEMENT_VIEW ? state.packageTipo : state.prefaturaTipo;
  const selection = normalizeTypeSelection(activeValue);
  const selectedValues = new Set(selection);
  const allSelected = selection.length === MAIN_TYPE_OPTIONS.length;
  el.typeFilterLabel.textContent = getTypeFilterLabel(selection);
  el.typeFilterToggle.setAttribute("aria-expanded", el.typeFilterMenu && !el.typeFilterMenu.hidden ? "true" : "false");
  el.typeFilterOptions.forEach((input) => {
    input.checked = input.value === "Todos" ? allSelected : (!allSelected && selectedValues.has(input.value));
  });
  if (activeDropdownPortalKind === "type") positionDropdownPortal("type");
}

function closePackageTypeMenu() {
  if (!el.typeFilterMenu || !el.typeFilterToggle) return;
  closeDropdownPortal("type");
}

function openPackageTypeMenu() {
  if (!el.typeFilterMenu || !el.typeFilterToggle) return;
  closeDeviationCategoryMenu({ render: true });
  closeCustomFilterMenu("month");
  closeCustomFilterMenu("period");
  syncPackageTypeFilterControl();
  openDropdownPortal("type");
}

function togglePackageTypeMenu() {
  if (!el.typeFilterMenu) return;
  if (el.typeFilterMenu.hidden) openPackageTypeMenu();
  else closePackageTypeMenu();
}

function getMonthLabelFromKey(key) {
  const [year, month] = String(key || "").split("-");
  const monthIndex = Number(month) - 1;
  if (!year || !Number.isFinite(monthIndex) || monthIndex < 0 || monthIndex > 11) return key || "";
  return `${MONTHS[monthIndex]} / ${year}`;
}

function getAvailablePackageMonthOptions() {
  const fileKey = dashboardFileRecords
    .filter((record) => getFileRecordCategory(record) === PACKAGE_MANAGEMENT_FILE_CATEGORY)
    .map((record) => `${record.id || record.file_name}:${record.updated_at || record.metadata?.last_loaded_at || ""}`)
    .join("|");
  const cacheKey = `${packageManagementRowsLoadedKey || "__rows"}::${packageManagementRows.length}::${fileKey}`;
  if (derivedDataCache.packageMonthOptionsKey === cacheKey) {
    return derivedDataCache.packageMonthOptions;
  }
  const months = new Map();
  (Array.isArray(packageManagementRows) ? packageManagementRows : [])
    .filter(isPackageManagementDetailRow)
    .forEach((row) => {
      const key = getPackageManagementMonthKey(row);
      if (!key || months.has(key)) return;
      months.set(key, { key, label: getMonthLabelFromKey(key), sort: key });
    });
  if (!months.size) {
    dashboardFileRecords
      .filter(isUsableDashboardFileRecord)
      .filter((record) => getFileRecordCategory(record) === PACKAGE_MANAGEMENT_FILE_CATEGORY)
      .forEach((record) => {
        const period = getFileRecordPeriod(record);
        if (!months.has(period.key)) months.set(period.key, { key: period.key, label: period.monthLabel, sort: period.key });
      });
  }
  const options = Array.from(months.values()).sort((a, b) => String(a.sort).localeCompare(String(b.sort)));
  derivedDataCache.packageMonthOptionsKey = cacheKey;
  derivedDataCache.packageMonthOptions = options;
  return options;
}

function getActiveMonthOptions() {
  return state.sheet === PACKAGE_MANAGEMENT_VIEW ? getAvailablePackageMonthOptions() : getAvailableMonthOptions(PRE_FATURA_FILE_CATEGORY);
}

function normalizeMonthSelection(value, options = getActiveMonthOptions()) {
  const available = (Array.isArray(options) ? options : []).map((item) => item.key).filter(Boolean);
  if (!available.length) return [];
  const source = Array.isArray(value)
    ? value
    : String(value || "")
      .split(/[,+;|]/)
      .map((item) => item.replace(/\s*\+\s*/g, "+"))
      .flatMap((item) => item.split("+"));
  const requested = source.map((item) => String(item || "").trim()).filter(Boolean);
  if (!requested.length || requested.some((item) => normalizeText(item) === "TODOS" || item === "all")) return available;
  const selected = available.filter((key) => requested.includes(key));
  return selected.length ? selected : available;
}

function getPrefaturaMonthSelectionValues() {
  const options = getAvailableMonthOptions(PRE_FATURA_FILE_CATEGORY);
  const source = Array.isArray(state.prefaturaMonths) && state.prefaturaMonths.length ? state.prefaturaMonths : state.monthFilter || "all";
  return normalizeMonthSelection(source, options);
}

function getPackageMonthSelectionValues() {
  const options = getAvailablePackageMonthOptions();
  const source = Array.isArray(state.packageMonths) && state.packageMonths.length ? state.packageMonths : "all";
  return normalizeMonthSelection(source, options);
}

function getActiveMonthSelectionValues() {
  return state.sheet === PACKAGE_MANAGEMENT_VIEW ? getPackageMonthSelectionValues() : getPrefaturaMonthSelectionValues();
}

function getActivePeriodMode() {
  return normalizePeriodMode(state.sheet === PACKAGE_MANAGEMENT_VIEW ? state.packagePeriod : state.prefaturaPeriod || state.period);
}

function setActivePeriodMode(value) {
  const next = normalizePeriodMode(value);
  if (state.sheet === PACKAGE_MANAGEMENT_VIEW) state.packagePeriod = next;
  else {
    state.prefaturaPeriod = next;
    state.period = next;
  }
}

function getMonthSelectionLabel(selection, options = getActiveMonthOptions()) {
  const selected = normalizeMonthSelection(selection, options);
  if (!options.length || selected.length === options.length) return "Todos";
  const labels = selected.map((key) => shortMonthYear(options.find((item) => item.key === key)?.label || getMonthLabelFromKey(key)));
  if (labels.length <= 2) return labels.join(" + ");
  return `${labels.length} meses selecionados`;
}

function syncMonthFilterControl() {
  if (!el.monthFilterLabel || !el.monthFilterMenu) return;
  const options = getActiveMonthOptions();
  const selection = getActiveMonthSelectionValues();
  const selectedSet = new Set(selection);
  const allSelected = options.length > 0 && selection.length === options.length;
  el.monthFilterLabel.textContent = getMonthSelectionLabel(selection, options);
  el.monthFilterToggle?.setAttribute("aria-expanded", el.monthFilterMenu.hidden ? "false" : "true");
  el.monthFilterMenu.innerHTML = [
    `<label class="type-filter__option custom-filter__option">
      <input type="checkbox" value="all" data-month-option ${allSelected ? "checked" : ""}>
      <span class="type-filter__check" aria-hidden="true"></span>
      <span>Todos</span>
    </label>`,
    ...options.map((month) => `
      <label class="type-filter__option custom-filter__option">
        <input type="checkbox" value="${escapeAttribute(month.key)}" data-month-option ${!allSelected && selectedSet.has(month.key) ? "checked" : ""}>
        <span class="type-filter__check" aria-hidden="true"></span>
        <span>${escapeHtml(shortMonthYear(month.label))}</span>
      </label>
    `),
  ].join("");
  if (activeDropdownPortalKind === "month") positionDropdownPortal("month");
}

function syncPeriodFilterControl() {
  if (!el.periodFilterLabel || !el.periodFilterMenu) return;
  const active = getActivePeriodMode();
  el.periodFilterLabel.textContent = getPeriodModeLabel(active);
  el.periodFilterToggle?.setAttribute("aria-expanded", el.periodFilterMenu.hidden ? "false" : "true");
  el.periodFilterMenu.innerHTML = getPeriodDropdownOptions()
    .map(([value, label]) => `
      <button class="type-filter__option custom-filter__option custom-filter__option--button ${active === value ? "is-selected" : ""}" type="button" data-period-option="${escapeAttribute(value)}">
        <span class="type-filter__check" aria-hidden="true"></span>
        <span>${escapeHtml(label)}</span>
      </button>
    `)
    .join("");
  if (activeDropdownPortalKind === "period") positionDropdownPortal("period");
}

function getPeriodDropdownOptions() {
  return [
    ["month", "Mês completo"],
    ["q1", "1ª quinzena"],
    ["q2", "2ª quinzena"],
  ];
}

function closeCustomFilterMenu(kind) {
  const menu = kind === "month" ? el.monthFilterMenu : el.periodFilterMenu;
  const toggle = kind === "month" ? el.monthFilterToggle : el.periodFilterToggle;
  if (!menu || !toggle) return;
  closeDropdownPortal(kind);
}

function openCustomFilterMenu(kind) {
  const menu = kind === "month" ? el.monthFilterMenu : el.periodFilterMenu;
  const toggle = kind === "month" ? el.monthFilterToggle : el.periodFilterToggle;
  if (!menu || !toggle) return;
  closeDeviationCategoryMenu({ render: true });
  closePackageTypeMenu();
  if (kind !== "month") closeCustomFilterMenu("month");
  if (kind !== "period") closeCustomFilterMenu("period");
  if (kind === "month") syncMonthFilterControl();
  else syncPeriodFilterControl();
  openDropdownPortal(kind);
}

function toggleCustomFilterMenu(kind) {
  const menu = kind === "month" ? el.monthFilterMenu : el.periodFilterMenu;
  if (!menu) return;
  if (menu.hidden) openCustomFilterMenu(kind);
  else closeCustomFilterMenu(kind);
}

function applyMonthOptionChange(changedInput) {
  const options = getActiveMonthOptions();
  const available = options.map((item) => item.key);
  const checked = Array.from(el.monthFilterMenu.querySelectorAll("[data-month-option]"))
    .filter((input) => input.checked)
    .map((input) => input.value);
  const next = changedInput?.value === "all" ? available : normalizeMonthSelection(checked.filter((value) => value !== "all"), options);
  const storesAllMonths = next.length === available.length;
  if (state.sheet === PACKAGE_MANAGEMENT_VIEW) {
    state.packageMonths = storesAllMonths ? [] : next;
  } else {
    state.prefaturaMonths = storesAllMonths ? [] : next;
    state.monthFilter = storesAllMonths ? "all" : next[0] || "all";
  }
  state.page = 1;
  ensureCurrentPeriodIsAvailable();
  persistState();
  hydrateControls();
  if (state.sheet !== PACKAGE_MANAGEMENT_VIEW) applyDashboardScopeFromLoadedDatasets();
  renderAll();
}

function applyPeriodOptionChange(value) {
  setActivePeriodMode(value);
  state.page = 1;
  ensureCurrentPeriodIsAvailable();
  persistState();
  closeCustomFilterMenu("period");
  hydrateControls();
  if (state.sheet !== PACKAGE_MANAGEMENT_VIEW) applyDashboardScopeFromLoadedDatasets();
  renderAll();
}

function closeTopFilterOverlays() {
  closePackageTypeMenu();
  closeCustomFilterMenu("month");
  closeCustomFilterMenu("period");
  closeDeviationCategoryMenu();
  setSearchExpanded(false, { focus: false });
  if (el.searchInput && !state.query) el.searchInput.blur();
}

function clearTransientDashboardStateForNavigation() {
  if (dashboardVisualState === "no-filter-results" || dashboardVisualState === "permission-denied") {
    setDashboardVisualState("", { render: false });
  }
}

function applyPackageTypeOptionChange(changedInput) {
  const checkedValues = el.typeFilterOptions
    .filter((input) => input.checked)
    .map((input) => input.value);
  const checkedSpecificTypes = checkedValues.filter((value) => MAIN_TYPE_OPTIONS.includes(value));
  const nextSelection = changedInput?.value === "Todos"
    ? MAIN_TYPE_OPTIONS.slice()
    : normalizeTypeSelection(checkedSpecificTypes);
  if (state.sheet === PACKAGE_MANAGEMENT_VIEW) {
    state.packageTipo = nextSelection;
  } else {
    state.prefaturaTipo = nextSelection;
  }
  state.page = 1;
  persistState();
  syncPackageTypeFilterControl();
  renderAll();
}

function getPrefaturaDivisionForType(type = state.prefaturaTipo) {
  const selection = getPrefaturaTypeSelectionValues(type);
  return selection.length === 1 ? PREFATURA_TYPE_TO_DIVISION[selection[0]] || "" : "";
}

function getPrefaturaDivisionsForTypes(selection = state.prefaturaTipo) {
  return getPrefaturaTypeSelectionValues(selection)
    .map((type) => PREFATURA_TYPE_TO_DIVISION[type])
    .filter(Boolean);
}

function getPrefaturaTypeForDivision(division) {
  return PREFATURA_DIVISION_TO_TYPE[normalizeSheetLabel(division)] || "Todos";
}

function getPrefaturaComparisonSheet() {
  const selected = getPrefaturaTypeSelectionValues(state.prefaturaTipo);
  return selected.length === 1 ? getPrefaturaDivisionForType(selected[0]) || "Todos" : "Todos";
}

function isDashboardFileCategory(value) {
  return value === PRE_FATURA_FILE_CATEGORY || value === PACKAGE_MANAGEMENT_FILE_CATEGORY || value === DEVIATION_PNR_FILE_CATEGORY;
}

function withTimeout(promise, timeoutMs, message) {
  let timeoutId = null;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId) window.clearTimeout(timeoutId);
  });
}

function identificarTipoArquivo(nomeArquivo) {
  const nome = normalizeText(nomeArquivo);
  if (nome.includes("GESTAO DE PACOTES")) return PACKAGE_MANAGEMENT_FILE_CATEGORY;
  if (nome.includes("DESVIOS PNR") || nome.includes("PNRS") || /\bPNR\b/.test(nome)) return DEVIATION_PNR_FILE_CATEGORY;
  return PRE_FATURA_FILE_CATEGORY;
}

function getFileRecordCategory(fileRecord) {
  const directCandidates = [
    fileRecord?.file_category,
    fileRecord?.fileCategory,
    fileRecord?.file_type,
    fileRecord?.metadata?.file_category,
    fileRecord?.metadata?.semantic_file_type,
    fileRecord?.metadata?.file_type,
    fileRecord?.metadata?.tipo_arquivo,
  ];
  const storedCategory = directCandidates.find(isDashboardFileCategory);
  if (storedCategory) return storedCategory;

  const nameCategory = identificarTipoArquivo(fileRecord?.metadata?.original_name || fileRecord?.file_name || fileRecord?.fileName || "");
  if (nameCategory === PACKAGE_MANAGEMENT_FILE_CATEGORY) return PACKAGE_MANAGEMENT_FILE_CATEGORY;
  if (nameCategory === DEVIATION_PNR_FILE_CATEGORY) return DEVIATION_PNR_FILE_CATEGORY;

  const storagePath = String(fileRecord?.storage_path || fileRecord?.storagePath || "");
  if (storagePath.startsWith("gestao-pacotes/")) return PACKAGE_MANAGEMENT_FILE_CATEGORY;
  if (storagePath.startsWith("gestao-desvios/pnrs/")) return DEVIATION_PNR_FILE_CATEGORY;
  if (storagePath.startsWith("pre-fatura/")) return PRE_FATURA_FILE_CATEGORY;

  return nameCategory;
}

function getFileRecordMimeType(fileRecord, fallback = "") {
  const legacyType = fileRecord?.file_type;
  return fileRecord?.metadata?.mime_type || (isDashboardFileCategory(legacyType) ? "" : legacyType) || fallback || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
}

function inferRowsFileCategory(rows) {
  if (Array.isArray(rows) && rows.some((row) => row?.file_category === DEVIATION_PNR_FILE_CATEGORY || row?.tipo_registro === DEVIATION_PNR_FILE_CATEGORY)) return DEVIATION_PNR_FILE_CATEGORY;
  return Array.isArray(rows) && rows.some((row) => row?.file_category === PACKAGE_MANAGEMENT_FILE_CATEGORY) ? PACKAGE_MANAGEMENT_FILE_CATEGORY : PRE_FATURA_FILE_CATEGORY;
}

function formatPackageQuinzena(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  return normalized.replace("quinzena", "Quinzena");
}

function buildPackageManagementDisplayName(fileName, metadata = {}) {
  const period = identificarPeriodoGestaoPacotes(fileName);
  const quinzena = formatPackageQuinzena(metadata.quinzena || period.quinzena);
  const competencia = metadata.competencia || period.competencia || "";
  const parts = ["Gestão de Pacotes"];
  if (quinzena) parts.push(quinzena);
  if (competencia) parts.push(competencia);
  return parts.length > 1 ? parts.join(" · ") : `[Gestão de Pacotes] ${String(fileName || "arquivo").replace(/\.[^.]+$/, "")}`;
}

function getDashboardFileDisplayName(fileOrDataset) {
  if (!fileOrDataset) return "Arquivo";
  if (fileOrDataset.files_count != null && fileOrDataset.file_name) return fileOrDataset.file_name;
  const metadata = fileOrDataset.metadata || fileOrDataset.remoteRecord?.metadata || {};
  if (metadata.display_name) return metadata.display_name;
  const fileName = fileOrDataset.file_name || fileOrDataset.fileName || fileOrDataset.label || "arquivo.xlsx";
  const category = fileOrDataset.fileCategory || getFileRecordCategory(fileOrDataset.remoteRecord || fileOrDataset);
  if (category === PACKAGE_MANAGEMENT_FILE_CATEGORY) {
    return buildPackageManagementDisplayName(fileName, metadata);
  }
  if (category === DEVIATION_PNR_FILE_CATEGORY) {
    const period = getFileRecordPeriod(fileOrDataset.remoteRecord || fileOrDataset);
    const monthLabel = period?.monthLabel ? period.monthLabel.replace(/\s*\/\s*/g, "/") : "";
    const parts = ["PNRs"];
    if (period?.periodLabel && period.periodType !== "month") parts.push(period.periodLabel);
    if (monthLabel) parts.push(monthLabel);
    return parts.join(" · ");
  }
  const humanized = humanizeWorkbookName(fileName);
  return humanized.startsWith("Pré-Fatura ·") ? humanized : `Pré-Fatura · ${humanized}`;
}

async function handlePnrGoalConfig(event) {
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
  const saved = await savePnrGoalByMode(mode, value > 0 ? value : getGoalLimitByMode(mode));
  if (saved && panel) panel.removeAttribute("open");
}

function handleEscapeFilter(event) {
  if (event.key !== "Escape") return;
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (target.closest("#type-filter")) {
    if (el.typeFilterMenu && !el.typeFilterMenu.hidden) {
      closePackageTypeMenu();
      event.preventDefault();
      return;
    }
    const activeTypeValue = state.sheet === PACKAGE_MANAGEMENT_VIEW ? state.packageTipo : state.prefaturaTipo;
    if (normalizeTypeSelection(activeTypeValue).length !== MAIN_TYPE_OPTIONS.length) {
      if (state.sheet === PACKAGE_MANAGEMENT_VIEW) state.packageTipo = MAIN_TYPE_OPTIONS.slice();
      else state.prefaturaTipo = MAIN_TYPE_OPTIONS.slice();
      state.page = 1;
      hydrateControls();
      persistState();
      renderAll();
      event.preventDefault();
      showToast("Filtro removido.", "info");
    }
    return;
  }
  const resetById = {
    "search-input": () => {
      if (!state.query) return false;
      state.query = "";
      setSearchExpanded(false);
      return true;
    },
    "period-select": () => {
      if (getActivePeriodMode() === "month") return false;
      setActivePeriodMode("month");
      return true;
    },
    "month-select": () => {
      const options = getActiveMonthOptions();
      const current = getActiveMonthSelectionValues();
      if (current.length === options.length) return false;
      if (state.sheet === PACKAGE_MANAGEMENT_VIEW) state.packageMonths = [];
      else {
        state.prefaturaMonths = [];
        state.monthFilter = "all";
      }
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

function loadEvolutionPeriodView() {
  try {
    const saved = window.localStorage.getItem(EVOLUTION_PERIOD_VIEW_STORAGE_KEY);
    return saved === "biweekly" ? "biweekly" : "monthly";
  } catch {
    return "monthly";
  }
}

function setEvolutionPeriodView(value) {
  evolutionPeriodView = value === "biweekly" ? "biweekly" : "monthly";
  try {
    window.localStorage.setItem(EVOLUTION_PERIOD_VIEW_STORAGE_KEY, evolutionPeriodView);
  } catch {
    // localStorage can be unavailable in restrictive browser modes.
  }
}

function loadComparisonPeriodView() {
  try {
    const saved = window.localStorage.getItem(COMPARISON_PERIOD_VIEW_STORAGE_KEY);
    return saved === "biweekly" ? "biweekly" : "monthly";
  } catch {
    return "monthly";
  }
}

function setComparisonPeriodView(value) {
  comparisonPeriodView = value === "biweekly" ? "biweekly" : "monthly";
  try {
    window.localStorage.setItem(COMPARISON_PERIOD_VIEW_STORAGE_KEY, comparisonPeriodView);
  } catch {
    // localStorage can be unavailable in restrictive browser modes.
  }
}

function setSearchExpanded(expanded, options = {}) {
  if (!el.searchFilter) return;
  const shouldExpand = Boolean(expanded);
  el.searchFilter.classList.toggle("is-expanded", shouldExpand);
  el.searchToggle?.setAttribute("aria-expanded", shouldExpand ? "true" : "false");
  if (shouldExpand && options.focus !== false) {
    window.setTimeout(() => el.searchInput?.focus(), 20);
  }
}

function scheduleSearchRender(delay = 320) {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = window.setTimeout(() => {
    hydrateControls();
    renderAll();
  }, delay);
}

function markDashboardReady() {
  if (el.layout) {
    el.layout.dataset.dashboardReady = "true";
  }
}

function hydrateControls() {
  syncActiveDataset();
  state.prefaturaTipo = normalizeTypeSelection(state.prefaturaTipo);
  state.packageTipo = normalizeTypeSelection(state.packageTipo);
  state.base = "Todos";
  state.motorista = "Todos";
  renderDatasetSelect();
  renderMonthSelect();
  renderPeriodSelect();
  syncPackageTypeFilterControl();

  if (el.searchInput) el.searchInput.value = state.query;
  setSearchExpanded(Boolean(state.query), { focus: false });
  el.pageSize.value = String(state.pageSize || 15);
  if (el.settingsPageSize) el.settingsPageSize.value = String(state.pageSize || 15);
  if (el.settingsPnrGoal) el.settingsPnrGoal.value = String(getMonthlyPnrGoalLimit());
  hydrateValueSortControls();

  updateDatasetMeta();
  hydrateThemeControls();
  updateGlobalPeriodFiltersVisibility();

  renderTabs();
}

function updateGlobalPeriodFiltersVisibility(isEvolutionView = state.sheet === MONTHLY_BASE_VIEW) {
  const hideDataFilters = isEvolutionView || state.sheet === DEVIATION_MANAGEMENT_VIEW;
  const searchFilter = el.searchInput?.closest(".global-search-filter");
  const monthFilter = el.monthFilter || el.monthSelect?.closest(".global-period-filter");
  const periodFilter = el.periodFilter || el.periodSelect?.closest(".global-period-filter");
  const typeFilter = el.typeFilter;
  [monthFilter, periodFilter].forEach((filter) => {
    if (filter) filter.hidden = hideDataFilters;
  });
  if (searchFilter) searchFilter.hidden = hideDataFilters;
  if (typeFilter) typeFilter.hidden = hideDataFilters;
  if (el.viewToolbar) {
    el.viewToolbar.classList.toggle("is-evolution-view", hideDataFilters);
    el.viewToolbar.classList.toggle("is-package-view", state.sheet === PACKAGE_MANAGEMENT_VIEW);
  }
}

function renderPeriodSelect() {
  state.prefaturaPeriod = normalizePeriodMode(state.prefaturaPeriod || state.period);
  state.packagePeriod = normalizePeriodMode(state.packagePeriod || "month");
  state.period = state.prefaturaPeriod;
  if (el.periodSelect) {
    const options = getPeriodDropdownOptions();
    el.periodSelect.innerHTML = options
      .map(([value, label]) => `<option value="${value}" ${state.period === value ? "selected" : ""}>${escapeHtml(label)}</option>`)
      .join("");
  }
  syncPeriodFilterControl();
}

function renderMonthSelect() {
  const prefaturaMonths = getAvailableMonthOptions(PRE_FATURA_FILE_CATEGORY);
  const packageMonths = getAvailablePackageMonthOptions();
  const prefaturaSource = Array.isArray(state.prefaturaMonths) && state.prefaturaMonths.length ? state.prefaturaMonths : state.monthFilter || "all";
  const packageSource = Array.isArray(state.packageMonths) && state.packageMonths.length ? state.packageMonths : "all";
  const normalizedPrefaturaMonths = normalizeMonthSelection(prefaturaSource, prefaturaMonths);
  const normalizedPackageMonths = normalizeMonthSelection(packageSource, packageMonths);
  const prefaturaKeys = prefaturaMonths.map((month) => month.key);
  const packageKeys = packageMonths.map((month) => month.key);
  state.prefaturaMonths = normalizedPrefaturaMonths.length === prefaturaKeys.length ? [] : normalizedPrefaturaMonths;
  state.packageMonths = normalizedPackageMonths.length === packageKeys.length ? [] : normalizedPackageMonths;
  state.monthFilter = state.prefaturaMonths.length ? state.prefaturaMonths[0] : "all";
  if (el.monthSelect) {
    el.monthSelect.innerHTML = [
      `<option value="all" ${state.monthFilter === "all" ? "selected" : ""}>Todos</option>`,
      ...prefaturaMonths.map(
        (month) =>
          `<option value="${escapeAttribute(month.key)}" ${state.monthFilter === month.key ? "selected" : ""}>${escapeHtml(shortMonthYear(month.label))}</option>`,
      ),
    ].join("");
  }
  syncMonthFilterControl();
}

function getAvailableMonthOptions(fileCategory = getCurrentFileCategory()) {
  const months = new Map();
  dashboardFileRecords
    .filter(isUsableDashboardFileRecord)
    .filter((record) => getFileRecordCategory(record) === fileCategory)
    .forEach((record) => {
      const period = getFileRecordPeriod(record);
      if (!months.has(period.key)) {
        months.set(period.key, { key: period.key, label: period.monthLabel, sort: period.sort });
      }
    });
  return Array.from(months.values()).sort((a, b) => a.sort - b.sort);
}

function buildPeriodOptions() {
  return getPeriodDropdownOptions();
}

function ensureCurrentPeriodIsAvailable() {
  const options = buildPeriodOptions();
  const current = getActivePeriodMode();
  if (!options.some(([value]) => value === current)) {
    setActivePeriodMode(options[0]?.[0] || "month");
  }
}

function hydrateValueSortControls() {
  const isLow = state.sortKey === "valor_numerico" && state.sortDir === "asc";
  if (el.sortHigh) el.sortHigh.classList.toggle("is-active", !isLow);
  if (el.sortLow) el.sortLow.classList.toggle("is-active", isLow);
}

function renderDatasetSelect() {
  if (!el.datasetSelect) return;
  const selectableDatasets = library.datasets.filter((dataset) => dataset?.source !== "filtered");
  const datasets = selectableDatasets.length ? selectableDatasets : [buildEmptyDataset()];
  el.datasetSelect.innerHTML = datasets
    .map((dataset) => {
      const selected = dataset.id === state.activeDatasetId ? "selected" : "";
      const count = dataset.id === EMPTY_DATASET_ID ? "" : ` (${getFileRowsLabel(dataset.remoteRecord, dataset)})`;
      const active = dataset.remoteRecord?.is_active ? " · ativo" : "";
      return `<option value="${escapeAttribute(dataset.id)}" ${selected}>${escapeHtml(getDashboardFileDisplayName(dataset.remoteRecord || dataset))}${count}${active}</option>`;
    })
    .join("");
}

async function handleDatasetSelection(datasetId) {
  const dataset = library.datasets.find((entry) => entry.id === datasetId);
  if (!dataset) {
    renderDatasetSelect();
    return;
  }

  if ((dataset.fileCategory || getFileRecordCategory(dataset.remoteRecord)) === PACKAGE_MANAGEMENT_FILE_CATEGORY) {
    showToast("Arquivos de Gestão de Pacotes alimentam apenas a aba Gestão de Pacotes.", "info", 4200);
    renderDatasetSelect();
    return;
  }

  if (dataset.source === "supabase" && dataset.remoteRecord && dataset.id !== currentActiveFile?.id) {
    if (!getActionPermissions().isAdmin) {
      showToast("Apenas administradores podem alterar o arquivo ativo.", "warn", 5200);
      renderDatasetSelect();
      return;
    }
    await setActiveDashboardFile(dataset.remoteRecord.id);
    return;
  }

  state.activeDatasetId = datasetId;
  state.page = 1;
  syncActiveDataset();
  persistState();
  hydrateControls();
  renderAll();
}

function updateDatasetMeta() {
  const totalFiles = getDeletableDatasets().length;
  const active = getActiveDataset();
  if (el.datasetCount) el.datasetCount.textContent = `${integer.format(totalFiles)} arquivo${totalFiles === 1 ? "" : "s"}`;
  if (el.datasetNote) {
    if (dashboardFilesLoading) {
      el.datasetNote.textContent = "Carregando arquivo ativo...";
    } else if (active && active.id !== EMPTY_DATASET_ID) {
      const source = currentActiveFile ? `Arquivo salvo no Supabase: ${getDashboardFileDisplayName(currentActiveFile)}.` : "O mês completo é consolidado automaticamente.";
      el.datasetNote.textContent = `${integer.format(allRows.length)} registros no recorte atual. ${source}`;
    } else {
      el.datasetNote.textContent = currentUser ? "Nenhum arquivo carregado. Faça upload de um arquivo para iniciar." : "Faça login para carregar o arquivo ativo salvo.";
    }
  }
}

function getDeletableDatasets() {
  return library.datasets.filter((dataset) => dataset && dataset.source !== "filtered" && dataset.id !== EMPTY_DATASET_ID && (dataset.source === "supabase" || (Array.isArray(dataset.rows) && dataset.rows.length)));
}

function isUsableDashboardFileRecord(record) {
  return Boolean(record && record.id && record.storage_path && record.status !== "missing_storage");
}

function isDashboardFileActive(file) {
  if (!file) return false;
  const status = normalizeText(file.status || file.metadata?.status || "");
  if (file.deleted_at || file.deletedAt) return false;
  if (["DELETED", "REMOVIDO", "MISSING STORAGE", "MISSING_STORAGE", "EMPTY OR PARSE ERROR", "EMPTY_OR_PARSE_ERROR", "SUPERSEDED", "SUBSTITUIDO", "SUBSTITUÍDO"].includes(status)) return false;
  return Boolean(file.id && file.storage_path);
}

function getFileRowsCount(fileRecord, dataset = null) {
  const parsedRows = Number(fileRecord?.metadata?.parsed_rows);
  if (Number.isFinite(parsedRows) && parsedRows > 0) return parsedRows;
  const legacyRows = Number(fileRecord?.metadata?.rows);
  if (Number.isFinite(legacyRows) && legacyRows > 0) return legacyRows;
  const datasetRows = Array.isArray(dataset?.rows) ? dataset.rows.length : 0;
  return datasetRows > 0 ? datasetRows : 0;
}

function getFileRowsLabel(fileRecord, dataset = null) {
  const rows = getFileRowsCount(fileRecord, dataset);
  if (rows > 0) return `${integer.format(rows)} registros`;
  if (fileRecord?.status === "empty_or_parse_error") return "0 registros válidos";
  return "Registros não calculados";
}

function getFilesForMonth(files, monthKey, fileCategory = getCurrentFileCategory()) {
  return (Array.isArray(files) ? files : [])
    .filter(isUsableDashboardFileRecord)
    .filter((file) => !fileCategory || getFileRecordCategory(file) === fileCategory)
    .filter((file) => monthKey === "all" || getFileRecordPeriod(file).key === monthKey);
}

function getFilesByMonthAndPeriod(files, monthKey, periodMode, fileCategory = getCurrentFileCategory()) {
  const normalizedMonth = monthKey || "all";
  const normalizedPeriod = normalizePeriodMode(periodMode);
  return getFilesForMonth(files, normalizedMonth, fileCategory).filter((file) => {
    if (normalizedPeriod === "month") return true;
    return getFileRecordPeriod(file).periodType === normalizedPeriod;
  });
}

function getFilesByMonthsAndPeriod(files, monthSelection, periodMode, fileCategory = getCurrentFileCategory()) {
  const monthOptions = fileCategory === PACKAGE_MANAGEMENT_FILE_CATEGORY ? getAvailablePackageMonthOptions() : getAvailableMonthOptions(fileCategory);
  const selectedMonths = normalizeMonthSelection(monthSelection, monthOptions);
  const allMonthsSelected = !monthOptions.length || selectedMonths.length === monthOptions.length;
  const normalizedPeriod = normalizePeriodMode(periodMode);
  return (Array.isArray(files) ? files : [])
    .filter(isUsableDashboardFileRecord)
    .filter((file) => !fileCategory || getFileRecordCategory(file) === fileCategory)
    .filter((file) => {
      const period = getFileRecordPeriod(file);
      if (!allMonthsSelected && !selectedMonths.includes(period.key)) return false;
      if (normalizedPeriod === "month") return true;
      return period.periodType === normalizedPeriod;
    });
}

function getQuinzenaIndex(value) {
  const normalized = normalizePeriodMode(value);
  if (normalized === "q1") return 1;
  if (normalized === "q2") return 2;
  const detected = detectQuinzena(value);
  if (detected.includes("1")) return 1;
  if (detected.includes("2")) return 2;
  return 3;
}

function getFileCompetenceSortParts(file) {
  const metadata = file?.metadata || {};
  const text = [
    file?.ano,
    file?.mes,
    file?.competencia,
    file?.quinzena,
    file?.period_label,
    file?.file_name,
    file?.original_name,
    file?.storage_path,
    metadata.ano,
    metadata.mes,
    metadata.competencia,
    metadata.quinzena,
    metadata.period_label,
    metadata.display_name,
  ].filter(Boolean).join(" ");
  const period = getFileRecordPeriod(file);
  const [periodYear, periodMonth] = String(period.key || "").split("-");
  const year =
    Number(normalizeReferenceYear(file?.reference_year || metadata.reference_year || file?.ano || metadata.ano)) ||
    Number(detectYear(text)) ||
    Number(periodYear) ||
    9999;
  const month =
    Number(getMonthNumberFromAny(file?.reference_month || metadata.reference_month || file?.mes || metadata.mes || file?.competencia || metadata.competencia)) ||
    Number(getMonthNumberFromAny(text)) ||
    Number(periodMonth) ||
    99;
  const quinzena = getQuinzenaIndex(file?.period_type || metadata.period_type || file?.quinzena || metadata.quinzena || period.periodType || text);
  return {
    year,
    month,
    quinzena,
    label: getDashboardFileDisplayName(file),
    uploadedAt: file?.created_at || "",
  };
}

function ordenarArquivosPorCompetencia(files) {
  return [...(Array.isArray(files) ? files : [])].sort((a, b) => {
    const aSort = getFileCompetenceSortParts(a);
    const bSort = getFileCompetenceSortParts(b);
    if (aSort.year !== bSort.year) return aSort.year - bSort.year;
    if (aSort.month !== bSort.month) return aSort.month - bSort.month;
    if (aSort.quinzena !== bSort.quinzena) return aSort.quinzena - bSort.quinzena;
    const labelCompare = aSort.label.localeCompare(bSort.label, "pt-BR", { numeric: true, sensitivity: "base" });
    if (labelCompare) return labelCompare;
    return String(aSort.uploadedAt).localeCompare(String(bSort.uploadedAt));
  });
}

function getSettingsFilesForActiveTab() {
  const files = dashboardFileRecords
    .filter(isUsableDashboardFileRecord)
    .filter(isDashboardFileActive)
    .filter((file) => getFileRecordCategory(file) === settingsFilesTab);
  return ordenarArquivosPorCompetencia(files);
}

function getSettingsFileCategoryLabel(category) {
  if (category === DEVIATION_PNR_FILE_CATEGORY) return "PNRs";
  return category === PACKAGE_MANAGEMENT_FILE_CATEGORY ? "Gestão de Pacotes" : "Pré-Fatura";
}

function getSettingsFileTabLabel(category) {
  if (category === DEVIATION_PNR_FILE_CATEGORY) return "Gestão de Desvios";
  return getSettingsFileCategoryLabel(category);
}

function formatSettingsFilePeriod(file) {
  const period = getFileRecordPeriod(file);
  const periodLabel = getPeriodModeLabel(period.periodType || "month");
  const monthLabel = categoryAwareFullMonthLabel(file, period);
  return `${periodLabel} · ${monthLabel}`;
}

function categoryAwareFullMonthLabel(file, period = getFileRecordPeriod(file)) {
  const category = getFileRecordCategory(file);
  const label = period.monthLabel || getMonthLabelFromKey(period.key);
  if (category === DEVIATION_PNR_FILE_CATEGORY) return String(label || "").replace(/\s*\/\s*/g, "/");
  return shortMonthYear(label);
}

function renderDeviationSettingsCategories(filesCount = 0) {
  const rowsLabel = filesCount ? `${integer.format(filesCount)} arquivo${filesCount === 1 ? "" : "s"}` : "Sem arquivos";
  return `
    <div class="settings-deviation-categories" aria-label="Categorias da Gestão de Desvios">
      ${DEVIATION_CATEGORIES.map((category) => {
        const enabled = category.key === DEVIATION_CATEGORY_PNRS;
        return `
          <span class="settings-deviation-category ${enabled ? "is-enabled is-active" : "is-disabled"}">
            <span>${escapeHtml(category.label)}</span>
            <small>${enabled ? rowsLabel : "Em desenvolvimento"}</small>
          </span>
        `;
      }).join("")}
    </div>
  `;
}

function formatSettingsFileStatus(file) {
  const status = normalizeText(file?.status || file?.metadata?.status || "");
  if (!status || status === "LOADED") return file?.is_active ? "Ativo" : "Carregado";
  if (status.includes("MISSING")) return "Arquivo ausente";
  if (status.includes("EMPTY")) return "Sem registros";
  return status.replace(/_/g, " ").toLowerCase().split(/\s+/).map(capitalize).join(" ");
}

function getSettingsFileRowsLabel(file) {
  const rows = getFileRowsCount(file);
  if (rows > 0) return `${integer.format(rows)} registros`;
  if (file?.status === "empty_or_parse_error") return "0 registros válidos";
  return "—";
}

function renderSettingsFileManagement() {
  if (!el.settingsFilesTabs || !el.settingsFilesList || !el.settingsFilesDelete) return;
  const permissions = getActionPermissions();
  const tabs = [
    [PRE_FATURA_FILE_CATEGORY, "Pré-Fatura"],
    [PACKAGE_MANAGEMENT_FILE_CATEGORY, "Gestão de Pacotes"],
    [DEVIATION_PNR_FILE_CATEGORY, "Gestão de Desvios"],
  ];
  el.settingsFilesTabs.innerHTML = tabs
    .map(([category, label]) => `
      <button class="settings-files-tab ${settingsFilesTab === category ? "is-active" : ""}" type="button" data-settings-files-tab="${escapeAttribute(category)}" role="tab" aria-selected="${settingsFilesTab === category ? "true" : "false"}">
        ${escapeHtml(label)}
      </button>
    `)
    .join("");

  const files = getSettingsFilesForActiveTab();
  const availableIds = new Set(files.map((file) => file.id));
  Array.from(selectedSettingsFileIds).forEach((id) => {
    if (!availableIds.has(id)) selectedSettingsFileIds.delete(id);
  });
  const selectedCount = files.filter((file) => selectedSettingsFileIds.has(file.id)).length;
  const canDelete = permissions.canDeleteFile && selectedCount > 0;
  el.settingsFilesDelete.disabled = !canDelete;
  el.settingsFilesDelete.classList.toggle("is-action-blocked", !canDelete);
  el.settingsFilesDelete.setAttribute("aria-disabled", canDelete ? "false" : "true");
  el.settingsFilesDelete.setAttribute(
    "title",
    permissions.canDeleteFile ? "Excluir selecionados" : getAdminActionDeniedMessage("Somente administradores podem usar esta função."),
  );

  if (dashboardFilesLoading) {
    el.settingsFilesList.innerHTML = `<div class="settings-files-empty">Carregando arquivos...</div>`;
    return;
  }
  if (!files.length) {
    el.settingsFilesList.innerHTML = `
      ${settingsFilesTab === DEVIATION_PNR_FILE_CATEGORY ? renderDeviationSettingsCategories(0) : ""}
      <div class="settings-files-empty">Nenhum arquivo de ${escapeHtml(getSettingsFileTabLabel(settingsFilesTab))} encontrado.</div>
    `;
    return;
  }

  const allSelected = selectedCount === files.length;
  el.settingsFilesList.innerHTML = `
    ${settingsFilesTab === DEVIATION_PNR_FILE_CATEGORY ? renderDeviationSettingsCategories(files.length) : ""}
    <label class="settings-files-select-all">
      <input type="checkbox" data-settings-file-select-all ${allSelected ? "checked" : ""} ${permissions.canDeleteFile ? "" : "disabled"}>
      <span class="type-filter__check" aria-hidden="true"></span>
      <span>${selectedCount ? `${integer.format(selectedCount)} selecionado${selectedCount === 1 ? "" : "s"}` : "Selecionar todos"}</span>
    </label>
    <div class="settings-files-items">
      ${files.map((file) => {
        const category = getSettingsFileCategoryLabel(getFileRecordCategory(file));
        const checked = selectedSettingsFileIds.has(file.id);
        const uploaded = file.created_at ? formatDateTime(file.created_at) : "Data não informada";
        const rows = getSettingsFileRowsLabel(file);
        const status = formatSettingsFileStatus(file);
        return `
          <label class="settings-file-row">
            <input type="checkbox" value="${escapeAttribute(file.id)}" data-settings-file-id ${checked ? "checked" : ""} ${permissions.canDeleteFile ? "" : "disabled"}>
            <span class="type-filter__check" aria-hidden="true"></span>
            <span class="settings-file-row__content">
              <strong>${escapeHtml(category)} · ${escapeHtml(formatSettingsFilePeriod(file))}</strong>
              <span>${escapeHtml(getDashboardFileDisplayName(file))}</span>
              <small>Enviado em ${escapeHtml(uploaded)} · ${escapeHtml(rows)}</small>
            </span>
            <span class="settings-file-row__status">${escapeHtml(status)}</span>
          </label>
        `;
      }).join("")}
    </div>
  `;
  const selectAll = el.settingsFilesList.querySelector("[data-settings-file-select-all]");
  if (selectAll) selectAll.indeterminate = selectedCount > 0 && selectedCount < files.length;
}

function renderTabs() {
  removeDetachedDeviationMenus();
  el.sheetTabs.innerHTML = SHEET_TABS.map((sheet) => {
    const isActive = state.sheet === sheet ? "is-active" : "";
    const label = getSheetDisplayLabel(sheet);
    if (sheet === DEVIATION_MANAGEMENT_VIEW) {
      const categoryLabel = getDeviationCategoryLabel();
      const categoryBadge = categoryLabel ? `<span class="sheet-tab__badge">${escapeHtml(categoryLabel)}</span>` : "";
      return `
        <span class="sheet-tab-wrapper sheet-tab-wrapper--deviation">
          <button
            type="button"
            class="sheet-tab sheet-tab--deviation ${isActive}"
            data-sheet="${escapeAttribute(sheet)}"
            data-deviation-toggle
            aria-haspopup="menu"
            aria-expanded="${isDeviationCategoryMenuOpen ? "true" : "false"}"
          >
            <span class="sheet-tab__label">${escapeHtml(label)}</span>
            ${categoryBadge}
          </button>
          ${renderDeviationCategoryMenu()}
        </span>
      `;
    }
    return `
      <button type="button" class="sheet-tab ${isActive}" data-sheet="${escapeAttribute(sheet)}">
        ${escapeHtml(label)}
      </button>
    `;
  }).join("");
  if (isDeviationCategoryMenuOpen) openDropdownPortal("deviation");
}

function renderAll() {
  resetChartAnimationObservers();
  syncActiveDataset();
  renderTabs();
  const packageView = state.sheet === PACKAGE_MANAGEMENT_VIEW;
  const monthlyView = state.sheet === MONTHLY_BASE_VIEW;
  const deviationView = state.sheet === DEVIATION_MANAGEMENT_VIEW;
  let filtered = [];
  let sorted = [];
  let paged = [];
  let summary = null;
  const packageRows = packageView ? getPackageManagementRowsForView() : [];
  if (!monthlyView && !packageView && !deviationView) {
    filtered = getFilteredRows();
    sorted = sortRows(filtered);
    paged = paginateRows(sorted);
    summary = buildSummary(filtered);
  }

  if (state.appView === "settings" && !canEdit()) {
    state.appView = "dashboard";
  }
  const accountView = state.appView === "profile" || state.appView === "settings";
  updateGlobalPeriodFiltersVisibility(monthlyView && !accountView);
  toggleAccountView(accountView);
  if (accountView) {
    renderAccountPage();
    renderFilterSummary();
    updateTopbar(summary || undefined);
    updateAccessControls();
    return;
  }

  if (deviationView) {
    toggleDashboardView(monthlyView, packageView, deviationView);
    renderDeviationManagementView();
    renderFilterSummary();
    updateTopbar(summary || undefined);
    updateAccessControls();
    persistState();
    return;
  }

  const dashboardState = getDashboardState(packageView ? packageRows : monthlyView ? allRows : filtered);
  if (dashboardState) {
    renderDashboardState(dashboardState);
    renderFilterSummary();
    updateTopbar(summary || undefined);
    updateAccessControls();
    persistState();
    return;
  }

  toggleDashboardView(monthlyView, packageView, deviationView);
  if (monthlyView) {
    renderMonthlyBaseEvolution();
  } else if (packageView) {
    const packageSorted = sortRows(packageRows);
    renderPackageManagementView(paginateRows(packageSorted), packageSorted);
  } else {
    renderKpis(summary);
    renderInsights(filtered, summary);
    renderMonthlyComparison();
    renderTable(paged, summary);
  }
  renderFilterSummary();
  updateTopbar(summary || undefined);
  updateAccessControls();
  persistState();
  scheduleChartAnimations({ reset: false });
}

function renderCurrentTablePageOnly() {
  if (state.sheet === MONTHLY_BASE_VIEW || state.sheet === DEVIATION_MANAGEMENT_VIEW || state.appView !== "dashboard") {
    renderAll();
    return;
  }
  if (state.sheet === PACKAGE_MANAGEMENT_VIEW) {
    const packageRows = sortRows(getPackageManagementRowsForView());
    renderPackageManagementTable(paginateRows(packageRows), packageRows);
    renderFilterSummary();
    return;
  }
  const filtered = getFilteredRows();
  const sorted = sortRows(filtered);
  const summary = buildSummary(filtered);
  renderTable(paginateRows(sorted), summary);
  renderFilterSummary();
  updateTopbar(summary);
}

function toggleAccountView(accountView) {
  if (el.content) el.content.classList.toggle("is-account-page", accountView);
  if (el.profileView) el.profileView.hidden = state.appView !== "profile";
  if (el.settingsView) el.settingsView.hidden = state.appView !== "settings";
}

function clearAccountMenuCloseTimer() {
  if (!accountMenuCloseTimer) return;
  clearTimeout(accountMenuCloseTimer);
  accountMenuCloseTimer = null;
}

function setAccountMenuOpen(isOpen) {
  clearAccountMenuCloseTimer();
  state.accountPanelOpen = Boolean(isOpen);
  persistState();
  updateAccessControls();
}

function positionAccountMenu() {
  if (!el.accountMenu || !el.accountToggle || el.accountMenu.hidden) return;
  const rect = el.accountToggle.getBoundingClientRect();
  const viewportPadding = 16;
  const top = Math.max(viewportPadding, rect.bottom + 8);
  const right = Math.max(viewportPadding, window.innerWidth - rect.right);
  el.accountMenu.style.setProperty("--account-menu-top", `${top}px`);
  el.accountMenu.style.setProperty("--account-menu-right", `${right}px`);
}

function openAccountPage(page) {
  if (page === "settings" && !canEdit()) {
    showToast(currentUser ? "Apenas administradores podem acessar as configurações." : "Faça login para acessar as configurações.", "warn", 5200);
    return;
  }
  state.appView = page === "settings" ? "settings" : "profile";
  state.accountPanelOpen = false;
  if (state.appView === "settings" && canEdit()) {
    void loadAuditLogs();
  }
  persistState();
  renderAll();
}

function renderAccountPage() {
  renderProfilePage();
  renderSettingsPage();
}

function renderProfilePage() {
  if (!el.profileView) return;
  const email = currentProfile?.email || currentUser?.email || "";
  const name = getProfileDisplayName();
  const cargo = currentProfile?.cargo || (canEdit() ? "Administrador" : "Não informado");
  const setor = formatSetorLabel(currentProfile?.setor || "Não informado");
  const isAdmin = canEdit();
  const accessLabel = isAdmin ? "Admin" : "Usuário";
  const initials = getProfileInitials(name || email);
  const avatarUrl = pendingAvatarPreviewUrl || currentProfile?.avatar_url || "";
  if (el.profileAvatar) el.profileAvatar.innerHTML = avatarUrl ? `<img src="${escapeAttribute(avatarUrl)}" alt="${escapeAttribute(name)}" />` : escapeHtml(initials);
  if (el.profileHeading) el.profileHeading.textContent = currentUser ? name : "Perfil";
  if (el.profileSummary) el.profileSummary.textContent = currentUser ? `Setor: ${setor} · Cargo: ${cargo}` : "Dados do usuário conectado ao dashboard.";
  if (el.profileAccessBadge) {
    el.profileAccessBadge.textContent = accessLabel;
    el.profileAccessBadge.classList.toggle("is-admin", isAdmin);
    el.profileAccessBadge.classList.toggle("is-viewer", !isAdmin);
  }
  if (el.profileName) el.profileName.value = currentUser ? name : "";
  if (el.profileRoleTitle) el.profileRoleTitle.value = currentUser ? cargo : "";
  if (el.profileSector) el.profileSector.value = currentUser ? setor : "";
  if (el.profileAccessType) el.profileAccessType.value = currentUser ? accessLabel : "";
  if (el.profileEmail) el.profileEmail.value = email;
}

function renderSettingsPage() {
  if (!el.settingsUsersList) return;
  if (!canEdit()) {
    el.settingsUsersList.innerHTML = emptyState("Acesso restrito", "Somente administradores podem editar usuários.");
    if (el.settingsAuditList) el.settingsAuditList.innerHTML = emptyState("Acesso restrito", "Somente administradores podem visualizar a auditoria.");
    if (el.settingsFilesList) el.settingsFilesList.innerHTML = emptyState("Acesso restrito", "Somente administradores podem excluir arquivos.");
    return;
  }
  const users = knownUsers;
  el.settingsUsersList.innerHTML = users
    .map((user) => {
      const isAdmin = user.is_admin === true || user.isAdmin === true || user.role === "admin";
      const name = user.name || (user.email ? user.email.split("@")[0] : "Usuário");
      const cargo = user.cargo || (isAdmin ? "Administrador" : "Usuário");
      const setor = user.setor || "LOSS";
      const setorLabel = formatSetorLabel(setor);
      return `
        <div class="settings-user">
          <div class="settings-user__identity">
            <strong>${escapeHtml(name)}</strong>
            <span>${escapeHtml(user.email || "Sem e-mail")} · ${escapeHtml(cargo)} · Setor: ${escapeHtml(setorLabel)}</span>
          </div>
          <label class="settings-user__field">
            <span>Cargo</span>
            <input type="text" value="${escapeAttribute(cargo)}" data-user-id="${escapeAttribute(user.id)}" data-user-field="cargo" />
          </label>
          <label class="settings-user__field">
            <span>Setor</span>
            <select data-user-id="${escapeAttribute(user.id)}" data-user-field="setor">
              ${buildSetorOptions(setor)}
            </select>
          </label>
          <span class="settings-user__badge ${isAdmin ? "is-admin" : "is-viewer"}">${isAdmin ? "Admin" : "Visualização"}</span>
          <button class="secondary-button secondary-button--mini settings-user__action" type="button" data-user-id="${escapeAttribute(user.id)}" data-role="${isAdmin ? "user" : "admin"}">
            ${isAdmin ? "Remover admin" : "Tornar admin"}
          </button>
        </div>
      `;
    })
    .join("") || emptyState("Sem usuários", "Os perfis do Supabase aparecerão aqui.");
  renderSettingsFileManagement();
  renderAuditLogs();
}

function renderAuditLogs() {
  if (!el.settingsAuditList) return;
  if (!canEdit()) {
    el.settingsAuditList.innerHTML = emptyState("Acesso restrito", "Somente administradores podem visualizar a auditoria.");
    return;
  }
  if (!auditLogs.length) {
    el.settingsAuditList.innerHTML = emptyState("Sem auditoria", "As ações registradas aparecerão aqui.");
    return;
  }
  el.settingsAuditList.innerHTML = `
    <div class="audit-table" role="table" aria-label="Auditoria do dashboard">
      <div class="audit-table__row audit-table__row--head" role="row">
        <span>Data/Hora</span>
        <span>Usuário</span>
        <span>Ação</span>
        <span>Entidade</span>
        <span>Detalhes</span>
      </div>
      ${auditLogs
        .map((entry) => `
          <div class="audit-table__row" role="row">
            <span>${escapeHtml(formatDateTime(entry.created_at))}</span>
            <span>${escapeHtml(entry.user_email || "Sistema")}</span>
            <span>${escapeHtml(auditActionLabels[entry.action] || entry.action || "Ação")}</span>
            <span>${escapeHtml(formatAuditEntity(entry))}</span>
            <span>${escapeHtml(formatAuditDetails(entry.details))}</span>
          </div>
        `)
        .join("")}
    </div>
  `;
}

function formatAuditEntity(entry) {
  const type = entry?.entity_type || "—";
  const id = entry?.entity_id ? ` · ${entry.entity_id}` : "";
  return `${type}${id}`;
}

function formatAuditDetails(details) {
  if (!details || typeof details !== "object") return "—";
  const readable = Object.entries(details)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .slice(0, 5)
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : String(value)}`);
  return readable.join(" · ") || "—";
}

function getProfileDisplayName() {
  return currentProfile?.name || currentUser?.user_metadata?.name || (currentUser?.email ? currentUser.email.split("@")[0] : "Usuário");
}

function getProfileInitials(value) {
  return (
    String(value || "Usuário")
      .split("@")[0]
      .split(/[.\s_-]+/)
      .map((part) => part.charAt(0))
      .join("")
      .slice(0, 2)
      .toUpperCase() || "US"
  );
}

function buildSetorOptions(currentSetor) {
  const normalized = String(currentSetor || "").trim();
  const options = SETOR_OPTIONS.includes(normalized) ? SETOR_OPTIONS : [normalized || "LOSS", ...SETOR_OPTIONS];
  return [...new Set(options)]
    .map((setor) => `<option value="${escapeAttribute(setor)}" ${setor === normalized ? "selected" : ""}>${escapeHtml(formatSetorLabel(setor))}</option>`)
    .join("");
}

function formatSetorLabel(value) {
  const raw = String(value || "").trim();
  if (!raw) return "Não informado";
  if (raw.toUpperCase() === "LOSS") return "Loss";
  if (normalizeText(raw) === "DESENVOLVIMENTO T I" || normalizeText(raw) === "DESENVOLVIMENTO TI") return "Desenvolvimento T.I";
  if (raw === raw.toUpperCase()) {
    return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  }
  return raw;
}

function handleAvatarSelection(event) {
  const file = event.target.files?.[0] || null;
  if (!file) return;
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    showToast("Use uma imagem JPG, PNG ou WEBP.", "warn", 5200);
    event.target.value = "";
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    showToast("A foto deve ter no máximo 5 MB.", "warn", 5200);
    event.target.value = "";
    return;
  }
  if (pendingAvatarSourceUrl) URL.revokeObjectURL(pendingAvatarSourceUrl);
  pendingAvatarSourceUrl = URL.createObjectURL(file);
  pendingAvatarFile = null;
  if (el.profileCropImage) el.profileCropImage.src = pendingAvatarSourceUrl;
  if (el.profileCropZoom) el.profileCropZoom.value = "1";
  if (el.profileCropX) el.profileCropX.value = "0";
  if (el.profileCropY) el.profileCropY.value = "0";
  if (el.profileCropPanel) el.profileCropPanel.hidden = false;
  updateAvatarCropPreview();
  showToast("Ajuste o enquadramento e confirme a foto antes de salvar.", "info", 4200);
}

function updateAvatarCropPreview() {
  if (!el.profileCropImage) return;
  const zoom = Number(el.profileCropZoom?.value || 1);
  const x = Number(el.profileCropX?.value || 0);
  const y = Number(el.profileCropY?.value || 0);
  el.profileCropImage.style.transform = `translate(${x}%, ${y}%) scale(${zoom})`;
}

function cancelAvatarCrop() {
  if (pendingAvatarSourceUrl) URL.revokeObjectURL(pendingAvatarSourceUrl);
  pendingAvatarSourceUrl = "";
  pendingAvatarFile = null;
  if (el.profileCropPanel) el.profileCropPanel.hidden = true;
  if (el.profileAvatarFile) el.profileAvatarFile.value = "";
}

async function applyAvatarCrop() {
  if (!pendingAvatarSourceUrl) return;
  try {
    const image = await loadImage(pendingAvatarSourceUrl);
    const size = 512;
    const zoom = Number(el.profileCropZoom?.value || 1);
    const offsetX = Number(el.profileCropX?.value || 0) / 100;
    const offsetY = Number(el.profileCropY?.value || 0) / 100;
    const sourceSize = Math.min(image.naturalWidth, image.naturalHeight) / zoom;
    const centerX = image.naturalWidth / 2 - offsetX * sourceSize;
    const centerY = image.naturalHeight / 2 - offsetY * sourceSize;
    const sx = Math.max(0, Math.min(image.naturalWidth - sourceSize, centerX - sourceSize / 2));
    const sy = Math.max(0, Math.min(image.naturalHeight - sourceSize, centerY - sourceSize / 2));
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    context.drawImage(image, sx, sy, sourceSize, sourceSize, 0, 0, size, size);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.9));
    if (!blob) throw new Error("Não foi possível recortar a imagem.");
    if (pendingAvatarPreviewUrl) URL.revokeObjectURL(pendingAvatarPreviewUrl);
    pendingAvatarFile = new File([blob], "avatar.webp", { type: "image/webp" });
    pendingAvatarPreviewUrl = URL.createObjectURL(blob);
    if (pendingAvatarSourceUrl) URL.revokeObjectURL(pendingAvatarSourceUrl);
    pendingAvatarSourceUrl = "";
    if (el.profileCropPanel) el.profileCropPanel.hidden = true;
    if (el.profileAvatarFile) el.profileAvatarFile.value = "";
    renderProfilePage();
    showToast("Foto ajustada. Salve o perfil para aplicar.", "good", 4200);
  } catch (error) {
    console.error("Erro ao recortar avatar:", error);
    showToast("Não foi possível ajustar a foto.", "error", 5200);
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

async function saveProfile() {
  if (!currentUser || !window.authService) {
    showToast("Faça login para acessar esta função.", "warn", 5200);
    return;
  }
  const name = String(el.profileName?.value || "").trim() || "Usuário";
  const newPassword = String(el.profilePassword?.value || "");
  const confirmPassword = String(el.profilePasswordConfirm?.value || "");
  if (newPassword && newPassword.length < 6) {
    showToast("A nova senha precisa ter pelo menos 6 caracteres.", "warn", 5200);
    return;
  }
  if (newPassword && newPassword !== confirmPassword) {
    showToast("A confirmação da senha não confere.", "warn", 5200);
    return;
  }
  try {
    let avatarUrl = currentProfile?.avatar_url || "";
    if (pendingAvatarFile) {
      avatarUrl = await uploadProfileAvatar(pendingAvatarFile);
      if (!avatarUrl) return;
    }
    currentProfile = await window.authService.updateProfile(currentUser.id, {
      name,
      avatar_url: avatarUrl,
    });
    if (newPassword) {
      await window.authService.updatePassword(newPassword);
      if (el.profilePassword) el.profilePassword.value = "";
      if (el.profilePasswordConfirm) el.profilePasswordConfirm.value = "";
    }
    if (pendingAvatarPreviewUrl) {
      URL.revokeObjectURL(pendingAvatarPreviewUrl);
    }
    if (pendingAvatarSourceUrl) {
      URL.revokeObjectURL(pendingAvatarSourceUrl);
    }
    pendingAvatarFile = null;
    pendingAvatarPreviewUrl = "";
    pendingAvatarSourceUrl = "";
    await loadCurrentSession();
    await logAudit("update_profile", "profile", currentUser.id, {
      fields: ["name", "avatar_url"],
    });
    showToast("Perfil atualizado.", "good", 4200);
  } catch (error) {
    console.error("Erro ao salvar perfil:", error);
    showToast("Não foi possível salvar o perfil.", "error", 5200);
  }
}

async function uploadProfileAvatar(file) {
  if (!currentUser || !window.supabaseClient) {
    showToast("Faça login para alterar sua foto.", "warn", 5200);
    return "";
  }
  const ext = String(file.name || "").split(".").pop()?.toLowerCase() || "jpg";
  const safeExt = ["jpg", "jpeg", "png", "webp"].includes(ext) ? ext : "jpg";
  const path = `${currentUser.id}/profile-${Date.now()}.${safeExt}`;
  const { error } = await window.supabaseClient.storage
    .from("avatars")
    .upload(path, file, {
      cacheControl: "3600",
      upsert: true,
    });

  if (error) {
    console.error("Erro ao enviar avatar:", error);
    showToast("Erro ao enviar foto de perfil.", "error", 5200);
    return "";
  }

  const { data } = window.supabaseClient.storage.from("avatars").getPublicUrl(path);
  return data?.publicUrl || "";
}

function toggleDashboardView(monthlyView, packageView = false, deviationView = false) {
  if (el.monthlyBaseView) el.monthlyBaseView.hidden = !monthlyView;
  if (el.deviationManagementView) el.deviationManagementView.hidden = !deviationView;
  if (el.kpiGrid) el.kpiGrid.hidden = monthlyView || deviationView;
  if (el.tablePanel) el.tablePanel.hidden = monthlyView || deviationView;
  [el.insightGrid, el.comparisonPanel].forEach((node) => {
    if (node) node.hidden = monthlyView || packageView || deviationView;
  });
}

function normalizeDeviationCategory(value) {
  if (!value) return null;
  return DEVIATION_CATEGORIES.some((category) => category.key === value) ? value : null;
}

function getDeviationCategoryLabel(value = state.activeDesvioCategory) {
  return DEVIATION_CATEGORIES.find((category) => category.key === value)?.label || "";
}

function getDeviationCategoryConfig(value) {
  return DEVIATION_CATEGORIES.find((category) => category.key === value) || null;
}

function closeDeviationCategoryMenu(options = {}) {
  if (!isDeviationCategoryMenuOpen) return;
  isDeviationCategoryMenuOpen = false;
  closeDropdownPortal("deviation");
  if (options.render) renderTabs();
}

function openDeviationCategoryMenu() {
  closePackageTypeMenu();
  closeCustomFilterMenu("month");
  closeCustomFilterMenu("period");
  setSearchExpanded(false, { focus: false });
  isDeviationCategoryMenuOpen = true;
  renderTabs();
}

function toggleDeviationCategoryMenu() {
  if (isDeviationCategoryMenuOpen) closeDeviationCategoryMenu({ render: true });
  else openDeviationCategoryMenu();
}

function handleDeviationCategorySelection(categoryKey) {
  const category = getDeviationCategoryConfig(categoryKey);
  if (!category?.enabled) {
    showToast("Categoria em desenvolvimento.", "info", 3200);
    return;
  }
  closeTopFilterOverlays();
  clearTransientDashboardStateForNavigation();
  state.appView = "dashboard";
  state.sheet = DEVIATION_MANAGEMENT_VIEW;
  state.activeDesvioCategory = normalizeDeviationCategory(category.key);
  state.page = 1;
  isDeviationCategoryMenuOpen = false;
  if (state.activeDesvioCategory === DEVIATION_CATEGORY_PNRS && shouldLoadPnrRowsForCurrentView()) {
    isLoadingPnrRows = true;
  }
  persistState();
  hydrateControls();
  renderAll();
  if (state.activeDesvioCategory === DEVIATION_CATEGORY_PNRS) {
    void ensurePnrRowsLoaded(dashboardFileRecords).finally(() => {
      isLoadingPnrRows = false;
      hydrateControls();
      renderAll();
    });
  }
}

function renderDeviationCategoryMenu() {
  return `
    <div class="deviation-category-menu" role="menu" ${isDeviationCategoryMenuOpen ? "" : "hidden"}>
      ${DEVIATION_CATEGORIES.map((category) => {
    const isActive = normalizeDeviationCategory(state.activeDesvioCategory) === category.key;
    const itemState = [
      "deviation-category-menu__item",
      isActive ? "is-active" : "",
      category.enabled ? "" : "is-disabled",
    ].filter(Boolean).join(" ");
    return `
        <button
          type="button"
          class="${itemState}"
          data-deviation-category="${escapeAttribute(category.key)}"
          role="menuitem"
          aria-disabled="${category.enabled ? "false" : "true"}"
          aria-label="${escapeAttribute(category.enabled ? category.label : `${category.label} - Categoria em desenvolvimento`)}"
        >
          <span>${escapeHtml(category.label)}</span>
          ${
            category.enabled
              ? isActive
                ? `<span class="deviation-category-menu__status" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <path d="m5 12 4 4L19 6" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path>
                    </svg>
                  </span>`
                : ""
              : `<span class="deviation-category-menu__status" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M7 11V8a5 5 0 0 1 10 0v3m-9 0h8a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"></path>
                  </svg>
                </span>`
          }
        </button>
      `;
  }).join("")}
    </div>
  `;
}

function renderDeviationManagementView() {
  if (!el.deviationManagementView) return;
  state.activeDesvioCategory = normalizeDeviationCategory(state.activeDesvioCategory);
  if (state.activeDesvioCategory === DEVIATION_CATEGORY_PNRS) {
    el.deviationManagementView.innerHTML = renderPnrPage();
    return;
  }
  el.deviationManagementView.innerHTML = `
    <article class="panel deviation-management-panel">
      <div class="panel__header">
        <div>
          <h2>Gestão de Desvios</h2>
          <p>Selecione uma categoria para visualizar os dados.</p>
        </div>
        <span class="panel__meta">${escapeHtml(getDeviationCategoryLabel())}</span>
      </div>
      <div class="deviation-management-placeholder">
        <strong>Estrutura inicial criada</strong>
        <p>A área de Gestão de Desvios está preparada para receber PNRs, Safety e Jurídico nas próximas etapas.</p>
      </div>
    </article>
  `;
}

function getPnrRowsCacheKey() {
  return [
    pnrRowsLoadedKey,
    pnrRows.length,
    getPnrSelectedMonthKeys().join("|"),
    state.pnrQuinzena || "all",
    state.pnrStatus || "Todos",
    state.pnrTipoOperacional || "Todos",
    state.pnrEstacao || "Todos",
    normalize(state.pnrQuery),
  ].join("::");
}

function getPnrMonthOptions() {
  const rowsKey = `${pnrRowsLoadedKey}:${pnrRows.length}`;
  if (derivedDataCache.pnrMonthOptionsKey === rowsKey) return derivedDataCache.pnrMonthOptions;
  const map = new Map();
  pnrRows.forEach((row) => {
    const period = getPnrPeriodFromBillingPeriod(row.sourcePeriodo || row.periodoFaturamentoOriginal || row.periodoFaturamento) || getPnrPeriodFromDate(row.dataCaso || row.periodoFaturamento);
    const key = row.monthKey || period.monthKey;
    if (!key) return;
    map.set(key, {
      key,
      label: row.competencia || getPnrMonthFullLabel(period),
      year: Number(row.ano || period.ano || String(key).slice(0, 4) || 0),
      month: Number(row.mesNumero || period.mes || String(key).slice(5, 7) || 0),
    });
  });
  const options = Array.from(map.values())
    .sort((a, b) => (a.year - b.year) || (a.month - b.month));
  derivedDataCache.pnrMonthOptionsKey = rowsKey;
  derivedDataCache.pnrMonthOptions = options;
  return options;
}

function getPnrSelectedMonthKeys() {
  const options = getPnrMonthOptions();
  const available = new Set(options.map((option) => option.key));
  const selected = Array.isArray(state.pnrMonths) ? state.pnrMonths.filter((key) => available.has(key)) : [];
  return selected.length ? selected : options.map((option) => option.key);
}

function normalizePnrSelectValue(value, fallback = "Todos") {
  const text = String(value || "").trim();
  return text || fallback;
}

function normalizePnrLookupId(value) {
  return String(value || "")
    .trim()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, "")
    .replace(/[^\d]/g, "");
}

function getPnrDriverNameFromSourceRow(row) {
  const driver = formatDriverName(
    row?.motorista ||
      row?.driver ||
      row?.nomeMotorista ||
      row?.nome_motorista ||
      row?.nome_driver ||
      row?.driver_name ||
      row?.motoristaFormatado ||
      row?.motorista_formatado ||
      "",
    "",
  );
  return driver && !isUnidentifiedDriverName(driver) ? driver : "";
}

function getPnrSourceDriverIds(row) {
  return [
    row?.idMotorista,
    row?.id_motorista,
    row?.idDriver,
    row?.id_driver,
    row?.driverId,
    row?.driver_id,
    row?.motoristaId,
    row?.motorista_id,
  ].map(normalizePnrLookupId).filter(Boolean);
}

function getPnrSourceEnvioIds(row) {
  return [
    ...(Array.isArray(row?.ids_vinculados) ? row.ids_vinculados : []),
    ...(Array.isArray(row?.linked_ids) ? row.linked_ids : []),
    row?.idEnvio,
    row?.id_envio,
    row?.id_de_envio,
    row?.idPacote,
    row?.id_pacote,
    row?.idCaso,
    row?.id_caso,
    row?.envio,
  ].map(normalizePnrLookupId).filter(Boolean);
}

function getPnrSourceRouteIds(row) {
  return [
    row?.idRota,
    row?.id_rota,
    row?.rota,
    row?.n_rota,
    row?.numeroRota,
    row?.numero_rota,
    row?.route,
  ].map(normalizePnrLookupId).filter(Boolean);
}

function getPnrSourceBaseKey(row) {
  return normalizeBase(row?.estacaoOrigem || row?.estacao_origem || row?.base || row?.base_normalizada || row?.svc || row?.station || "");
}

function addPnrDriverIndexValue(map, key, driverName) {
  if (key && driverName && !map.has(key)) map.set(key, driverName);
}

function buildPnrDriverSourceIndex(rows) {
  const index = {
    byIdMotorista: new Map(),
    byIdEnvio: new Map(),
    byRota: new Map(),
    byBaseRota: new Map(),
  };
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const driverName = getPnrDriverNameFromSourceRow(row);
    if (!driverName) return;
    getPnrSourceDriverIds(row).forEach((id) => addPnrDriverIndexValue(index.byIdMotorista, id, driverName));
    getPnrSourceEnvioIds(row).forEach((id) => addPnrDriverIndexValue(index.byIdEnvio, id, driverName));
    const base = getPnrSourceBaseKey(row);
    getPnrSourceRouteIds(row).forEach((rota) => {
      addPnrDriverIndexValue(index.byRota, rota, driverName);
      if (base) addPnrDriverIndexValue(index.byBaseRota, `${base}|${rota}`, driverName);
    });
  });
  return index;
}

function getLoadedRowsForPnrDriverLookup(fileCategory) {
  const rows = [];
  (Array.isArray(library.datasets) ? library.datasets : []).forEach((dataset) => {
    if (!dataset || dataset.source === "filtered" || !Array.isArray(dataset.rows)) return;
    const category = dataset.fileCategory || getFileRecordCategory(dataset.remoteRecord || dataset);
    if (category === fileCategory) rows.push(...dataset.rows);
  });
  if (fileCategory === PRE_FATURA_FILE_CATEGORY && Array.isArray(allRows)) rows.push(...allRows);
  if (fileCategory === PACKAGE_MANAGEMENT_FILE_CATEGORY && Array.isArray(packageManagementRows)) rows.push(...packageManagementRows);
  return rows;
}

function buildPnrDriverLookupIndexes() {
  return {
    preFatura: buildPnrDriverSourceIndex(getLoadedRowsForPnrDriverLookup(PRE_FATURA_FILE_CATEGORY)),
    gestaoPacotes: buildPnrDriverSourceIndex(getLoadedRowsForPnrDriverLookup(PACKAGE_MANAGEMENT_FILE_CATEGORY)),
  };
}

function lookupPnrDriverNameInIndex(row, index) {
  const idMotorista = normalizePnrLookupId(row?.idMotorista);
  const idEnvio = normalizePnrLookupId(row?.idEnvio);
  const idRota = normalizePnrLookupId(row?.idRota);
  const base = getPnrSourceBaseKey(row);
  const baseRota = base && idRota ? `${base}|${idRota}` : "";
  const lookups = [
    ["ID do motorista", index.byIdMotorista, idMotorista],
    ["ID de envio", index.byIdEnvio, idEnvio],
    ["ID da rota", index.byRota, idRota],
    ["Base + ID rota", index.byBaseRota, baseRota],
  ];
  for (const [method, map, key] of lookups) {
    const driver = key ? map.get(key) : "";
    if (driver && !isUnidentifiedDriverName(driver)) return { driver, method };
  }
  return null;
}

function enrichPnrRowWithDriverName(row, indexes = buildPnrDriverLookupIndexes()) {
  const normalized = normalizePnrStoredRow(row);
  if (!normalized) return null;
  const existingName = getPnrDriverNameFromSourceRow({
    motorista: normalized.nomeMotorista,
    driver: normalized.nome_motorista,
  });
  const found =
    existingName
      ? { driver: existingName, method: normalized.motoristaMatchSource || "Arquivo PNR" }
      : lookupPnrDriverNameInIndex(normalized, indexes.preFatura) ||
        lookupPnrDriverNameInIndex(normalized, indexes.gestaoPacotes);
  const sourcePrefix = found?.driver && !existingName
    ? (lookupPnrDriverNameInIndex(normalized, indexes.preFatura)?.driver === found.driver ? "Pré-Fatura" : "Gestão de Pacotes")
    : "";
  const nomeMotorista = found?.driver || "";
  const motoristaDisplay = nomeMotorista || (normalized.idMotorista ? `ID ${normalized.idMotorista}` : "");
  return {
    ...normalized,
    nomeMotorista,
    motoristaDisplay,
    motoristaMatchSource: found?.method ? [sourcePrefix, found.method].filter(Boolean).join(" · ") : "",
    _search: buildPnrSearchText({ ...normalized, nomeMotorista, motoristaDisplay }),
  };
}

function enrichPnrRowsWithDriverNames(rows, indexes = buildPnrDriverLookupIndexes()) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => enrichPnrRowWithDriverName(row, indexes))
    .filter(Boolean);
}

function getPnrDriverEnrichmentKey() {
  const datasetKey = (Array.isArray(library.datasets) ? library.datasets : [])
    .filter((dataset) => dataset?.source !== "filtered")
    .map((dataset) => `${dataset.id || dataset.fileName || ""}:${dataset.fileCategory || getFileRecordCategory(dataset.remoteRecord || dataset)}:${dataset.rows?.length || 0}`)
    .join("|");
  return `${pnrRowsLoadedKey}:${pnrRows.length}:${allRows.length}:${packageManagementRowsLoadedKey}:${packageManagementRows.length}:${datasetKey}`;
}

function ensurePnrDriverEnrichment() {
  const key = getPnrDriverEnrichmentKey();
  if (pnrDriverEnrichmentKey === key) return;
  const indexes = buildPnrDriverLookupIndexes();
  pnrRows = dedupePnrRecords(enrichPnrRowsWithDriverNames(pnrRows, indexes)).rows;
  pnrDriverEnrichmentKey = key;
  derivedDataCache.pnrKey = "";
  derivedDataCache.pnrRows = [];
}

function getPnrFilterOptions() {
  ensurePnrDriverEnrichment();
  const statuses = new Set();
  const tipos = new Set();
  const estacoes = new Set();
  pnrRows.forEach((row) => {
    if (row.statusNormalizado) statuses.add(row.statusNormalizado);
    if (row.tipoOperacional) tipos.add(row.tipoOperacional);
    if (row.estacaoOrigem) estacoes.add(row.estacaoOrigem);
  });
  return {
    statuses: Array.from(statuses).sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" })),
    tipos: Array.from(tipos).sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" })),
    estacoes: Array.from(estacoes).sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" })),
  };
}

function getFilteredPnrRows() {
  ensurePnrDriverEnrichment();
  const cacheKey = getPnrRowsCacheKey();
  if (derivedDataCache.pnrKey === cacheKey) return derivedDataCache.pnrRows;
  const selectedMonths = new Set(getPnrSelectedMonthKeys());
  const selectedQuinzena = state.pnrQuinzena || "all";
  const selectedStatus = normalizePnrSelectValue(state.pnrStatus);
  const selectedTipo = normalizePnrSelectValue(state.pnrTipoOperacional);
  const selectedEstacao = normalizePnrSelectValue(state.pnrEstacao);
  const query = normalize(state.pnrQuery);
  const rows = pnrRows.filter((row) => {
    const monthKey = row.monthKey || getPnrPeriodFromBillingPeriod(row.sourcePeriodo || row.periodoFaturamentoOriginal || row.periodoFaturamento)?.monthKey || getPnrPeriodFromDate(row.dataCaso || row.periodoFaturamento).monthKey;
    if (selectedMonths.size && !selectedMonths.has(monthKey)) return false;
    if (selectedQuinzena !== "all" && getPeriodModeFromLabel(row.quinzena) !== selectedQuinzena) return false;
    if (selectedStatus !== "Todos" && row.statusNormalizado !== selectedStatus) return false;
    if (selectedTipo !== "Todos" && row.tipoOperacional !== selectedTipo) return false;
    if (selectedEstacao !== "Todos" && row.estacaoOrigem !== selectedEstacao) return false;
    if (query && !String(row._search || "").includes(query)) return false;
    return true;
  });
  derivedDataCache.pnrKey = cacheKey;
  derivedDataCache.pnrRows = rows;
  return rows;
}

function buildPnrSummary(rows) {
  const baseRows = Array.isArray(rows) ? rows : [];
  const totalValue = baseRows.reduce((sum, row) => sum + Number(row.valorCompraNumerico || 0), 0);
  const anulado = baseRows.filter((row) => row.statusNormalizado === "Anulado").length;
  const faturamento = baseRows.filter((row) => row.statusNormalizado === "Enviado para faturamento").length;
  return {
    count: baseRows.length,
    totalValue,
    avgValue: baseRows.length ? totalValue / baseRows.length : 0,
    anulado,
    faturamento,
    aberto: Math.max(0, baseRows.length - anulado - faturamento),
  };
}

function buildPnrStatusRows(rows) {
  const total = rows.length || 0;
  const map = new Map();
  rows.forEach((row) => {
    const key = row.statusNormalizado || "Indefinido";
    map.set(key, (map.get(key) || 0) + 1);
  });
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count, share: total ? (count / total) * 100 : 0 }))
    .sort((a, b) => b.count - a.count);
}

function buildPnrOperationRows(rows) {
  const order = ["SVC", "XPT", "Indefinido"];
  const total = rows.length || 0;
  const map = new Map(order.map((label) => [label, 0]));
  rows.forEach((row) => {
    const key = order.includes(row.tipoOperacional) ? row.tipoOperacional : "Indefinido";
    map.set(key, (map.get(key) || 0) + 1);
  });
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count, share: total ? (count / total) * 100 : 0 }))
    .sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label));
}

function buildPnrRanking(rows, key, fallbackLabel = "Sem identificação") {
  const total = rows.length || 0;
  const map = new Map();
  rows.forEach((row) => {
    const label = String(row[key] || "").trim() || fallbackLabel;
    const entry = map.get(label) || { label, count: 0, totalValue: 0 };
    entry.count += 1;
    entry.totalValue += Number(row.valorCompraNumerico || 0);
    map.set(label, entry);
  });
  return Array.from(map.values())
    .map((item) => ({ ...item, share: total ? (item.count / total) * 100 : 0 }))
    .sort((a, b) => b.count - a.count || b.totalValue - a.totalValue)
    .slice(0, 8);
}

function buildPnrDriverRanking(rows) {
  const baseRows = Array.isArray(rows) ? rows : [];
  const map = new Map();
  baseRows.forEach((row) => {
    const driverId = formatPnrId(row.idMotorista || "");
    const driverName = getPnrDriverNameFromSourceRow({ motorista: row.nomeMotorista });
    const label = driverName || (driverId ? `ID ${driverId}` : "");
    if (!label) return;
    const key = driverName ? normalizeDriverName(driverName) || label : `ID:${driverId}`;
    const entry = map.get(key) || { label, detail: driverId && driverName ? `ID: ${driverId}` : "", count: 0, totalValue: 0 };
    entry.count += 1;
    entry.totalValue += Number(row.valorCompraNumerico || 0);
    map.set(key, entry);
  });
  return Array.from(map.values())
    .map((item) => ({ ...item, share: baseRows.length ? (item.count / baseRows.length) * 100 : 0 }))
    .sort((a, b) => b.count - a.count || b.totalValue - a.totalValue || a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }))
    .slice(0, 8);
}

function buildPnrEvolutionRows(rows) {
  const map = new Map();
  rows.forEach((row) => {
    const period = getPnrPeriodFromBillingPeriod(row.sourcePeriodo || row.periodoFaturamentoOriginal || row.periodoFaturamento) || getPnrPeriodFromDate(row.dataCaso || row.periodoFaturamento);
    const key = row.monthKey || period.monthKey;
    const item = map.get(key) || {
      key,
      label: row.competencia || getPnrMonthFullLabel(period),
      year: Number(row.ano || period.ano || String(key).slice(0, 4) || 0),
      month: Number(row.mesNumero || period.mes || String(key).slice(5, 7) || 0),
      count: 0,
      totalValue: 0,
    };
    item.count += 1;
    item.totalValue += Number(row.valorCompraNumerico || 0);
    map.set(key, item);
  });
  return Array.from(map.values()).sort((a, b) => (a.year - b.year) || (a.month - b.month));
}

function getPnrChronologicalSortParts(row) {
  const period = getPnrPeriodFromBillingPeriod(row.sourcePeriodo || row.periodoFaturamentoOriginal || row.periodoFaturamento) || getPnrPeriodFromDate(row.dataCaso || row.periodoFaturamento);
  return {
    year: Number(row.ano || period.ano || 0),
    month: Number(row.mesNumero || period.mes || 0),
    quarter: getPeriodModeFromLabel(row.quinzena || period.quinzena) === "q2" ? 2 : 1,
    dataCaso: row.dataCaso || "",
    idCaso: row.idCaso || "",
  };
}

function comparePnrChronologicalRows(a, b) {
  const av = getPnrChronologicalSortParts(a);
  const bv = getPnrChronologicalSortParts(b);
  return (
    (av.year - bv.year) ||
    (av.month - bv.month) ||
    (av.quarter - bv.quarter) ||
    String(av.dataCaso).localeCompare(String(bv.dataCaso), "pt-BR", { numeric: true, sensitivity: "base" }) ||
    String(av.idCaso).localeCompare(String(bv.idCaso), "pt-BR", { numeric: true, sensitivity: "base" })
  );
}

function sortPnrRows(rows) {
  const sortKey = rows.some((row) => Object.prototype.hasOwnProperty.call(row, state.sortKey)) ? state.sortKey : "";
  const dir = state.sortDir === "desc" ? -1 : 1;
  if (!sortKey) return rows.slice().sort(comparePnrChronologicalRows);
  return rows.slice().sort((a, b) => {
    if (sortKey === "competencia" || sortKey === "quinzena" || sortKey === "periodoLabel") return comparePnrChronologicalRows(a, b) * dir;
    const av = sortKey === "valorCompraNumerico" ? Number(a[sortKey] || 0) : a[sortKey];
    const bv = sortKey === "valorCompraNumerico" ? Number(b[sortKey] || 0) : b[sortKey];
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
    return String(av || "").localeCompare(String(bv || ""), "pt-BR", { numeric: true, sensitivity: "base" }) * dir;
  });
}

const PNR_TABLE_COLUMNS = [
  { key: "idCaso", label: "ID DO CASO", width: 120, format: "text" },
  { key: "dataCaso", label: "DATA DO CASO", width: 150, format: "date" },
  { key: "statusNormalizado", label: "STATUS", width: 160, format: "status" },
  { key: "periodoFaturamentoOriginal", label: "PERÍODO DE FATURAMENTO", width: 170, format: "text" },
  { key: "dataPedidoRevisao", label: "DATA DO PEDIDO DE REVISÃO", width: 200, format: "date" },
  { key: "pedidoRevisao", label: "PEDIDO DE REVISÃO", width: 180, format: "text" },
  { key: "dataEncerramentoCaso", label: "DATA DE ENCERRAMENTO DO CASO", width: 220, format: "date" },
  { key: "repAssistente", label: "REP - ASSISTENTE", width: 180, format: "text" },
  { key: "comentarioEncerramento", label: "COMENTÁRIO DE ENCERRAMENTO", width: 260, format: "long" },
  { key: "numeroPreFatura", label: "N° DA PRÉ-FATURA", width: 160, format: "text" },
  { key: "idEnvio", label: "ID DE ENVIO", width: 150, format: "text" },
  { key: "produtos", label: "PRODUTOS", width: 280, format: "long" },
  { key: "valorCompraOriginal", label: "VALOR DA COMPRA", width: 150, format: "currencyText" },
  { key: "repTransportadora", label: "REP TRANSPORTADORA", width: 180, format: "text" },
  { key: "estacaoOrigem", label: "ESTAÇÃO DE ORIGEM", width: 160, format: "text" },
  { key: "idRota", label: "ID DA ROTA", width: 140, format: "text" },
  { key: "idMotorista", label: "ID DO MOTORISTA", width: 150, format: "text" },
  { key: "dataEntrega", label: "DATA DE ENTREGA", width: 160, format: "date" },
  { key: "idReclamacao", label: "ID DA RECLAMAÇÃO", width: 170, format: "text" },
  { key: "mes", label: "MÊS", width: 120, format: "text" },
  { key: "quinzenaRef", label: "QUINZENA REF.", width: 160, format: "text" },
  { key: "valorCompraNumerico", label: "VAL. COMPRA", width: 140, format: "currency" },
];

function formatPnrTableCell(row, column) {
  const value = row?.[column.key];
  if (column.format === "date") return escapeHtml(formatDate(value));
  if (column.format === "currency") return escapeHtml(currency.format(Number(value || 0)));
  if (column.format === "currencyText") return escapeHtml(String(value || row?.valorCompraFormatado || currency.format(Number(row?.valorCompraNumerico || 0))));
  if (column.format === "status") return `<span class="badge">${escapeHtml(value || "—")}</span>`;
  return escapeHtml(value || "—");
}

function renderPnrFilterSelect(name, label, value, options, allLabel = "Todos") {
  return `
    <label class="pnr-filter-control">
      <span>${escapeHtml(label)}</span>
      <select data-pnr-filter="${escapeAttribute(name)}">
        <option value="Todos"${value === "Todos" ? " selected" : ""}>${escapeHtml(allLabel)}</option>
        ${options.map((option) => {
          const optionValue = typeof option === "string" ? option : option.value;
          const optionLabel = typeof option === "string" ? option : option.label;
          return `<option value="${escapeAttribute(optionValue)}"${String(optionValue) === String(value) ? " selected" : ""}>${escapeHtml(optionLabel)}</option>`;
        }).join("")}
      </select>
    </label>
  `;
}

function renderPnrBarList(rows, options = {}) {
  if (!rows.length) return emptyState("Sem dados", "Nenhum registro encontrado no recorte.");
  const max = Math.max(...rows.map((row) => row.count), 1);
  return `
    <div class="pnr-bar-list">
      ${rows.map((row) => `
        <div class="pnr-bar-row pnr-tooltip-target" data-tooltip-title="${escapeAttribute(row.label)}" data-tooltip-lines="${escapeAttribute(`${integer.format(row.count)} casos|${formatPercent(row.share)} do recorte${options.showValue ? `|${currency.format(row.totalValue || 0)}` : ""}`)}">
          <div class="pnr-bar-row__label">
            <strong>${escapeHtml(row.label)}</strong>
            <span>${integer.format(row.count)} · ${formatPercent(row.share)}</span>
          </div>
          <div class="pnr-bar-row__track"><span style="width:${Math.max(3, (row.count / max) * 100)}%"></span></div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderPnrRankingList(rows, emptyTitle) {
  if (!rows.length) return emptyState(emptyTitle, "Nenhum registro encontrado no recorte.");
  return `
    <div class="pnr-ranking-list">
      ${rows.map((row, index) => `
        <div class="pnr-ranking-row pnr-tooltip-target" data-tooltip-title="${escapeAttribute(row.label)}" data-tooltip-lines="${escapeAttribute(`${row.detail ? `${row.detail}|` : ""}${integer.format(row.count)} PNRs|${currency.format(row.totalValue)}|${formatPercent(row.share)} do recorte`)}">
          <span class="pnr-ranking-row__index">${index + 1}</span>
          <div>
            <strong>${escapeHtml(row.label)}</strong>
            <small>${escapeHtml(row.detail ? `${row.detail} · ` : "")}${integer.format(row.count)} casos · ${currency.format(row.totalValue)}</small>
          </div>
          <span>${formatPercent(row.share)}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function renderPnrEvolution(rows) {
  if (!rows.length) return emptyState("Sem evolução", "Nenhum mês encontrado no recorte.");
  const max = Math.max(...rows.map((row) => row.count), 1);
  return `
    <div class="pnr-evolution-list">
      ${rows.map((row) => `
        <div class="pnr-evolution-row pnr-tooltip-target" data-tooltip-title="${escapeAttribute(row.label)}" data-tooltip-lines="${escapeAttribute(`${integer.format(row.count)} casos|${currency.format(row.totalValue)}`)}">
          <span>${escapeHtml(row.label)}</span>
          <div class="pnr-evolution-row__track"><span style="width:${Math.max(3, (row.count / max) * 100)}%"></span></div>
          <strong>${integer.format(row.count)}</strong>
          <small>${currency.format(row.totalValue)}</small>
        </div>
      `).join("")}
    </div>
  `;
}

function renderPnrTable(rows, allRows) {
  const totalPages = Math.max(1, Math.ceil(allRows.length / state.pageSize));
  state.page = Math.min(Math.max(1, state.page), totalPages);
  const tableMinWidth = PNR_TABLE_COLUMNS.reduce((sum, column) => sum + column.width, 0);
  return `
    <article class="panel pnr-table-panel">
      <div class="panel__header">
        <div>
          <h3>Tabela detalhada de PNRs</h3>
          <p>${integer.format(allRows.length)} registros no recorte</p>
        </div>
        <label class="table-page-size">
          Linhas por página
          <select data-pnr-filter="pageSize">
            ${[10, 15, 25, 50, 100].map((size) => `<option value="${size}"${Number(state.pageSize) === size ? " selected" : ""}>${size}</option>`).join("")}
          </select>
        </label>
      </div>
      <div class="table-wrap pnr-table-wrap">
        <table style="min-width:${tableMinWidth}px">
          <colgroup>
            ${PNR_TABLE_COLUMNS.map((column) => `<col style="width:${column.width}px; min-width:${column.width}px">`).join("")}
          </colgroup>
          <thead>
            <tr>
              ${PNR_TABLE_COLUMNS.map((column) => `<th data-pnr-sort="${escapeAttribute(column.key)}" class="${column.format === "currency" || column.format === "currencyText" ? "is-right" : ""}">${escapeHtml(column.label)}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${rows.length ? rows.map((row) => `
              <tr>
                ${PNR_TABLE_COLUMNS.map((column) => `<td class="${column.format === "currency" || column.format === "currencyText" ? "is-right" : ""}">${formatPnrTableCell(row, column)}</td>`).join("")}
              </tr>
            `).join("") : `<tr><td colspan="${PNR_TABLE_COLUMNS.length}">${emptyState("Sem registros", "Ajuste os filtros ou carregue uma planilha de PNR.")}</td></tr>`}
          </tbody>
        </table>
      </div>
      <div class="pagination">
        <button type="button" class="secondary-button" data-pnr-page="prev"${state.page <= 1 ? " disabled" : ""}>Anterior</button>
        <span>Página ${integer.format(state.page)} de ${integer.format(totalPages)}</span>
        <button type="button" class="secondary-button" data-pnr-page="next"${state.page >= totalPages ? " disabled" : ""}>Próxima</button>
      </div>
    </article>
  `;
}

function renderPnrPage() {
  const filteredRows = getFilteredPnrRows();
  const sortedRows = sortPnrRows(filteredRows);
  const pagedRows = paginateRows(sortedRows);
  const monthOptions = getPnrMonthOptions();
  const selectedMonths = getPnrSelectedMonthKeys();
  const filterOptions = getPnrFilterOptions();
  const summary = buildPnrSummary(filteredRows);
  const cards = [
    { label: "Total de PNRs", value: integer.format(summary.count), tone: "kpi-card--volume", delta: "Registros no recorte" },
    { label: "Valor total dos produtos", value: currency.format(summary.totalValue), tone: "kpi-card--finance", delta: "Soma de valor da compra" },
    { label: "Valor médio dos produtos", value: currency.format(summary.avgValue), tone: "kpi-card--neutral", delta: "Média por registro" },
    { label: "Anulados", value: integer.format(summary.anulado), tone: "kpi-card--problem", delta: `${formatPercent(summary.count ? (summary.anulado / summary.count) * 100 : 0)} do recorte` },
    { label: "Enviados para faturamento", value: integer.format(summary.faturamento), tone: "kpi-card--volume", delta: `${formatPercent(summary.count ? (summary.faturamento / summary.count) * 100 : 0)} do recorte` },
    { label: "Status em aberto/análise", value: integer.format(summary.aberto), tone: "kpi-card--neutral", delta: "Status restantes no recorte" },
  ];
  const monthSelectOptions = monthOptions.map((option) => ({ value: option.key, label: option.label }));
  const selectedMonthValue = selectedMonths.length === monthOptions.length ? "Todos" : selectedMonths[0] || "Todos";
  const statusRows = buildPnrStatusRows(filteredRows);
  const operationRows = buildPnrOperationRows(filteredRows);
  const stationRows = buildPnrRanking(filteredRows, "estacaoOrigem", "Sem estação");
  const driverRows = buildPnrDriverRanking(filteredRows);
  const evolutionRows = buildPnrEvolutionRows(filteredRows);
  const pnrLoadState = isLoadingPnrRows && !pnrRows.length
    ? emptyState("Carregando PNRs", "Os registros processados estão sendo carregados.")
    : !pnrRows.length
      ? emptyState("Nenhum arquivo de PNR carregado", "Envie uma planilha de PNR em Configurações gerais para preencher esta visão.")
      : "";
  return `
    <section class="pnr-page">
      <article class="panel deviation-management-panel pnr-hero-panel">
        <div class="panel__header">
          <div>
            <h2>Gestão de Desvios · PNRs</h2>
            <p>Análise de casos PNR separada das bases de Pré-Fatura e Gestão de Pacotes.</p>
          </div>
          <span class="panel__meta">${integer.format(pnrRows.length)} registros carregados</span>
        </div>
        <div class="pnr-filter-bar">
          <label class="pnr-search">
            <span aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="m21 21-4.35-4.35M10.8 18a7.2 7.2 0 1 1 0-14.4 7.2 7.2 0 0 1 0 14.4Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2"></path></svg>
            </span>
            <input type="search" data-pnr-query value="${escapeAttribute(state.pnrQuery || "")}" placeholder="Buscar" autocomplete="off">
          </label>
          ${renderPnrFilterSelect("month", "Mês", selectedMonthValue, monthSelectOptions)}
          <label class="pnr-filter-control">
            <span>Quinzena</span>
            <select data-pnr-filter="quinzena">
              <option value="all"${(state.pnrQuinzena || "all") === "all" ? " selected" : ""}>Todas</option>
              <option value="q1"${state.pnrQuinzena === "q1" ? " selected" : ""}>1ª quinzena</option>
              <option value="q2"${state.pnrQuinzena === "q2" ? " selected" : ""}>2ª quinzena</option>
            </select>
          </label>
          ${renderPnrFilterSelect("status", "Status", normalizePnrSelectValue(state.pnrStatus), filterOptions.statuses)}
          ${renderPnrFilterSelect("tipo", "Tipo operacional", normalizePnrSelectValue(state.pnrTipoOperacional), filterOptions.tipos)}
          ${renderPnrFilterSelect("estacao", "Estação de origem", normalizePnrSelectValue(state.pnrEstacao), filterOptions.estacoes)}
          <button type="button" class="secondary-button" data-pnr-clear>Limpar</button>
        </div>
      </article>

      ${pnrLoadState}

      <section class="kpi-grid__group kpi-grid__group--main pnr-kpi-grid" aria-label="Cards principais de PNRs">
        ${cards.map((card, index) => renderKpiCard(card, index)).join("")}
      </section>

      <section class="pnr-analysis-grid">
        <article class="panel pnr-chart-panel">
          <div class="panel__header"><div><h3>Distribuição por status</h3><p>Quantidade e percentual no recorte</p></div></div>
          ${renderPnrBarList(statusRows)}
        </article>
        <article class="panel pnr-chart-panel">
          <div class="panel__header"><div><h3>Casos por operação</h3><p>SVC, XPT e indefinidos pela estação de origem</p></div></div>
          ${renderPnrBarList(operationRows)}
        </article>
        <article class="panel pnr-chart-panel">
          <div class="panel__header"><div><h3>Estações com maior volume</h3><p>Ranking por estação de origem</p></div></div>
          ${renderPnrRankingList(stationRows, "Sem estações")}
        </article>
        <article class="panel pnr-chart-panel">
          <div class="panel__header"><div><h3>Motoristas com maior volume de PNR</h3><p>Nome localizado por cruzamento ou ID do motorista</p></div></div>
          ${renderPnrRankingList(driverRows, "Sem motoristas")}
        </article>
        <article class="panel pnr-chart-panel pnr-chart-panel--wide">
          <div class="panel__header"><div><h3>Evolução temporal</h3><p>Quantidade e valor total por mês</p></div></div>
          ${renderPnrEvolution(evolutionRows)}
        </article>
      </section>

      ${renderPnrTable(pagedRows, sortedRows)}
    </section>
  `;
}

function hasLoadedDashboardData() {
  return activeDataset && activeDataset.id !== EMPTY_DATASET_ID && Array.isArray(allRows) && allRows.length > 0;
}

function getDashboardState(filteredRows = null) {
  if (dashboardVisualState) return getDashboardStateConfig(dashboardVisualState);
  if (!currentUser) return getDashboardStateConfig("not-authenticated");
  const hasData = state.sheet === PACKAGE_MANAGEMENT_VIEW ? packageManagementRows.length > 0 : hasLoadedDashboardData();
  if (!hasData) {
    const config = getDashboardStateConfig("no-active-file");
    if (!canEdit()) {
      return {
        ...config,
        description: "Nenhum arquivo foi encontrado. Solicite a um administrador o envio de um arquivo.",
        action: "",
        actionLabel: "",
      };
    }
    return config;
  }
  if (Array.isArray(filteredRows) && !filteredRows.length) return getDashboardStateConfig("no-filter-results");
  return null;
}

function getDashboardStateConfig(type) {
  return DASHBOARD_STATE_CONFIG[type] || DASHBOARD_STATE_CONFIG["no-active-file"];
}

function setDashboardVisualState(type, options = {}) {
  dashboardVisualState = type || "";
  if (options.render === false) {
    updateDatasetMeta();
    return;
  }
  if (state.appView === "dashboard") {
    renderAll();
  } else {
    updateDatasetMeta();
  }
}

function renderDashboardState(status) {
  const emptyStatus = typeof status === "string" ? getDashboardStateConfig(status) : status;
  if (el.monthlyBaseView) el.monthlyBaseView.hidden = true;
  if (el.deviationManagementView) el.deviationManagementView.hidden = true;
  [el.insightGrid, el.comparisonPanel, el.tablePanel].forEach((node) => {
    if (node) node.hidden = true;
  });
  if (el.kpiGrid) {
    el.kpiGrid.hidden = false;
    el.kpiGrid.innerHTML = `
      <article class="dashboard-wait-card dashboard-wait-card--${escapeAttribute(emptyStatus.state)}">
        <div class="dashboard-wait-card__visual" aria-hidden="true">
          <span></span>
          <span></span>
          <span></span>
        </div>
        <div class="dashboard-wait-card__copy">
          <strong>${escapeHtml(emptyStatus.title)}</strong>
          <p>${escapeHtml(emptyStatus.description)}</p>
          ${
            emptyStatus.action
              ? `<button class="secondary-button" type="button" data-empty-action="${escapeAttribute(emptyStatus.action)}">${escapeHtml(emptyStatus.actionLabel || "Continuar")}</button>`
                : ""
          }
        </div>
      </article>
    `;
  }
}

function showPermissionDeniedState() {
  setDashboardVisualState("permission-denied");
  window.clearTimeout(dashboardPermissionTimer);
  dashboardPermissionTimer = window.setTimeout(() => {
    if (dashboardVisualState !== "permission-denied") return;
    setDashboardVisualState("");
  }, 5200);
}

function resetDashboardFilters() {
  Object.assign(state, {
    query: "",
    sheet: PRE_FATURA_VIEW,
    tipo: "Todos",
    prefaturaTipo: "Todos",
    packageTipo: "Todos",
    activeDesvioCategory: null,
    base: "Todos",
    motorista: "Todos",
    period: "month",
    monthFilter: "",
    appView: "dashboard",
    sortKey: "valor_numerico",
    sortDir: "desc",
    page: 1,
    pageSize: Number(el.pageSize?.value || state.pageSize || 15),
  });
  if (dashboardVisualState === "no-filter-results" || dashboardVisualState === "permission-denied") {
    dashboardVisualState = "";
  }
  hydrateControls();
  persistState();
  renderAll();
  showToast("Filtros limpos.", "info");
}

async function retryDashboardLoad() {
  setDashboardVisualState(currentUser ? "loading-files" : "loading-session");
  try {
    await loadCurrentSession({ showSessionWarning: true });
  } catch (error) {
    console.error("Erro ao tentar recarregar dashboard:", error);
    setDashboardVisualState("supabase-error");
  }
}

function buildPackageManagementSummary(rows) {
  const summary = {
    count: 0,
    alcValue: 0,
    driverValue: 0,
    dispatcherValue: 0,
    driverErrors: 0,
    dispatcherErrors: 0,
    mercadoLivreErrors: 0,
    pendingCount: 0,
  };
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    if (!isPackageManagementDetailRow(row)) return;
    summary.count += 1;
    const category = row.categoria_final;
    const value = Math.abs(Number(row.valor_numerico || 0));
    if (category === "ALC") {
      summary.alcValue += value;
    } else if (category === "DRIVER") {
      summary.driverValue += value;
      summary.driverErrors += 1;
    } else if (category === "DISPATCHER") {
      summary.dispatcherValue += value;
      summary.dispatcherErrors += 1;
    } else if (category === "MERCADO_LIVRE") {
      summary.mercadoLivreErrors += 1;
    } else if (category === "INDEFINIDO") {
      summary.pendingCount += 1;
    }
  });
  return {
    count: summary.count,
    alcValue: summary.alcValue,
    driverValue: summary.driverValue,
    dispatcherValue: summary.dispatcherValue,
    driverErrors: summary.driverErrors,
    dispatcherErrors: summary.dispatcherErrors,
    mercadoLivreErrors: summary.mercadoLivreErrors,
    pendingCount: summary.pendingCount,
  };
}

function getMonthNumberFromAny(value) {
  const normalizedReference = normalizeReferenceMonth(value);
  if (normalizedReference) return normalizedReference;
  const detected = monthNumber(value);
  if (detected) return String(detected).padStart(2, "0");
  const normalized = normalizeText(value);
  const abbrIndex = MONTH_ABBR.findIndex((month) => normalizeText(month) === normalized || normalized.includes(normalizeText(month)));
  return abbrIndex >= 0 ? String(abbrIndex + 1).padStart(2, "0") : "";
}

function getPackageManagementMonthKey(row) {
  const text = `${row?.competencia || ""} ${row?.arquivo_origem || ""}`;
  const year = normalizeReferenceYear(row?.ano || row?.reference_year || detectYear(text));
  const month = getMonthNumberFromAny(row?.reference_month || row?.mes || row?.competencia || row?.arquivo_origem);
  return year && month ? `${year}-${month}` : "";
}

function getPackageManagementPeriodType(row) {
  const direct = normalizePeriodMode(row?.period_type || row?.periodType || "");
  if (direct !== "month") return direct;
  return getPeriodModeFromLabel(`${row?.quinzena || ""} ${row?.period_label || ""} ${row?.arquivo_origem || ""}`);
}

function filterPackageManagementRowsByPeriod(rows, monthSelection = getPackageMonthSelectionValues(), periodMode = state.packagePeriod || "month") {
  const options = getAvailablePackageMonthOptions();
  const selectedMonths = normalizeMonthSelection(monthSelection, options);
  const allMonthsSelected = !options.length || selectedMonths.length === options.length;
  const normalizedPeriod = normalizePeriodMode(periodMode);
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    const rowMonthKey = getPackageManagementMonthKey(row);
    if (!allMonthsSelected && !selectedMonths.includes(rowMonthKey)) return false;
    if (normalizedPeriod === "month") return true;
    return getPackageManagementPeriodType(row) === normalizedPeriod;
  });
}

function normalizeMatchId(value) {
  return String(value || "")
    .trim()
    .replace(/[^\w\d]+/g, "")
    .toUpperCase();
}

function normalizeEnvioId(value) {
  return String(value || "").trim().replace(/\D/g, "");
}

function getPackageMatchIds(row) {
  const ids = [
    ...(Array.isArray(row?.ids_vinculados) ? row.ids_vinculados : []),
    ...(Array.isArray(row?.linked_ids) ? row.linked_ids : []),
    row?.idPacote,
    row?.id_pacote,
    row?.id_do_pacote,
    row?.idEnvio,
    row?.id_envio,
    row?.id_de_envio,
    row?.envio,
  ];
  return [...new Set(ids.map(normalizeMatchId).filter(Boolean))];
}

function getPackageEnvioIds(row) {
  const ids = [
    ...(Array.isArray(row?.ids_vinculados) ? row.ids_vinculados : []),
    ...(Array.isArray(row?.linked_ids) ? row.linked_ids : []),
    row?.idEnvio,
    row?.id_envio,
    row?.id_de_envio,
    row?.idDoPacote,
    row?.id_do_pacote,
    row?.idPacote,
    row?.id_pacote,
    row?.idCaso,
    row?.id_caso,
    row?.id,
    row?.envio,
    row?.caso,
  ];
  return [...new Set(ids.map(normalizeEnvioId).filter(Boolean))];
}

function getCaseMatchId(row) {
  return normalizeMatchId(row?.idCaso || row?.id_caso || row?.id_caso_adm || row?.caso);
}

function getMatchRoute(row) {
  return normalizeText(row?.rota || row?.numeroRota || row?.numero_rota || row?.n_rota || row?.route);
}

function getMatchDriver(row) {
  return normalizeDriver(row?.driver || row?.motorista || row?.nomeMotorista || row?.nome_driver);
}

function getMatchBase(row) {
  return normalizeBase(row?.base || row?.base_normalizada || row?.svc || row?.estacao || row?.station || row?.unidade || row?.sigla_base);
}

function getMatchAmount(row) {
  const value = row?.valor_numerico ?? row?.valor ?? row?.desconto;
  const amount = normalizeOccurrenceAmount(value);
  return amount ? amount.toFixed(2) : "";
}

function getMatchDate(row) {
  const raw = row?.data_normalizada || row?.data || row?.data_sort || "";
  if (!raw) return "";
  const parsed = parseDateValue(raw);
  return parsed.iso || "";
}

function buildMatchKey(parts) {
  return parts.every(Boolean) ? parts.join("|") : "";
}

function buildPrefaturaMatchIndex(rows) {
  if (Array.isArray(rows) && prefaturaMatchIndexCache.has(rows)) {
    return prefaturaMatchIndexCache.get(rows);
  }
  const index = {
    byPackageId: new Map(),
    byCaseId: new Map(),
    byRouteDriverBaseValue: new Map(),
    byDriverBaseDateValue: new Map(),
  };

  (Array.isArray(rows) ? rows : []).forEach((row) => {
    getPackageMatchIds(row).forEach((id) => {
      if (!index.byPackageId.has(id)) index.byPackageId.set(id, row);
    });

    const caseId = getCaseMatchId(row);
    if (caseId && !index.byCaseId.has(caseId)) index.byCaseId.set(caseId, row);

    const routeDriverBaseValue = buildMatchKey([getMatchRoute(row), getMatchDriver(row), getMatchBase(row), getMatchAmount(row)]);
    if (routeDriverBaseValue && !index.byRouteDriverBaseValue.has(routeDriverBaseValue)) {
      index.byRouteDriverBaseValue.set(routeDriverBaseValue, row);
    }

    const driverBaseDateValue = buildMatchKey([getMatchDriver(row), getMatchBase(row), getMatchDate(row), getMatchAmount(row)]);
    if (driverBaseDateValue && !index.byDriverBaseDateValue.has(driverBaseDateValue)) {
      index.byDriverBaseDateValue.set(driverBaseDateValue, row);
    }
  });

  if (Array.isArray(rows)) prefaturaMatchIndexCache.set(rows, index);
  return index;
}

function buildPackagePrefaturaMatchResult(status, confidence, method, matchedRow = null) {
  const division = matchedRow ? getRowDivision(matchedRow) : "";
  const tipo = division === "SVC PERDIDOS" ? "SVC" : division === "XPT PERDIDOS" ? "XPT" : division === "PNR" ? "PNR" : "";
  return { status, confidence, method, matched_division: division, matched_tipo: tipo };
}

function classifyPackagePrefaturaMatch(row, index) {
  const packageIds = getPackageMatchIds(row);
  for (const id of packageIds) {
    if (index.byPackageId.has(id)) {
      return buildPackagePrefaturaMatchResult("LOCALIZADO_NA_PRE_FATURA", "ALTA", "ID do pacote/envio", index.byPackageId.get(id));
    }
  }

  const caseId = getCaseMatchId(row);
  if (caseId && index.byCaseId.has(caseId)) {
    return buildPackagePrefaturaMatchResult("LOCALIZADO_NA_PRE_FATURA", "ALTA", "ID caso", index.byCaseId.get(caseId));
  }

  const routeDriverBaseValue = buildMatchKey([getMatchRoute(row), getMatchDriver(row), getMatchBase(row), getMatchAmount(row)]);
  if (routeDriverBaseValue && index.byRouteDriverBaseValue.has(routeDriverBaseValue)) {
    return buildPackagePrefaturaMatchResult("LOCALIZADO_NA_PRE_FATURA", "MEDIA", "Rota + driver + base + valor", index.byRouteDriverBaseValue.get(routeDriverBaseValue));
  }

  const driverBaseDateValue = buildMatchKey([getMatchDriver(row), getMatchBase(row), getMatchDate(row), getMatchAmount(row)]);
  if (driverBaseDateValue && index.byDriverBaseDateValue.has(driverBaseDateValue)) {
    return buildPackagePrefaturaMatchResult("CORRESPONDENCIA_PROVAVEL", "BAIXA", "Driver + base + data + valor", index.byDriverBaseDateValue.get(driverBaseDateValue));
  }

  const hasPartialData = [getMatchRoute(row), getMatchDriver(row), getMatchBase(row), getMatchAmount(row), getMatchDate(row), getCaseMatchId(row), packageIds[0]].filter(Boolean).length >= 2;
  return hasPartialData
    ? buildPackagePrefaturaMatchResult("NAO_LOCALIZADO_NA_PRE_FATURA", "NENHUMA", "")
    : buildPackagePrefaturaMatchResult("SEM_DADOS_SUFICIENTES", "NENHUMA", "");
}

function enrichPackageRowsWithPrefaturaMatch(packageRows, prefaturaRows, options = {}) {
  const baseRows = Array.isArray(packageRows) ? packageRows : [];
  if (options.reuseExisting === true && baseRows.every((row) => row?.prefatura_match)) return baseRows;
  const index = buildPrefaturaMatchIndex(prefaturaRows);
  return baseRows.map((row) => ({
    ...row,
    prefatura_match: classifyPackagePrefaturaMatch(row, index),
  }));
}

function isPackageLocatedInPrefatura(row) {
  return row?.prefatura_match?.status === "LOCALIZADO_NA_PRE_FATURA" || row?.prefatura_match?.status === "CORRESPONDENCIA_PROVAVEL";
}

function buildPackageManagementComparison(rows = packageManagementRows, prefaturaRows = allRows) {
  const scopedRows = (Array.isArray(rows) ? rows : []).filter(isPackageManagementDetailRow);
  const enrichedRows = enrichPackageRowsWithPrefaturaMatch(scopedRows, prefaturaRows, { reuseExisting: prefaturaRows === allRows });
  const summary = buildPackageManagementSummary(enrichedRows);
  const typeDistribution = buildPackageTypeDistribution(enrichedRows);
  const prefaturaSummary = buildSummary(Array.isArray(prefaturaRows) ? prefaturaRows : []);
  const byCategory = (category) => enrichedRows.filter((row) => row.categoria_final === category);
  const alcRows = byCategory("ALC");
  const driverRows = byCategory("DRIVER");
  const dispatcherRows = byCategory("DISPATCHER");
  const mercadoLivreRows = byCategory("MERCADO_LIVRE");
  const hasPackageRows = enrichedRows.length > 0;
  const lines = [
    buildPackageComparisonLine({ label: "Absorvido pela ALC", rows: alcRows, value: summary.alcValue, kind: "financial", prefaturaSummary, hasPackageRows }),
    buildPackageComparisonLine({ label: "Desconto mantido com Driver", rows: driverRows, value: summary.driverValue, kind: "financial", prefaturaSummary, hasPackageRows }),
    buildPackageComparisonLine({ label: "Direcionado ao Dispatcher", rows: dispatcherRows, value: summary.dispatcherValue, kind: "financial", prefaturaSummary, hasPackageRows }),
    buildPackageComparisonLine({ label: "Erros do Driver", rows: driverRows, value: summary.driverErrors, kind: "count", prefaturaSummary, hasPackageRows }),
    buildPackageComparisonLine({ label: "Erros do Dispatcher", rows: dispatcherRows, value: summary.dispatcherErrors, kind: "count", prefaturaSummary, hasPackageRows }),
    buildPackageComparisonLine({ label: "Erros do Mercado Livre", rows: mercadoLivreRows, value: summary.mercadoLivreErrors, kind: "count", prefaturaSummary, hasPackageRows }),
  ];
  return { rows: enrichedRows, summary, prefaturaSummary, lines, typeDistribution, hasPackageRows, hasPrefaturaRows: prefaturaSummary.count > 0 };
}

function buildPackageManagementComparisonForScope(scope, prefaturaRows, typeSelection = state.packageTipo) {
  const monthSelection = scope?.mode === "annual" ? getAvailablePackageMonthOptions().map((month) => month.key) : getPackageMonthSelectionValues();
  const periodMode = state.packagePeriod || scope?.periodMode || "month";
  const scopedPackageRows = filterPackageManagementRowsByPeriod(packageManagementRows, monthSelection, periodMode).filter(isPackageManagementDetailRow);
  const enrichedRows = enrichPackageRowsWithPrefaturaMatch(scopedPackageRows, prefaturaRows).map((row) => ({
    ...row,
    tipo_operacional: getPackageOperationalType(row),
  }));
  return buildPackageManagementComparison(filterPackageRowsByTypeSelection(enrichedRows, typeSelection), prefaturaRows);
}

function formatPackageComparisonResult(line) {
  return line?.kind === "financial" ? currency.format(line.value || 0) : integer.format(line?.value || 0);
}

function buildPackageTypeDistribution(rows) {
  const totals = MAIN_TYPE_OPTIONS.reduce((acc, type) => {
    acc[type] = { type, count: 0, share: 0 };
    return acc;
  }, {});
  const validRows = (Array.isArray(rows) ? rows : [])
    .filter(isPackageManagementDetailRow)
    .map((row) => ({
      ...row,
      tipo_operacional: row.tipo_operacional || getPackageOperationalType(row),
    }))
    .filter((row) => MAIN_TYPE_OPTIONS.includes(row.tipo_operacional));

  validRows.forEach((row) => {
    totals[row.tipo_operacional].count += 1;
  });

  const total = validRows.length;
  const rowsByType = MAIN_TYPE_OPTIONS
    .map((type) => ({
      ...totals[type],
      share: total ? (totals[type].count / total) * 100 : 0,
    }))
    .filter((item) => item.count > 0);
  const dominant = rowsByType.reduce((best, item) => (item.count > best.count ? item : best), rowsByType[0] || { type: "", count: 0, share: 0 });
  return { rows: rowsByType, total, dominant };
}

function formatPackageTypeDistributionRows(distribution) {
  const rows = Array.isArray(distribution?.rows) ? distribution.rows : [];
  const total = Number(distribution?.total || 0);
  return [
    ...rows.map((item) => [
      item.type,
      `${integer.format(item.count)} registro${item.count === 1 ? "" : "s"}`,
      `${formatNumberPt(item.share, 1)}%`,
    ]),
    ["Total", `${integer.format(total)} registro${total === 1 ? "" : "s"}`, total ? "100,0%" : "0,0%"],
  ];
}

function buildPackageMonthlyEvolutionRows(rows) {
  const groups = new Map();
  (Array.isArray(rows) ? rows : [])
    .filter(isPackageManagementDetailRow)
    .forEach((row) => {
      const key = getPackageManagementMonthKey(row);
      if (!key) return;
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          label: shortMonthYear(getMonthLabelFromKey(key)),
          fullLabel: getMonthLabelFromKey(key).replace(" / ", "/"),
          rows: [],
        });
      }
      groups.get(key).rows.push(row);
    });

  return Array.from(groups.values())
    .sort((a, b) => String(a.key).localeCompare(String(b.key)))
    .map((group) => {
      const summary = buildPackageManagementSummary(group.rows);
      return {
        key: group.key,
        label: group.label,
        fullLabel: group.fullLabel,
        alcValue: summary.alcValue,
        driverValue: summary.driverValue,
        dispatcherValue: summary.dispatcherValue,
        driverErrors: summary.driverErrors,
        dispatcherErrors: summary.dispatcherErrors,
        mercadoLivreErrors: summary.mercadoLivreErrors,
        count: summary.count,
      };
    });
}

function buildPackageMonthlyEvolutionText(rows) {
  const evolutionRows = Array.isArray(rows) ? rows : [];
  if (!evolutionRows.length) {
    return "Não foram encontrados dados de Gestão de Pacotes para evolução no recorte selecionado.";
  }
  if (evolutionRows.length === 1) {
    const row = evolutionRows[0];
    return `No recorte selecionado, ${row.fullLabel || row.label} registrou ${currency.format(row.alcValue || 0)} absorvidos pela ALC, ${currency.format(row.driverValue || 0)} mantidos com Driver e ${integer.format(row.driverErrors || 0)} erro${Number(row.driverErrors || 0) === 1 ? "" : "s"} classificado${Number(row.driverErrors || 0) === 1 ? "" : "s"} como Driver.`;
  }
  const driverPeak = evolutionRows.reduce((best, row) => (Number(row.driverErrors || 0) > Number(best.driverErrors || 0) ? row : best), evolutionRows[0]);
  const alcPeak = evolutionRows.reduce((best, row) => (Number(row.alcValue || 0) > Number(best.alcValue || 0) ? row : best), evolutionRows[0]);
  return `Na evolução mensal da Gestão de Pacotes, ${driverPeak.label} concentrou o maior volume de erros do Driver, com ${integer.format(driverPeak.driverErrors || 0)} ocorrência${Number(driverPeak.driverErrors || 0) === 1 ? "" : "s"}. O maior valor absorvido pela ALC ocorreu em ${alcPeak.label}, com ${currency.format(alcPeak.alcValue || 0)}.`;
}

function buildPackageComparisonLine({ label, rows, value, kind, prefaturaSummary, hasPackageRows }) {
  const located = rows.filter(isPackageLocatedInPrefatura).length;
  const denominator = kind === "financial" ? Number(prefaturaSummary?.totalValue || 0) : Number(prefaturaSummary?.count || 0);
  const hasComparisonBase = hasPackageRows && denominator > 0;
  const percentage = hasComparisonBase ? formatNumberPt((Number(value || 0) / denominator) * 100, 1) : null;
  const comparison = !hasComparisonBase
    ? "Sem base de compara\u00e7\u00e3o"
    : kind === "financial"
      ? `${percentage}% do total da Pré-Fatura`
      : `${percentage}% dos registros da Pré-Fatura`;
  const locatedLabel = kind === "financial"
    ? `${integer.format(located)} registros localizados`
    : `${integer.format(located)} localizados`;
  return {
    label,
    rows,
    value,
    kind,
    located,
    comparison,
    delta: hasComparisonBase ? `${comparison} \u00b7 ${locatedLabel}` : comparison,
  };
}

function buildPackageComparisonExecutiveText(comparison) {
  if (!comparison?.hasPackageRows) {
    return "N\u00e3o foram encontrados registros de Gest\u00e3o de Pacotes para o recorte selecionado.";
  }
  const distribution = comparison.typeDistribution || buildPackageTypeDistribution(comparison.rows);
  const distributionRows = Array.isArray(distribution.rows) ? distribution.rows : [];
  const totalValid = Number(distribution.total || 0);
  const dominant = distribution.dominant || distributionRows[0] || null;
  const typeText = distributionRows.map((item) => item.type).join(", ");
  const distributionSentence = totalValid && distributionRows.length === 1
    ? `No recorte selecionado, o relat\u00f3rio considera somente registros do tipo ${distributionRows[0].type}, totalizando ${integer.format(totalValid)} ocorr\u00eancia${totalValid === 1 ? "" : "s"} v\u00e1lida${totalValid === 1 ? "" : "s"} na Gest\u00e3o de Pacotes.`
    : totalValid && dominant
      ? `No recorte selecionado, a Gest\u00e3o de Pacotes registrou ${integer.format(totalValid)} ocorr\u00eancia${totalValid === 1 ? "" : "s"} v\u00e1lida${totalValid === 1 ? "" : "s"}, distribu\u00edda${totalValid === 1 ? "" : "s"} entre ${typeText}. O tipo ${dominant.type} concentrou ${integer.format(dominant.count)} registro${dominant.count === 1 ? "" : "s"}, representando ${formatNumberPt(dominant.share, 1)}% do total da Gest\u00e3o de Pacotes no per\u00edodo.`
      : "";
  if (!comparison?.hasPrefaturaRows) {
    return `${distributionSentence} Foram encontrados registros de Gest\u00e3o de Pacotes, por\u00e9m n\u00e3o h\u00e1 base de Pr\u00e9-Fatura correspondente para compara\u00e7\u00e3o percentual.`.trim();
  }
  const alc = comparison.lines.find((line) => line.label === "Absorvido pela ALC") || { value: 0, comparison: "0,0% do total da Pré-Fatura" };
  const driver = comparison.lines.find((line) => line.label === "Erros do Driver") || { value: 0, comparison: "0,0% dos registros da Pré-Fatura" };
  return `${distributionSentence} A Gest\u00e3o de Pacotes registrou ${currency.format(alc.value || 0)} absorvidos pela ALC, equivalente a ${alc.comparison}. Foram identificados ${integer.format(driver.value || 0)} erros classificados como Driver, representando ${driver.comparison}.`.trim();
}

function buildPackageManagementKpiCards(rows = filterPackageManagementRowsByPeriod(packageManagementRows), prefaturaRows = allRows) {
  const comparison = buildPackageManagementComparison(rows, prefaturaRows);
  const byLabel = new Map(comparison.lines.map((line) => [line.label, line]));
  const line = (label) => byLabel.get(label) || { value: 0, delta: "Sem base de comparação" };
  return [
    { label: "Absorvido pela ALC", value: currency.format(line("Absorvido pela ALC").value || 0), tone: "kpi-card--finance", delta: line("Absorvido pela ALC").delta },
    { label: "Desconto mantido com Driver", value: currency.format(line("Desconto mantido com Driver").value || 0), tone: "kpi-card--problem", delta: line("Desconto mantido com Driver").delta },
    { label: "Direcionado ao Dispatcher", value: currency.format(line("Direcionado ao Dispatcher").value || 0), tone: "kpi-card--problem", delta: line("Direcionado ao Dispatcher").delta },
    { label: "Erros do Driver", value: integer.format(line("Erros do Driver").value || 0), tone: "kpi-card--volume", delta: line("Erros do Driver").delta },
    { label: "Erros do Dispatcher", value: integer.format(line("Erros do Dispatcher").value || 0), tone: "kpi-card--volume", delta: line("Erros do Dispatcher").delta },
    { label: "Erros do Mercado Livre", value: integer.format(line("Erros do Mercado Livre").value || 0), tone: "kpi-card--neutral", delta: line("Erros do Mercado Livre").delta },
  ];
}

function getPackageOperationalType(row) {
  const match = row?.prefatura_match || {};
  const matchedType = match.matched_tipo;
  if (isReliablePrefaturaTypeMatch(match)) return matchedType;

  const baseType = identificarTipoPorBase(row?.base_normalizada || row?.base || "");
  if (baseType) return baseType;

  return "Indefinido";
}

function isReliablePrefaturaTypeMatch(match) {
  return (
    match?.status === "LOCALIZADO_NA_PRE_FATURA" &&
    match?.confidence === "ALTA" &&
    ["SVC", "XPT", "PNR"].includes(match?.matched_tipo)
  );
}

function identificarTipoPorBase(base) {
  const codigo = normalizeBase(base);
  const primeiroCodigo = String(codigo || "").split("/").find(Boolean) || "";

  if (primeiroCodigo.startsWith("S")) return "SVC";
  if (primeiroCodigo.startsWith("E")) return "XPT";

  return null;
}

function filterPackageRowsByTypeSelection(rows, selection = state.packageTipo) {
  const selectedTypes = getPackageTypeSelectionValues(selection);
  const baseRows = (Array.isArray(rows) ? rows : []).filter(isPackageManagementDetailRow);
  if (selectedTypes.length === MAIN_TYPE_OPTIONS.length) return baseRows;
  const selected = new Set(selectedTypes);
  return baseRows.filter((row) => {
    const type = row.tipo_operacional || getPackageOperationalType(row);
    return selected.has(type);
  });
}

function getPackageManagementRowsCacheKey() {
  const activePrefaturaId = getActiveDataset()?.id || fileMeta?.id || "";
  const activePackageFiles = dashboardFileRecords
    .filter((file) => getFileRecordCategory(file) === PACKAGE_MANAGEMENT_FILE_CATEGORY && isDashboardFileActive(file))
    .map((file) => file.id || file.name || file.file_name || "")
    .join("|");
  return [
    packageManagementRowsLoadedKey,
    activePrefaturaId,
    activePackageFiles,
    packageManagementRows.length,
    allRows.length,
    getPackageMonthSelectionValues().join("|"),
    normalizePeriodMode(state.packagePeriod || "month"),
    normalizeTypeSelection(state.packageTipo).join("|"),
    normalize(state.query),
  ].join("::");
}

function getPackageManagementRowsForView() {
  const cacheKey = getPackageManagementRowsCacheKey();
  if (derivedDataCache.packageKey === cacheKey) {
    return derivedDataCache.packageRows;
  }
  const periodRows = filterPackageManagementRowsByPeriod(packageManagementRows).filter(isPackageManagementDetailRow);
  const enrichedRows = enrichPackageRowsWithPrefaturaMatch(periodRows, allRows).map((row) => ({
    ...row,
    tipo_operacional: getPackageOperationalType(row),
  }));
  const typedRows = filterPackageRowsByTypeSelection(enrichedRows, state.packageTipo);
  const query = normalize(state.query);
  const rows = query ? typedRows.filter((row) => String(row._search || "").includes(query)) : typedRows;
  derivedDataCache.packageKey = cacheKey;
  derivedDataCache.packageRows = rows;
  return rows;
}

function restorePrefaturaTableHeader() {
  setPackageExportButtonVisible(false);
  if (el.tableTitle) el.tableTitle.textContent = "Detalhamento dos registros";
  if (el.tableDescription) el.tableDescription.innerHTML = `<span id="result-count">0</span> registros visíveis após os filtros`;
  el.resultCount = document.getElementById("result-count") || el.resultCount;
  if (el.tableHead) {
    el.tableHead.innerHTML = `
      <tr>
        <th data-sort="base">Base</th>
        <th data-sort="motorista">Driver</th>
        <th data-sort="placa">Placa</th>
        <th data-sort="tipo_desconto">Tipo</th>
        <th data-sort="aba_origem">Aba</th>
        <th data-sort="data_sort">Data</th>
        <th data-sort="id_pacote">ID do pacote</th>
        <th data-sort="n_rota">Nº rota</th>
        <th data-sort="valor_numerico" class="is-right">Desconto</th>
      </tr>
    `;
  }
}

function setPackageExportButtonVisible(visible) {
  if (!el.tableActions) return;
  const existing = el.tableActions.querySelector("[data-package-export-excel]");
  if (!visible) {
    if (existing) existing.remove();
    return;
  }
  if (existing) return;
  el.tableActions.insertAdjacentHTML(
    "afterbegin",
    `
      <button class="secondary-button secondary-button--icon table-export-button" type="button" data-package-export-excel title="Baixar Excel" aria-label="Baixar Excel">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3v11" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2"></path>
          <path d="m7 10 5 5 5-5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path>
          <path d="M5 19h14" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2"></path>
        </svg>
      </button>
    `
  );
}

function syncPackageExportButtonState(totalRows = 0) {
  const button = el.tableActions?.querySelector("[data-package-export-excel]");
  if (!button) return;
  button.disabled = isExportingPackageExcel || Number(totalRows) <= 0;
  button.setAttribute("aria-busy", isExportingPackageExcel ? "true" : "false");
  button.title = Number(totalRows) > 0 ? "Baixar Excel" : "Nenhum registro para exportar";
  button.setAttribute("aria-label", button.title);
}

function renderKpis(summary) {
  const monthlyStatus = getTotalDiscountComparisonInitialText();
  const mainCards = [
    {
      label: "Total de descontos",
      value: currency.format(summary.totalValue),
      tone: "kpi-card--finance",
      delta: monthlyStatus,
      key: "total-discounts",
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
  const renderCard = (card, index) => `
    <article class="kpi-card ${card.tone}"${card.key ? ` data-kpi="${escapeAttribute(card.key)}"` : ""} style="--reveal-index:${index}">
      <div class="kpi-card__label">
        <span>${card.label}</span>
        <span class="kpi-card__icon">i</span>
      </div>
      <div class="kpi-card__value metric-card-value">${card.value}</div>
      <div class="kpi-card__delta"${card.key === "total-discounts" ? " data-total-discounts-delta" : ""}>${card.delta}</div>
    </article>
  `;

  el.kpiGrid.innerHTML = `
    <section class="kpi-grid__group kpi-grid__group--main" aria-label="Cards principais da Pré-Fatura">
      ${mainCards.map((card, index) => renderCard(card, index)).join("")}
    </section>
  `;
  void hydrateTotalDiscountComparison(summary);
}

function renderKpiCard(card, index) {
  return `
    <article class="kpi-card ${card.tone}"${card.key ? ` data-kpi="${escapeAttribute(card.key)}"` : ""} style="--reveal-index:${index}">
      <div class="kpi-card__label">
        <span>${card.label}</span>
        <span class="kpi-card__icon">i</span>
      </div>
      <div class="kpi-card__value metric-card-value">${card.value}</div>
      <div class="kpi-card__delta"${card.key === "total-discounts" ? " data-total-discounts-delta" : ""}>${card.delta}</div>
    </article>
  `;
}

function buildPackageMixRows(rows) {
  const baseRows = (Array.isArray(rows) ? rows : []).filter(isPackageManagementDetailRow);
  const summary = buildPackageManagementSummary(baseRows);
  const counts = { ALC: 0, DRIVER: 0, DISPATCHER: 0 };
  baseRows.forEach((row) => {
    if (Object.prototype.hasOwnProperty.call(counts, row.categoria_final)) counts[row.categoria_final] += 1;
  });
  const items = [
    { key: "ALC", label: "ALC", value: summary.alcValue, count: counts.ALC, color: "#58d68d" },
    { key: "DRIVER", label: "Driver", value: summary.driverValue, count: counts.DRIVER, color: "#ffb454" },
    { key: "DISPATCHER", label: "Dispatcher", value: summary.dispatcherValue, count: counts.DISPATCHER, color: "#3ba6ff" },
  ];
  const total = items.reduce((acc, item) => acc + Number(item.value || 0), 0);
  return {
    total,
    items: items.map((item) => ({
      ...item,
      share: total ? (Number(item.value || 0) / total) * 100 : 0,
    })),
  };
}

function renderPackageMixDonut(items, total) {
  const circumference = 2 * Math.PI * 42;
  let offset = 0;
  const labels = [];
  const segments = total > 0
    ? items
      .map((item, index) => {
        const start = offset;
        const length = (item.share / 100) * circumference;
        const dashOffset = -offset;
        offset += length;
        if (item.share >= 7.5 && length > 18) {
          const midpoint = start + length / 2;
          const angle = (midpoint / circumference) * Math.PI * 2 - Math.PI / 2;
          const x = 50 + Math.cos(angle) * 42;
          const y = 50 + Math.sin(angle) * 42;
          const fontSize = item.share >= 18 ? 5.4 : item.share >= 11 ? 4.8 : 4.2;
          labels.push(`
            <text
              class="mix-chart__percent"
              x="${x.toFixed(2)}"
              y="${y.toFixed(2)}"
              style="font-size:${fontSize}px"
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
            data-mix-segment="${escapeAttribute(item.key || String(index))}"
            data-title="${escapeAttribute(item.label)}"
            data-value="${escapeAttribute(currency.format(item.value || 0))}"
            data-count="${escapeAttribute(integer.format(item.count || 0))}"
            data-share="${escapeAttribute(formatPercent(item.share))}"
          ></circle>
        `;
      })
      .join("")
    : "";

  return `
    <svg class="mix-chart__svg" viewBox="0 0 100 100" aria-hidden="true">
      <g transform="rotate(-90 50 50)">
        <circle class="mix-chart__track" cx="50" cy="50" r="42" fill="none" stroke-width="18"></circle>
        ${segments}
      </g>
      ${labels.join("")}
    </svg>
    <div class="mix-chart__center">
      <strong class="mix-center-value">${formatCurrencyShort(total)}</strong>
      <span>Total do mix</span>
    </div>
  `;
}

function renderPackageMixCard(rows) {
  const mix = buildPackageMixRows(rows);
  return `
    <article class="panel mix-card package-analysis-card package-mix-card">
      <div class="panel__header">
        <div>
          <span class="section-eyebrow">Mix</span>
          <h2>Mix da Gestão de Pacotes</h2>
        </div>
      </div>
      <div class="mix-card__body package-mix-card__body">
        <div class="mix-chart package-mix-card__chart">
          ${renderPackageMixDonut(mix.items, mix.total)}
        </div>
        <div class="mix-legend package-mix-card__legend">
          <div class="mix-legend__head" aria-hidden="true">
            <span>Categoria</span>
            <span>Valor</span>
            <span>%</span>
          </div>
          ${mix.items
    .map((item) => `
            <div class="mix-legend__row package-mix-card__row">
              <span class="mix-legend__category">
                <i style="background:${item.color}"></i>
                ${escapeHtml(item.label)}
              </span>
              <span class="mix-legend__value">${formatCurrencyShort(item.value)}</span>
              <span class="mix-legend__share">${formatPercent(item.share)}</span>
            </div>
          `)
    .join("")}
        </div>
      </div>
    </article>
  `;
}

function buildPackageDriverErrorRanking(rows, limit = 5) {
  const prefaturaDriverById = buildPrefaturaDriverIndexById(allRows);
  const groups = new Map();
  (Array.isArray(rows) ? rows : [])
    .filter(isPackageManagementDetailRow)
    .filter(isPackageDriverErrorRow)
    .forEach((row) => {
    const resolvedName = resolvePackageDriverName(row, prefaturaDriverById);
    if (!resolvedName) return;
    const key = normalizeDriverName(resolvedName);
    const current = groups.get(key) || {
      key,
      label: resolvedName,
      count: 0,
      total: 0,
    };
    current.label = resolvedName;
    current.count += getOccurrenceCount(row);
    current.total += normalizarValorGestao(row.valor_numerico);
    groups.set(key, current);
  });
  return Array.from(groups.values())
    .sort((a, b) => b.count - a.count || b.total - a.total || a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }))
    .slice(0, limit);
}

function isPackageDriverErrorRow(row) {
  return String(row?.categoria_final || row?.categoria || "").toUpperCase() === "DRIVER";
}

function buildPrefaturaDriverIndexById(prefaturaRows = allRows) {
  if (Array.isArray(prefaturaRows) && prefaturaDriverIndexCache.has(prefaturaRows)) {
    return prefaturaDriverIndexCache.get(prefaturaRows);
  }
  const index = new Map();
  (Array.isArray(prefaturaRows) ? prefaturaRows : [])
    .filter((row) => (row?.file_category || PRE_FATURA_FILE_CATEGORY) !== PACKAGE_MANAGEMENT_FILE_CATEGORY)
    .forEach((row) => {
      const driver = formatDriverName(row.motorista || row.driver || row.nomeMotorista || row.nome_driver || "", "");
      if (!driver || isUnidentifiedDriverName(driver)) return;
      getPackageEnvioIds(row).forEach((id) => {
        if (id && !index.has(id)) index.set(id, driver);
      });
    });
  if (Array.isArray(prefaturaRows)) prefaturaDriverIndexCache.set(prefaturaRows, index);
  return index;
}

function resolvePackageDriverName(row, prefaturaDriverById = buildPrefaturaDriverIndexById()) {
  const direct = formatDriverName(row?.motorista || row?.driver || row?.nomeMotorista || row?.nome_driver || "", "");
  if (direct && !isUnidentifiedDriverName(direct)) return direct;
  for (const id of getPackageEnvioIds(row)) {
    const driver = prefaturaDriverById.get(id);
    if (driver && !isUnidentifiedDriverName(driver)) return formatDriverName(driver, "");
  }
  return null;
}

function renderPackageDriverErrorsCard(rows) {
  const ranking = buildPackageDriverErrorRanking(rows, 5);
  return `
    <article class="panel package-analysis-card package-driver-card">
      <div class="panel__header">
        <div>
          <span class="section-eyebrow">Recorrência</span>
          <h2>Motoristas com mais erros</h2>
        </div>
      </div>
      <div class="package-driver-ranking">
        ${ranking.length
    ? ranking
      .map((item, index) => `
            <div class="package-driver-ranking__row">
              <span class="package-driver-ranking__position">${index + 1}</span>
              <strong>${escapeHtml(item.label)}</strong>
              <span>${integer.format(item.count)} ocorrências</span>
              <em>${currency.format(item.total)}</em>
            </div>
          `)
      .join("")
    : emptyState("Sem motoristas no recorte", "Ajuste os filtros ou importe arquivos de Gestão de Pacotes.")}
      </div>
    </article>
  `;
}

function renderPackageManagementView(pagedRows, allPackageRows) {
  const prefaturaRows = filterPrefaturaRowsByTypes(allRows, state.packageTipo);
  const cards = buildPackageManagementKpiCards(allPackageRows, prefaturaRows);
  el.kpiGrid.innerHTML = `
    <section class="kpi-grid__group kpi-grid__group--package" aria-label="Cards de Gestão de Pacotes">
      ${cards.map((card, index) => renderKpiCard(card, index)).join("")}
    </section>
    <section class="package-analysis-grid" aria-label="Análises da Gestão de Pacotes">
      ${renderPackageMixCard(allPackageRows)}
      ${renderPackageDriverErrorsCard(allPackageRows)}
    </section>
  `;
  renderPackageManagementTable(pagedRows, allPackageRows);
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
  `;
  el.donutTotal = document.getElementById("donut-total");
  el.donutTooltip = getDonutTooltip();
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
  el.donutTooltip = getDonutTooltip();
  if (!el.donutTooltip) return;
  window.clearTimeout(donutTooltipHideTimer);
  el.donutTooltip.innerHTML = `
    <strong>${escapeHtml(segment.dataset.title || "")}</strong>
    <span>${escapeHtml(segment.dataset.value || "")} em descontos</span>
    <span>${escapeHtml(segment.dataset.count || "0")} registros · ${escapeHtml(segment.dataset.share || "0%")}</span>
  `;
  el.donutTooltip.hidden = false;
  requestAnimationFrame(() => {
    el.donutTooltip.classList.add("is-visible");
  });
  positionDonutTooltip(event);
}

function positionDonutTooltip(event) {
  if (!el.donutTooltip || el.donutTooltip.hidden || !event) return;
  const gap = 14;
  const viewportPadding = 12;
  const tooltipRect = el.donutTooltip.getBoundingClientRect();
  const width = tooltipRect.width || Math.min(288, Math.max(220, window.innerWidth - 32));
  const height = tooltipRect.height || 96;
  let left = event.clientX + gap;
  let top = event.clientY + gap;
  if (left + width > window.innerWidth - viewportPadding) {
    left = event.clientX - width - gap;
  }
  if (top + height > window.innerHeight - viewportPadding) {
    top = event.clientY - height - gap;
  }
  el.donutTooltip.style.left = `${Math.max(viewportPadding, left)}px`;
  el.donutTooltip.style.top = `${Math.max(viewportPadding, top)}px`;
}

function hideDonutTooltip() {
  if (!el.donutTooltip) return;
  el.donutTooltip.classList.remove("is-visible");
  window.clearTimeout(donutTooltipHideTimer);
  donutTooltipHideTimer = window.setTimeout(() => {
    if (el.donutTooltip) el.donutTooltip.hidden = true;
  }, 150);
}

function getDonutTooltip() {
  let tooltip = document.getElementById("donut-tooltip");
  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.id = "donut-tooltip";
    tooltip.setAttribute("role", "tooltip");
    tooltip.hidden = true;
  }
  tooltip.className = "comparison-chart-tooltip pre-fatura-mix-tooltip";
  if (tooltip.parentElement !== document.body) {
    document.body.appendChild(tooltip);
  }
  return tooltip;
}

function getPackageMixTooltip() {
  let tooltip = document.getElementById("package-mix-tooltip");
  if (tooltip) return tooltip;
  tooltip = document.createElement("div");
  tooltip.id = "package-mix-tooltip";
  tooltip.className = "comparison-chart-tooltip package-mix-tooltip";
  tooltip.setAttribute("role", "tooltip");
  tooltip.hidden = true;
  document.body.appendChild(tooltip);
  return tooltip;
}

function setPackageMixSegmentState(segment, isActive) {
  document.querySelectorAll(".package-mix-card .mix-chart__segment").forEach((node) => {
    node.classList.toggle("is-active", isActive && node === segment);
  });
}

function showPackageMixTooltip(segment, event) {
  const tooltip = getPackageMixTooltip();
  if (!tooltip) return;
  window.clearTimeout(packageMixTooltipHideTimer);
  const countValue = Number(segment.dataset.count || 0);
  const recordsLabel = countValue === 1 ? "1 registro" : `${escapeHtml(segment.dataset.count || "0")} registros`;
  if (activePackageMixSegment !== segment || tooltip.hidden) {
    tooltip.innerHTML = `
      <strong>${escapeHtml(segment.dataset.title || "")}</strong>
      <span>${escapeHtml(segment.dataset.value || "")}</span>
      <span>${escapeHtml(segment.dataset.share || "0%")}</span>
      <span>${recordsLabel}</span>
    `;
    activePackageMixSegment = segment;
  }
  tooltip.hidden = false;
  requestAnimationFrame(() => {
    tooltip.classList.add("is-visible");
  });
  setPackageMixSegmentState(segment, true);
  positionPackageMixTooltip(segment, event);
}

function positionPackageMixTooltip(segment, event) {
  const tooltip = getPackageMixTooltip();
  if (!tooltip || tooltip.hidden || !event) return;
  const gap = 14;
  const viewportPadding = 12;
  const tooltipRect = tooltip.getBoundingClientRect();
  const width = tooltipRect.width || Math.min(288, Math.max(220, window.innerWidth - 32));
  const height = tooltipRect.height || 112;
  let left = event.clientX + gap;
  let top = event.clientY + gap;
  if (left + width > window.innerWidth - viewportPadding) {
    left = event.clientX - width - gap;
  }
  if (top + height > window.innerHeight - viewportPadding) {
    top = event.clientY - height - gap;
  }
  tooltip.style.left = `${Math.max(viewportPadding, left)}px`;
  tooltip.style.top = `${Math.max(viewportPadding, top)}px`;
  setPackageMixSegmentState(segment, true);
}

function hidePackageMixTooltip(segment) {
  const tooltip = document.getElementById("package-mix-tooltip");
  if (tooltip) {
    tooltip.classList.remove("is-visible");
    window.clearTimeout(packageMixTooltipHideTimer);
    packageMixTooltipHideTimer = window.setTimeout(() => {
      tooltip.hidden = true;
    }, 180);
  }
  activePackageMixSegment = null;
  if (segment) setPackageMixSegmentState(segment, false);
}

function getPnrTooltip() {
  let tooltip = document.getElementById("pnr-chart-tooltip");
  if (tooltip) return tooltip;
  tooltip = document.createElement("div");
  tooltip.id = "pnr-chart-tooltip";
  tooltip.className = "comparison-chart-tooltip pnr-chart-tooltip";
  tooltip.setAttribute("role", "tooltip");
  tooltip.hidden = true;
  document.body.appendChild(tooltip);
  return tooltip;
}

function showPnrTooltip(target, event) {
  const tooltip = getPnrTooltip();
  if (!tooltip) return;
  const title = target.dataset.tooltipTitle || "";
  const lines = String(target.dataset.tooltipLines || "").split("|").filter(Boolean);
  tooltip.innerHTML = `
    <strong>${escapeHtml(title)}</strong>
    ${lines.map((line) => `<span>${escapeHtml(line)}</span>`).join("")}
  `;
  tooltip.hidden = false;
  requestAnimationFrame(() => {
    tooltip.classList.add("is-visible");
  });
  positionPnrTooltip(event);
}

function positionPnrTooltip(event) {
  const tooltip = getPnrTooltip();
  if (!tooltip || tooltip.hidden || !event) return;
  const offset = 14;
  const viewportPadding = 12;
  const rect = tooltip.getBoundingClientRect();
  const width = rect.width || Math.min(288, Math.max(220, window.innerWidth - 32));
  const height = rect.height || 112;
  let left = event.clientX + offset;
  let top = event.clientY + offset;
  if (left + width > window.innerWidth - viewportPadding) left = event.clientX - width - offset;
  if (top + height > window.innerHeight - viewportPadding) top = event.clientY - height - offset;
  tooltip.style.left = `${Math.max(viewportPadding, left)}px`;
  tooltip.style.top = `${Math.max(viewportPadding, top)}px`;
}

function hidePnrTooltip() {
  const tooltip = document.getElementById("pnr-chart-tooltip");
  if (!tooltip) return;
  tooltip.classList.remove("is-visible");
  window.setTimeout(() => {
    tooltip.hidden = true;
  }, 150);
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
    const canConfigureGoal = getActionPermissions().isAdmin;
    actionsNode.innerHTML = `
      <span class="goal-status ${goal.tone}">${escapeHtml(goal.label)}</span>
      ${
        canConfigureGoal
          ? `<details class="goal-config" data-goal-mode="${goalMode}">
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
      </details>`
          : ""
      }
    `;
  }
  el.pnrGoalSummary.innerHTML = `
    <div class="goal-body">
      <div class="goal-copy">
        <span class="goal-eyebrow">Valor atual</span>
        <strong class="goal-value">${escapeHtml(goal.valueLabel)}</strong>
        <span>Limite ${periodLabel}: ${escapeHtml(goal.limitLabel)}</span>
        <small>${integer.format(pnrRows.length)} registros PNR · ${formatPercent(goal.percent)} do limite ${periodLabel} utilizado</small>
      </div>
      ${renderPnrGoalGauge(goal)}
    </div>
    <div class="goal-progress" title="${escapeAttribute(`${formatPercent(goal.percent)} do limite ${periodLabel} utilizado`)}" aria-hidden="true">
      <span style="width:${goal.progress.toFixed(1)}%"></span>
    </div>
  `;
}

function renderMonthlyComparison() {
  if (!el.monthlyComparison) return;
  const rows = buildMonthlyComparison();
  const activeType = getTypeFilterLabel(state.prefaturaTipo);
  const scopeLabel = activeType === "Todos" ? "geral" : activeType;
  syncComparisonViewControl();
  if (el.comparisonMeta) {
    el.comparisonMeta.textContent = rows.length ? `${integer.format(rows.length)} competências · ${scopeLabel}` : `sem histórico · ${scopeLabel}`;
  }
  if (!rows.length) {
    el.monthlyComparison.innerHTML = emptyState("Sem comparação mensal", "Importe arquivos de Pré-Fatura de meses diferentes para comparar esta aba.");
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
      const deltaOffensePct = row.previous && previousOffense ? (deltaOffense / previousOffense) * 100 : deltaOffense > 0 ? 100 : 0;
      const trend = row.previous ? formatEvolutionTrend(deltaOffensePct) : null;
      const trendClass = trend ? trend.tone : "is-flat";
      const trendLabel = trend ? formatEvolutionTrendText(trend) : "Base";
      const monthTone = getOffenseColor(offenseTotal, maxCount);
      const displayPeriod = shortMonthYear(row.label);
      const tooltipLines = [
        displayPeriod,
        `Total: ${integer.format(row.count)}`,
        `PNR: ${integer.format(row.pnrCount)}`,
        `Perdidos: ${integer.format(row.packageCount)}`,
        `Valor: ${currency.format(row.totalValue)}`,
        `Variação: ${trendLabel}`,
      ].join("\n");
      return `
        <button
          class="month-column is-awaiting-animation ${row.datasetId === state.activeDatasetId ? "is-active" : ""}"
          type="button"
          data-dataset-id="${escapeAttribute(row.datasetId)}"
          data-tooltip="${escapeAttribute(tooltipLines)}"
          aria-label="${escapeAttribute(tooltipLines.replace(/\n/g, ". "))}"
          style="--reveal-index:${index}; --stagger-index:${index}"
        >
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
            <strong>${escapeHtml(displayPeriod)}</strong>
            <strong>${currency.format(row.totalValue)}</strong>
            <span class="${trendClass}">${escapeHtml(trendLabel)}</span>
          </div>
        </button>
      `;
    })
    .join("")}
    </div>`;
}

function getComparisonTooltip() {
  let tooltip = document.getElementById("comparison-chart-tooltip");
  if (tooltip) return tooltip;
  tooltip = document.createElement("div");
  tooltip.id = "comparison-chart-tooltip";
  tooltip.className = "comparison-chart-tooltip";
  tooltip.setAttribute("role", "tooltip");
  tooltip.hidden = true;
  document.body.appendChild(tooltip);
  return tooltip;
}

function renderComparisonTooltipContent(text) {
  const lines = String(text || "").split("\n").filter(Boolean);
  const [period, ...details] = lines;
  return `
    <strong>${escapeHtml(period || "Período")}</strong>
    ${details.map((line) => `<span>${escapeHtml(line)}</span>`).join("")}
  `;
}

function showComparisonTooltip(column) {
  const text = column?.dataset?.tooltip || "";
  if (!text) return;
  const tooltip = getComparisonTooltip();
  window.clearTimeout(comparisonTooltipHideTimer);
  if (activeComparisonTooltipColumn !== column || tooltip.hidden) {
    tooltip.innerHTML = renderComparisonTooltipContent(text);
    activeComparisonTooltipColumn = column;
  }
  tooltip.hidden = false;
  requestAnimationFrame(() => {
    tooltip.classList.add("is-visible");
  });
}

function positionComparisonTooltip(event) {
  const tooltip = getComparisonTooltip();
  if (tooltip.hidden) return;
  const offset = 14;
  const viewportPadding = 12;
  const rect = tooltip.getBoundingClientRect();
  const tooltipWidth = rect.width || Math.min(288, Math.max(220, window.innerWidth - 32));
  const tooltipHeight = rect.height || 132;
  let x = event.clientX + offset;
  let y = event.clientY + offset;

  if (x + tooltipWidth > window.innerWidth - viewportPadding) {
    x = event.clientX - tooltipWidth - offset;
  }

  if (y + tooltipHeight > window.innerHeight - viewportPadding) {
    y = event.clientY - tooltipHeight - offset;
  }

  tooltip.style.left = `${Math.max(viewportPadding, x)}px`;
  tooltip.style.top = `${Math.max(viewportPadding, y)}px`;
}

function hideComparisonTooltip() {
  const tooltip = document.getElementById("comparison-chart-tooltip");
  if (!tooltip) return;
  tooltip.classList.remove("is-visible");
  activeComparisonTooltipColumn = null;
  window.clearTimeout(comparisonTooltipHideTimer);
  comparisonTooltipHideTimer = window.setTimeout(() => {
    tooltip.hidden = true;
  }, 180);
}

function getEvolutionTooltip() {
  let tooltip = document.getElementById("evolution-chart-tooltip");
  if (tooltip) return tooltip;
  tooltip = document.createElement("div");
  tooltip.id = "evolution-chart-tooltip";
  tooltip.className = "comparison-chart-tooltip evolution-chart-tooltip";
  tooltip.setAttribute("role", "tooltip");
  tooltip.hidden = true;
  document.body.appendChild(tooltip);
  return tooltip;
}

function showEvolutionTooltip(bar) {
  const text = bar?.dataset?.tooltip || "";
  if (!text) return;
  const tooltip = getEvolutionTooltip();
  window.clearTimeout(evolutionTooltipHideTimer);
  if (activeEvolutionTooltipBar !== bar || tooltip.hidden) {
    tooltip.innerHTML = renderComparisonTooltipContent(text);
    activeEvolutionTooltipBar = bar;
  }
  tooltip.hidden = false;
  requestAnimationFrame(() => {
    tooltip.classList.add("is-visible");
  });
}

function positionEvolutionTooltip(event) {
  const tooltip = getEvolutionTooltip();
  if (tooltip.hidden) return;
  const offset = 14;
  const viewportPadding = 12;
  const rect = tooltip.getBoundingClientRect();
  const tooltipWidth = rect.width || Math.min(288, Math.max(220, window.innerWidth - 32));
  const tooltipHeight = rect.height || 132;
  let x = event.clientX + offset;
  let y = event.clientY + offset;

  if (x + tooltipWidth > window.innerWidth - viewportPadding) {
    x = event.clientX - tooltipWidth - offset;
  }

  if (y + tooltipHeight > window.innerHeight - viewportPadding) {
    y = event.clientY - tooltipHeight - offset;
  }

  tooltip.style.left = `${Math.max(viewportPadding, x)}px`;
  tooltip.style.top = `${Math.max(viewportPadding, y)}px`;
}

function hideEvolutionTooltip() {
  const tooltip = document.getElementById("evolution-chart-tooltip");
  if (!tooltip) return;
  tooltip.classList.remove("is-visible");
  activeEvolutionTooltipBar = null;
  window.clearTimeout(evolutionTooltipHideTimer);
  evolutionTooltipHideTimer = window.setTimeout(() => {
    tooltip.hidden = true;
  }, 180);
}

function resetChartAnimationObservers() {
  chartAnimationToken += 1;
  if (chartAnimationFrame) {
    window.cancelAnimationFrame(chartAnimationFrame);
    chartAnimationFrame = 0;
  }
  if (chartViewportObserver) {
    chartViewportObserver.disconnect();
    chartViewportObserver = null;
  }
  evolutionScrollObservers.forEach((observer) => observer.disconnect());
  evolutionScrollObservers = [];
}

function scheduleChartAnimations(options = {}) {
  if (options.reset !== false) {
    resetChartAnimationObservers();
  }
  const token = chartAnimationToken;
  chartAnimationFrame = requestAnimationFrame(() => {
    chartAnimationFrame = requestAnimationFrame(() => {
      chartAnimationFrame = 0;
      if (token !== chartAnimationToken) return;
      setupChartAnimationObservers();
    });
  });
}

function setupChartAnimationObservers() {
  const animatedItems = Array.from(document.querySelectorAll(".month-column, .tower-bar--horizontal"));
  animatedItems.forEach((item) => {
    item.classList.remove("animate-in");
    item.classList.add("is-awaiting-animation");
  });

  if (!animatedItems.length || !("IntersectionObserver" in window)) {
    animatedItems.forEach(animateChartElement);
    return;
  }

  chartViewportObserver = new IntersectionObserver(
    (entries) => {
      let visibleIndex = 0;
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        animateChartElement(entry.target, visibleIndex);
        visibleIndex += 1;
        chartViewportObserver?.unobserve(entry.target);
      });
    },
    {
      root: null,
      threshold: 0.22,
      rootMargin: "0px 0px -6% 0px",
    },
  );

  animatedItems.forEach((item) => chartViewportObserver.observe(item));
  setupEvolutionScrollAnimationObservers();
}

function setupEvolutionScrollAnimationObservers() {
  document.querySelectorAll(".tower-chart--horizontal").forEach((container) => {
    const containerObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const barObserver = new IntersectionObserver(
            (barEntries) => {
              let visibleIndex = 0;
              barEntries.forEach((barEntry) => {
                if (!barEntry.isIntersecting) return;
                animateChartElement(barEntry.target, visibleIndex);
                visibleIndex += 1;
                barObserver.unobserve(barEntry.target);
              });
            },
            {
              root: container,
              threshold: 0.25,
              rootMargin: "0px 0px -4% 0px",
            },
          );
          container.querySelectorAll(".tower-bar--horizontal").forEach((bar) => barObserver.observe(bar));
          evolutionScrollObservers.push(barObserver);
          containerObserver.unobserve(container);
        });
      },
      {
        root: null,
        threshold: 0.08,
      },
    );
    containerObserver.observe(container);
    evolutionScrollObservers.push(containerObserver);
  });
}

function animateChartElement(element, visibleIndex = 0) {
  if (!element || element.classList.contains("animate-in")) return;
  const staggerIndex = Number.isFinite(visibleIndex) ? visibleIndex : 0;
  element.style.setProperty("--visible-stagger", String(staggerIndex));
  requestAnimationFrame(() => {
    element.classList.add("animate-in");
    element.classList.remove("is-awaiting-animation");
  });
}

function syncComparisonViewControl() {
  if (!el.comparisonViewControl) return;
  el.comparisonViewControl.querySelectorAll("[data-comparison-view]").forEach((button) => {
    const isActive = button.dataset.comparisonView === comparisonPeriodView;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
}

function renderMonthlyBaseEvolution() {
  if (!el.monthlyBaseView) return;
  hideEvolutionTooltip();
  const sheets = ["SVC PERDIDOS", "XPT PERDIDOS", "PNR"];
  const datasets = getComparableDatasets();
  if (!datasets.length) {
    el.monthlyBaseView.innerHTML = emptyState("Sem histórico mensal", "Importe arquivos de Pré-Fatura de meses diferentes para comparar a evolução por base.");
    return;
  }

  el.monthlyBaseView.innerHTML = `
    <div class="monthly-view__header">
      <div>
        <h2>Evolução mensal</h2>
      </div>
      <div class="evolution-view-control" aria-label="Visualização da evolução">
        <span>Visualização</span>
        <div class="evolution-view-toggle" role="group" aria-label="Período da evolução">
          <button
            type="button"
            class="${evolutionPeriodView === "monthly" ? "is-active" : ""}"
            data-evolution-view="monthly"
            aria-pressed="${evolutionPeriodView === "monthly" ? "true" : "false"}"
          >Mensal</button>
          <button
            type="button"
            class="${evolutionPeriodView === "biweekly" ? "is-active" : ""}"
            data-evolution-view="biweekly"
            aria-pressed="${evolutionPeriodView === "biweekly" ? "true" : "false"}"
          >Quinzenal</button>
        </div>
        <span class="panel__meta">${integer.format(datasets.length)} competências</span>
      </div>
    </div>
    <div class="monthly-tower-grid">
      ${sheets.map((sheet, index) => renderSheetEvolutionCard(sheet, datasets, index)).join("")}
    </div>
  `;
}

function getComparableDatasets() {
  const sourceDatasets = getEvolutionSourceDatasets();
  if (evolutionPeriodView === "monthly") {
    return buildMonthlyEvolutionDatasets(sourceDatasets);
  }
  return sourceDatasets
    .map((dataset) => ({
      dataset,
      period: getDatasetPeriod(dataset),
      label: formatEvolutionPeriodLabel(dataset, "biweekly"),
    }))
    .sort((a, b) => a.period.sort - b.period.sort || getDatasetQuarterOrder(a.dataset) - getDatasetQuarterOrder(b.dataset) || a.label.localeCompare(b.label, "pt-BR"));
}

function getEvolutionSourceDatasets() {
  return library.datasets
    .filter((dataset) => dataset && dataset.id !== EMPTY_DATASET_ID && dataset.source !== "filtered" && Array.isArray(dataset.rows) && dataset.rows.length)
    .filter((dataset) => (dataset.fileCategory || inferRowsFileCategory(dataset.rows)) !== PACKAGE_MANAGEMENT_FILE_CATEGORY);
}

function getAnnualPnrRowsForEvolution() {
  const datasets = getEvolutionSourceDatasets();
  const referenceYear = getEvolutionReferenceYear(datasets);
  return datasets
    .filter((dataset) => {
      const key = getDatasetPeriod(dataset).key;
      return referenceYear ? String(key || "").startsWith(`${referenceYear}-`) : true;
    })
    .flatMap((dataset) => Array.isArray(dataset.rows) ? dataset.rows : [])
    .filter((row) => normalizeDonutSheet(row) === "PNR");
}

function getEvolutionReferenceYear(datasets) {
  const selectedMonth = state.monthFilter && state.monthFilter !== "all" ? state.monthFilter : "";
  if (/^\d{4}-\d{2}$/.test(selectedMonth)) return selectedMonth.slice(0, 4);
  const activeKey = getDatasetPeriod(getActiveDataset()).key;
  if (/^\d{4}-\d{2}$/.test(activeKey)) return activeKey.slice(0, 4);
  const years = (Array.isArray(datasets) ? datasets : [])
    .map((dataset) => String(getDatasetPeriod(dataset).key || "").slice(0, 4))
    .filter((year) => /^\d{4}$/.test(year))
    .sort();
  return years[years.length - 1] || String(new Date().getFullYear());
}

function buildMonthlyEvolutionDatasets(sourceDatasets) {
  const groups = new Map();
  sourceDatasets.forEach((dataset) => {
    const period = getDatasetPeriod(dataset);
    const key = period.key || "periodo";
    if (!groups.has(key)) {
      groups.set(key, {
        period,
        rows: [],
        datasets: [],
      });
    }
    const group = groups.get(key);
    group.rows.push(...dataset.rows);
    group.datasets.push(dataset);
  });

  return Array.from(groups.values())
    .map((group) => {
      const [year, month] = String(group.period.key || "").split("-");
      const label = formatEvolutionLabel({ month, year, viewMode: "monthly" });
      return {
        dataset: {
          id: `evolution-month-${group.period.key}`,
          fileName: label,
          label,
          source: "evolution-month",
          importedAt: new Date().toISOString(),
          remoteRecord: null,
          rows: group.rows.map(normalizeStoredRow),
          scopedDatasets: group.datasets,
        },
        period: group.period,
        label,
      };
    })
    .sort((a, b) => a.period.sort - b.period.sort || a.label.localeCompare(b.label, "pt-BR"));
}

function getRowsByMonthlyEvolutionSheet(rows, sheet) {
  return (Array.isArray(rows) ? rows : []).filter((row) => normalizeDonutSheet(row) === sheet);
}

function renderSheetEvolutionCard(sheet, datasets, index) {
  const metricLabel = sheet === "PNR" ? "PNR" : "pacotes perdidos";
  const rowsByDataset = datasets.map(({ dataset, label }) => ({
    label,
    rows: getRowsByMonthlyEvolutionSheet(dataset.rows, sheet),
  }));
  const baseTotals = new Map();
  for (const period of rowsByDataset) {
    for (const row of period.rows) {
      const base = getBaseIdentity(row) || "Sem base";
      baseTotals.set(base, (baseTotals.get(base) || 0) + 1);
    }
  }
  const bases = Array.from(baseTotals.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"))
    .map(([base]) => base);
  const totals = bases.flatMap((base) =>
    rowsByDataset.map((period) => period.rows.filter((row) => getBaseIdentity(row) === base).length),
  );
  const max = Math.max(...totals, 1);
  const sheetTotal = rowsByDataset.reduce((acc, period) => acc + period.rows.reduce((sum, row) => sum + Number(row.valor_numerico || 0), 0), 0);
  const sheetCount = rowsByDataset.reduce((acc, period) => acc + period.rows.length, 0);
  const annualPnrRows = sheet === "PNR" ? getAnnualPnrRowsForEvolution() : [];
  const annualPnrValue = annualPnrRows.reduce((acc, row) => acc + Number(row.valor_numerico || 0), 0);
  const pnrGoal = sheet === "PNR" ? getPnrGoalStatus(annualPnrValue, getAnnualPnrGoalLimit()) : null;

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
    const rows = period.rows.filter((row) => getBaseIdentity(row) === base);
    const total = rows.length;
    const value = rows.reduce((acc, row) => acc + Number(row.valor_numerico || 0), 0);
    return { label: period.label, total, value };
  });
  const evolution = getBaseEvolution(values);
  const bars = values.map((period, index) => {
    const width = period.total ? Math.max(0.8, (period.total / max) * 100) : 0;
    const color = getOffenseColor(period.total, max);
    const canShowValue = period.total && width >= 7;
    const previous = index > 0 ? values[index - 1] : null;
    const delta = previous?.total ? ((period.total - previous.total) / previous.total) * 100 : 0;
    const trendLabel = previous
      ? formatEvolutionTrendText(formatEvolutionTrend(delta))
      : "Base";
    const tooltipLines = [
      `Base: ${formatBaseCode(base)}`,
      `Período: ${period.label}`,
      `Qtd.: ${integer.format(period.total)} ${metricLabel}`,
      `Categoria: ${metricLabel}`,
      `Valor: ${currency.format(period.value)}`,
      `Variação: ${trendLabel}`,
    ].join("\n");
    return `
      <span class="timeline-period timeline-period--horizontal">
        <span class="timeline-period__label">${escapeHtml(shortPeriodLabel(period.label))}</span>
        <span class="tower-bar-rail">
          <span
            class="tower-bar tower-bar--horizontal is-awaiting-animation${canShowValue ? "" : " is-tiny"}"
            style="width:${width.toFixed(1)}%; background:${color}; --bar-index:${index}; --stagger-index:${index}"
            data-tooltip="${escapeAttribute(tooltipLines)}"
            aria-label="${escapeAttribute(tooltipLines.replace(/\n/g, ". "))}"
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
  if (!first && !last) return formatEvolutionTrend(0);
  const delta = first ? ((last - first) / first) * 100 : 100;
  return formatEvolutionTrend(delta);
}

function getPnrGoalStatus(totalValue, limitOverride) {
  const limit = Number(limitOverride || getMonthlyPnrGoalLimit());
  const percent = limit > 0 ? (Number(totalValue || 0) / limit) * 100 : 0;
  let tone = "is-under";
  let label = "Dentro do limite";
  if (percent < 70) {
    tone = "is-under";
    label = "Dentro do limite";
  } else if (percent < 100) {
    tone = "is-warning";
    label = "Atenção";
  } else {
    tone = "is-over";
    label = "Crítico";
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
      title="${escapeAttribute(`${formatPercent(goal.percent)} do limite utilizado`)}"
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
  const monthlyGoal = Number(normalizeGoalSettings(globalGoalSettings).monthly_goal);
  return monthlyGoal > 0 ? monthlyGoal : DEFAULT_PNR_GOAL_LIMIT;
}

function getAnnualPnrGoalLimit() {
  const annualGoal = Number(normalizeGoalSettings(globalGoalSettings).annual_goal);
  return annualGoal > 0 ? annualGoal : DEFAULT_PNR_GOAL_SETTINGS.annual_goal;
}

function getGoalLimitByMode(mode) {
  return mode === "annual" ? getAnnualPnrGoalLimit() : getMonthlyPnrGoalLimit();
}

function getDefaultGoalSettings() {
  return { ...DEFAULT_PNR_GOAL_SETTINGS };
}

function normalizeGoalSettings(settings = {}) {
  const fallback = getDefaultGoalSettings();
  const monthlyGoal = Number(settings.monthly_goal ?? settings.monthlyGoal ?? fallback.monthly_goal);
  const annualGoal = Number(settings.annual_goal ?? settings.annualGoal ?? fallback.annual_goal);

  return {
    monthly_goal: monthlyGoal > 0 ? monthlyGoal : fallback.monthly_goal,
    annual_goal: annualGoal > 0 ? annualGoal : fallback.annual_goal,
    currency: settings.currency || fallback.currency,
    goal_type: settings.goal_type || fallback.goal_type,
  };
}

async function loadGlobalGoalSettings() {
  if (!window.supabaseClient || !currentUser) {
    globalGoalSettings = getDefaultGoalSettings();
    return globalGoalSettings;
  }

  try {
    const { data, error } = await window.supabaseClient
      .from("dashboard_settings")
      .select("*")
      .eq("key", PNR_GOAL_SETTINGS_KEY)
      .maybeSingle();

    if (error) throw error;

    globalGoalSettings = normalizeGoalSettings(data?.value);
    return globalGoalSettings;
  } catch (error) {
    console.error("Erro ao carregar meta global:", error);
    globalGoalSettings = getDefaultGoalSettings();
    showToast("Erro ao carregar configuração de meta.", "warn", 5200);
    return globalGoalSettings;
  }
}

async function savePnrGoalByMode(mode, value) {
  const currentSettings = normalizeGoalSettings(globalGoalSettings);
  const safeValue = Number(value) > 0 ? Number(value) : getGoalLimitByMode(mode);
  const nextSettings = {
    ...currentSettings,
    [mode === "annual" ? "annual_goal" : "monthly_goal"]: safeValue,
  };

  return saveGlobalGoalSettings(nextSettings);
}

async function saveGlobalGoalSettings(settings) {
  const permissions = getActionPermissions();

  if (!permissions.isAdmin) {
    showToast("Apenas administradores podem alterar a meta.", "warn", 5200);
    showPermissionDeniedState();
    hydrateControls();
    return false;
  }

  if (!window.supabaseClient || !currentUser) {
    showToast("Faça login para alterar a meta.", "warn", 4200);
    return false;
  }

  const previousGoalSettings = normalizeGoalSettings(globalGoalSettings);
  const nextGoalSettings = normalizeGoalSettings(settings);

  try {
    const { data, error } = await window.supabaseClient
      .from("dashboard_settings")
      .upsert(
        {
          key: PNR_GOAL_SETTINGS_KEY,
          value: nextGoalSettings,
          updated_by: currentUser.id,
          updated_by_email: currentUser.email,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" },
      )
      .select()
      .single();

    if (error) throw error;

    globalGoalSettings = normalizeGoalSettings(data?.value || nextGoalSettings);
    hydrateControls();
    renderAll();

    await logAudit("update_goal_settings", "dashboard_settings", PNR_GOAL_SETTINGS_KEY, {
      previous_value: previousGoalSettings,
      new_value: globalGoalSettings,
    });

    if (canEdit()) void loadAuditLogs();
    showToast("Meta atualizada para todos os usuários.", "good", 4200);
    return true;
  } catch (error) {
    console.error("Erro ao salvar meta global:", error);
    showToast("Erro ao salvar meta.", "error", 5200);
    hydrateControls();
    return false;
  }
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
  const monthAbbrPattern = MONTH_ABBR.join("|");
  const alreadyFormatted = text.toUpperCase().match(new RegExp(`\\b(?:(1|2)Q\\s*)?(${monthAbbrPattern})\\b`));
  if (alreadyFormatted) return `${alreadyFormatted[1] ? `${alreadyFormatted[1]}Q ` : ""}${alreadyFormatted[2]}`;
  const quarter = text.match(/(\d+)[ªa]?\s*(?:quinzena|q)/i);
  const month = text.match(/(janeiro|fevereiro|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)/i);
  const q = quarter ? `${quarter[1]}Q` : "";
  const m = month ? getMonthAbbr(month[1]) : "";
  const labelText = `${q} ${m}`.trim();
  return isInvalidEvolutionPeriodLabel(labelText) ? "Período" : labelText;
}

function shortMonthYear(label) {
  const match = String(label || "").match(/([^\s/]+)\s*\/\s*(\d{4})/);
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

async function downloadMonthlyReport() {
  if (!ensureReportPermission()) {
    return;
  }
  if (state.sheet === PACKAGE_MANAGEMENT_VIEW) {
    await downloadPackageManagementReport();
    return;
  }
  const reportScope = getReportScope();
  const allMonthlyRows = await buildReportHistoricalComparisonRows(reportScope, state.prefaturaTipo);
  await ensurePackageManagementRowsForReport();
  const filteredRows = getFilteredRows();
  const summary = buildSummary(filteredRows);
  const analysis = buildReportAnalysis({ rows: allMonthlyRows, filteredRows, summary, scope: reportScope, typeSelection: state.prefaturaTipo });
  await ensurePdfLogoImage();
  const pdf = buildReportPdfBlob({ analysis, filteredRows, summary });
  downloadBlob(pdf, analysis.fileName);
  await logAudit("generate_report", "report", null, {
    selected_month: state.monthFilter || "all",
    selected_period: state.period,
    records_count: filteredRows?.length || 0,
  });
  showToast("Relatório de performance baixado.", "good", 4200);
}

async function downloadPackageManagementReport() {
  const reportScope = getPackageReportScope();
  await ensurePackageManagementRowsForReport();
  const packageRows = getPackageManagementRowsForView();
  const prefaturaRows = await loadPrefaturaRowsForReportScope(reportScope, {
    monthSelection: getPackageMonthSelectionValues(),
    periodMode: state.packagePeriod || "month",
    typeSelection: state.packageTipo,
  });
  const packageComparison = buildPackageManagementComparison(packageRows, prefaturaRows);
  const summary = buildPackageReportSummary(packageComparison, packageRows);
  const allMonthlyRows = await buildReportHistoricalComparisonRows(reportScope, state.packageTipo);
  const analysis = buildReportAnalysis({
    rows: allMonthlyRows,
    filteredRows: prefaturaRows,
    summary,
    scope: reportScope,
    typeSelection: state.packageTipo,
    reportMode: "package",
    packageRows,
    packageComparison,
  });
  await ensurePdfLogoImage();
  const pdf = buildReportPdfBlob({ analysis, filteredRows: prefaturaRows, summary });
  downloadBlob(pdf, analysis.fileName);
  await logAudit("generate_report", "report", null, {
    selected_months: getPackageMonthSelectionValues(),
    selected_period: state.packagePeriod || "month",
    selected_types: getPackageTypeSelectionValues(state.packageTipo),
    records_count: packageRows.length,
    report_tab: PACKAGE_MANAGEMENT_VIEW,
  });
  showToast("Relatório de Gestão de Pacotes baixado.", "good", 4200);
}

async function ensurePdfLogoImage() {
  if (PDF_LOGO_IMAGE.base64 || !PDF_LOGO_IMAGE.src) return;
  if (!pdfLogoLoadPromise) {
    pdfLogoLoadPromise = fetch(PDF_LOGO_IMAGE.src)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.arrayBuffer();
      })
      .then((buffer) => {
        PDF_LOGO_IMAGE.base64 = arrayBufferToBase64(buffer);
      })
      .catch((error) => {
        console.warn("[REPORT] Logo do PDF não carregado:", error);
      });
  }
  await pdfLogoLoadPromise;
}

async function ensurePackageManagementRowsForReport() {
  if (!currentUser || !window.supabaseClient) return packageManagementRows;
  const files = dashboardFileRecords.length
    ? dashboardFileRecords
    : await loadDashboardFilesFromSupabase({ loadActive: false, render: false, validateStorage: false, showLoading: false });
  const cachedDatasets = new Map(
    (Array.isArray(library.datasets) ? library.datasets : [])
      .filter((dataset) => dataset?.source !== "filtered" && Array.isArray(dataset.rows) && dataset.rows.length)
      .map((dataset) => [dataset.id, dataset]),
  );
  await loadPackageManagementRowsForCards(files, cachedDatasets);
  return packageManagementRows;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
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
    const infoW = 168;
    const infoH = 52;
    const infoX = page.width - page.margin - infoW;
    const infoY = 773;
    commands.push(`${colors.soft} rg 0 0 ${page.width} ${page.height} re f`);
    addRect(0, 754, page.width, 88, colors.navy);
    addRect(0, 754, page.width, 5, colors.teal);
    addRect(infoX, infoY, infoW, infoH, "0.06 0.24 0.36");
    addStrokeRect(infoX, infoY, infoW, infoH, "0.16 0.42 0.55");
    addLine(page.margin, 754, page.width - page.margin, 754, colors.teal, 0.9);
    if (PDF_LOGO_IMAGE.base64) addPdfImage(PDF_LOGO_IMAGE.name, page.margin, 768, 60, 60);
    addText("Painel de Inteligência", page.margin + 74, 815, 8.2, "0.77 0.88 0.96", "left", "F2");
    addText("Relatório Executivo", page.margin + 74, 798, 14.1, colors.white, "left", "F2");
    addText(analysis.reportSubtitle || "Pré-Fatura", page.margin + 74, 784, 10.5, "0.86 0.95 1", "left");
    addText("Loss · Dashboard", infoX + 14, 810, 8.4, colors.white, "left", "F2");
    addText(`Período: ${analysis.scopeLabel}`, infoX + 14, 796, 8.1, "0.82 0.92 0.98", "left");
    addText(analysis.generatedAt, infoX + 14, 783, 8.1, "0.82 0.92 0.98", "left");
    y = 734;
  };
  const addText = (text, x, yy, size = 10, color = "0.08 0.14 0.22", align = "left", font = "F1") => {
    const value = String(text ?? "");
    const offset = align === "right" ? estimatePdfTextWidth(value, size) : align === "center" ? estimatePdfTextWidth(value, size) / 2 : 0;
    commands.push(`${color} rg BT /${font} ${size} Tf ${Math.max(0, x - offset).toFixed(1)} ${yy.toFixed(1)} Td <${pdfTextHex(value)}> Tj ET`);
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
  const addPdfImage = (name, x, yy, w, h) => {
    commands.push(`q ${w.toFixed(1)} 0 0 ${h.toFixed(1)} ${x.toFixed(1)} ${yy.toFixed(1)} cm /${name} Do Q`);
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
    addText(meta ? `${title} — ${meta}` : title, page.margin, y, 13, colors.ink, "left", "F2");
    y -= 10;
    addLine(page.margin, y, page.width - page.margin, y, colors.line, 0.6);
    y -= 16;
  };
  const metricCard = (x, top, w, h, label, value, note, accent, fill) => {
    card(x, top, w, h, fill, accent);
    addText(label, x + 12, top - 17, 7.8, colors.muted);
    addWrappedText(value, x + 12, top - 36, w - 24, value.length > 18 ? 11.5 : 14.5, accent, 13, 2, true);
    if (note) addWrappedText(note, x + 12, top - 55, w - 24, 7.2, colors.muted, 8.5, 2, true);
  };
  const drawParagraphCard = (title, text, height, accent = colors.teal, fill = colors.white) => {
    ensure(height + 26);
    sectionTitle(title, analysis.scope.mode === "annual" ? "consolidado anual" : "recorte selecionado");
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
      ["Impacto financeiro", currency.format(summary.totalValue), "", colors.orange, colors.warm],
      ["Ticket médio", currency.format(analysis.ticketAverage), "por registro válido", colors.teal, colors.white],
      ["PNR", integer.format(summary.pnrCount), `${analysis.pnrShare}% dos registros`, colors.red, colors.dangerSoft],
      ["Pacotes perdidos", integer.format(summary.packageCount), `${analysis.packageShare}% dos registros`, colors.blue, colors.blueSoft],
      ["Registros", integer.format(summary.count), `${integer.format(summary.baseCount)} bases e ${integer.format(summary.driverCount)} drivers`, colors.blue, colors.white],
      ["Média mensal", currency.format(analysis.monthlyAverage), "", colors.orange, colors.white],
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
  const drawPackageKpiGrid = () => {
    const comparison = analysis.packageComparison || buildPackageManagementComparison(analysis.packageRows || [], []);
    const byLabel = new Map((comparison.lines || []).map((line) => [line.label, line]));
    const result = (label) => byLabel.get(label) || { value: 0, comparison: "Sem base de comparação", kind: "count" };
    const distribution = comparison.typeDistribution || buildPackageTypeDistribution(comparison.rows);
    const totalGestaoValue = Number(comparison.summary?.alcValue || 0) + Number(comparison.summary?.driverValue || 0) + Number(comparison.summary?.dispatcherValue || 0);
    const gap = 10;
    const cols = 4;
    const w = (contentW - gap * (cols - 1)) / cols;
    const h = 64;
    const metrics = [
      ["Absorvido pela ALC", currency.format(result("Absorvido pela ALC").value || 0), result("Absorvido pela ALC").comparison, colors.green, colors.greenSoft],
      ["Desconto com Driver", currency.format(result("Desconto mantido com Driver").value || 0), result("Desconto mantido com Driver").comparison, colors.orange, colors.warm],
      ["Direcionado ao Dispatcher", currency.format(result("Direcionado ao Dispatcher").value || 0), result("Direcionado ao Dispatcher").comparison, colors.blue, colors.blueSoft],
      ["Total Gestão", currency.format(totalGestaoValue), `${integer.format(distribution.total || 0)} registros válidos`, colors.teal, colors.white],
      ["Erros do Driver", integer.format(result("Erros do Driver").value || 0), result("Erros do Driver").comparison, colors.orange, colors.warm],
      ["Erros do Dispatcher", integer.format(result("Erros do Dispatcher").value || 0), result("Erros do Dispatcher").comparison, colors.blue, colors.blueSoft],
      ["Erros do Mercado Livre", integer.format(result("Erros do Mercado Livre").value || 0), result("Erros do Mercado Livre").comparison, colors.red, colors.dangerSoft],
      ["Base Pré-Fatura", currency.format(comparison.prefaturaSummary?.totalValue || 0), `${integer.format(comparison.prefaturaSummary?.count || 0)} registros no mesmo recorte`, colors.teal, colors.white],
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
      const cellX = align === "right" ? cursor + widths[index] - 4 : align === "center" ? cursor + widths[index] / 2 : cursor;
      addText(clipPdfText(header, widths[index] - 8, 7.3), cellX, tableTop - 8, 7.3, colors.muted, align);
      cursor += widths[index];
    });
    rows.forEach((row, rowIndex) => {
      const rowY = tableTop - 29 - rowIndex * 18;
      if (rowIndex % 2 === 1) addRect(x + 10, rowY - 7, w - 20, 16, "0.97 0.985 1");
      cursor = x + 14;
      row.forEach((cell, index) => {
        const text = String(cell ?? "");
        const align = aligns[index] || (index >= 2 ? "right" : "left");
        const size = index === 1 && text.length > 28 ? 6.7 : 8;
        const cellX = align === "right" ? cursor + widths[index] - 4 : align === "center" ? cursor + widths[index] / 2 : cursor;
        addText(clipPdfText(text, widths[index] - 8, size), cellX, rowY, size, colors.ink, align);
        cursor += widths[index];
      });
    });
  };
  const drawWrappedTable = (x, top, w, title, headers, rows, widths, accent = colors.blue, aligns = []) => {
    const sizes = widths.map((_, index) => (index === 2 ? 7.4 : 7.8));
    const rowHeights = rows.map((row) => {
      const lineCounts = row.map((cell, index) => {
        if ((aligns[index] || "") === "right") return 1;
        return wrapPdfText(cell, widths[index] - 8, sizes[index], index === 2 ? 4 : 2).length;
      });
      return Math.max(22, Math.max(...lineCounts) * 9.4 + 9);
    });
    const height = 50 + rowHeights.reduce((acc, value) => acc + value, 0);
    card(x, top, w, height, colors.white, accent);
    addText(title, x + 12, top - 18, 10.5, colors.ink);
    const tableTop = top - 32;
    addRect(x + 10, tableTop - 14, w - 20, 18, colors.tableHead);
    let cursor = x + 14;
    headers.forEach((header, index) => {
      const align = aligns[index] || "left";
      const cellX = align === "right" ? cursor + widths[index] - 4 : align === "center" ? cursor + widths[index] / 2 : cursor;
      addText(clipPdfText(header, widths[index] - 8, 7.3), cellX, tableTop - 8, 7.3, colors.muted, align);
      cursor += widths[index];
    });
    let rowTop = tableTop - 28;
    rows.forEach((row, rowIndex) => {
      const rowHeight = rowHeights[rowIndex];
      if (rowIndex % 2 === 1) addRect(x + 10, rowTop - rowHeight + 8, w - 20, rowHeight - 2, "0.97 0.985 1");
      cursor = x + 14;
      row.forEach((cell, index) => {
        const text = String(cell ?? "");
        const align = aligns[index] || "left";
        const size = sizes[index];
        if (align === "right") {
          addText(clipPdfText(text, widths[index] - 8, size), cursor + widths[index] - 4, rowTop, size, colors.ink, "right");
        } else if (align === "center") {
          addText(clipPdfText(text, widths[index] - 8, size), cursor + widths[index] / 2, rowTop, size, colors.ink, "center");
        } else {
          addWrappedText(text, cursor, rowTop, widths[index] - 8, size, colors.ink, 9.4, index === 2 ? 4 : 2, true);
        }
        cursor += widths[index];
      });
      rowTop -= rowHeight;
    });
    return height;
  };
  const drawMonthlyTable = () => {
    ensure(150);
    sectionTitle("Comparativo mensal", analysis.scope.mode === "annual" ? "ano consolidado" : "recorte selecionado x mês anterior");
    const rows = analysis.timelineRows.slice(-8).map((row, index) => [
      shortMonthYear(row.label),
      integer.format(row.count || 0),
      formatCurrencyShort(row.totalValue),
      index === 0 || !row.previous ? "—" : formatSignedPct(row.deltaPct),
    ]);
    drawTable(page.margin, y, contentW, "Evolução por competência", ["Mês", "Registros", "Descontos", "Variação"], rows, [110, 100, 150, 120], 48 + rows.length * 18, colors.blue, ["left", "right", "right", "right"]);
    y -= 68 + rows.length * 18;
  };
  const drawAlertCards = () => {
    ensure(150);
    const visibleAlerts = analysis.alerts.slice(0, 4);
    sectionTitle("Alertas críticos", `${visibleAlerts.length} alertas`);
    const h = 54;
    visibleAlerts.forEach((alert, index) => {
      ensure(h + 8);
      card(page.margin, y, contentW, h, index === 0 ? colors.dangerSoft : colors.white, colors.red);
      addText(alert.title, page.margin + 14, y - 17, 9, colors.red);
      addWrappedText(alert.text, page.margin + 14, y - 33, contentW - 28, 8.4, colors.ink, 10.5, 2);
      y -= h + 8;
    });
    y -= 8;
  };
  const drawRankings = () => {
    ensure(370);
    sectionTitle("Rankings de concentração financeira", "base e driver");
    const baseRows = analysis.topBases.slice(0, 6).map((item, index) => [`${index + 1}`, formatRankingName(item.label), formatCurrencyShort(item.total), `${item.share}%`]);
    const driverRows = analysis.topDrivers.slice(0, 6).map((item, index) => [`${index + 1}`, formatRankingName(item.label), formatCurrencyShort(item.total), `${item.share}%`]);
    const baseH = 48 + baseRows.length * 18;
    const driverH = 48 + driverRows.length * 18;
    const widths = [24, 300, 125, 48];
    drawTable(page.margin, y, contentW, "Bases com maior prejuízo", ["#", "Nome", "Valor", "%"], baseRows, widths, baseH, colors.orange, ["left", "left", "right", "right"]);
    y -= baseH + 12;
    drawTable(page.margin, y, contentW, "Drivers com maior impacto", ["#", "Nome", "Valor", "%"], driverRows, widths, driverH, colors.blue, ["left", "left", "right", "right"]);
    y -= driverH + 24;
  };
  const drawCategoryTable = () => {
    ensure(124);
    sectionTitle("Participação por categoria", "impacto total");
    const rows = analysis.categoryTotals.map((item) => [reportCategoryLabel(item.label), `${analysis.categoryShareMap[item.label] || "0,0"}%`, formatCurrencyShort(item.total)]);
    drawTable(page.margin, y, contentW, "Composição financeira por categoria", ["Categoria", "Percentual", "Valor"], rows, [230, 120, 150], 104, colors.teal, ["left", "right", "right"]);
    y -= 130;
  };
  const drawPackageMonthlyEvolution = () => {
    const evolutionRows = Array.isArray(analysis.packageEvolutionRows) ? analysis.packageEvolutionRows : buildPackageMonthlyEvolutionRows(analysis.packageRows || []);
    const summaryText = buildPackageMonthlyEvolutionText(evolutionRows);
    ensure(86);
    sectionTitle("Evolução mensal", "Gestão de Pacotes");
    if (!evolutionRows.length) {
      const h = 62;
      card(page.margin, y, contentW, h, colors.white, colors.blue);
      addText("Evolução mensal — Gestão de Pacotes", page.margin + 12, y - 18, 10.5, colors.ink);
      addWrappedText(summaryText, page.margin + 12, y - 39, contentW - 24, 8.6, colors.muted, 10.5, 2);
      y -= h + 14;
      return;
    }

    const financialRows = evolutionRows.map((row) => [
      row.label,
      currency.format(row.alcValue || 0),
      currency.format(row.driverValue || 0),
      currency.format(row.dispatcherValue || 0),
    ]);
    const financialHeight = 48 + financialRows.length * 18;
    ensure(financialHeight + 12);
    drawTable(page.margin, y, contentW, "Valores financeiros por competência", ["Competência", "ALC", "Driver", "Dispatcher"], financialRows, [125, 126, 126, 125], financialHeight, colors.teal, ["left", "right", "right", "right"]);
    y -= financialHeight + 12;

    const errorRows = evolutionRows.map((row) => [
      row.label,
      integer.format(row.driverErrors || 0),
      integer.format(row.dispatcherErrors || 0),
      integer.format(row.mercadoLivreErrors || 0),
    ]);
    const errorHeight = 48 + errorRows.length * 18;
    ensure(errorHeight + 12);
    drawTable(page.margin, y, contentW, "Erros por competência", ["Competência", "Erros Driver", "Erros Dispatcher", "Erros Mercado Livre"], errorRows, [125, 126, 126, 125], errorHeight, colors.blue, ["left", "right", "right", "right"]);
    y -= errorHeight + 12;

    const summaryLines = wrapPdfText(summaryText, contentW - 28, 8.6, 4);
    const h = Math.max(52, 24 + summaryLines.length * 11);
    ensure(h + 14);
    card(page.margin, y, contentW, h, colors.blueSoft, colors.blue);
    addWrappedText(summaryText, page.margin + 14, y - 17, contentW - 28, 8.6, colors.ink, 10.8, 4);
    y -= h + 14;
  };
  const drawPackageManagementComparison = () => {
    const comparison = analysis.packageComparison;
    if (!comparison) return;
    const rows = comparison.lines.map((line) => [
      line.label,
      formatPackageComparisonResult(line),
      line.comparison,
      integer.format(line.located || 0),
    ]);
    const widths = [142, 88, 224, 58];
    const tablePreviewHeight = 50 + rows.reduce((acc, row) => {
      const comparisonLines = wrapPdfText(row[2], widths[2] - 8, 7.4, 4).length;
      return acc + Math.max(22, comparisonLines * 9.4 + 9);
    }, 0);
    const distribution = comparison.typeDistribution || buildPackageTypeDistribution(comparison.rows);
    const distributionRows = formatPackageTypeDistributionRows(distribution);
    const distributionHeight = Number(distribution.total || 0) ? 48 + distributionRows.length * 18 : 62;
    const summaryText = buildPackageComparisonExecutiveText(comparison);
    const summaryLines = wrapPdfText(summaryText, contentW - 28, 8.6, 6);
    const summaryHeight = Math.max(54, 26 + summaryLines.length * 11);
    ensure(tablePreviewHeight + distributionHeight + summaryHeight + 90);
    sectionTitle("Gestão de Pacotes", "comparação com Pré-Fatura");
    const usedHeight = drawWrappedTable(
      page.margin,
      y,
      contentW,
      "Gestão de Pacotes — comparação com Pré-Fatura",
      ["Indicador", "Resultado", "Compara\u00e7\u00e3o", "Localizados"],
      rows,
      widths,
      colors.teal,
      ["left", "right", "left", "right"],
    );
    y -= usedHeight + 14;
    if (Number(distribution.total || 0)) {
      drawTable(
        page.margin,
        y,
        contentW,
        "Distribuição por tipo — Gestão de Pacotes",
        ["Tipo", "Quantidade", "Percentual"],
        distributionRows,
        [176, 176, 150],
        distributionHeight,
        colors.blue,
        ["left", "right", "right"],
      );
      y -= distributionHeight + 14;
    } else {
      card(page.margin, y, contentW, distributionHeight, colors.white, colors.blue);
      addText("Distribuição por tipo — Gestão de Pacotes", page.margin + 12, y - 18, 10.5, colors.ink);
      addText("Sem dados no recorte", page.margin + 12, y - 42, 8.8, colors.muted);
      y -= distributionHeight + 14;
    }
    if (analysis.reportMode === "package") drawPackageMonthlyEvolution();
    ensure(summaryHeight + 16);
    card(page.margin, y, contentW, summaryHeight, colors.greenSoft, colors.teal);
    addWrappedText(summaryText, page.margin + 14, y - 17, contentW - 28, 8.6, colors.ink, 10.8, 6);
    y -= summaryHeight + 24;
  };
  const drawNumberedList = (title, meta, items, accent = colors.green) => {
    ensure(128);
    sectionTitle(title, meta);
    const h = Math.max(120, 36 + items.length * 24);
    card(page.margin, y, contentW, h, colors.greenSoft, accent);
    items.forEach((item, index) => {
      const rowY = y - 24 - index * 24;
      addText(`${index + 1}.`, page.margin + 18, rowY, 9, accent);
      addWrappedText(item, page.margin + 50, rowY, contentW - 70, 8.8, colors.ink, 11, 2);
    });
    y -= h + 26;
  };
  const drawConclusion = () => {
    ensure(238);
    sectionTitle("Conclusão executiva", "prioridade operacional");
    const h = 220;
    card(page.margin, y, contentW, h, "0.98 0.995 1", colors.navy);
    addRect(page.margin + 4, y - 34, contentW - 4, 34, colors.navy);
    addText("Fechamento executivo do período", page.margin + 18, y - 21, 10.5, colors.white, "left", "F2");
    analysis.conclusionItems.forEach((item, index) => {
      const rowTop = y - 50 - index * 32;
      if (index % 2 === 1) addRect(page.margin + 12, rowTop - 20, contentW - 24, 26, "0.94 0.98 1");
      addText(`${item.label}:`, page.margin + 18, rowTop, 9, colors.navy, "left", "F2");
      addWrappedText(item.text, page.margin + 190, rowTop, contentW - 208, 8.7, colors.ink, 10.8, 2);
    });
    y -= h + 18;
  };

  addPage();
  if (analysis.reportMode === "package") {
    drawPackageKpiGrid();
    drawParagraphCard("Análise da Gestão de Pacotes", analysis.intelligentSummary, 116);
    drawMonthlyTable();
    drawPackageManagementComparison();
    drawNumberedList("Recomendações de ação", "próximos passos", analysis.recommendations);
    drawConclusion();
  } else {
    drawKpiGrid();
  drawParagraphCard("Análise inteligente do período", analysis.intelligentSummary, 132);
  drawDiagnosticCards();
  drawMonthlyTable();
  drawAlertCards();
  drawRankings();
  addPage();
  drawCategoryTable();
  drawPackageManagementComparison();
  drawNumberedList("Recomendações de ação", "próximos passos", analysis.recommendations);
  drawConclusion();

  }

  pages.push(commands.join("\n"));
  const totalPages = pages.length;
  const pagesWithFooter = pages.map((content, index) => {
    const label = `Página ${index + 1} de ${totalPages}`;
    const x = page.width - page.margin - estimatePdfTextWidth(label, 7.5);
    return `${content}\n${colors.line} RG 0.5 w ${page.margin.toFixed(1)} 28.0 m ${(page.width - page.margin).toFixed(1)} 28.0 l S\n${colors.muted} rg BT /F1 7.5 Tf ${x.toFixed(1)} 16.0 Td <${pdfTextHex(label)}> Tj ET`;
  });
  return createPdfBlob(pagesWithFooter);
}

function buildReportAnalysis({ rows, filteredRows, summary, scope: providedScope = null, typeSelection = state.prefaturaTipo, reportMode = "prefatura", packageRows = [], packageComparison = null }) {
  const scope = providedScope || getReportScope();
  const yearRows = rows.filter((row) => String(row.key).startsWith(`${scope.year}-`));
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
  const timelineRows = (
    scope.mode === "annual"
      ? yearRows
      : activeMonth
        ? rows.filter((row) => row.key === previousMonth?.key || row.key === activeMonth.key)
        : [fallbackRow]
  ).filter(Boolean);
  const comparisonRows = timelineRows.length ? timelineRows : [fallbackRow];
  const topBases = reportTopBy(filteredRows, "base", "valor_numerico", 8);
  const topDrivers = reportTopBy(filteredRows, "motorista", "valor_numerico", 8);
  const topBaseByCount = reportTopBy(filteredRows, "base", null, 5);
  const selectedReportDivisions = getPrefaturaDivisionsForTypes(typeSelection);
  const reportSheets = selectedReportDivisions.length < MAIN_TYPE_OPTIONS.length ? selectedReportDivisions : DONUT_SHEETS;
  const categoryTotals = reportSheets.map((sheet) => {
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
  const packagePrefaturaRows = filterPrefaturaRowsByTypes(filteredRows, state.sheet === PACKAGE_MANAGEMENT_VIEW ? typeSelection : state.packageTipo);
  const packageComparisonData = packageComparison || buildPackageManagementComparisonForScope(scope, packagePrefaturaRows, state.packageTipo);
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
    summary,
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
    reportMode,
    reportSubtitle: reportMode === "package" ? "Gestão de Pacotes" : "Pré-Fatura",
    scopeLabel: scope.label,
    generatedAt: `Gerado em: ${formatCurrentDateTime(new Date())}`,
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
    packageRows,
    packageEvolutionRows: reportMode === "package" ? buildPackageMonthlyEvolutionRows(packageRows) : [],
    packageComparison: packageComparisonData,
    diagnostics,
    alerts,
    recommendations,
    conclusion,
    conclusionItems: buildReportConclusionItems({
      scope,
      summary,
      topBase,
      topDriver,
      dominantCategory,
      criticalMonth,
      trend,
      recommendations,
    }),
    intelligentSummary: reportMode === "package"
      ? buildPackageReportIntelligentSummary({ scope, comparison: packageComparisonData })
      : buildIntelligentSummary({
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
  const periodMode = normalizePeriodMode(state.period);
  const periodLabel = getPeriodModeLabel(periodMode);
  if (selectedKey === "all") {
    const annualPeriodLabel = periodMode === "month" ? "todos os meses" : periodLabel.toLowerCase();
    return {
      mode: "annual",
      key: "all",
      year,
      periodMode,
      periodLabel,
      label: `Anual ${year} — ${annualPeriodLabel}`,
      title: `Relatório Executivo de Pré-Fatura — Anual ${year}`,
      fileName: buildReportDownloadFileName({
        typeLabel: "Pré-Fatura",
        mode: "annual",
        year,
        periodMode,
      }),
    };
  }
  const monthIndex = Number(String(key).slice(5, 7)) || 1;
  const monthName = MONTHS[monthIndex - 1] || "período";
  const monthLabel = `${capitalize(monthName)}/${year}`;
  const label = `${monthLabel} — ${periodLabel.toLowerCase()}`;
  return {
    mode: "monthly",
    key,
    year,
    periodMode,
    periodLabel,
    monthLabel,
    label,
    title: `Relatório Executivo de Pré-Fatura — ${label}`,
    fileName: buildReportDownloadFileName({
      typeLabel: "Pré-Fatura",
      mode: "monthly",
      year,
      monthName,
      periodMode,
    }),
  };
}

function formatReportFilePeriodLabel(periodMode) {
  const normalized = normalizePeriodMode(periodMode);
  if (normalized === "q1") return "1ª Quinzena";
  if (normalized === "q2") return "2ª Quinzena";
  return "Mês Completo";
}

function buildReportDownloadFileName({ typeLabel, mode, year, monthName = "", periodMode = "month", recorteLabel = "" }) {
  const parts = ["Relatório", typeLabel];
  if (mode === "annual") {
    parts.push("Anual", String(year));
  } else {
    parts.push("Mensal", String(year));
    parts.push(monthName ? capitalize(monthName) : recorteLabel || "Recorte Mês");
  }
  parts.push(formatReportFilePeriodLabel(periodMode));
  return `${parts.filter(Boolean).join(" ")}.pdf`;
}

function getPackageReportScope() {
  const monthOptions = getAvailablePackageMonthOptions();
  const selectedMonths = getPackageMonthSelectionValues();
  const periodMode = normalizePeriodMode(state.packagePeriod || "month");
  const periodLabel = getPeriodModeLabel(periodMode);
  const allMonthsSelected = !monthOptions.length || selectedMonths.length === monthOptions.length;
  const firstKey = selectedMonths[0] || monthOptions[0]?.key || getDatasetPeriod(getActiveDataset()).key;
  const year = String(firstKey || "").slice(0, 4) || String(new Date().getFullYear());

  if (selectedMonths.length === 1 && !allMonthsSelected) {
    const monthIndex = Number(String(firstKey).slice(5, 7)) || 1;
    const monthName = MONTHS[monthIndex - 1] || "período";
    const monthLabel = `${capitalize(monthName)}/${year}`;
    const label = `${monthLabel} — ${periodLabel.toLowerCase()}`;
    return {
      mode: "monthly",
      key: firstKey,
      year,
      periodMode,
      periodLabel,
      monthLabel,
      label,
      title: `Relatório Executivo — Gestão de Pacotes — ${label}`,
      fileName: buildReportDownloadFileName({
        typeLabel: "Gestão de Pacotes",
        mode: "monthly",
        year,
        monthName,
        periodMode,
      }),
    };
  }

  const selectedLabel = allMonthsSelected
    ? `Anual ${year}`
    : getMonthSelectionLabel(selectedMonths, monthOptions);
  const periodSuffix = periodMode === "month" ? "mês completo" : periodLabel.toLowerCase();
  const label = `${selectedLabel} — ${periodSuffix}`;
  return {
    mode: "annual",
    key: allMonthsSelected ? "all" : firstKey,
    year,
    periodMode,
    periodLabel,
    monthSelection: selectedMonths,
    label,
    title: `Relatório Executivo — Gestão de Pacotes — ${label}`,
    fileName: buildReportDownloadFileName({
      typeLabel: "Gestão de Pacotes",
      mode: allMonthsSelected ? "annual" : "monthly",
      year,
      periodMode,
      recorteLabel: "Recorte Mês",
    }),
  };
}

function filterReportFilesByMonthSelection(files, monthSelection, periodMode) {
  const selectedMonths = Array.isArray(monthSelection) ? monthSelection.filter(Boolean) : [];
  const allMonthsSelected = !selectedMonths.length;
  const normalizedPeriod = normalizePeriodMode(periodMode);
  return (Array.isArray(files) ? files : [])
    .filter(isUsableDashboardFileRecord)
    .filter((file) => {
      const period = getFileRecordPeriod(file);
      if (!allMonthsSelected && !selectedMonths.includes(period.key)) return false;
      if (normalizedPeriod === "month") return true;
      return period.periodType === normalizedPeriod;
    });
}

async function loadPrefaturaRowsForReportScope(scope, options = {}) {
  const typeSelection = options.typeSelection || state.prefaturaTipo;
  const files = await getReportAvailableFileRecords();
  const monthSelection = options.monthSelection || (scope.mode === "annual" ? [] : [scope.key]);
  const selectedFiles = filterReportFilesByMonthSelection(files, monthSelection, options.periodMode || scope.periodMode);
  const datasetById = new Map(
    (Array.isArray(library.datasets) ? library.datasets : [])
      .filter((dataset) => dataset?.source !== "filtered" && Array.isArray(dataset.rows) && dataset.rows.length)
      .map((dataset) => [dataset.id, dataset]),
  );
  const datasets = [];
  for (const file of uniqueDashboardFileRecords(selectedFiles)) {
    const cached = datasetById.get(file.id);
    if (cached?.rows?.length) {
      datasets.push(cached);
      continue;
    }
    try {
      const dataset = await loadRowsFromStorage(file);
      if (dataset?.rows?.length) {
        datasets.push(dataset);
        datasetById.set(file.id, dataset);
        if (!library.datasets.some((entry) => entry.id === dataset.id)) {
          library.datasets.push(dataset);
        }
      }
    } catch (error) {
      console.error("[REPORT] Falha ao carregar Pré-Fatura para comparação:", file?.file_name, error);
    }
  }
  return filterPrefaturaRowsByTypes(datasets.flatMap((dataset) => dataset.rows), typeSelection);
}

function buildPackageReportSummary(comparison, packageRows = []) {
  const summary = comparison?.summary || buildPackageManagementSummary(packageRows);
  const baseRows = (Array.isArray(packageRows) ? packageRows : []).filter(isPackageManagementDetailRow);
  const totalValue = Number(summary.alcValue || 0) + Number(summary.driverValue || 0) + Number(summary.dispatcherValue || 0);
  const driverCount = uniqueCount(baseRows, "motorista");
  const baseCount = uniqueCount(baseRows, "base");
  return {
    count: Number(summary.count || baseRows.length || 0),
    totalValue,
    baseCount,
    driverCount,
    routeCount: uniqueCount(baseRows, "rota"),
    packageCount: Number(summary.dispatcherErrors || 0),
    pnrCount: Number(summary.mercadoLivreErrors || 0),
    topBase: topBy(baseRows, "base", "valor_numerico", 1)[0] || null,
    topDriver: topBy(baseRows, "motorista", "valor_numerico", 1)[0] || null,
    packageShare: summary.count ? ((Number(summary.dispatcherErrors || 0) / summary.count) * 100).toFixed(1) : "0.0",
    pnrShare: summary.count ? ((Number(summary.mercadoLivreErrors || 0) / summary.count) * 100).toFixed(1) : "0.0",
    fileName: "Gestão de Pacotes",
    lastUpdate: baseRows.length ? formatDate(maxDate(baseRows)) : "--",
  };
}

function buildPackageReportIntelligentSummary({ scope, comparison }) {
  if (!comparison?.hasPackageRows) {
    return `No recorte ${scope.label}, não há registros válidos de Gestão de Pacotes para análise executiva.`;
  }
  const summary = comparison.summary || {};
  const distribution = comparison.typeDistribution || buildPackageTypeDistribution(comparison.rows);
  const dominant = distribution.dominant || null;
  const prefaturaBase = comparison.prefaturaSummary || {};
  const totalGestaoValue = Number(summary.alcValue || 0) + Number(summary.driverValue || 0) + Number(summary.dispatcherValue || 0);
  const dominantSentence = dominant
    ? `O tipo ${dominant.type} concentrou ${integer.format(dominant.count)} registro${dominant.count === 1 ? "" : "s"}, equivalente a ${formatNumberPt(dominant.share, 1)}% da Gestão de Pacotes.`
    : "Não houve distribuição por tipo disponível no recorte.";
  const comparisonSentence = Number(prefaturaBase.totalValue || 0)
    ? `A base de comparação da Pré-Fatura no mesmo recorte soma ${currency.format(prefaturaBase.totalValue)} em ${integer.format(prefaturaBase.count || 0)} registros.`
    : "Não há Pré-Fatura no mesmo recorte para comparação percentual.";
  return [
    `No recorte ${scope.label}, a Gestão de Pacotes registrou ${integer.format(summary.count || 0)} ocorrência${Number(summary.count || 0) === 1 ? "" : "s"} válida${Number(summary.count || 0) === 1 ? "" : "s"} e ${currency.format(totalGestaoValue)} nos três grupos financeiros principais.`,
    `${dominantSentence} Foram identificados ${integer.format(summary.driverErrors || 0)} erros do Driver, ${integer.format(summary.dispatcherErrors || 0)} erros do Dispatcher e ${integer.format(summary.mercadoLivreErrors || 0)} erros do Mercado Livre.`,
    comparisonSentence,
  ].join(" ");
}

function buildReportTrend(scope, activeMonth, previousMonth, comparisonRows) {
  if (scope.mode === "monthly") {
    if (!activeMonth || !previousMonth) {
      return { direction: "neutral", pct: 0, text: "Não há mês anterior carregado para comparação direta." };
    }
    const deltaPct = calculateVariation(activeMonth.totalValue, previousMonth.totalValue);
    if (deltaPct == null) {
      return { direction: "neutral", pct: 0, text: `Mês anterior ${shortMonthYear(previousMonth.label)} sem valor base para comparação percentual.` };
    }
    const reference = getReportTrendReferenceLabel(scope, previousMonth);
    const text = formatTotalDiscountComparison({
      currentValue: activeMonth.totalValue,
      previousValue: previousMonth.totalValue,
      previousLabel: reference,
      isAllMonths: false,
    }).replace(" vs. ", " em relação a ");
    if (deltaPct > 0.5) return { direction: "up", pct: deltaPct, text: `${text}.` };
    if (deltaPct < -0.5) return { direction: "down", pct: deltaPct, text: `${text}.` };
    return { direction: "neutral", pct: deltaPct, text: "Estabilidade financeira frente ao mês anterior." };
  }
  const first = comparisonRows[0] || null;
  const last = comparisonRows[comparisonRows.length - 1] || null;
  if (!first || !last || first.key === last.key || !first.totalValue) {
    return { direction: "neutral", pct: 0, text: "Histórico anual insuficiente para tendência robusta." };
  }
  const deltaPct = ((last.totalValue - first.totalValue) / first.totalValue) * 100;
  if (deltaPct > 0.5) return { direction: "up", pct: deltaPct, text: `O ano mostra aumento de ${formatSignedPct(deltaPct)} do primeiro para o último mês carregado.` };
  if (deltaPct < -0.5) return { direction: "down", pct: deltaPct, text: `O ano mostra redução de ${formatNumberPt(Math.abs(deltaPct), 1)}% do primeiro para o último mês carregado.` };
  return { direction: "neutral", pct: deltaPct, text: "O ano permanece praticamente estável entre início e fim do período carregado." };
}

function getReportTrendReferenceLabel(scope, previousMonth) {
  const monthLabel = shortMonthYear(previousMonth.label);
  if (scope.periodMode === "month") return monthLabel;
  const previousPeriodMode = previousMonth.periodMode || scope.periodMode;
  const periodLabel = getPeriodModeLabel(previousPeriodMode).toLowerCase();
  return `${periodLabel} de ${monthLabel}`;
}

function buildIntelligentSummary({ scope, summary, criticalMonth, volumeMonth, dominantCategory, topBase, topDriver, topBaseShare, topDriverShare, trend, ticketAverage, pnrShare, packageShare }) {
  const period = scope.mode === "annual" ? `No consolidado anual de ${scope.year}` : `Em ${scope.label}`;
  const impactSentence =
    scope.mode === "annual"
      ? `${shortMonthYear(criticalMonth.label)} teve o maior impacto financeiro, com ${currency.format(criticalMonth.totalValue)} em descontos.`
      : `o recorte registra ${currency.format(summary.totalValue)} em descontos e ticket médio de ${currency.format(ticketAverage)} por registro válido.`;
  return [
    `${period}, ${impactSentence}`,
    `A categoria ${reportCategoryLabel(dominantCategory.label)} concentra ${currency.format(dominantCategory.total)} e lidera a pressão operacional.`,
    `A base ${topBase.label} responde por ${topBaseShare}% do impacto financeiro, enquanto o driver ${topDriver.label} concentra ${topDriverShare}%.`,
    `O volume de PNR representa ${pnrShare}% dos registros e pacotes perdidos representam ${packageShare}%.`,
    `A tendência indica: ${trend.text}`,
  ].join("\n");
}

function buildReportDiagnostics({ scope, summary, criticalMonth, volumeMonth, dominantCategory, topBase, topDriver, ticketAverage, trend }) {
  return [
    {
      title: scope.mode === "annual" ? "Mês mais crítico" : "Impacto do recorte",
      text:
        scope.mode === "annual"
          ? `${shortMonthYear(criticalMonth.label)} concentrou ${currency.format(criticalMonth.totalValue)} em descontos.`
          : `${scope.label} concentrou ${currency.format(summary.totalValue)} em descontos, com ticket médio de ${currency.format(ticketAverage)}.`,
    },
    {
      title: "Volume operacional",
      text: `${shortMonthYear(volumeMonth.label)} teve ${integer.format(volumeMonth.count)} registros; a categoria ${reportCategoryLabel(dominantCategory.label)} foi a mais relevante.`,
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

function buildReportConclusionText({ scope, summary, topBase, topDriver, dominantCategory, criticalMonth, trend, recommendations }) {
  const periodText = scope.mode === "annual" ? `O período anual ${scope.year}` : `O recorte ${scope.label}`;
  const periodImpact = `O impacto financeiro do período foi ${currency.format(summary.totalValue)}.`;
  const criticalText = `O mês de maior impacto financeiro foi ${shortMonthYear(criticalMonth.label)}, com ${currency.format(criticalMonth.totalValue)}.`;
  return `${periodText} mostra que o principal problema está em ${reportCategoryLabel(dominantCategory.label)}, com maior impacto financeiro na base ${topBase.label} e prioridade de acompanhamento para o driver ${topDriver.label}. ${periodImpact} ${criticalText} A tendência indica: ${trend.text} A primeira ação recomendada é: ${recommendations[0]}`;
}

function buildReportConclusionItems({ scope, summary, topBase, topDriver, dominantCategory, criticalMonth, trend, recommendations }) {
  return [
    { label: "Principal problema", text: reportCategoryLabel(dominantCategory.label) },
    { label: "Impacto financeiro do período", text: `${scope.label} com ${currency.format(summary.totalValue)}` },
    { label: "Mês de maior impacto financeiro", text: `${shortMonthYear(criticalMonth.label)} com ${currency.format(criticalMonth.totalValue)}` },
    { label: "Prioridade operacional", text: `Base ${topBase.label}; driver ${topDriver.label}.` },
    { label: "Tendência", text: trend.text },
    { label: "Primeira ação recomendada", text: recommendations[0] },
  ];
}

function reportTopBy(rows, key, metric, limit) {
  const map = new Map();
  for (const row of rows) {
    const label = key === "motorista" || key === "driver"
      ? formatDriverName(row[key])
      : reportLabel(key === "base" ? getBaseIdentity(row) : row[key]);
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

function formatRankingName(value) {
  return String(value || "Não identificado")
    .replace(/\s+-\s+/g, " -\u00A0")
    .trim();
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
  return `${number > 0 ? "+" : ""}${formatNumberPt(number, 1)}%`;
}

function formatEvolutionTrend(value) {
  const number = Number(value || 0);
  if (number > 0) return { arrow: "↑", label: formatSignedPct(number), tone: "is-bad", status: "mais ofensiva" };
  if (number < 0) return { arrow: "↓", label: formatSignedPct(number), tone: "is-good", status: "menos ofensiva" };
  return { arrow: "→", label: formatSignedPct(0), tone: "is-flat", status: "estável" };
}

function formatEvolutionTrendText(trend) {
  return `${trend.arrow} ${trend.label} ${trend.status}`;
}

function formatNumberPt(value, digits = 1) {
  return Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function estimatePdfTextWidth(text, size) {
  return Array.from(String(text ?? "")).reduce((total, char) => {
    if (char === " ") return total + size * 0.26;
    if (/[,.;:]/.test(char)) return total + size * 0.25;
    if (/[0-9]/.test(char)) return total + size * 0.56;
    if (/[A-ZÁÉÍÓÚÃÕÂÊÔÇ]/.test(char)) return total + size * 0.62;
    if (/[mwMW]/.test(char)) return total + size * 0.74;
    if (/[ilI]/.test(char)) return total + size * 0.30;
    return total + size * 0.50;
  }, 0);
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

function clipPdfText(text, width, size = 8) {
  const value = String(text ?? "").replace(/\s+/g, " ").trim();
  const maxChars = Math.max(8, Math.floor(width / (size * 0.52)));
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(1, maxChars - 3)).trimEnd()}...`;
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

function pdfBase64ToHex(value) {
  const binary = atob(String(value || ""));
  let hex = "";
  for (let i = 0; i < binary.length; i += 1) {
    hex += binary.charCodeAt(i).toString(16).padStart(2, "0").toUpperCase();
  }
  return hex;
}

function createPdfBlob(pageCommands) {
  const objects = [];
  const addObject = (content) => {
    objects.push(content);
    return objects.length;
  };
  const fontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const fontBoldId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const logoHex = PDF_LOGO_IMAGE.base64 ? pdfBase64ToHex(PDF_LOGO_IMAGE.base64) : "";
  const logoImageId = logoHex
    ? addObject(`<< /Type /XObject /Subtype /Image /Width ${PDF_LOGO_IMAGE.width} /Height ${PDF_LOGO_IMAGE.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [/ASCIIHexDecode /DCTDecode] /Length ${logoHex.length + 1} >>\nstream\n${logoHex}>\nendstream`)
    : 0;
  const pageIds = pageCommands.map((content) => {
    const streamId = addObject(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    const xObjects = logoImageId ? `/XObject << /${PDF_LOGO_IMAGE.name} ${logoImageId} 0 R >>` : "";
    return addObject(`<< /Type /Page /Parent 0 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R /F2 ${fontBoldId} 0 R >> ${xObjects} >> /Contents ${streamId} 0 R >>`);
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

function getTotalDiscountComparisonInitialText() {
  if ((state.monthFilter || "all") === "all") {
    return "Consolidado dos meses carregados";
  }
  return "Atualizando comparativo...";
}

async function hydrateTotalDiscountComparison(summary) {
  const target = el.kpiGrid?.querySelector("[data-total-discounts-delta]");
  if (!target) return;
  const requestId = (totalDiscountComparisonRequest += 1);
  const scope = getReportScope();

  if (scope.mode === "annual") {
    target.textContent = "Consolidado dos meses carregados";
    return;
  }

  try {
    const rows = await buildReportHistoricalComparisonRows(scope);
    if (requestId !== totalDiscountComparisonRequest) return;
    const activeMonth = rows.find((row) => row.key === scope.key) || null;
    const activeIndex = activeMonth ? rows.findIndex((row) => row.key === activeMonth.key) : -1;
    const previousMonth = activeIndex > 0 ? rows[activeIndex - 1] : null;
    target.textContent = formatTotalDiscountComparison({
      selectedMonth: scope.key,
      selectedPeriod: scope.periodMode,
      currentValue: summary.totalValue,
      previousValue: previousMonth?.totalValue,
      previousLabel: previousMonth ? getReportTrendReferenceLabel(scope, previousMonth) : "",
      isAllMonths: false,
    });
  } catch (error) {
    console.error("[KPI] Erro ao calcular comparativo histórico:", error);
    if (requestId === totalDiscountComparisonRequest) {
      target.textContent = "Comparativo indisponível";
    }
  }
}

function formatTotalDiscountComparison({ currentValue, previousValue, previousLabel, isAllMonths }) {
  if (isAllMonths) return "Consolidado dos meses carregados";
  const variation = calculateVariation(currentValue, previousValue);
  if (variation == null) return "Sem mês anterior carregado";
  const absVariation = formatNumberPt(Math.abs(variation), 1);
  if (variation < -0.05) return `Redução de ${absVariation}% vs. ${previousLabel}`;
  if (variation > 0.05) return `Aumento de ${absVariation}% vs. ${previousLabel}`;
  return `Estável vs. ${previousLabel}`;
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

  restorePrefaturaTableHeader();
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
      const linkedIds = getLinkedPackageIds(row);
      const linkedIdsCount = linkedIds.length || Number(row.linked_ids_count || row.quantidade_ids || 0);
      const linkedIdsLabel = linkedIdsCount > 1 ? `${linkedIds[0]} +${linkedIdsCount - 1}` : row.id_pacote || "—";
      const linkedIdsTitle = linkedIds.length ? linkedIds.join(", ") : row.id_pacote || "";
      const linkedValues = getLinkedValues(row);
      const linkedValuesLabel = linkedValues.length > 1 ? linkedValues.map((value) => currency.format(value)).join(" + ") : "";
      const occurrenceCount = getOccurrenceCount(row);
      const occurrenceLabel = `${integer.format(occurrenceCount)} ocorrência${occurrenceCount === 1 ? "" : "s"} financeira${occurrenceCount === 1 ? "" : "s"}`;
      const occurrenceDetail = linkedIdsCount > 1 ? `${occurrenceLabel} · ${integer.format(linkedIdsCount)} IDs vinculados · ${currency.format(row.valor_numerico || 0)}` : "";
      return `
        <tr style="--reveal-index:${index}">
          <td>
            <strong>${escapeHtml(row.base)}</strong>
            <span class="cell-subtle">${escapeHtml(row.cidade_base || row.sigla_base || "Base")}</span>
          </td>
          <td>
            <strong>${escapeHtml(formatDriverName(row.motorista, "Sem driver"))}</strong>
            <span class="cell-subtle">${escapeHtml(row.n_rota ? `Rota ${row.n_rota}` : "Sem rota")}</span>
          </td>
          <td>${escapeHtml(row.placa || "Sem placa")}</td>
          <td><span class="badge ${badgeClass}">${escapeHtml(row.tipo_desconto || row.tipo_registro)}</span></td>
          <td><span class="badge badge--sheet">${escapeHtml(getSheetDisplayLabel(row.aba_origem))}</span></td>
          <td>${formatDate(row.data_normalizada)}</td>
          <td title="${escapeAttribute(linkedIdsTitle)}">
            ${escapeHtml(linkedIdsLabel)}
            ${linkedIdsCount > 1 ? `<span class="cell-subtle">${integer.format(linkedIdsCount)} IDs vinculados</span>` : ""}
          </td>
          <td>${escapeHtml(row.n_rota || "—")}</td>
          <td class="is-right">
            <strong>${currency.format(row.valor_numerico || 0)}</strong>
            ${linkedValuesLabel ? `<span class="cell-subtle">${escapeHtml(linkedValuesLabel)}</span>` : ""}
            ${occurrenceDetail ? `<span class="cell-subtle">${escapeHtml(occurrenceDetail)}</span>` : ""}
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderPackageManagementTableHeader() {
  setPackageExportButtonVisible(true);
  if (el.tableTitle) el.tableTitle.textContent = "Conferência da Gestão de Pacotes";
  if (el.tableDescription) el.tableDescription.innerHTML = `<span id="result-count">0</span> registros processados no recorte`;
  el.resultCount = document.getElementById("result-count") || el.resultCount;
  if (el.tableHead) {
    el.tableHead.innerHTML = `
      <tr>
        <th data-sort="competencia">Competência</th>
        <th data-sort="period_type">Quinzena</th>
        <th data-sort="tipo_operacional">Tipo</th>
        <th data-sort="categoria_label">Desconto</th>
        <th data-sort="base">Base</th>
        <th data-sort="valor_numerico" class="is-right">Valor</th>
        <th data-sort="data_sort">Data</th>
        <th data-sort="id_pacote">ID de Envio</th>
        <th data-sort="decisao_adm">Decisão ADM</th>
      </tr>
    `;
  }
}

function getPackageTypeBadgeClass(type) {
  if (type === "PNR") return "badge--pnr";
  if (type === "XPT") return "badge--xpt";
  if (type === "SVC") return "badge--svc";
  return "badge--sheet";
}

function getPackageManagementExportRows() {
  return sortRows(getPackageManagementRowsForView()).filter(isPackageManagementDetailRow);
}

function getPackageDecisionExportText(row) {
  const display = getPackageDecisionDisplay(row);
  const parts = [display.primary, display.note].filter((part) => part && part !== "—");
  return parts.join(" — ");
}

function formatPackageExportDate(value) {
  const formatted = formatDate(value);
  return formatted === "—" ? "" : formatted;
}

function sanitizeExcelFileName(value) {
  return String(value || "Arquivo")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getYearLabelForPackageExport(selectedMonths, rows) {
  const years = new Set();
  (Array.isArray(selectedMonths) ? selectedMonths : []).forEach((key) => {
    const year = String(key || "").slice(0, 4);
    if (/^\d{4}$/.test(year)) years.add(year);
  });
  if (!years.size) {
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const key = getPackageManagementMonthKey(row);
      const year = String(key || "").slice(0, 4);
      if (/^\d{4}$/.test(year)) years.add(year);
    });
  }
  const sorted = Array.from(years).sort();
  return sorted.length ? sorted.join("-") : String(new Date().getFullYear());
}

function getPackageExportScopeLabel(rows) {
  const options = getAvailablePackageMonthOptions();
  const selectedMonths = getPackageMonthSelectionValues();
  const allMonthsSelected = !options.length || selectedMonths.length === options.length;
  const yearLabel = getYearLabelForPackageExport(selectedMonths, rows);

  if (allMonthsSelected) return `Anual ${yearLabel}`;
  if (selectedMonths.length === 1) {
    const [year, month] = String(selectedMonths[0] || "").split("-");
    const monthIndex = Number(month) - 1;
    const monthName = MONTHS[monthIndex] ? capitalize(MONTHS[monthIndex]) : "Recorte Mês";
    return `${monthName} ${year || yearLabel}`;
  }
  return `${selectedMonths.length} Meses ${yearLabel}`;
}

function getPackageExportPeriodDisplay(rows) {
  const scopeLabel = getPackageExportScopeLabel(rows);
  const periodLabel = getPeriodModeLabel(state.packagePeriod || "month");
  return `${scopeLabel.replace(/^Anual\s+/, "Ano ")} · ${periodLabel}`;
}

function buildPackageManagementExcelFileName(rows) {
  const scopeLabel = getPackageExportScopeLabel(rows);
  const periodLabel = formatReportFilePeriodLabel(state.packagePeriod || "month");
  const selectedTypes = getPackageTypeSelectionValues(state.packageTipo);
  const typeLabel = selectedTypes.length === MAIN_TYPE_OPTIONS.length ? "Todos" : selectedTypes.join(" ");
  return `${sanitizeExcelFileName(`Conferência Gestão de Pacotes ${scopeLabel} ${periodLabel} ${typeLabel}`)}.xlsx`;
}

function buildPackageManagementExportSheetRows(rows) {
  return rows.map((row) => {
    const type = row.tipo_operacional || getPackageOperationalType(row) || "";
    const category = PACKAGE_CATEGORY_LABELS[row.categoria_final] || row.categoria_label || row.tipo_desconto || "";
    const idEnvio = formatId(row.id_pacote || row.id_caso || row.id_envio || "");
    const numericIdEnvio = idEnvio && /^\d+$/.test(idEnvio) ? Number(idEnvio) : idEnvio;
    return {
      "Competência": row.competencia || "—",
      "Quinzena": row.quinzena || "—",
      "Tipo": type || "—",
      "Desconto": category || "—",
      "Base": row.base || row.base_normalizada || "—",
      "Valor": normalizarValorGestao(row.valor_numerico),
      "Data": formatPackageExportDate(row.data_normalizada || row.data_sort || row.data) || "—",
      "ID de Envio": numericIdEnvio,
      "Decisão ADM": getPackageDecisionExportText(row) || "—",
    };
  });
}

async function loadExcelExportEngine() {
  if (window.ExcelJS && typeof window.ExcelJS.Workbook === "function") return window.ExcelJS;

  if (!excelExportEnginePromise) {
    excelExportEnginePromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = new URL("./assets/vendor/exceljs.min.js", document.baseURI).href;
      script.async = true;
      script.onload = () => {
        if (window.ExcelJS && typeof window.ExcelJS.Workbook === "function") resolve(window.ExcelJS);
        else reject(new Error("ExcelJS carregou, mas a API Workbook não ficou disponível."));
      };
      script.onerror = () => reject(new Error("Failed to load exceljs.min.js"));
      document.head.appendChild(script);
    });
  }

  try {
    return await excelExportEnginePromise;
  } finally {
    excelExportEnginePromise = null;
  }
}

function getPackageExportTypeLabel() {
  const selectedTypes = getPackageTypeSelectionValues(state.packageTipo);
  return selectedTypes.length === MAIN_TYPE_OPTIONS.length ? "Todos" : selectedTypes.join(" + ");
}

function getPackageExportSummary(rows, exportRows) {
  const competencies = new Set(rows.map((row) => row.competencia).filter(Boolean));
  const presentTypes = Array.from(new Set(exportRows.map((row) => row.Tipo).filter((type) => type && type !== "—"))).sort();
  return {
    totalRows: exportRows.length,
    competenciesCount: competencies.size,
    presentTypes: presentTypes.length ? presentTypes.join(", ") : "—",
    periodLabel: getPeriodModeLabel(state.packagePeriod || "month"),
    typeLabel: getPackageExportTypeLabel(),
  };
}

function applyExcelCellStyle(cell, style) {
  Object.assign(cell, style);
}

function styleExcelRange(worksheet, range, style) {
  const [start, end] = range.split(":");
  const startCell = worksheet.getCell(start);
  const endCell = worksheet.getCell(end);
  for (let row = startCell.row; row <= endCell.row; row += 1) {
    for (let col = startCell.col; col <= endCell.col; col += 1) {
      applyExcelCellStyle(worksheet.getCell(row, col), style);
    }
  }
}

function pnrIsoToExcelDate(value) {
  if (!value) return null;
  const parsed = parseDateValue(value);
  if (!parsed.iso) return null;
  return new Date(`${parsed.iso}T00:00:00Z`);
}

function buildPnrBillingPeriodCode(row) {
  const existing = String(row.periodoFaturamento || "").trim();
  if (/^\d{6}Q[12]$/i.test(existing)) return existing.toUpperCase();
  const period =
    getPnrPeriodFromBillingPeriod(existing) ||
    getPnrPeriodFromDate(row.dataCaso || row.periodoFaturamento || `${row.competencia || ""} ${row.quinzena || ""}`);
  return buildPnrBillingPeriodFromPeriod({
    ...period,
    quinzena: row.quinzena || period.quinzena,
  });
}

function getPnrMonthFormula(rowNumber) {
  return `CHOOSE(VALUE(MID(D${rowNumber},5,2)),"Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro")`;
}

function getPnrQuinzenaFormula(rowNumber) {
  return `IF(RIGHT(D${rowNumber},1)="1","01 a 15","16 a 31")&" "&CHOOSE(VALUE(MID(D${rowNumber},5,2)),"Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro")`;
}

function getPnrValueFormula(rowNumber) {
  return `VALUE(SUBSTITUTE(SUBSTITUTE(M${rowNumber},"R$ ",""),".",","))`;
}

function getPnrMonthNameFromPeriod(row) {
  const code = buildPnrBillingPeriodCode(row);
  const monthIndex = Number(code.slice(4, 6)) - 1;
  return MONTHS[monthIndex] ? capitalize(MONTHS[monthIndex]) : "";
}

function getPnrQuinzenaLabelFromPeriod(row) {
  const code = buildPnrBillingPeriodCode(row);
  const month = getPnrMonthNameFromPeriod(row);
  return `${code.endsWith("Q2") ? "16 a 31" : "01 a 15"} ${month}`.trim();
}

function getPnrValorCompraText(row) {
  const original = repairPnrText(row.valorCompraOriginal || row.valor_compra_original || row.valorCompra || row["VALOR DA COMPRA"] || "").trim();
  if (original) return original;
  return `R$ ${Number(row.valorCompraNumerico || 0).toFixed(2)}`;
}

function buildStandardizedPnrSheetRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map(normalizePnrStoredRow)
    .filter(Boolean)
    .map((row, index) => {
      const rowNumber = index + 2;
      return [
        row.idCaso || "",
        pnrIsoToExcelDate(row.dataCaso),
        row.statusOriginal || row.statusNormalizado || "",
        buildPnrBillingPeriodCode(row),
        pnrIsoToExcelDate(row.dataPedidoRevisao),
        row.pedidoRevisao || "",
        pnrIsoToExcelDate(row.dataEncerramentoCaso),
        row.repAssistente || "",
        row.comentarioEncerramento || "",
        row.numeroPreFatura || "",
        row.idEnvio || "",
        row.produtos || "",
        getPnrValorCompraText(row),
        row.repTransportadora || "",
        row.estacaoOrigem || "",
        row.idRota || "",
        row.idMotorista || "",
        pnrIsoToExcelDate(row.dataEntrega),
        row.idReclamacao || "",
        { formula: getPnrMonthFormula(rowNumber), result: getPnrMonthNameFromPeriod(row) },
        { formula: getPnrQuinzenaFormula(rowNumber), result: getPnrQuinzenaLabelFromPeriod(row) },
        { formula: getPnrValueFormula(rowNumber), result: Number(row.valorCompraNumerico || 0) },
      ];
    });
}

function styleStandardizedPnrWorksheet(worksheet, rowCount) {
  const headerFill = "0B5D42";
  const headerBorder = "0A4E39";
  worksheet.views = [{ state: "frozen", ySplit: 1, topLeftCell: "A2", activeCell: "A2" }];
  worksheet.getRow(1).height = 22.5;
  worksheet.getRow(1).eachCell((cell) => {
    cell.font = { name: "Calibri", size: 9, bold: true, color: { argb: "FFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: headerFill } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = {
      top: { style: "thin", color: { argb: headerBorder } },
      left: { style: "thin", color: { argb: headerBorder } },
      bottom: { style: "thin", color: { argb: headerBorder } },
      right: { style: "thin", color: { argb: headerBorder } },
    };
  });
  for (let rowNumber = 2; rowNumber <= rowCount + 1; rowNumber += 1) {
    worksheet.getRow(rowNumber).height = 18;
  }
  [2, 5, 7, 18].forEach((colNumber) => {
    worksheet.getColumn(colNumber).numFmt = "dd/mm/yyyy hh:mm";
  });
  [1, 10, 11, 16, 17, 19].forEach((colNumber) => {
    worksheet.getColumn(colNumber).numFmt = "@";
  });
  worksheet.getColumn(22).numFmt = '[$R$ -416]#,##0.00';
}

async function buildStandardizedPnrWorkbookBlob(rows, originalName = "PNRs.xlsx") {
  const ExcelJS = await loadExcelExportEngine();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Painel de Inteligência";
  workbook.created = new Date();
  workbook.modified = new Date();
  const worksheet = workbook.addWorksheet("PNRs", {
    properties: { defaultRowHeight: 18 },
    views: [{ state: "frozen", ySplit: 1, topLeftCell: "A2" }],
  });
  worksheet.columns = [
    { width: 12.88 }, { width: 15 }, { width: 18.63 }, { width: 23.25 }, { width: 24 }, { width: 18.13 },
    { width: 27.75 }, { width: 16.38 }, { width: 27.13 }, { width: 20 }, { width: 13.25 }, { width: 37.63 },
    { width: 17.88 }, { width: 20.25 }, { width: 18.75 }, { width: 12.75 }, { width: 17 }, { width: 17 },
    { width: 18.13 }, { width: 16 }, { width: 20 }, { width: 19 },
  ];
  const tableRows = buildStandardizedPnrSheetRows(rows);
  const safeTableName = "Historico_de_PNRs";
  worksheet.addTable({
    name: safeTableName,
    displayName: safeTableName,
    ref: "A1",
    headerRow: true,
    totalsRow: false,
    style: {
      theme: "TableStyleMedium4",
      showFirstColumn: false,
      showLastColumn: false,
      showRowStripes: true,
      showColumnStripes: false,
    },
    columns: PNR_STANDARD_HEADERS.map((name) => ({ name, filterButton: true })),
    rows: tableRows,
  });
  worksheet.autoFilter = {
    from: "A1",
    to: `V${Math.max(1, tableRows.length + 1)}`,
  };
  styleStandardizedPnrWorksheet(worksheet, tableRows.length);
  workbook.subject = "Histórico de PNRs";
  workbook.title = originalName;
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

async function buildStandardizedPnrUploadFile(originalFile, rows) {
  const blob = await buildStandardizedPnrWorkbookBlob(rows, originalFile?.name || "Histórico de PNRs.xlsx");
  const baseName = String(originalFile?.name || "Historico de PNRs.xlsx").replace(/\.[^.]+$/, "");
  const fileName = `${baseName}.xlsx`;
  return new File([blob], fileName, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

async function addPackageExportLogo(worksheet, workbook) {
  console.log("[Excel] Inserindo logo");
  try {
    await ensurePdfLogoImage();
    if (!PDF_LOGO_IMAGE.base64) {
      console.warn("[Excel] Logo não carregada para o Excel.");
      return;
    }
    const extension = /\.png(?:$|\?)/i.test(PDF_LOGO_IMAGE.src) ? "png" : "jpeg";
    const logoImageId = workbook.addImage({
      base64: `data:image/${extension};base64,${PDF_LOGO_IMAGE.base64}`,
      extension,
    });
    worksheet.addImage(logoImageId, {
      tl: { col: 0.34, row: 0.48 },
      ext: { width: 95.44, height: 95.44 },
    });
  } catch (logoError) {
    console.warn("[Excel] Não foi possível inserir a logo. Exportação continuará sem logo.", logoError);
  }
}

function configurePackageExportHeader(worksheet, rows, exportRows) {
  const darkBlue = "0B1F33";
  const aqua = "19D3C5";
  const white = "FFFFFF";
  const mutedBlue = "E8F1F8";
  const textDark = "1F2A37";
  const borderColor = "D8E3ED";
  const summary = getPackageExportSummary(rows, exportRows);

  styleExcelRange(worksheet, "A1:I5", {
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: darkBlue } },
    font: { name: "Arial", color: { argb: white } },
    alignment: { vertical: "middle" },
  });
  worksheet.getRow(1).height = 21;
  worksheet.getRow(2).height = 21;
  worksheet.getRow(3).height = 15.6;
  worksheet.getRow(4).height = 14.4;
  worksheet.getRow(5).height = 14.4;

  worksheet.mergeCells("A1:A5");
  worksheet.mergeCells("B2:C2");
  worksheet.mergeCells("B3:C3");
  worksheet.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };

  worksheet.getCell("B2").value = "Painel de Inteligência Operacional";
  worksheet.getCell("B2").font = { name: "Arial", size: 16, bold: true, color: { argb: white } };
  worksheet.getCell("B2").alignment = { horizontal: "left", vertical: "middle" };
  worksheet.getCell("B3").value = "Gestão de Pacotes — Conferência de Registros";
  worksheet.getCell("B3").font = { name: "Arial", size: 12, bold: true, color: { argb: white } };
  worksheet.getCell("B3").alignment = { horizontal: "left", vertical: "middle" };

  worksheet.getCell("I1").value = "Setor: LOSS";
  worksheet.getCell("I2").value = `Período: ${getPackageExportPeriodDisplay(rows)}`;
  worksheet.getCell("I3").value = `Tipo: ${summary.typeLabel}`;
  worksheet.getCell("I4").value = `Gerado em: ${formatCurrentDateTime()}`;
  ["I1", "I2", "I3", "I4"].forEach((address) => {
    worksheet.getCell(address).font = { name: "Arial", size: 10, bold: address === "I1", color: { argb: white } };
    worksheet.getCell(address).alignment = { horizontal: "left", vertical: "middle" };
  });

  const summaryHeaders = ["Resumo do recorte", "Registros exportados", "Competências no recorte", "Tipos presentes", "Filtro de período", "Filtro de tipo"];
  const summaryValues = ["", summary.totalRows, summary.competenciesCount, summary.presentTypes, summary.periodLabel, summary.typeLabel];
  worksheet.getRow(6).values = summaryHeaders;
  worksheet.getRow(7).values = summaryValues;
  worksheet.getRow(6).height = 15.6;
  worksheet.getRow(7).height = 14.4;
  styleExcelRange(worksheet, "A6:I6", {
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: aqua } },
    font: { name: "Arial", size: 12, italic: true, color: { argb: white } },
    alignment: { horizontal: "center", vertical: "middle" },
    border: {
      top: { style: "thin", color: { argb: borderColor } },
      left: { style: "thin", color: { argb: borderColor } },
      bottom: { style: "thin", color: { argb: borderColor } },
      right: { style: "thin", color: { argb: borderColor } },
    },
  });
  styleExcelRange(worksheet, "A7:I7", {
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: mutedBlue } },
    font: { name: "Arial", size: 11, bold: true, color: { argb: textDark } },
    alignment: { vertical: "middle" },
    border: {
      top: { style: "thin", color: { argb: borderColor } },
      left: { style: "thin", color: { argb: borderColor } },
      bottom: { style: "thin", color: { argb: borderColor } },
      right: { style: "thin", color: { argb: borderColor } },
    },
  });
}

function getDiscountFillColor(discount) {
  const normalized = normalizeText(discount);
  if (normalized === "ALC") return "EEF2F6";
  if (normalized === "DRIVER") return "EAF4FF";
  if (normalized === "DISPATCHER") return "FFF1E2";
  if (normalized === "MERCADO LIVRE") return "EAF8EF";
  return "FFFFFF";
}

function addPackageExportTable(worksheet, exportRows) {
  const headerRowNumber = 8;
  const headers = ["Competência", "Quinzena", "Tipo", "Desconto", "Base", "Valor", "Data", "ID de Envio", "Decisão ADM"];
  worksheet.addTable({
    name: "Tabela1",
    displayName: "Tabela1",
    ref: `A${headerRowNumber}`,
    headerRow: true,
    totalsRow: false,
    style: {
      theme: "TableStyleMedium2",
      showFirstColumn: true,
      showLastColumn: true,
      showRowStripes: false,
      showColumnStripes: false,
    },
    columns: headers.map((name) => ({ name, filterButton: true })),
    rows: exportRows.map((item) => headers.map((header) => item[header])),
  });

  worksheet.getRow(headerRowNumber).height = 14.4;
  worksheet.getRow(headerRowNumber).eachCell((cell) => {
    cell.font = { name: "Arial", size: 10, bold: true, italic: true, color: { argb: "102A43" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "DCEAF5" } };
    cell.alignment = { vertical: "middle", horizontal: "left" };
    cell.border = {
      top: { style: "thin", color: { argb: "B9CAD8" } },
      left: { style: "thin", color: { argb: "B9CAD8" } },
      bottom: { style: "thin", color: { argb: "B9CAD8" } },
      right: { style: "thin", color: { argb: "B9CAD8" } },
    };
  });

  exportRows.forEach((item, index) => {
    const rowNumber = headerRowNumber + 1 + index;
    const row = worksheet.getRow(rowNumber);
    row.values = headers.map((header) => item[header]);
    row.height = 22.05;
    row.eachCell((cell, colNumber) => {
      cell.font = {
        name: "Arial",
        size: 10,
        bold: colNumber === 4 || colNumber === 6,
        color: { argb: colNumber === 6 ? "FF0000" : "1F2A37" },
      };
      cell.alignment = { vertical: "middle", horizontal: colNumber === 6 ? "right" : "left", wrapText: colNumber === 9 };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: colNumber === 4 ? getDiscountFillColor(item.Desconto) : index % 2 === 0 ? "FFFFFF" : "F7FAFC" },
      };
      cell.border = {
        top: { style: "thin", color: { argb: "E0E7EF" } },
        left: { style: "thin", color: { argb: "E0E7EF" } },
        bottom: { style: "thin", color: { argb: "E0E7EF" } },
        right: { style: "thin", color: { argb: "E0E7EF" } },
      };
      if (colNumber === 6) cell.numFmt = '_-"R$" * #,##0.00_-;-"R$" * #,##0.00_-;_-"R$" * "-"??_-;_-@_-';
    });
    const numericId = Number(item["ID de Envio"]);
    row.getCell(8).value = Number.isFinite(numericId) ? numericId : item["ID de Envio"] || "";
    row.getCell(8).numFmt = "0";
  });

  worksheet.views = [{ state: "frozen", ySplit: headerRowNumber, topLeftCell: "A9", zoomScale: 85, zoomScaleNormal: 85, activeCell: "C10" }];
}

async function protectPackageExportHeader(worksheet, exportRows) {
  const lastDataRow = 8 + Math.max(0, exportRows.length);
  for (let rowNumber = 9; rowNumber <= lastDataRow; rowNumber += 1) {
    worksheet.getRow(rowNumber).eachCell((cell) => {
      cell.protection = { locked: false };
    });
  }
  styleExcelRange(worksheet, "A1:I8", {
    protection: { locked: true },
  });
  await worksheet.protect("alc-dashboard", {
    selectLockedCells: true,
    selectUnlockedCells: true,
    sort: true,
    autoFilter: true,
    objects: false,
    scenarios: false,
  });
}

async function buildStyledPackageManagementWorkbook(rows, exportRows) {
  console.log("[Excel] ExcelJS disponível:", typeof window.ExcelJS !== "undefined");
  const ExcelJS = await loadExcelExportEngine();
  console.log("[Excel] Criando workbook");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Painel de Inteligência";
  workbook.created = new Date();
  workbook.modified = new Date();
  const worksheet = workbook.addWorksheet("Gestão de Pacotes", {
    properties: { defaultRowHeight: 20 },
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  worksheet.columns = [
    { key: "competencia", width: 21.21875 },
    { key: "quinzena", width: 23.33203125 },
    { key: "tipo", width: 27.44140625 },
    { key: "desconto", width: 18 },
    { key: "base", width: 38.88671875 },
    { key: "valor", width: 14.21875 },
    { key: "data", width: 10.88671875 },
    { key: "id", width: 15 },
    { key: "decisao", width: 37.33203125 },
  ];

  console.log("[Excel] Aplicando cabeçalho");
  configurePackageExportHeader(worksheet, rows, exportRows);
  await addPackageExportLogo(worksheet, workbook);
  console.log("[Excel] Aplicando tabela");
  addPackageExportTable(worksheet, exportRows);
  console.log("[Excel] Protegendo cabeçalho");
  await protectPackageExportHeader(worksheet, exportRows);
  console.log("[Excel] Gerando buffer");
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

async function exportPackageManagementExcel(button) {
  if (isExportingPackageExcel) return;
  const rows = getPackageManagementExportRows();
  if (!rows.length) {
    showToast("Nenhum registro para exportar.", "warn", 4200);
    syncPackageExportButtonState(0);
    return;
  }

  isExportingPackageExcel = true;
  syncPackageExportButtonState(rows.length);
  if (button) button.classList.add("is-loading");

  try {
    console.log("[Excel] Iniciando exportação");
    const exportRows = buildPackageManagementExportSheetRows(rows);
    const fileName = buildPackageManagementExcelFileName(rows);
    console.log("[Excel] Registros:", exportRows.length);
    console.info("Exportando Gestão de Pacotes:", {
      totalRegistros: exportRows.length,
      nomeArquivo: fileName,
      biblioteca: window.ExcelJS?.Workbook ? "exceljs local" : "exceljs local pendente de carregamento",
      primeiraLinha: exportRows[0] || null,
    });
    const blob = await buildStyledPackageManagementWorkbook(rows, exportRows);
    console.log("[Excel] Baixando arquivo");
    downloadBlob(blob, fileName);
    showToast("Excel da Gestão de Pacotes baixado.", "good", 4200);
  } catch (error) {
    console.error("ERRO REAL AO GERAR EXCEL:", error);
    console.error("Stack:", error?.stack);
    console.error("Erro ao gerar Excel da Gestão de Pacotes:", {
      totalRegistrosFiltrados: rows.length,
      primeiraLinhaFiltrada: rows[0] || null,
      excelJsDisponivel: Boolean(window.ExcelJS),
      excelJsWorkbookDisponivel: Boolean(window.ExcelJS?.Workbook),
    });
    showToast("Não foi possível gerar o Excel. Verifique o console.", "error", 6200);
  } finally {
    isExportingPackageExcel = false;
    if (button) button.classList.remove("is-loading");
    syncPackageExportButtonState(rows.length);
  }
}

function renderPackageManagementTable(rows, allPackageRows) {
  renderPackageManagementTableHeader();
  const validAllRows = (Array.isArray(allPackageRows) ? allPackageRows : []).filter(isPackageManagementDetailRow);
  const validPageRows = (Array.isArray(rows) ? rows : []).filter(isPackageManagementDetailRow);
  const totalRows = validAllRows.length;
  const pageCount = Math.max(1, Math.ceil(totalRows / state.pageSize));
  state.page = Math.min(state.page, pageCount);
  const start = totalRows === 0 ? 0 : (state.page - 1) * state.pageSize + 1;
  const end = totalRows === 0 ? 0 : Math.min(start + validPageRows.length - 1, totalRows);

  el.resultCount.textContent = integer.format(totalRows);
  el.tableRange.textContent = `${integer.format(start)}-${integer.format(end)} de ${integer.format(totalRows)}`;
  el.pageIndicator.textContent = `Página ${integer.format(state.page)} de ${integer.format(pageCount)}`;
  el.prevPage.disabled = state.page <= 1;
  el.nextPage.disabled = state.page >= pageCount;
  syncPackageExportButtonState(totalRows);

  if (!validPageRows.length) {
    el.tableBody.innerHTML = `
      <tr>
        <td colspan="9">
          <div class="empty-state">
            <strong>Nenhum registro de Gestão de Pacotes</strong>
            <span>Ajuste mês, período ou tipo para conferir outro recorte.</span>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  el.tableBody.innerHTML = validPageRows
    .map((row, index) => {
      const type = row.tipo_operacional || "Indefinido";
      const category = PACKAGE_CATEGORY_LABELS[row.categoria_final] || row.categoria_label || "Indefinido";
      return `
        <tr style="--reveal-index:${index}">
          <td>${escapeHtml(row.competencia || "—")}</td>
          <td>${escapeHtml(row.quinzena || "—")}</td>
          <td><span class="badge ${getPackageTypeBadgeClass(type)}">${escapeHtml(type)}</span></td>
          <td><span class="badge badge--sheet">${escapeHtml(category)}</span></td>
          <td><strong>${escapeHtml(row.base || row.base_normalizada || "—")}</strong></td>
          <td class="is-right"><strong>${currency.format(row.valor_numerico || 0)}</strong></td>
          <td>${formatDate(row.data_normalizada || row.data_sort)}</td>
          <td>${escapeHtml(row.id_pacote || row.id_caso || "—")}</td>
          <td class="decision-cell">${renderPackageDecisionCell(row)}</td>
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

  if (state.sheet !== PRE_FATURA_VIEW) push("Aba", getSheetDisplayLabel(state.sheet));
  if (state.sheet !== MONTHLY_BASE_VIEW) push("Tipo", getActiveTypeFilter());
  const monthOptions = getActiveMonthOptions();
  const monthSelection = getActiveMonthSelectionValues();
  if (monthOptions.length && monthSelection.length !== monthOptions.length) push("Mês", getMonthSelectionLabel(monthSelection, monthOptions));
  const activePeriod = getActivePeriodMode();
  if (activePeriod !== "month") push("Período", getPeriodModeLabel(activePeriod));
  if (state.query && state.sheet !== MONTHLY_BASE_VIEW) applied.push({ label: "Busca", value: state.query });

  if (el.activeFiltersCount) {
    el.activeFiltersCount.textContent = `${applied.length} filtro${applied.length === 1 ? "" : "s"} ativo${applied.length === 1 ? "" : "s"}`;
  }
  if (el.filterSummary) {
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
}

function updateTopbar(summary = null) {
  if (el.sourceLine) {
    el.sourceLine.textContent = "";
    el.sourceLine.hidden = true;
  }
  if (el.syncStatus) {
    const label = window.supabaseClient ? "Supabase" : "Offline";
    const textNode = el.syncStatus.querySelector(".connection-indicator__label");
    if (textNode) textNode.textContent = label;
    el.syncStatus.setAttribute("title", `Status da conexão: ${label}`);
    el.syncStatus.setAttribute("aria-label", `Status da conexão: ${label}`);
  }
  updateLiveClock();
}

function getOccurrenceCount(row) {
  const count = Number(row?.ocorrencias || 1);
  return Number.isFinite(count) && count > 0 ? count : 1;
}

function buildSummary(rows) {
  let count = 0;
  let totalValue = 0;
  let packageCount = 0;
  let pnrCount = 0;
  const bases = new Set();
  const drivers = new Set();
  const routes = new Set();
  rows.forEach((row) => {
    const occurrences = getOccurrenceCount(row);
    count += occurrences;
    totalValue += Number(row.valor_numerico || 0);
    if (row.tipo_registro === "PACOTE PERDIDO") packageCount += occurrences;
    if (row.tipo_registro === "PNR") pnrCount += occurrences;
    const baseIdentity = getBaseIdentity(row);
    if (baseIdentity) bases.add(baseIdentity);
    const driverName = normalizeDriverName(row?.driver || row?.motorista || row?.nomeMotorista || row?.nome_driver || "");
    if (driverName && !isUnidentifiedDriverName(driverName)) drivers.add(driverName);
    if (row.n_rota) routes.add(row.n_rota);
  });
  const baseCount = bases.size;
  const driverCount = drivers.size;
  const routeCount = routes.size;
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
  return buildMonthlyComparisonFromDatasets(library.datasets, { types: state.prefaturaTipo, viewMode: comparisonPeriodView });
}

function buildMonthlyComparisonFromDatasets(datasets, options = {}) {
  const sheet = options.sheet || state.sheet;
  const viewMode = options.viewMode === "biweekly" ? "biweekly" : "monthly";
  const map = new Map();
  for (const dataset of Array.isArray(datasets) ? datasets : []) {
    if (!dataset || dataset.source === "filtered" || dataset.id === EMPTY_DATASET_ID || !Array.isArray(dataset.rows) || !dataset.rows.length) continue;
    const scopedRows = options.types ? filterPrefaturaRowsByTypes(dataset.rows, options.types) : getMonthlyComparisonRows(dataset.rows, sheet);
    if (!scopedRows.length) continue;
    if ((dataset.fileCategory || inferRowsFileCategory(dataset.rows)) === PACKAGE_MANAGEMENT_FILE_CATEGORY) continue;
    const period = getDatasetPeriod({ ...dataset, rows: scopedRows });
    const periodType = normalizePeriodMode(dataset.remoteRecord?.period_type || dataset.remoteRecord?.metadata?.period_type || period.periodType || getDatasetQuarterMode({ ...dataset, rows: scopedRows }));
    const quarterOrder = periodType === "q1" ? 1 : periodType === "q2" ? 2 : 3;
    const key = viewMode === "biweekly" ? `${period.key}-${periodType}` : period.key;
    if (!map.has(key)) {
      map.set(key, {
        key,
        sort: viewMode === "biweekly" ? period.sort * 10 + quarterOrder : period.sort,
        label: viewMode === "biweekly" ? formatEvolutionPeriodLabel({ ...dataset, rows: scopedRows }, "biweekly") : period.monthLabel,
        datasetId: dataset.id,
        count: 0,
        totalValue: 0,
        pnrCount: 0,
        packageCount: 0,
      });
    }
    const bucket = map.get(key);
    bucket.datasetId = dataset.id;
    scopedRows.forEach((row) => {
      const occurrences = getOccurrenceCount(row);
      bucket.count += occurrences;
      bucket.totalValue += Number(row.valor_numerico || 0);
      if (row.tipo_registro === "PNR") bucket.pnrCount += occurrences;
      if (row.tipo_registro === "PACOTE PERDIDO") bucket.packageCount += occurrences;
    });
  }

  const rows = Array.from(map.values()).sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label, "pt-BR"));
  return rows.map((row, index) => {
    const previous = rows[index - 1] || null;
    const deltaValue = previous ? row.totalValue - previous.totalValue : 0;
    const deltaPct = calculateVariation(row.totalValue, previous?.totalValue) || 0;
    return { ...row, previous, deltaValue, deltaPct };
  });
}

function getMonthlyComparisonRows(rows, sheet = state.sheet) {
  if (sheet === "Todos" || sheet === PRE_FATURA_VIEW) return rows;
  return rows.filter((row) => getRowDivision(row) === sheet);
}

async function buildReportHistoricalComparisonRows(scope, typeSelection = state.prefaturaTipo) {
  const files = await getReportAvailableFileRecords();
  if (!files.length) return buildMonthlyComparisonFromDatasets(library.datasets, { types: typeSelection, viewMode: "monthly" });

  if (scope.mode === "annual") {
    const annualFiles = getFilesByMonthAndPeriod(files, "all", scope.periodMode, PRE_FATURA_FILE_CATEGORY)
      .filter((file) => getFileRecordPeriod(file).key.startsWith(`${scope.year}-`));
    return buildReportMonthlyComparisonForFiles(annualFiles.length ? annualFiles : files.filter((file) => getFileRecordPeriod(file).key.startsWith(`${scope.year}-`)), typeSelection);
  }

  const availableMonthKeys = Array.from(new Set(files.map((file) => getFileRecordPeriod(file).key))).sort();
  const previousKey = getPreviousMonthKey(scope.key, availableMonthKeys);
  const selectedFiles = getFilesByMonthAndPeriod(files, scope.key, scope.periodMode, PRE_FATURA_FILE_CATEGORY);
  let previousFiles = [];
  let previousPeriodMode = scope.periodMode;

  if (previousKey) {
    previousFiles = getFilesByMonthAndPeriod(files, previousKey, scope.periodMode, PRE_FATURA_FILE_CATEGORY);
    if (!previousFiles.length && scope.periodMode !== "month") {
      previousFiles = getFilesByMonthAndPeriod(files, previousKey, "month", PRE_FATURA_FILE_CATEGORY);
      previousPeriodMode = "month";
    }
  }

  const comparisonFiles = uniqueDashboardFileRecords([...previousFiles, ...selectedFiles]);
  const comparisonRows = await buildReportMonthlyComparisonForFiles(comparisonFiles, typeSelection);
  return comparisonRows.map((row) => ({
    ...row,
    periodMode: row.key === previousKey ? previousPeriodMode : row.key === scope.key ? scope.periodMode : row.periodMode,
    comparisonFallback: row.key === previousKey && previousPeriodMode !== scope.periodMode,
  }));
}

async function getReportAvailableFileRecords() {
  let files = dashboardFileRecords.filter(isUsableDashboardFileRecord).filter(isDashboardFileActive);
  if (!files.length && currentUser && window.supabaseClient) {
    try {
      files = await loadDashboardFilesFromSupabase({
        loadActive: false,
        render: false,
        validateStorage: false,
        showLoading: false,
      });
    } catch (error) {
      console.error("[REPORT] Erro ao buscar histórico no Supabase:", error);
    }
  }
  return (files || []).filter(isUsableDashboardFileRecord).filter((file) => getFileRecordCategory(file) === PRE_FATURA_FILE_CATEGORY);
}

async function buildReportMonthlyComparisonForFiles(files, typeSelection = state.prefaturaTipo) {
  const datasets = [];
  const datasetById = new Map(
    (Array.isArray(library.datasets) ? library.datasets : [])
      .filter((dataset) => dataset?.source !== "filtered" && Array.isArray(dataset.rows) && dataset.rows.length)
      .map((dataset) => [dataset.id, dataset]),
  );
  for (const file of uniqueDashboardFileRecords(files)) {
    const cached = datasetById.get(file.id);
    if (cached?.rows?.length) {
      datasets.push(cached);
      continue;
    }
    const dataset = await loadRowsFromStorage(file);
    if (dataset?.rows?.length) {
      datasets.push(dataset);
      datasetById.set(file.id, dataset);
      if (!library.datasets.some((entry) => entry.id === dataset.id)) {
        library.datasets.push(dataset);
      }
    }
  }
  return buildMonthlyComparisonFromDatasets(datasets, { types: typeSelection });
}

function uniqueDashboardFileRecords(files) {
  const unique = new Map();
  (Array.isArray(files) ? files : []).forEach((file) => {
    if (file?.id && !unique.has(file.id)) unique.set(file.id, file);
  });
  return Array.from(unique.values());
}

function getPreviousMonthKey(selectedMonthKey, availableMonthKeys) {
  const sorted = [...new Set(availableMonthKeys)].sort();
  const index = sorted.indexOf(selectedMonthKey);
  return index > 0 ? sorted[index - 1] : null;
}

function calculateVariation(currentValue, previousValue) {
  const previous = Number(previousValue || 0);
  if (!previous) return null;
  return ((Number(currentValue || 0) - previous) / previous) * 100;
}

function getDatasetPeriod(dataset) {
  if (dataset?.remoteRecord) return getFileRecordPeriod(dataset.remoteRecord);
  const fromName = `${dataset.label || ""} ${dataset.fileName || ""}`;
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

function getFileRecordPeriod(fileRecord) {
  const metadataPeriodText = [
    fileRecord?.metadata?.mes,
    fileRecord?.metadata?.competencia,
    fileRecord?.metadata?.ano,
    fileRecord?.metadata?.display_name,
    fileRecord?.metadata?.original_name,
  ].filter(Boolean).join(" ");
  const name = `${metadataPeriodText} ${fileRecord?.file_name || ""} ${fileRecord?.period_label || ""} ${fileRecord?.metadata?.period_label || ""}`;
  const monthNumberValue =
    getMonthNumberFromAny(fileRecord?.metadata?.mes) ||
    getMonthNumberFromAny(fileRecord?.metadata?.competencia) ||
    getMonthNumberFromAny(fileRecord?.metadata?.reference_month) ||
    getMonthNumberFromAny(fileRecord?.reference_month) ||
    String(monthNumber(detectMonth(name)) || 1).padStart(2, "0");
  const yearValue =
    normalizeReferenceYear(fileRecord?.metadata?.ano) ||
    normalizeReferenceYear(fileRecord?.metadata?.competencia) ||
    normalizeReferenceYear(fileRecord?.metadata?.reference_year) ||
    normalizeReferenceYear(fileRecord?.reference_year) ||
    detectYear(name) ||
    String(new Date().getFullYear());
  const monthIndex = Number(monthNumberValue) || 1;
  const monthName = MONTHS[monthIndex - 1] || "";
  const periodType = normalizePeriodMode(fileRecord?.period_type || fileRecord?.metadata?.period_type || getPeriodModeFromLabel(name));
  return {
    key: `${yearValue}-${String(monthIndex).padStart(2, "0")}`,
    sort: Number(yearValue) * 100 + monthIndex,
    monthLabel: `${capitalize(monthName || "Sem mês")} / ${yearValue}`,
    periodType,
    periodLabel: getPeriodModeLabel(periodType),
  };
}

function normalizeReferenceMonth(value) {
  if (value == null || value === "") return "";
  const numeric = Number(String(value).replace(/\D/g, ""));
  if (Number.isFinite(numeric) && numeric >= 1 && numeric <= 12) return String(numeric).padStart(2, "0");
  const detected = monthNumber(String(value));
  return detected ? String(detected).padStart(2, "0") : "";
}

function normalizeReferenceYear(value) {
  if (value == null || value === "") return "";
  const detected = detectYear(String(value));
  return detected || "";
}

function getPeriodModeFromLabel(value) {
  const label = detectQuinzena(value);
  if (label.includes("1")) return "q1";
  if (label.includes("2")) return "q2";
  return "month";
}

function buildActivePeriodLabel(monthKey, periodMode, selectedFiles = []) {
  const normalizedPeriod = normalizePeriodMode(periodMode);
  const periodLabel = getPeriodModeLabel(normalizedPeriod);
  const fileCount = selectedFiles.length;
  if (monthKey === "all") {
    const years = [...new Set(selectedFiles.map((file) => getFileRecordPeriod(file).key.slice(0, 4)).filter(Boolean))].sort();
    const yearLabel = years.length === 1 ? years[0] : years.length ? `${years[0]}-${years[years.length - 1]}` : "Todos";
    return `${yearLabel} · todos os meses${normalizedPeriod === "month" ? "" : ` · ${periodLabel}`} · ${integer.format(fileCount)} arquivo${fileCount === 1 ? "" : "s"}`;
  }
  const month = getAvailableMonthOptions().find((option) => option.key === monthKey);
  return `${month?.label || monthKey}${normalizedPeriod === "month" ? " · mês completo" : ` · ${periodLabel}`} · ${integer.format(fileCount)} arquivo${fileCount === 1 ? "" : "s"}`;
}

function detectMonthFromRows(rows) {
  const dated = rows.find((row) => row.data_normalizada || row.data_sort || row.dataCaso || row.data_caso);
  if (!dated) return "";
  const date = dated.data_normalizada
    ? new Date(`${dated.data_normalizada}T00:00:00Z`)
    : (dated.dataCaso || dated.data_caso)
      ? new Date(`${dated.dataCaso || dated.data_caso}T00:00:00Z`)
      : new Date(dated.data_sort);
  if (Number.isNaN(date.getTime())) return "";
  return MONTHS[date.getUTCMonth()] || "";
}

function detectYearFromRows(rows) {
  const dated = rows.find((row) => row.data_normalizada || row.data_sort || row.dataCaso || row.data_caso);
  if (!dated) return "";
  const date = dated.data_normalizada
    ? new Date(`${dated.data_normalizada}T00:00:00Z`)
    : (dated.dataCaso || dated.data_caso)
      ? new Date(`${dated.dataCaso || dated.data_caso}T00:00:00Z`)
      : new Date(dated.data_sort);
  if (Number.isNaN(date.getTime())) return "";
  return String(date.getUTCFullYear());
}

function getFilteredRowsCacheKey() {
  const datasetId = getActiveDataset()?.id || fileMeta?.id || "";
  return [
    datasetId,
    allRows.length,
    getPrefaturaMonthSelectionValues().join("|"),
    normalizePeriodMode(state.prefaturaPeriod || state.period),
    normalizeTypeSelection(state.prefaturaTipo).join("|"),
    normalize(state.query),
  ].join("::");
}

function getFilteredRows() {
  const cacheKey = getFilteredRowsCacheKey();
  if (derivedDataCache.prefaturaKey === cacheKey) {
    return derivedDataCache.prefaturaRows;
  }

  const query = normalize(state.query);
  const selectedDivisions = getPrefaturaDivisionsForTypes();
  const rows = allRows.filter((row) => {
    const rowCategory = row.file_category || PRE_FATURA_FILE_CATEGORY;
    if (rowCategory === PACKAGE_MANAGEMENT_FILE_CATEGORY) return false;
    if (selectedDivisions.length < MAIN_TYPE_OPTIONS.length && !selectedDivisions.includes(getRowDivision(row))) return false;

    if (!query) return true;
    return row._search.includes(query);
  });
  derivedDataCache.prefaturaKey = cacheKey;
  derivedDataCache.prefaturaRows = rows;
  return rows;
}

function filterPrefaturaRowsByType(rows, type) {
  const selectedDivision = getPrefaturaDivisionForType(type);
  const baseRows = (Array.isArray(rows) ? rows : []).filter((row) => (row.file_category || PRE_FATURA_FILE_CATEGORY) !== PACKAGE_MANAGEMENT_FILE_CATEGORY);
  return selectedDivision ? baseRows.filter((row) => getRowDivision(row) === selectedDivision) : baseRows;
}

function filterPrefaturaRowsByTypes(rows, selection = state.packageTipo) {
  const baseRows = (Array.isArray(rows) ? rows : []).filter((row) => (row.file_category || PRE_FATURA_FILE_CATEGORY) !== PACKAGE_MANAGEMENT_FILE_CATEGORY);
  const selectedTypes = getTypeSelectionValues(selection);
  if (selectedTypes.length === MAIN_TYPE_OPTIONS.length) return baseRows;
  const selectedDivisions = new Set(selectedTypes.map((type) => PREFATURA_TYPE_TO_DIVISION[type]).filter(Boolean));
  return baseRows.filter((row) => selectedDivisions.has(getRowDivision(row)));
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

function countBySheet(rows) {
  return calcularContadoresAbas(rows);
}

function calcularContadoresAbas(dados) {
  const base = Array.isArray(dados) ? dados : [];
  const preRows = base.filter((item) => (item.file_category || PRE_FATURA_FILE_CATEGORY) !== PACKAGE_MANAGEMENT_FILE_CATEGORY);
  return SHEET_TABS.reduce((acc, sheet) => {
    if (sheet === PRE_FATURA_VIEW) acc[sheet] = preRows.length;
    else if (sheet === MONTHLY_BASE_VIEW) acc[sheet] = 0;
    else if (sheet === PACKAGE_MANAGEMENT_VIEW) acc[sheet] = packageManagementRows.length;
    else acc[sheet] = preRows.filter((item) => getRowDivision(item) === sheet).length;
    return acc;
  }, {});
}

function getRowDivision(item) {
  if (!item || typeof item !== "object") return "";
  if (item.file_category === PACKAGE_MANAGEMENT_FILE_CATEGORY) return PACKAGE_MANAGEMENT_VIEW;
  return normalizeSheetLabel(item.divisao || item.aba_origem || item.aba || item.sheetName, item.tipo_desconto || item.tipo_registro);
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
  const mix = DONUT_SHEETS.map((label) => {
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
  const selectedDivisions = getPrefaturaDivisionsForTypes();
  return selectedDivisions.length < MAIN_TYPE_OPTIONS.length ? mix.filter((item) => selectedDivisions.includes(item.label)) : mix;
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
    const label = getGroupLabel(row, key);
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
    const label = getGroupLabel(row, key);
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

function getGroupLabel(row, key) {
  if (key === "base") return getBaseIdentity(row) || "Sem valor";
  if (key === "motorista" || key === "driver") return formatDriverName(row[key], "Sem valor");
  const value = row[key];
  return value == null || value === "" ? "Sem valor" : String(value);
}

function uniqueCount(rows, key) {
  return new Set(rows.map((row) => row[key]).filter(Boolean)).size;
}

function uniqueBaseCount(rows) {
  const bases = new Set();
  rows.forEach((row) => {
    const base = getBaseIdentity(row);
    if (base) bases.add(base);
  });
  return bases.size;
}

function normalizeDriverName(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function isUnidentifiedDriverName(value) {
  const normalized = normalizeDriverName(value);
  return !normalized || normalized.includes("IDENTIFICADO") || normalized.includes("IDENTIFICADA") || normalized === "SEM DRIVER" || normalized === "SEM MOTORISTA" || normalized === "NAO INFORMADO";
}

function formatDriverName(value, fallback = "Não identificado") {
  const fallbackIdentity = normalizeDriverName(fallback);
  const safeFallback = fallbackIdentity.includes("IDENTIFICADO") ? "Não identificado" : fallback;
  const raw = String(value || "").replace(/\s+/g, " ").trim();
  if (!raw) return safeFallback;
  const normalized = normalizeDriverName(raw);
  if (isUnidentifiedDriverName(raw)) return safeFallback;
  const lowerConnectors = new Set(["DA", "DAS", "DE", "DI", "DO", "DOS", "E"]);
  return normalized
    .split(" ")
    .map((part, index) => {
      if (index > 0 && lowerConnectors.has(part)) return part.toLowerCase();
      if (part.length <= 2 && /^[A-Z]+$/.test(part)) return part;
      return `${part.slice(0, 1)}${part.slice(1).toLowerCase()}`;
    })
    .join(" ");
}

function normalizeDriver(value) {
  return normalizeDriverName(value);
}

function calcularTotalDriversUnicos(rows) {
  const drivers = new Set();
  rows.forEach((row) => {
    const name = row?.driver || row?.motorista || row?.nomeMotorista || row?.nome_driver || "";
    const normalizedName = normalizeDriverName(name);
    if (normalizedName && !isUnidentifiedDriverName(name)) drivers.add(normalizedName);
  });
  return drivers.size;
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
  const raw = normalizeText(`${value || ""} ${type || ""}`);
  const compact = raw.replace(/\s+/g, "");
  const hasLost = /\bPERDID[OA]S?\b/.test(raw);
  const hasSvc = /\bSVC\b/.test(raw) || /\bSERVICE\b/.test(raw) || /\bSERVICO\b/.test(raw);
  const hasXpt = /\bXPT\b/.test(raw);
  const hasPnr = /\bPNRS?\b/.test(raw) || compact.includes("PNR");

  if (hasSvc && hasLost) return "SVC PERDIDOS";
  if (hasXpt && hasLost) return "XPT PERDIDOS";
  if (hasPnr) return "PNR";
  return String(value || "").trim() || "Sem aba";
}

function normalizeStoredRow(row) {
  if (!row || typeof row !== "object") return row;
  const sheet = normalizeSheetLabel(row.aba_origem || row.aba || row.sheetName, row.tipo_desconto || row.tipo_registro);
  const baseValue = row.base || row.svc || row.estacao || row.station || row.unidade || "";
  const baseParts = splitBase(baseValue);
  const linkedIds = getLinkedPackageIds(row);
  const normalized = {
    ...row,
    aba_origem: sheet,
    divisao: sheet,
    base: baseValue,
    cidade_base: row.cidade_base || baseParts.cidade_base,
    sigla_base: row.sigla_base || baseParts.sigla_base,
    base_normalizada: normalizeBase(baseValue),
    tipo_registro: sheet === "PNR" ? "PNR" : "PACOTE PERDIDO",
    ids_vinculados: linkedIds,
    quantidade_ids: linkedIds.length || 0,
    linked_ids_count: linkedIds.length || 0,
    ocorrencias: Number(row.ocorrencias || 1),
  };

  normalized._search = buildRowSearchText(normalized);

  return normalized;
}

function buildRowSearchText(row) {
  return normalize(
    [
      row.aba_origem,
      row.tipo_desconto,
      row.tipo_registro,
      row.base,
      row.cidade_base,
      row.sigla_base,
      row.motorista,
      row.placa,
      row.descricao,
      row.id_pacote,
      ...(Array.isArray(row.ids_vinculados) ? row.ids_vinculados : []),
      row.n_rota,
      row.data_normalizada,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function getLinkedPackageIds(row) {
  const rawIds = [
    ...(Array.isArray(row?.ids_vinculados) ? row.ids_vinculados : []),
    ...(Array.isArray(row?.linked_ids) ? row.linked_ids : []),
    row?.id_pacote,
  ];
  const ids = [];
  const seen = new Set();
  rawIds
    .flatMap((value) => String(value || "").split(/[;,|\n]+/))
    .map((value) => value.trim())
    .filter(Boolean)
    .forEach((id) => {
      const key = normalize(id);
      if (seen.has(key)) return;
      seen.add(key);
      ids.push(id);
    });
  return ids;
}

function normalizeOccurrenceCurrency(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(2) : normalize(value);
}

function normalizeOccurrenceAmount(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Number(value.toFixed(2)) : 0;
  }

  const parsed = parseMoney(value);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;
}

function buildOccurrenceKey(row) {
  return [
    getBaseIdentity(row),
    row.cidade_base,
    row.motorista,
    row.n_rota,
    row.placa,
    row.tipo_desconto,
    row.aba_origem || row.tipo_registro,
    row.data_normalizada,
    normalizeOccurrenceCurrency(row.valor_numerico),
  ]
    .map((value) => normalize(value))
    .join("|");
}

function isPnrRow(row) {
  return normalizeSheetLabel(row?.aba_origem || row?.divisao || row?.sheetName, row?.tipo_desconto || row?.tipo_registro) === "PNR";
}

function buildPnrLinkedOccurrenceKey(row) {
  return [
    row.motorista || row.driver,
    row.n_rota || row.numeroRota || row.rota,
    getBaseIdentity(row),
    row.tipo_desconto || row.tipo,
    row.aba_origem || row.tipo_registro || row.categoria,
  ]
    .map((value) => normalize(value))
    .join("|");
}

function getLinkedValues(row) {
  if (Array.isArray(row?.valores_vinculados) && row.valores_vinculados.length) {
    return row.valores_vinculados.map(normalizeOccurrenceAmount).filter((value) => value > 0);
  }
  const value = normalizeOccurrenceAmount(row?.valor_numerico);
  return value > 0 ? [value] : [];
}

function addUniqueAmount(amounts, value) {
  const amount = normalizeOccurrenceAmount(value);
  if (!amount) return;
  if (!amounts.some((current) => normalizeOccurrenceAmount(current) === amount)) {
    amounts.push(amount);
  }
}

function sumUniqueAmounts(amounts) {
  return amounts.reduce((total, amount) => total + normalizeOccurrenceAmount(amount), 0);
}

function consolidateLinkedOccurrences(rows) {
  const map = new Map();
  let linkedOccurrences = 0;
  let linkedIds = 0;

  rows.forEach((sourceRow) => {
    const row = normalizeStoredRow(sourceRow);
    const shouldConsolidatePnrByRoute = isPnrRow(row);
    const occurrenceKey = shouldConsolidatePnrByRoute ? buildPnrLinkedOccurrenceKey(row) : buildOccurrenceKey(row);
    const ids = getLinkedPackageIds(row);
    const linkedValues = getLinkedValues(row);
    if (!linkedValues.length) addUniqueAmount(linkedValues, row.valor_numerico);

    if (!map.has(occurrenceKey)) {
      map.set(occurrenceKey, {
        ...row,
        occurrence_key: occurrenceKey,
        ids_vinculados: ids,
        quantidade_ids: ids.length,
        linked_ids_count: ids.length,
        ocorrencias: shouldConsolidatePnrByRoute ? Math.max(1, linkedValues.length) : 1,
        valores_vinculados: shouldConsolidatePnrByRoute ? linkedValues : getLinkedValues(row),
        valor_numerico: shouldConsolidatePnrByRoute ? sumUniqueAmounts(linkedValues) : row.valor_numerico,
      });
      return;
    }

    const existing = map.get(occurrenceKey);
    const currentIds = new Set((existing.ids_vinculados || []).map((id) => normalize(id)));
    ids.forEach((id) => {
      const key = normalize(id);
      if (currentIds.has(key)) return;
      currentIds.add(key);
      existing.ids_vinculados.push(id);
    });

    existing.quantidade_ids = existing.ids_vinculados.length;
    existing.linked_ids_count = existing.ids_vinculados.length;
    existing.ocorrencias = 1;

    if (shouldConsolidatePnrByRoute) {
      const existingValues = getLinkedValues(existing);
      linkedValues.forEach((value) => addUniqueAmount(existingValues, value));
      existing.valores_vinculados = existingValues;
      existing.valor_numerico = sumUniqueAmounts(existingValues);
      existing.ocorrencias = Math.max(1, existingValues.length);
    }

    existing._search = buildRowSearchText(existing);
  });

  const consolidated = Array.from(map.values()).map((row) => {
    const linkedCount = row.ids_vinculados?.length || 0;
    const linkedValues = getLinkedValues(row);
    const occurrenceCount = isPnrRow(row) ? Math.max(1, linkedValues.length) : 1;
    if (linkedCount > 1) {
      linkedOccurrences += 1;
      linkedIds += linkedCount;
    }
    return {
      ...row,
      quantidade_ids: linkedCount,
      linked_ids_count: linkedCount,
      ocorrencias: occurrenceCount,
      valores_vinculados: linkedValues,
      valores_vinculados_texto: linkedValues.map((value) => currency.format(value)).join(" + "),
      _search: buildRowSearchText(row),
    };
  });

  consolidateLinkedOccurrences.lastStats = {
    originalRows: rows.length,
    consolidatedRows: consolidated.length,
    duplicatesSkipped: Math.max(rows.length - consolidated.length, 0),
    linkedOccurrences,
    linkedIds,
  };

  return consolidated;
}

function identificarPeriodoGestaoPacotes(nomeArquivo) {
  const nome = normalizeText(nomeArquivo);
  const quinzena = /\b1\s*Q\b/.test(nome) ? "1ª quinzena" : /\b2\s*Q\b/.test(nome) ? "2ª quinzena" : null;
  const meses = {
    JANEIRO: "Jan", FEVEREIRO: "Fev", MARCO: "Mar", MARÇO: "Mar", ABRIL: "Abr", MAIO: "Mai", JUNHO: "Jun",
    JULHO: "Jul", AGOSTO: "Ago", SETEMBRO: "Set", OUTUBRO: "Out", NOVEMBRO: "Nov", DEZEMBRO: "Dez",
  };
  let mes = null;
  for (const [nomeMes, sigla] of Object.entries(meses)) {
    if (nome.includes(normalizeText(nomeMes))) {
      mes = sigla;
      break;
    }
  }
  const anoMatch = nome.match(/\b20\d{2}\b/);
  const ano = anoMatch ? anoMatch[0] : null;
  return { mes, ano, quinzena, competencia: mes && ano ? `${mes}/${String(ano).slice(-2)}` : null };
}

function identificarAbaGestao(nomeAba) {
  const aba = normalizeText(nomeAba);
  if (aba.includes("ALINHAMENTO")) return "ALINHAMENTO";
  if (aba.includes("ABSORVID") || /\bALC\b/.test(aba)) return "ALC";
  if (aba.includes("MERCADO LIVRE") || aba.includes("MELI") || /\bML\b/.test(aba)) return "MERCADO_LIVRE";
  return null;
}

function isDecisionColumn(header) {
  const h = normalizeText(header);
  return h.includes("DECISAO") || h.includes("ADM") || h.includes("RETORNO") || h.includes("ACAO");
}

function classifyPackageDecision(value, sheetType) {
  if (sheetType === "ALC") return "ALC";
  if (sheetType === "MERCADO_LIVRE") return "MERCADO_LIVRE";
  const decision = normalizeText(value);
  if (!decision) return "INDEFINIDO";
  const hasDispatcher = hasDispatcherDecisionText(decision);
  const hasDriver = hasDriverDecisionText(decision);
  const removesDriver = decision.includes("RETIRAR") && hasDriver;
  if (hasUnsignedTermDecision(decision) && hasDispatcher) return "DISPATCHER";
  if (isDispatcherDiscountDecisionText(decision)) return "DISPATCHER";
  if (removesDriver) return "INDEFINIDO";
  if (isDriverKeptDecisionText(decision)) return "DRIVER";
  return "INDEFINIDO";
}

function hasDispatcherDecisionText(decision) {
  return decision.includes("DISPATCHER") || decision.includes("DISPATHCER") || decision.includes("DISPACHER");
}

function hasDriverDecisionText(decision) {
  return decision.includes("DRIVER") || decision.includes("MOTORISTA");
}

function hasUnsignedTermDecision(decision) {
  return decision.includes("ASSIN") && decision.includes("TERMO");
}

function isDispatcherDiscountDecisionText(decision) {
  const hasDispatcher = hasDispatcherDecisionText(decision);
  const hasDriver = hasDriverDecisionText(decision);
  const removesDriver = decision.includes("RETIRAR") && hasDriver;
  return hasDispatcher && (removesDriver || decision.includes("DESCONTO") || hasUnsignedTermDecision(decision) || !hasDriver);
}

function isDriverKeptDecisionText(decision) {
  const hasDriver = hasDriverDecisionText(decision);
  const hasDispatcher = hasDispatcherDecisionText(decision);
  const keepsDriver = decision.includes("MANTER") || decision.includes("MANTIDO") || decision.includes("MANTEM") || decision.includes("DIRECIONADO");
  return hasDriver && !hasDispatcher && (keepsDriver || decision.includes("DESCONTO"));
}

function cleanPackageDecisionText(value) {
  return String(value || "")
    .replace(/com\s*driver/gi, "com Driver")
    .replace(/\s*\/\s*/g, " / ")
    .replace(/\s+/g, " ")
    .trim();
}

function getPackageDecisionDisplay(row) {
  const rawDecision = row?.decisao_adm || "";
  const normalizedDecision = normalizeText(rawDecision);
  const category = row?.categoria_final || classifyPackageDecision(rawDecision, row?.aba_gestao);
  const unsignedTerm = hasUnsignedTermDecision(normalizedDecision);

  if (category === "DISPATCHER" || isDispatcherDiscountDecisionText(normalizedDecision)) {
    return {
      primary: "Desconto direcionado ao Dispatcher",
      note: unsignedTerm ? "Não assinou o termo" : "",
    };
  }
  if (category === "DRIVER" || isDriverKeptDecisionText(normalizedDecision)) {
    return { primary: "Desconto mantido com Driver", note: "" };
  }
  if (category === "ALC") return { primary: "Absorvido pela ALC", note: "" };
  if (category === "MERCADO_LIVRE") return { primary: "Mercado Livre", note: "" };

  return { primary: cleanPackageDecisionText(rawDecision) || "—", note: "" };
}

function renderPackageDecisionCell(row) {
  const display = getPackageDecisionDisplay(row);
  if (!display.note) return escapeHtml(display.primary);
  return `
    <span class="decision-cell__primary">${escapeHtml(display.primary)}</span>
    <span class="decision-cell__note">${escapeHtml(display.note)}</span>
  `;
}

function findDecisionInfo(headers, row, sheetType) {
  if (sheetType === "ALC" || sheetType === "MERCADO_LIVRE") return { value: "", category: classifyPackageDecision("", sheetType) };
  const decisionIndexes = headers.map((header, index) => (isDecisionColumn(header) ? index : -1)).filter((index) => index >= 0).reverse();
  let fallbackValue = "";
  for (const index of decisionIndexes) {
    const value = readCell(row, index);
    if (!value) continue;
    if (!fallbackValue) fallbackValue = value;
    const category = classifyPackageDecision(value, sheetType);
    if (category !== "INDEFINIDO") return { value, category };
  }
  return { value: fallbackValue, category: "INDEFINIDO" };
}

function findPackageHeaderRow(matrix) {
  const limit = Math.min(matrix.length, 20);
  for (let index = 0; index < limit; index += 1) {
    const headers = (matrix[index] || []).map((value) => String(value || "").trim());
    const hasValue = findHeaderIndex(headers, ["VALOR", "VALOR DESCONTO", "DESCONTO"]) >= 0;
    const hasPerson = findHeaderIndex(headers, ["MOTORISTA", "DRIVER", "NOME MOTORISTA"]) >= 0;
    const hasDecision = headers.some(isDecisionColumn);
    if (hasValue && (hasPerson || hasDecision)) return index;
  }
  return 0;
}

function isPackageTotalRow(row) {
  const values = (Array.isArray(row) ? row : Object.values(row || {}))
    .map(normalizeText)
    .filter(Boolean);

  return values.some(isPackageSummaryText);
}

function isPackageSummaryText(value) {
  const text = normalizeText(value);
  if (!text) return false;
  if (text === "TOTAL" || text === "TOTAIS" || text === "TOTAL GERAL" || text === "RESUMO") return true;
  return (
    text.startsWith("TOTAL ") ||
    text.includes(" TOTAL ") ||
    text.includes("SUBTOTAL") ||
    text.includes("SOMA") ||
    text.includes("SOMATORIA") ||
    text.includes("VALOR TOTAL") ||
    text.includes("TOTAL DESCONTO") ||
    text.includes("TOTAL DESCONTOS") ||
    text.includes("TOTAL DE DESCONTO") ||
    text.includes("TOTAL DE DESCONTOS") ||
    text.includes("TOTAL ABSORVIDO") ||
    text.includes("TOTAL DRIVER") ||
    text.includes("TOTAL DISPATCHER") ||
    text.includes("TOTAL MERCADO LIVRE") ||
    text.includes("QTD TOTAL") ||
    text.includes("QUANTIDADE TOTAL")
  );
}

function hasPackageStrongDetailAnchor(row) {
  return [
    row.id_pacote,
    row.id_caso,
    row.id,
    row.n_rota,
    row.rota,
    row.data_normalizada,
    row.data_sort,
  ].some((value) => String(value || "").trim());
}

function isPackageManagementDetailRow(row) {
  if (!row || typeof row !== "object") return false;
  if (isPackageTotalRow(row)) return false;
  const driverRaw = row.motorista || row.driver || row.nomeMotorista || row.nome_driver || "";
  const hasDriver = !isUnidentifiedDriverName(driverRaw);
  const occurrenceCount = getOccurrenceCount(row);
  const hasStrongDetailAnchor = hasPackageStrongDetailAnchor(row);
  const hasDetailAnchor = [
    row.id_pacote,
    row.id_caso,
    row.id,
    row.n_rota,
    row.rota,
    row.data_normalizada,
    row.data_sort,
    row.base_normalizada,
    normalizeBase(row.base),
  ].some((value) => String(value || "").trim());
  if (!hasDriver && occurrenceCount > 1) return false;
  if (!hasDriver && !hasStrongDetailAnchor) return false;
  return hasDriver || hasDetailAnchor;
}

function hasPackageRecordMinimum({ valor, base, motorista, dataValue, rota, id, decision }) {
  const numericValue = normalizarValorGestao(valor);
  if (!Number.isFinite(numericValue) || numericValue === 0) return false;
  return [base, motorista, dataValue, rota, id, decision?.value].some((value) => String(value || "").trim());
}

function repairPnrText(value) {
  return String(value ?? "")
    .replace(/PERÃ[ÍI]ODO/gi, "PERÍODO")
    .replace(/REVISÃƒO/gi, "REVISÃO")
    .replace(/RECLAMAÃ‡ÃƒO/gi, "RECLAMAÇÃO")
    .replace(/ESTAÃ‡ÃƒO/gi, "ESTAÇÃO")
    .replace(/NÂ°/gi, "N°")
    .replace(/PRÃ‰-FATURA/gi, "PRÉ-FATURA")
    .replace(/MÃŠS/gi, "MÊS")
    .replace(/Ã‡/g, "Ç")
    .replace(/Ã‰/g, "É")
    .replace(/ÃŠ/g, "Ê")
    .replace(/ÃÍ/g, "Í")
    .replace(/Ã¡/g, "á")
    .replace(/Ã©/g, "é")
    .replace(/Ã­/g, "í")
    .replace(/Ã³/g, "ó")
    .replace(/Ãº/g, "ú")
    .replace(/Ã£/g, "ã")
    .replace(/Ãµ/g, "õ")
    .replace(/Ã§/g, "ç");
}

function normalizePnrHeader(value) {
  return normalizeText(repairPnrText(value)).replace(/\s+/g, " ").trim();
}

function titleCasePt(value) {
  return String(value || "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part, index) => (index > 0 && ["de", "da", "do", "das", "dos", "e", "em", "para"].includes(part) ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(" ");
}

function normalizePnrStatus(value) {
  const original = repairPnrText(value).trim();
  const normalized = normalizeText(original);
  if (!normalized) return "";
  if (normalized.includes("ANULADO")) return "Anulado";
  if (normalized.includes("ENVIADO") && normalized.includes("FATURAMENTO")) return "Enviado para faturamento";
  if (normalized.includes("FATURADO")) return "Faturado";
  if (normalized.includes("ANALISE") || normalized.includes("ANALISA")) return "Em análise";
  if (normalized.includes("ABERTO")) return "Aberto";
  return titleCasePt(original);
}

function parsePnrMoney(value) {
  if (value == null || value === "") return 0;
  if (typeof value === "number" && Number.isFinite(value)) return Number(value.toFixed(2));
  let raw = String(value).replace(/[^\d,.-]/g, "").trim();
  if (!raw) return 0;
  const hasComma = raw.includes(",");
  const hasDot = raw.includes(".");
  if (hasComma && hasDot) {
    const lastComma = raw.lastIndexOf(",");
    const lastDot = raw.lastIndexOf(".");
    raw = lastDot > lastComma
      ? raw.replace(/,/g, "")
      : raw.replace(/\./g, "").replace(",", ".");
  }
  else if (hasComma) raw = raw.replace(",", ".");
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;
}

function formatPnrId(value) {
  if (value == null || value === "") return "";
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.trunc(value));
  return repairPnrText(value)
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\.0+$/, "")
    .trim();
}

function cleanPnrDedupePart(value) {
  return formatPnrId(value)
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function getPnrDedupeKey(row) {
  const idCaso = cleanPnrDedupePart(row?.idCaso || row?.id_caso || row?.["ID DO CASO"]);
  const idEnvio = cleanPnrDedupePart(row?.idEnvio || row?.id_envio || row?.["ID DE ENVIO"]);
  const idReclamacao = cleanPnrDedupePart(row?.idReclamacao || row?.id_reclamacao || row?.["ID DA RECLAMAÇÃO"]);
  const periodo = cleanPnrDedupePart(
    row?.sourcePeriodo ||
      row?.source_periodo ||
      row?.periodoFaturamentoOriginal ||
      row?.periodo_faturamento_original ||
      row?.periodoFaturamento ||
      row?.periodo_faturamento ||
      row?.["PERÍODO DE FATURAMENTO"] ||
      row?.["PERIODO DE FATURAMENTO"],
  );
  if (!idCaso) return "";
  if (idEnvio && idReclamacao && periodo) return `${idCaso}|${idEnvio}|${idReclamacao}|${periodo}`;
  if (idEnvio && periodo) return `${idCaso}|${idEnvio}|${periodo}`;
  if (periodo) return `${idCaso}|${periodo}`;
  if (idEnvio && idReclamacao) return `${idCaso}|${idEnvio}|${idReclamacao}`;
  if (idEnvio) return `${idCaso}|${idEnvio}`;
  return idCaso;
}

function getPnrRowCompletenessScore(row) {
  return [
    row?.idCaso,
    row?.idEnvio,
    row?.idReclamacao,
    row?.statusOriginal,
    row?.statusNormalizado,
    row?.periodoFaturamento,
    row?.dataPedidoRevisao,
    row?.pedidoRevisao,
    row?.dataEncerramentoCaso,
    row?.repAssistente,
    row?.comentarioEncerramento,
    row?.numeroPreFatura,
    row?.produtos,
    row?.valorCompraOriginal,
    row?.repTransportadora,
    row?.estacaoOrigem,
    row?.idRota,
    row?.idMotorista,
    row?.dataEntrega,
    row?.dataReclamacao,
    row?.mes,
    row?.quinzenaRef,
    row?.valorCompraNumerico ? String(row.valorCompraNumerico) : "",
  ].filter((value) => String(value ?? "").trim()).length;
}

function comparePnrDuplicateQuality(a, b) {
  const aScore = getPnrRowCompletenessScore(a);
  const bScore = getPnrRowCompletenessScore(b);
  if (aScore !== bScore) return aScore - bScore;
  const aClosed = parseDateValue(a?.dataEncerramentoCaso).ts || 0;
  const bClosed = parseDateValue(b?.dataEncerramentoCaso).ts || 0;
  if (aClosed !== bClosed) return aClosed - bClosed;
  const aValue = Number(a?.valorCompraNumerico || 0);
  const bValue = Number(b?.valorCompraNumerico || 0);
  if (Boolean(aValue) !== Boolean(bValue)) return aValue ? 1 : -1;
  return 0;
}

function mergePnrDuplicateRows(existing, incoming) {
  const merged = { ...existing };
  let changed = false;
  if (incoming?.nomeMotorista && !existing?.nomeMotorista) {
    merged.nomeMotorista = incoming.nomeMotorista;
    merged.motoristaDisplay = incoming.motoristaDisplay || incoming.nomeMotorista;
    merged.motoristaMatchSource = incoming.motoristaMatchSource || existing.motoristaMatchSource || "";
    changed = true;
  }
  Object.entries(incoming || {}).forEach(([key, value]) => {
    if (["nomeMotorista", "motoristaDisplay", "motoristaMatchSource"].includes(key) && merged.nomeMotorista) return;
    if (value === undefined || value === null || value === "") return;
    const currentValue = merged[key];
    if (currentValue === undefined || currentValue === null || currentValue === "" || currentValue === "Indefinido" || currentValue === 0) {
      if (currentValue !== value) {
        merged[key] = value;
        changed = true;
      }
    }
  });
  merged.dedupeKey = existing.dedupeKey || incoming.dedupeKey || getPnrDedupeKey(merged);
  merged.valorCompraFormatado = currency.format(Number(merged.valorCompraNumerico || 0));
  merged._search = buildPnrSearchText(merged);
  return { row: merged, changed };
}

function dedupePnrRecords(rows) {
  const deduped = [];
  const byKey = new Map();
  let duplicateRowsUpdated = 0;
  let duplicateRowsSkipped = 0;
  (Array.isArray(rows) ? rows : []).forEach((row, index) => {
    const normalized = normalizePnrStoredRow(row);
    if (!normalized) return;
    const key = normalized.dedupeKey || getPnrDedupeKey(normalized) || `__pnr_row_${index}`;
    normalized.dedupeKey = key;
    if (!byKey.has(key)) {
      byKey.set(key, normalized);
      deduped.push(normalized);
      return;
    }
    const previous = byKey.get(key);
    const shouldUseIncomingAsBase = comparePnrDuplicateQuality(normalized, previous) > 0;
    const merged = shouldUseIncomingAsBase
      ? mergePnrDuplicateRows(normalized, previous)
      : mergePnrDuplicateRows(previous, normalized);
    if (merged.changed) duplicateRowsUpdated += 1;
    else duplicateRowsSkipped += 1;
    byKey.set(key, merged.row);
    const previousIndex = deduped.indexOf(previous);
    if (previousIndex >= 0) deduped[previousIndex] = merged.row;
  });
  return { rows: deduped, duplicateRowsUpdated, duplicateRowsSkipped };
}

function getPnrOperationalType(estacao) {
  const code = normalizeText(estacao).replace(/[^A-Z0-9]/g, "");
  if (code.startsWith("S")) return "SVC";
  if (code.startsWith("E")) return "XPT";
  return "Indefinido";
}

function getPnrPeriodFromDate(dateValue) {
  const parsed = parseDateValue(dateValue);
  const date = parsed.ts ? new Date(parsed.ts) : null;
  const rawText = repairPnrText(dateValue);
  const fallbackMonth = getMonthNumberFromAny(rawText);
  const fallbackYear = detectYear(rawText);
  const year = date ? date.getUTCFullYear() : Number(fallbackYear || new Date().getFullYear());
  const monthIndex = date ? date.getUTCMonth() : Math.max(0, Number(fallbackMonth || 1) - 1);
  const day = date ? date.getUTCDate() : detectQuinzena(rawText).includes("2") ? 16 : 1;
  const monthNumberValue = String(monthIndex + 1).padStart(2, "0");
  return {
    competencia: `${MONTH_ABBR[monthIndex] || "JAN"}/${String(year).slice(2)}`,
    mes: monthNumberValue,
    ano: String(year),
    quinzena: day <= 15 ? "1ª quinzena" : "2ª quinzena",
    monthKey: `${year}-${monthNumberValue}`,
  };
}

function getPnrPeriodFromBillingPeriod(value) {
  const compact = normalizeText(repairPnrText(value)).replace(/\s+/g, "");
  const match = compact.match(/(20\d{2})(0[1-9]|1[0-2])Q([12])/);
  if (!match) return null;
  const [, year, monthNumberValue, quarter] = match;
  const monthIndex = Number(monthNumberValue) - 1;
  return {
    competencia: `${MONTH_ABBR[monthIndex] || "JAN"}/${String(year).slice(2)}`,
    mes: monthNumberValue,
    ano: String(year),
    quinzena: quarter === "2" ? "2ª quinzena" : "1ª quinzena",
    monthKey: `${year}-${monthNumberValue}`,
  };
}

function buildPnrBillingPeriodFromPeriod(period) {
  if (!period?.ano || !period?.mes) return "";
  const quarter = getPeriodModeFromLabel(period.quinzena) === "q2" ? "Q2" : "Q1";
  return `${period.ano}${period.mes}${quarter}`;
}

function getPnrMonthFullLabel(period) {
  const monthIndex = Number(period?.mes || 0) - 1;
  const monthName = MONTHS[monthIndex] ? capitalize(MONTHS[monthIndex]) : "";
  return monthName && period?.ano ? `${monthName}/${period.ano}` : period?.competencia || "";
}

function getPnrQuinzenaDisplay(period) {
  return getPeriodModeFromLabel(period?.quinzena) === "q2" ? "2ª Quinzena" : "1ª Quinzena";
}

function getPnrQuinzenaRef(period) {
  const monthIndex = Number(period?.mes || 0) - 1;
  const monthName = MONTHS[monthIndex] ? capitalize(MONTHS[monthIndex]) : "";
  const range = getPeriodModeFromLabel(period?.quinzena) === "q2" ? "16 a 31" : "01 a 15";
  return `${range} ${monthName}`.trim();
}

function getPnrPeriodLabel(period) {
  const quinzena = getPnrQuinzenaDisplay(period);
  const competencia = getPnrMonthFullLabel(period);
  return [quinzena, competencia].filter(Boolean).join(" · ");
}

function getPnrCell(rowObject, ...headers) {
  const normalizedHeaders = headers.map(normalizePnrHeader);
  for (const header of headers) {
    if (Object.prototype.hasOwnProperty.call(rowObject, header)) return rowObject[header];
  }
  for (const header of normalizedHeaders) {
    if (Object.prototype.hasOwnProperty.call(rowObject, header)) return rowObject[header];
  }
  return "";
}

function buildPnrSearchText(row) {
  return normalize([
    row.idCaso,
    row.idEnvio,
    row.idReclamacao,
    row.produtos,
    row.estacaoOrigem,
    row.idMotorista,
    row.nomeMotorista,
    row.motoristaDisplay,
    row.statusNormalizado,
    row.statusOriginal,
    row.idRota,
    row.competencia,
    row.quinzena,
    row.periodoLabel,
    row.quinzenaRef,
  ].join(" "));
}

function normalizePnrStoredRow(row) {
  if (!row) return null;
  const dataCaso = parseDateValue(row.dataCaso || row.data_caso || row["DATA DO CASO"]).iso;
  const dataPedidoRevisao = parseDateValue(row.dataPedidoRevisao || row.data_pedido_revisao || row["DATA DO PEDIDO DE REVISÃO"]).iso;
  const dataEncerramentoCaso = parseDateValue(row.dataEncerramentoCaso || row.data_encerramento_caso || row["DATA DE ENCERRAMENTO DO CASO"]).iso;
  const dataEntrega = parseDateValue(row.dataEntrega || row.data_entrega || row["DATA DE ENTREGA"]).iso;
  const dataReclamacao = parseDateValue(row.dataReclamacao || row.data_reclamacao || row["DATA DA RECLAMAÇÃO"]).iso;
  const sourceFileName = repairPnrText(row.sourceFileName || row.source_file_name || row.arquivo_origem || row.file_name || "").trim();
  const rawPeriodoFaturamento = repairPnrText(row.periodoFaturamentoOriginal || row.periodo_faturamento_original || row.periodoFaturamento || row.periodo_faturamento || row["PERÍODO DE FATURAMENTO"] || "").trim();
  const sourcePeriodo = repairPnrText(row.sourcePeriodo || row.source_periodo || rawPeriodoFaturamento || "").trim();
  const period =
    getPnrPeriodFromBillingPeriod(sourcePeriodo) ||
    getPnrPeriodFromBillingPeriod(sourceFileName) ||
    getPnrPeriodFromDate(dataCaso || rawPeriodoFaturamento || sourceFileName);
  const periodoOriginal = sourcePeriodo || buildPnrBillingPeriodFromPeriod(period);
  const estacaoOrigem = repairPnrText(row.estacaoOrigem || row.estacao_origem || row["ESTAÇÃO DE ORIGEM"] || row["ESTACAO DE ORIGEM"] || row.origem || "").trim();
  const statusOriginal = repairPnrText(row.statusOriginal || row.status_original || row.status || row.STATUS || "").trim();
  const valorCompraOriginal = repairPnrText(row.valorCompraOriginal || row.valor_compra_original || row["VALOR DA COMPRA"] || "").trim();
  const periodMonthName = getPnrMonthFullLabel(period).split("/")[0] || period.mes;
  const rawMes = repairPnrText(row.mes || "").trim();
  const mesDisplay = rawMes && !/^\d{1,2}$/.test(rawMes) ? rawMes : periodMonthName;
  const rawCompetencia = repairPnrText(row.competencia || "").trim();
  const competenciaDisplay = /\d{4}/.test(rawCompetencia) ? rawCompetencia : getPnrMonthFullLabel(period);
  const rawQuinzena = repairPnrText(row.quinzena || "").trim();
  const quinzenaDisplay = rawQuinzena && !/quinzena/i.test(rawQuinzena) ? rawQuinzena : getPnrQuinzenaDisplay(period);
  const valorCompraNumerico = parsePnrMoney(
    row.valorCompraNumerico ??
      row.valor_compra_numerico ??
      row["VAL. COMPRA"] ??
      row["VAL COMPRA"] ??
      row.valor_compra ??
      valorCompraOriginal,
  );
  const nomeMotorista = getPnrDriverNameFromSourceRow({
    motorista: row.nomeMotorista || row.nome_motorista || row.motorista || row.driver || row["NOME DO MOTORISTA"],
  });
  const normalized = {
    idCaso: formatPnrId(row.idCaso || row.id_caso || row["ID DO CASO"]),
    dataCaso,
    tipo: repairPnrText(row.tipo || row.TIPO || "").trim(),
    statusOriginal,
    statusNormalizado: row.statusNormalizado || row.status_normalizado || normalizePnrStatus(statusOriginal),
    periodoFaturamento: periodoOriginal,
    periodoFaturamentoOriginal: periodoOriginal,
    sourcePeriodo: periodoOriginal,
    sourceFileName,
    dataPedidoRevisao,
    pedidoRevisao: repairPnrText(row.pedidoRevisao || row.pedido_revisao || row["PEDIDO DE REVISÃO"] || "").trim(),
    dataEncerramentoCaso,
    repAssistente: repairPnrText(row.repAssistente || row.rep_assistente || row["REP - ASSISTENTE"] || "").trim(),
    comentarioEncerramento: repairPnrText(row.comentarioEncerramento || row.comentario_encerramento || row["COMENTÁRIO DE ENCERRAMENTO"] || "").trim(),
    numeroPreFatura: formatPnrId(row.numeroPreFatura || row.numero_pre_fatura || row["Nº DA PRÉ-FATURA"] || row["N° DA PRÉ-FATURA"] || row["N DA PRÉ-FATURA"]),
    idEnvio: formatPnrId(row.idEnvio || row.id_envio || row["ID DE ENVIO"] || row["ID ENVIO"]),
    produtos: repairPnrText(row.produtos || row.PRODUTOS || row.produto || row.PRODUTO || "").trim(),
    valorCompraOriginal,
    valorCompraNumerico,
    repTransportadora: repairPnrText(row.repTransportadora || row.rep_transportadora || row["REP TRANSPORTADORA"] || "").trim(),
    idTransportadora: formatPnrId(row.idTransportadora || row.id_transportadora || row["ID DA TRANSPORTADORA"]),
    transportadora: repairPnrText(row.transportadora || row.TRANSPORTADORA || "").trim(),
    estacaoOrigem,
    tipoOperacional: row.tipoOperacional || row.tipo_operacional || getPnrOperationalType(estacaoOrigem),
    idRota: formatPnrId(row.idRota || row.id_rota || row["ID DA ROTA"] || row["ID ROTA"]),
    idMotorista: formatPnrId(row.idMotorista || row.id_motorista || row["ID DO MOTORISTA"] || row["ID MOTORISTA"]),
    nomeMotorista,
    motoristaDisplay: row.motoristaDisplay || row.motorista_display || nomeMotorista || "",
    motoristaMatchSource: row.motoristaMatchSource || row.motorista_match_source || "",
    dataEntrega,
    idReclamacao: formatPnrId(row.idReclamacao || row.id_reclamacao || row["ID DA RECLAMAÇÃO"] || row["ID DA RECLAMACAO"] || row["ID RECLAMAÇÃO"] || row["ID RECLAMACAO"]),
    dataReclamacao,
    mes: mesDisplay,
    mesNumero: row.mesNumero || row.mes_numero || period.mes,
    ano: row.ano || period.ano,
    competencia: competenciaDisplay,
    quinzena: quinzenaDisplay,
    quinzenaRef: row.quinzenaRef || row.quinzena_ref || getPnrQuinzenaRef(period),
    periodoLabel: row.periodoLabel || row.periodo_label || getPnrPeriodLabel(period),
    monthKey: row.monthKey || row.month_key || period.monthKey,
    file_category: DEVIATION_PNR_FILE_CATEGORY,
    tipo_registro: DEVIATION_PNR_FILE_CATEGORY,
    arquivo_origem: row.arquivo_origem || row.file_name || "",
  };
  normalized.dedupeKey = row.dedupeKey || row.dedupe_key || getPnrDedupeKey(normalized);
  normalized.valorCompraFormatado = currency.format(normalized.valorCompraNumerico || 0);
  normalized._search = buildPnrSearchText(normalized);
  return normalized;
}

function workbookLooksLikePnr(workbook) {
  return workbook?.SheetNames?.some((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
    return matrix.slice(0, 12).some((row) => {
      const headers = (row || []).map(normalizePnrHeader);
      return headers.includes("ID DO CASO") && headers.includes("DATA DO CASO") && headers.includes("ID DE ENVIO");
    });
  });
}

function isPnrMasterFileName(fileName = "") {
  const normalized = normalizeText(fileName);
  return (
    normalized.includes("MESTRE") ||
    normalized.includes("ARQUIVO MESTRE") ||
    normalized.includes("HISTORICO DE PNRS") ||
    normalized.includes("HISTORICO PNR") ||
    normalized.includes("BASE PNR") ||
    normalized.includes("PNRS HISTORICO") ||
    normalized.includes("PNR HISTORICO")
  );
}

function getPnrCalculatedHeaderSet() {
  return new Set(PNR_CALCULATED_HEADERS.map(normalizePnrHeader));
}

function getPnrSourceHeaders() {
  const calculatedHeaders = getPnrCalculatedHeaderSet();
  return PNR_STANDARD_HEADERS.filter((header) => !calculatedHeaders.has(normalizePnrHeader(header)));
}

function hasPnrCalculatedHeaders(headers = []) {
  const normalizedHeaders = new Set((Array.isArray(headers) ? headers : []).map(normalizePnrHeader).filter(Boolean));
  return PNR_CALCULATED_HEADERS.every((header) => normalizedHeaders.has(normalizePnrHeader(header)));
}

function validatePnrSourceHeaders(headers = [], options = {}) {
  const normalizedHeaders = new Set((Array.isArray(headers) ? headers : []).map(normalizePnrHeader).filter(Boolean));
  const missing = getPnrSourceHeaders().filter((header) => !normalizedHeaders.has(normalizePnrHeader(header)));
  if (missing.length) {
    const label = options.isMaster ? "Arquivo mestre inválido" : "Arquivo PNR inválido";
    throw new Error(`${label}. A coluna ${missing[0]} não foi encontrada.`);
  }
}

function isPnrSummaryRow(rowObject) {
  const values = Object.values(rowObject || {}).map(normalizeText).filter(Boolean);
  return values.some((text) =>
    text === "TOTAL" ||
      text === "TOTAIS" ||
      text === "TOTAL GERAL" ||
      text === "SUBTOTAL" ||
      text === "SOMA" ||
      text === "SOMATORIA" ||
      text === "RESUMO" ||
      text.startsWith("TOTAL ") ||
      text.startsWith("SUBTOTAL ") ||
      text.startsWith("SOMA ") ||
      text.includes("VALOR TOTAL"),
  );
}

function normalizePnrWorkbook(workbook, fileName = "") {
  const records = [];
  let skipped = 0;
  const fileNameLooksMaster = isPnrMasterFileName(fileName);
  let detectedMasterFile = fileNameLooksMaster;
  const filePeriod = getPnrPeriodFromBillingPeriod(fileName);
  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: null });
    const headerIndex = matrix.findIndex((row) => (row || []).map(normalizePnrHeader).includes("ID DO CASO"));
    if (headerIndex < 0) return;
    const rawHeaders = matrix[headerIndex] || [];
    const sheetHasCalculatedColumns = hasPnrCalculatedHeaders(rawHeaders);
    const sheetIsMaster = fileNameLooksMaster || sheetHasCalculatedColumns;
    validatePnrSourceHeaders(rawHeaders, { isMaster: sheetIsMaster });
    if (sheetIsMaster) detectedMasterFile = true;
    const headers = rawHeaders.map(normalizePnrHeader);
    matrix.slice(headerIndex + 1).forEach((row) => {
      if (!row || row.every((cell) => cell === null || cell === "")) return;
      const rowObject = {};
      headers.forEach((header, index) => {
        if (header) rowObject[header] = row[index];
      });
      if (isPnrSummaryRow(rowObject)) {
        skipped += 1;
        return;
      }
      const dataCaso = getPnrCell(rowObject, "DATA DO CASO");
      const periodoFaturamento = getPnrCell(rowObject, "PERIODO DE FATURAMENTO", "PERÍODO DE FATURAMENTO");
      const rowPeriod = getPnrPeriodFromBillingPeriod(periodoFaturamento);
      const period = sheetIsMaster
        ? rowPeriod || filePeriod || getPnrPeriodFromDate(dataCaso || periodoFaturamento || fileName)
        : filePeriod || rowPeriod || getPnrPeriodFromDate(dataCaso || periodoFaturamento || fileName);
      const resolvedBillingPeriod = sheetIsMaster
        ? periodoFaturamento || buildPnrBillingPeriodFromPeriod(period)
        : buildPnrBillingPeriodFromPeriod(filePeriod || period) || periodoFaturamento;
      const mesValue = sheetHasCalculatedColumns ? getPnrCell(rowObject, "MES", "MÊS") : "";
      const quinzenaRefValue = sheetHasCalculatedColumns ? getPnrCell(rowObject, "QUINZENA REF", "QUINZENA REF.") : "";
      const valCompraValue = sheetHasCalculatedColumns ? getPnrCell(rowObject, "VAL. COMPRA", "VAL COMPRA") : "";
      const normalized = normalizePnrStoredRow({
        idCaso: getPnrCell(rowObject, "ID DO CASO"),
        dataCaso,
        tipo: getPnrCell(rowObject, "TIPO"),
        statusOriginal: getPnrCell(rowObject, "STATUS"),
        periodoFaturamento: resolvedBillingPeriod,
        dataPedidoRevisao: getPnrCell(rowObject, "DATA DO PEDIDO DE REVISAO", "DATA DO PEDIDO DE REVISÃO"),
        pedidoRevisao: getPnrCell(rowObject, "PEDIDO DE REVISAO", "PEDIDO DE REVISÃO"),
        dataEncerramentoCaso: getPnrCell(rowObject, "DATA DE ENCERRAMENTO DO CASO"),
        repAssistente: getPnrCell(rowObject, "REP - ASSISTENTE", "REP ASSISTENTE"),
        comentarioEncerramento: getPnrCell(rowObject, "COMENTARIO DE ENCERRAMENTO", "COMENTÁRIO DE ENCERRAMENTO"),
        numeroPreFatura: getPnrCell(rowObject, "Nº DA PRE-FATURA", "N DA PRE-FATURA", "N DA PRÉ-FATURA", "Nº DA PRÉ-FATURA"),
        idEnvio: getPnrCell(rowObject, "ID DE ENVIO", "ID ENVIO", "ENVIO", "SHIPMENT ID", "SHIPMENT_ID"),
        produtos: getPnrCell(rowObject, "PRODUTOS", "PRODUTO", "PRODUCTS", "PRODUCT"),
        valorCompraOriginal: getPnrCell(rowObject, "VALOR DA COMPRA", "VALOR COMPRA", "VALOR DO PRODUTO", "VALOR PRODUTO", "VALOR"),
        valorCompraNumerico: valCompraValue || getPnrCell(rowObject, "VAL. COMPRA", "VAL COMPRA", "VALOR DA COMPRA", "VALOR COMPRA", "VALOR DO PRODUTO", "VALOR PRODUTO", "VALOR"),
        repTransportadora: getPnrCell(rowObject, "REP TRANSPORTADORA"),
        idTransportadora: getPnrCell(rowObject, "ID DA TRANSPORTADORA"),
        transportadora: getPnrCell(rowObject, "TRANSPORTADORA"),
        estacaoOrigem: getPnrCell(rowObject, "ESTACAO DE ORIGEM", "ESTAÇÃO DE ORIGEM", "ESTACAO ORIGEM", "ESTAÇÃO ORIGEM", "ORIGEM", "ORIGIN STATION", "STATION"),
        idRota: getPnrCell(rowObject, "ID DA ROTA", "ID ROTA", "ROTA", "ROUTE ID", "ROUTE_ID"),
        idMotorista: getPnrCell(rowObject, "ID DO MOTORISTA", "ID MOTORISTA", "MOTORISTA", "DRIVER ID", "DRIVER_ID"),
        nomeMotorista: getPnrCell(rowObject, "NOME DO MOTORISTA", "NOME MOTORISTA", "MOTORISTA NOME", "DRIVER NAME"),
        dataEntrega: getPnrCell(rowObject, "DATA DE ENTREGA", "DATA ENTREGA", "DELIVERY DATE"),
        idReclamacao: getPnrCell(rowObject, "ID DA RECLAMACAO", "ID DA RECLAMAÇÃO", "ID RECLAMACAO", "ID RECLAMAÇÃO", "RECLAMACAO", "RECLAMAÇÃO", "CLAIM ID", "CLAIM_ID"),
        dataReclamacao: getPnrCell(rowObject, "DATA DA RECLAMACAO", "DATA DA RECLAMAÇÃO", "DATA RECLAMACAO", "DATA RECLAMAÇÃO", "CLAIM DATE"),
        competencia: getPnrMonthFullLabel(period),
        mes: mesValue || period.mes,
        ano: period.ano,
        quinzena: getPnrQuinzenaDisplay(period),
        quinzenaRef: quinzenaRefValue || getPnrQuinzenaRef(period),
        periodoLabel: getPnrPeriodLabel(period),
        sourceFileName: fileName,
        sourcePeriodo: resolvedBillingPeriod,
        arquivo_origem: fileName,
      });
      if (!normalized.idCaso && !normalized.idEnvio && !normalized.idReclamacao) {
        skipped += 1;
        return;
      }
      records.push(normalized);
    });
  });
  const deduped = dedupePnrRecords(records);
  const years = deduped.rows
    .map((row) => Number(row.ano || String(row.monthKey || "").slice(0, 4)))
    .filter((year) => Number.isFinite(year) && year > 1900)
    .sort((a, b) => a - b);
  normalizePnrWorkbook.lastStats = {
    originalRows: records.length + skipped,
    consolidatedRows: deduped.rows.length,
    totalRowsSkipped: skipped,
    duplicateRowsUpdated: deduped.duplicateRowsUpdated,
    duplicateRowsSkipped: deduped.duplicateRowsSkipped,
    newRows: deduped.rows.length,
    duplicateRowsRemoved: deduped.duplicateRowsUpdated + deduped.duplicateRowsSkipped,
    isMasterFile: detectedMasterFile,
    periodStartYear: years[0] || "",
    periodEndYear: years[years.length - 1] || "",
  };
  return deduped.rows;
}

function normalizePackageManagementWorkbook(workbook, fileName = "") {
  const records = [];
  const period = identificarPeriodoGestaoPacotes(fileName);
  const ignoredSheets = [];
  let totalRowsSkipped = 0;
  workbook.SheetNames.forEach((sheetName) => {
    const sheetType = identificarAbaGestao(sheetName);
    if (!sheetType) {
      ignoredSheets.push(sheetName);
      return;
    }
    const sheet = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
    if (!matrix.length) return;
    const headerIndex = findPackageHeaderRow(matrix);
    const headers = (matrix[headerIndex] || []).map((value) => String(value || "").trim());
    const idx = {
      base: findHeaderIndex(headers, ["BASE", "SVC", "ESTACAO", "ESTAÇÃO", "UNIDADE"]),
      motorista: findHeaderIndex(headers, ["MOTORISTA", "DRIVER", "NOME MOTORISTA", "NOME DO MOTORISTA"]),
      valor: findHeaderIndex(headers, ["VALOR", "VALOR DESCONTO", "DESCONTO"]),
      data: findHeaderIndex(headers, ["DATA", "DATA DA ROTA"]),
      rota: findHeaderIndex(headers, ["ROTA", "N ROTA", "Nº ROTA", "NRO ROTA", "NUMERO ROTA", "NÚMERO ROTA"]),
      id: findHeaderIndex(headers, ["ID CASO", "ID", "ID DO PACOTE", "ID PACOTE", "CASO"]),
      evidencia1: findHeaderIndex(headers, ["EVIDENCIA 1", "EVIDÊNCIA 1", "EVIDENCIA", "EVIDÊNCIA"]),
      evidencia2: findHeaderIndex(headers, ["EVIDENCIA 2", "EVIDÊNCIA 2"]),
      canal: findHeaderIndex(headers, ["CANAL"]),
    };
    for (let i = headerIndex + 1; i < matrix.length; i += 1) {
      const row = matrix[i];
      if (!row || row.every((cell) => cell == null || String(cell).trim() === "")) continue;
      if (isPackageTotalRow(row)) {
        totalRowsSkipped += 1;
        continue;
      }
      const decision = findDecisionInfo(headers, row, sheetType);
      const valor = readCell(row, idx.valor);
      const base = readCell(row, idx.base);
      const motorista = readCell(row, idx.motorista);
      const dataValue = readCell(row, idx.data);
      const rota = readCell(row, idx.rota);
      const id = readCell(row, idx.id);
      if (!hasPackageRecordMinimum({ valor, base, motorista, dataValue, rota, id, decision })) continue;
      const parsedDate = parseDateValue(dataValue);
      const category = decision.category;
      const normalized = {
        file_category: PACKAGE_MANAGEMENT_FILE_CATEGORY,
        aba_origem: PACKAGE_MANAGEMENT_VIEW,
        divisao: PACKAGE_MANAGEMENT_VIEW,
        aba_gestao: sheetType,
        aba_gestao_label: sheetName,
        tipo_registro: "GESTAO_PACOTES",
        tipo_desconto: PACKAGE_CATEGORY_LABELS[category] || "Indefinido",
        categoria_final: category,
        categoria_label: PACKAGE_CATEGORY_LABELS[category] || "Indefinido",
        base: base || "",
        base_normalizada: normalizeBase(base),
        motorista: formatDriverName(motorista, ""),
        driver: formatDriverName(motorista, ""),
        valor_numerico: normalizarValorGestao(valor),
        data_normalizada: parsedDate.iso,
        data_sort: parsedDate.ts,
        n_rota: formatId(rota),
        id_caso: formatId(id),
        id_pacote: formatId(id),
        evidencia_1: readCell(row, idx.evidencia1),
        evidencia_2: readCell(row, idx.evidencia2),
        canal: readCell(row, idx.canal),
        decisao_adm: decision.value || "",
        mes: period.mes || "",
        ano: period.ano || "",
        quinzena: period.quinzena || "",
        competencia: period.competencia || "",
        reference_month: getMonthNumberFromAny(period.mes),
        reference_year: period.ano || "",
        period_type: getPeriodModeFromLabel(period.quinzena),
        arquivo_origem: fileName,
        ocorrencias: 1,
      };
      if (!isPackageManagementDetailRow(normalized)) {
        totalRowsSkipped += 1;
        continue;
      }
      normalized._search = buildPackageManagementSearchText(normalized);
      records.push(normalized);
    }
  });
  normalizePackageManagementWorkbook.lastStats = { originalRows: records.length + totalRowsSkipped, consolidatedRows: records.length, duplicatesSkipped: 0, ignoredSheets, totalRowsSkipped };
  return records;
}

function normalizePackageManagementStoredRow(row) {
  if (!row || typeof row !== "object") return null;
  const existingCategory = row.categoria_final || row.categoria || "";
  const decisionCategory = classifyPackageDecision(row.decisao_adm, row.aba_gestao);
  const category = decisionCategory && decisionCategory !== "INDEFINIDO" ? decisionCategory : existingCategory || "INDEFINIDO";
  const normalized = {
    ...row,
    file_category: PACKAGE_MANAGEMENT_FILE_CATEGORY,
    aba_origem: PACKAGE_MANAGEMENT_VIEW,
    divisao: PACKAGE_MANAGEMENT_VIEW,
    tipo_registro: "GESTAO_PACOTES",
    tipo_desconto: PACKAGE_CATEGORY_LABELS[category] || row.tipo_desconto || "Indefinido",
    categoria_final: category,
    categoria_label: PACKAGE_CATEGORY_LABELS[category] || row.categoria_label || "Indefinido",
    base_normalizada: normalizeBase(row.base || row.base_normalizada),
    motorista: formatDriverName(row.motorista || row.driver || "", ""),
    driver: formatDriverName(row.driver || row.motorista || "", ""),
    valor_numerico: normalizarValorGestao(row.valor_numerico !== undefined && row.valor_numerico !== null && row.valor_numerico !== "" ? row.valor_numerico : row.valor),
    id_pacote: row.id_pacote || row.id_caso || row.id || "",
    reference_month: row.reference_month || getMonthNumberFromAny(row.mes || row.competencia || row.arquivo_origem),
    reference_year: row.reference_year || normalizeReferenceYear(row.ano || detectYear(`${row.competencia || ""} ${row.arquivo_origem || ""}`)),
    period_type: row.period_type || getPeriodModeFromLabel(`${row.quinzena || ""} ${row.arquivo_origem || ""}`),
    ocorrencias: 1,
  };
  if (!isPackageManagementDetailRow(normalized)) return null;
  normalized._search = buildPackageManagementSearchText(normalized);
  return normalized;
}

function buildPackageManagementSearchText(row) {
  return normalize([
    row.competencia, row.quinzena, row.categoria_label, row.categoria_final, row.base, row.base_normalizada, row.motorista,
    row.n_rota, row.id_caso, row.id_pacote, row.decisao_adm, row.aba_gestao_label, row.arquivo_origem, row.canal,
  ].filter(Boolean).join(" "));
}

function normalizeWorkbook(workbook) {
  const records = [];

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
      const baseParts = splitBase(base);

      const normalized = {
        aba_origem: canonicalSheet,
        divisao: canonicalSheet,
        tipo_desconto: tipoDesc,
        base,
        cidade_base: baseParts.cidade_base,
        sigla_base: baseParts.sigla_base,
        base_normalizada: normalizeBase(base),
        motorista: formatDriverName(motorista, ""),
        placa: placa || "",
        descricao: descricao || "",
        data_normalizada: parsedDate.iso,
        data_sort: parsedDate.ts,
        id_pacote: formatId(idPacote),
        n_rota: formatId(rota),
        valor_numerico: parseMoney(valor),
      };

      normalized.tipo_registro = canonicalSheet === "PNR" ? "PNR" : "PACOTE PERDIDO";
      normalized.ids_vinculados = getLinkedPackageIds(normalized);
      normalized.quantidade_ids = normalized.ids_vinculados.length;
      normalized.linked_ids_count = normalized.ids_vinculados.length;
      normalized.ocorrencias = 1;
      normalized._search = buildRowSearchText(normalized);
      records.push(normalized);
    }
  });

  const consolidated = consolidateLinkedOccurrences(records);
  normalizeWorkbook.lastStats = consolidateLinkedOccurrences.lastStats;
  return consolidated;
}

async function handleUpload(event) {
  const files = Array.from((event.target && event.target.files) || []);
  if (!files.length) return;
  if (!ensureUploadPermission()) {
    event.target.value = "";
    return;
  }

  const failures = [];
  let successCount = 0;
  try {
    for (const file of files) {
      try {
        await uploadDashboardFile(file);
        successCount += 1;
      } catch (error) {
        console.error("[UPLOAD] Falha ao processar arquivo:", file?.name, error);
        failures.push({ file, error });
      }
    }

    if (successCount) {
      showToast(successCount === 1 ? "Arquivo salvo e carregado com sucesso." : `${successCount} arquivos salvos no Supabase.`, "good", 5200);
    }
    if (failures.length) {
      const firstError = failures[0].error?.message || "Nao foi possivel salvar esse Excel.";
      showToast(failures.length === files.length ? firstError : `${failures.length} arquivo(s) falharam. Os demais foram carregados.`, "error", 7200);
    }
  } finally {
    dashboardFilesLoading = false;
    if (dashboardVisualState === "processing-file" || dashboardVisualState === "loading-files") setDashboardVisualState("", { render: false });
    updateDatasetMeta();
    event.target.value = "";
  }
}

function arrayBufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function calculateSha256FromBuffer(buffer) {
  if (!window.crypto?.subtle?.digest) {
    throw new Error("Não foi possível calcular o hash do arquivo neste navegador.");
  }
  const digest = await window.crypto.subtle.digest("SHA-256", buffer);
  return arrayBufferToHex(digest);
}

function buildUploadPeriodMetadata({ file, previewDataset, referenceYear, referenceMonth, periodLabel, periodType, packagePeriod, displayName, fileHash, previewStats }) {
  const firstRow = previewDataset.rows?.[0] || {};
  const monthAbbr = packagePeriod?.mes || firstRow.competencia?.split("/")?.[0] || capitalize((getMonthAbbr(referenceMonth) || "").toLowerCase());
  const year = packagePeriod?.ano || firstRow.ano || referenceYear || "";
  const competencia = packagePeriod?.competencia || firstRow.competencia || (monthAbbr && year ? `${monthAbbr}/${String(year).slice(-2)}` : "");
  const quinzena = packagePeriod?.quinzena || firstRow.quinzena || periodLabel;
  return {
    parsed_rows: previewDataset.rows.length,
    period_label: periodLabel,
    period_type: periodType,
    file_category: previewDataset.fileCategory,
    semantic_file_type: previewDataset.fileCategory,
    file_type: previewDataset.fileCategory,
    mime_type: file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    original_name: file.name,
    display_name: displayName,
    competencia,
    quinzena,
    mes: monthAbbr || "",
    ano: year || "",
    reference_month: referenceMonth || "",
    reference_year: referenceYear || "",
    file_hash: fileHash,
    size_bytes: file.size,
    uploaded_at: new Date().toISOString(),
    sync_source: "manual-upload",
    original_rows: previewStats.originalRows || previewDataset.rows.length,
    consolidated_rows: previewStats.consolidatedRows || previewDataset.rows.length,
    duplicatesSkipped: previewStats.duplicatesSkipped || 0,
    duplicate_rows_skipped: previewStats.duplicateRowsSkipped || 0,
    duplicate_rows_updated: previewStats.duplicateRowsUpdated || 0,
    duplicate_rows_removed: previewStats.duplicateRowsRemoved || 0,
    pnr_master_file: previewStats.isMasterFile === true,
    period_start_year: previewStats.periodStartYear || "",
    period_end_year: previewStats.periodEndYear || "",
    linked_occurrences: previewStats.linkedOccurrences || 0,
    linked_ids_count: previewStats.linkedIds || 0,
    total_rows_skipped: previewStats.totalRowsSkipped || 0,
  };
}

async function findDashboardFileByHash(fileCategory, fileHash) {
  if (!window.supabaseClient || !fileHash) return null;
  const { data, error } = await window.supabaseClient
    .from("dashboard_files")
    .select("*")
    .eq("file_type", fileCategory)
    .contains("metadata", { file_hash: fileHash })
    .limit(1);

  if (error) throw error;
  return Array.isArray(data) && data.length ? data[0] : null;
}

async function findDashboardFilesByUploadMetadata(fileCategory, fileName, metadata) {
  if (!window.supabaseClient) return [];
  const { data, error } = await window.supabaseClient
    .from("dashboard_files")
    .select("id,file_name,storage_path,file_type,is_active,status,reference_month,reference_year,period_label,period_type,metadata")
    .eq("file_type", fileCategory)
    .eq("file_name", fileName)
    .contains("metadata", {
      original_name: fileName,
      competencia: metadata.competencia,
      quinzena: metadata.quinzena,
    });

  if (error) throw error;
  if (Array.isArray(data) && data.length) return data;

  const { data: fallbackData, error: fallbackError } = await window.supabaseClient
    .from("dashboard_files")
    .select("id,file_name,storage_path,file_type,is_active,status,reference_month,reference_year,period_label,period_type,metadata")
    .eq("file_type", fileCategory)
    .eq("file_name", fileName);

  if (fallbackError) throw fallbackError;
  const targetKey = metadata.reference_year && metadata.reference_month ? `${metadata.reference_year}-${metadata.reference_month}` : "";
  return (Array.isArray(fallbackData) ? fallbackData : []).filter((record) => {
    if (!targetKey) return true;
    const period = getFileRecordPeriod(record);
    return period.key === targetKey && period.periodType === normalizePeriodMode(metadata.period_type);
  });
}

async function deactivateDashboardFileRecords(records, exceptId = "") {
  const ids = (Array.isArray(records) ? records : [])
    .map((record) => record?.id)
    .filter((id) => id && id !== exceptId);
  if (!ids.length) return;
  const { error } = await window.supabaseClient
    .from("dashboard_files")
    .update({
      is_active: false,
      status: "superseded",
      updated_at: new Date().toISOString(),
    })
    .in("id", ids);
  if (error) throw error;
}

function removeDashboardFileRecordsFromMemory(records, exceptId = "") {
  const ids = new Set((Array.isArray(records) ? records : []).map((record) => record?.id).filter((id) => id && id !== exceptId));
  if (!ids.size) return;
  dashboardFileRecords = dashboardFileRecords.filter((record) => !ids.has(record.id));
  library.datasets = (Array.isArray(library.datasets) ? library.datasets : []).filter((dataset) => !ids.has(dataset.id));
  packageManagementRowsLoadedKey = "";
  pnrRowsLoadedKey = "";
  pnrRows = [];
  resetDerivedDataCache();
}

async function deactivateOtherPreFaturaRecords(activeRecordId) {
  if (!activeRecordId) return;
  const { error } = await window.supabaseClient
    .from("dashboard_files")
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq("file_type", PRE_FATURA_FILE_CATEGORY)
    .eq("is_active", true)
    .neq("id", activeRecordId);
  if (error) throw error;
}

async function updateDuplicateDashboardFileRecord(record, uploadMetadata, previewDataset) {
  const fileCategory = getFileRecordCategory(record);
  const nextMetadata = {
    ...(record.metadata || {}),
    ...uploadMetadata,
    sync_source: record.metadata?.sync_source || uploadMetadata.sync_source,
  };
  const shouldActivate = fileCategory === PRE_FATURA_FILE_CATEGORY;
  const payload = {
    file_type: fileCategory,
    file_size: uploadMetadata.size_bytes || record.file_size || null,
    reference_month: uploadMetadata.reference_month || record.reference_month || "",
    reference_year: uploadMetadata.reference_year || record.reference_year || "",
    period_label: uploadMetadata.period_label || record.period_label || "",
    period_type: uploadMetadata.period_type || record.period_type || "",
    status: "loaded",
    metadata: nextMetadata,
    updated_at: new Date().toISOString(),
  };
  if (shouldActivate) payload.is_active = true;

  const { data, error } = await window.supabaseClient
    .from("dashboard_files")
    .update(payload)
    .eq("id", record.id)
    .select()
    .single();

  if (error) throw error;
  if (shouldActivate) await deactivateOtherPreFaturaRecords(data.id);
  const processedSaveResult = await saveProcessedRowsForFile(data, previewDataset.rows);
  mergeUploadedDatasetIntoMemory(data, previewDataset);
  return data;
}

async function processDashboardFile(file, fileRecord = null, options = {}) {
  const engineReady = await loadWorkbookEngine();
  if (!engineReady || !window.XLSX || typeof window.XLSX.read !== "function") {
    throw new Error("Não foi possível ler o Excel porque o parser local não carregou.");
  }

  const buffer = await withTimeout(
    file.arrayBuffer(),
    XLSX_PROCESS_TIMEOUT_MS,
    "Tempo limite excedido ao ler o arquivo Excel.",
  );
  let workbook;
  try {
    workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  } catch (error) {
    if (/\.xltx$/i.test(file?.name || fileRecord?.file_name || "")) {
      throw new Error("Converta o arquivo para .xlsx padrão e tente novamente.");
    }
    throw error;
  }
  const fileHash = options.calculateHash ? await calculateSha256FromBuffer(buffer) : fileRecord?.metadata?.file_hash || "";
  const fileName = fileRecord?.file_name || file.name;
  let fileCategory = getFileRecordCategory(fileRecord || { file_name: fileName });
  if (fileCategory === PRE_FATURA_FILE_CATEGORY && workbookLooksLikePnr(workbook)) {
    fileCategory = DEVIATION_PNR_FILE_CATEGORY;
  }
  const rows = fileCategory === DEVIATION_PNR_FILE_CATEGORY
    ? normalizePnrWorkbook(workbook, fileName)
    : fileCategory === PACKAGE_MANAGEMENT_FILE_CATEGORY
      ? normalizePackageManagementWorkbook(workbook, fileName)
      : normalizeWorkbook(workbook);
  return {
    id: fileRecord?.id || makeDatasetId(file.name),
    fileName,
    label: getDashboardFileDisplayName({ fileName, fileCategory }),
    fileCategory,
    source: fileRecord ? "supabase" : "upload",
    importedAt: fileRecord?.created_at || new Date().toISOString(),
    remoteRecord: fileRecord,
    storagePath: fileRecord?.storage_path || "",
    fileHash,
    rows,
  };
}

function getWorkbookStatsForCategory(fileCategory) {
  if (fileCategory === DEVIATION_PNR_FILE_CATEGORY) return normalizePnrWorkbook.lastStats || {};
  if (fileCategory === PACKAGE_MANAGEMENT_FILE_CATEGORY) return normalizePackageManagementWorkbook.lastStats || {};
  return normalizeWorkbook.lastStats || {};
}

function applyUploadedFileState(previewDataset, uploadedPeriod) {
  if (previewDataset.fileCategory === DEVIATION_PNR_FILE_CATEGORY) {
    const pnrKey = previewDataset.rows?.[0]?.monthKey || uploadedPeriod?.key || "";
    state.sheet = DEVIATION_MANAGEMENT_VIEW;
    state.activeDesvioCategory = DEVIATION_CATEGORY_PNRS;
    state.pnrMonths = pnrKey ? [pnrKey] : [];
    state.pnrQuinzena = "all";
    state.pnrStatus = "Todos";
    state.pnrTipoOperacional = "Todos";
    state.pnrEstacao = "Todos";
    return;
  }
  state.sheet = previewDataset.fileCategory === PACKAGE_MANAGEMENT_FILE_CATEGORY ? PACKAGE_MANAGEMENT_VIEW : PRE_FATURA_VIEW;
  if (previewDataset.fileCategory === PRE_FATURA_FILE_CATEGORY) {
    state.monthFilter = uploadedPeriod.key;
    state.period = uploadedPeriod.periodType;
    state.prefaturaMonths = [uploadedPeriod.key];
    state.prefaturaPeriod = uploadedPeriod.periodType;
  } else {
    const packageKey = getPackageManagementMonthKey(previewDataset.rows?.[0] || {});
    if (packageKey) state.packageMonths = [packageKey];
    state.packagePeriod = getPackageManagementPeriodType(previewDataset.rows?.[0] || {}) || "month";
  }
}

async function uploadDashboardFile(file) {
  const permissions = getActionPermissions();

  if (!permissions.canUploadFile) {
    showToast(permissions.isLoggedIn ? "Apenas administradores podem realizar esta ação." : "Faça login para acessar esta função.", "warn", 5200);
    if (permissions.isLoggedIn) showPermissionDeniedState();
    return;
  }
  if (!window.supabaseClient || !currentUser) {
    showToast("Faça login para acessar esta função.", "warn", 5200);
    return;
  }

  dashboardFilesLoading = true;
  setDashboardVisualState("processing-file");
  updateDatasetMeta();
  const previewDataset = await processDashboardFile(file, null, { calculateHash: true });
  const previewStats = getWorkbookStatsForCategory(previewDataset.fileCategory);
  if (!previewDataset.rows.length) {
    dashboardFilesLoading = false;
    setDashboardVisualState("");
    updateDatasetMeta();
    throw new Error("O arquivo não possui registros válidos para carregar.");
  }
  const period = getDatasetPeriod(previewDataset);
  const [referenceYear, referenceMonth] = String(period.key || "").split("-");
  const periodType = getDatasetQuarterMode(previewDataset);
  const periodLabel = getPeriodModeLabel(periodType);
  const packagePeriod = previewDataset.fileCategory === PACKAGE_MANAGEMENT_FILE_CATEGORY
    ? identificarPeriodoGestaoPacotes(file.name)
    : null;
  let displayName = getDashboardFileDisplayName({
    fileName: file.name,
    fileCategory: previewDataset.fileCategory,
    metadata: packagePeriod ? {
      quinzena: packagePeriod.quinzena,
      competencia: packagePeriod.competencia,
    } : {},
  });
  if (previewDataset.fileCategory === DEVIATION_PNR_FILE_CATEGORY && previewStats.isMasterFile) {
    displayName = "PNRs · Base Mestre";
  }
  const uploadMetadata = buildUploadPeriodMetadata({
    file,
    previewDataset,
    referenceYear,
    referenceMonth,
    periodLabel,
    periodType,
    packagePeriod,
    displayName,
    fileHash: previewDataset.fileHash,
    previewStats,
  });
  let uploadFile = file;
  if (previewDataset.fileCategory === DEVIATION_PNR_FILE_CATEGORY && !previewStats.isMasterFile) {
    uploadFile = await buildStandardizedPnrUploadFile(file, previewDataset.rows);
    uploadMetadata.standardized_storage = true;
    uploadMetadata.storage_file_name = uploadFile.name;
    uploadMetadata.storage_model = "Histórico de PNRs";
  } else if (previewDataset.fileCategory === DEVIATION_PNR_FILE_CATEGORY) {
    uploadMetadata.standardized_storage = false;
    uploadMetadata.storage_model = "Arquivo mestre PNRs";
  }

  const duplicatedRecord = await findDashboardFileByHash(previewDataset.fileCategory, previewDataset.fileHash);
  if (duplicatedRecord) {
    const data = await updateDuplicateDashboardFileRecord(duplicatedRecord, uploadMetadata, previewDataset);
    let previousRecords = await findDashboardFilesByUploadMetadata(previewDataset.fileCategory, file.name, uploadMetadata);
    if (previewDataset.fileCategory === DEVIATION_PNR_FILE_CATEGORY && previewStats.isMasterFile) {
      const previousMasterRecords = dashboardFileRecords
        .filter(isUsableDashboardFileRecord)
        .filter((record) => getFileRecordCategory(record) === DEVIATION_PNR_FILE_CATEGORY && record.metadata?.pnr_master_file === true);
      previousRecords = [...new Map([...previousRecords, ...previousMasterRecords].map((record) => [record.id, record])).values()];
    }
    if (previousRecords.length) {
      await deactivateDashboardFileRecords(previousRecords, data.id);
      removeDashboardFileRecordsFromMemory(previousRecords, data.id);
    }
    const uploadedPeriod = getFileRecordPeriod(data);
    applyUploadedFileState(previewDataset, uploadedPeriod);
    persistState();
    setDashboardVisualState("", { render: false });
    hydrateControls();
    renderAll();
    setDashboardVisualState("");
    await logAudit("deduplicate_upload_file", "dashboard_file", data.id, {
      file_name: data.file_name,
      reference_month: data.reference_month,
      reference_year: data.reference_year,
      period_label: data.period_label,
      file_hash: previewDataset.fileHash,
    });
    showToast("Arquivo já existia no painel. Os metadados foram atualizados sem duplicar.", "info", 5200);
    return;
  }

  let previousRecords = await findDashboardFilesByUploadMetadata(previewDataset.fileCategory, file.name, uploadMetadata);
  if (previewDataset.fileCategory === DEVIATION_PNR_FILE_CATEGORY && previewStats.isMasterFile) {
    const previousMasterRecords = dashboardFileRecords
      .filter(isUsableDashboardFileRecord)
      .filter((record) => getFileRecordCategory(record) === DEVIATION_PNR_FILE_CATEGORY && record.metadata?.pnr_master_file === true);
    previousRecords = [...new Map([...previousRecords, ...previousMasterRecords].map((record) => [record.id, record])).values()];
  }
  const safeName = uploadFile.name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w.-]+/g, "_");
  const storageFolder = previewDataset.fileCategory === DEVIATION_PNR_FILE_CATEGORY
    ? "gestao-desvios/pnrs"
    : previewDataset.fileCategory === PACKAGE_MANAGEMENT_FILE_CATEGORY
      ? "gestao-pacotes"
      : "pre-fatura";
  const storagePath = `${storageFolder}/${referenceYear || "sem-ano"}/${referenceMonth || "sem-mes"}/${Date.now()}_${safeName}`;

  const { error: uploadError } = await window.supabaseClient.storage
    .from("dashboard-files")
    .upload(storagePath, uploadFile, {
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadError) {
    console.error("Erro no upload:", uploadError);
    throw new Error("Erro ao salvar arquivo no Supabase Storage.");
  }

  const { data, error } = await window.supabaseClient
    .from("dashboard_files")
    .insert({
      file_name: file.name,
      storage_path: storagePath,
      file_type: previewDataset.fileCategory,
      file_size: uploadFile.size,
      uploaded_by: currentUser.id,
      uploaded_by_email: currentUser.email,
      reference_month: referenceMonth || "",
      reference_year: referenceYear || "",
      period_label: periodLabel,
      period_type: periodType,
      is_active: previewDataset.fileCategory === PRE_FATURA_FILE_CATEGORY,
      status: "loaded",
      metadata: uploadMetadata,
    })
    .select()
    .single();

  if (error) {
    console.error("Erro ao salvar metadados:", error);
    await window.supabaseClient.storage.from("dashboard-files").remove([storagePath]);
    throw new Error("Arquivo enviado, mas houve erro ao salvar o registro.");
  }

  if (previousRecords.length) {
    await deactivateDashboardFileRecords(previousRecords, data.id);
    removeDashboardFileRecordsFromMemory(previousRecords, data.id);
  }
  if (previewDataset.fileCategory === PRE_FATURA_FILE_CATEGORY) {
    await deactivateOtherPreFaturaRecords(data.id);
  }
  const processedSaveResult = await saveProcessedRowsForFile(data, previewDataset.rows);

  const uploadedPeriod = getFileRecordPeriod(data);
  applyUploadedFileState(previewDataset, uploadedPeriod);
  persistState();
  mergeUploadedDatasetIntoMemory(data, previewDataset);
  setDashboardVisualState("", { render: false });
  hydrateControls();
  renderAll();
  setDashboardVisualState("");
  await logAudit("upload_file", "dashboard_file", data.id, {
    file_name: data.file_name,
    reference_month: data.reference_month,
    reference_year: data.reference_year,
    period_label: data.period_label,
    parsed_rows: data.metadata?.parsed_rows,
    linked_occurrences: data.metadata?.linked_occurrences || 0,
    linked_ids_count: data.metadata?.linked_ids_count || 0,
  });
  if (previewDataset.fileCategory === DEVIATION_PNR_FILE_CATEGORY) {
    const stats = getWorkbookStatsForCategory(DEVIATION_PNR_FILE_CATEGORY);
    const inserted = processedSaveResult?.inserted ?? stats.newRows ?? previewDataset.rows.length;
    const updated = processedSaveResult?.updated ?? stats.duplicateRowsUpdated ?? 0;
    const ignored = processedSaveResult?.ignored ?? stats.duplicateRowsSkipped ?? 0;
    if (stats.isMasterFile) {
      const removed = stats.duplicateRowsRemoved ?? (stats.duplicateRowsSkipped || 0) + (stats.duplicateRowsUpdated || 0);
      const periodText = stats.periodStartYear && stats.periodEndYear
        ? `${stats.periodStartYear} até ${stats.periodEndYear}`
        : "não identificado";
      showToast(`Arquivo mestre processado. Registros lidos: ${integer.format(stats.originalRows || previewDataset.rows.length)}. Registros importados: ${integer.format(previewDataset.rows.length)}. Duplicados removidos: ${integer.format(removed)}. Registros atualizados: ${integer.format(updated)}. Período identificado: ${periodText}.`, removed ? "warn" : "good", 9000);
    } else {
      showToast(`Arquivo processado. Registros novos: ${inserted}. Registros atualizados: ${updated}. Duplicados ignorados: ${ignored}.`, "good", 7200);
    }
  }
}

function mergeUploadedDatasetIntoMemory(fileRecord, previewDataset) {
  if (!fileRecord || !previewDataset) return;
  const fileCategory = getFileRecordCategory(fileRecord);
  const normalizedRecord = {
    ...fileRecord,
    file_type: fileCategory,
    metadata: {
      ...(fileRecord.metadata || {}),
      file_category: fileCategory,
      semantic_file_type: fileCategory,
      file_type: fileCategory,
    },
  };
  if (fileCategory === PRE_FATURA_FILE_CATEGORY) {
    dashboardFileRecords = dashboardFileRecords.map((record) =>
      getFileRecordCategory(record) === PRE_FATURA_FILE_CATEGORY
        ? { ...record, is_active: false }
        : record,
    );
    library.datasets = (Array.isArray(library.datasets) ? library.datasets : []).map((dataset) =>
      getFileRecordCategory(dataset.remoteRecord || dataset) === PRE_FATURA_FILE_CATEGORY
        ? { ...dataset, remoteRecord: { ...(dataset.remoteRecord || {}), is_active: false } }
        : dataset,
    );
    currentActiveFile = normalizedRecord;
  }

  dashboardFileRecords = [
    normalizedRecord,
    ...dashboardFileRecords.filter((record) => record.id !== normalizedRecord.id),
  ].filter(isUsableDashboardFileRecord);

  const dataset = normalizeDatasetRecord({
    ...previewDataset,
    id: normalizedRecord.id,
    fileName: normalizedRecord.file_name,
    label: getDashboardFileDisplayName(normalizedRecord),
    source: "supabase",
    importedAt: normalizedRecord.created_at,
    remoteRecord: normalizedRecord,
    storagePath: normalizedRecord.storage_path,
    rows: previewDataset.rows,
  });
  if (!dataset) return;
  upsertDataset(dataset);
  if (fileCategory === PRE_FATURA_FILE_CATEGORY) {
    library.activeDatasetId = dataset.id;
    state.activeDatasetId = dataset.id;
  }
  rebuildPackageManagementRowsFromLibrary();
  rebuildPnrRowsFromLibrary();
  resetDerivedDataCache();
  syncActiveDataset();
  updateDatasetMeta();
}

function rebuildPackageManagementRowsFromLibrary() {
  const datasets = (Array.isArray(library.datasets) ? library.datasets : [])
    .filter((dataset) => getFileRecordCategory(dataset.remoteRecord || dataset) === PACKAGE_MANAGEMENT_FILE_CATEGORY)
    .filter((dataset) => Array.isArray(dataset.rows) && dataset.rows.length);
  packageManagementRows = datasets.flatMap((dataset) => dataset.rows.map(normalizePackageManagementStoredRow).filter(Boolean));
  const packageFiles = dashboardFileRecords
    .filter(isUsableDashboardFileRecord)
    .filter((record) => getFileRecordCategory(record) === PACKAGE_MANAGEMENT_FILE_CATEGORY);
  packageManagementRowsLoadedKey = packageFiles.map((record) => `${record.id || record.file_name}:${record.updated_at || record.metadata?.last_loaded_at || ""}`).join("|") || "__empty";
}

function rebuildPnrRowsFromLibrary() {
  const datasets = (Array.isArray(library.datasets) ? library.datasets : [])
    .filter((dataset) => getFileRecordCategory(dataset.remoteRecord || dataset) === DEVIATION_PNR_FILE_CATEGORY)
    .filter((dataset) => Array.isArray(dataset.rows) && dataset.rows.length);
  pnrRows = dedupePnrRecords(datasets.flatMap((dataset) => dataset.rows.map(normalizePnrStoredRow).filter(Boolean))).rows;
  const files = dashboardFileRecords
    .filter(isUsableDashboardFileRecord)
    .filter((record) => getFileRecordCategory(record) === DEVIATION_PNR_FILE_CATEGORY);
  pnrRowsLoadedKey = files.map((record) => `${record.id || record.file_name}:${record.updated_at || record.metadata?.last_loaded_at || ""}`).join("|") || "__empty";
}

async function loadDashboardFilesFromSupabase(options = {}) {
  const { loadActive = true, render = true, validateStorage = false, showLoading = null } = options;
  if (!window.supabaseClient || !currentUser) {
    dashboardFileRecords = [];
    clearDashboardData({ render: false, preserveRecords: false });
    return [];
  }

  dashboardFilesLoading = true;
  const shouldShowLoading = showLoading ?? (!hasInitialLoadCompleted && !hasLoadedDashboardData());
  const didSetLoadingState = shouldShowLoading && dashboardVisualState !== "processing-file";
  if (didSetLoadingState) setDashboardVisualState("loading-files");
  updateDatasetMeta();
  try {
    const { data, error } = await withTimeout(
      window.supabaseClient
        .from("dashboard_files")
        .select("*")
        .order("created_at", { ascending: false }),
      SUPABASE_QUERY_TIMEOUT_MS,
      "Tempo limite excedido ao buscar arquivos salvos.",
    );

    if (error) {
      console.error("Erro ao buscar arquivos:", error);
      showToast("Erro ao carregar arquivos salvos.", "warn", 5200);
      if (didSetLoadingState || !hasLoadedDashboardData()) setDashboardVisualState("supabase-error", { render: false });
      if (!hasLoadedDashboardData()) {
        clearDashboardData({ render: false, preserveRecords: false });
      }
      return dashboardFileRecords;
    }

    dashboardFileRecords = (Array.isArray(data) ? data : [])
      .filter(isUsableDashboardFileRecord)
      .filter(isDashboardFileActive);
    await hydrateDashboardFileMetadata(dashboardFileRecords, { inferFromFile: options.inferMissingMetadataFromFile === true });
    if (validateStorage && dashboardFileRecords.length) {
      dashboardFileRecords = await validateDashboardFileRecords(dashboardFileRecords);
    }
    if (!dashboardFileRecords.length) {
      clearDashboardData({ render: false, preserveRecords: false });
      if (didSetLoadingState) setDashboardVisualState("", { render: false });
      return [];
    }

    const preFaturaRecords = dashboardFileRecords.filter((record) => getFileRecordCategory(record) === PRE_FATURA_FILE_CATEGORY);
    const activeFile = preFaturaRecords.find((record) => record.is_active) || preFaturaRecords[0] || null;
    currentActiveFile = activeFile;

    const previousDatasets = Array.isArray(library.datasets) ? library.datasets : [];
    const datasets = dashboardFileRecords.map((record) => {
      const previous = previousDatasets.find((dataset) => dataset.id === record.id);
      return normalizeDatasetRecord({
        id: record.id,
        fileName: record.file_name,
        label: getDashboardFileDisplayName(record),
        source: "supabase",
        importedAt: record.created_at,
        remoteRecord: record,
        storagePath: record.storage_path,
        rows: previous?.rows || [],
      });
    }).filter(Boolean);

    const currentScope = activeDataset?.source === "filtered" ? activeDataset : null;
    library = {
      activeDatasetId: loadActive ? activeFile?.id || EMPTY_DATASET_ID : currentScope?.id || activeFile?.id || EMPTY_DATASET_ID,
      datasets: currentScope ? [currentScope, ...datasets] : datasets.length ? datasets : [buildEmptyDataset()],
    };
    state.activeDatasetId = library.activeDatasetId;

    if (loadActive && activeFile) {
      await loadDashboardDataByFilters({ files: dashboardFileRecords, render: false, silent: true, showLoading: shouldShowLoading });
    } else if (loadActive) {
      const cachedDatasets = new Map(
        (Array.isArray(library.datasets) ? library.datasets : [])
          .filter((dataset) => dataset?.source !== "filtered" && Array.isArray(dataset.rows) && dataset.rows.length)
          .map((dataset) => [dataset.id, dataset]),
      );
      await loadPackageManagementRowsForCards(dashboardFileRecords, cachedDatasets);
      if (shouldLoadPnrRowsForCurrentView(dashboardFileRecords)) {
        await loadPnrRowsForView(dashboardFileRecords, cachedDatasets);
      }
      activeDataset = buildEmptyDataset();
      allRows = [];
    } else {
      syncActiveDataset();
    }
    if (didSetLoadingState && dashboardVisualState !== "supabase-error") setDashboardVisualState("", { render: false });
    return dashboardFileRecords;
  } catch (error) {
    console.error("[FILES] Falha ao carregar arquivos salvos:", error);
    showToast(error.message || "Não foi possível carregar os arquivos. Tente atualizar novamente.", "error", 6200);
    if (didSetLoadingState || !hasLoadedDashboardData()) setDashboardVisualState("supabase-error", { render: false });
    return dashboardFileRecords;
  } finally {
    dashboardFilesLoading = false;
    if (render) {
      hydrateControls();
      renderAll();
    } else {
      updateDatasetMeta();
    }
  }
}

async function reloadDashboardFilesList(options = {}) {
  if (isRefreshingFilesList) return dashboardFileRecords;
  isRefreshingFilesList = true;
  try {
    return await loadDashboardFilesFromSupabase({
      loadActive: false,
      render: options.render === true,
      validateStorage: options.validateStorage === true,
      showLoading: options.showLoading === true,
    });
  } finally {
    isRefreshingFilesList = false;
  }
}

async function hydrateDashboardFileMetadata(records, options = {}) {
  if (!Array.isArray(records) || !records.length) return records;
  const inferFromFile = options.inferFromFile === true;
  const updates = [];
  for (const record of records) {
    const original = {
      reference_month: record.reference_month,
      reference_year: record.reference_year,
      period_label: record.period_label,
      period_type: record.period_type,
      metadataReferenceMonth: record.metadata?.reference_month,
      metadataReferenceYear: record.metadata?.reference_year,
      metadataPeriodLabel: record.metadata?.period_label,
      metadataPeriodType: record.metadata?.period_type,
    };
    const hadStoredPeriod = Boolean(original.period_type || original.metadataPeriodType);
    const metadataPeriodText = [
      record.metadata?.mes,
      record.metadata?.competencia,
      record.metadata?.ano,
      record.metadata?.display_name,
      record.metadata?.original_name,
    ].filter(Boolean).join(" ");
    const nameText = `${metadataPeriodText} ${record.file_name || ""} ${record.period_label || ""} ${record.metadata?.period_label || ""}`;
    let month =
      getMonthNumberFromAny(record.metadata?.mes) ||
      getMonthNumberFromAny(record.metadata?.competencia) ||
      getMonthNumberFromAny(record.metadata?.reference_month) ||
      getMonthNumberFromAny(record.reference_month) ||
      getMonthNumberFromAny(detectMonth(nameText));
    let year =
      normalizeReferenceYear(record.metadata?.ano) ||
      normalizeReferenceYear(record.metadata?.competencia) ||
      normalizeReferenceYear(record.metadata?.reference_year) ||
      normalizeReferenceYear(record.reference_year) ||
      detectYear(nameText);
    let periodType = normalizePeriodMode(record.period_type || record.metadata?.period_type || getPeriodModeFromLabel(nameText));

    if (inferFromFile && (!month || !year) && record.storage_path && window.supabaseClient) {
      try {
        const dataset = await loadRowsFromStorage(record);
        const rows = Array.isArray(dataset?.rows) ? dataset.rows : [];
        month = month || normalizeReferenceMonth(detectMonthFromRows(rows));
        year = year || detectYearFromRows(rows);
        if (!hadStoredPeriod) {
          periodType = getDatasetQuarterMode(dataset);
        }
      } catch (error) {
        console.error("[FILES] Não foi possível inferir metadados a partir do arquivo:", error);
      }
    }

    const inferred = getFileRecordPeriod({
      ...record,
      reference_month: month || record.reference_month,
      reference_year: year || record.reference_year,
      period_type: periodType,
    });
    const next = {
      ...record,
      file_type: getFileRecordCategory(record),
      reference_month: month || String(inferred.key).slice(5, 7),
      reference_year: year || String(inferred.key).slice(0, 4),
      period_label: original.period_label || original.metadataPeriodLabel || getPeriodModeLabel(periodType),
      period_type: periodType,
      metadata: {
        ...(record.metadata || {}),
        file_category: getFileRecordCategory(record),
        semantic_file_type: getFileRecordCategory(record),
        file_type: getFileRecordCategory(record),
        original_name: record.metadata?.original_name || record.file_name,
        display_name: record.metadata?.display_name || getDashboardFileDisplayName(record),
        reference_month: month || String(inferred.key).slice(5, 7),
        reference_year: year || String(inferred.key).slice(0, 4),
        period_label: original.metadataPeriodLabel || original.period_label || getPeriodModeLabel(periodType),
        period_type: original.metadataPeriodType || original.period_type || periodType,
      },
    };
    Object.assign(record, next);
    const needsUpdate =
      !isDashboardFileCategory(record.file_type) ||
      !record.metadata?.file_category ||
      !record.metadata?.semantic_file_type ||
      !record.metadata?.display_name ||
      !original.reference_month ||
      !original.reference_year ||
      !original.period_label ||
      !original.period_type ||
      !original.metadataPeriodLabel ||
      !original.metadataPeriodType ||
      original.reference_month !== next.reference_month ||
      String(original.reference_year || "") !== String(next.reference_year || "") ||
      original.metadataReferenceMonth !== next.metadata.reference_month ||
      String(original.metadataReferenceYear || "") !== String(next.metadata.reference_year || "") ||
      original.period_label !== next.period_label ||
      original.period_type !== next.period_type;
    if (canEdit() && needsUpdate) {
      updates.push(next);
    }
  }

  for (const record of updates) {
    try {
      await window.supabaseClient
        .from("dashboard_files")
        .update({
          file_type: record.file_type,
          reference_month: record.reference_month,
          reference_year: record.reference_year,
          period_label: record.period_label,
          period_type: record.period_type,
          metadata: record.metadata,
          updated_at: new Date().toISOString(),
        })
        .eq("id", record.id);
    } catch (error) {
      console.error("[FILES] Não foi possível atualizar metadados de período:", error);
    }
  }
  return records;
}

async function validateDashboardFileRecords(records) {
  const validRecords = [];
  for (const record of records) {
    const { error } = await window.supabaseClient.storage
      .from("dashboard-files")
      .download(record.storage_path);

    if (error) {
      console.error("[STORAGE] Arquivo não encontrado ao validar lista:", record, error);
      await markDashboardFileMissing(record, error);
      continue;
    }
    validRecords.push(record);
  }
  return validRecords;
}

async function markDashboardFileMissing(fileRecord, error) {
  if (!fileRecord?.id || !window.supabaseClient) return;
  try {
    await window.supabaseClient
      .from("dashboard_files")
      .update({
        status: "missing_storage",
        is_active: false,
        metadata: {
          ...(fileRecord.metadata || {}),
          last_storage_error: error?.message || "Arquivo não encontrado no Storage",
          missing_checked_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", fileRecord.id);
  } catch (updateError) {
    console.error("[STORAGE] Não foi possível marcar arquivo ausente:", updateError);
  }
}

async function loadPackageManagementRowsForCards(records, cachedDatasets = new Map()) {
  const packageFiles = (Array.isArray(records) ? records : [])
    .filter(isUsableDashboardFileRecord)
    .filter((record) => getFileRecordCategory(record) === PACKAGE_MANAGEMENT_FILE_CATEGORY);
  const loadKey = packageFiles.map((record) => `${record.id || record.file_name}:${record.updated_at || record.metadata?.last_loaded_at || ""}`).join("|") || "__empty";
  if (packageManagementRowsLoadedKey === loadKey) {
    return (Array.isArray(library.datasets) ? library.datasets : []).filter((dataset) => dataset?.fileCategory === PACKAGE_MANAGEMENT_FILE_CATEGORY);
  }
  const datasets = [];

  for (const fileRecord of packageFiles) {
    const cached = cachedDatasets.get(fileRecord.id);
    if (cached?.rows?.length) {
      datasets.push(cached);
      continue;
    }
    try {
      const dataset = await loadRowsFromStorage(fileRecord);
      if (dataset?.rows?.length) datasets.push(dataset);
    } catch (error) {
      console.error("[GESTAO PACOTES] Falha ao carregar arquivo:", fileRecord?.file_name, error);
      showToast(`Falha ao carregar ${fileRecord?.file_name || "arquivo de Gestão"}. Os demais arquivos continuarão.`, "warn", 6200);
    }
  }

  packageManagementRows = datasets.flatMap((dataset) => dataset.rows.map(normalizePackageManagementStoredRow).filter(Boolean));
  packageManagementRowsLoadedKey = loadKey;
  resetDerivedDataCache();
  return datasets;
}

function getPnrFilesForView(records = dashboardFileRecords) {
  return (Array.isArray(records) ? records : [])
    .filter(isUsableDashboardFileRecord)
    .filter((record) => getFileRecordCategory(record) === DEVIATION_PNR_FILE_CATEGORY);
}

function getPnrFilesLoadKey(records = dashboardFileRecords) {
  const files = getPnrFilesForView(records);
  return files.map((record) => `${record.id || record.file_name}:${record.updated_at || record.metadata?.last_loaded_at || ""}`).join("|") || "__empty";
}

function shouldLoadPnrRowsForCurrentView(records = dashboardFileRecords) {
  if (state.appView !== "dashboard") return false;
  if (state.sheet !== DEVIATION_MANAGEMENT_VIEW || state.activeDesvioCategory !== DEVIATION_CATEGORY_PNRS) return false;
  return pnrRowsLoadedKey !== getPnrFilesLoadKey(records);
}

async function loadPnrRowsForView(records, cachedDatasets = new Map()) {
  const files = getPnrFilesForView(records);
  const loadKey = getPnrFilesLoadKey(records);
  if (pnrRowsLoadedKey === loadKey) {
    return (Array.isArray(library.datasets) ? library.datasets : []).filter((dataset) => dataset?.fileCategory === DEVIATION_PNR_FILE_CATEGORY);
  }
  const datasets = [];
  isLoadingPnrRows = true;
  try {
    for (const fileRecord of files) {
      const cached = cachedDatasets.get(fileRecord.id);
      if (cached?.rows?.length) {
        datasets.push(cached);
        continue;
      }
      try {
        const dataset = await loadRowsFromStorage(fileRecord);
        if (dataset?.rows?.length) datasets.push(dataset);
      } catch (error) {
        console.error("[PNRS] Falha ao carregar arquivo:", fileRecord?.file_name, error);
        showToast(`Falha ao carregar ${fileRecord?.file_name || "arquivo de PNR"}. Os demais arquivos continuarão.`, "warn", 6200);
      }
    }
    pnrRows = dedupePnrRecords(datasets.flatMap((dataset) => dataset.rows.map(normalizePnrStoredRow).filter(Boolean))).rows;
    pnrRowsLoadedKey = loadKey;
    resetDerivedDataCache();
    return datasets;
  } finally {
    isLoadingPnrRows = false;
  }
}

async function ensurePackageManagementRowsLoaded(records = dashboardFileRecords) {
  const cachedDatasets = new Map(
    (Array.isArray(library.datasets) ? library.datasets : [])
      .filter((dataset) => dataset?.source !== "filtered" && Array.isArray(dataset.rows))
      .map((dataset) => [dataset.id, dataset]),
  );
  return loadPackageManagementRowsForCards(records, cachedDatasets);
}

async function ensurePnrRowsLoaded(records = dashboardFileRecords) {
  const cachedDatasets = new Map(
    (Array.isArray(library.datasets) ? library.datasets : [])
      .filter((dataset) => dataset?.source !== "filtered" && Array.isArray(dataset.rows))
      .map((dataset) => [dataset.id, dataset]),
  );
  return loadPnrRowsForView(records, cachedDatasets);
}

function applyDashboardScopeFromLoadedDatasets() {
  if (!dashboardFileRecords.length || !Array.isArray(library.datasets) || !library.datasets.length) return false;
  const categoryFiles = dashboardFileRecords
    .filter(isUsableDashboardFileRecord)
    .filter((record) => getFileRecordCategory(record) === PRE_FATURA_FILE_CATEGORY);
  if (!categoryFiles.length) return false;
  const selectedFiles = getFilesByMonthsAndPeriod(categoryFiles, getPrefaturaMonthSelectionValues(), state.prefaturaPeriod || state.period, PRE_FATURA_FILE_CATEGORY);
  if (!selectedFiles.length) return false;
  const datasetById = new Map(
    library.datasets
      .filter((dataset) => dataset?.source !== "filtered" && Array.isArray(dataset.rows) && dataset.rows.length)
      .map((dataset) => [dataset.id, dataset]),
  );
  const selectedDatasets = selectedFiles.map((file) => datasetById.get(file.id)).filter(Boolean);
  if (selectedDatasets.length !== selectedFiles.length) return false;
  const allHistoricalDatasets = categoryFiles.map((file) => datasetById.get(file.id)).filter(Boolean);
  const packageDatasets = library.datasets.filter((dataset) => dataset?.source !== "filtered" && dataset?.fileCategory === PACKAGE_MANAGEMENT_FILE_CATEGORY);
  const pnrDatasets = library.datasets.filter((dataset) => dataset?.source !== "filtered" && dataset?.fileCategory === DEVIATION_PNR_FILE_CATEGORY);
  const rows = selectedDatasets.flatMap((dataset) => dataset.rows);
  if (!rows.length) return false;
  replaceDashboardData(rows, {
    selectedFiles,
    selectedDatasets,
    allHistoricalDatasets: [...allHistoricalDatasets, ...packageDatasets, ...pnrDatasets],
    selectedMonth: state.prefaturaMonths.length === 1 ? state.prefaturaMonths[0] : "all",
    selectedPeriod: state.prefaturaPeriod || state.period,
    fileCategory: PRE_FATURA_FILE_CATEGORY,
  });
  setDashboardVisualState("", { render: false });
  return true;
}

async function loadDashboardDataByFilters(options = {}) {
  if (!currentUser || !window.supabaseClient) {
    clearDashboardData({ render: options.render !== false, preserveRecords: false });
    return;
  }
  if (isLoadingDashboardData && options.force !== true) return;
  const shouldRender = options.render !== false;
  const shouldShowLoading = options.showLoading ?? (!hasInitialLoadCompleted || !hasLoadedDashboardData());
  isLoadingDashboardData = true;
  dashboardFilesLoading = true;
  if (shouldShowLoading) setDashboardVisualState("processing-file", { render: shouldRender });
  updateDatasetMeta();
  try {
    const files = Array.isArray(options.files) ? options.files : await loadDashboardFilesFromSupabase({ loadActive: false, render: false, validateStorage: false, showLoading: false });
    await hydrateDashboardFileMetadata(files);
    dashboardFileRecords = files.filter(isUsableDashboardFileRecord).filter(isDashboardFileActive);
    if (!dashboardFileRecords.length) {
      dashboardFilesLoading = false;
      setDashboardVisualState("", { render: false });
      clearDashboardData({ render: shouldRender, preserveRecords: false });
      return;
    }

    if (!state.monthFilter) state.monthFilter = "all";
    if (state.monthFilter !== "all" && !getAvailableMonthOptions(PRE_FATURA_FILE_CATEGORY).some((month) => month.key === state.monthFilter)) {
      state.monthFilter = "all";
    }
    state.prefaturaMonths = normalizeMonthSelection(
      Array.isArray(state.prefaturaMonths) && state.prefaturaMonths.length ? state.prefaturaMonths : state.monthFilter,
      getAvailableMonthOptions(PRE_FATURA_FILE_CATEGORY),
    );
    state.prefaturaPeriod = normalizePeriodMode(state.prefaturaPeriod || state.period);
    state.period = state.prefaturaPeriod;
    ensureCurrentPeriodIsAvailable();

    const cachedDatasets = new Map(
      (Array.isArray(library.datasets) ? library.datasets : [])
        .filter((dataset) => dataset?.source !== "filtered" && Array.isArray(dataset.rows) && dataset.rows.length)
        .map((dataset) => [dataset.id, dataset]),
    );
    const packageDatasets = await loadPackageManagementRowsForCards(dashboardFileRecords, cachedDatasets);
    const pnrDatasets = shouldLoadPnrRowsForCurrentView(dashboardFileRecords)
      ? await loadPnrRowsForView(dashboardFileRecords, cachedDatasets)
      : library.datasets.filter((dataset) => dataset?.source !== "filtered" && dataset?.fileCategory === DEVIATION_PNR_FILE_CATEGORY);
    const currentFileCategory = PRE_FATURA_FILE_CATEGORY;
    const categoryFiles = dashboardFileRecords.filter((record) => getFileRecordCategory(record) === currentFileCategory);
    if (!categoryFiles.length) {
      dashboardFilesLoading = false;
      setDashboardVisualState("", { render: false });
      clearDashboardData({ render: shouldRender, preserveRecords: true });
      return;
    }

    const selectedFiles = getFilesByMonthsAndPeriod(categoryFiles, getPrefaturaMonthSelectionValues(), state.prefaturaPeriod || state.period, currentFileCategory);
    if (!selectedFiles.length) {
      dashboardFilesLoading = false;
      setDashboardVisualState("no-filter-results", { render: false });
      clearDashboardData({ render: shouldRender, preserveRecords: true });
      showToast("Nenhum arquivo encontrado para o mês/período selecionado.", "warn", 5200);
      return;
    }

    const allHistoricalDatasets = [];
    for (const fileRecord of categoryFiles) {
      const cached = cachedDatasets.get(fileRecord.id);
      if (cached?.rows?.length) {
        allHistoricalDatasets.push(cached);
        continue;
      }
      try {
        const dataset = await loadRowsFromStorage(fileRecord);
        if (dataset?.rows?.length) allHistoricalDatasets.push(dataset);
      } catch (error) {
        console.error("[PRE-FATURA] Falha ao carregar arquivo:", fileRecord?.file_name, error);
        showToast(`Falha ao carregar ${fileRecord?.file_name || "arquivo"}. Os demais arquivos continuarão.`, "warn", 6200);
      }
    }
    const selectedFileIds = new Set(selectedFiles.map((file) => file.id));
    const selectedDatasets = allHistoricalDatasets.filter((dataset) => selectedFileIds.has(dataset.id));

    const rows = selectedDatasets.flatMap((dataset) => dataset.rows);
    if (!rows.length) {
      dashboardFilesLoading = false;
      setDashboardVisualState("no-filter-results", { render: false });
      clearDashboardData({ render: shouldRender, preserveRecords: true });
      showToast("Nenhum registro válido encontrado para o mês/período selecionado.", "warn", 5200);
      return;
    }

    replaceDashboardData(rows, {
      selectedFiles,
      selectedDatasets,
      allHistoricalDatasets: [...allHistoricalDatasets, ...packageDatasets, ...pnrDatasets],
      selectedMonth: state.prefaturaMonths.length === 1 ? state.prefaturaMonths[0] : "all",
      selectedPeriod: state.prefaturaPeriod || state.period,
      fileCategory: currentFileCategory,
    });
    setDashboardVisualState("", { render: false });
    if (shouldRender) {
      hydrateControls();
      renderAll();
    } else {
      syncActiveDataset();
      updateDatasetMeta();
    }
    if (!options.silent) showToast("Dados do período carregados.", "good", 3200);
  } catch (error) {
    console.error("[DASHBOARD] Falha ao carregar dados processados:", error);
    showToast(error.message || "Não foi possível carregar os dados. Tente atualizar novamente.", "error", 6200);
    setDashboardVisualState("supabase-error", { render: false });
  } finally {
    dashboardFilesLoading = false;
    isLoadingDashboardData = false;
    if (shouldShowLoading && dashboardVisualState === "processing-file") setDashboardVisualState("", { render: false });
    updateDatasetMeta();
  }
}

function getProcessedRecordsTable(fileCategory) {
  if (fileCategory === DEVIATION_PNR_FILE_CATEGORY) return "desvios_pnr_records";
  return fileCategory === PACKAGE_MANAGEMENT_FILE_CATEGORY ? "gestao_pacotes_records" : "pre_fatura_records";
}

function getFileCompetencia(fileRecord, row = {}) {
  return row.competencia || fileRecord?.metadata?.competencia || "";
}

function getFileQuinzena(fileRecord, row = {}) {
  return row.quinzena || fileRecord?.metadata?.quinzena || fileRecord?.period_label || fileRecord?.metadata?.period_label || "";
}

function toDatabaseDate(value) {
  const parsed = parseDateValue(value);
  return parsed.iso || null;
}

function mapPreFaturaRowToProcessedRecord(row, fileRecord) {
  const division = normalizeSheetLabel(row.aba_origem || row.divisao, row.tipo_desconto || row.tipo_registro);
  const tipo = getPrefaturaTypeForDivision(division);
  return {
    file_id: fileRecord.id,
    competencia: getFileCompetencia(fileRecord, row),
    quinzena: getFileQuinzena(fileRecord, row),
    tipo: tipo === "Todos" ? "" : tipo,
    base: row.base || "",
    codigo_base: normalizeBase(row.base_normalizada || row.base || ""),
    driver: formatDriverName(row.motorista || row.driver || "", ""),
    driver_normalizado: normalizeDriverName(row.motorista || row.driver || ""),
    placa: row.placa || "",
    data: toDatabaseDate(row.data_normalizada || row.data_sort),
    id_envio: row.id_pacote || row.id_envio || "",
    rota: row.n_rota || row.rota || "",
    valor: Number(row.valor_numerico || 0),
    aba_origem: division,
    raw_data: {
      ...row,
      file_category: PRE_FATURA_FILE_CATEGORY,
      arquivo_origem: row.arquivo_origem || fileRecord.file_name,
      competencia: getFileCompetencia(fileRecord, row),
      quinzena: getFileQuinzena(fileRecord, row),
    },
  };
}

function mapPackageRowToProcessedRecord(row, fileRecord) {
  const category = row.categoria_final || classifyPackageDecision(row.decisao_adm, row.aba_gestao) || "INDEFINIDO";
  return {
    file_id: fileRecord.id,
    competencia: getFileCompetencia(fileRecord, row),
    quinzena: getFileQuinzena(fileRecord, row),
    tipo: getPackageOperationalType(row),
    desconto: category,
    base: row.base || "",
    codigo_base: normalizeBase(row.base_normalizada || row.base || ""),
    driver: formatDriverName(row.motorista || row.driver || "", ""),
    driver_normalizado: normalizeDriverName(row.motorista || row.driver || ""),
    data: toDatabaseDate(row.data_normalizada || row.data_sort),
    id_envio: row.id_pacote || row.id_caso || row.id_envio || "",
    rota: row.n_rota || row.rota || "",
    valor: normalizarValorGestao(row.valor_numerico),
    decisao_adm: row.decisao_adm || "",
    observacao: row.evidencia_1 || row.evidencia_2 || row.observacao || "",
    aba_origem: row.aba_gestao || row.aba_gestao_label || "",
    raw_data: {
      ...row,
      file_category: PACKAGE_MANAGEMENT_FILE_CATEGORY,
      arquivo_origem: row.arquivo_origem || fileRecord.file_name,
      competencia: getFileCompetencia(fileRecord, row),
      quinzena: getFileQuinzena(fileRecord, row),
    },
  };
}

function mapPnrRowToProcessedRecord(row, fileRecord) {
  return {
    file_id: fileRecord.id,
    dedupe_key: row.dedupeKey || getPnrDedupeKey(row),
    competencia: getFileCompetencia(fileRecord, row),
    quinzena: getFileQuinzena(fileRecord, row),
    tipo: row.tipo || "",
    status_original: row.statusOriginal || "",
    status_normalizado: row.statusNormalizado || "",
    periodo_faturamento: row.periodoFaturamento || "",
    periodo_faturamento_original: row.periodoFaturamentoOriginal || row.periodoFaturamento || "",
    mes: row.mes || "",
    ano: row.ano || "",
    quinzena_ref: row.quinzenaRef || "",
    periodo_label: row.periodoLabel || "",
    source_file_name: row.sourceFileName || row.arquivo_origem || fileRecord.file_name || "",
    source_periodo: row.sourcePeriodo || row.periodoFaturamentoOriginal || row.periodoFaturamento || "",
    data_pedido_revisao: toDatabaseDate(row.dataPedidoRevisao),
    pedido_revisao: row.pedidoRevisao || "",
    data_encerramento_caso: toDatabaseDate(row.dataEncerramentoCaso),
    rep_assistente: row.repAssistente || "",
    comentario_encerramento: row.comentarioEncerramento || "",
    numero_pre_fatura: row.numeroPreFatura || "",
    id_envio: row.idEnvio || "",
    produtos: row.produtos || "",
    valor_compra: Number(row.valorCompraNumerico || 0),
    rep_transportadora: row.repTransportadora || "",
    id_transportadora: row.idTransportadora || "",
    transportadora: row.transportadora || "",
    estacao_origem: row.estacaoOrigem || "",
    tipo_operacional: row.tipoOperacional || "",
    id_rota: row.idRota || "",
    id_motorista: row.idMotorista || "",
    nome_motorista: row.nomeMotorista || "",
    motorista_display: row.motoristaDisplay || "",
    motorista_match_source: row.motoristaMatchSource || "",
    data_caso: toDatabaseDate(row.dataCaso),
    data_entrega: toDatabaseDate(row.dataEntrega),
    id_reclamacao: row.idReclamacao || "",
    data_reclamacao: toDatabaseDate(row.dataReclamacao),
    raw_data: {
      ...row,
      file_category: DEVIATION_PNR_FILE_CATEGORY,
      arquivo_origem: row.arquivo_origem || fileRecord.file_name,
      competencia: getFileCompetencia(fileRecord, row),
      quinzena: getFileQuinzena(fileRecord, row),
    },
  };
}

function mapRowToProcessedRecord(row, fileRecord, fileCategory) {
  if (fileCategory === DEVIATION_PNR_FILE_CATEGORY) return mapPnrRowToProcessedRecord(row, fileRecord);
  return fileCategory === PACKAGE_MANAGEMENT_FILE_CATEGORY ? mapPackageRowToProcessedRecord(row, fileRecord) : mapPreFaturaRowToProcessedRecord(row, fileRecord);
}

function mapProcessedPreFaturaRecord(record, fileRecord) {
  const raw = record.raw_data || {};
  return normalizeStoredRow({
    ...raw,
    file_category: PRE_FATURA_FILE_CATEGORY,
    arquivo_origem: raw.arquivo_origem || fileRecord.file_name,
    competencia: record.competencia || raw.competencia || fileRecord.metadata?.competencia || "",
    quinzena: record.quinzena || raw.quinzena || fileRecord.metadata?.quinzena || "",
    aba_origem: record.aba_origem || raw.aba_origem,
    divisao: record.aba_origem || raw.divisao,
    tipo_registro: record.aba_origem === "PNR" || record.tipo === "PNR" ? "PNR" : raw.tipo_registro || "PACOTE PERDIDO",
    base: record.base || raw.base,
    base_normalizada: record.codigo_base || raw.base_normalizada,
    motorista: record.driver || raw.motorista,
    driver: record.driver || raw.driver,
    placa: record.placa || raw.placa,
    data_normalizada: record.data || raw.data_normalizada,
    id_pacote: record.id_envio || raw.id_pacote,
    n_rota: record.rota || raw.n_rota,
    valor_numerico: Number(record.valor || raw.valor_numerico || 0),
  });
}

function mapProcessedPackageRecord(record, fileRecord) {
  const raw = record.raw_data || {};
  return normalizePackageManagementStoredRow({
    ...raw,
    file_category: PACKAGE_MANAGEMENT_FILE_CATEGORY,
    arquivo_origem: raw.arquivo_origem || fileRecord.file_name,
    competencia: record.competencia || raw.competencia || fileRecord.metadata?.competencia || "",
    quinzena: record.quinzena || raw.quinzena || fileRecord.metadata?.quinzena || "",
    tipo: record.tipo || raw.tipo,
    categoria_final: record.desconto || raw.categoria_final,
    tipo_desconto: PACKAGE_CATEGORY_LABELS[record.desconto] || raw.tipo_desconto,
    base: record.base || raw.base,
    base_normalizada: record.codigo_base || raw.base_normalizada,
    motorista: record.driver || raw.motorista,
    driver: record.driver || raw.driver,
    data_normalizada: record.data || raw.data_normalizada,
    id_pacote: record.id_envio || raw.id_pacote,
    id_caso: record.id_envio || raw.id_caso,
    n_rota: record.rota || raw.n_rota,
    valor_numerico: normalizarValorGestao(record.valor ?? raw.valor_numerico),
    decisao_adm: record.decisao_adm || raw.decisao_adm,
    observacao: record.observacao || raw.observacao,
    aba_gestao: record.aba_origem || raw.aba_gestao,
  });
}

function mapProcessedPnrRecord(record, fileRecord) {
  const raw = record.raw_data || {};
  return normalizePnrStoredRow({
    ...raw,
    file_category: DEVIATION_PNR_FILE_CATEGORY,
    arquivo_origem: raw.arquivo_origem || fileRecord.file_name,
    competencia: record.competencia || raw.competencia || fileRecord.metadata?.competencia || "",
    quinzena: record.quinzena || raw.quinzena || fileRecord.metadata?.quinzena || "",
    dedupeKey: record.dedupe_key || raw.dedupeKey || raw.dedupe_key,
    mes: record.mes || raw.mes,
    ano: record.ano || raw.ano,
    quinzenaRef: record.quinzena_ref || raw.quinzenaRef || raw.quinzena_ref,
    periodoLabel: record.periodo_label || raw.periodoLabel || raw.periodo_label,
    periodoFaturamentoOriginal: record.periodo_faturamento_original || raw.periodoFaturamentoOriginal || raw.periodo_faturamento_original || record.periodo_faturamento,
    sourcePeriodo: record.source_periodo || raw.sourcePeriodo || raw.source_periodo || record.periodo_faturamento,
    sourceFileName: record.source_file_name || raw.sourceFileName || raw.source_file_name || fileRecord.file_name,
    tipo: record.tipo || raw.tipo,
    statusOriginal: record.status_original || raw.statusOriginal,
    statusNormalizado: record.status_normalizado || raw.statusNormalizado,
    periodoFaturamento: record.periodo_faturamento || raw.periodoFaturamento,
    dataPedidoRevisao: record.data_pedido_revisao || raw.dataPedidoRevisao,
    pedidoRevisao: record.pedido_revisao || raw.pedidoRevisao,
    dataEncerramentoCaso: record.data_encerramento_caso || raw.dataEncerramentoCaso,
    repAssistente: record.rep_assistente || raw.repAssistente,
    comentarioEncerramento: record.comentario_encerramento || raw.comentarioEncerramento,
    numeroPreFatura: record.numero_pre_fatura || raw.numeroPreFatura,
    idEnvio: record.id_envio || raw.idEnvio,
    produtos: record.produtos || raw.produtos,
    valorCompraOriginal: raw.valorCompraOriginal || raw.valor_compra_original || raw["VALOR DA COMPRA"],
    valorCompraNumerico: Number(record.valor_compra ?? raw.valorCompraNumerico ?? 0),
    repTransportadora: record.rep_transportadora || raw.repTransportadora,
    idTransportadora: record.id_transportadora || raw.idTransportadora,
    transportadora: record.transportadora || raw.transportadora,
    estacaoOrigem: record.estacao_origem || raw.estacaoOrigem,
    tipoOperacional: record.tipo_operacional || raw.tipoOperacional,
    idRota: record.id_rota || raw.idRota,
    idMotorista: record.id_motorista || raw.idMotorista,
    nomeMotorista: record.nome_motorista || raw.nomeMotorista || raw.nome_motorista,
    motoristaDisplay: record.motorista_display || raw.motoristaDisplay || raw.motorista_display,
    motoristaMatchSource: record.motorista_match_source || raw.motoristaMatchSource || raw.motorista_match_source,
    dataCaso: record.data_caso || raw.dataCaso,
    dataEntrega: record.data_entrega || raw.dataEntrega,
    idReclamacao: record.id_reclamacao || raw.idReclamacao,
    dataReclamacao: record.data_reclamacao || raw.dataReclamacao,
  });
}

function mapProcessedRecordToRow(record, fileRecord, fileCategory) {
  if (fileCategory === DEVIATION_PNR_FILE_CATEGORY) return mapProcessedPnrRecord(record, fileRecord);
  return fileCategory === PACKAGE_MANAGEMENT_FILE_CATEGORY ? mapProcessedPackageRecord(record, fileRecord) : mapProcessedPreFaturaRecord(record, fileRecord);
}

async function fetchAllProcessedRows(tableName, fileId) {
  const rows = [];
  for (let from = 0; ; from += PROCESSED_RECORDS_PAGE_SIZE) {
    const to = from + PROCESSED_RECORDS_PAGE_SIZE - 1;
    const { data, error } = await window.supabaseClient
      .from(tableName)
      .select("*")
      .eq("file_id", fileId)
      .range(from, to);

    if (error) throw error;
    const page = Array.isArray(data) ? data : [];
    rows.push(...page);
    if (page.length < PROCESSED_RECORDS_PAGE_SIZE) break;
  }
  return rows;
}

function isMissingProcessedRecordsTableError(error) {
  const text = `${error?.code || ""} ${error?.message || ""} ${error?.details || ""}`;
  return /42P01|PGRST205|does not exist|schema cache|Could not find the table/i.test(text);
}

async function loadProcessedDatasetForFile(fileRecord) {
  if (processedRecordsUnavailable || !fileRecord?.id || !window.supabaseClient) return null;
  const fileCategory = getFileRecordCategory(fileRecord);
  const tableName = getProcessedRecordsTable(fileCategory);
  try {
    const processedRows = await fetchAllProcessedRows(tableName, fileRecord.id);
    if (!processedRows.length) return null;
    const rows = processedRows
      .map((record) => mapProcessedRecordToRow(record, fileRecord, fileCategory))
      .filter(Boolean);
    if (!rows.length) return null;
    return normalizeDatasetRecord({
      id: fileRecord.id,
      fileName: fileRecord.file_name,
      label: getDashboardFileDisplayName(fileRecord),
      source: "supabase",
      importedAt: fileRecord.created_at,
      remoteRecord: fileRecord,
      storagePath: fileRecord.storage_path,
      fileCategory,
      rows,
    });
  } catch (error) {
    if (isMissingProcessedRecordsTableError(error)) {
      if (fileCategory !== DEVIATION_PNR_FILE_CATEGORY) processedRecordsUnavailable = true;
      console.warn("[PROCESSED RECORDS] Tabela processada indisponível; usando XLSX como fallback até aplicar a migração.", error);
      return null;
    }
    throw error;
  }
}

async function updateProcessedFileMetadata(fileRecord, payloadLength, extraMetadata = {}) {
  const metadata = {
    ...(fileRecord.metadata || {}),
    processed_at: new Date().toISOString(),
    processed_source: "normalized_records",
    record_count: payloadLength,
    parsed_rows: payloadLength,
    ...extraMetadata,
  };
  await window.supabaseClient
    .from("dashboard_files")
    .update({
      status: "processed",
      metadata,
      updated_at: new Date().toISOString(),
    })
    .eq("id", fileRecord.id);
  Object.assign(fileRecord, { status: "processed", metadata });
}

async function fetchExistingPnrRecordsByDedupeKey(tableName, keys) {
  const existing = new Map();
  const uniqueKeys = [...new Set((Array.isArray(keys) ? keys : []).filter(Boolean))];
  for (let index = 0; index < uniqueKeys.length; index += PROCESSED_RECORDS_BATCH_SIZE) {
    const batch = uniqueKeys.slice(index, index + PROCESSED_RECORDS_BATCH_SIZE);
    const { data, error } = await window.supabaseClient
      .from(tableName)
      .select("id,dedupe_key")
      .in("dedupe_key", batch);
    if (error) throw error;
    (Array.isArray(data) ? data : []).forEach((record) => {
      if (record?.dedupe_key) existing.set(record.dedupe_key, record.id);
    });
  }
  return existing;
}

async function savePnrProcessedRowsForFile(fileRecord, tableName, payload) {
  const rows = (Array.isArray(payload) ? payload : [])
    .map((record) => ({
      ...record,
      dedupe_key: record.dedupe_key || getPnrDedupeKey(record.raw_data || record),
    }))
    .filter((record) => record.dedupe_key);
  await window.supabaseClient.from(tableName).delete().eq("file_id", fileRecord.id);
  const existingByKey = await fetchExistingPnrRecordsByDedupeKey(tableName, rows.map((record) => record.dedupe_key));
  const updates = [];
  const inserts = [];
  rows.forEach((record) => {
    const existingId = existingByKey.get(record.dedupe_key);
    if (existingId) updates.push({ ...record, id: existingId });
    else inserts.push(record);
  });

  for (let index = 0; index < updates.length; index += PROCESSED_RECORDS_BATCH_SIZE) {
    const batch = updates.slice(index, index + PROCESSED_RECORDS_BATCH_SIZE);
    const { error } = await window.supabaseClient.from(tableName).upsert(batch, { onConflict: "id" });
    if (error) throw error;
  }
  for (let index = 0; index < inserts.length; index += PROCESSED_RECORDS_BATCH_SIZE) {
    const batch = inserts.slice(index, index + PROCESSED_RECORDS_BATCH_SIZE);
    const { error } = await window.supabaseClient.from(tableName).insert(batch);
    if (error) throw error;
  }

  await updateProcessedFileMetadata(fileRecord, rows.length, {
    records_new: inserts.length,
    records_updated: updates.length,
    duplicates_ignored: getWorkbookStatsForCategory(DEVIATION_PNR_FILE_CATEGORY).duplicateRowsSkipped || 0,
    duplicate_rows_updated: getWorkbookStatsForCategory(DEVIATION_PNR_FILE_CATEGORY).duplicateRowsUpdated || 0,
    duplicate_rows_removed: getWorkbookStatsForCategory(DEVIATION_PNR_FILE_CATEGORY).duplicateRowsRemoved || 0,
  });
  return { inserted: inserts.length, updated: updates.length, ignored: getWorkbookStatsForCategory(DEVIATION_PNR_FILE_CATEGORY).duplicateRowsSkipped || 0 };
}

async function saveProcessedRowsForFile(fileRecord, rows) {
  if (processedRecordsUnavailable || !canEdit() || !fileRecord?.id || !window.supabaseClient || !Array.isArray(rows)) return false;
  const fileCategory = getFileRecordCategory(fileRecord);
  const tableName = getProcessedRecordsTable(fileCategory);
  const rowsForProcessing = fileCategory === DEVIATION_PNR_FILE_CATEGORY ? enrichPnrRowsWithDriverNames(rows) : rows;
  const payload = rowsForProcessing
    .map((row) => mapRowToProcessedRecord(row, fileRecord, fileCategory))
    .filter(Boolean);
  try {
    if (fileCategory === DEVIATION_PNR_FILE_CATEGORY) {
      return await savePnrProcessedRowsForFile(fileRecord, tableName, payload);
    }
    await window.supabaseClient.from(tableName).delete().eq("file_id", fileRecord.id);
    for (let index = 0; index < payload.length; index += PROCESSED_RECORDS_BATCH_SIZE) {
      const batch = payload.slice(index, index + PROCESSED_RECORDS_BATCH_SIZE);
      const { error } = await window.supabaseClient.from(tableName).insert(batch);
      if (error) throw error;
    }
    await updateProcessedFileMetadata(fileRecord, payload.length);
    return true;
  } catch (error) {
    if (isMissingProcessedRecordsTableError(error)) {
      if (fileCategory !== DEVIATION_PNR_FILE_CATEGORY) processedRecordsUnavailable = true;
      console.warn("[PROCESSED RECORDS] Não foi possível salvar linhas processadas; aplique a migração Supabase.", error);
      return false;
    }
    console.error("[PROCESSED RECORDS] Falha ao salvar linhas processadas:", error);
    return false;
  }
}

async function loadRowsFromStorage(fileRecord) {
  const processedDataset = await loadProcessedDatasetForFile(fileRecord);
  if (processedDataset?.rows?.length) return processedDataset;

  const { data: blob, error } = await withTimeout(
    window.supabaseClient.storage
      .from("dashboard-files")
      .download(fileRecord.storage_path),
    STORAGE_DOWNLOAD_TIMEOUT_MS,
    `Tempo limite excedido ao baixar ${fileRecord.file_name || "arquivo"}.`,
  );

  if (error) {
    console.error("[STORAGE] Arquivo não encontrado ou erro no download:", error);
    await markDashboardFileMissing(fileRecord, error);
    return null;
  }

  const file = new File([blob], fileRecord.file_name, {
    type: getFileRecordMimeType(fileRecord, blob.type),
  });
  const dataset = await processDashboardFile(file, fileRecord);
  const workbookStats = getWorkbookStatsForCategory(dataset.fileCategory);
  const normalized = normalizeDatasetRecord({
    ...dataset,
    id: fileRecord.id,
    fileName: fileRecord.file_name,
    label: getDashboardFileDisplayName(fileRecord),
    source: "supabase",
    importedAt: fileRecord.created_at,
    remoteRecord: fileRecord,
    storagePath: fileRecord.storage_path,
  });

  const parsedRows = normalized?.rows?.length || 0;
  if (!parsedRows) {
    await markDashboardFileParseEmpty(fileRecord);
    return null;
  }

  await updateDashboardFileParsedRows(fileRecord, parsedRows, workbookStats);
  await saveProcessedRowsForFile(fileRecord, normalized.rows);
  return normalized;
}

function replaceDashboardData(rows, context = {}) {
  const selectedFiles = Array.isArray(context.selectedFiles) ? context.selectedFiles : [];
  const selectedDatasets = Array.isArray(context.selectedDatasets) ? context.selectedDatasets : [];
  const allHistoricalDatasets = Array.isArray(context.allHistoricalDatasets) ? context.allHistoricalDatasets : selectedDatasets;
  const label = buildActivePeriodLabel(context.selectedMonth || "all", context.selectedPeriod || "month", selectedFiles);
  const fileCategory = context.fileCategory || getCurrentFileCategory();
  const consolidatedRows = fileCategory === PACKAGE_MANAGEMENT_FILE_CATEGORY
    ? rows.map(normalizePackageManagementStoredRow).filter(Boolean)
    : consolidateLinkedOccurrences(rows);
  const scopeDataset = {
    id: "__filtered_scope",
    fileName: label,
    label,
    source: "filtered",
    importedAt: new Date().toISOString(),
    remoteRecord: null,
    rows: consolidatedRows,
    fileCategory,
    scopedDatasets: selectedDatasets,
  };

  const datasetById = new Map(allHistoricalDatasets.map((dataset) => [dataset.id, dataset]));
  const fileDatasets = dashboardFileRecords.map((record) => {
    const loaded = datasetById.get(record.id);
    return loaded || normalizeDatasetRecord({
      id: record.id,
      fileName: record.file_name,
      label: getDashboardFileDisplayName(record),
      source: "supabase",
      importedAt: record.created_at,
      remoteRecord: record,
      storagePath: record.storage_path,
      rows: [],
    });
  }).filter(Boolean);

  currentActiveFile = {
    id: scopeDataset.id,
    file_name: label,
    file_category: fileCategory,
    is_active: false,
    files_count: selectedFiles.length,
    rows_count: consolidatedRows.length,
  };
  library = {
    activeDatasetId: scopeDataset.id,
    datasets: [scopeDataset, ...fileDatasets],
  };
  state.activeDatasetId = scopeDataset.id;
  state.fileName = label;
  state.page = 1;
  syncActiveDataset();
}

async function updateDashboardFileParsedRows(fileRecord, parsedRows, stats = {}) {
  const fileCategory = getFileRecordCategory(fileRecord);
  const packagePeriod = fileCategory === PACKAGE_MANAGEMENT_FILE_CATEGORY
    ? identificarPeriodoGestaoPacotes(fileRecord.file_name)
    : null;
  const metadata = {
    ...(fileRecord.metadata || {}),
    parsed_rows: parsedRows,
    original_rows: stats.originalRows || fileRecord.metadata?.original_rows || parsedRows,
    consolidated_rows: stats.consolidatedRows || parsedRows,
    duplicatesSkipped: stats.duplicatesSkipped ?? fileRecord.metadata?.duplicatesSkipped ?? 0,
    duplicate_rows_skipped: stats.duplicateRowsSkipped ?? fileRecord.metadata?.duplicate_rows_skipped ?? 0,
    duplicate_rows_updated: stats.duplicateRowsUpdated ?? fileRecord.metadata?.duplicate_rows_updated ?? 0,
    duplicate_rows_removed: stats.duplicateRowsRemoved ?? fileRecord.metadata?.duplicate_rows_removed ?? 0,
    pnr_master_file: stats.isMasterFile === true || fileRecord.metadata?.pnr_master_file === true,
    period_start_year: stats.periodStartYear || fileRecord.metadata?.period_start_year || "",
    period_end_year: stats.periodEndYear || fileRecord.metadata?.period_end_year || "",
    linked_occurrences: stats.linkedOccurrences ?? fileRecord.metadata?.linked_occurrences ?? 0,
    linked_ids_count: stats.linkedIds ?? fileRecord.metadata?.linked_ids_count ?? 0,
    total_rows_skipped: stats.totalRowsSkipped ?? fileRecord.metadata?.total_rows_skipped ?? 0,
    last_loaded_at: new Date().toISOString(),
    period_label: fileRecord.period_label || fileRecord.metadata?.period_label || getFileRecordPeriod(fileRecord).periodLabel,
    period_type: fileRecord.period_type || fileRecord.metadata?.period_type || getFileRecordPeriod(fileRecord).periodType,
    file_category: fileCategory,
    semantic_file_type: fileCategory,
    file_type: fileCategory,
    mime_type: getFileRecordMimeType(fileRecord),
    original_name: fileRecord.metadata?.original_name || fileRecord.file_name,
    display_name: fileRecord.metadata?.display_name || getDashboardFileDisplayName(fileRecord),
    competencia: fileRecord.metadata?.competencia || packagePeriod?.competencia || "",
    quinzena: fileRecord.metadata?.quinzena || packagePeriod?.quinzena || "",
    mes: fileRecord.metadata?.mes || packagePeriod?.mes || "",
    ano: fileRecord.metadata?.ano || packagePeriod?.ano || fileRecord.reference_year || "",
  };
  Object.assign(fileRecord, {
    file_type: fileCategory,
    status: "loaded",
    metadata,
  });
  if (!canEdit()) return;
  try {
    await window.supabaseClient
      .from("dashboard_files")
      .update({
        file_type: fileCategory,
        status: "loaded",
        metadata,
        updated_at: new Date().toISOString(),
      })
      .eq("id", fileRecord.id);
  } catch (error) {
    console.error("[FILES] Não foi possível atualizar contagem processada:", error);
  }
}

async function markDashboardFileParseEmpty(fileRecord) {
  const metadata = {
    ...(fileRecord.metadata || {}),
    parsed_rows: 0,
    last_parse_error: "Arquivo sem registros ou falha de leitura",
    last_loaded_at: new Date().toISOString(),
  };
  Object.assign(fileRecord, { status: "empty_or_parse_error", metadata });
  if (!canEdit()) return;
  try {
    await window.supabaseClient
      .from("dashboard_files")
      .update({
        status: "empty_or_parse_error",
        metadata,
        updated_at: new Date().toISOString(),
      })
      .eq("id", fileRecord.id);
  } catch (error) {
    console.error("[FILES] Não foi possível marcar arquivo vazio:", error);
  }
}

async function loadActiveDashboardFile() {
  if (!window.supabaseClient || !currentUser) {
    clearDashboardData({ render: true, preserveRecords: false });
    return;
  }

  dashboardFilesLoading = true;
  setDashboardVisualState("loading-files");
  updateDatasetMeta();
  try {
    const { data: activeFile, error } = await window.supabaseClient
      .from("dashboard_files")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Erro ao buscar arquivo ativo:", error);
      showToast("Erro ao carregar arquivo ativo.", "warn", 5200);
      dashboardFilesLoading = false;
      setDashboardVisualState("supabase-error", { render: false });
      clearDashboardData({ render: true, preserveRecords: false });
      return;
    }

    if (!activeFile) {
      dashboardFilesLoading = false;
      setDashboardVisualState("", { render: false });
      clearDashboardData({ render: true, preserveRecords: false });
      showToast("Nenhum arquivo ativo encontrado.", "info", 4200);
      return;
    }

    await loadFileFromStorage(activeFile);
  } finally {
    dashboardFilesLoading = false;
    updateDatasetMeta();
  }
}

function clearDashboardData(options = {}) {
  const { render = true, preserveRecords = true } = options;
  resetDerivedDataCache();
  if (!preserveRecords) {
    dashboardFileRecords = [];
    packageManagementRows = [];
    packageManagementRowsLoadedKey = "";
    pnrRows = [];
    pnrRowsLoadedKey = "";
  }
  currentActiveFile = null;
  const preservedDatasets = preserveRecords
    ? dashboardFileRecords.filter(isUsableDashboardFileRecord).map((record) =>
        normalizeDatasetRecord({
          id: record.id,
          fileName: record.file_name,
          label: getDashboardFileDisplayName(record),
          source: "supabase",
          importedAt: record.created_at,
          remoteRecord: record,
          storagePath: record.storage_path,
          rows: [],
        }),
      ).filter(Boolean)
    : [];
  library = {
    activeDatasetId: EMPTY_DATASET_ID,
    datasets: [buildEmptyDataset(), ...preservedDatasets],
  };
  state.activeDatasetId = EMPTY_DATASET_ID;
  state.fileName = "";
  state.page = 1;
  activeDataset = buildEmptyDataset();
  allRows = [];
  fileMeta = {
    ...activeDataset,
    rows: [],
    scopedDatasets: [activeDataset],
  };
  syncActiveDataset();
  if (render) {
    hydrateControls();
    renderAll();
  } else {
    updateDatasetMeta();
  }
}

async function loadFileFromStorage(fileRecord, options = {}) {
  const { render = true, silent = false, skipDownloadDataset = null } = options;
  if (!fileRecord || !window.supabaseClient) return;

  clearDashboardData({ render: false, preserveRecords: true });
  dashboardFilesLoading = true;
  setDashboardVisualState("processing-file", { render });
  updateDatasetMeta();
  let dataset = skipDownloadDataset;
  try {
    if (!dataset) {
      const { data: blob, error } = await window.supabaseClient.storage
        .from("dashboard-files")
        .download(fileRecord.storage_path);

      if (error) {
        console.error("[STORAGE] Arquivo não encontrado ou erro no download:", error);
        await markDashboardFileMissing(fileRecord, error);
        const files = await loadDashboardFilesFromSupabase({ loadActive: false, render: false, validateStorage: false });
        const candidates = files.filter((record) => record.id !== fileRecord.id);
        const nextFile = candidates.find((record) => record.is_active) || candidates[0] || null;
        showToast("Não foi possível carregar o arquivo salvo.", "error", 6200);
        dashboardFilesLoading = false;
        if (nextFile) {
          if (canEdit()) {
            await setActiveDashboardFile(nextFile.id);
          } else {
            await loadFileFromStorage(nextFile);
          }
        } else {
          setDashboardVisualState("", { render: false });
          clearDashboardData({ render, preserveRecords: false });
        }
        return;
      }

      const file = new File([blob], fileRecord.file_name, {
        type: getFileRecordMimeType(fileRecord, blob.type),
      });
      dataset = await processDashboardFile(file, fileRecord);
    }

    dataset = normalizeDatasetRecord({
      ...dataset,
      id: fileRecord.id,
      fileName: fileRecord.file_name,
      label: getDashboardFileDisplayName(fileRecord),
      source: "supabase",
      importedAt: fileRecord.created_at,
      remoteRecord: fileRecord,
      storagePath: fileRecord.storage_path,
    });
    if (!dataset || !Array.isArray(dataset.rows) || !dataset.rows.length) {
      const emptyRecord = {
        ...fileRecord,
        status: "empty_or_parse_error",
        metadata: {
          ...(fileRecord.metadata || {}),
          parsed_rows: 0,
          last_parse_error: "Arquivo sem registros ou falha de leitura",
          last_loaded_at: new Date().toISOString(),
        },
      };
      dashboardFileRecords = dashboardFileRecords.map((record) => (record.id === emptyRecord.id ? emptyRecord : record));
      if (canEdit()) {
        await window.supabaseClient
          .from("dashboard_files")
          .update({
            status: "empty_or_parse_error",
            metadata: emptyRecord.metadata,
            updated_at: new Date().toISOString(),
          })
          .eq("id", fileRecord.id);
      }
      dashboardFilesLoading = false;
      setDashboardVisualState("", { render: false });
      clearDashboardData({ render, preserveRecords: true });
      showToast("Arquivo carregado, mas nenhum registro válido foi encontrado.", "warn", 6200);
      return;
    }

    const loadedRecord = {
      ...fileRecord,
      status: "loaded",
      is_active: true,
      metadata: {
        ...(fileRecord.metadata || {}),
        parsed_rows: dataset.rows.length,
        last_loaded_at: new Date().toISOString(),
      },
    };
    if (canEdit()) {
      const { data: updatedRecord, error: metadataError } = await window.supabaseClient
        .from("dashboard_files")
        .update({
          status: "loaded",
          metadata: loadedRecord.metadata,
          updated_at: new Date().toISOString(),
        })
        .eq("id", fileRecord.id)
        .select()
        .single();
      if (metadataError) {
        console.error("[FILES] Não foi possível atualizar metadados do arquivo:", metadataError);
      } else if (updatedRecord) {
        Object.assign(loadedRecord, updatedRecord);
      }
    }
    dataset = normalizeDatasetRecord({
      ...dataset,
      remoteRecord: loadedRecord,
      storagePath: loadedRecord.storage_path,
    });

    const recordsById = new Map();
    [...dashboardFileRecords, loadedRecord].forEach((record) => {
      if (!record?.id) return;
      recordsById.set(record.id, {
        ...record,
        is_active: record.id === loadedRecord.id,
      });
    });
    const existingRecords = Array.from(recordsById.values());
    dashboardFileRecords = existingRecords;
    const existingDatasets = Array.isArray(library.datasets) ? library.datasets : [];
    const datasets = existingRecords.map((record) => {
      if (record.id === fileRecord.id) return dataset;
      const previous = existingDatasets.find((entry) => entry.id === record.id);
      return normalizeDatasetRecord({
        id: record.id,
        fileName: record.file_name,
        label: getDashboardFileDisplayName(record),
        source: "supabase",
        importedAt: record.created_at,
        remoteRecord: record,
        storagePath: record.storage_path,
        rows: previous?.rows || [],
      });
    }).filter(Boolean);

    library = {
      activeDatasetId: loadedRecord.id,
      datasets: datasets.length ? datasets : [dataset],
    };
    currentActiveFile = loadedRecord;
    state.activeDatasetId = loadedRecord.id;
    state.fileName = loadedRecord.file_name;
    state.page = 1;
    syncActiveDataset();
    hydrateControls();
    setDashboardVisualState("", { render: false });
    if (render) renderAll();
    if (!silent) showToast("Arquivo carregado com sucesso.", "good", 4200);
  } catch (error) {
    console.error("Erro ao processar arquivo do Storage:", error);
    showToast("Não foi possível processar o arquivo salvo.", "error", 6200);
    dashboardFilesLoading = false;
    setDashboardVisualState("supabase-error", { render: false });
    clearDashboardData({ render });
  } finally {
    dashboardFilesLoading = false;
    if (dashboardVisualState === "processing-file") setDashboardVisualState("", { render: false });
    updateDatasetMeta();
  }
}

async function setActiveDashboardFile(fileId) {
  const permissions = getActionPermissions();
  if (!permissions.isAdmin) {
    showToast("Apenas administradores podem alterar o arquivo ativo.", "warn", 5200);
    showPermissionDeniedState();
    return;
  }

  const { error: deactivateError } = await window.supabaseClient
    .from("dashboard_files")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("is_active", true);

  if (deactivateError) {
    console.error(deactivateError);
    showToast("Erro ao ativar arquivo.", "error", 5200);
    return;
  }

  const { data, error } = await window.supabaseClient
    .from("dashboard_files")
    .update({
      is_active: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", fileId)
    .select()
    .single();

  if (error) {
    console.error(error);
    showToast("Erro ao ativar arquivo.", "error", 5200);
    await reloadDashboardFilesList({ validateStorage: true });
    return;
  }

  const recordsById = new Map();
  [...dashboardFileRecords, data].forEach((record) => {
    if (!record?.id) return;
    recordsById.set(record.id, {
      ...record,
      is_active: record.id === data.id,
    });
  });
  dashboardFileRecords = Array.from(recordsById.values());
  const period = getFileRecordPeriod(data);
  state.monthFilter = period.key;
  state.period = period.periodType;
  persistState();
  await logAudit("set_active_file", "dashboard_file", data.id, {
    file_name: data.file_name,
  });
  await loadDashboardDataByFilters({ files: dashboardFileRecords, render: true, silent: true });
  showToast("Arquivo ativo atualizado.", "good", 4200);
}

async function deleteDashboardFiles(fileRecords = []) {
  const permissions = getActionPermissions();
  if (!permissions.canDeleteFile) {
    showToast(permissions.isLoggedIn ? "Apenas administradores podem realizar esta ação." : "Faça login para acessar esta função.", "warn", 5200);
    if (permissions.isLoggedIn) showPermissionDeniedState();
    return;
  }

  if (!window.supabaseClient) {
    showToast("Supabase não está configurado para remover arquivos.", "error", 5200);
    return;
  }

  const recordsById = new Map();
  fileRecords
    .filter(isUsableDashboardFileRecord)
    .forEach((record) => {
      if (record?.id) recordsById.set(record.id, record);
    });
  const records = Array.from(recordsById.values());
  if (!records.length) {
    showToast("Nenhum arquivo válido selecionado.", "warn", 5000);
    return;
  }

  const storagePaths = records.map((record) => record.storage_path).filter(Boolean);
  if (storagePaths.length) {
    const { error: storageError } = await window.supabaseClient.storage.from("dashboard-files").remove(storagePaths);

    if (storageError) {
      console.error("Erro ao remover do storage:", storageError);
      showToast("Um ou mais arquivos não foram encontrados no Storage. Removendo registros do painel.", "warn", 5200);
    }
  }

  await deleteProcessedRowsForDashboardFiles(records);

  const { error: dbError } = await window.supabaseClient
    .from("dashboard_files")
    .delete()
    .in("id", records.map((record) => record.id));

  if (dbError) {
    console.error("Erro ao remover registros:", dbError);
    showToast("Erro ao remover registros dos arquivos.", "error", 5200);
    return;
  }

  await Promise.all(
    records.map((record) =>
      logAudit("delete_file", "dashboard_file", record.id, {
        file_name: record.file_name,
        storage_path: record.storage_path,
      }),
    ),
  );

  selectedSettingsFileIds.clear();
  const deletedIds = new Set(records.map((record) => record.id));
  dashboardFileRecords = dashboardFileRecords.filter((record) => !deletedIds.has(record.id));
  library.datasets = (Array.isArray(library.datasets) ? library.datasets : []).filter((dataset) => !deletedIds.has(dataset.id));
  packageManagementRowsLoadedKey = "";
  pnrRowsLoadedKey = "";
  pnrRows = [];
  resetDerivedDataCache();

  const files = await loadDashboardFilesFromSupabase({ loadActive: true, render: true, validateStorage: true, showLoading: false });
  if (!files.length) {
    clearDashboardData({ render: true, preserveRecords: false });
  }
  renderSettingsFileManagement();
  showToast(records.length === 1 ? "Arquivo excluído com sucesso." : "Arquivos excluídos com sucesso.", "good", 4200);
}

async function deleteProcessedRowsForDashboardFiles(records = []) {
  if (!window.supabaseClient) return;
  const grouped = new Map();
  (Array.isArray(records) ? records : []).forEach((record) => {
    const category = getFileRecordCategory(record);
    const tableName = getProcessedRecordsTable(category);
    if (!record?.id || !tableName) return;
    if (!grouped.has(tableName)) grouped.set(tableName, []);
    grouped.get(tableName).push(record.id);
  });

  for (const [tableName, ids] of grouped.entries()) {
    const { error } = await window.supabaseClient
      .from(tableName)
      .delete()
      .in("file_id", ids);
    if (error) {
      if (isMissingProcessedRecordsTableError(error)) {
        console.warn(`[FILES] Tabela processada ${tableName} indisponível durante exclusão.`, error);
        continue;
      }
      console.error(`[FILES] Erro ao remover registros processados de ${tableName}:`, error);
      throw error;
    }
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

function hydrateThemeControls() {
  if (el.themeToggle) {
    const label = state.theme === "dark" ? "Modo claro" : "Modo escuro";
    el.themeToggle.setAttribute("aria-label", label);
    el.themeToggle.dataset.theme = state.theme;
  }
  updateTopbar();
}

function applyTheme(theme) {
  const resolved = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
  document.body.dataset.theme = resolved;
  state.theme = resolved;
}

function canEdit() {
  return currentProfile?.is_admin === true;
}

function getActionPermissions() {
  const isLoggedIn = Boolean(currentUser);
  const isAdmin = canEdit();
  return {
    isLoggedIn,
    isAdmin,
    canDownloadReport: isLoggedIn,
    canUploadFile: isLoggedIn && isAdmin,
    canDeleteFile: isLoggedIn && isAdmin,
    canOpenSettings: isLoggedIn && isAdmin,
  };
}

function getAdminActionDeniedMessage(adminMessage = "Apenas administradores podem realizar esta ação.") {
  return getActionPermissions().isLoggedIn ? adminMessage : "Faça login para acessar esta função.";
}

function ensureReportPermission() {
  if (getActionPermissions().canDownloadReport) return true;
  showToast("Faça login para acessar esta função.", "warn", 5200);
  return false;
}

function ensureUploadPermission() {
  const permissions = getActionPermissions();
  if (permissions.canUploadFile) return true;
  showToast(permissions.isLoggedIn ? "Apenas administradores podem realizar esta ação." : "Faça login para acessar esta função.", "warn", 5200);
  if (permissions.isLoggedIn) showPermissionDeniedState();
  return false;
}

function ensureDeletePermission() {
  const permissions = getActionPermissions();
  if (permissions.canDeleteFile) return true;
  showToast(permissions.isLoggedIn ? "Apenas administradores podem realizar esta ação." : "Faça login para acessar esta função.", "warn", 5200);
  if (permissions.isLoggedIn) showPermissionDeniedState();
  return false;
}

function setActionButtonState(button, allowed, title) {
  if (!button) return;
  button.disabled = false;
  button.hidden = false;
  button.classList.toggle("is-action-blocked", !allowed);
  button.setAttribute("aria-disabled", allowed ? "false" : "true");
  if (title) {
    button.setAttribute("title", title);
    button.setAttribute("aria-label", title);
  }
}

function renderAvatarMarkup(profile, fallbackText, className = "account-avatar") {
  const name = profile?.name || fallbackText || "Usuário";
  const avatarUrl = profile?.avatar_url || "";
  if (avatarUrl) {
    return `<span class="${className}"><img src="${escapeAttribute(avatarUrl)}" alt="${escapeAttribute(name)}" /></span>`;
  }
  return `<span class="${className}">${escapeHtml(getProfileInitials(name))}</span>`;
}

function updateAccessControls() {
  const permissions = getActionPermissions();
  const accountMenuOpen = Boolean(state.accountPanelOpen);
  const showLogin = accountMenuOpen && !currentUser;
  const roleLabel = permissions.isAdmin ? "Admin" : "Visualização";
  const accountName = getProfileDisplayName();
  const accountEmail = currentProfile?.email || currentUser?.email || "";

  if (el.authStatus) {
    el.authStatus.textContent = currentUser ? roleLabel : "Login necessário";
    el.authStatus.dataset.state = currentUser ? (permissions.isAdmin ? "admin" : "user") : "required";
  }
  if (el.authNote) {
    el.authNote.textContent = currentUser
      ? `${accountEmail} · ${permissions.isAdmin ? "pode editar e administrar" : "somente relatório"}`
      : "Entre com sua conta para acessar relatório e permissões.";
  }
  if (el.authLogin) el.authLogin.hidden = Boolean(currentUser);
  if (el.authSignup) el.authSignup.hidden = Boolean(currentUser);
  if (el.authLogout) el.authLogout.hidden = !currentUser;
  if (el.accountIdentity) {
    el.accountIdentity.hidden = !currentUser;
    el.accountIdentity.innerHTML = currentUser
      ? `${renderAvatarMarkup(currentProfile, accountName)}<div><strong>${escapeHtml(accountName)}</strong><span>${escapeHtml(accountEmail)}</span></div>`
      : "";
  }
  setActionButtonState(el.reportButton, permissions.canDownloadReport, permissions.canDownloadReport ? "Baixar relatório." : "Faça login para usar esta função.");
  setActionButtonState(
    el.uploadButton,
    permissions.canUploadFile,
    permissions.canUploadFile
      ? "Importar Excel"
      : permissions.isLoggedIn
        ? "Somente administradores podem usar esta função."
        : "Faça login para usar esta função.",
  );
  renderSettingsFileManagement();
  if (el.usersCard) el.usersCard.hidden = true;
  if (el.accountCard) el.accountCard.hidden = !showLogin;
  if (el.accountToggle) {
    el.accountToggle.dataset.state = currentUser ? (permissions.isAdmin ? "admin" : "user") : "required";
    el.accountToggle.classList.toggle("is-active", accountMenuOpen);
    el.accountToggle.classList.toggle("has-avatar", Boolean(currentUser));
    if (currentUser) {
      el.accountToggle.innerHTML = renderAvatarMarkup(currentProfile, accountName, "account-toggle-avatar");
    } else {
      el.accountToggle.innerHTML = `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-4.42 0-8 1.79-8 4v2h16v-2c0-2.21-3.58-4-8-4Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"></path>
        </svg>
      `;
    }
    el.accountToggle.setAttribute("aria-expanded", accountMenuOpen ? "true" : "false");
  }
  if (el.accountMenu) {
    el.accountMenu.hidden = !accountMenuOpen;
    el.accountMenu.classList.toggle("is-open", accountMenuOpen);
    const profileButton = el.accountMenu.querySelector('[data-account-page="profile"]');
    const settingsButton = el.accountMenu.querySelector('[data-account-page="settings"]');
    if (profileButton) profileButton.hidden = !currentUser;
    if (settingsButton) settingsButton.hidden = !permissions.isAdmin;
    positionAccountMenu();
  }
  renderUsers();
  renderSettingsFileManagement();
}

function bindSupabaseAuthState() {
  if (supabaseAuthListenerBound || !window.supabaseClient?.auth) return;
  supabaseAuthListenerBound = true;
  window.supabaseClient.auth.onAuthStateChange((event, session) => {
    debugAuth("[AUTH STATE]", event, session);
    if (event === "INITIAL_SESSION") return;
    if (!session?.user) {
      currentUser = null;
      currentProfile = null;
      knownUsers = [];
      auditLogs = [];
      clearDashboardData({ render: false, preserveRecords: false });
      updateAccessControls();
      renderAccountPage();
      renderAll();
      return;
    }
    if (hasInitialLoadCompleted && currentUser?.id === session.user.id) {
      currentUser = session.user;
      updateAccessControls();
      return;
    }
    window.setTimeout(() => {
      void applyAuthenticatedUser(session.user, {
        showProfileWarning: event !== "INITIAL_SESSION",
      });
    }, 0);
  });
}

async function loadCurrentSession(options = {}) {
  const shouldShowLoading = options.showLoading === true || (!hasInitialLoadCompleted && !hasLoadedDashboardData());
  if (shouldShowLoading) setDashboardVisualState("loading-session");
  if (!window.supabaseClient?.auth) {
    currentUser = null;
    currentProfile = null;
    knownUsers = [];
    auditLogs = [];
    globalGoalSettings = getDefaultGoalSettings();
    if (shouldShowLoading || !hasLoadedDashboardData()) setDashboardVisualState("supabase-error", { render: false });
    updateAccessControls();
    renderAccountPage();
    renderAll();
    return;
  }
  try {
    const { data, error } = await window.supabaseClient.auth.getSession();
    debugAuth("[SESSION] Data:", data);
    debugAuth("[SESSION] Error:", error);
    if (error) throw error;

    const session = data?.session;
    debugAuth("[SESSION] Sessão atual:", session);
    if (!session?.user) {
      currentUser = null;
      currentProfile = null;
      knownUsers = [];
      auditLogs = [];
      globalGoalSettings = getDefaultGoalSettings();
      clearDashboardData({ render: false, preserveRecords: false });
      setDashboardVisualState("", { render: false });
      updateAccessControls();
      renderAccountPage();
      renderAll();
      return;
    }

    return applyAuthenticatedUser(session.user, options);
  } catch (error) {
    console.error("Erro ao carregar sessão:", error);
    currentUser = null;
    currentProfile = null;
    knownUsers = [];
    auditLogs = [];
    globalGoalSettings = getDefaultGoalSettings();
    clearDashboardData({ render: false, preserveRecords: false });
    if (shouldShowLoading || !hasLoadedDashboardData()) setDashboardVisualState("supabase-error", { render: false });
    updateAccessControls();
    renderAccountPage();
    renderAll();
    if (options.showSessionWarning) {
      showToast("Login feito, mas houve erro ao carregar a sessão.", "warn", 5600);
    }
  }
}

async function applyAuthenticatedUser(user, options = {}) {
  if (hasInitialLoadCompleted && currentUser?.id === user.id && options.forceReload !== true) {
    currentUser = user;
    updateAccessControls();
    renderAccountPage();
    return { user: currentUser, profile: currentProfile };
  }
  if (isLoadingDashboardData && options.forceReload !== true) {
    return { user: currentUser || user, profile: currentProfile };
  }
  currentUser = user;
  try {
    currentProfile = await loadUserProfile(user);
  } catch (profileError) {
    console.error("[PROFILE] Erro ao carregar profile:", profileError);
    currentProfile = buildFallbackProfile(user);
    if (options.showProfileWarning) {
      showToast("Login realizado, mas houve erro ao carregar o perfil.", "warn", 5600);
    }
  }

  debugAuth("[SESSION] Usuário:", currentUser);
  debugAuth("[SESSION] Profile:", currentProfile);
  debugAuth("[PROFILE] Perfil carregado:", currentProfile);
  debugAuth("[PROFILE] is_admin:", currentProfile?.is_admin);

  await loadGlobalGoalSettings();

  if (canEdit()) {
    await loadUsers();
    await loadAuditLogs();
  } else {
    knownUsers = [];
    auditLogs = [];
  }

  await loadDashboardFilesFromSupabase({
    loadActive: true,
    render: false,
    showLoading: options.showLoading === true || (!hasInitialLoadCompleted && !hasLoadedDashboardData()),
  });
  hasInitialLoadCompleted = true;
  updateAccessControls();
  updateDatasetMeta();
  renderAccountPage();
  renderSettingsFileManagement();
  renderAll();
  return { user: currentUser, profile: currentProfile };
}

function buildFallbackProfile(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.user_metadata?.name || user.email || "Usuário",
    role: "user",
    is_admin: false,
    cargo: "",
    setor: "LOSS",
    avatar_url: "",
  };
}

async function loadUserProfile(user) {
  const fallbackProfile = buildFallbackProfile(user);

  let { data: profile, error } = await window.supabaseClient
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  debugAuth("[PROFILE] Data:", profile);
  debugAuth("[PROFILE] Error:", error);

  if (error) {
    console.error("[PROFILE] Erro ao buscar profile:", error);
    throw error;
  }

  if (!profile) {
    const { data: createdProfile, error: createError } = await window.supabaseClient
      .from("profiles")
      .insert(fallbackProfile)
      .select()
      .single();

    if (createError) {
      console.error("[PROFILE] Erro ao criar profile:", createError);
      throw createError;
    }

    profile = createdProfile;
  }

  return profile;
}

async function loginUser(event) {
  event?.preventDefault();
  debugAuth("[LOGIN] Clique no botão Entrar");
  const email = String(el.authEmail?.value || "").trim();
  const password = String(el.authPassword?.value || "");
  debugAuth("[LOGIN] Email digitado:", email);
  debugAuth("[LOGIN] Supabase client:", window.supabaseClient);
  debugAuth("[LOGIN] AuthService:", window.authService);
  if (!email || password.length < 6) {
    showToast("Informe email e senha com pelo menos 6 caracteres.", "warn", 5200);
    return;
  }
  if (!window.supabaseClient?.auth) {
    showToast("Configuração do Supabase não encontrada.", "error", 5200);
    return;
  }
  try {
    debugAuth("[LOGIN] Iniciando:", email);
    const { data, error } = await window.supabaseClient.auth.signInWithPassword({
      email,
      password,
    });
    debugAuth("[LOGIN] Resultado Supabase:", data);
    debugAuth("[LOGIN] Erro Supabase:", error);

    if (error) {
      const message = String(error?.message || "").toLowerCase();
      if (message.includes("invalid login credentials")) {
        showToast("E-mail ou senha inválidos.", "error", 5200);
        return;
      }
      if (message.includes("email not confirmed")) {
        showToast("Confirme seu e-mail antes de acessar.", "warn", 5600);
        return;
      }
      showToast("Erro ao fazer login. Verifique o Supabase.", "error", 6200);
      return;
    }

    if (!data?.user) {
      showToast("Login não retornou usuário.", "error", 5200);
      return;
    }

    currentUser = data.user;
    try {
      await applyAuthenticatedUser(data.user, { showProfileWarning: true });
    } catch (profileError) {
      console.error("[PROFILE] Erro ao carregar profile:", profileError);
      currentProfile = buildFallbackProfile(data.user);
      updateAccessControls();
      updateDatasetMeta();
      renderAccountPage();
      renderSettingsFileManagement();
      showToast("Login realizado, mas houve erro ao carregar o perfil.", "warn", 5600);
    }

    if (el.authPassword) el.authPassword.value = "";
    await logAudit("login", "auth", currentUser.id, {
      email: currentUser.email,
    });
    if (canEdit()) void loadAuditLogs();
    showToast("Login realizado com sucesso.", "good", 4200);
    setAccountMenuOpen(false);
  } catch (error) {
    console.error("[LOGIN] Erro inesperado:", error);
    const message = String(error?.message || "").toLowerCase();
    if (message.includes("invalid login credentials")) {
      showToast("E-mail ou senha inválidos.", "error", 5200);
      return;
    }
    if (message.includes("email not confirmed")) {
      showToast("Confirme seu e-mail antes de acessar.", "warn", 5600);
      return;
    }
    showToast("Não foi possível conectar ao Supabase.", "error", 6200);
  }
}

async function signupUser() {
  const email = String(el.authEmail?.value || "").trim();
  const password = String(el.authPassword?.value || "");
  const name = email ? email.split("@")[0] : "Usuário";
  if (!email || password.length < 6) {
    showToast("Informe email e senha com pelo menos 6 caracteres.", "warn", 5200);
    return;
  }
  if (!window.authService) {
    showToast("Configuração do Supabase não encontrada.", "error", 5200);
    return;
  }
  try {
    await window.authService.registerUser({ email, password, name });
    if (el.authPassword) el.authPassword.value = "";
    await loadCurrentSession();
    showToast("Acesso criado. Verifique se é necessário confirmar o e-mail.", "good", 5600);
  } catch (error) {
    console.error("Erro ao criar acesso:", error);
    showToast("Não foi possível criar o acesso.", "error", 5200);
  }
}

async function logoutUser() {
  try {
    const logoutUserId = currentUser?.id;
    const logoutEmail = currentUser?.email;
    if (logoutUserId) {
      await logAudit("logout", "auth", logoutUserId, {
        email: logoutEmail,
      });
    }
    if (window.supabaseClient?.auth) {
      await window.supabaseClient.auth.signOut();
    } else if (window.authService) {
      await window.authService.logout();
    }
  } catch (error) {
    console.error("[LOGOUT] Erro:", error);
    showToast("Não foi possível sair da conta.", "error", 5200);
    return;
  }
  currentUser = null;
  currentProfile = null;
  knownUsers = [];
  auditLogs = [];
  globalGoalSettings = getDefaultGoalSettings();
  if (pendingAvatarPreviewUrl) URL.revokeObjectURL(pendingAvatarPreviewUrl);
  if (pendingAvatarSourceUrl) URL.revokeObjectURL(pendingAvatarSourceUrl);
  pendingAvatarFile = null;
  pendingAvatarPreviewUrl = "";
  pendingAvatarSourceUrl = "";
  state.appView = "dashboard";
  state.accountPanelOpen = true;
  clearDashboardData({ render: false, preserveRecords: false });
  updateAccessControls();
  renderAccountPage();
  renderAll();
  showToast("Sessão encerrada.", "info", 4200);
}

async function loadUsers() {
  if (!canEdit() || !window.authService) return;
  try {
    const users = await window.authService.getUsers();
    knownUsers = Array.isArray(users) ? users : [];
    renderUsers();
  } catch (error) {
    console.error(error);
    showToast("Não foi possível carregar usuários.", "warn", 5200);
  }
}

async function logAudit(action, entityType, entityId, details = {}) {
  try {
    if (!currentUser || !window.supabaseClient) return;

    await window.supabaseClient
      .from("audit_logs")
      .insert({
        user_id: currentUser.id,
        user_email: currentUser.email,
        action,
        entity_type: entityType,
        entity_id: entityId ? String(entityId) : null,
        details,
      });
  } catch (error) {
    console.warn("[AUDIT] Falha ao registrar auditoria:", error);
  }
}

async function loadAuditLogs() {
  if (!canEdit() || !window.supabaseClient) {
    auditLogs = [];
    renderAuditLogs();
    return [];
  }
  try {
    const { data, error } = await window.supabaseClient
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("Erro ao carregar auditoria:", error);
      showToast("Erro ao carregar auditoria.", "warn", 5200);
      auditLogs = [];
      renderAuditLogs();
      return [];
    }

    auditLogs = data || [];
    renderAuditLogs();
    return auditLogs;
  } catch (error) {
    console.error("Erro ao carregar auditoria:", error);
    auditLogs = [];
    renderAuditLogs();
    return [];
  }
}

async function updateUserRole(userId, role) {
  if (!userId || !canEdit() || !window.authService) return;
  try {
    const users = knownUsers.length ? knownUsers : await window.authService.getUsers();
    const admins = users.filter((user) => user.is_admin === true || user.isAdmin === true || user.role === "admin");
    const target = users.find((user) => String(user.id) === String(userId));
    const targetIsAdmin = target?.is_admin === true || target?.isAdmin === true || target?.role === "admin";
    const nextIsAdmin = role === "admin";
    if (targetIsAdmin && !nextIsAdmin && admins.length <= 1) {
      showToast("Não é possível remover o último administrador.", "warn", 5200);
      return;
    }
    await window.authService.updateUserAdmin(userId, nextIsAdmin);
    await logAudit("update_user_admin", "profile", userId, {
      is_admin: nextIsAdmin,
    });
    await loadUsers();
    if (canEdit()) void loadAuditLogs();
    if (currentUser?.id === userId) {
      const current = await window.authService.getCurrentProfile();
      currentUser = current?.user || currentUser;
      currentProfile = current?.profile || currentProfile;
    }
    renderAll();
    showToast("Permissão atualizada.", "good", 4200);
  } catch (error) {
    console.error(error);
    showToast("Não foi possível atualizar permissão.", "error", 5200);
  }
}

async function updateUserProfileField(userId, field, value) {
  if (!userId || !canEdit() || !window.authService) {
    showToast("Apenas administradores podem alterar dados dos usuários.", "warn", 5200);
    return;
  }
  if (field !== "setor" && field !== "cargo") return;
  try {
    const updates = {
      [field]: String(value || "").trim(),
    };
    const updated = field === "setor"
      ? await window.authService.updateUserSetor(userId, updates[field])
      : await window.authService.updateUserProfileFields(userId, updates);
    if (field === "setor") {
      await logAudit("update_user_setor", "profile", userId, {
        setor: updates[field],
      });
      if (canEdit()) void loadAuditLogs();
    }
    knownUsers = knownUsers.map((user) => (String(user.id) === String(userId) ? { ...user, ...updated } : user));
    if (currentUser?.id === userId) {
      currentProfile = { ...currentProfile, ...updated };
    }
    renderSettingsPage();
    renderProfilePage();
    updateAccessControls();
    showToast(field === "setor" ? "Setor atualizado." : "Cargo atualizado.", "good", 3600);
  } catch (error) {
    console.error("Erro ao atualizar usuário:", error);
    showToast(field === "setor" ? "Erro ao atualizar setor." : "Erro ao atualizar cargo.", "error", 5200);
  }
}

function renderUsers() {
  if (!el.usersList || !el.usersCount) return;
  el.usersCount.textContent = integer.format(knownUsers.length);
  if (!canEdit()) {
    el.usersList.innerHTML = "";
    return;
  }
  el.usersList.innerHTML = knownUsers.length
    ? knownUsers
        .map(
          (user) => {
            const isAdmin = user.is_admin === true || user.isAdmin === true || user.role === "admin";
            const name = user.name || (user.email ? user.email.split("@")[0] : "Usuário");
            const cargo = user.cargo || (isAdmin ? "Administrador" : "Usuário");
            return `
            <div class="user-row">
              <div>
                <strong>${escapeHtml(name)}</strong>
                <span>${escapeHtml(user.email || "Sem e-mail")} · ${escapeHtml(cargo)}</span>
              </div>
              <button class="secondary-button" type="button" data-user-id="${escapeAttribute(user.id)}" data-role="${isAdmin ? "user" : "admin"}">
                ${isAdmin ? "Remover admin" : "Tornar admin"}
              </button>
            </div>
          `;
          },
        )
        .join("")
    : emptyState("Sem usuários", "Crie acessos para visualizar ou administrar.");
}

async function deleteSelectedSettingsFiles() {
  if (!ensureDeletePermission()) {
    return;
  }
  const files = getSettingsFilesForActiveTab().filter((file) => selectedSettingsFileIds.has(file.id));
  if (!files.length) {
    showToast("Selecione um arquivo antes de excluir.", "warn", 5000);
    return;
  }
  const isDeviationDeletion = settingsFilesTab === DEVIATION_PNR_FILE_CATEGORY;
  const title = files.length === 1 ? "Excluir arquivo selecionado?" : `Excluir ${files.length} arquivos selecionados?`;
  const message = isDeviationDeletion
    ? "Esta ação removerá os arquivos da Gestão de Desvios e atualizará os indicadores da aba PNRs."
    : "Esta ação removerá os arquivos do painel e atualizará os indicadores. Essa ação não pode ser desfeita.";
  const confirmed = window.confirm(`${title}\n\n${message}${isDeviationDeletion ? "\n\nEssa ação não pode ser desfeita." : ""}`);
  if (!confirmed) return;
  await deleteDashboardFiles(files);
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
  const match = raw.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (match) {
    const [, d, m, y, hour = "0", minute = "0"] = match;
    const ts = Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hour), Number(minute));
    return {
      iso: `${y}-${m}-${d}`,
      ts,
    };
  }

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (isoMatch) {
    const [, y, m, d, hour = "0", minute = "0"] = isoMatch;
    const ts = Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hour), Number(minute));
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

function normalizarValorGestao(value) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.abs(Number(value.toFixed(2)));
  }
  const texto = String(value)
    .replace("R$", "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "")
    .trim();
  const numero = Number(texto);
  if (!Number.isFinite(numero)) return 0;
  return Math.abs(Number(numero.toFixed(2)));
}

function splitBase(base) {
  const raw = String(base || "").trim();
  const parts = raw
    .split(/\s+-\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const baseCode = normalizeBase(raw);
  return {
    cidade_base: parts[0] || "",
    sigla_base: parts[1] || baseCode,
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

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_\-/.]+/g, " ")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeBase(value) {
  const text = normalizeText(value);
  if (!text) return "";

  const baseCodes = text.match(/\b[A-Z]{2,4}\d{1,3}\b/g);
  if (baseCodes && baseCodes.length) return baseCodes.join("/");

  const usefulCodes = text
    .split(" ")
    .filter((part) => /^[A-Z]{2,4}\d{0,3}$/.test(part));
  if (usefulCodes.length) return usefulCodes.join("/");

  return text;
}

function getBaseIdentity(rowOrValue) {
  if (rowOrValue && typeof rowOrValue === "object") {
    return rowOrValue.base_normalizada || normalizeBase(rowOrValue.base || rowOrValue.svc || rowOrValue.estacao || rowOrValue.station || rowOrValue.unidade || rowOrValue.sigla_base);
  }
  return normalizeBase(rowOrValue);
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

function formatDateTime(value) {
  if (!value) return "—";
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return liveClockFormatter.format(parsed);
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

function debugAuth(...args) {
  if (DEBUG_AUTH_FLOW) console.log(...args);
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
  delete loadedState.pnrGoalLimit;
  delete loadedState.metaMensal;
  delete loadedState.metaAnual;
  delete loadedState.metaAnualEditada;
  loadedState.base = "Todos";
  loadedState.motorista = "Todos";
  loadedState.accountPanelOpen = false;
  loadedState.fileName = "";
  loadedState.activeDatasetId = EMPTY_DATASET_ID;
  if (loadedState.sheet === "Todos") {
    loadedState.sheet = PRE_FATURA_VIEW;
  } else if (SHEET_ORDER.includes(loadedState.sheet)) {
    loadedState.prefaturaTipo = getPrefaturaTypeForDivision(loadedState.sheet);
    loadedState.sheet = PRE_FATURA_VIEW;
  } else if (!SHEET_TABS.includes(loadedState.sheet)) {
    loadedState.sheet = PRE_FATURA_VIEW;
  }
  loadedState.prefaturaTipo = normalizeTypeSelection(loadedState.prefaturaTipo);
  loadedState.packageTipo = normalizeTypeSelection(loadedState.packageTipo);
  loadedState.prefaturaMonths = Array.isArray(loadedState.prefaturaMonths) ? loadedState.prefaturaMonths : [];
  loadedState.packageMonths = Array.isArray(loadedState.packageMonths) ? loadedState.packageMonths : [];
  loadedState.prefaturaPeriod = normalizePeriodMode(loadedState.prefaturaPeriod || loadedState.period);
  loadedState.packagePeriod = normalizePeriodMode(loadedState.packagePeriod || "month");
  loadedState.activeDesvioCategory = normalizeDeviationCategory(loadedState.activeDesvioCategory);
  loadedState.pnrQuery = String(loadedState.pnrQuery || "");
  loadedState.pnrMonths = Array.isArray(loadedState.pnrMonths) ? loadedState.pnrMonths : [];
  loadedState.pnrQuinzena = ["all", "q1", "q2"].includes(loadedState.pnrQuinzena) ? loadedState.pnrQuinzena : "all";
  loadedState.pnrStatus = normalizePnrSelectValue(loadedState.pnrStatus);
  loadedState.pnrTipoOperacional = normalizePnrSelectValue(loadedState.pnrTipoOperacional);
  loadedState.pnrEstacao = normalizePnrSelectValue(loadedState.pnrEstacao);
  loadedState.period = loadedState.prefaturaPeriod;
  loadedState.tipo = "Todos";
  return loadedState;
}

function persistState() {
  try {
    const {
      fileName,
      activeDatasetId,
      pnrGoalLimit,
      metaMensal,
      metaAnual,
      metaAnualEditada,
      ...visualPreferences
    } = state;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(visualPreferences));
  } catch {
    // no-op
  }
}

function loadLibrary() {
  return {
    activeDatasetId: EMPTY_DATASET_ID,
    datasets: [buildEmptyDataset()],
  };
}

function persistLibrary() {
  try {
    window.localStorage.removeItem("alc-pre-fatura-dashboard-library-v1");
  } catch {
    // no-op
  }
}

function normalizeDatasetRecord(dataset) {
  if (!dataset || !Array.isArray(dataset.rows)) return null;
  if (dataset.id === EMPTY_DATASET_ID || dataset.source === "empty") return buildEmptyDataset();
  const fileCategory = dataset.fileCategory || getFileRecordCategory(dataset.remoteRecord) || inferRowsFileCategory(dataset.rows);
  const rows = fileCategory === DEVIATION_PNR_FILE_CATEGORY
    ? dataset.rows.map(normalizePnrStoredRow).filter(Boolean)
    : fileCategory === PACKAGE_MANAGEMENT_FILE_CATEGORY
      ? dataset.rows.map(normalizePackageManagementStoredRow).filter(Boolean)
      : consolidateLinkedOccurrences(dataset.rows);
  return {
    id: String(dataset.id || makeDatasetId(dataset.fileName || "arquivo")),
    fileName: String(dataset.fileName || "arquivo.xlsx"),
    label: String(getDashboardFileDisplayName({ ...dataset, fileCategory })),
    source: String(dataset.source || "upload"),
    importedAt: dataset.importedAt || new Date().toISOString(),
    remoteRecord: dataset.remoteRecord || null,
    storagePath: dataset.storagePath || dataset.remoteRecord?.storage_path || "",
    fileCategory,
    rows,
  };
}

function upsertDataset(dataset) {
  const normalized = normalizeDatasetRecord(dataset);
  if (!normalized) return;
  resetDerivedDataCache();
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
  if (reference.source === "filtered") {
    return {
      rows: Array.isArray(reference.rows) ? reference.rows.slice() : [],
      datasets: Array.isArray(reference.scopedDatasets) ? reference.scopedDatasets : [reference],
      label: reference.label || "Período filtrado",
    };
  }
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
    .filter((dataset) => dataset && dataset.source !== "filtered" && dataset.id !== EMPTY_DATASET_ID && Array.isArray(dataset.rows) && dataset.rows.length)
    .filter((dataset) => getDatasetPeriod(dataset).key === monthKey)
    .sort((a, b) => {
      const qa = getDatasetQuarterOrder(a);
      const qb = getDatasetQuarterOrder(b);
      return qa - qb || String(a.label || "").localeCompare(String(b.label || ""), "pt-BR");
    });
}

function getDatasetsForYear(year) {
  return library.datasets
    .filter((dataset) => dataset && dataset.source !== "filtered" && dataset.id !== EMPTY_DATASET_ID && Array.isArray(dataset.rows) && dataset.rows.length)
    .filter((dataset) => String(getDatasetPeriod(dataset).key).startsWith(`${year}-`))
    .sort((a, b) => {
      const pa = getDatasetPeriod(a);
      const pb = getDatasetPeriod(b);
      return pa.sort - pb.sort || getDatasetQuarterOrder(a) - getDatasetQuarterOrder(b) || String(a.label || "").localeCompare(String(b.label || ""), "pt-BR");
    });
}

function getDatasetQuarterMode(dataset) {
  if (dataset?.remoteRecord) return getFileRecordPeriod(dataset.remoteRecord).periodType;
  const text = `${dataset?.label || ""} ${dataset?.fileName || ""}`;
  const labelQuarter = detectQuinzena(text);
  if (labelQuarter.includes("1")) return "q1";
  if (labelQuarter.includes("2")) return "q2";
  const rows = Array.isArray(dataset?.rows) ? dataset.rows : [];
  const days = rows
    .map((row) => {
      const date = row.data_normalizada
        ? new Date(`${row.data_normalizada}T00:00:00Z`)
        : (row.dataCaso || row.data_caso)
          ? new Date(`${row.dataCaso || row.data_caso}T00:00:00Z`)
          : row.data_sort
            ? new Date(row.data_sort)
            : null;
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
  if (identificarTipoArquivo(fileName) === PACKAGE_MANAGEMENT_FILE_CATEGORY) {
    return buildPackageManagementDisplayName(fileName);
  }
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
  const evolutionLabel = formatEvolutionPeriodLabel(dataset);
  if (evolutionLabel !== "Período") return evolutionLabel;
  const label = String(dataset.label || humanizeWorkbookName(dataset.fileName || ""));
  const period = detectQuinzena(label) || detectQuinzena(dataset.fileName || "");
  const month = detectMonth(label) || detectMonthFromRows(dataset.rows);
  const year = detectYear(label) || detectYearFromRows(dataset.rows);
  if (month && period) return `${compactQuinzena(period)} ${capitalize(month)}${year ? ` ${year}` : ""}`;
  return isInvalidEvolutionPeriodLabel(label) ? "Período" : label;
}

function formatEvolutionPeriodLabel(datasetOrFile, viewMode = "biweekly") {
  const file = datasetOrFile?.remoteRecord || datasetOrFile || {};
  const period = getDatasetPeriod(datasetOrFile);
  const monthKey = normalizeReferenceMonth(file.reference_month || file.metadata?.reference_month || String(period.key || "").slice(5, 7));
  const month = monthKey || detectMonth(file.file_name || datasetOrFile?.label || datasetOrFile?.fileName || "") || detectMonthFromRows(datasetOrFile?.rows || []);
  const rawPeriodType = file.period_type || file.metadata?.period_type || "";
  const periodText = `${file.period_label || ""} ${file.metadata?.period_label || ""} ${rawPeriodType} ${file.file_name || ""}`;
  const periodType = normalizePeriodMode(rawPeriodType || getPeriodModeFromLabel(periodText) || getDatasetQuarterMode(datasetOrFile));
  const label = formatEvolutionLabel({
    month,
    year: file.reference_year || file.metadata?.reference_year || String(period.key || "").slice(0, 4),
    periodLabel: periodText || datasetOrFile?.label || datasetOrFile?.fileName || "",
    periodType,
    viewMode,
  });
  return isInvalidEvolutionPeriodLabel(label) ? "Período" : label;
}

function formatEvolutionLabel({ month, periodLabel = "", periodType = "", viewMode = "monthly" }) {
  const monthLabel = getMonthAbbr(month) || "MÊS";
  if (viewMode === "monthly") return monthLabel;
  const periodFromLabel = getPeriodModeFromLabel(periodLabel);
  const normalizedType = normalizePeriodMode(periodType || periodFromLabel);
  if (normalizedType === "q1") return `1Q ${monthLabel}`;
  if (normalizedType === "q2") return `2Q ${monthLabel}`;
  if (periodFromLabel === "q1") return `1Q ${monthLabel}`;
  if (periodFromLabel === "q2") return `2Q ${monthLabel}`;
  return monthLabel;
}

function getMonthAbbr(value) {
  const number = normalizeReferenceMonth(value);
  if (number) return MONTH_ABBR[Number(number) - 1] || "";
  const detected = monthNumber(value);
  return detected ? MONTH_ABBR[detected - 1] || "" : "";
}

function isInvalidEvolutionPeriodLabel(label) {
  const text = String(label || "").trim();
  if (!text || /^(undefined|null|nan)$/i.test(text)) return true;
  if (/^(?:19|20)?\d{2,4}$/.test(text)) return true;
  if (/^\d{1,2}$/.test(text)) return true;
  return false;
}

function compactQuinzena(period) {
  return String(period || "")
    .replace("1ª quinzena", "1ªQ")
    .replace("2ª quinzena", "2ªQ");
}

function detectQuinzena(text) {
  const normalized = normalize(text);
  if (/(^|\s)(1\s*q|1q|1a quinzena|1ª quinzena|primeira quinzena)(\s|$)/i.test(normalized)) return "1ª quinzena";
  if (/(^|\s)(2\s*q|2q|2a quinzena|2ª quinzena|segunda quinzena)(\s|$)/i.test(normalized)) return "2ª quinzena";
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

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
const PREFATURA_VIEW_OVERVIEW = "overview";
const PREFATURA_VIEW_EVOLUTION = "evolucao_mensal";
const PRE_FATURA_FILE_CATEGORY = "PRE_FATURA";
const PACKAGE_MANAGEMENT_FILE_CATEGORY = "GESTAO_PACOTES";
const DEVIATION_PNR_FILE_CATEGORY = "DESVIOS_PNR";
const DEVIATION_CATEGORY_PNRS = "PNRS";
const DASHBOARD_MODULE_KEYS = {
  preFatura: "pre-fatura",
  evolucao: "evolucao-mensal",
  pacotes: "gestao-pacotes",
  desviosPnr: "gestao-desvios-pnr",
};
const DASHBOARD_MODULE_LABELS = {
  [DASHBOARD_MODULE_KEYS.preFatura]: "Pré-Fatura",
  [DASHBOARD_MODULE_KEYS.evolucao]: "Evolução Mensal",
  [DASHBOARD_MODULE_KEYS.pacotes]: "Gestão de Pacotes",
  [DASHBOARD_MODULE_KEYS.desviosPnr]: "Gestão de Desvios / PNRs",
};
const DASHBOARD_EMPTY_STATE_COPY = {
  [DASHBOARD_MODULE_KEYS.preFatura]: {
    title: "Base de Pré-Fatura ainda não importada.",
    description: "Envie um arquivo XLSX ou CSV para alimentar este módulo.",
  },
  [DASHBOARD_MODULE_KEYS.pacotes]: {
    title: "Base de Gestão de Pacotes ainda não importada.",
    description: "Envie um arquivo XLSX ou CSV para alimentar este módulo.",
  },
  [DASHBOARD_MODULE_KEYS.desviosPnr]: {
    title: "Base de PNRs ainda não importada.",
    description: "Envie um arquivo XLSX ou CSV para alimentar este módulo.",
  },
  [DASHBOARD_MODULE_KEYS.evolucao]: {
    title: "Sem dados disponíveis para evolução.",
    description: "Importe as bases necessárias para gerar os indicadores.",
  },
};
const DEVIATION_CATEGORIES = [
  { key: DEVIATION_CATEGORY_PNRS, label: "PNRs", enabled: true },
];
const PREFATURA_CATEGORIES = [
  { key: PREFATURA_VIEW_OVERVIEW, label: "Visão geral", enabled: true },
  { key: PREFATURA_VIEW_EVOLUTION, label: "Evolução mensal", enabled: true },
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
const PNR_REQUIRED_HEADER_GROUPS = [
  { label: "ID DE ENVIO", aliases: ["ID DE ENVIO", "ID ENVIO", "ID DO ENVIO", "ENVIO", "PACOTE", "ID DO PACOTE", "ID PACOTE", "SHIPMENT ID", "SHIPMENT_ID"] },
  { label: "STATUS", aliases: ["STATUS"] },
  { label: "ID DA ROTA", aliases: ["ID DA ROTA", "ID ROTA", "ROTA", "ROUTE ID", "ROUTE_ID"] },
  { label: "PRODUTOS", aliases: ["PRODUTOS", "PRODUTO", "PRODUCTS", "PRODUCT"] },
  { label: "PERÍODO DE FATURAMENTO ou QUINZENA REF.", aliases: ["PERÍODO DE FATURAMENTO", "PERIODO DE FATURAMENTO", "PERIODO", "QUINZENA REF.", "QUINZENA REF", "QUINZENA"] },
];
const PNR_GOAL_SETTINGS_KEY = "pnr_goal";
const DEFAULT_PNR_GOAL_SETTINGS = {
  monthly_goal: 40000,
  annual_goal: 160000,
  currency: "BRL",
  goal_type: "loss_limit",
};
const DEFAULT_PNR_GOAL_LIMIT = DEFAULT_PNR_GOAL_SETTINGS.monthly_goal;
const SUPABASE_QUERY_TIMEOUT_MS = 30000;
const STORAGE_DOWNLOAD_TIMEOUT_MS = 45000;
const XLSX_PROCESS_TIMEOUT_MS = 60000;
const KEEP_RAW_UPLOADS_IN_STORAGE = false;
const PROCESSED_ONLY_STORAGE_PREFIX = "processed-only";
const PROCESSED_RECORDS_BATCH_SIZE = 500;
const PNR_PROCESSED_RECORDS_BATCH_SIZE = 100;
const PROCESSED_RECORDS_PAGE_SIZE = 1000;
const PNR_REMOTE_QUERY_DEBOUNCE_MS = 400;
const PNR_REMOTE_RPC = "desvios_pnr_dashboard";
const PNR_SUMMARY_RPC = "desvios_pnr_summary";
const PNR_TABLE_RPC = "desvios_pnr_table";
const PNR_METRICS_REFRESH_RPC = "refresh_desvios_pnr_metrics_summary";
const PNR_LIGHT_CACHE_VERSION = "pnr-dashboard-light-cache-v4";
const PNR_LIGHT_CACHE_KEY = "alc-pnr-dashboard-light-cache-v1";
const FILE_DELETE_MODES = {
  listOnly: "list-only",
  withData: "with-data",
};
let processedRecordsUnavailable = false;
let isExportingPackageExcel = false;
let isExportingPnrExcel = false;
const SHEET_ORDER = ["SVC PERDIDOS", "XPT PERDIDOS", "PNR"];
const SHEET_TABS = [PRE_FATURA_VIEW, PACKAGE_MANAGEMENT_VIEW, DEVIATION_MANAGEMENT_VIEW];
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
  preFaturaView: PREFATURA_VIEW_OVERVIEW,
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
  pnrStatusMotorista: "Todos",
  pnrFonteCruzamento: "Todos",
  pnrMotorista: "Todos",
  pnrRota: "Todos",
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
const moduleLoadingState = {
  [DASHBOARD_MODULE_KEYS.preFatura]: false,
  [DASHBOARD_MODULE_KEYS.evolucao]: false,
  [DASHBOARD_MODULE_KEYS.pacotes]: false,
  [DASHBOARD_MODULE_KEYS.desviosPnr]: false,
};
const MODULE_BASE_STATUS = {
  idle: "idle",
  loading: "loading",
  loaded: "loaded",
  empty: "empty",
  error: "error",
  refreshing: "refreshing",
};
const moduleBaseState = {
  [DASHBOARD_MODULE_KEYS.preFatura]: createModuleBaseState(),
  [DASHBOARD_MODULE_KEYS.evolucao]: createModuleBaseState(),
  [DASHBOARD_MODULE_KEYS.pacotes]: createModuleBaseState(),
  [DASHBOARD_MODULE_KEYS.desviosPnr]: createModuleBaseState(),
};
let dashboardLastError = null;
const dashboardImportState = {
  active: false,
  moduleKey: "",
  fileName: "",
  fileType: "",
  stage: "",
  progress: 0,
  sheetName: "",
  sheetIndex: 0,
  sheetCount: 0,
  rowsRead: 0,
  rowsImported: 0,
  duplicatesIgnored: 0,
  ignoredSheets: [],
  importedSheets: [],
  status: "",
  updatedAt: "",
};
let isRefreshingFilesList = false;
let dashboardPermissionTimer = null;
let liveClockTimer = null;
let accountMenuCloseTimer = null;
let comparisonTooltipHideTimer = null;
let searchDebounceTimer = null;
let pnrSearchDebounceTimer = null;
let activeComparisonTooltipColumn = null;
let evolutionTooltipHideTimer = null;
let activeEvolutionTooltipBar = null;
let packageMixTooltipHideTimer = null;
let activePackageMixSegment = null;
let donutTooltipHideTimer = null;
let isPreFaturaCategoryMenuOpen = false;
let isDeviationCategoryMenuOpen = false;
let activePnrFilterMenu = "";
let isPnrSearchExpanded = false;
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
let pnrRemoteRequestId = 0;
let pnrRemoteDebounceTimer = null;
const pnrRemoteState = {
  key: "",
  source: "",
  rows: [],
  total: 0,
  summary: null,
  statusRows: [],
  operationRows: [],
  stationRows: [],
  driverRows: [],
  evolutionRows: [],
  monthOptions: [],
  filterOptions: {
    statuses: [],
    tipos: [],
    estacoes: [],
    statusMotoristas: [],
    fontesCruzamento: [],
    motoristas: [],
    rotas: [],
  },
  summaryKey: "",
  tableKey: "",
  cacheSignature: "",
  cacheMeta: null,
  lastProcessedAt: "",
  processingStatus: "",
  loadingSummary: false,
  loadingCharts: false,
  loadingTable: false,
  error: "",
};
const derivedDataCache = {
  prefaturaKey: "",
  prefaturaRows: [],
  packageKey: "",
  packageRows: [],
  pnrKey: "",
  pnrRows: [],
  pnrAggregatesKey: "",
  pnrAggregates: null,
  pnrSortKey: "",
  pnrSortedRows: [],
  pnrPageKey: "",
  pnrPagedRows: [],
  pnrFilterOptionsKey: "",
  pnrFilterOptions: null,
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
  resetPnrRuntimeCache({ includeProcessed: true });
  derivedDataCache.packageMonthOptionsKey = "";
  derivedDataCache.packageMonthOptions = [];
}

function resetPnrRuntimeCache(options = {}) {
  derivedDataCache.pnrKey = "";
  derivedDataCache.pnrRows = [];
  derivedDataCache.pnrAggregatesKey = "";
  derivedDataCache.pnrAggregates = null;
  derivedDataCache.pnrSortKey = "";
  derivedDataCache.pnrSortedRows = [];
  derivedDataCache.pnrPageKey = "";
  derivedDataCache.pnrPagedRows = [];
  if (options.includeProcessed) {
    derivedDataCache.pnrFilterOptionsKey = "";
    derivedDataCache.pnrFilterOptions = null;
  }
  derivedDataCache.pnrMonthOptionsKey = "";
  derivedDataCache.pnrMonthOptions = [];
  if (options.includeProcessed) pnrDriverEnrichmentKey = "";
  resetPnrRemoteState();
}

function resetPnrRemoteState(options = {}) {
  pnrRemoteState.key = "";
  pnrRemoteState.source = "";
  pnrRemoteState.rows = [];
  pnrRemoteState.total = 0;
  pnrRemoteState.summary = null;
  pnrRemoteState.statusRows = [];
  pnrRemoteState.operationRows = [];
  pnrRemoteState.stationRows = [];
  pnrRemoteState.driverRows = [];
  pnrRemoteState.evolutionRows = [];
  if (options.keepOptions !== true) {
    pnrRemoteState.monthOptions = [];
    pnrRemoteState.filterOptions = {
      statuses: [],
      tipos: [],
      estacoes: [],
      statusMotoristas: [],
      fontesCruzamento: [],
      motoristas: [],
      rotas: [],
    };
  }
  pnrRemoteState.cacheSignature = "";
  pnrRemoteState.cacheMeta = null;
  pnrRemoteState.lastProcessedAt = "";
  pnrRemoteState.processingStatus = "";
  pnrRemoteState.loadingSummary = false;
  pnrRemoteState.loadingCharts = false;
  pnrRemoteState.loadingTable = false;
  pnrRemoteState.error = "";
  pnrRemoteState.summaryKey = "";
  pnrRemoteState.tableKey = "";
}

const DASHBOARD_STATE_CONFIG = {
  "loading-session": {
    state: "loading-session",
    title: "Carregando dados...",
    description: "Estamos consultando a base do painel. Isso pode levar alguns instantes.",
    loading: true,
  },
  "loading-files": {
    state: "loading-files",
    title: "Carregando dados...",
    description: "Estamos consultando a base do painel. Isso pode levar alguns instantes.",
    loading: true,
  },
  "processing-file": {
    state: "processing-file",
    title: "Importando arquivo...",
    description: "Os dados estão sendo extraídos e salvos na base do painel.",
    loading: true,
    importing: true,
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
    title: "Base ainda não importada.",
    description: "Envie um arquivo XLSX ou CSV para alimentar este módulo.",
    action: "upload",
    actionLabel: "Importar arquivo",
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
    title: "Não foi possível carregar esta seção.",
    description: "As demais áreas do painel continuam disponíveis. Tente novamente ou verifique os dados importados.",
    action: "retry",
    actionLabel: "Tentar novamente",
    error: true,
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
  el.globalPeriodFilters = document.querySelector(".global-period-filters");
  el.pnrToolbarFilters = document.getElementById("pnr-toolbar-filters");
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
        event.target.closest(".sheet-tab-wrapper--prefatura") ||
        event.target.closest(".sheet-tab-wrapper--deviation") ||
        isDropdownPortalTarget(event.target)
      ) return;
      closePackageTypeMenu();
      closeCustomFilterMenu("month");
      closeCustomFilterMenu("period");
      closePreFaturaCategoryMenu({ render: true });
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
  document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-pnr-export-excel]");
    if (!button) return;
    event.preventDefault();
    await exportPnrTableExcel(button);
  });
  document.addEventListener("input", (event) => {
    const input = event.target.closest("[data-pnr-query]");
    if (!input) return;
    state.pnrQuery = input.value || "";
    state.page = 1;
    persistState();
    setPnrSearchExpanded(Boolean(state.pnrQuery), { focus: false });
    window.clearTimeout(pnrSearchDebounceTimer);
    pnrSearchDebounceTimer = window.setTimeout(() => {
      renderAll();
      schedulePnrRemoteRefresh({ reason: "search" });
    }, PNR_REMOTE_QUERY_DEBOUNCE_MS);
  });
  document.addEventListener("click", (event) => {
    const searchToggle = event.target.closest("[data-pnr-search-toggle]");
    if (searchToggle) {
      const control = searchToggle.closest("[data-pnr-search-control]");
      const shouldExpand = !control?.classList.contains("is-expanded");
      setPnrSearchExpanded(shouldExpand, { control, focus: shouldExpand });
      return;
    }

    const filterToggle = event.target.closest("[data-pnr-filter-toggle]");
    if (filterToggle) {
      event.preventDefault();
      togglePnrFilterMenu(filterToggle.dataset.pnrFilterToggle);
      return;
    }

    const filterOption = event.target.closest("[data-pnr-filter-option]");
    if (filterOption && filterOption.tagName !== "INPUT") {
      event.preventDefault();
      applyPnrFilterValue(filterOption.dataset.pnrFilterOption, filterOption.dataset.value || "Todos");
      return;
    }

    if (!event.target.closest("[data-pnr-filter-control]") && !isDropdownPortalTarget(event.target)) closePnrFilterMenus();
  });
  document.addEventListener("change", (event) => {
    const pnrOption = event.target.closest("[data-pnr-filter-option]");
    if (pnrOption) {
      applyPnrFilterOptionChange(pnrOption);
      return;
    }
    const field = event.target.closest("[data-pnr-filter]");
    if (!field) return;
    const name = field.dataset.pnrFilter;
    applyPnrFilterValue(name, field.value || "Todos");
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
      state.pnrStatusMotorista = "Todos";
      state.pnrFonteCruzamento = "Todos";
      state.pnrMotorista = "Todos";
      state.pnrRota = "Todos";
      state.page = 1;
      closePnrFilterMenus();
      setPnrSearchExpanded(false, { focus: false });
      persistState();
      renderAll();
      schedulePnrRemoteRefresh({ reason: "clear" });
      return;
    }
    const reprocess = event.target.closest("[data-pnr-reprocess]");
    if (reprocess) {
      closePnrFilterMenus();
      pnrRemoteState.error = "";
      persistState();
      renderAll();
      schedulePnrRemoteRefresh({ immediate: true, force: true, reason: "manual" });
      return;
    }
    const pageButton = event.target.closest("[data-pnr-page]");
    if (pageButton) {
      const totalRows = getPnrCurrentTotalRows();
      const totalPages = Math.max(1, Math.ceil(totalRows / state.pageSize));
      state.page = pageButton.dataset.pnrPage === "next"
        ? Math.min(totalPages, state.page + 1)
        : Math.max(1, state.page - 1);
      persistState();
      renderPnrTableOnly();
      schedulePnrRemoteRefresh({ reason: "page" });
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
      renderPnrTableOnly();
      schedulePnrRemoteRefresh({ reason: "sort" });
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
    const preFaturaCategory = event.target.closest("[data-prefatura-category]");
    if (preFaturaCategory) {
      event.preventDefault();
      handlePreFaturaCategorySelection(preFaturaCategory.dataset.prefaturaCategory);
      return;
    }

    const preFaturaToggle = event.target.closest("[data-prefatura-toggle]");
    if (preFaturaToggle) {
      event.preventDefault();
      togglePreFaturaCategoryMenu();
      return;
    }

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
    if (state.sheet === PRE_FATURA_VIEW) state.preFaturaView = PREFATURA_VIEW_OVERVIEW;
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
    if (!isDeviationCategoryMenuOpen && !isPreFaturaCategoryMenuOpen) return;
    if (event.target.closest(".sheet-tab-wrapper--deviation") || event.target.closest(".sheet-tab-wrapper--prefatura") || isDropdownPortalTarget(event.target)) return;
    closePreFaturaCategoryMenu({ render: true });
    closeDeviationCategoryMenu({ render: true });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (activeDropdownPortalKind) {
      const closingKind = activeDropdownPortalKind;
      if (closingKind === "prefatura") closePreFaturaCategoryMenu({ render: true });
      else if (closingKind === "deviation") closeDeviationCategoryMenu({ render: true });
      else closeDropdownPortal(closingKind, { focus: true });
      event.preventDefault();
      return;
    }
    if (!isDeviationCategoryMenuOpen && !isPreFaturaCategoryMenuOpen) return;
    if (isPreFaturaCategoryMenuOpen) {
      closePreFaturaCategoryMenu({ render: true });
      el.sheetTabs?.querySelector("[data-prefatura-toggle]")?.focus();
      event.preventDefault();
      return;
    }
    closeDeviationCategoryMenu({ render: true });
    el.sheetTabs?.querySelector("[data-deviation-toggle]")?.focus();
  });

  document.addEventListener("click", (event) => {
    const preFaturaCategory = event.target.closest("body > .prefatura-category-menu [data-prefatura-category]");
    if (preFaturaCategory) {
      event.preventDefault();
      handlePreFaturaCategorySelection(preFaturaCategory.dataset.prefaturaCategory);
      return;
    }
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

function closePnrFilterMenus() {
  if (activePnrFilterMenu) closeDropdownPortal(`pnr:${activePnrFilterMenu}`, { focus: false });
  activePnrFilterMenu = "";
  document.querySelectorAll("[data-pnr-filter-menu]").forEach((menu) => {
    menu.hidden = true;
    menu.removeAttribute("data-dropdown-portal-menu");
  });
  document.querySelectorAll("[data-pnr-filter-toggle]").forEach((button) => {
    button.setAttribute("aria-expanded", "false");
  });
  if (String(activeDropdownPortalKind || "").startsWith("pnr:")) activeDropdownPortalKind = "";
}

function togglePnrFilterMenu(name) {
  if (!name) return;
  const nextOpen = activePnrFilterMenu === name ? "" : name;
  closePnrFilterMenus();
  activePnrFilterMenu = nextOpen;
  if (!nextOpen) return;
  const menu = document.querySelector(`[data-pnr-filter-menu="${CSS.escape(nextOpen)}"]`);
  const button = document.querySelector(`[data-pnr-filter-toggle="${CSS.escape(nextOpen)}"]`);
  if (!menu || !button) return;
  menu.hidden = false;
  button.setAttribute("aria-expanded", "true");
  openDropdownPortal(`pnr:${nextOpen}`);
}

function getPnrFilterSelectedValues(value, availableValues = []) {
  const available = (Array.isArray(availableValues) ? availableValues : []).map(String).filter(Boolean);
  const source = Array.isArray(value)
    ? value
    : String(value || "")
      .split(/[,+;|]/)
      .map((item) => item.trim())
      .filter(Boolean);
  const selected = source
    .map(String)
    .filter((item) => item && item !== "Todos" && item !== "all");
  const filtered = available.length ? selected.filter((item) => available.includes(item)) : selected;
  const unique = [...new Set(filtered)];
  if (!unique.length) return [];
  if (available.length && unique.length >= available.length) return [];
  return unique;
}

function setPnrFilterStateValue(name, values = []) {
  const next = Array.isArray(values) ? values.filter(Boolean) : [];
  if (name === "month") {
    state.pnrMonths = next;
  } else if (name === "quinzena") {
    state.pnrQuinzena = next.length ? next : "all";
  } else if (name === "status") {
    state.pnrStatus = next.length ? next : "Todos";
  } else if (name === "tipo") {
    state.pnrTipoOperacional = next.length ? next : "Todos";
  } else if (name === "estacao") {
    state.pnrEstacao = next.length ? next : "Todos";
  } else if (name === "statusMotorista") {
    state.pnrStatusMotorista = next.length ? next : "Todos";
    } else if (name === "fonteCruzamento") {
      state.pnrFonteCruzamento = next.length ? next : "Todos";
  } else if (name === "motorista") {
    state.pnrMotorista = next.length ? next : "Todos";
  } else if (name === "rota") {
    state.pnrRota = next.length ? next : "Todos";
  }
}

function getPnrFilterSelectionLabel(value, options = [], allLabel = "Todos") {
  const normalizedOptions = (Array.isArray(options) ? options : []).map((option) => ({
    value: String(typeof option === "string" ? option : option.value),
    label: String(typeof option === "string" ? option : option.label),
  })).filter((option) => option.value && option.value !== "Todos" && option.value !== "all");
  const values = getPnrFilterSelectedValues(value, normalizedOptions.map((option) => option.value));
  if (!values.length) return allLabel;
  if (values.length === 1) {
    return normalizedOptions.find((option) => option.value === values[0])?.label || values[0];
  }
  return `${values.length} selecionados`;
}

function applyPnrFilterOptionChange(input) {
  const name = input?.dataset?.pnrFilterOption;
  if (!name) return;
  const menu = input.closest("[data-pnr-filter-menu]");
  const allInputs = Array.from(menu?.querySelectorAll("[data-pnr-filter-option]") || []);
  const specificInputs = allInputs.filter((item) => item.value !== "Todos" && item.value !== "all");
  const checkedSpecific = specificInputs.filter((item) => item.checked).map((item) => item.value);
  const nextValues = input.value === "Todos" || input.value === "all"
    ? []
    : checkedSpecific.length >= specificInputs.length
      ? []
      : checkedSpecific;
  setPnrFilterStateValue(name, nextValues);
  state.page = 1;
  activePnrFilterMenu = name;
  persistState();
  renderAll();
  schedulePnrRemoteRefresh({ reason: "filter" });
}

function applyPnrFilterValue(name, value) {
  if (!name) return;
  if (name === "pageSize") {
    state.pageSize = Number(value) || 15;
    state.page = 1;
    closePnrFilterMenus();
    persistState();
    renderPnrTableOnly();
    schedulePnrRemoteRefresh({ reason: "pageSize" });
    return;
  }
  setPnrFilterStateValue(name, value === "Todos" || value === "all" ? [] : [value]);
  state.page = 1;
  closePnrFilterMenus();
  persistState();
  renderAll();
  schedulePnrRemoteRefresh({ reason: "filter" });
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
  if (kind === "prefatura") {
    const trigger = el.sheetTabs?.querySelector("[data-prefatura-toggle]");
    const localMenu = el.sheetTabs?.querySelector(".sheet-tab-wrapper--prefatura .prefatura-category-menu");
    const portalMenu = document.querySelector('[data-dropdown-portal-menu="prefatura"]');
    return {
      kind,
      trigger,
      menu: portalMenu || localMenu || document.querySelector(".prefatura-category-menu"),
      minWidth: 230,
      align: "left",
      focusTarget: trigger,
    };
  }
  if (kind === "deviation") {
    const trigger = el.sheetTabs?.querySelector("[data-deviation-toggle]");
    const localMenu = el.sheetTabs?.querySelector(".sheet-tab-wrapper--deviation .deviation-category-menu");
    const portalMenu = document.querySelector('[data-dropdown-portal-menu="deviation"]');
    return {
      kind,
      trigger,
      menu: portalMenu || localMenu || document.querySelector(".deviation-category-menu:not(.prefatura-category-menu)"),
      minWidth: 280,
      align: "left",
      focusTarget: trigger,
    };
  }
  if (String(kind || "").startsWith("pnr:")) {
    const name = String(kind).slice(4);
    const trigger = document.querySelector(`[data-pnr-filter-toggle="${CSS.escape(name)}"]`);
    const control = trigger?.closest?.("[data-pnr-filter-control]");
    const localMenu = control?.querySelector?.(`[data-pnr-filter-menu="${CSS.escape(name)}"]`);
    return {
      kind,
      trigger,
      menu: localMenu || document.querySelector(`[data-pnr-filter-menu="${CSS.escape(name)}"]`),
      minWidth: 220,
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
  if (String(kind || "").startsWith("pnr:") && activePnrFilterMenu === String(kind).slice(4)) activePnrFilterMenu = "";
  if (activeDropdownPortalKind === kind) activeDropdownPortalKind = "";
  if (options.focus) config?.focusTarget?.focus?.();
}

function closeAllFloatingDropdowns(options = {}) {
  ["type", "month", "period", "prefatura", "deviation"].forEach((kind) => closeDropdownPortal(kind, options));
  closePnrFilterMenus();
  isPreFaturaCategoryMenuOpen = false;
  isDeviationCategoryMenuOpen = false;
}

function removeDetachedDeviationMenus() {
  document.querySelectorAll("body > .prefatura-category-menu").forEach((menu) => menu.remove());
  document.querySelectorAll("body > .deviation-category-menu").forEach((menu) => menu.remove());
  if (activeDropdownPortalKind === "prefatura") activeDropdownPortalKind = "";
  if (activeDropdownPortalKind === "deviation") activeDropdownPortalKind = "";
}

function removeDetachedPnrFilterMenus() {
  document.querySelectorAll("body > [data-pnr-filter-menu], body > [data-dropdown-portal-menu^=\"pnr:\"]").forEach((menu) => menu.remove());
  if (String(activeDropdownPortalKind || "").startsWith("pnr:")) activeDropdownPortalKind = "";
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
  closePnrFilterMenus();
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
  closePnrFilterMenus();
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
  closePreFaturaCategoryMenu();
  closeDeviationCategoryMenu();
  setSearchExpanded(false, { focus: false });
  setPnrSearchExpanded(false, { focus: false });
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
  if (window.dashboardCacheService?.withTimeout) {
    return window.dashboardCacheService.withTimeout(promise, timeoutMs, message);
  }
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

function isCsvFile(fileOrName) {
  const name = String(fileOrName?.name || fileOrName?.file_name || fileOrName || "");
  const type = String(fileOrName?.type || fileOrName?.mime_type || "").toLowerCase();
  return /\.csv$/i.test(name) || type.includes("text/csv") || type.includes("application/csv");
}

function isSpreadsheetImportFile(fileOrName) {
  const name = String(fileOrName?.name || fileOrName?.file_name || fileOrName || "");
  const type = String(fileOrName?.type || fileOrName?.mime_type || "").toLowerCase();
  return /\.(csv|xlsx|xls|xltx)$/i.test(name) ||
    type.includes("text/csv") ||
    type.includes("spreadsheet") ||
    type.includes("ms-excel");
}

function getUploadFileCategory(fileName = "") {
  const currentCategory = getCurrentFileCategory();
  if (currentCategory === DEVIATION_PNR_FILE_CATEGORY || currentCategory === PACKAGE_MANAGEMENT_FILE_CATEGORY || currentCategory === PRE_FATURA_FILE_CATEGORY) {
    return currentCategory;
  }
  return identificarTipoArquivo(fileName);
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

function setPnrSearchExpanded(expanded, options = {}) {
  const control = options.control || document.querySelector("[data-pnr-search-control]");
  isPnrSearchExpanded = Boolean(expanded);
  if (!control) return;
  const shouldExpand = isPnrSearchExpanded;
  const input = control.querySelector("[data-pnr-query]");
  const toggle = control.querySelector("[data-pnr-search-toggle]");
  control.classList.toggle("is-expanded", shouldExpand);
  toggle?.setAttribute("aria-expanded", shouldExpand ? "true" : "false");
  if (shouldExpand && options.focus !== false) {
    input?.focus?.({ preventScroll: true });
    window.setTimeout(() => input?.focus?.({ preventScroll: true }), 20);
  } else if (!shouldExpand) {
    input?.blur();
    toggle?.blur();
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

function updateGlobalPeriodFiltersVisibility(isEvolutionView = state.sheet === MONTHLY_BASE_VIEW || (state.sheet === PRE_FATURA_VIEW && state.preFaturaView === PREFATURA_VIEW_EVOLUTION)) {
  const isPnrDeviationView = state.sheet === DEVIATION_MANAGEMENT_VIEW && state.activeDesvioCategory === DEVIATION_CATEGORY_PNRS;
  const hideDataFilters = isEvolutionView || state.sheet === DEVIATION_MANAGEMENT_VIEW;
  const searchFilter = el.searchInput?.closest(".global-search-filter");
  const monthFilter = el.monthFilter || el.monthSelect?.closest(".global-period-filter");
  const periodFilter = el.periodFilter || el.periodSelect?.closest(".global-period-filter");
  const typeFilter = el.typeFilter;
  const pnrToolbarFilters = ensurePnrToolbarFilters();
  [monthFilter, periodFilter].forEach((filter) => {
    if (filter) filter.hidden = hideDataFilters;
  });
  if (searchFilter) searchFilter.hidden = hideDataFilters;
  if (typeFilter) typeFilter.hidden = hideDataFilters;
  if (el.globalPeriodFilters) el.globalPeriodFilters.hidden = hideDataFilters;
  if (pnrToolbarFilters) {
    pnrToolbarFilters.hidden = !isPnrDeviationView;
    pnrToolbarFilters.innerHTML = isPnrDeviationView ? renderPnrFilterControls() : "";
  }
  if (el.viewToolbar) {
    el.viewToolbar.classList.toggle("is-evolution-view", isEvolutionView || (state.sheet === DEVIATION_MANAGEMENT_VIEW && !isPnrDeviationView));
    el.viewToolbar.classList.toggle("is-prefatura-evolution-view", state.sheet === PRE_FATURA_VIEW && state.preFaturaView === PREFATURA_VIEW_EVOLUTION);
    el.viewToolbar.classList.toggle("is-package-view", state.sheet === PACKAGE_MANAGEMENT_VIEW);
    el.viewToolbar.classList.toggle("is-pnr-view", isPnrDeviationView);
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
    const moduleKey = getDashboardModuleKeyForSheet();
    const baseState = getModuleBaseState(moduleKey);
    if (!currentUser) {
      el.datasetNote.textContent = "Faça login para carregar a base salva.";
    } else if (dashboardFilesLoading || moduleBaseCheckPending(moduleKey)) {
      el.datasetNote.textContent = "Consultando base do painel...";
    } else if (active && active.id !== EMPTY_DATASET_ID) {
      const source = currentActiveFile ? `Arquivo salvo no Supabase: ${getDashboardFileDisplayName(currentActiveFile)}.` : "O mês completo é consolidado automaticamente.";
      el.datasetNote.textContent = `${integer.format(allRows.length)} registros no recorte atual. ${source}`;
    } else if (moduleHasConfirmedBase(moduleKey)) {
      el.datasetNote.textContent = `${integer.format(Number(baseState.total || 0))} registros persistidos no Supabase. O arquivo bruto não é necessário para carregar o painel.`;
    } else if (moduleIsConfirmedEmpty(moduleKey)) {
      el.datasetNote.textContent = "Base ainda não importada. Envie um arquivo XLSX ou CSV para alimentar o painel.";
    } else if (baseState.status === MODULE_BASE_STATUS.error) {
      el.datasetNote.textContent = "Não foi possível validar a base agora. As demais áreas continuam disponíveis.";
    } else {
      el.datasetNote.textContent = "Consultando base do painel...";
    }
  }
}

function getDeletableDatasets() {
  return library.datasets.filter((dataset) => dataset && dataset.source !== "filtered" && dataset.id !== EMPTY_DATASET_ID && (dataset.source === "supabase" || (Array.isArray(dataset.rows) && dataset.rows.length)));
}

function isUsableDashboardFileRecord(record) {
  return Boolean(record && record.id && (record.storage_path || hasPersistedRowsMetadata(record)));
}

function isDashboardFileActive(file) {
  if (!file) return false;
  const status = normalizeText(file.status || file.metadata?.status || "");
  if (file.deleted_at || file.deletedAt) return false;
  if (file.metadata?.hidden_from_history === true || file.metadata?.removed_from_history === true) return false;
  if (["DELETED", "REMOVIDO", "REMOVED FROM HISTORY", "REMOVED_FROM_HISTORY", "EMPTY OR PARSE ERROR", "EMPTY_OR_PARSE_ERROR", "SUPERSEDED", "SUBSTITUIDO", "SUBSTITUÍDO"].includes(status)) return false;
  if (["MISSING STORAGE", "MISSING_STORAGE"].includes(status)) return hasPersistedRowsMetadata(file);
  return Boolean(file.id && (file.storage_path || hasPersistedRowsMetadata(file)));
}

function hasPersistedRowsMetadata(fileRecord) {
  const metadata = fileRecord?.metadata || {};
  const candidates = [
    metadata.record_count,
    metadata.parsed_rows,
    metadata.consolidated_rows,
    metadata.row_count,
    fileRecord?.row_count,
  ];
  return candidates.some((value) => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0;
  });
}

function getFileRowsCount(fileRecord, dataset = null) {
  const rowCount = Number(fileRecord?.row_count);
  if (Number.isFinite(rowCount) && rowCount > 0) return rowCount;
  const parsedRows = Number(fileRecord?.metadata?.parsed_rows);
  if (Number.isFinite(parsedRows) && parsedRows > 0) return parsedRows;
  const metadataRowCount = Number(fileRecord?.metadata?.row_count);
  if (Number.isFinite(metadataRowCount) && metadataRowCount > 0) return metadataRowCount;
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
  if (category === DEVIATION_PNR_FILE_CATEGORY) return "Gestão de Desvios";
  return category === PACKAGE_MANAGEMENT_FILE_CATEGORY ? "Gestão de Pacotes" : "Pré-Fatura";
}

function getSettingsFileTabLabel(category) {
  if (category === DEVIATION_PNR_FILE_CATEGORY) return "Gestão de Desvios";
  return getSettingsFileCategoryLabel(category);
}

function isPnrMasterDashboardFile(file = {}) {
  if (getFileRecordCategory(file) !== DEVIATION_PNR_FILE_CATEGORY) return false;
  const metadata = file.metadata || {};
  return isPnrMasterFile(file.file_name || file.fileName || metadata.original_name || metadata.display_name || "");
}

function formatSettingsFilePeriod(file) {
  const period = getFileRecordPeriod(file);
  const periodLabel = getPeriodModeLabel(period.periodType || "month");
  const monthLabel = categoryAwareFullMonthLabel(file, period);
  return `${periodLabel} · ${monthLabel}`;
}

function getPnrSettingsFileTypeLabel(file) {
  const period = getFileRecordPeriod(file);
  const periodType = normalizePeriodMode(period.periodType || file?.period_type || file?.metadata?.period_type || "");
  const monthLabel = categoryAwareFullMonthLabel(file, period);
  if (periodType === "q1" || periodType === "q2") return `Arquivo quinzenal · ${getPeriodModeLabel(periodType)} · ${monthLabel}`;
  if (monthLabel) return `Arquivo mensal · ${monthLabel}`;
  return "Arquivo complementar";
}

function getSettingsFilePrimaryLabel(file) {
  if (isPnrMasterDashboardFile(file)) return "Base Mestre";
  if (getFileRecordCategory(file) === DEVIATION_PNR_FILE_CATEGORY) return getPnrSettingsFileTypeLabel(file);
  const category = getSettingsFileCategoryLabel(getFileRecordCategory(file));
  return `${category} · ${formatSettingsFilePeriod(file)}`;
}

function getSettingsFileSecondaryLabel(file) {
  if (isPnrMasterDashboardFile(file)) return "PNR MESTRE 2024-2025";
  return getDashboardFileDisplayName(file);
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

function getSettingsFileStorageNote(file) {
  const metadata = file?.metadata || {};
  const rawFileDeleted = metadata.raw_file_deleted === true || String(file?.storage_path || "").startsWith(`${PROCESSED_ONLY_STORAGE_PREFIX}/`);
  if (!rawFileDeleted) return "";
  return "Arquivo usado apenas para extração. Dados salvos no banco.";
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
        const primaryLabel = getSettingsFilePrimaryLabel(file);
        const secondaryLabel = getSettingsFileSecondaryLabel(file);
        const checked = selectedSettingsFileIds.has(file.id);
        const uploaded = file.created_at ? formatDateTime(file.created_at) : "Data não informada";
        const rows = getSettingsFileRowsLabel(file);
        const status = formatSettingsFileStatus(file);
        const storageNote = getSettingsFileStorageNote(file);
        return `
          <label class="settings-file-row">
            <input type="checkbox" value="${escapeAttribute(file.id)}" data-settings-file-id ${checked ? "checked" : ""} ${permissions.canDeleteFile ? "" : "disabled"}>
            <span class="type-filter__check" aria-hidden="true"></span>
            <span class="settings-file-row__content">
              <strong>${escapeHtml(primaryLabel)}</strong>
              <span>${escapeHtml(secondaryLabel)}</span>
              <small>Enviado em ${escapeHtml(uploaded)} · ${escapeHtml(rows)}</small>
              ${storageNote ? `<small>${escapeHtml(storageNote)}</small>` : ""}
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
    if (sheet === PRE_FATURA_VIEW) {
      const categoryLabel = getPreFaturaCategoryLabel();
      return `
        <span class="sheet-tab-wrapper sheet-tab-wrapper--prefatura">
          <button
            type="button"
            class="sheet-tab dashboard-tab-button sheet-tab--prefatura ${isActive}"
            data-sheet="${escapeAttribute(sheet)}"
            data-prefatura-toggle
            aria-haspopup="menu"
            aria-expanded="${isPreFaturaCategoryMenuOpen ? "true" : "false"}"
          >
            <span class="sheet-tab__label">${escapeHtml(label)}</span>
            ${sheet === state.sheet ? `<span class="sheet-tab__badge">${escapeHtml(categoryLabel)}</span>` : ""}
          </button>
          ${renderPreFaturaCategoryMenu()}
        </span>
      `;
    }
    if (sheet === DEVIATION_MANAGEMENT_VIEW) {
      return `
        <span class="sheet-tab-wrapper sheet-tab-wrapper--deviation${isDeviationCategoryMenuOpen ? " is-menu-open" : ""}">
          <button
            type="button"
            class="sheet-tab dashboard-tab-button sheet-tab--deviation ${isActive}"
            data-sheet="${escapeAttribute(sheet)}"
            data-deviation-toggle
            aria-haspopup="menu"
            aria-expanded="${isDeviationCategoryMenuOpen ? "true" : "false"}"
          >
            <span class="sheet-tab__label">${escapeHtml(label)}</span>
            ${sheet === state.sheet && state.activeDesvioCategory === DEVIATION_CATEGORY_PNRS ? '<span class="sheet-tab__badge">PNR</span>' : ""}
          </button>
          ${renderDeviationCategoryMenu()}
        </span>
      `;
    }
    return `
      <button type="button" class="sheet-tab dashboard-tab-button ${isActive}" data-sheet="${escapeAttribute(sheet)}">
        ${escapeHtml(label)}
      </button>
    `;
  }).join("");
  if (isPreFaturaCategoryMenuOpen) openDropdownPortal("prefatura");
  if (isDeviationCategoryMenuOpen) openDropdownPortal("deviation");
}

function renderAll() {
  try {
    renderAllUnsafe();
  } catch (error) {
    renderDashboardRenderError(error);
  }
}

function renderDashboardRenderError(error) {
  console.error("Erro ao renderizar dashboard:", error);
  console.error("Stack:", error?.stack);
  dashboardLastError = error;
  try {
    state.sheet = SHEET_TABS.includes(state.sheet) ? state.sheet : PRE_FATURA_VIEW;
    state.appView = "dashboard";
    renderTabs();
    toggleAccountView(false);
    toggleDashboardView(false, false, false);
    if (el.kpiGrid) {
      el.kpiGrid.hidden = false;
      el.kpiGrid.innerHTML = renderDashboardErrorState(getDashboardStateConfig("supabase-error"));
    }
    if (el.insights) el.insights.innerHTML = "";
    if (el.monthlyComparison) el.monthlyComparison.innerHTML = "";
    if (el.tableBody) el.tableBody.innerHTML = "";
    renderFilterSummary();
    updateAccessControls();
  } catch (fallbackError) {
    console.error("Erro ao renderizar fallback do dashboard:", fallbackError);
  }
}

function renderAllUnsafe() {
  resetChartAnimationObservers();
  syncActiveDataset();
  state.preFaturaView = normalizePreFaturaView(state.preFaturaView);
  renderTabs();
  const packageView = state.sheet === PACKAGE_MANAGEMENT_VIEW;
  const monthlyView = state.sheet === MONTHLY_BASE_VIEW || (state.sheet === PRE_FATURA_VIEW && state.preFaturaView === PREFATURA_VIEW_EVOLUTION);
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
  const monthlyView = state.sheet === MONTHLY_BASE_VIEW || (state.sheet === PRE_FATURA_VIEW && state.preFaturaView === PREFATURA_VIEW_EVOLUTION);
  if (monthlyView || state.sheet === DEVIATION_MANAGEMENT_VIEW || state.appView !== "dashboard") {
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

function normalizePreFaturaView(value) {
  return PREFATURA_CATEGORIES.some((category) => category.key === value) ? value : PREFATURA_VIEW_OVERVIEW;
}

function getPreFaturaCategoryLabel(value = state.preFaturaView) {
  return PREFATURA_CATEGORIES.find((category) => category.key === normalizePreFaturaView(value))?.label || "Visão geral";
}

function getPreFaturaCategoryConfig(value) {
  return PREFATURA_CATEGORIES.find((category) => category.key === value) || null;
}

function closePreFaturaCategoryMenu(options = {}) {
  if (!isPreFaturaCategoryMenuOpen) return;
  isPreFaturaCategoryMenuOpen = false;
  closeDropdownPortal("prefatura");
  if (options.render) renderTabs();
}

function openPreFaturaCategoryMenu() {
  closePnrFilterMenus();
  setPnrSearchExpanded(false, { focus: false });
  closePackageTypeMenu();
  closeCustomFilterMenu("month");
  closeCustomFilterMenu("period");
  closeDeviationCategoryMenu();
  setSearchExpanded(false, { focus: false });
  isPreFaturaCategoryMenuOpen = true;
  renderTabs();
}

function togglePreFaturaCategoryMenu() {
  if (isPreFaturaCategoryMenuOpen) closePreFaturaCategoryMenu({ render: true });
  else openPreFaturaCategoryMenu();
}

function handlePreFaturaCategorySelection(categoryKey) {
  const category = getPreFaturaCategoryConfig(categoryKey);
  if (!category?.enabled) {
    showToast("Categoria em desenvolvimento.", "info", 3200);
    return;
  }
  closeTopFilterOverlays();
  clearTransientDashboardStateForNavigation();
  state.appView = "dashboard";
  state.sheet = PRE_FATURA_VIEW;
  state.preFaturaView = normalizePreFaturaView(category.key);
  state.page = 1;
  isPreFaturaCategoryMenuOpen = false;
  persistState();
  hydrateControls();
  renderAll();
}

function renderPreFaturaCategoryMenu() {
  return `
    <div class="deviation-category-menu prefatura-category-menu" role="menu" ${isPreFaturaCategoryMenuOpen ? "" : "hidden"}>
      ${PREFATURA_CATEGORIES.map((category) => {
    const isActive = normalizePreFaturaView(state.preFaturaView) === category.key;
    const itemState = [
      "deviation-category-menu__item",
      isActive ? "is-active" : "",
      category.enabled ? "" : "is-disabled",
    ].filter(Boolean).join(" ");
    return `
        <button
          type="button"
          class="${itemState}"
          data-prefatura-category="${escapeAttribute(category.key)}"
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
  closePnrFilterMenus();
  setPnrSearchExpanded(false, { focus: false });
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
    try {
      removeDetachedPnrFilterMenus();
      el.deviationManagementView.innerHTML = renderPnrPage();
      if (activePnrFilterMenu) window.requestAnimationFrame(() => openDropdownPortal(`pnr:${activePnrFilterMenu}`));
    } catch (error) {
      console.error("Erro ao renderizar Gestão de Desvios / PNRs:", error);
      console.error("Stack:", error?.stack);
      el.deviationManagementView.innerHTML = `
        <section class="pnr-page">
          ${renderDashboardErrorState(getDashboardStateConfig("supabase-error"))}
        </section>
      `;
    }
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
    getPnrFilterSelectedValues(state.pnrQuinzena, ["q1", "q2"]).join("|") || "all",
    getPnrFilterSelectedValues(state.pnrStatus).join("|") || "Todos",
    getPnrFilterSelectedValues(state.pnrEstacao).join("|") || "Todos",
    normalize(state.pnrQuery),
  ].join("::");
}

function getPnrMonthOptions() {
  if (pnrRemoteState.monthOptions.length) return pnrRemoteState.monthOptions;
  if (hasPnrRemoteData() && !pnrRows.length) return buildPnrMonthOptionsFromFiles();
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

function buildPnrMonthOptionsFromFiles(records = dashboardFileRecords) {
  const map = new Map();
  getPnrFilesForView(records).forEach((record) => {
    const period = getFileRecordPeriod(record);
    if (!period?.key || period.key === "all") return;
    map.set(period.key, {
      key: period.key,
      label: record.metadata?.competencia || period.label || period.key,
      year: Number(String(period.key).slice(0, 4) || 0),
      month: Number(String(period.key).slice(5, 7) || 0),
    });
  });
  return Array.from(map.values()).sort((a, b) => (a.year - b.year) || (a.month - b.month));
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

function normalizarBasePnr(value) {
  const text = normalizeText(value);
  if (!text) return "";
  const match = text.match(/\b[A-Z]{2,4}\d{1,3}\b/);
  return match ? match[0] : text;
}

function identificarTipoBasePnr(base) {
  const code = normalizarBasePnr(base);
  if (code.startsWith("S")) return "SVC";
  if (code.startsWith("E")) return "XPT";
  return "Não identificada";
}

function getPnrSourceBaseValue(row) {
  return row?.baseIdentificada ||
    row?.base_identificada ||
    row?.estacaoOrigem ||
    row?.estacao_origem ||
    row?.base ||
    row?.base_normalizada ||
    row?.codigo_base ||
    row?.svc ||
    row?.station ||
    "";
}

function getPnrSourceBaseKey(row) {
  return normalizarBasePnr(getPnrSourceBaseValue(row));
}

function getPnrSourceDateTs(row) {
  return parseDateValue(
    row?.data_normalizada ||
      row?.dataCaso ||
      row?.data_caso ||
      row?.data ||
      row?.data_sort ||
      row?.created_at ||
      row?.updated_at ||
      row?.arquivoData,
  ).ts || 0;
}

function getPnrSourceYear(row) {
  const ts = getPnrSourceDateTs(row);
  if (ts) return new Date(ts).getUTCFullYear();
  const year = Number(row?.ano || row?.reference_year || row?.metadata?.reference_year || detectYear(row?.competencia || row?.arquivo_origem || ""));
  return Number.isFinite(year) ? year : 0;
}

function buildPnrCrossSourceInfo(row, sourceLabel) {
  const driverName = getPnrDriverNameFromSourceRow(row);
  const baseIdentificada = getPnrSourceBaseKey(row);
  return {
    driver: driverName,
    baseIdentificada,
    tipoBase: identificarTipoBasePnr(baseIdentificada),
    nomeBaseOperacao: repairPnrText(getPnrSourceBaseValue(row)).trim(),
    source: sourceLabel,
    dateTs: getPnrSourceDateTs(row),
    isRecent: getPnrSourceYear(row) >= 2026,
  };
}

function isBetterPnrCrossSourceInfo(next, current) {
  if (!current) return true;
  const nextScore = [
    next?.isRecent,
    Boolean(next?.driver && !isUnidentifiedDriverName(next.driver)),
    Boolean(next?.baseIdentificada),
    next?.tipoBase && next.tipoBase !== "Não identificada",
  ].filter(Boolean).length;
  const currentScore = [
    current?.isRecent,
    Boolean(current?.driver && !isUnidentifiedDriverName(current.driver)),
    Boolean(current?.baseIdentificada),
    current?.tipoBase && current.tipoBase !== "Não identificada",
  ].filter(Boolean).length;
  if (nextScore !== currentScore) return nextScore > currentScore;
  return Number(next?.dateTs || 0) > Number(current?.dateTs || 0);
}

function addPnrCrossIndexValue(map, key, info, method) {
  if (!key || !info) return;
  const next = { ...info, method };
  if (isBetterPnrCrossSourceInfo(next, map.get(key))) map.set(key, next);
}

function buildPnrDriverSourceIndex(rows, sourceLabel) {
  const index = {
    byIdMotorista: new Map(),
    byIdEnvio: new Map(),
    byRota: new Map(),
    byBaseRota: new Map(),
  };
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const info = buildPnrCrossSourceInfo(row, sourceLabel);
    if (!info.driver && !info.baseIdentificada) return;
    getPnrSourceDriverIds(row).forEach((id) => addPnrCrossIndexValue(index.byIdMotorista, id, info, "ID do motorista"));
    getPnrSourceEnvioIds(row).forEach((id) => addPnrCrossIndexValue(index.byIdEnvio, id, info, "ID de envio"));
    const base = getPnrSourceBaseKey(row);
    getPnrSourceRouteIds(row).forEach((rota) => {
      addPnrCrossIndexValue(index.byRota, rota, info, "ID da rota");
      if (base) addPnrCrossIndexValue(index.byBaseRota, `${base}|${rota}`, info, "Base + ID rota");
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
    preFatura: buildPnrDriverSourceIndex(getLoadedRowsForPnrDriverLookup(PRE_FATURA_FILE_CATEGORY), "Pré-Fatura"),
    gestaoPacotes: buildPnrDriverSourceIndex(getLoadedRowsForPnrDriverLookup(PACKAGE_MANAGEMENT_FILE_CATEGORY), "Gestão de Pacotes"),
  };
}

function hasPnrDriverLookupEntries(indexes) {
  return ["preFatura", "gestaoPacotes"].some((group) => {
    const index = indexes?.[group];
    return index && (
      index.byIdMotorista?.size ||
      index.byIdEnvio?.size ||
      index.byRota?.size ||
      index.byBaseRota?.size
    );
  });
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
    const info = key ? map.get(key) : null;
    if (info?.driver || info?.baseIdentificada) return { ...info, method: info.method || method };
  }
  return null;
}

function getPnrFonteFromMatch(found) {
  if (!found) return "Não identificado";
  if (found.source === "Pré-Fatura" && found.method === "Base + ID rota") return "Cruzamento Automático";
  if (found.source === "Gestão de Pacotes" && found.method === "Base + ID rota") return "Cruzamento Automático";
  return found.source || "Cruzamento Automático";
}

function getPnrCrossObservation(found, directBase, statusMotorista) {
  if (found?.source === "Pré-Fatura") return `Identificado por ${found.method || "cruzamento"} na Pré-Fatura`;
  if (found?.source === "Gestão de Pacotes") return `Identificado por ${found.method || "cruzamento"} na Gestão de Pacotes`;
  if (directBase) return "Identificado pela estação de origem do arquivo PNR";
  if (statusMotorista === "ID não informado") return "ID do motorista não informado";
  if (statusMotorista === "Driver possivelmente desligado") return "Driver possivelmente desligado";
  if (statusMotorista === "Motorista não identificado") return "Origem não identificada nas bases atuais";
  return "Registro histórico sem vínculo recente nas bases atuais";
}

function enrichPnrRowWithDriverName(row, indexes = buildPnrDriverLookupIndexes()) {
  const normalized = normalizePnrStoredRow(row);
  if (!normalized) return null;
  const existingName = getPnrDriverNameFromSourceRow({
    motorista: normalized.nomeMotorista,
    driver: normalized.nome_motorista,
  });
  const crossFound = lookupPnrDriverNameInIndex(normalized, indexes.preFatura) ||
    lookupPnrDriverNameInIndex(normalized, indexes.gestaoPacotes);
  const found = crossFound?.driver && crossFound.isRecent
    ? crossFound
    : existingName
      ? { driver: existingName, method: normalized.motoristaMatchSource || "Arquivo PNR", source: "Gestão de Desvios", isRecent: false }
      : crossFound;
  const directBase = normalizarBasePnr(normalized.baseIdentificada || normalized.estacaoOrigem);
  const baseIdentificada = directBase || found?.baseIdentificada || "";
  const tipoBase = identificarTipoBasePnr(baseIdentificada);
  const nomeMotorista = found?.driver && !isUnidentifiedDriverName(found.driver) ? found.driver : "";
  const motoristaDisplay = nomeMotorista || (normalized.idMotorista ? `ID ${normalized.idMotorista}` : "");
  const statusMotorista = found?.driver && found.isRecent
    ? "Vínculo recente identificado"
    : found?.driver || existingName
      ? "Sem vínculo recente identificado"
      : normalized.idMotorista
        ? "Driver possivelmente desligado"
        : normalized.idMotorista === ""
          ? "ID não informado"
          : "Motorista não identificado";
  const fonteCruzamento = found?.driver || found?.baseIdentificada
    ? getPnrFonteFromMatch(found)
    : directBase
      ? "Gestão de Desvios"
      : "Não identificado";
  const observacaoCruzamento = getPnrCrossObservation(found, directBase, statusMotorista);
  return {
    ...normalized,
    tipoOcorrencia: "PNR",
    tipoBase,
    tipoOperacional: tipoBase,
    baseIdentificada,
    nomeBaseOperacao: normalized.nomeBaseOperacao || found?.nomeBaseOperacao || normalized.estacaoOrigem || "",
    nomeMotorista,
    motoristaDisplay,
    statusMotorista,
    fonteCruzamento,
    observacaoCruzamento,
    motoristaMatchSource: found?.method ? [fonteCruzamento, found.method].filter(Boolean).join(" · ") : fonteCruzamento,
    _search: buildPnrSearchText({ ...normalized, tipoOcorrencia: "PNR", tipoBase, baseIdentificada, nomeMotorista, motoristaDisplay, statusMotorista, fonteCruzamento, observacaoCruzamento }),
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
  if (!hasPnrDriverLookupEntries(indexes)) {
    pnrDriverEnrichmentKey = key;
    resetPnrRuntimeCache();
    return;
  }
  pnrRows = dedupePnrRecords(enrichPnrRowsWithDriverNames(pnrRows, indexes)).rows;
  pnrDriverEnrichmentKey = key;
  resetPnrRuntimeCache();
}

function getPnrFilterOptions() {
  if (hasPnrRemoteData() || pnrRemoteState.monthOptions.length) return pnrRemoteState.filterOptions;
  ensurePnrDriverEnrichment();
  const cacheKey = `${pnrDriverEnrichmentKey}:${pnrRowsLoadedKey}:${pnrRows.length}`;
  if (derivedDataCache.pnrFilterOptionsKey === cacheKey && derivedDataCache.pnrFilterOptions) {
    return derivedDataCache.pnrFilterOptions;
  }
  const statuses = new Set();
  const tipos = new Set();
  const estacoes = new Set();
  const statusMotoristas = new Set();
  const fontesCruzamento = new Set();
  pnrRows.forEach((row) => {
    if (row.statusNormalizado) statuses.add(row.statusNormalizado);
    if (row.tipoBase || row.tipoOperacional) tipos.add(row.tipoBase || row.tipoOperacional);
    if (row.estacaoOrigem) estacoes.add(row.estacaoOrigem);
    if (row.statusMotorista) statusMotoristas.add(row.statusMotorista);
    if (row.fonteCruzamento) fontesCruzamento.add(row.fonteCruzamento);
  });
  const options = {
    statuses: Array.from(statuses).sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" })),
    tipos: Array.from(tipos).sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" })),
    estacoes: Array.from(estacoes).sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" })),
    statusMotoristas: Array.from(statusMotoristas).sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" })),
    fontesCruzamento: Array.from(fontesCruzamento).sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" })),
  };
  derivedDataCache.pnrFilterOptionsKey = cacheKey;
  derivedDataCache.pnrFilterOptions = options;
  return options;
}

function getFilteredPnrRows() {
  ensurePnrDriverEnrichment();
  const cacheKey = getPnrRowsCacheKey();
  if (derivedDataCache.pnrKey === cacheKey) return derivedDataCache.pnrRows;
  const rows = filterPnrRowsForCurrentState(pnrRows);
  derivedDataCache.pnrKey = cacheKey;
  derivedDataCache.pnrRows = rows;
  return rows;
}

function filterPnrRowsForCurrentState(rows, options = {}) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const monthOptions = getPnrMonthOptions();
  const selectedMonthValues = options.explicitMonthFilterOnly
    ? getPnrFilterSelectedValues(state.pnrMonths, monthOptions.map((option) => option.key))
    : getPnrSelectedMonthKeys();
  const selectedMonths = new Set(selectedMonthValues);
  const selectedQuinzenas = new Set(getPnrFilterSelectedValues(state.pnrQuinzena, ["q1", "q2"]));
  const selectedStatuses = new Set(getPnrFilterSelectedValues(state.pnrStatus));
  const selectedEstacoes = new Set(getPnrFilterSelectedValues(state.pnrEstacao));
  const query = normalize(state.pnrQuery);
  return safeRows.filter((row) => {
    const monthKey = row.monthKey || getPnrPeriodFromBillingPeriod(row.sourcePeriodo || row.periodoFaturamentoOriginal || row.periodoFaturamento)?.monthKey || getPnrPeriodFromDate(row.dataCaso || row.periodoFaturamento).monthKey;
    if (selectedMonths.size && !selectedMonths.has(monthKey)) return false;
    if (selectedQuinzenas.size && !selectedQuinzenas.has(getPeriodModeFromLabel(row.quinzena))) return false;
    if (selectedStatuses.size && !selectedStatuses.has(row.statusNormalizado)) return false;
    if (selectedEstacoes.size && !selectedEstacoes.has(row.estacaoOrigem)) return false;
    if (query && !String(row._search || "").includes(query)) return false;
    return true;
  });
}

function getPnrChronologicalSortParts(row) {
  if (row && (row._sortYear || row._sortMonth || row._sortDateTs)) {
    return {
      year: Number(row._sortYear || 0),
      month: Number(row._sortMonth || 0),
      quarter: Number(row._sortQuarter || 1),
      dataCaso: Number(row._sortDateTs || 0),
      idCaso: row.idCaso || "",
    };
  }
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
  const av = (a && (a._sortYear || a._sortMonth || a._sortDateTs)) ? a : getPnrChronologicalSortParts(a);
  const bv = (b && (b._sortYear || b._sortMonth || b._sortDateTs)) ? b : getPnrChronologicalSortParts(b);
  const aid = Number(a?.idCaso || 0);
  const bid = Number(b?.idCaso || 0);
  return (
    (Number(av._sortYear ?? av.year ?? 0) - Number(bv._sortYear ?? bv.year ?? 0)) ||
    (Number(av._sortMonth ?? av.month ?? 0) - Number(bv._sortMonth ?? bv.month ?? 0)) ||
    (Number(av._sortQuarter ?? av.quarter ?? 1) - Number(bv._sortQuarter ?? bv.quarter ?? 1)) ||
    (Number(av._sortDateTs ?? av.dataCaso ?? 0) - Number(bv._sortDateTs ?? bv.dataCaso ?? 0)) ||
    (Number.isFinite(aid) && Number.isFinite(bid) && aid !== bid ? aid - bid : String(a?.idCaso || av.idCaso || "").localeCompare(String(b?.idCaso || bv.idCaso || ""), "pt-BR", { numeric: true, sensitivity: "base" }))
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

function getSortedPnrRows(rows) {
  const filteredKey = derivedDataCache.pnrKey || getPnrRowsCacheKey();
  const cacheKey = `${filteredKey}::sort:${state.sortKey || ""}:${state.sortDir || "asc"}:${rows.length}`;
  if (derivedDataCache.pnrSortKey === cacheKey) return derivedDataCache.pnrSortedRows;
  const sortedRows = sortPnrRows(Array.isArray(rows) ? rows : []);
  derivedDataCache.pnrSortKey = cacheKey;
  derivedDataCache.pnrSortedRows = sortedRows;
  derivedDataCache.pnrPageKey = "";
  derivedDataCache.pnrPagedRows = [];
  return sortedRows;
}

function getPaginatedPnrRows(sortedRows) {
  const safeRows = Array.isArray(sortedRows) ? sortedRows : [];
  const totalPages = Math.max(1, Math.ceil(safeRows.length / state.pageSize));
  state.page = Math.min(Math.max(1, state.page), totalPages);
  const cacheKey = `${derivedDataCache.pnrSortKey || ""}::page:${state.page}:${state.pageSize}:${safeRows.length}`;
  if (derivedDataCache.pnrPageKey === cacheKey) return derivedDataCache.pnrPagedRows;
  const pagedRows = paginateRows(safeRows);
  derivedDataCache.pnrPageKey = cacheKey;
  derivedDataCache.pnrPagedRows = pagedRows;
  return pagedRows;
}

function getPnrStatusMetricType(status) {
  const normalized = normalizeText(status);
  if (!normalized) return "aberto";
  if (normalized.includes("FATUR") || normalized.includes("COBR")) return "faturado";
  if (normalized.includes("ANULAD") || normalized.includes("CANCEL")) return "anulado";
  return "aberto";
}

function createPnrSummary(total = 0) {
  return {
    count: Number(total || 0),
    totalValue: 0,
    avgValue: 0,
    anulado: 0,
    faturamento: 0,
    aberto: 0,
    valorFaturado: 0,
    valorAnulado: 0,
    valorAberto: 0,
    ticketMedioGeral: 0,
    ticketMedioFaturado: 0,
    ticketMedioAnulado: 0,
  };
}

function addPnrSummaryStatus(summary, status, value = 0, count = 1) {
  const safeCount = Number(count || 0);
  const safeValue = Number(value || 0);
  const metricType = getPnrStatusMetricType(status);
  if (metricType === "faturado") {
    summary.faturamento += safeCount;
    summary.valorFaturado += safeValue;
    return;
  }
  if (metricType === "anulado") {
    summary.anulado += safeCount;
    summary.valorAnulado += safeValue;
    return;
  }
  summary.aberto += safeCount;
  summary.valorAberto += safeValue;
}

function completePnrSummary(summary) {
  const totalCount = Number(summary.count || 0);
  summary.totalValue = Number(summary.totalValue || 0);
  summary.faturamento = Number(summary.faturamento || 0);
  summary.anulado = Number(summary.anulado || 0);
  summary.aberto = Number(summary.aberto || Math.max(0, totalCount - summary.faturamento - summary.anulado));
  summary.valorFaturado = Number(summary.valorFaturado || 0);
  summary.valorAnulado = Number(summary.valorAnulado || 0);
  summary.valorAberto = Number(summary.valorAberto || Math.max(0, summary.totalValue - summary.valorFaturado - summary.valorAnulado));
  summary.avgValue = totalCount ? summary.totalValue / totalCount : 0;
  summary.ticketMedioGeral = summary.avgValue;
  summary.ticketMedioFaturado = summary.faturamento ? summary.valorFaturado / summary.faturamento : 0;
  summary.ticketMedioAnulado = summary.anulado ? summary.valorAnulado / summary.anulado : 0;
  return summary;
}

function getPnrAnalysisData(rows) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const cacheKey = `${derivedDataCache.pnrKey || getPnrRowsCacheKey()}::analysis:${safeRows.length}`;
  if (derivedDataCache.pnrAggregatesKey === cacheKey && derivedDataCache.pnrAggregates) return derivedDataCache.pnrAggregates;

  const total = safeRows.length;
  const summary = createPnrSummary(total);
  const statusMap = new Map();
  const operationOrder = ["SVC", "XPT", "Não identificada"];
  const operationMap = new Map(operationOrder.map((label) => [label, 0]));
  const stationMap = new Map();
  const driverMap = new Map();
  const evolutionMap = new Map();

  safeRows.forEach((row) => {
    const value = Number(row.valorCompraNumerico || 0);
    summary.totalValue += value;

    const status = row.statusNormalizado || "Indefinido";
    const statusMetricType = getPnrStatusMetricType(status);
    addPnrSummaryStatus(summary, status, value, 1);
    const statusEntry = statusMap.get(status) || { label: status, count: 0, totalValue: 0 };
    statusEntry.count += 1;
    statusEntry.totalValue += value;
    statusMap.set(status, statusEntry);

    const operationValue = row.tipoBase || row.tipoOperacional;
    const operation = operationOrder.includes(operationValue) ? operationValue : "Não identificada";
    operationMap.set(operation, (operationMap.get(operation) || 0) + 1);

    const station = String(row.estacaoOrigem || "").trim() || "Sem estação";
    const stationEntry = stationMap.get(station) || { label: station, count: 0, totalValue: 0 };
    stationEntry.count += 1;
    stationEntry.totalValue += value;
    stationMap.set(station, stationEntry);

    const driverId = formatPnrId(row.idMotorista || "");
    const driverName = getPnrDriverNameFromSourceRow({ motorista: row.nomeMotorista });
    const driverLabel = driverName || (driverId ? `ID ${driverId}` : "");
    if (driverLabel) {
      const driverKey = driverName ? normalizeDriverName(driverName) || driverLabel : `ID:${driverId}`;
      const driverEntry = driverMap.get(driverKey) || { label: driverLabel, detail: driverId && driverName ? `ID: ${driverId}` : "", count: 0, totalValue: 0 };
      driverEntry.count += 1;
      driverEntry.totalValue += value;
      driverMap.set(driverKey, driverEntry);
    }

    const period = getPnrPeriodFromBillingPeriod(row.sourcePeriodo || row.periodoFaturamentoOriginal || row.periodoFaturamento) || getPnrPeriodFromDate(row.dataCaso || row.periodoFaturamento);
    const key = row.monthKey || period.monthKey;
    const evolutionEntry = evolutionMap.get(key) || {
      key,
      label: row.competencia || getPnrMonthFullLabel(period),
      year: Number(row.ano || period.ano || String(key).slice(0, 4) || 0),
      month: Number(row.mesNumero || period.mes || String(key).slice(5, 7) || 0),
      count: 0,
      totalValue: 0,
      valorAnulado: 0,
      valorFaturado: 0,
    };
    evolutionEntry.count += 1;
    evolutionEntry.totalValue += value;
    if (statusMetricType === "anulado") evolutionEntry.valorAnulado += value;
    if (statusMetricType === "faturado") evolutionEntry.valorFaturado += value;
    evolutionMap.set(key, evolutionEntry);
  });

  completePnrSummary(summary);

  const aggregates = {
    summary,
    statusRows: Array.from(statusMap.values())
      .map((item) => ({ ...item, share: total ? (item.count / total) * 100 : 0 }))
      .sort((a, b) => b.count - a.count),
    operationRows: Array.from(operationMap.entries())
      .map(([label, count]) => ({ label, count, share: total ? (count / total) * 100 : 0 }))
      .sort((a, b) => operationOrder.indexOf(a.label) - operationOrder.indexOf(b.label)),
    stationRows: Array.from(stationMap.values())
      .map((item) => ({ ...item, share: total ? (item.count / total) * 100 : 0 }))
      .sort((a, b) => b.count - a.count || b.totalValue - a.totalValue)
      .slice(0, 8),
    driverRows: Array.from(driverMap.values())
      .map((item) => ({ ...item, share: total ? (item.count / total) * 100 : 0 }))
      .sort((a, b) => b.count - a.count || b.totalValue - a.totalValue || a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }))
      .slice(0, 8),
    evolutionRows: Array.from(evolutionMap.values()).sort((a, b) => (a.year - b.year) || (a.month - b.month)),
  };

  derivedDataCache.pnrAggregatesKey = cacheKey;
  derivedDataCache.pnrAggregates = aggregates;
  return aggregates;
}

function getPnrTableViewModel() {
  const filteredRows = getFilteredPnrRows();
  const sortedRows = getSortedPnrRows(filteredRows);
  const pagedRows = getPaginatedPnrRows(sortedRows);
  return { filteredRows, sortedRows, pagedRows };
}

const PNR_TABLE_COLUMNS = [
  { key: "competencia", label: "Competência", width: 118, format: "text" },
  { key: "quinzena", label: "Quinzena", width: 118, format: "text" },
  { key: "statusNormalizado", label: "Status", width: 172, format: "status" },
  { key: "idEnvio", label: "ID de Envio", width: 135, format: "text" },
  { key: "idReclamacao", label: "ID da Reclamação", width: 155, format: "text" },
  { key: "valorCompraNumerico", label: "Valor da Compra", width: 145, format: "currency" },
  { key: "estacaoOrigem", label: "Estação de Origem", width: 230, format: "station" },
  { key: "motoristaDisplay", label: "Motorista", width: 190, format: "driver" },
  { key: "dataEntrega", label: "Data da Entrega", width: 145, format: "date" },
  { key: "dataEncerramentoCaso", label: "Data de Encerramento", width: 178, format: "date" },
];

const PNR_EXPORT_SELECT_COLUMNS = [
  "id",
  "file_id",
  "dedupe_key",
  "competencia",
  "quinzena",
  "tipo",
  "status_original",
  "status_normalizado",
  "periodo_faturamento",
  "periodo_faturamento_original",
  "mes",
  "ano",
  "quinzena_ref",
  "periodo_label",
  "source_file_name",
  "source_periodo",
  "data_encerramento_caso",
  "id_envio",
  "produtos",
  "valor_compra",
  "estacao_origem",
  "tipo_ocorrencia",
  "tipo_base",
  "tipo_operacional",
  "base_identificada",
  "nome_base_operacao",
  "id_rota",
  "id_motorista",
  "nome_motorista",
  "motorista_display",
  "status_motorista",
  "fonte_cruzamento",
  "observacao_cruzamento",
  "motorista_match_source",
  "data_caso",
  "data_entrega",
  "id_reclamacao",
  "data_reclamacao",
  "created_at",
].join(",");

function formatPnrTableCell(row, column) {
  const value = row?.[column.key];
  if (column.format === "date") return escapeHtml(formatDate(value));
  if (column.format === "currency") return escapeHtml(currency.format(Number(value || 0)));
  if (column.format === "currencyText") return escapeHtml(String(value || row?.valorCompraFormatado || currency.format(Number(row?.valorCompraNumerico || 0))));
  if (column.format === "status") return `<span class="badge">${escapeHtml(value || "—")}</span>`;
  if (column.format === "station") {
    const details = [
      row?.tipoBase || row?.tipoOperacional || "",
      row?.idRota ? `Rota ${row.idRota}` : "",
    ].filter(Boolean);
    return `
      <div class="pnr-station-cell">
        <strong>${escapeHtml(value || "—")}</strong>
        ${details.length ? `<span>${escapeHtml(details.join(" · "))}</span>` : ""}
      </div>
    `;
  }
  if (column.format === "driver") {
    const id = formatPnrId(row?.idMotorista || "");
    const candidateName = getPnrDriverNameFromSourceRow({ motorista: row?.nomeMotorista || row?.motoristaDisplay || "" });
    const name = candidateName && normalizePnrLookupId(candidateName) !== normalizePnrLookupId(id) ? candidateName : "";
    const primary = name || (id ? `Motorista ${id}` : String(value || "").trim());
    const detail = name && id ? `ID ${id}` : "";
    return `
      <div class="pnr-driver-cell">
        <strong>${escapeHtml(primary || "—")}</strong>
        ${detail ? `<span>${escapeHtml(detail)}</span>` : ""}
      </div>
    `;
  }
  return escapeHtml(value || "—");
}

function getPnrExportRows() {
  const localRows = getPnrTableViewModel().sortedRows;
  if (localRows.length) return localRows;
  if (hasPnrRemoteData()) return Array.isArray(pnrRemoteState.rows) ? pnrRemoteState.rows : [];
  return [];
}

function getPnrExportFilterState() {
  const monthOptions = getPnrMonthOptions();
  const selectedMonthKeys = getPnrFilterSelectedValues(state.pnrMonths, monthOptions.map((option) => option.key));
  const selectedMonths = selectedMonthKeys.map((key) => monthOptions.find((option) => option.key === key)?.label || key);
  const selectedQuinzenas = getPnrFilterSelectedValues(state.pnrQuinzena, ["q1", "q2"]);
  const filterOptions = pnrRemoteState.filterOptions || getPnrFilterOptions();
  const selectedStatuses = getPnrFilterSelectedValues(state.pnrStatus, filterOptions.statuses);
  const selectedEstacoes = getPnrFilterSelectedValues(state.pnrEstacao, filterOptions.estacoes);
  const search = String(state.pnrQuery || "").trim();
  return {
    selectedMonthKeys,
    selectedMonths,
    selectedQuinzenas,
    selectedStatuses,
    selectedEstacoes,
    search,
    hasFilters: Boolean(selectedMonthKeys.length || selectedQuinzenas.length || selectedStatuses.length || selectedEstacoes.length || search),
  };
}

function getPnrExportFilterLabelList() {
  const filters = getPnrExportFilterState();
  const quinzenaLabels = filters.selectedQuinzenas.map((value) => value === "q1" ? "1ª quinzena" : value === "q2" ? "2ª quinzena" : value);
  return {
    month: filters.selectedMonths.length ? filters.selectedMonths.join(", ") : "Todos",
    quinzena: quinzenaLabels.length ? quinzenaLabels.join(", ") : "Todas",
    status: filters.selectedStatuses.length ? filters.selectedStatuses.join(", ") : "Todos",
    origem: filters.selectedEstacoes.length ? filters.selectedEstacoes.join(", ") : "Todas",
    busca: filters.search || "Sem busca",
  };
}

function formatPnrExportDateForFile(date = new Date()) {
  return date.toLocaleDateString("pt-BR").replace(/\//g, "-");
}

function normalizePnrExportFilePart(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim();
}

async function fetchPnrExportRowsFromSupabase() {
  if (!window.supabaseClient) {
    const fallbackRows = getPnrExportRows();
    if (hasPnrRemoteData() && Number(pnrRemoteState.total || 0) > fallbackRows.length) {
      throw new Error("Cliente Supabase indisponível para exportar o recorte completo de PNRs.");
    }
    return fallbackRows;
  }
  const rows = [];
  const filters = getPnrExportFilterState();
  for (let from = 0; ; from += PROCESSED_RECORDS_PAGE_SIZE) {
    const to = from + PROCESSED_RECORDS_PAGE_SIZE - 1;
    let query = window.supabaseClient
      .from("desvios_pnr_records")
      .select(PNR_EXPORT_SELECT_COLUMNS)
      .order("ano", { ascending: true, nullsFirst: false })
      .order("mes", { ascending: true, nullsFirst: false })
      .order("quinzena_ref", { ascending: true, nullsFirst: false })
      .order("data_encerramento_caso", { ascending: true, nullsFirst: false })
      .range(from, to);

    if (filters.selectedStatuses.length) query = query.in("status_normalizado", filters.selectedStatuses);
    if (filters.selectedEstacoes.length) query = query.in("estacao_origem", filters.selectedEstacoes);

    const { data, error } = await withTimeout(
      query,
      SUPABASE_QUERY_TIMEOUT_MS,
      "Tempo limite excedido ao buscar PNRs para exportação.",
    );
    if (error) throw error;
    const page = Array.isArray(data) ? data : [];
    rows.push(...page.map((record) => mapProcessedPnrRecord(record, { file_name: record?.source_file_name || "" })).filter(Boolean));
    if (page.length < PROCESSED_RECORDS_PAGE_SIZE) break;
  }
  return sortPnrRows(filterPnrRowsForCurrentState(rows, { explicitMonthFilterOnly: true }));
}

function buildPnrExportSheetRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const driverId = formatPnrId(row?.idMotorista || "");
    const candidateName = getPnrDriverNameFromSourceRow({ motorista: row?.nomeMotorista || row?.motoristaDisplay || "" });
    const driverName = candidateName && normalizePnrLookupId(candidateName) !== normalizePnrLookupId(driverId) ? candidateName : "";
    return {
      "Competência": row.competencia || "",
      "Quinzena": row.quinzena || "",
      "Status": row.statusNormalizado || "",
      "ID de Envio": String(row.idEnvio || ""),
      "ID da Reclamação": String(row.idReclamacao || ""),
      "Valor da Compra": Number(row.valorCompraNumerico || 0),
      "Estação de Origem": row.estacaoOrigem || "",
      "Motorista": driverName || (driverId ? `Motorista ${driverId}` : row.motoristaDisplay || ""),
      "Data da Entrega": formatPackageExportDate(row.dataEntrega) || "",
      "Data de Encerramento": formatPackageExportDate(row.dataEncerramentoCaso) || "",
    };
  });
}

function buildPnrExcelFileName(rows) {
  const filters = getPnrExportFilterState();
  const dateLabel = formatPnrExportDateForFile();
  if (filters.selectedMonths.length === 1) {
    return `Relatorio_PNRs_Gestao_Desvios_${normalizePnrExportFilePart(filters.selectedMonths[0])}_${dateLabel}.xlsx`;
  }
  const scope = filters.hasFilters ? "Filtrado" : "Completo";
  return `Relatorio_PNRs_Gestao_Desvios_${scope}_${dateLabel}.xlsx`;
}

function getPnrExportSummary(rows, exportRows) {
  const filters = getPnrExportFilterLabelList();
  return {
    totalRows: exportRows.length,
    monthLabel: filters.month,
    quinzenaLabel: filters.quinzena,
    statusLabel: filters.status,
    origemLabel: filters.origem,
    searchLabel: filters.busca,
    valueTotal: (Array.isArray(rows) ? rows : []).reduce((sum, row) => sum + Number(row.valorCompraNumerico || 0), 0),
  };
}

function configurePnrExportHeader(worksheet, rows, exportRows) {
  const darkBlue = "0B1F33";
  const aqua = "19D3C5";
  const white = "FFFFFF";
  const mutedBlue = "E8F1F8";
  const textDark = "1F2A37";
  const borderColor = "D8E3ED";
  const summary = getPnrExportSummary(rows, exportRows);

  styleExcelRange(worksheet, "A1:J5", {
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
  worksheet.mergeCells("B2:D2");
  worksheet.mergeCells("B3:D3");
  worksheet.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };

  worksheet.getCell("B2").value = "Painel de Inteligência Operacional";
  worksheet.getCell("B2").font = { name: "Arial", size: 16, bold: true, color: { argb: white } };
  worksheet.getCell("B2").alignment = { horizontal: "left", vertical: "middle" };
  worksheet.getCell("B3").value = "Gestão de Desvios — PNRs";
  worksheet.getCell("B3").font = { name: "Arial", size: 12, bold: true, color: { argb: white } };
  worksheet.getCell("B3").alignment = { horizontal: "left", vertical: "middle" };

  worksheet.getCell("J1").value = "Setor: LOSS";
  worksheet.getCell("J2").value = `Mês: ${summary.monthLabel}`;
  worksheet.getCell("J3").value = `Status: ${summary.statusLabel}`;
  worksheet.getCell("J4").value = `Gerado em: ${formatCurrentDateTime()}`;
  ["J1", "J2", "J3", "J4"].forEach((address) => {
    worksheet.getCell(address).font = { name: "Arial", size: 10, bold: address === "J1", color: { argb: white } };
    worksheet.getCell(address).alignment = { horizontal: "left", vertical: "middle" };
  });

  const summaryHeaders = ["Resumo do recorte", "Registros exportados", "Valor total", "Mês", "Quinzena", "Status", "Origem", "Busca", "", ""];
  const summaryValues = ["", summary.totalRows, summary.valueTotal, summary.monthLabel, summary.quinzenaLabel, summary.statusLabel, summary.origemLabel, summary.searchLabel, "", ""];
  worksheet.getRow(6).values = summaryHeaders;
  worksheet.getRow(7).values = summaryValues;
  worksheet.getRow(6).height = 15.6;
  worksheet.getRow(7).height = 14.4;
  styleExcelRange(worksheet, "A6:J6", {
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
  styleExcelRange(worksheet, "A7:J7", {
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
  worksheet.getCell("C7").numFmt = '_-"R$" * #,##0.00_-;-"R$" * #,##0.00_-;_-"R$" * "-"??_-;_-@_-';
}

function addPnrExportTable(worksheet, exportRows) {
  const headerRowNumber = 8;
  const headers = ["Competência", "Quinzena", "Status", "ID de Envio", "ID da Reclamação", "Valor da Compra", "Estação de Origem", "Motorista", "Data da Entrega", "Data de Encerramento"];
  worksheet.addTable({
    name: "TabelaPNRs",
    displayName: "TabelaPNRs",
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
        bold: colNumber === 3 || colNumber === 6,
        color: { argb: colNumber === 6 ? "1F2A37" : "1F2A37" },
      };
      cell.alignment = { vertical: "middle", horizontal: colNumber === 6 ? "right" : "left", wrapText: colNumber === 7 || colNumber === 8 };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: index % 2 === 0 ? "FFFFFF" : "F7FAFC" },
      };
      cell.border = {
        top: { style: "thin", color: { argb: "E0E7EF" } },
        left: { style: "thin", color: { argb: "E0E7EF" } },
        bottom: { style: "thin", color: { argb: "E0E7EF" } },
        right: { style: "thin", color: { argb: "E0E7EF" } },
      };
      if (colNumber === 4 || colNumber === 5) cell.numFmt = "@";
      if (colNumber === 6) cell.numFmt = '_-"R$" * #,##0.00_-;-"R$" * #,##0.00_-;_-"R$" * "-"??_-;_-@_-';
    });
    row.getCell(4).value = String(item["ID de Envio"] || "");
    row.getCell(5).value = String(item["ID da Reclamação"] || "");
  });

  worksheet.views = [{ state: "frozen", ySplit: headerRowNumber, topLeftCell: "A9", zoomScale: 85, zoomScaleNormal: 85, activeCell: "A9" }];
}

function autoFitPnrExportColumns(worksheet, exportRows) {
  const headers = ["Competência", "Quinzena", "Status", "ID de Envio", "ID da Reclamação", "Valor da Compra", "Estação de Origem", "Motorista", "Data da Entrega", "Data de Encerramento"];
  const minWidths = [16, 17, 18, 16, 19, 16, 20, 20, 16, 20];
  const maxWidths = [24, 28, 34, 22, 24, 18, 34, 38, 18, 22];
  headers.forEach((header, index) => {
    const contentWidth = Math.max(
      header.length,
      ...(Array.isArray(exportRows) ? exportRows : []).map((row) => String(row?.[header] ?? "").length),
    );
    const paddedWidth = Math.ceil(contentWidth * 1.12) + 2;
    worksheet.getColumn(index + 1).width = Math.min(maxWidths[index], Math.max(minWidths[index], paddedWidth));
  });
}

async function buildStyledPnrWorkbook(rows, exportRows) {
  const ExcelJS = await loadExcelExportEngine();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Painel de Inteligência";
  workbook.created = new Date();
  workbook.modified = new Date();
  const worksheet = workbook.addWorksheet("PNRs", {
    properties: { defaultRowHeight: 20 },
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  worksheet.columns = [
    { key: "competencia", width: 18 },
    { key: "quinzena", width: 20 },
    { key: "status", width: 26 },
    { key: "idEnvio", width: 18 },
    { key: "idReclamacao", width: 20 },
    { key: "valorCompra", width: 18 },
    { key: "estacaoOrigem", width: 26 },
    { key: "motorista", width: 28 },
    { key: "dataEntrega", width: 17 },
    { key: "dataEncerramento", width: 20 },
  ];

  configurePnrExportHeader(worksheet, rows, exportRows);
  await addPackageExportLogo(worksheet, workbook);
  addPnrExportTable(worksheet, exportRows);
  autoFitPnrExportColumns(worksheet, exportRows);
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

function renderPnrTableActions(totalRows, isInitialLoading) {
  return `
    <div class="pnr-table-actions">
      ${renderPnrPageSizeControl()}
      <button class="secondary-button secondary-button--icon table-export-button pnr-table-export-button" type="button" data-pnr-export-excel title="${isExportingPnrExcel ? "Gerando planilha..." : "Baixar Excel"}" aria-label="${isExportingPnrExcel ? "Gerando planilha" : "Baixar Excel"}" ${isInitialLoading || !totalRows || isExportingPnrExcel ? "disabled" : ""}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3v11" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2"></path>
          <path d="m7 10 5 5 5-5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path>
          <path d="M5 19h14" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2"></path>
        </svg>
      </button>
    </div>
  `;
}

async function exportPnrTableExcel(button) {
  if (isExportingPnrExcel) return;
  isExportingPnrExcel = true;
  if (button) {
    button.classList.add("is-loading");
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.setAttribute("title", "Gerando planilha...");
    button.setAttribute("aria-label", "Gerando planilha");
  }
  try {
    showToast("Gerando planilha de PNRs...", "info", 3200);
    const rows = await fetchPnrExportRowsFromSupabase();
    if (!rows.length) {
      showToast("Nenhum PNR para exportar.", "warn", 4200);
      return;
    }
    const exportRows = buildPnrExportSheetRows(rows);
    const blob = await buildStyledPnrWorkbook(rows, exportRows);
    downloadBlob(blob, buildPnrExcelFileName(rows));
    showToast(`Excel de PNRs baixado com ${integer.format(exportRows.length)} registros.`, "good", 4200);
  } catch (error) {
    console.error("[PNR Export] Falha ao exportar tabela detalhada:", error);
    showToast("Não foi possível exportar a tabela de PNRs.", "error", 5200);
  } finally {
    isExportingPnrExcel = false;
    if (button) {
      button.classList.remove("is-loading");
      button.disabled = false;
      button.setAttribute("aria-busy", "false");
      button.setAttribute("title", "Baixar Excel");
      button.setAttribute("aria-label", "Baixar Excel");
    }
  }
}

function getDashboardFilterSizeClass(name) {
  if (name === "month" || name === "pageSize") return "dashboard-filter-sm";
  if (name === "estacao" || name === "base" || name === "origem") return "dashboard-filter-lg";
  return "dashboard-filter-md";
}

function renderPnrFilterSelect(name, label, value, options, allLabel = "Todos") {
  const sizeClass = getDashboardFilterSizeClass(name);
  const sourceOptions = (Array.isArray(options) ? options : []).map((option) => ({
    value: String(typeof option === "string" ? option : option.value),
    label: String(typeof option === "string" ? option : option.label),
  })).filter((option) => option.value !== undefined && option.value !== null);
  if (name === "pageSize") {
    const normalizedValue = String(value || "15");
    const selected = sourceOptions.find((option) => option.value === normalizedValue) || sourceOptions[0];
    const isOpen = activePnrFilterMenu === name;
    return `
      <div class="pnr-filter-control pnr-filter-dropdown dashboard-filter-select ${sizeClass}" data-pnr-filter-control="${escapeAttribute(name)}">
        <span>${escapeHtml(label)}</span>
        <button type="button" class="pnr-filter-button" data-pnr-filter-toggle="${escapeAttribute(name)}" aria-haspopup="listbox" aria-expanded="${isOpen ? "true" : "false"}">
          <strong>${escapeHtml(selected?.label || allLabel)}</strong>
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 7 5 5 5-5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"></path></svg>
        </button>
        <div class="pnr-filter-menu dashboard-filter-dropdown" data-pnr-filter-menu="${escapeAttribute(name)}" role="listbox" ${isOpen ? "" : "hidden"}>
          ${sourceOptions.map((option) => {
            const selectedClass = option.value === normalizedValue ? " is-active" : "";
            return `<button type="button" class="pnr-filter-option dashboard-filter-option${selectedClass}" data-pnr-filter-option="${escapeAttribute(name)}" data-value="${escapeAttribute(option.value)}" role="option" aria-selected="${selectedClass ? "true" : "false"}">${escapeHtml(option.label)}</button>`;
          }).join("")}
        </div>
      </div>
    `;
  }
  const specificOptions = sourceOptions.filter((option) => option.value !== "Todos" && option.value !== "all");
  const selectedValues = getPnrFilterSelectedValues(value, specificOptions.map((option) => option.value));
  const selectedSet = new Set(selectedValues);
  const allSelected = !selectedValues.length;
  const buttonLabel = getPnrFilterSelectionLabel(value, specificOptions, allLabel);
  const isOpen = activePnrFilterMenu === name;
  return `
    <div class="pnr-filter-control pnr-filter-dropdown dashboard-filter-select ${sizeClass}" data-pnr-filter-control="${escapeAttribute(name)}">
      <span>${escapeHtml(label)}</span>
      <button type="button" class="pnr-filter-button" data-pnr-filter-toggle="${escapeAttribute(name)}" aria-haspopup="listbox" aria-expanded="${isOpen ? "true" : "false"}">
        <strong>${escapeHtml(buttonLabel)}</strong>
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 7 5 5 5-5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"></path></svg>
      </button>
      <div class="pnr-filter-menu type-filter__menu dashboard-filter-dropdown" data-pnr-filter-menu="${escapeAttribute(name)}" role="menu" ${isOpen ? "" : "hidden"}>
        <label class="type-filter__option custom-filter__option pnr-filter-option dashboard-filter-option${allSelected ? " is-selected" : ""}">
          <input type="checkbox" value="Todos" data-pnr-filter-option="${escapeAttribute(name)}" ${allSelected ? "checked" : ""}>
          <span class="type-filter__check" aria-hidden="true"></span>
          <span>${escapeHtml(allLabel)}</span>
        </label>
        ${specificOptions.map((option) => {
          const isSelected = !allSelected && selectedSet.has(option.value);
          return `
          <label class="type-filter__option custom-filter__option pnr-filter-option dashboard-filter-option${isSelected ? " is-selected" : ""}">
            <input type="checkbox" value="${escapeAttribute(option.value)}" data-pnr-filter-option="${escapeAttribute(name)}" ${isSelected ? "checked" : ""}>
            <span class="type-filter__check" aria-hidden="true"></span>
            <span>${escapeHtml(option.label)}</span>
          </label>
        `;
        }).join("")}
      </div>
    </div>
  `;
}

function renderPnrPageSizeControl() {
  return renderPnrFilterSelect(
    "pageSize",
    "Linhas por página",
    String(state.pageSize || 15),
    [10, 15, 25, 50, 100].map((size) => ({ value: String(size), label: String(size) })),
    "15",
  );
}

function ensurePnrToolbarFilters() {
  if (el.pnrToolbarFilters) return el.pnrToolbarFilters;
  if (!el.viewToolbar) return null;
  const toolbar = document.createElement("div");
  toolbar.id = "pnr-toolbar-filters";
  toolbar.className = "pnr-toolbar-filters";
  toolbar.setAttribute("aria-label", "Filtros de PNRs");
  toolbar.hidden = true;
  el.viewToolbar.appendChild(toolbar);
  el.pnrToolbarFilters = toolbar;
  return toolbar;
}

function renderPnrFilterControls() {
  const monthSelectOptions = getPnrMonthOptions().map((option) => ({ value: option.key, label: option.label }));
  const filterOptions = getPnrFilterOptions();
  const pnrSearchOpen = Boolean(state.pnrQuery || isPnrSearchExpanded);
  return `
    <div class="pnr-filter-bar">
      <div class="pnr-filter-row dashboard-filter-bar">
        <div class="pnr-search global-search-filter dashboard-search-button dashboard-filter-xs${pnrSearchOpen ? " is-expanded" : ""}" data-pnr-search-control>
          <button type="button" class="global-search-filter__button" data-pnr-search-toggle aria-label="Pesquisar PNRs" aria-expanded="${pnrSearchOpen ? "true" : "false"}">
            <svg viewBox="0 0 20 20"><path d="M8.8 4.2a4.6 4.6 0 1 0 0 9.2 4.6 4.6 0 0 0 0-9.2Zm3.35 7.95 3.65 3.65" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.55"></path></svg>
          </button>
          <input type="search" data-pnr-query value="${escapeAttribute(state.pnrQuery || "")}" placeholder="Buscar" autocomplete="off">
        </div>
        ${renderPnrFilterSelect("month", "Mês", state.pnrMonths, monthSelectOptions)}
        ${renderPnrFilterSelect("quinzena", "Quinzena", state.pnrQuinzena || "all", [
          { value: "q1", label: "1ª quinzena" },
          { value: "q2", label: "2ª quinzena" },
        ])}
        ${renderPnrFilterSelect("status", "Status", state.pnrStatus, filterOptions.statuses)}
        ${renderPnrFilterSelect("estacao", "Origem", state.pnrEstacao, filterOptions.estacoes)}
        <button type="button" class="secondary-button dashboard-clear-button dashboard-filter-action" data-pnr-clear aria-label="Limpar filtros">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.9"></path>
          </svg>
          <span>Limpar</span>
        </button>
      </div>
    </div>
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

function formatPnrAxisCurrency(value) {
  const abs = Math.abs(Number(value || 0));
  const sign = Number(value || 0) < 0 ? "-" : "";
  if (abs >= 1000000) return `${sign}R$ ${formatNumberPt(abs / 1000000, abs >= 10000000 ? 0 : 1)} mi`;
  if (abs >= 1000) return `${sign}R$ ${formatNumberPt(abs / 1000, 0)} mil`;
  return `${sign}${currency.format(abs)}`;
}

function formatPnrCompactCurrency(value) {
  const abs = Math.abs(Number(value || 0));
  const sign = Number(value || 0) < 0 ? "-" : "";
  if (abs >= 1000000) return `${sign}R$ ${formatNumberPt(abs / 1000000, 2)} mi`;
  if (abs >= 1000) return `${sign}R$ ${formatNumberPt(abs / 1000, 0)} mil`;
  return `${sign}${currency.format(abs)}`;
}

function formatPnrSignedCurrency(value) {
  const numeric = Number(value || 0);
  return `${numeric < 0 ? "-" : ""}${currency.format(Math.abs(numeric))}`;
}

function getPnrTimelineAxisLabel(row) {
  const rawLabel = String(row?.label || row?.key || "").trim();
  const monthNames = {
    janeiro: "Jan",
    fevereiro: "Fev",
    marco: "Mar",
    março: "Mar",
    abril: "Abr",
    maio: "Mai",
    junho: "Jun",
    julho: "Jul",
    agosto: "Ago",
    setembro: "Set",
    outubro: "Out",
    novembro: "Nov",
    dezembro: "Dez",
  };
  const normalized = rawLabel.toLowerCase();
  const monthKey = Object.keys(monthNames).find((name) => normalized.includes(name));
  const yearMatch = rawLabel.match(/20(\d{2})/);
  const quinzenalMatch = rawLabel.match(/\b([12]Q)\b/i);
  if (monthKey && yearMatch) {
    return `${monthNames[monthKey]}/${yearMatch[1]}${quinzenalMatch ? ` ${quinzenalMatch[1].toUpperCase()}` : ""}`;
  }
  const keyMatch = String(row?.key || "").match(/^(\d{4})-(\d{2})(?:\|(q[12]))?/i);
  if (keyMatch) {
    const monthIndex = Math.max(0, Math.min(11, Number(keyMatch[2]) - 1));
    const shortMonths = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    return `${shortMonths[monthIndex]}/${keyMatch[1].slice(2)}${keyMatch[3] ? ` ${keyMatch[3].toUpperCase().replace("Q", "Q")}` : ""}`;
  }
  return rawLabel;
}

function getPnrTimelineValue(row, keys) {
  for (const key of keys) {
    if (row?.[key] != null && row[key] !== "") return Number(row[key] || 0);
  }
  return 0;
}

function buildSvgLinePath(points) {
  const safePoints = (Array.isArray(points) ? points : []).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (!safePoints.length) return "";
  if (safePoints.length === 1) {
    const point = safePoints[0];
    return `M ${point.x.toFixed(2)} ${point.y.toFixed(2)} L ${(point.x + 0.01).toFixed(2)} ${point.y.toFixed(2)}`;
  }
  return safePoints.map((point, index) => `${index ? "L" : "M"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
}

function buildSvgAreaPath(points, zeroY) {
  const safePoints = (Array.isArray(points) ? points : []).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (!safePoints.length) return "";
  const first = safePoints[0];
  const last = safePoints[safePoints.length - 1];
  return [
    `M ${first.x.toFixed(2)} ${zeroY.toFixed(2)}`,
    buildSvgLinePath(safePoints).replace(/^M\s*/, "L "),
    `L ${last.x.toFixed(2)} ${zeroY.toFixed(2)}`,
    "Z",
  ].join(" ");
}

function getPnrValueTimelineRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const valorAnulado = getPnrTimelineValue(row, ["valorAnulado", "valor_anulado", "anuladoValue", "anulado_value"]);
      const valorFaturado = getPnrTimelineValue(row, ["valorFaturado", "valor_faturado", "faturadoValue", "faturado_value"]);
      return {
        ...row,
        valorAnulado,
        valorFaturado,
        saldoValue: valorAnulado - valorFaturado,
      };
    })
    .filter((row) => row.valorAnulado || row.valorFaturado);
}

function getPnrValueTimelineTotals(rows) {
  const safeRows = getPnrValueTimelineRows(rows);
  const totalAnulado = safeRows.reduce((sum, row) => sum + Number(row.valorAnulado || 0), 0);
  const totalFaturado = safeRows.reduce((sum, row) => sum + Number(row.valorFaturado || 0), 0);
  return {
    totalAnulado,
    totalFaturado,
    saldoTotal: totalAnulado - totalFaturado,
    hasRows: safeRows.length > 0,
  };
}

function renderPnrValueTimelineHeaderMeta(rows) {
  const totals = getPnrValueTimelineTotals(rows);
  if (!totals.hasRows) return "";
  return `
    <div class="pnr-value-header-meta">
      <div class="pnr-value-timeline__summary" aria-label="Resumo financeiro do gráfico">
        <span><small>Anulado</small><strong>${formatPnrCompactCurrency(totals.totalAnulado)}</strong><em>positivo</em></span>
        <span><small>Faturado</small><strong>${formatPnrSignedCurrency(-totals.totalFaturado)}</strong><em>negativo</em></span>
        <span><small>Saldo</small><strong>${formatPnrSignedCurrency(totals.saldoTotal)}</strong><em>resultado líquido</em></span>
      </div>
      <div class="pnr-value-timeline__legend" aria-label="Legenda do gráfico">
        <span><i class="is-anulado"></i>Anulado positivo</span>
        <span><i class="is-faturado"></i>Faturado negativo</span>
      </div>
    </div>
  `;
}

function renderPnrValueTimelineChart(rows) {
  const safeRows = getPnrValueTimelineRows(rows);

  if (!safeRows.length) {
    return emptyState(
      "Sem dados suficientes para exibir a evolução temporal.",
      "Ajuste os filtros ou importe uma base com histórico compatível."
    );
  }

  const width = 1180;
  const height = 430;
  const padding = { top: 14, right: 22, bottom: 42, left: 44 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const maxAnulado = Math.max(...safeRows.map((row) => row.valorAnulado), 0);
  const maxFaturado = Math.max(...safeRows.map((row) => row.valorFaturado), 0);
  const yMax = Math.max(maxAnulado, 1);
  const yMin = -Math.max(maxFaturado, 1);
  const ySpan = yMax - yMin || 1;
  const getX = (index) => padding.left + (safeRows.length === 1 ? innerWidth / 2 : (index / (safeRows.length - 1)) * innerWidth);
  const getY = (value) => padding.top + ((yMax - value) / ySpan) * innerHeight;
  const anuladoPoints = safeRows.map((row, index) => ({ x: getX(index), y: getY(row.valorAnulado), row }));
  const faturadoPoints = safeRows.map((row, index) => ({ x: getX(index), y: getY(-row.valorFaturado), row }));
  const zeroY = getY(0);
  const yTicks = [
    { value: yMax, label: formatPnrAxisCurrency(yMax) },
    { value: yMax / 2, label: formatPnrAxisCurrency(yMax / 2) },
    { value: 0, label: currency.format(0) },
    { value: yMin / 2, label: formatPnrAxisCurrency(yMin / 2) },
    { value: yMin, label: formatPnrAxisCurrency(yMin) },
  ];
  const labelEvery = safeRows.length > 8 ? Math.ceil(safeRows.length / 6) : 1;
  const anuladoPath = buildSvgLinePath(anuladoPoints);
  const faturadoPath = buildSvgLinePath(faturadoPoints);
  const anuladoAreaPath = buildSvgAreaPath(anuladoPoints, zeroY);
  const faturadoAreaPath = buildSvgAreaPath(faturadoPoints, zeroY);

  const renderPoint = (point, kind) => {
    const row = point.row;
    const currentIndex = safeRows.indexOf(row);
    const previousRow = currentIndex > 0 ? safeRows[currentIndex - 1] : null;
    const title = row.label || row.periodo || row.key || "Período";
    const saldo = row.saldoValue || 0;
    const totalPeriodo = row.valorAnulado + row.valorFaturado;
    const previousSaldo = previousRow ? Number(previousRow.saldoValue || 0) : null;
    const variation = previousSaldo == null ? null : saldo - previousSaldo;
    const lines = [
      `Período: ${title}`,
      `Anulado: ${currency.format(row.valorAnulado)}`,
      `Faturado: -${currency.format(row.valorFaturado)}`,
      `Saldo: ${formatPnrSignedCurrency(saldo)}`,
      variation == null ? "" : `Variação vs. anterior: ${formatPnrSignedCurrency(variation)}`,
      `Total do período: ${currency.format(totalPeriodo)}`,
    ].filter(Boolean).join("|");
    return `
      <circle
        class="pnr-value-point pnr-value-point--${kind} pnr-tooltip-target"
        cx="${point.x.toFixed(2)}"
        cy="${point.y.toFixed(2)}"
        r="4"
        data-tooltip-title="${escapeAttribute(title)}"
        data-tooltip-lines="${escapeAttribute(lines)}"
      ></circle>
    `;
  };

  return `
    <div class="pnr-value-timeline">
      <svg class="pnr-value-timeline__svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Evolução temporal de valores PNR">
        <defs>
          <filter id="pnr-line-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.55" result="blur"></feGaussianBlur>
            <feMerge>
              <feMergeNode in="blur"></feMergeNode>
              <feMergeNode in="SourceGraphic"></feMergeNode>
            </feMerge>
          </filter>
          <linearGradient id="pnr-anulado-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#2fc47c" stop-opacity="0.18"></stop>
            <stop offset="100%" stop-color="#2fc47c" stop-opacity="0"></stop>
          </linearGradient>
          <linearGradient id="pnr-faturado-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#ef5b64" stop-opacity="0"></stop>
            <stop offset="100%" stop-color="#ef5b64" stop-opacity="0.16"></stop>
          </linearGradient>
        </defs>
        <g class="pnr-value-grid">
          ${yTicks.map((tick) => {
            const y = getY(tick.value);
            return `
              <line x1="${padding.left + 6}" y1="${y.toFixed(2)}" x2="${width - padding.right}" y2="${y.toFixed(2)}"></line>
              <text x="${padding.left - 6}" y="${(y + 4).toFixed(2)}">${escapeHtml(tick.label)}</text>
            `;
          }).join("")}
          <line class="pnr-value-zero-line" x1="${padding.left + 6}" y1="${zeroY.toFixed(2)}" x2="${width - padding.right}" y2="${zeroY.toFixed(2)}"></line>
        </g>
        <g class="pnr-value-areas">
          <path class="pnr-value-area pnr-value-area--anulado" d="${anuladoAreaPath}"></path>
          <path class="pnr-value-area pnr-value-area--faturado" d="${faturadoAreaPath}"></path>
        </g>
        <g class="pnr-value-lines">
          <path class="pnr-value-line pnr-value-line--anulado" d="${anuladoPath}"></path>
          <path class="pnr-value-line pnr-value-line--faturado" d="${faturadoPath}"></path>
          <path class="pnr-value-line-glow pnr-value-line-glow--anulado" d="${anuladoPath}"></path>
          <path class="pnr-value-line-glow pnr-value-line-glow--faturado" d="${faturadoPath}"></path>
        </g>
        <g class="pnr-value-points">
          ${anuladoPoints.map((point) => renderPoint(point, "anulado")).join("")}
          ${faturadoPoints.map((point) => renderPoint(point, "faturado")).join("")}
        </g>
        <g class="pnr-value-axis-labels">
          ${safeRows.map((row, index) => {
            if (index % labelEvery !== 0 && index !== safeRows.length - 1) return "";
            const x = getX(index);
            return `<text x="${x.toFixed(2)}" y="${height - 13}" text-anchor="middle">${escapeHtml(getPnrTimelineAxisLabel(row))}</text>`;
          }).join("")}
        </g>
      </svg>
    </div>
  `;
}

function getNumberFromObject(source, keys, fallback = 0) {
  if (!source || typeof source !== "object") return fallback;
  for (const key of keys) {
    if (source[key] != null && source[key] !== "") return Number(source[key] || 0);
  }
  return fallback;
}

function buildPnrCardSummary(summary = {}, statusRows = []) {
  const cardSummary = createPnrSummary(Number(summary.count || 0));
  cardSummary.totalValue = Number(summary.totalValue ?? summary.total_value ?? 0);
  cardSummary.avgValue = Number(summary.avgValue ?? summary.avg_value ?? 0);
  cardSummary.faturamento = getNumberFromObject(summary, ["quantidadeFaturados", "quantidade_faturados", "faturadoCount", "faturado_count", "faturamento"], 0);
  cardSummary.valorFaturado = getNumberFromObject(summary, ["valorFaturado", "valor_faturado", "faturadoValue", "faturado_value"], 0);
  cardSummary.anulado = getNumberFromObject(summary, ["quantidadeAnulados", "quantidade_anulados", "anuladoCount", "anulado_count", "anulado"], 0);
  cardSummary.valorAnulado = getNumberFromObject(summary, ["valorAnulado", "valor_anulado", "anuladoValue", "anulado_value"], 0);
  cardSummary.aberto = getNumberFromObject(summary, ["quantidadeEmAbertoAnalise", "quantidade_em_aberto_analise", "abertoAnaliseCount", "aberto_analise_count", "aberto"], 0);
  cardSummary.valorAberto = getNumberFromObject(summary, ["valorEmAbertoAnalise", "valor_em_aberto_analise", "abertoAnaliseValue", "aberto_analise_value"], 0);

  const hasStatusValues = Array.isArray(statusRows) && statusRows.some((row) => row && (row.totalValue != null || row.total_value != null));
  if (hasStatusValues && (!cardSummary.valorFaturado || !cardSummary.valorAnulado || !cardSummary.valorAberto)) {
    cardSummary.faturamento = 0;
    cardSummary.valorFaturado = 0;
    cardSummary.anulado = 0;
    cardSummary.valorAnulado = 0;
    cardSummary.aberto = 0;
    cardSummary.valorAberto = 0;
    statusRows.forEach((row) => {
      addPnrSummaryStatus(
        cardSummary,
        row?.label,
        Number(row?.totalValue ?? row?.total_value ?? 0),
        Number(row?.count || 0)
      );
    });
  }

  return completePnrSummary(cardSummary);
}

function buildPnrKpiCards(summary = {}, statusRows = []) {
  const metrics = buildPnrCardSummary(summary, statusRows);
  const count = Number(metrics.count || 0);
  const totalValue = Number(metrics.totalValue || 0);
  const percentOfCount = (value) => formatPercent(count ? (Number(value || 0) / count) * 100 : 0);
  const percentOfValue = (value) => formatPercent(totalValue ? (Number(value || 0) / totalValue) * 100 : 0);
  return [
    {
      label: "Total de PNRs",
      value: integer.format(count),
      tone: "kpi-card--volume",
      delta: `${formatPercent(count ? 100 : 0)} do recorte`,
      description: "Casos PNR no recorte",
    },
    {
      label: "Valor total",
      value: currency.format(totalValue),
      tone: "kpi-card--finance",
      delta: `${formatPercent(totalValue ? 100 : 0)} do valor no recorte`,
      description: "Soma geral dos valores PNR",
    },
    {
      label: "Valor faturado",
      value: currency.format(metrics.valorFaturado),
      tone: "kpi-card--problem",
      delta: `${percentOfValue(metrics.valorFaturado)} do valor total`,
      description: "Impacto negativo direcionado para cobrança",
    },
    {
      label: "Ticket médio",
      value: currency.format(metrics.ticketMedioGeral),
      tone: "kpi-card--neutral",
      delta: "Média por registro",
      details: [
        { label: "Faturado", value: currency.format(metrics.ticketMedioFaturado) },
        { label: "Anulado", value: currency.format(metrics.ticketMedioAnulado) },
      ],
    },
    {
      label: "Valor anulado",
      value: currency.format(metrics.valorAnulado),
      tone: "kpi-card--neutral",
      delta: `${percentOfValue(metrics.valorAnulado)} do valor total`,
      description: "Valor positivo sem cobrança no recorte",
    },
    {
      label: "Em aberto/análise",
      value: integer.format(metrics.aberto),
      tone: "kpi-card--neutral",
      delta: `${percentOfCount(metrics.aberto)} dos PNRs`,
      description: "Casos ainda pendentes de definição",
    },
  ];
}

function renderPnrTable(rows, allRows, options = {}) {
  const totalRows = Array.isArray(allRows) ? allRows.length : Number(allRows || 0);
  const totalPages = Math.max(1, Math.ceil(totalRows / state.pageSize));
  state.page = Math.min(Math.max(1, state.page), totalPages);
  const tableMinWidth = PNR_TABLE_COLUMNS.reduce((sum, column) => sum + column.width, 0);
  const isInitialLoading = (options.pending || pnrRemoteState.loadingTable) && !rows.length && !totalRows;
  return `
    <article class="panel pnr-table-panel" data-pnr-table-panel>
      <div class="panel__header">
        <div>
          <h3>Tabela detalhada de PNRs</h3>
          <p>${isInitialLoading ? "Carregando página atual..." : `${integer.format(totalRows)} registros no recorte`}</p>
        </div>
        ${renderPnrTableActions(totalRows, isInitialLoading)}
      </div>
      ${isInitialLoading ? renderDashboardSkeletonTable(6, 7) : `
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
            `).join("") : `<tr><td colspan="${PNR_TABLE_COLUMNS.length}">${emptyState("Nenhum resultado encontrado", "Nenhum resultado encontrado para os filtros atuais.")}</td></tr>`}
          </tbody>
        </table>
      </div>
      <div class="table-footer">
        <div>${totalRows ? `${integer.format((state.page - 1) * state.pageSize + 1)}-${integer.format(Math.min(state.page * state.pageSize, totalRows))}` : "0-0"} de ${integer.format(totalRows)}</div>
        <div class="pagination">
          <button type="button" class="secondary-button secondary-button--icon pnr-pagination-button" data-pnr-page="prev"${state.page <= 1 ? " disabled" : ""} aria-label="Página anterior" title="Página anterior">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 6-6 6 6 6" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg>
          </button>
          <span id="pnr-page-indicator">Página ${integer.format(state.page)} de ${integer.format(totalPages)}</span>
          <button type="button" class="secondary-button secondary-button--icon pnr-pagination-button" data-pnr-page="next"${state.page >= totalPages ? " disabled" : ""} aria-label="Próxima página" title="Próxima página">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg>
          </button>
        </div>
      </div>
      `}
    </article>
  `;
}

function renderPnrTableOnly() {
  if (state.sheet !== DEVIATION_MANAGEMENT_VIEW || state.activeDesvioCategory !== DEVIATION_CATEGORY_PNRS || state.appView !== "dashboard") {
    renderAll();
    return;
  }
  const tablePanel = el.deviationManagementView?.querySelector("[data-pnr-table-panel]");
  if (!tablePanel) {
    renderAll();
    return;
  }
  try {
    if (hasPnrRemoteData() || pnrRemoteState.loadingTable) {
      tablePanel.outerHTML = renderPnrTable(pnrRemoteState.rows, pnrRemoteState.total);
    } else {
      const { sortedRows, pagedRows } = getPnrTableViewModel();
      tablePanel.outerHTML = renderPnrTable(pagedRows, sortedRows);
    }
  } catch (error) {
    console.error("Erro ao atualizar tabela de PNRs:", error);
    console.error("Stack:", error?.stack);
    tablePanel.outerHTML = `
      <article class="panel pnr-table-panel" data-pnr-table-panel>
        <div class="panel__header">
          <div>
            <h3>Tabela detalhada de PNRs</h3>
            <p>Não foi possível atualizar a tabela.</p>
          </div>
        </div>
        ${emptyState("Erro na tabela", "Verifique o console para o erro técnico.")}
      </article>
    `;
  }
}

function renderPnrRemoteLoadingOnly() {
  if (state.sheet !== DEVIATION_MANAGEMENT_VIEW || state.activeDesvioCategory !== DEVIATION_CATEGORY_PNRS || state.appView !== "dashboard") return;
  const tablePanel = el.deviationManagementView?.querySelector("[data-pnr-table-panel]");
  if (tablePanel && hasPnrRemoteData()) {
    tablePanel.outerHTML = renderPnrTable(pnrRemoteState.rows, pnrRemoteState.total);
  }
}

function renderPnrSkeleton(title = "Carregando", description = "Consultando dados processados.") {
  return `
    <div class="dashboard-module-skeleton">
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(description)}</span>
      ${renderDashboardSkeletonChart(title)}
    </div>
  `;
}

function renderPnrPage() {
  const hasRemoteFiles = getPnrRemoteFileIds().length > 0;
  const pnrBaseState = getModuleBaseState(DASHBOARD_MODULE_KEYS.desviosPnr);
  const hasPersistedPnrBase = moduleHasConfirmedBase(DASHBOARD_MODULE_KEYS.desviosPnr);
  const hasRemoteScope = hasRemoteFiles || hasPersistedPnrBase;
  const hasAnyPnrData = hasPnrRemoteData() || pnrRows.length > 0;
  if (!hasRemoteScope && !hasAnyPnrData) {
    if (pnrBaseState.status === MODULE_BASE_STATUS.error) {
      console.info("[Render Decision]", DASHBOARD_MODULE_KEYS.desviosPnr, {
        hasHydratedFromSupabase: pnrBaseState.hasHydratedFromSupabase,
        totalPersisted: pnrBaseState.totalPersisted,
        dashboardFiles: dashboardFileRecords.length,
        render: "error",
        reason: "pnr-base-check-error",
      });
      return `
        <section class="pnr-page">
          ${renderDashboardErrorState(getDashboardStateConfig("supabase-error"))}
        </section>
      `;
    }
    if (moduleIsConfirmedEmpty(DASHBOARD_MODULE_KEYS.desviosPnr)) {
      console.info("[Render Decision]", DASHBOARD_MODULE_KEYS.desviosPnr, {
        hasHydratedFromSupabase: pnrBaseState.hasHydratedFromSupabase,
        totalPersisted: pnrBaseState.totalPersisted,
        dashboardFiles: dashboardFileRecords.length,
        render: "empty",
        reason: "pnr-totalPersisted=0",
      });
      return `
        <section class="pnr-page">
          ${renderDashboardEmptyState(getModuleEmptyStateConfig(DASHBOARD_MODULE_KEYS.desviosPnr))}
        </section>
      `;
    }
    if (pnrBaseState.hasHydratedFromSupabase !== true && !pnrBaseState.checkStartedAt) {
      void checkModulePersistedData(DASHBOARD_MODULE_KEYS.desviosPnr, { reason: "pnr-enter-tab" }).then((baseState) => {
        if (baseState.status === MODULE_BASE_STATUS.loaded) {
          schedulePnrRemoteRefresh({ immediate: true, force: true, reason: "pnr-enter-tab" });
        } else {
          renderAll();
        }
      });
    }
    console.info("[Render Decision]", DASHBOARD_MODULE_KEYS.desviosPnr, {
      hasHydratedFromSupabase: pnrBaseState.hasHydratedFromSupabase,
      totalPersisted: pnrBaseState.totalPersisted,
      dashboardFiles: dashboardFileRecords.length,
      render: "loading",
      reason: "pnr-hydration-pending",
    });
    return `
      <section class="pnr-page">
        ${renderDashboardLoadingState({
          title: "Carregando dados da base...",
          description: "Consultando informações salvas no painel.",
          loading: true,
        })}
      </section>
    `;
  }
  if (hasRemoteScope && !hasPnrRemoteData() && !pnrRemoteState.loadingTable && !pnrRemoteState.error) {
    applyPnrLightCacheIfAvailable(buildPnrCacheSignature());
  }
  const remotePending = hasRemoteScope && !hasPnrRemoteData() && !pnrRemoteState.loadingSummary && !pnrRemoteState.loadingCharts && !pnrRemoteState.loadingTable && !pnrRemoteState.error;
  const shouldUseRemote = hasRemoteScope && (hasPnrRemoteData() || remotePending || pnrRemoteState.loadingSummary || pnrRemoteState.loadingCharts || pnrRemoteState.loadingTable || !pnrRows.length);
  if (hasRemoteScope && !pnrRemoteState.source && !pnrRemoteState.loadingTable && !pnrRemoteState.error) {
    schedulePnrRemoteRefresh({ immediate: true });
  }
  const localTableView = shouldUseRemote ? { filteredRows: [], sortedRows: [], pagedRows: [] } : getPnrTableViewModel();
  const { filteredRows, sortedRows, pagedRows } = localTableView;
  const analysis = shouldUseRemote && pnrRemoteState.summary
    ? {
      summary: pnrRemoteState.summary,
      statusRows: pnrRemoteState.statusRows,
      operationRows: pnrRemoteState.operationRows,
      stationRows: pnrRemoteState.stationRows,
      driverRows: pnrRemoteState.driverRows,
      evolutionRows: pnrRemoteState.evolutionRows,
    }
    : getPnrAnalysisData(filteredRows);
  const { summary, statusRows, operationRows, stationRows, driverRows, evolutionRows } = analysis;
  const cards = buildPnrKpiCards(summary, statusRows);
  const pnrUpdatingBadge = (remotePending || pnrRemoteState.loadingSummary || pnrRemoteState.loadingCharts || pnrRemoteState.loadingTable) && summary.count
    ? renderDashboardUpdatingBadge(DASHBOARD_MODULE_KEYS.desviosPnr)
    : "";
  const noPnrBase = moduleIsConfirmedEmpty(DASHBOARD_MODULE_KEYS.desviosPnr) && !pnrRows.length && !hasPnrRemoteData() && !pnrRemoteState.loadingTable && !pnrRemoteState.loadingSummary && !pnrRemoteState.loadingCharts && !pnrRemoteState.error;
  if (noPnrBase) {
    return `
      <section class="pnr-page">
        ${renderDashboardEmptyState(getModuleEmptyStateConfig(DASHBOARD_MODULE_KEYS.desviosPnr))}
      </section>
    `;
  }
  if (pnrBaseState.status === MODULE_BASE_STATUS.error && !hasPnrRemoteData() && !pnrRows.length) {
    return `
      <section class="pnr-page">
        ${renderDashboardErrorState(getDashboardStateConfig("supabase-error"))}
      </section>
    `;
  }
  return `
    <section class="pnr-page">
      ${pnrUpdatingBadge}

      <section class="kpi-grid__group kpi-grid__group--main pnr-kpi-grid" aria-label="Cards principais de PNRs">
        ${(remotePending || pnrRemoteState.loadingSummary) && !summary.count ? Array.from({ length: 6 }).map((_, index) => renderDashboardSkeletonCard(index)).join("") : cards.map((card, index) => renderKpiCard(card, index)).join("")}
      </section>

      <section class="pnr-analysis-grid">
        <article class="panel pnr-chart-panel pnr-chart-panel--value-timeline">
          <div class="panel__header">
            <div class="pnr-value-header-copy"><h3>Evolução temporal de valores PNR</h3><p>Comparativo entre valores anulados (positivo) e faturados (negativo) no período</p></div>
            ${renderPnrValueTimelineHeaderMeta((remotePending || pnrRemoteState.loadingCharts) && !evolutionRows.length ? [] : evolutionRows)}
          </div>
          ${(remotePending || pnrRemoteState.loadingCharts) && !evolutionRows.length ? renderPnrSkeleton("Carregando evolução", "Buscando valores anulados e faturados.") : renderPnrValueTimelineChart(evolutionRows)}
        </article>
        <article class="panel pnr-chart-panel">
          <div class="panel__header"><div><h3>Estações com maior volume</h3><p>Ranking por estação de origem</p></div></div>
          ${(remotePending || pnrRemoteState.loadingCharts) && !stationRows.length ? renderPnrSkeleton("Carregando ranking", "Buscando top 10 estações.") : renderPnrRankingList(stationRows, "Sem estações")}
        </article>
        <article class="panel pnr-chart-panel">
          <div class="panel__header"><div><h3>Motoristas com maior volume de PNR</h3><p>Nome localizado por cruzamento ou ID do motorista</p></div></div>
          ${(remotePending || pnrRemoteState.loadingCharts) && !driverRows.length ? renderPnrSkeleton("Carregando ranking", "Buscando top 10 motoristas.") : renderPnrRankingList(driverRows, "Sem motoristas")}
        </article>
      </section>

      ${renderPnrTable(shouldUseRemote ? pnrRemoteState.rows : pagedRows, shouldUseRemote ? pnrRemoteState.total : sortedRows, { pending: remotePending })}
    </section>
  `;
}

function hasLoadedDashboardData() {
  return activeDataset && activeDataset.id !== EMPTY_DATASET_ID && Array.isArray(allRows) && allRows.length > 0;
}

function getDashboardModuleKeyForSheet(sheet = state.sheet) {
  if (sheet === PACKAGE_MANAGEMENT_VIEW) return DASHBOARD_MODULE_KEYS.pacotes;
  if (sheet === MONTHLY_BASE_VIEW || (sheet === PRE_FATURA_VIEW && state.preFaturaView === PREFATURA_VIEW_EVOLUTION)) return DASHBOARD_MODULE_KEYS.evolucao;
  if (sheet === DEVIATION_MANAGEMENT_VIEW) return DASHBOARD_MODULE_KEYS.desviosPnr;
  return DASHBOARD_MODULE_KEYS.preFatura;
}

function createModuleBaseState(patch = {}) {
  return {
    status: MODULE_BASE_STATUS.loading,
    hasHydratedFromSupabase: false,
    hasCheckedPersistedData: false,
    moduleHasPersistedData: null,
    hasPersistedData: null,
    totalPersisted: null,
    total: null,
    filteredTotal: null,
    error: null,
    checkStartedAt: "",
    lastCheckedAt: "",
    source: "",
    reason: "",
    ...patch,
  };
}

function getModulePersistedTableName(moduleKey) {
  if (moduleKey === DASHBOARD_MODULE_KEYS.desviosPnr) return "desvios_pnr_records";
  if (moduleKey === DASHBOARD_MODULE_KEYS.pacotes) return "gestao_pacotes_records";
  if (moduleKey === DASHBOARD_MODULE_KEYS.preFatura) return "pre_fatura_records";
  return "";
}

function getModuleBaseLogPrefix(moduleKey) {
  if (moduleKey === DASHBOARD_MODULE_KEYS.desviosPnr) return "[PNR Base Check]";
  if (moduleKey === DASHBOARD_MODULE_KEYS.preFatura) return "[PreFatura Base Check]";
  if (moduleKey === DASHBOARD_MODULE_KEYS.pacotes) return "[GestaoPacotes Base Check]";
  return "[Module Base Check]";
}

function getModuleBaseState(moduleKey = getDashboardModuleKeyForSheet()) {
  return moduleBaseState[moduleKey] || createModuleBaseState();
}

function setModuleBaseState(moduleKey, patch = {}) {
  if (!moduleBaseState[moduleKey]) moduleBaseState[moduleKey] = createModuleBaseState();
  const previous = { ...moduleBaseState[moduleKey] };
  const nextPatch = { ...patch };
  if (nextPatch.hasHydratedFromSupabase !== undefined && nextPatch.hasCheckedPersistedData === undefined) {
    nextPatch.hasCheckedPersistedData = nextPatch.hasHydratedFromSupabase;
  }
  if (nextPatch.hasCheckedPersistedData !== undefined && nextPatch.hasHydratedFromSupabase === undefined) {
    nextPatch.hasHydratedFromSupabase = nextPatch.hasCheckedPersistedData;
  }
  if (nextPatch.moduleHasPersistedData !== undefined && nextPatch.hasPersistedData === undefined) {
    nextPatch.hasPersistedData = nextPatch.moduleHasPersistedData;
  }
  if (nextPatch.hasPersistedData !== undefined && nextPatch.moduleHasPersistedData === undefined) {
    nextPatch.moduleHasPersistedData = nextPatch.hasPersistedData;
  }
  if (nextPatch.totalPersisted !== undefined && nextPatch.total === undefined) {
    nextPatch.total = nextPatch.totalPersisted;
  }
  if (nextPatch.total !== undefined && nextPatch.totalPersisted === undefined) {
    nextPatch.totalPersisted = nextPatch.total;
  }
  if (nextPatch.hasCheckedPersistedData === undefined) {
    nextPatch.hasCheckedPersistedData = Boolean(
      nextPatch.status === MODULE_BASE_STATUS.loaded ||
      nextPatch.status === MODULE_BASE_STATUS.empty ||
      nextPatch.status === MODULE_BASE_STATUS.error ||
      moduleBaseState[moduleKey].hasCheckedPersistedData,
    );
  }
  if (nextPatch.hasHydratedFromSupabase === undefined) {
    nextPatch.hasHydratedFromSupabase = nextPatch.hasCheckedPersistedData;
  }
  if (nextPatch.hasPersistedData === undefined) {
    if (nextPatch.status === MODULE_BASE_STATUS.loaded) nextPatch.hasPersistedData = true;
    else if (nextPatch.status === MODULE_BASE_STATUS.empty) nextPatch.hasPersistedData = false;
    else nextPatch.hasPersistedData = moduleBaseState[moduleKey].hasPersistedData;
  }
  if (nextPatch.moduleHasPersistedData === undefined) {
    nextPatch.moduleHasPersistedData = nextPatch.hasPersistedData;
  }
  if (nextPatch.filteredTotal === undefined && nextPatch.total !== undefined) {
    nextPatch.filteredTotal = nextPatch.total;
  }
  if (
    nextPatch.checkStartedAt === undefined &&
    (nextPatch.status === MODULE_BASE_STATUS.loading || nextPatch.status === MODULE_BASE_STATUS.refreshing)
  ) {
    nextPatch.checkStartedAt = moduleBaseState[moduleKey].checkStartedAt || new Date().toISOString();
  }
  moduleBaseState[moduleKey] = createModuleBaseState({
    ...moduleBaseState[moduleKey],
    ...nextPatch,
    lastCheckedAt: nextPatch.lastCheckedAt || new Date().toISOString(),
  });
  console.info("[Module State]", {
    module: moduleKey,
    previousState: previous.status,
    nextState: moduleBaseState[moduleKey].status,
    hasHydratedFromSupabase: moduleBaseState[moduleKey].hasHydratedFromSupabase,
    hasCheckedPersistedData: moduleBaseState[moduleKey].hasCheckedPersistedData,
    moduleHasPersistedData: moduleBaseState[moduleKey].moduleHasPersistedData,
    hasPersistedData: moduleBaseState[moduleKey].hasPersistedData,
    totalPersisted: moduleBaseState[moduleKey].totalPersisted,
    total: moduleBaseState[moduleKey].total,
    filteredTotal: moduleBaseState[moduleKey].filteredTotal,
    checkStartedAt: moduleBaseState[moduleKey].checkStartedAt,
    source: moduleBaseState[moduleKey].source,
    reason: moduleBaseState[moduleKey].reason,
    error: moduleBaseState[moduleKey].error,
  });
  console.info(getModuleBaseLogPrefix(moduleKey), {
    module: moduleKey,
    state: moduleBaseState[moduleKey].status,
    totalPersisted: moduleBaseState[moduleKey].totalPersisted,
    hasHydratedFromSupabase: moduleBaseState[moduleKey].hasHydratedFromSupabase,
    hasCheckedPersistedData: moduleBaseState[moduleKey].hasCheckedPersistedData,
    moduleHasData: moduleBaseState[moduleKey].moduleHasPersistedData,
    reason: moduleBaseState[moduleKey].reason,
  });
  return moduleBaseState[moduleKey];
}

function moduleHasConfirmedBase(moduleKey = getDashboardModuleKeyForSheet()) {
  const baseState = getModuleBaseState(moduleKey);
  return baseState.moduleHasPersistedData === true &&
    baseState.status !== MODULE_BASE_STATUS.empty &&
    baseState.status !== MODULE_BASE_STATUS.error &&
    Number(baseState.totalPersisted ?? baseState.total ?? 0) > 0;
}

function moduleIsConfirmedEmpty(moduleKey = getDashboardModuleKeyForSheet()) {
  const baseState = getModuleBaseState(moduleKey);
  return baseState.hasHydratedFromSupabase === true &&
    baseState.status === MODULE_BASE_STATUS.empty &&
    baseState.moduleHasPersistedData === false &&
    Number(baseState.totalPersisted ?? baseState.total ?? 0) === 0 &&
    !baseState.error;
}

function moduleBaseCheckPending(moduleKey = getDashboardModuleKeyForSheet()) {
  const baseState = getModuleBaseState(moduleKey);
  if (baseState.hasHydratedFromSupabase !== true) return true;
  const status = getModuleBaseState(moduleKey).status;
  return status === MODULE_BASE_STATUS.idle || status === MODULE_BASE_STATUS.loading || status === MODULE_BASE_STATUS.refreshing;
}

async function countRowsInPersistedTable(tableName) {
  if (!window.supabaseClient || !tableName) return 0;
  const { count, error } = await withTimeout(
    window.supabaseClient
      .from(tableName)
      .select("id", { count: "exact", head: true }),
    SUPABASE_QUERY_TIMEOUT_MS,
    `Tempo limite excedido ao validar base persistida ${tableName}.`,
  );
  if (error) throw error;
  return Number(count || 0);
}

async function countEvolutionPersistedRows() {
  const keys = [DASHBOARD_MODULE_KEYS.preFatura, DASHBOARD_MODULE_KEYS.pacotes, DASHBOARD_MODULE_KEYS.desviosPnr];
  const results = await Promise.allSettled(keys.map((key) => countRowsInPersistedTable(getModulePersistedTableName(key))));
  const fulfilled = results.filter((result) => result.status === "fulfilled").map((result) => Number(result.value || 0));
  const rejected = results.filter((result) => result.status === "rejected");
  const total = fulfilled.reduce((sum, value) => sum + value, 0);
  if (total > 0 || (!rejected.length && fulfilled.length === keys.length)) return total;
  throw rejected[0]?.reason || new Error("Não foi possível validar dados persistidos da evolução mensal.");
}

async function checkModulePersistedData(moduleKey = getDashboardModuleKeyForSheet(), options = {}) {
  if (!currentUser || !window.supabaseClient) {
    return setModuleBaseState(moduleKey, {
      status: MODULE_BASE_STATUS.loading,
      hasHydratedFromSupabase: false,
      hasCheckedPersistedData: false,
      moduleHasPersistedData: null,
      hasPersistedData: null,
      totalPersisted: null,
      total: null,
      filteredTotal: null,
      error: null,
      source: "session",
      reason: options.reason || "not-ready",
    });
  }
  const previous = getModuleBaseState(moduleKey);
  console.info("[Base Check]", moduleKey, "checking persisted data", {
    previousState: previous.status,
    hasHydratedFromSupabase: previous.hasHydratedFromSupabase,
    hasCheckedPersistedData: previous.hasCheckedPersistedData,
    reason: options.reason || "base-check",
  });
  setModuleBaseState(moduleKey, {
    status: previous.status === MODULE_BASE_STATUS.loaded ? MODULE_BASE_STATUS.refreshing : MODULE_BASE_STATUS.loading,
    hasHydratedFromSupabase: false,
    hasCheckedPersistedData: false,
    error: null,
    source: "Supabase",
    reason: options.reason || "base-check",
  });
  try {
    const tableName = getModulePersistedTableName(moduleKey);
    const total = moduleKey === DASHBOARD_MODULE_KEYS.evolucao
      ? await countEvolutionPersistedRows()
      : await countRowsInPersistedTable(tableName);
    return setModuleBaseState(moduleKey, {
      status: total > 0 ? MODULE_BASE_STATUS.loaded : MODULE_BASE_STATUS.empty,
      hasHydratedFromSupabase: true,
      hasCheckedPersistedData: true,
      moduleHasPersistedData: total > 0,
      hasPersistedData: total > 0,
      totalPersisted: total,
      total,
      filteredTotal: total,
      error: null,
      source: tableName || "persisted-aggregates",
      reason: options.reason || "base-check",
    });
  } catch (error) {
    console.error(getModuleBaseLogPrefix(moduleKey), "rpc/table error -> state=error, not empty", error);
    dashboardLastError = error;
    return setModuleBaseState(moduleKey, {
      status: MODULE_BASE_STATUS.error,
      hasHydratedFromSupabase: true,
      hasCheckedPersistedData: true,
      moduleHasPersistedData: previous.moduleHasPersistedData === true ? true : null,
      hasPersistedData: previous.hasPersistedData === true ? true : null,
      totalPersisted: previous.totalPersisted,
      total: previous.total,
      filteredTotal: previous.filteredTotal,
      error: error?.message || String(error),
      source: "Supabase",
      reason: options.reason || "base-check",
    });
  }
}

async function checkAllModulePersistedBases(options = {}) {
  const keys = [
    DASHBOARD_MODULE_KEYS.preFatura,
    DASHBOARD_MODULE_KEYS.pacotes,
    DASHBOARD_MODULE_KEYS.desviosPnr,
    DASHBOARD_MODULE_KEYS.evolucao,
  ];
  const loadPrefix = options.reason === "initial-load" ? "[Initial Load]" : "[Reload Load]";
  console.info(loadPrefix, "início da validação de bases persistidas", { reason: options.reason || "reload" });
  console.info("[Dashboard Reload State] início da validação de bases persistidas", { reason: options.reason || "reload" });
  const results = await Promise.allSettled(keys.map((key) => checkModulePersistedData(key, { reason: options.reason || "reload" })));
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      console.error("[Dashboard Reload State] Falha inesperada na validação", { module: keys[index], error: result.reason });
    }
  });
  return moduleBaseState;
}


function logDashboardState(prefix, moduleKey, message, details) {
  const label = moduleKey ? `${prefix}[${moduleKey}]` : prefix;
  if (details === undefined) console.info(label, message);
  else console.info(label, message, details);
}

function getModuleEmptyStateConfig(moduleKey = getDashboardModuleKeyForSheet()) {
  const copy = DASHBOARD_EMPTY_STATE_COPY[moduleKey] || DASHBOARD_EMPTY_STATE_COPY[DASHBOARD_MODULE_KEYS.preFatura];
  return {
    ...getDashboardStateConfig("no-active-file"),
    ...copy,
    moduleKey,
    action: moduleKey === DASHBOARD_MODULE_KEYS.evolucao ? "" : "upload",
    actionLabel: moduleKey === DASHBOARD_MODULE_KEYS.evolucao ? "" : "Importar arquivo",
  };
}

function getDashboardHasModuleData(moduleKey = getDashboardModuleKeyForSheet()) {
  if (moduleHasConfirmedBase(moduleKey)) return true;
  if (moduleKey === DASHBOARD_MODULE_KEYS.pacotes) return packageManagementRows.length > 0;
  if (moduleKey === DASHBOARD_MODULE_KEYS.evolucao) return getEvolutionSourceDatasets().length > 0;
  if (moduleKey === DASHBOARD_MODULE_KEYS.desviosPnr) return getPnrRemoteFileIds().length > 0 || pnrRows.length > 0 || hasPnrRemoteData();
  return hasLoadedDashboardData();
}

function moduleHasRenderedRows(moduleKey = getDashboardModuleKeyForSheet()) {
  if (moduleKey === DASHBOARD_MODULE_KEYS.pacotes) return packageManagementRows.length > 0;
  if (moduleKey === DASHBOARD_MODULE_KEYS.evolucao) return getEvolutionSourceDatasets().length > 0;
  if (moduleKey === DASHBOARD_MODULE_KEYS.desviosPnr) return hasPnrRemoteData() || pnrRows.length > 0;
  return Array.isArray(allRows) && allRows.length > 0;
}

function setDashboardImportState(patch = {}, options = {}) {
  Object.assign(dashboardImportState, {
    ...patch,
    active: patch.active ?? true,
    updatedAt: new Date().toISOString(),
  });
  const moduleKey = dashboardImportState.moduleKey || getDashboardModuleKeyForSheet();
  logDashboardState("[Dashboard Import]", moduleKey, dashboardImportState.stage || "atualização de importação", {
    fileName: dashboardImportState.fileName,
    progress: dashboardImportState.progress,
    sheet: dashboardImportState.sheetName,
    rowsRead: dashboardImportState.rowsRead,
    rowsImported: dashboardImportState.rowsImported,
  });
  if (options.render !== false && dashboardVisualState === "processing-file" && state.appView === "dashboard") {
    renderAll();
  }
}

function finishDashboardImportState(summary = {}) {
  setDashboardImportState({
    ...summary,
    active: false,
    stage: "Importação concluída.",
    progress: 100,
    status: "processed",
  }, { render: false });
}

function showDashboardImportSummary(metadata = {}, dataset = {}, options = {}) {
  const moduleKey = getDashboardModuleKeyForFileCategory(dataset.fileCategory || metadata.file_category || metadata.semantic_file_type || PRE_FATURA_FILE_CATEGORY);
  const moduleLabel = DASHBOARD_MODULE_LABELS[moduleKey] || "Painel";
  const fileName = metadata.original_name || metadata.file_name || dataset.fileName || dashboardImportState.fileName || "arquivo";
  const sheetCount = Number(metadata.sheet_count || dataset.workbookSheetCount || dashboardImportState.sheetCount || 1);
  const importedSheets = Array.isArray(metadata.imported_sheets) ? metadata.imported_sheets : dashboardImportState.importedSheets || [];
  const ignoredSheets = Array.isArray(metadata.ignored_sheets) ? metadata.ignored_sheets : dashboardImportState.ignoredSheets || [];
  const rowsRead = Number(metadata.total_rows_read || dashboardImportState.rowsRead || dataset.rows?.length || 0);
  const rowsImported = Number(metadata.total_rows_imported || options.rowsImported || dashboardImportState.rowsImported || dataset.rows?.length || 0);
  const duplicatesIgnored = Number(metadata.duplicate_rows_skipped || options.duplicatesIgnored || dashboardImportState.duplicatesIgnored || 0);
  const fileRole = metadata.file_role || metadata.pnr_file_role || (moduleKey === DASHBOARD_MODULE_KEYS.desviosPnr ? getPnrFileRole(fileName) : "");
  const roleLabel = moduleKey === DASHBOARD_MODULE_KEYS.desviosPnr
    ? fileRole === "master" ? "Mestre PNR" : "Arquivo complementar"
    : "";
  const pnrTotalText = moduleKey === DASHBOARD_MODULE_KEYS.desviosPnr && Number.isFinite(Number(options.totalRows))
    ? `Total atual da base PNR: ${integer.format(Number(options.totalRows))}.`
    : "";
  const rawStorageMessage = KEEP_RAW_UPLOADS_IN_STORAGE
    ? "Dados salvos na base do painel."
    : "Arquivo usado apenas para extração. Dados salvos no banco.";
  const message = [
    "Importação concluída.",
    `Arquivo: ${fileName}.`,
    `Módulo: ${moduleLabel}.`,
    roleLabel ? `Tipo identificado: ${roleLabel}.` : "",
    `Abas lidas: ${integer.format(sheetCount)}.`,
    `Abas importadas: ${integer.format(importedSheets.length || (sheetCount ? 1 : 0))}.`,
    `Abas ignoradas: ${integer.format(ignoredSheets.length)}.`,
    `Linhas lidas: ${integer.format(rowsRead)}.`,
    `Registros importados: ${integer.format(rowsImported)}.`,
    `Duplicados ignorados: ${integer.format(duplicatesIgnored)}.`,
    pnrTotalText,
    "Status: processado.",
    rawStorageMessage,
  ].filter(Boolean).join(" ");
  console.info("[Dashboard Import] Resumo final", {
    fileName,
    moduleKey,
    sheetCount,
    importedSheets,
    ignoredSheets,
    rowsRead,
    rowsImported,
    duplicatesIgnored,
    rawFileDeleted: !KEEP_RAW_UPLOADS_IN_STORAGE,
  });
  showToast(message, "good", sheetCount > 1 ? 11000 : 8200);
}

function resetDashboardImportState() {
  Object.assign(dashboardImportState, {
    active: false,
    moduleKey: "",
    fileName: "",
    fileType: "",
    stage: "",
    progress: 0,
    sheetName: "",
    sheetIndex: 0,
    sheetCount: 0,
    rowsRead: 0,
    rowsImported: 0,
    duplicatesIgnored: 0,
    ignoredSheets: [],
    importedSheets: [],
    status: "",
    updatedAt: "",
  });
}

function renderDashboardUpdatingBadge(moduleKey = getDashboardModuleKeyForSheet(), text = "Atualizando dados em segundo plano...") {
  if (!moduleLoadingState[moduleKey] && getModuleBaseState(moduleKey).status !== MODULE_BASE_STATUS.refreshing) return "";
  return `
    <div class="dashboard-updating-badge" role="status" aria-live="polite">
      <span class="dashboard-updating-badge__dot" aria-hidden="true"></span>
      <span>${escapeHtml(text)}</span>
    </div>
  `;
}

function renderDashboardSkeletonCard(index = 0) {
  return `
    <article class="dashboard-skeleton dashboard-skeleton-card" style="--reveal-index:${index}" aria-hidden="true">
      <span class="dashboard-skeleton__line dashboard-skeleton__line--short"></span>
      <span class="dashboard-skeleton__value"></span>
      <span class="dashboard-skeleton__line"></span>
    </article>
  `;
}

function renderDashboardSkeletonChart(title = "Carregando gráfico") {
  return `
    <div class="dashboard-skeleton dashboard-skeleton-chart" aria-label="${escapeAttribute(title)}">
      <span class="dashboard-skeleton__line dashboard-skeleton__line--short"></span>
      <div class="dashboard-skeleton-chart__bars" aria-hidden="true">
        <span style="height:62%"></span>
        <span style="height:38%"></span>
        <span style="height:76%"></span>
        <span style="height:48%"></span>
        <span style="height:58%"></span>
      </div>
    </div>
  `;
}

function renderDashboardSkeletonTable(rows = 6, columns = 6) {
  return `
    <div class="dashboard-skeleton dashboard-skeleton-table" aria-label="Carregando tabela">
      ${Array.from({ length: rows }).map(() => `
        <div class="dashboard-skeleton-table__row" style="--columns:${columns}">
          ${Array.from({ length: columns }).map(() => "<span></span>").join("")}
        </div>
      `).join("")}
    </div>
  `;
}

function renderDashboardLoadingState(status) {
  return `
    <article class="dashboard-state-card dashboard-state-card--loading" aria-live="polite">
      <div class="dashboard-state-card__header">
        <span class="dashboard-state-card__icon" aria-hidden="true">${renderDashboardStateIcon("loading")}</span>
        <div>
          <strong>${escapeHtml(status.title || "Carregando dados...")}</strong>
          <p>${escapeHtml(status.description || "Estamos consultando a base do painel. Isso pode levar alguns instantes.")}</p>
        </div>
      </div>
      <div class="dashboard-state-progress" aria-hidden="true"><span></span></div>
      <section class="dashboard-state-skeleton-grid" aria-label="Prévia do carregamento">
        ${Array.from({ length: 4 }).map((_, index) => renderDashboardSkeletonCard(index)).join("")}
      </section>
      ${renderDashboardSkeletonChart("Carregando área de gráfico")}
      ${renderDashboardSkeletonTable(5, 5)}
    </article>
  `;
}

function renderDashboardImportingState(status) {
  const progress = Math.max(4, Math.min(100, Number(dashboardImportState.progress || 12)));
  const moduleLabel = DASHBOARD_MODULE_LABELS[dashboardImportState.moduleKey] || DASHBOARD_MODULE_LABELS[getDashboardModuleKeyForSheet()] || "Painel";
  const ignoredCount = Array.isArray(dashboardImportState.ignoredSheets) ? dashboardImportState.ignoredSheets.length : 0;
  const importedCount = Array.isArray(dashboardImportState.importedSheets) ? dashboardImportState.importedSheets.length : 0;
  return `
    <article class="dashboard-state-card dashboard-state-card--importing" aria-live="polite">
      <div class="dashboard-state-card__header">
        <span class="dashboard-state-card__icon" aria-hidden="true">${renderDashboardStateIcon("import")}</span>
        <div>
          <strong>${escapeHtml(status.title || "Importando arquivo...")}</strong>
          <p>${escapeHtml(dashboardImportState.stage || status.description || "Preparando arquivo...")}</p>
        </div>
      </div>
      <div class="dashboard-state-progress" aria-hidden="true"><span style="width:${progress}%"></span></div>
      <div class="dashboard-import-details">
        <span><strong>Arquivo</strong>${escapeHtml(dashboardImportState.fileName || "Arquivo selecionado")}</span>
        <span><strong>Módulo</strong>${escapeHtml(moduleLabel)}</span>
        <span><strong>Formato</strong>${escapeHtml((dashboardImportState.fileType || "").toUpperCase() || "XLSX/CSV")}</span>
        <span><strong>Abas</strong>${integer.format(Number(dashboardImportState.sheetCount || 0))}${dashboardImportState.sheetName ? ` · ${escapeHtml(dashboardImportState.sheetName)}` : ""}</span>
        <span><strong>Linhas lidas</strong>${integer.format(Number(dashboardImportState.rowsRead || 0))}</span>
        <span><strong>Importados</strong>${integer.format(Number(dashboardImportState.rowsImported || 0))}</span>
        <span><strong>Duplicados ignorados</strong>${integer.format(Number(dashboardImportState.duplicatesIgnored || 0))}</span>
        <span><strong>Abas importadas</strong>${integer.format(importedCount)}</span>
        <span><strong>Abas ignoradas</strong>${integer.format(ignoredCount)}</span>
      </div>
      <p class="dashboard-state-card__note">Arquivo usado apenas para extração. Dados salvos no banco.</p>
    </article>
  `;
}

function renderDashboardEmptyState(status) {
  return `
    <article class="dashboard-state-card dashboard-state-card--empty">
      <div class="dashboard-state-card__header">
        <span class="dashboard-state-card__icon" aria-hidden="true">${renderDashboardStateIcon("empty")}</span>
        <div>
          <strong>${escapeHtml(status.title)}</strong>
          <p>${escapeHtml(status.description)}</p>
        </div>
      </div>
      ${status.action ? `<button class="secondary-button" type="button" data-empty-action="${escapeAttribute(status.action)}">${escapeHtml(status.actionLabel || "Importar arquivo")}</button>` : ""}
    </article>
  `;
}

function renderDashboardErrorState(status) {
  const details = dashboardLastError ? `${dashboardLastError.message || dashboardLastError}` : "";
  return `
    <article class="dashboard-state-card dashboard-state-card--error">
      <div class="dashboard-state-card__header">
        <span class="dashboard-state-card__icon" aria-hidden="true">${renderDashboardStateIcon("error")}</span>
        <div>
          <strong>${escapeHtml(status.title || "Não foi possível carregar esta seção.")}</strong>
          <p>${escapeHtml(status.description || "As demais áreas do painel continuam disponíveis. Tente novamente ou verifique os dados importados.")}</p>
        </div>
      </div>
      <div class="dashboard-state-card__actions">
        <button class="secondary-button" type="button" data-empty-action="retry">Tentar novamente</button>
        ${details ? `<details class="dashboard-error-details"><summary>Ver detalhes técnicos</summary><pre>${escapeHtml(details)}</pre></details>` : ""}
      </div>
    </article>
  `;
}

function renderDashboardStateIcon(kind) {
  if (kind === "error") {
    return `<svg viewBox="0 0 24 24"><path d="M12 8v5m0 4h.01M10.3 4.6 2.7 18a2 2 0 0 0 1.7 3h15.2a2 2 0 0 0 1.7-3L13.7 4.6a2 2 0 0 0-3.4 0Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"></path></svg>`;
  }
  if (kind === "import") {
    return `<svg viewBox="0 0 24 24"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 19h14" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"></path></svg>`;
  }
  if (kind === "loading") {
    return `<svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-2.64-6.36" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8"></path></svg>`;
  }
  return `<svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h10M4 17h7" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8"></path></svg>`;
}

function getDashboardState(filteredRows = null) {
  const moduleKey = getDashboardModuleKeyForSheet();
  const baseState = getModuleBaseState(moduleKey);
  if (dashboardVisualState) {
    if (dashboardVisualState === "no-active-file" && !moduleIsConfirmedEmpty(moduleKey)) {
      console.warn("[Empty Guard]", moduleKey, "bloqueou empty antes da hidratação Supabase", {
        hasHydratedFromSupabase: baseState.hasHydratedFromSupabase,
        totalPersisted: baseState.totalPersisted,
        status: baseState.status,
      });
      return {
        ...getDashboardStateConfig(baseState.status === MODULE_BASE_STATUS.error ? "supabase-error" : "loading-files"),
        moduleKey,
      };
    }
    const config = { ...getDashboardStateConfig(dashboardVisualState), moduleKey };
    logDashboardState("[Dashboard State]", moduleKey, config.state, { loading: Boolean(config.loading) });
    console.info("[Render Decision]", moduleKey, {
      hasHydratedFromSupabase: baseState.hasHydratedFromSupabase,
      status: baseState.status,
      totalPersisted: baseState.totalPersisted,
      dashboardFiles: dashboardFileRecords.length,
      render: config.state,
      reason: "dashboardVisualState",
    });
    return config;
  }
  if (!currentUser) return getDashboardStateConfig("not-authenticated");
  const hasData = getDashboardHasModuleData(moduleKey);
  if (!hasData) {
    if (baseState.status === MODULE_BASE_STATUS.error) {
      logDashboardState("[Dashboard Error]", moduleKey, "erro ao validar base; não mostrar vazio", { error: baseState.error });
      console.info("[Render Decision]", moduleKey, {
        hasHydratedFromSupabase: baseState.hasHydratedFromSupabase,
        status: baseState.status,
        totalPersisted: baseState.totalPersisted,
        render: "error",
        reason: "base-check-error",
      });
      return { ...getDashboardStateConfig("supabase-error"), moduleKey };
    }
    if (!moduleIsConfirmedEmpty(moduleKey)) {
      logDashboardState("[Dashboard Loading]", moduleKey, "base ainda em validação; não mostrar vazio", { status: baseState.status });
      console.info("[Render Decision]", moduleKey, {
        hasHydratedFromSupabase: baseState.hasHydratedFromSupabase,
        status: baseState.status,
        totalPersisted: baseState.totalPersisted,
        dashboardFiles: dashboardFileRecords.length,
        render: "loading",
        reason: "empty-guard",
      });
      return { ...getDashboardStateConfig("loading-files"), moduleKey };
    }
    const config = getModuleEmptyStateConfig(moduleKey);
    logDashboardState("[Dashboard Empty]", moduleKey, "base vazia confirmada", { totalPersisted: baseState.total });
    console.info("[Render Decision]", moduleKey, {
      hasHydratedFromSupabase: baseState.hasHydratedFromSupabase,
      status: baseState.status,
      totalPersisted: baseState.totalPersisted,
      dashboardFiles: dashboardFileRecords.length,
      render: "empty",
      reason: "totalPersisted=0",
    });
    if (!canEdit()) {
      return {
        ...config,
        description: "Nenhum registro persistido foi encontrado. Solicite a um administrador o envio de um arquivo XLSX ou CSV.",
        action: "",
        actionLabel: "",
      };
    }
    return config;
  }
  if (Array.isArray(filteredRows) && !filteredRows.length) {
    if (moduleHasConfirmedBase(moduleKey) && !moduleHasRenderedRows(moduleKey)) {
      console.info("[Render Decision]", moduleKey, {
        hasHydratedFromSupabase: baseState.hasHydratedFromSupabase,
        status: baseState.status,
        totalPersisted: baseState.totalPersisted,
        filteredTotal: 0,
        render: "loading",
        reason: "persisted-data-confirmed-waiting-render-data",
      });
      return { ...getDashboardStateConfig("loading-files"), moduleKey };
    }
    logDashboardState("[Dashboard Empty]", moduleKey, "sem resultados para filtros atuais");
    console.info("[Render Decision]", moduleKey, {
      hasHydratedFromSupabase: baseState.hasHydratedFromSupabase,
      status: baseState.status,
      totalPersisted: baseState.totalPersisted,
      filteredTotal: 0,
      render: "no_results",
      reason: "filters",
    });
    return getDashboardStateConfig("no-filter-results");
  }
  console.info("[Render Decision]", moduleKey, {
    hasHydratedFromSupabase: baseState.hasHydratedFromSupabase,
    status: baseState.status,
    totalPersisted: baseState.totalPersisted,
    filteredTotal: Array.isArray(filteredRows) ? filteredRows.length : null,
    render: "loaded",
  });
  return null;
}

function getDashboardStateConfig(type) {
  return DASHBOARD_STATE_CONFIG[type] || DASHBOARD_STATE_CONFIG["no-active-file"];
}

function setDashboardVisualState(type, options = {}) {
  dashboardVisualState = type || "";
  if (options.error) dashboardLastError = options.error;
  if (!type && options.clearError !== false) dashboardLastError = null;
  logDashboardState(
    type && DASHBOARD_STATE_CONFIG[type]?.error ? "[Dashboard Error]" : type ? "[Dashboard Loading]" : "[Dashboard State]",
    getDashboardModuleKeyForSheet(),
    type || "dados disponíveis",
    { render: options.render !== false },
  );
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
    const html = emptyStatus.importing
      ? renderDashboardImportingState(emptyStatus)
      : emptyStatus.loading
        ? renderDashboardLoadingState(emptyStatus)
        : emptyStatus.error
          ? renderDashboardErrorState(emptyStatus)
          : renderDashboardEmptyState(emptyStatus);
    el.kpiGrid.innerHTML = html;
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
    preFaturaView: PREFATURA_VIEW_OVERVIEW,
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
    setDashboardVisualState("supabase-error", { error });
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
    ${renderDashboardUpdatingBadge(DASHBOARD_MODULE_KEYS.preFatura)}
    <section class="kpi-grid__group kpi-grid__group--main" aria-label="Cards principais da Pré-Fatura">
      ${mainCards.map((card, index) => renderCard(card, index)).join("")}
    </section>
  `;
  void hydrateTotalDiscountComparison(summary);
}

function renderKpiCard(card, index) {
  const details = Array.isArray(card.details) && card.details.length
    ? `<div class="kpi-card__details">${card.details.map((item) => `
        <span><small>${escapeHtml(item.label)}</small><strong>${escapeHtml(item.value)}</strong></span>
      `).join("")}</div>`
    : "";
  return `
    <article class="kpi-card ${card.tone}"${card.key ? ` data-kpi="${escapeAttribute(card.key)}"` : ""} style="--reveal-index:${index}">
      <div class="kpi-card__label">
        <span>${card.label}</span>
        <span class="kpi-card__icon">i</span>
      </div>
      <div class="kpi-card__value metric-card-value">${card.value}</div>
      <div class="kpi-card__delta"${card.key === "total-discounts" ? " data-total-discounts-delta" : ""}>${card.delta}</div>
      ${details}
      ${card.description ? `<div class="kpi-card__description">${escapeHtml(card.description)}</div>` : ""}
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
    ${renderDashboardUpdatingBadge(DASHBOARD_MODULE_KEYS.pacotes)}
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
    ${renderDashboardUpdatingBadge(DASHBOARD_MODULE_KEYS.evolucao)}
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
  if (state.sheet === DEVIATION_MANAGEMENT_VIEW && state.activeDesvioCategory === DEVIATION_CATEGORY_PNRS) {
    await downloadPnrReport();
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

async function downloadPnrReport() {
  if (!ensureReportPermission()) return;
  const button = el.reportButton;
  const previousText = button?.textContent || "Relatório";
  if (button) {
    button.disabled = true;
    button.textContent = "Gerando relatório...";
    button.setAttribute("aria-busy", "true");
  }
  try {
    showToast("Gerando relatório de PNRs...", "info", 3200);
    const rows = await fetchPnrExportRowsFromSupabase();
    if (!rows.length) {
      showToast("Não há dados disponíveis para gerar o relatório deste recorte.", "warn", 5200);
      return;
    }
    await ensurePdfLogoImage();
    const analysis = buildPnrReportAnalysis(rows);
    const pdf = buildPnrReportPdfBlob(analysis);
    downloadBlob(pdf, analysis.fileName);
    await logAudit("generate_report", "report", null, {
      report_tab: DEVIATION_MANAGEMENT_VIEW,
      report_category: DEVIATION_CATEGORY_PNRS,
      records_count: rows.length,
      filters: getPnrExportFilterLabelList(),
    });
    showToast("Relatório de Gestão de Desvios / PNRs baixado.", "good", 4200);
  } catch (error) {
    console.error("[PNR Report] Falha ao gerar relatório:", error);
    showToast("Não foi possível gerar o relatório agora. Tente novamente.", "error", 6200);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = previousText;
      button.setAttribute("aria-busy", "false");
    }
  }
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

function getPnrReportDriverLabel(row) {
  const id = formatPnrId(row?.idMotorista || "");
  const candidateName = getPnrDriverNameFromSourceRow({ motorista: row?.nomeMotorista || row?.motoristaDisplay || "" });
  const name = candidateName && normalizePnrLookupId(candidateName) !== normalizePnrLookupId(id) ? candidateName : "";
  return name || (id ? `Motorista ${id}` : "Não identificado");
}

function buildPnrReportAnalysis(rows) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const filters = getPnrExportFilterLabelList();
  const filterState = getPnrExportFilterState();
  const statusMap = new Map();
  const originMap = new Map();
  const stationMap = new Map();
  const driverMap = new Map();
  const evolutionMap = new Map();
  const summary = createPnrSummary(safeRows.length);
  const firstMeaningfulLabel = (...values) => values.find((value) => hasReportLabel(value)) || "";

  safeRows.forEach((row) => {
    const value = Number(row.valorCompraNumerico || 0);
    const status = row.statusNormalizado || "Indefinido";
    const statusType = getPnrStatusMetricType(status);
    const origin = firstMeaningfulLabel(row.tipoBase, row.tipoOperacional, row.baseIdentificada) || "Não identificada";
    const station = firstMeaningfulLabel(row.estacaoOrigem, row.nomeBaseOperacao) || "Não identificada";
    const driver = getPnrReportDriverLabel(row);
    const period = getPnrPeriodFromBillingPeriod(row.sourcePeriodo || row.periodoFaturamentoOriginal || row.periodoFaturamento) || getPnrPeriodFromDate(row.dataCaso || row.periodoFaturamento);
    const monthKey = row.monthKey || period.monthKey || "sem-periodo";
    const monthLabel = row.competencia || getPnrMonthFullLabel(period) || "Sem período";

    summary.totalValue += value;
    addPnrSummaryStatus(summary, status, value, 1);

    const statusEntry = statusMap.get(status) || { label: status, count: 0, totalValue: 0 };
    statusEntry.count += 1;
    statusEntry.totalValue += value;
    statusMap.set(status, statusEntry);

    const originEntry = originMap.get(origin) || { label: origin, count: 0, totalValue: 0 };
    originEntry.count += 1;
    originEntry.totalValue += value;
    originMap.set(origin, originEntry);

    const stationKey = `${station}|${origin}`;
    const stationEntry = stationMap.get(stationKey) || { label: station, origin, count: 0, totalValue: 0 };
    stationEntry.count += 1;
    stationEntry.totalValue += value;
    stationMap.set(stationKey, stationEntry);

    const driverEntry = driverMap.get(driver) || { label: driver, statuses: new Map(), count: 0, totalValue: 0 };
    driverEntry.count += 1;
    driverEntry.totalValue += value;
    driverEntry.statuses.set(status, (driverEntry.statuses.get(status) || 0) + 1);
    driverMap.set(driver, driverEntry);

    const evolutionEntry = evolutionMap.get(monthKey) || {
      key: monthKey,
      label: monthLabel,
      year: Number(row.ano || period.ano || String(monthKey).slice(0, 4) || 0),
      month: Number(row.mesNumero || period.mes || String(monthKey).slice(5, 7) || 0),
      count: 0,
      totalValue: 0,
      valorAnulado: 0,
      valorFaturado: 0,
    };
    evolutionEntry.count += 1;
    evolutionEntry.totalValue += value;
    if (statusType === "anulado") evolutionEntry.valorAnulado += value;
    if (statusType === "faturado") evolutionEntry.valorFaturado += value;
    evolutionMap.set(monthKey, evolutionEntry);
  });

  completePnrSummary(summary);
  const total = Math.max(summary.count, 1);
  const statusRows = Array.from(statusMap.values())
    .map((item) => ({ ...item, share: (item.count / total) * 100 }))
    .sort((a, b) => b.count - a.count || b.totalValue - a.totalValue);
  const originRows = Array.from(originMap.values())
    .map((item) => ({ ...item, share: (item.count / total) * 100 }))
    .sort((a, b) => b.count - a.count || b.totalValue - a.totalValue);
  const stationRows = Array.from(stationMap.values())
    .map((item) => ({ ...item, share: (item.count / total) * 100 }))
    .sort((a, b) => b.count - a.count || b.totalValue - a.totalValue)
    .slice(0, 10)
    .map((item, index) => ({
      ...item,
      criticality: index < 5 || item.share >= 10 ? "Alto impacto" : item.share >= 4 ? "Médio impacto" : "Baixo impacto",
    }));
  const driverRows = Array.from(driverMap.values())
    .map((item) => {
      const topStatuses = Array.from(item.statuses.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([label]) => label)
        .join(", ");
      return { ...item, topStatuses: topStatuses || "—", share: (item.count / total) * 100 };
    })
    .sort((a, b) => b.count - a.count || b.totalValue - a.totalValue)
    .slice(0, 10)
    .map((item, index) => ({
      ...item,
      criticality: index < 5 || item.share >= 8 ? "Acompanhamento prioritário" : "Monitorar recorrência",
    }));
  const evolutionRows = Array.from(evolutionMap.values())
    .sort((a, b) => (a.year - b.year) || (a.month - b.month) || String(a.key).localeCompare(String(b.key), "pt-BR"));
  const saldo = Number(summary.valorAnulado || 0) - Number(summary.valorFaturado || 0);
  const maxAnulado = evolutionRows.reduce((best, item) => Number(item.valorAnulado || 0) > Number(best.valorAnulado || 0) ? item : best, evolutionRows[0] || { label: "—", valorAnulado: 0 });
  const maxFaturado = evolutionRows.reduce((best, item) => Number(item.valorFaturado || 0) > Number(best.valorFaturado || 0) ? item : best, evolutionRows[0] || { label: "—", valorFaturado: 0 });
  const fileName = getPnrReportFileName(filterState);
  const missingOriginCount = safeRows.filter((row) => !firstMeaningfulLabel(row.tipoBase, row.tipoOperacional, row.baseIdentificada, row.estacaoOrigem)).length;
  const missingStationCount = safeRows.filter((row) => !firstMeaningfulLabel(row.estacaoOrigem, row.nomeBaseOperacao)).length;
  const missingDriverCount = safeRows.filter((row) => !hasReportLabel(row.idMotorista || row.nomeMotorista || row.motoristaDisplay)).length;
  const missingStatusCount = safeRows.filter((row) => !hasReportLabel(row.statusNormalizado || row.statusOriginal)).length;
  const missingDateCount = safeRows.filter((row) => ![row.dataEntrega, row.dataEncerramentoCaso, row.dataCaso].some((value) => hasReportLabel(value) && parseDateValue(value).ts !== null)).length;
  const qualityRows = [
    { label: "Sem origem/base identificada", count: missingOriginCount, risk: missingOriginCount ? "Reduz rastreabilidade operacional" : "Sem ocorrência relevante" },
    { label: "Sem estação de origem", count: missingStationCount, risk: missingStationCount ? "Dificulta priorização por base" : "Sem ocorrência relevante" },
    { label: "Sem motorista", count: missingDriverCount, risk: missingDriverCount ? "Dificulta ação individual" : "Sem ocorrência relevante" },
    { label: "Sem data operacional", count: missingDateCount, risk: missingDateCount ? "Limita leitura temporal" : "Sem ocorrência relevante" },
    { label: "Sem status", count: missingStatusCount, risk: missingStatusCount ? "Impede tratativa por etapa" : "Sem ocorrência relevante" },
  ].map((item) => ({ ...item, share: (item.count / total) * 100 }));

  const analysis = {
    rows: safeRows,
    summary,
    filters,
    filterState,
    statusRows,
    originRows,
    stationRows,
    driverRows,
    evolutionRows,
    saldo,
    maxAnulado,
    maxFaturado,
    generatedAt: `Gerado em: ${formatCurrentDateTime()}`,
    scopeLabel: filterState.hasFilters ? "Recorte filtrado" : "Base completa",
    periodLabel: filterState.selectedMonths.length ? filterState.selectedMonths.join(", ") : "Base completa",
    fileName,
    executiveSummary: "",
    financialDiagnosis: "",
    operationalDiagnosis: "",
    temporalAnalysis: "",
    originAnalysis: "",
    stationAnalysis: "",
    driverAnalysis: "",
    qualityAnalysis: "",
    conclusion: "",
    attentionPoints: [],
    recommendations: [],
    qualityRows,
  };
  analysis.executiveSummary = buildPnrExecutiveSummaryText(analysis);
  analysis.financialDiagnosis = buildPnrFinancialDiagnosisText(analysis);
  analysis.operationalDiagnosis = buildPnrOperationalDiagnosisText(analysis);
  analysis.temporalAnalysis = buildPnrTemporalAnalysisText(analysis);
  analysis.originAnalysis = buildPnrOriginAnalysisText(analysis);
  analysis.stationAnalysis = buildPnrStationAnalysisText(analysis);
  analysis.driverAnalysis = buildPnrDriverAnalysisText(analysis);
  analysis.qualityAnalysis = buildPnrQualityAnalysisText(analysis);
  analysis.attentionPoints = buildPnrAttentionPoints(analysis);
  analysis.recommendations = buildPnrRecommendations(analysis);
  analysis.conclusion = buildPnrConclusionText(analysis);
  return analysis;
}

function getPnrReportFileName(filterState = getPnrExportFilterState()) {
  const dateLabel = formatPnrExportDateForFile();
  if (filterState.selectedMonths?.length === 1) {
    return `Relatorio_Executivo_Gestao_Desvios_PNRs_${normalizePnrExportFilePart(filterState.selectedMonths[0])}_${dateLabel}.pdf`;
  }
  return `Relatorio_Executivo_Gestao_Desvios_PNRs_${dateLabel}.pdf`;
}

function buildPnrExecutiveSummaryText(analysis) {
  const summary = analysis.summary;
  const saldoTone = analysis.saldo >= 0 ? "positivo" : "negativo";
  const topStation = analysis.stationRows[0]?.label || "sem concentração relevante";
  const topDriver = analysis.driverRows[0]?.label || "sem motorista identificado";
  return [
    `No ${analysis.scopeLabel.toLowerCase()}, a base PNR reúne ${integer.format(summary.count)} casos e ${currency.format(summary.totalValue)} em valor bruto analisado. A leitura financeira considera anulado como efeito positivo e faturado como efeito negativo, com saldo líquido ${saldoTone} de ${currency.format(analysis.saldo)}.`,
    `O valor anulado soma ${currency.format(summary.valorAnulado)}, enquanto o valor faturado representa -${currency.format(summary.valorFaturado)}. Essa diferença indica ${analysis.saldo >= 0 ? "predominância de reversão positiva sobre o impacto faturado" : "predominância de impacto faturado sobre a reversão positiva"}, exigindo acompanhamento das origens e períodos que concentram maior risco.`,
    `A concentração operacional aparece principalmente em ${topStation}, e o maior volume por motorista está em ${topDriver}. Permanecem ${integer.format(summary.aberto)} casos em aberto/análise, que ainda podem alterar o saldo final do recorte.`,
  ].join("\n\n");
}

function buildPnrFinancialDiagnosisText(analysis) {
  const summary = analysis.summary;
  const valueTotal = Math.max(Number(summary.totalValue || 0), 1);
  const faturadoShare = (Number(summary.valorFaturado || 0) / valueTotal) * 100;
  const anuladoShare = (Number(summary.valorAnulado || 0) / valueTotal) * 100;
  const saldoTone = analysis.saldo >= 0 ? "favorável" : "desfavorável";
  return `O diagnóstico financeiro aponta ${currency.format(summary.totalValue)} em valor total envolvido nos PNRs. Desse montante, ${currency.format(summary.valorAnulado)} (${formatNumberPt(anuladoShare, 1)}%) foi anulado e tratado como impacto positivo, enquanto -${currency.format(summary.valorFaturado)} (${formatNumberPt(faturadoShare, 1)}%) foi faturado ou direcionado para faturamento como impacto negativo. O saldo líquido do recorte é ${currency.format(analysis.saldo)}, com leitura ${saldoTone}. O ticket médio geral é ${currency.format(summary.ticketMedioGeral)}, com ticket médio faturado de ${currency.format(summary.ticketMedioFaturado)} e ticket médio anulado de ${currency.format(summary.ticketMedioAnulado)}. A proporção entre faturado e anulado deve ser monitorada porque valores faturados representam desembolso ou cobrança efetiva, mesmo quando o saldo consolidado permanece positivo.`;
}

function buildPnrOperationalDiagnosisText(analysis) {
  const summary = analysis.summary;
  const total = Math.max(summary.count, 1);
  const openShare = (Number(summary.aberto || 0) / total) * 100;
  const statusLeader = analysis.statusRows[0] || { label: "sem status dominante", count: 0, share: 0 };
  return `Operacionalmente, o recorte contém ${integer.format(summary.count)} casos PNR consolidados. O status com maior concentração é ${statusLeader.label}, com ${integer.format(statusLeader.count)} ocorrências (${formatNumberPt(statusLeader.share, 1)}%). Os casos em aberto/análise somam ${integer.format(summary.aberto)} registros (${formatNumberPt(openShare, 1)}%), indicando pendências que ainda podem migrar para anulado, faturado ou outro desfecho. Essa composição reforça a necessidade de rotina de acompanhamento dos status residuais e de priorização dos registros que ainda não têm decisão final.`;
}

function buildPnrTemporalAnalysisText(analysis) {
  const saldoTone = analysis.saldo >= 0 ? "positivo" : "negativo";
  const trend = analysis.evolutionRows.length > 1
    ? Number(analysis.evolutionRows[analysis.evolutionRows.length - 1].totalValue || 0) >= Number(analysis.evolutionRows[0].totalValue || 0)
      ? "tendência de aumento no volume financeiro ao longo do recorte"
      : "tendência de redução no volume financeiro ao longo do recorte"
    : "histórico curto para leitura de tendência";
  const last = analysis.evolutionRows[analysis.evolutionRows.length - 1] || null;
  const previous = analysis.evolutionRows[analysis.evolutionRows.length - 2] || null;
  const variation = last && previous ? Number(last.totalValue || 0) - Number(previous.totalValue || 0) : 0;
  const variationText = last && previous ? ` A variação do último período contra o anterior foi de ${currency.format(Math.abs(variation))} ${variation >= 0 ? "para cima" : "para baixo"} no valor bruto.` : "";
  return `A evolução temporal mostra ${trend}. O maior valor anulado ocorreu em ${analysis.maxAnulado?.label || "—"}, com ${currency.format(analysis.maxAnulado?.valorAnulado || 0)}, enquanto o maior impacto faturado ocorreu em ${analysis.maxFaturado?.label || "—"}, com -${currency.format(analysis.maxFaturado?.valorFaturado || 0)}. O saldo líquido geral permanece ${saldoTone}, em ${currency.format(analysis.saldo)}, considerando anulado como positivo e faturado como negativo.${variationText} A leitura temporal deve ser usada para identificar meses de pico, sazonalidade e períodos que exigem reforço de auditoria antes do fechamento.`;
}

function buildPnrOriginAnalysisText(analysis) {
  const originLeader = analysis.originRows[0] || { label: "sem origem dominante", count: 0, share: 0, totalValue: 0 };
  const unidentified = analysis.originRows.find((item) => !hasReportLabel(item.label));
  const qualityNote = unidentified && unidentified.count
    ? ` Há ${integer.format(unidentified.count)} registros com origem não identificada, o que reduz a rastreabilidade operacional e deve ser tratado como ponto de qualidade da base.`
    : " A rastreabilidade por origem não apresenta concentração relevante de registros sem identificação.";
  return `A análise por origem/base mostra maior participação de ${originLeader.label}, com ${integer.format(originLeader.count)} PNRs (${formatNumberPt(originLeader.share, 1)}%) e ${currency.format(originLeader.totalValue)} em valor associado. Bases com volume alto e valor alto devem ser priorizadas porque combinam recorrência operacional e impacto financeiro.${qualityNote}`;
}

function buildPnrStationAnalysisText(analysis) {
  const top = analysis.stationRows[0] || { label: "sem estação dominante", count: 0, totalValue: 0, share: 0 };
  return `As estações listadas concentram os maiores volumes do recorte. A principal concentração está em ${top.label}, com ${integer.format(top.count)} PNRs, ${currency.format(top.totalValue)} em valor e ${formatNumberPt(top.share, 1)}% de participação. A coluna de criticidade combina posição no ranking, quantidade e participação para indicar onde a gestão deve iniciar a tratativa operacional.`;
}

function buildPnrDriverAnalysisText(analysis) {
  const top = analysis.driverRows[0] || { label: "sem motorista dominante", count: 0, totalValue: 0, topStatuses: "—" };
  return `Os motoristas listados concentram maior recorrência de casos PNR e devem ser priorizados em ações de acompanhamento, orientação ou auditoria operacional. O maior volume está em ${top.label}, com ${integer.format(top.count)} PNRs e ${currency.format(top.totalValue)} em valor associado. O status predominante nesse grupo é ${top.topStatuses}, informação útil para separar reincidência operacional de pendências ainda em análise.`;
}

function buildPnrQualityAnalysisText(analysis) {
  const totalIssues = analysis.qualityRows.reduce((acc, item) => acc + Number(item.count || 0), 0);
  const worst = analysis.qualityRows.reduce((best, item) => Number(item.count || 0) > Number(best.count || 0) ? item : best, analysis.qualityRows[0] || { label: "Sem inconsistências", count: 0 });
  if (!totalIssues) {
    return "A base do recorte não apresenta ausência relevante nos campos críticos avaliados para origem, estação, motorista, datas e status. A rastreabilidade é suficiente para leitura executiva e acompanhamento operacional.";
  }
  return `A qualidade dos dados exige atenção em ${integer.format(totalIssues)} ocorrências de campos críticos ausentes ou não identificados. O principal ponto é ${worst.label}, com ${integer.format(worst.count)} registros. Essas lacunas afetam rastreabilidade, priorização por base e leitura temporal, principalmente quando a base PNR depende de cruzamento com Pré-Fatura e Gestão de Pacotes.`;
}

function buildPnrAttentionPoints(analysis) {
  const summary = analysis.summary;
  const points = [];
  const topStation = analysis.stationRows[0];
  const topDriver = analysis.driverRows[0];
  const missingOrigin = analysis.qualityRows.find((item) => item.label === "Sem origem/base identificada");
  const missingDriver = analysis.qualityRows.find((item) => item.label === "Sem motorista");
  if (topStation) points.push(`${topStation.label} concentra ${integer.format(topStation.count)} PNRs e ${currency.format(topStation.totalValue)}, classificada como ${topStation.criticality.toLowerCase()}.`);
  if (topDriver) points.push(`${topDriver.label} aparece como maior recorrência por motorista, com ${integer.format(topDriver.count)} casos e status predominante: ${topDriver.topStatuses}.`);
  if (Number(summary.valorFaturado || 0) > 0) points.push(`O valor faturado soma -${currency.format(summary.valorFaturado)} e representa impacto financeiro negativo a acompanhar antes do fechamento.`);
  if (Number(summary.aberto || 0) > 0) points.push(`${integer.format(summary.aberto)} casos ainda estão em aberto/análise e podem alterar o saldo final do recorte.`);
  if (missingOrigin?.count) points.push(`${integer.format(missingOrigin.count)} registros sem origem/base reduzem rastreabilidade e dificultam priorização operacional.`);
  if (missingDriver?.count) points.push(`${integer.format(missingDriver.count)} registros sem motorista limitam ações individuais de orientação ou auditoria.`);
  points.push(`A diferença entre anulado e faturado gera saldo líquido de ${currency.format(analysis.saldo)}, que deve ser acompanhado junto da evolução temporal.`);
  return points.slice(0, 7);
}

function buildPnrRecommendations(analysis) {
  const topStation = analysis.stationRows[0]?.label || "as bases com maior volume";
  const topDriver = analysis.driverRows[0]?.label || "os motoristas recorrentes";
  const hasOpen = Number(analysis.summary.aberto || 0) > 0;
  const hasQualityIssue = analysis.qualityRows.some((item) => Number(item.count || 0) > 0);
  return [
    `Priorizar a análise operacional de ${topStation} e das demais estações classificadas como alto impacto.`,
    `Acompanhar ${topDriver} e os demais motoristas com maior recorrência para orientação, auditoria ou validação de processo.`,
    hasOpen ? "Monitorar diariamente os casos em aberto/análise até a definição final, evitando alteração tardia do saldo financeiro." : "Manter rotina de monitoramento dos status para detectar novas pendências assim que surgirem.",
    "Comparar mensalmente valores faturados e anulados para identificar picos, sazonalidade e mudança de tendência.",
    hasQualityIssue ? "Corrigir registros sem origem, motorista ou data antes do fechamento para aumentar rastreabilidade e confiabilidade do relatório." : "Manter a validação de campos críticos antes do fechamento para preservar a qualidade atual da base.",
    "Usar a base mestre como referência histórica e os arquivos quinzenais/mensais como atualização incremental consolidada.",
  ];
}

function buildPnrConclusionText(analysis) {
  const summary = analysis.summary;
  const saldoTone = analysis.saldo >= 0 ? "positivo" : "negativo";
  const topStation = analysis.stationRows[0]?.label || "sem base dominante";
  return `O recorte analisado apresenta ${integer.format(summary.count)} PNRs e saldo líquido ${saldoTone} de ${currency.format(analysis.saldo)}, resultado da diferença entre ${currency.format(summary.valorAnulado)} anulados e -${currency.format(summary.valorFaturado)} faturados. A situação operacional exige foco nas concentrações por base, especialmente ${topStation}, e nos motoristas com maior recorrência. Os principais riscos estão nos valores faturados, nos casos ainda em aberto/análise e nas lacunas de rastreabilidade. O próximo passo recomendado é manter acompanhamento periódico de faturados x anulados, corrigir dados incompletos e priorizar as bases de alto impacto antes do fechamento operacional.`;
}

function buildPnrReportPdfBlob(analysis) {
  const pages = [];
  let commands = [];
  let y = 736;
  const page = { width: 595, height: 842, margin: 34, bottom: 42 };
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
  const addText = (text, x, yy, size = 10, color = colors.ink, align = "left", font = "F1") => {
    const value = String(text ?? "");
    const offset = align === "right" ? estimatePdfTextWidth(value, size) : align === "center" ? estimatePdfTextWidth(value, size) / 2 : 0;
    commands.push(`${color} rg BT /${font} ${size} Tf ${Math.max(0, x - offset).toFixed(1)} ${yy.toFixed(1)} Td <${pdfTextHex(value)}> Tj ET`);
  };
  const addRect = (x, yy, w, h, color) => commands.push(`${color} rg ${x.toFixed(1)} ${yy.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)} re f`);
  const addStrokeRect = (x, yy, w, h, color = colors.line) => commands.push(`${color} RG ${x.toFixed(1)} ${yy.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)} re S`);
  const addLine = (x1, y1, x2, y2, color = colors.line, width = 0.7) => commands.push(`${color} RG ${width} w ${x1.toFixed(1)} ${y1.toFixed(1)} m ${x2.toFixed(1)} ${y2.toFixed(1)} l S`);
  const addPdfImage = (name, x, yy, w, h) => commands.push(`q ${w.toFixed(1)} 0 0 ${h.toFixed(1)} ${x.toFixed(1)} ${yy.toFixed(1)} cm /${name} Do Q`);
  const addWrappedText = (text, x, top, width, size = 9, color = colors.ink, lineHeight = 11.5, maxLines = 5) => {
    const lines = wrapPdfText(text, width, size, maxLines);
    lines.forEach((line, index) => addText(line, x, top - index * lineHeight, size, color));
    return lines.length * lineHeight;
  };
  const addPage = () => {
    if (commands.length) pages.push(commands.join("\n"));
    commands = [];
    const infoW = 174;
    const infoX = page.width - page.margin - infoW;
    commands.push(`${colors.soft} rg 0 0 ${page.width} ${page.height} re f`);
    addRect(0, 754, page.width, 88, colors.navy);
    addRect(0, 754, page.width, 5, colors.teal);
    addRect(infoX, 773, infoW, 52, "0.06 0.24 0.36");
    addStrokeRect(infoX, 773, infoW, 52, "0.16 0.42 0.55");
    if (PDF_LOGO_IMAGE.base64) addPdfImage(PDF_LOGO_IMAGE.name, page.margin, 768, 60, 60);
    addText("Painel de Inteligência", page.margin + 74, 815, 8.2, "0.77 0.88 0.96", "left", "F2");
    addText("Relatório Executivo", page.margin + 74, 798, 14.1, colors.white, "left", "F2");
    addText("Gestão de Desvios / PNRs", page.margin + 74, 784, 10.5, "0.86 0.95 1", "left");
    addText("Setor: Loss", infoX + 14, 810, 8.4, colors.white, "left", "F2");
    addText(`Período: ${analysis.periodLabel}`, infoX + 14, 796, 7.8, "0.82 0.92 0.98", "left");
    addText(analysis.generatedAt, infoX + 14, 783, 7.8, "0.82 0.92 0.98", "left");
    y = 734;
  };
  const ensure = (height) => {
    if (y - height < page.bottom) addPage();
  };
  const card = (x, top, w, h, fill = colors.white, accent = "") => {
    addRect(x, top - h, w, h, fill);
    addStrokeRect(x, top - h, w, h);
    if (accent) addRect(x, top - h, 4, h, accent);
  };
  const sectionTitle = (title, meta = "") => {
    ensure(36);
    addText(meta ? `${title} — ${meta}` : title, page.margin, y, 12.5, colors.ink, "left", "F2");
    y -= 10;
    addLine(page.margin, y, page.width - page.margin, y, colors.line, 0.6);
    y -= 16;
  };
  const metricCard = (x, top, w, h, label, value, note, accent, fill = colors.white) => {
    card(x, top, w, h, fill, accent);
    addText(label, x + 12, top - 17, 7.5, colors.muted);
    addWrappedText(value, x + 12, top - 36, w - 24, value.length > 18 ? 11 : 14, accent, 12, 2);
    if (note) addWrappedText(note, x + 12, top - 55, w - 24, 7.1, colors.muted, 8.5, 2);
  };
  const drawKpis = () => {
    const gap = 10;
    const cols = 3;
    const w = (contentW - gap * (cols - 1)) / cols;
    const h = 64;
    const total = Math.max(analysis.summary.count, 1);
    const valueTotal = Math.max(Number(analysis.summary.totalValue || 0), 1);
    const metrics = [
      ["Total de PNRs", integer.format(analysis.summary.count), "100% do recorte", colors.blue, colors.blueSoft],
      ["Valor total", currency.format(analysis.summary.totalValue), "Soma geral dos valores PNR", colors.orange, colors.warm],
      ["Valor faturado", `-${currency.format(analysis.summary.valorFaturado)}`, `${formatNumberPt((analysis.summary.valorFaturado / valueTotal) * 100, 1)}% do valor`, colors.red, colors.dangerSoft],
      ["Ticket médio", currency.format(analysis.summary.ticketMedioGeral), `Fat.: ${currency.format(analysis.summary.ticketMedioFaturado)} · Anul.: ${currency.format(analysis.summary.ticketMedioAnulado)}`, colors.green, colors.greenSoft],
      ["Valor anulado", currency.format(analysis.summary.valorAnulado), `${formatNumberPt((analysis.summary.valorAnulado / valueTotal) * 100, 1)}% do valor`, colors.green, colors.greenSoft],
      ["Em aberto/análise", integer.format(analysis.summary.aberto), `${formatNumberPt((analysis.summary.aberto / total) * 100, 1)}% dos PNRs`, colors.teal, colors.white],
    ];
    ensure(154);
    metrics.forEach((metric, index) => {
      const row = Math.floor(index / cols);
      const col = index % cols;
      metricCard(page.margin + col * (w + gap), y - row * (h + 10), w, h, ...metric);
    });
    y -= h * 2 + 32;
  };
  const drawTable = (title, headers, rows, widths, accent = colors.blue, aligns = []) => {
    const rowHeight = 18;
    const height = 48 + rows.length * rowHeight;
    ensure(height + 18);
    card(page.margin, y, contentW, height, colors.white, accent);
    addText(title, page.margin + 12, y - 18, 10.3, colors.ink, "left", "F2");
    const tableTop = y - 32;
    addRect(page.margin + 10, tableTop - 14, contentW - 20, 18, colors.tableHead);
    let cursor = page.margin + 14;
    headers.forEach((header, index) => {
      const align = aligns[index] || (index >= 2 ? "right" : "left");
      addText(clipPdfText(header, widths[index] - 8, 7.2), align === "right" ? cursor + widths[index] - 4 : cursor, tableTop - 8, 7.2, colors.muted, align);
      cursor += widths[index];
    });
    rows.forEach((row, rowIndex) => {
      const rowY = tableTop - 29 - rowIndex * rowHeight;
      if (rowIndex % 2 === 1) addRect(page.margin + 10, rowY - 7, contentW - 20, 16, "0.97 0.985 1");
      cursor = page.margin + 14;
      row.forEach((cell, index) => {
        const align = aligns[index] || (index >= 2 ? "right" : "left");
        const text = clipPdfText(cell, widths[index] - 8, 7.5);
        addText(text, align === "right" ? cursor + widths[index] - 4 : cursor, rowY, 7.5, colors.ink, align);
        cursor += widths[index];
      });
    });
    y -= height + 18;
  };
  const drawParagraph = (title, text, accent = colors.teal, fill = colors.white) => {
    const paragraphs = String(text || "").split(/\n+/).filter(Boolean);
    const lineCount = paragraphs.reduce((acc, paragraph) => acc + wrapPdfText(paragraph, contentW - 32, 9, 7).length + 1, 0);
    const h = Math.max(72, Math.min(172, 32 + lineCount * 11));
    ensure(h + 46);
    sectionTitle(title, analysis.scopeLabel);
    card(page.margin, y, contentW, h, fill, accent);
    let textY = y - 18;
    paragraphs.forEach((paragraph) => {
      const used = addWrappedText(paragraph, page.margin + 16, textY, contentW - 32, 9, colors.ink, 12, 7);
      textY -= used + 5;
    });
    y -= h + 24;
  };
  const drawBulletList = (title, items, accent = colors.orange, fill = colors.white) => {
    const safeItems = Array.isArray(items) ? items.filter(Boolean) : [];
    const h = Math.max(86, 30 + safeItems.length * 26);
    ensure(h + 42);
    sectionTitle(title, analysis.scopeLabel);
    card(page.margin, y, contentW, h, fill, accent);
    safeItems.forEach((item, index) => {
      const rowY = y - 22 - index * 26;
      addText(`${index + 1}.`, page.margin + 18, rowY, 8.6, accent, "left", "F2");
      addWrappedText(item, page.margin + 46, rowY, contentW - 64, 8.4, colors.ink, 10.6, 2);
    });
    y -= h + 24;
  };
  const drawFilters = () => {
    ensure(82);
    const h = 58;
    card(page.margin, y, contentW, h, colors.white, colors.blue);
    addText("Filtros aplicados", page.margin + 14, y - 18, 9.6, colors.ink, "left", "F2");
    const filterText = [
      `Mês: ${analysis.filters.month}`,
      `Quinzena: ${analysis.filters.quinzena}`,
      `Status: ${analysis.filters.status}`,
      `Origem: ${analysis.filters.origem}`,
      `Busca: ${analysis.filters.busca}`,
    ].join(" · ");
    addWrappedText(filterText, page.margin + 14, y - 36, contentW - 28, 8, colors.muted, 10, 2);
    y -= h + 20;
  };
  const drawTimelineChart = () => {
    ensure(218);
    sectionTitle("Evolução temporal de valores PNR", "anulado positivo x faturado negativo");
    const h = 184;
    card(page.margin, y, contentW, h, colors.white, colors.teal);
    addText("Anulado", page.margin + 18, y - 18, 8, colors.green, "left", "F2");
    addText("Faturado", page.margin + 80, y - 18, 8, colors.red, "left", "F2");
    const chartX = page.margin + 48;
    const chartY = y - h + 34;
    const chartW = contentW - 78;
    const chartH = h - 66;
    const values = analysis.evolutionRows.length ? analysis.evolutionRows : [{ label: "Sem período", valorAnulado: 0, valorFaturado: 0 }];
    const plotted = values.map((item) => ({ ...item, faturadoPlot: -Number(item.valorFaturado || 0), anuladoPlot: Number(item.valorAnulado || 0) }));
    const maxValue = Math.max(1, ...plotted.map((item) => item.anuladoPlot));
    const minValue = Math.min(-1, ...plotted.map((item) => item.faturadoPlot));
    const range = Math.max(1, maxValue - minValue);
    const pointX = (index) => chartX + (plotted.length <= 1 ? chartW / 2 : (index / (plotted.length - 1)) * chartW);
    const pointY = (value) => chartY + ((value - minValue) / range) * chartH;
    const zeroY = pointY(0);
    addLine(chartX, chartY, chartX + chartW, chartY, colors.line, 0.4);
    addLine(chartX, chartY + chartH, chartX + chartW, chartY + chartH, colors.line, 0.4);
    addLine(chartX, zeroY, chartX + chartW, zeroY, "0.55 0.62 0.70", 0.8);
    addText(currency.format(maxValue), chartX - 8, chartY + chartH - 2, 6.7, colors.muted, "right");
    addText("R$ 0", chartX - 8, zeroY - 2, 6.7, colors.muted, "right");
    addText(`-${currency.format(Math.abs(minValue))}`, chartX - 8, chartY - 2, 6.7, colors.muted, "right");
    const drawSeries = (key, color) => {
      if (plotted.length === 1) {
        const x = pointX(0);
        const py = pointY(plotted[0][key]);
        addRect(x - 2, py - 2, 4, 4, color);
        return;
      }
      for (let index = 0; index < plotted.length - 1; index += 1) {
        addLine(pointX(index), pointY(plotted[index][key]), pointX(index + 1), pointY(plotted[index + 1][key]), color, 1.5);
      }
      plotted.forEach((item, index) => addRect(pointX(index) - 1.8, pointY(item[key]) - 1.8, 3.6, 3.6, color));
    };
    drawSeries("anuladoPlot", colors.green);
    drawSeries("faturadoPlot", colors.red);
    plotted.forEach((item, index) => {
      if (index % Math.max(1, Math.ceil(plotted.length / 6)) === 0 || index === plotted.length - 1) {
        addText(clipPdfText(shortMonthYear(item.label), 54, 6.7), pointX(index), chartY - 14, 6.7, colors.muted, "center");
      }
    });
    y -= h + 22;
  };

  addPage();
  drawFilters();
  drawParagraph("Sumário executivo", analysis.executiveSummary, colors.navy, "0.98 0.995 1");
  drawParagraph("Diagnóstico financeiro", analysis.financialDiagnosis, colors.orange, colors.warm);
  drawKpis();
  drawParagraph("Diagnóstico operacional", analysis.operationalDiagnosis, colors.teal);
  drawTable(
    "Distribuição por status — leitura operacional",
    ["Status", "Qtd.", "%", "Valor"],
    analysis.statusRows.slice(0, 10).map((item) => [item.label, integer.format(item.count), `${formatNumberPt(item.share, 1)}%`, formatCurrencyShort(item.totalValue)]),
    [254, 70, 70, 110],
    colors.blue,
  );
  drawTimelineChart();
  drawParagraph("Análise temporal dos valores", analysis.temporalAnalysis, colors.blue);
  drawParagraph("Análise por origem e base operacional", analysis.originAnalysis, colors.teal);
  drawTable(
    "Participação por origem/base",
    ["Origem", "Qtd.", "%", "Valor"],
    analysis.originRows.slice(0, 8).map((item) => [item.label, integer.format(item.count), `${formatNumberPt(item.share, 1)}%`, formatCurrencyShort(item.totalValue)]),
    [254, 70, 70, 110],
    colors.teal,
  );
  drawParagraph("Ranking analítico de estações", analysis.stationAnalysis, colors.orange);
  drawTable(
    "Estações com maior volume de PNR",
    ["Estação", "Origem", "PNRs", "Valor", "Criticidade"],
    analysis.stationRows.map((item) => [item.label, item.origin, integer.format(item.count), formatCurrencyShort(item.totalValue), item.criticality]),
    [136, 76, 58, 104, 130],
    colors.orange,
    ["left", "left", "right", "right", "left"],
  );
  drawParagraph("Motoristas com maior concentração de PNR", analysis.driverAnalysis, colors.green);
  drawTable(
    "Motoristas com maior volume de PNR",
    ["Motorista", "PNRs", "Valor", "Status frequente", "Ação"],
    analysis.driverRows.map((item) => [item.label, integer.format(item.count), formatCurrencyShort(item.totalValue), item.topStatuses, item.criticality]),
    [136, 48, 90, 132, 98],
    colors.green,
    ["left", "right", "right", "left", "left"],
  );
  drawParagraph("Qualidade e rastreabilidade dos dados", analysis.qualityAnalysis, colors.red, colors.dangerSoft);
  drawTable(
    "Indicadores de qualidade da base",
    ["Critério", "Registros", "%", "Impacto"],
    analysis.qualityRows.map((item) => [item.label, integer.format(item.count), `${formatNumberPt(item.share, 1)}%`, item.risk]),
    [186, 70, 56, 192],
    colors.red,
    ["left", "right", "right", "left"],
  );
  drawBulletList("Pontos de atenção", analysis.attentionPoints, colors.orange, colors.warm);
  drawBulletList("Recomendações", analysis.recommendations, colors.green, colors.greenSoft);
  drawParagraph("Conclusão executiva", analysis.conclusion, colors.navy, "0.98 0.995 1");
  ensure(48);
  card(page.margin, y, contentW, 38, colors.blueSoft, colors.blue);
  addText("Detalhamento completo dos registros", page.margin + 14, y - 17, 9.4, colors.ink, "left", "F2");
  addText("A base completa do recorte permanece disponível no download Excel; este PDF prioriza análise executiva, riscos e recomendações.", page.margin + 14, y - 30, 7.9, colors.muted);
  y -= 54;

  pages.push(commands.join("\n"));
  const totalPages = pages.length;
  const pagesWithFooter = pages.map((content, index) => {
    const pageLabel = `Página ${index + 1} de ${totalPages}`;
    return `${content}\n${colors.line} RG 0.5 w ${page.margin.toFixed(1)} 28.0 m ${(page.width - page.margin).toFixed(1)} 28.0 l S\n${colors.muted} rg BT /F1 7.3 Tf ${page.margin.toFixed(1)} 16.0 Td <${pdfTextHex("ALC Pereira & Filho Transportes · Painel de Inteligência Operacional · Relatório gerado automaticamente")}> Tj ET\n${colors.muted} rg BT /F1 7.3 Tf ${(page.width - page.margin - estimatePdfTextWidth(pageLabel, 7.3)).toFixed(1)} 16.0 Td <${pdfTextHex(pageLabel)}> Tj ET`;
  });
  return createPdfBlob(pagesWithFooter);
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

  const isPreFaturaEvolution = state.sheet === PRE_FATURA_VIEW && state.preFaturaView === PREFATURA_VIEW_EVOLUTION;
  if (state.sheet !== PRE_FATURA_VIEW) push("Aba", getSheetDisplayLabel(state.sheet));
  if (!isPreFaturaEvolution && state.sheet !== MONTHLY_BASE_VIEW) push("Tipo", getActiveTypeFilter());
  const monthOptions = getActiveMonthOptions();
  const monthSelection = getActiveMonthSelectionValues();
  if (monthOptions.length && monthSelection.length !== monthOptions.length) push("Mês", getMonthSelectionLabel(monthSelection, monthOptions));
  const activePeriod = getActivePeriodMode();
  if (activePeriod !== "month") push("Período", getPeriodModeLabel(activePeriod));
  if (state.query && !isPreFaturaEvolution && state.sheet !== MONTHLY_BASE_VIEW) applied.push({ label: "Busca", value: state.query });

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

function normalizePnrIdentifierDedupePart(value) {
  if (value == null || value === "") return "";
  const raw = repairPnrText(value).replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
  if (!raw) return "";
  const withoutDecimal = raw.replace(/\.0+$/, "");
  const digitsOnly = withoutDecimal.replace(/\D+/g, "");
  if (digitsOnly && /^[\d\s.,\-_/]+$/.test(withoutDecimal)) return digitsOnly;
  return withoutDecimal.replace(/\s+/g, "").trim();
}

function normalizePnrProductDedupePart(value) {
  return normalize(repairPnrText(value)).replace(/\s+/g, " ").trim();
}

function getPnrDedupeKey(row) {
  const idEnvio = normalizePnrIdentifierDedupePart(
    row?.idEnvio || row?.id_envio || row?.["ID DE ENVIO"] || row?.["ID ENVIO"] || row?.["ID DO ENVIO"] || row?.ENVIO || row?.Envio || row?.PACOTE || row?.Pacote || row?.["ID DO PACOTE"] || row?.["ID PACOTE"],
  );
  const idRota = normalizePnrIdentifierDedupePart(
    row?.idRota || row?.id_rota || row?.["ID DA ROTA"] || row?.["ID ROTA"] || row?.ROTA || row?.Rota,
  );
  const produtos = normalizePnrProductDedupePart(
    row?.produtos || row?.produto || row?.PRODUTOS || row?.PRODUTO || row?.Products || row?.Product,
  );
  if (!idEnvio || !idRota || !produtos) return "";
  return `${idEnvio}|${idRota}|${produtos}`;
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

function getPnrPeriodSortValue(row = {}) {
  const periodText = row.source_period || row.sourcePeriod || row.source_periodo || row.sourcePeriodo || row.periodo_faturamento || row.periodoFaturamento || row.periodo_faturamento_original || row.periodoFaturamentoOriginal || "";
  const parsedPeriod = getPnrPeriodFromAny(periodText);
  const year = Number(parsedPeriod?.ano || row.ano || 0);
  const month = Number(parsedPeriod?.mes || row.mes_numero || row.mes || 0);
  const quarter = getPeriodModeFromLabel(parsedPeriod?.quinzena || row.quinzena_key || row.quinzena || row.quinzena_ref || row.quinzenaRef) === "q2" ? 2 : 1;
  return year && month ? Number(`${year}${String(month).padStart(2, "0")}${quarter}`) : 0;
}

function getPnrRecordFreshnessTuple(row = {}) {
  return [
    getPnrPeriodSortValue(row),
    parseDateValue(row.data_encerramento_caso || row.dataEncerramentoCaso).ts || 0,
    parseDateValue(row.data_caso || row.dataCaso).ts || 0,
    parseDateValue(row.last_seen_at || row.lastSeenAt || row.updated_at || row.created_at || row.uploaded_at).ts || 0,
  ];
}

function comparePnrRecordFreshness(incoming, existing) {
  const a = getPnrRecordFreshnessTuple(incoming);
  const b = getPnrRecordFreshnessTuple(existing);
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 1;
}

function comparePnrDuplicateQuality(a, b) {
  const freshness = comparePnrRecordFreshness(a, b);
  if (freshness !== 0) return freshness;
  const aScore = getPnrRowCompletenessScore(a);
  const bScore = getPnrRowCompletenessScore(b);
  if (aScore !== bScore) return aScore - bScore;
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
  return identificarTipoBasePnr(estacao);
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

function getPnrPeriodFromQuinzenaReference(value) {
  const text = repairPnrText(value);
  const year = detectYear(text);
  const monthNumberValue = getMonthNumberFromAny(text);
  const quinzena = detectQuinzena(text);
  if (!year || !monthNumberValue || !quinzena) return null;
  const monthIndex = Number(monthNumberValue) - 1;
  return {
    competencia: `${MONTH_ABBR[monthIndex] || "JAN"}/${String(year).slice(2)}`,
    mes: monthNumberValue,
    ano: String(year),
    quinzena,
    monthKey: `${year}-${monthNumberValue}`,
  };
}

function getPnrPeriodFromAny(value) {
  return getPnrPeriodFromBillingPeriod(value) || getPnrPeriodFromQuinzenaReference(value);
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
    row.tipoOcorrencia,
    row.tipoBase,
    row.baseIdentificada,
    row.nomeBaseOperacao,
    row.statusMotorista,
    row.fonteCruzamento,
    row.observacaoCruzamento,
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
    getPnrPeriodFromAny(sourcePeriodo) ||
    getPnrPeriodFromAny(sourceFileName) ||
    getPnrPeriodFromDate(dataCaso || rawPeriodoFaturamento || sourceFileName);
  const periodoOriginal = sourcePeriodo || buildPnrBillingPeriodFromPeriod(period);
  const estacaoOrigem = repairPnrText(row.estacaoOrigem || row.estacao_origem || row["ESTAÇÃO DE ORIGEM"] || row["ESTACAO DE ORIGEM"] || row.origem || "").trim();
  const baseIdentificada = normalizarBasePnr(row.baseIdentificada || row.base_identificada || estacaoOrigem);
  const tipoBase = row.tipoBase || row.tipo_base || row.tipoOperacional || row.tipo_operacional || identificarTipoBasePnr(baseIdentificada);
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
  const idMotorista = formatPnrId(row.idMotorista || row.id_motorista || row["ID DO MOTORISTA"] || row["ID MOTORISTA"]);
  const motoristaDisplay = row.motoristaDisplay || row.motorista_display || nomeMotorista || (idMotorista ? `ID ${idMotorista}` : "");
  const statusMotorista =
    row.statusMotorista ||
    row.status_motorista ||
    (nomeMotorista ? "Sem vínculo recente identificado" : idMotorista ? "Driver possivelmente desligado" : "ID não informado");
  const fonteCruzamento = row.fonteCruzamento || row.fonte_cruzamento || (baseIdentificada ? "Gestão de Desvios" : "Não identificado");
  const observacaoCruzamento =
    row.observacaoCruzamento ||
    row.observacao_cruzamento ||
    (baseIdentificada ? "Identificado pela estação de origem do arquivo PNR" : idMotorista ? "Sem correspondência suficiente nas bases de 2026" : "ID do motorista não informado");
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
    produtos: repairPnrText(row.produtos || row.PRODUTOS || row.produto || row.PRODUTO || row.Products || row.Product || "").trim(),
    valorCompraOriginal,
    valorCompraNumerico,
    repTransportadora: repairPnrText(row.repTransportadora || row.rep_transportadora || row["REP TRANSPORTADORA"] || "").trim(),
    idTransportadora: formatPnrId(row.idTransportadora || row.id_transportadora || row["ID DA TRANSPORTADORA"]),
    transportadora: repairPnrText(row.transportadora || row.TRANSPORTADORA || "").trim(),
    estacaoOrigem,
    tipoOcorrencia: "PNR",
    tipoBase: tipoBase === "Indefinido" ? "Não identificada" : tipoBase,
    tipoOperacional: tipoBase === "Indefinido" ? "Não identificada" : tipoBase,
    baseIdentificada,
    nomeBaseOperacao: repairPnrText(row.nomeBaseOperacao || row.nome_base_operacao || row.base || estacaoOrigem || "").trim(),
    idRota: formatPnrId(row.idRota || row.id_rota || row["ID DA ROTA"] || row["ID ROTA"]),
    idMotorista,
    nomeMotorista,
    motoristaDisplay,
    statusMotorista,
    fonteCruzamento,
    observacaoCruzamento,
    motoristaMatchSource: row.motoristaMatchSource || row.motorista_match_source || row.fonteCruzamento || row.fonte_cruzamento || "",
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
    sourceFileType: row.sourceFileType || row.source_file_type || "",
  };
  normalized._sortYear = Number(normalized.ano || period.ano || 0);
  normalized._sortMonth = Number(normalized.mesNumero || period.mes || 0);
  normalized._sortQuarter = getPeriodModeFromLabel(normalized.quinzena || period.quinzena) === "q2" ? 2 : 1;
  normalized._sortDateTs = parseDateValue(normalized.dataCaso).ts || 0;
  normalized.dedupeKey = row.dedupeKey || row.dedupe_key || getPnrDedupeKey(normalized);
  normalized.valorCompraFormatado = currency.format(normalized.valorCompraNumerico || 0);
  normalized._search = buildPnrSearchText(normalized);
  return normalized;
}

function hasPnrHeaderGroup(normalizedHeaders, aliases = []) {
  return aliases.some((alias) => normalizedHeaders.has(normalizePnrHeader(alias)));
}

function getMissingPnrRequiredHeaderGroups(headers = []) {
  const normalizedHeaders = new Set((Array.isArray(headers) ? headers : []).map(normalizePnrHeader).filter(Boolean));
  return PNR_REQUIRED_HEADER_GROUPS.filter((group) => !hasPnrHeaderGroup(normalizedHeaders, group.aliases));
}

function rowLooksLikePnrHeader(row = []) {
  return getMissingPnrRequiredHeaderGroups(row).length === 0;
}

function workbookLooksLikePnr(workbook) {
  return workbook?.SheetNames?.some((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
    return matrix.slice(0, 12).some((row) => rowLooksLikePnrHeader(row || []));
  });
}

function normalizePnrMasterCandidateName(fileName = "") {
  const withoutPath = String(fileName || "").split(/[\\/]/).pop() || "";
  const withoutExtension = withoutPath.replace(/\.(xlsx|xls|xltx|csv)$/i, "");
  return normalizeText(withoutExtension).toLowerCase();
}

function isPnrMasterFile(fileName = "") {
  const normalized = normalizePnrMasterCandidateName(fileName);
  return normalized === "pnr mestre 2024 2025";
}

function getPnrFileRole(fileName = "") {
  return isPnrMasterFile(fileName) ? "master" : "incremental";
}

function logPnrMasterDetection(fileName = "") {
  const normalized = normalizePnrMasterCandidateName(fileName);
  const isMaster = normalized === "pnr mestre 2024 2025";
  console.info("[PNR Master Detection]", {
    originalName: fileName,
    normalizedName: normalized,
    isMasterFile: isMaster,
    fileRole: isMaster ? "master" : "incremental",
  });
  return isMaster;
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
  const missing = getMissingPnrRequiredHeaderGroups(headers);
  if (missing.length) {
    const label = options.isMaster ? "Arquivo mestre inválido" : "Arquivo PNR inválido";
    throw new Error(`${label}. Coluna obrigatória não encontrada: ${missing[0].label}.`);
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
  const importedSheets = [];
  const ignoredSheets = [];
  let totalRowsRead = 0;
  const fileNameLooksMaster = logPnrMasterDetection(fileName);
  const fileRole = getPnrFileRole(fileName);
  const sourceFileType = fileRole === "master" ? "master" : "quinzena";
  let detectedMasterFile = fileNameLooksMaster;
  const filePeriod = getPnrPeriodFromAny(fileName);
  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: null });
    if (!matrix.length) {
      ignoredSheets.push({ sheetName, reason: "Aba vazia", rowsRead: 0, importedRows: 0, ignoredRows: 0 });
      return;
    }
    const headerIndex = matrix.findIndex((row) => rowLooksLikePnrHeader(row || []));
    if (headerIndex < 0) {
      ignoredSheets.push({ sheetName, reason: "Cabeçalho PNR não encontrado", rowsRead: Math.max(matrix.length - 1, 0), importedRows: 0, ignoredRows: Math.max(matrix.length - 1, 0) });
      return;
    }
    const rawHeaders = matrix[headerIndex] || [];
    const sheetHasCalculatedColumns = hasPnrCalculatedHeaders(rawHeaders);
    const sheetIsMaster = fileNameLooksMaster;
    try {
      validatePnrSourceHeaders(rawHeaders, { isMaster: sheetIsMaster });
    } catch (error) {
      ignoredSheets.push({ sheetName, reason: error.message || "Cabeçalho PNR inválido", rowsRead: Math.max(matrix.length - headerIndex - 1, 0), importedRows: 0, ignoredRows: Math.max(matrix.length - headerIndex - 1, 0) });
      return;
    }
    if (sheetIsMaster) detectedMasterFile = true;
    const headers = rawHeaders.map(normalizePnrHeader);
    const sheetStartCount = records.length;
    let sheetSkipped = 0;
    const rowsRead = Math.max(matrix.length - headerIndex - 1, 0);
    totalRowsRead += rowsRead;
    matrix.slice(headerIndex + 1).forEach((row) => {
      if (!row || row.every((cell) => cell === null || cell === "")) return;
      const rowObject = {};
      headers.forEach((header, index) => {
        if (header) rowObject[header] = row[index];
      });
      if (isPnrSummaryRow(rowObject)) {
        skipped += 1;
        sheetSkipped += 1;
        return;
      }
      const dataCaso = getPnrCell(rowObject, "DATA DO CASO");
      const periodoFaturamento = getPnrCell(rowObject, "PERIODO DE FATURAMENTO", "PERÍODO DE FATURAMENTO");
      const rowPeriod = getPnrPeriodFromAny(periodoFaturamento);
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
        idEnvio: getPnrCell(rowObject, "ID DE ENVIO", "ID ENVIO", "ID DO ENVIO", "ENVIO", "PACOTE", "ID DO PACOTE", "ID PACOTE", "SHIPMENT ID", "SHIPMENT_ID"),
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
        quinzenaRef: quinzenaRefValue || getPnrCell(rowObject, "QUINZENA REF", "QUINZENA REF.", "QUINZENA") || getPnrQuinzenaRef(period),
        periodoLabel: getPnrPeriodLabel(period),
        sourceFileName: fileName,
        sourcePeriodo: resolvedBillingPeriod,
        sourceFileType,
        arquivo_origem: fileName,
      });
      if (!normalized.idEnvio || !normalized.idRota || !normalized.produtos || !normalized.statusOriginal || !(normalized.periodoFaturamento || normalized.quinzenaRef) || !normalized.dedupeKey) {
        skipped += 1;
        sheetSkipped += 1;
        return;
      }
      normalized.sheetName = sheetName;
      records.push(normalized);
    });
    const importedRows = records.length - sheetStartCount;
    if (importedRows) {
      importedSheets.push({ sheetName, rowsRead, importedRows, ignoredRows: sheetSkipped });
    } else {
      ignoredSheets.push({ sheetName, reason: "Nenhuma linha PNR válida", rowsRead, importedRows: 0, ignoredRows: rowsRead });
    }
  });
  const deduped = dedupePnrRecords(records);
  const years = deduped.rows
    .map((row) => Number(row.ano || String(row.monthKey || "").slice(0, 4)))
    .filter((year) => Number.isFinite(year) && year > 1900)
    .sort((a, b) => a - b);
  normalizePnrWorkbook.lastStats = {
    originalRows: records.length + skipped,
    consolidatedRows: deduped.rows.length,
    sheetCount: workbook.SheetNames.length,
    importedSheets,
    ignoredSheets,
    importedSheetNames: importedSheets.map((sheet) => sheet.sheetName),
    ignoredSheetNames: ignoredSheets.map((sheet) => sheet.sheetName),
    totalRowsRead: totalRowsRead || records.length + skipped,
    totalRowsImported: deduped.rows.length,
    sheetsImported: importedSheets.length,
    sheetsIgnored: ignoredSheets.length,
    totalRowsSkipped: skipped,
    duplicateRowsUpdated: deduped.duplicateRowsUpdated,
    duplicateRowsSkipped: deduped.duplicateRowsSkipped,
    newRows: deduped.rows.length,
    duplicateRowsRemoved: deduped.duplicateRowsUpdated + deduped.duplicateRowsSkipped,
    isMasterFile: detectedMasterFile,
    fileRole,
    periodStartYear: years[0] || "",
    periodEndYear: years[years.length - 1] || "",
  };
  console.info("[PNR Import]", {
    fileName,
    fileRole,
    isMasterFile: detectedMasterFile,
    sheetCount: workbook.SheetNames.length,
    importedSheets: importedSheets.map((sheet) => sheet.sheetName),
    ignoredSheets,
    rowsRead: totalRowsRead || records.length + skipped,
    rowsImported: deduped.rows.length,
    duplicatesIgnored: deduped.duplicateRowsSkipped,
  });
  return deduped.rows;
}

function normalizePackageManagementWorkbook(workbook, fileName = "") {
  const records = [];
  const period = identificarPeriodoGestaoPacotes(fileName);
  const ignoredSheets = [];
  const importedSheets = [];
  let totalRowsSkipped = 0;
  let totalRowsRead = 0;
  workbook.SheetNames.forEach((sheetName) => {
    const sheetType = identificarAbaGestao(sheetName) || (workbook.SheetNames.length === 1 ? identificarAbaGestao(fileName) || "ALINHAMENTO" : null);
    if (!sheetType) {
      ignoredSheets.push({ sheetName, reason: "Aba de Gestão de Pacotes não reconhecida", rowsRead: 0, importedRows: 0, ignoredRows: 0 });
      return;
    }
    const sheet = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
    if (!matrix.length) {
      ignoredSheets.push({ sheetName, reason: "Aba vazia", rowsRead: 0, importedRows: 0, ignoredRows: 0 });
      return;
    }
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
    const sheetStartCount = records.length;
    let sheetSkipped = 0;
    const rowsRead = Math.max(matrix.length - headerIndex - 1, 0);
    totalRowsRead += rowsRead;
    for (let i = headerIndex + 1; i < matrix.length; i += 1) {
      const row = matrix[i];
      if (!row || row.every((cell) => cell == null || String(cell).trim() === "")) continue;
      if (isPackageTotalRow(row)) {
        totalRowsSkipped += 1;
        sheetSkipped += 1;
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
        sheetSkipped += 1;
        continue;
      }
      normalized._search = buildPackageManagementSearchText(normalized);
      records.push(normalized);
    }
    const importedRows = records.length - sheetStartCount;
    if (importedRows) {
      importedSheets.push({ sheetName, rowsRead, importedRows, ignoredRows: sheetSkipped });
    } else {
      ignoredSheets.push({ sheetName, reason: "Nenhuma linha válida importada", rowsRead, importedRows: 0, ignoredRows: rowsRead });
    }
  });
  normalizePackageManagementWorkbook.lastStats = {
    originalRows: records.length + totalRowsSkipped,
    consolidatedRows: records.length,
    duplicatesSkipped: 0,
    sheetCount: workbook.SheetNames.length,
    importedSheets,
    ignoredSheets,
    importedSheetNames: importedSheets.map((sheet) => sheet.sheetName),
    ignoredSheetNames: ignoredSheets.map((sheet) => sheet.sheetName),
    totalRowsRead: totalRowsRead || records.length + totalRowsSkipped,
    totalRowsImported: records.length,
    sheetsImported: importedSheets.length,
    sheetsIgnored: ignoredSheets.length,
    totalRowsSkipped,
  };
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
  const importedSheets = [];
  const ignoredSheets = [];
  let totalRowsRead = 0;
  let totalRowsSkipped = 0;

  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
    if (!matrix.length) {
      ignoredSheets.push({ sheetName, reason: "Aba vazia", rowsRead: 0, importedRows: 0, ignoredRows: 0 });
      return;
    }

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
    if (idx.base < 0 || idx.valor < 0) {
      ignoredSheets.push({ sheetName, reason: "Cabeçalho de Pré-Fatura não reconhecido", rowsRead: Math.max(matrix.length - 1, 0), importedRows: 0, ignoredRows: Math.max(matrix.length - 1, 0) });
      return;
    }
    const sheetStartCount = records.length;
    let sheetSkipped = 0;
    const rowsRead = Math.max(matrix.length - 1, 0);
    totalRowsRead += rowsRead;

    for (let i = 1; i < matrix.length; i += 1) {
      const row = matrix[i];
      if (!row || row.every((cell) => cell == null || String(cell).trim() === "")) continue;

      const base = readCell(row, idx.base);
      if (!base || normalize(base) === "total") {
        totalRowsSkipped += 1;
        sheetSkipped += 1;
        continue;
      }

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
    const importedRows = records.length - sheetStartCount;
    if (importedRows) {
      importedSheets.push({ sheetName, rowsRead, importedRows, ignoredRows: sheetSkipped });
    } else {
      ignoredSheets.push({ sheetName, reason: "Nenhuma linha válida importada", rowsRead, importedRows: 0, ignoredRows: rowsRead });
    }
  });

  const consolidated = consolidateLinkedOccurrences(records);
  normalizeWorkbook.lastStats = {
    ...(consolidateLinkedOccurrences.lastStats || {}),
    sheetCount: workbook.SheetNames.length,
    importedSheets,
    ignoredSheets,
    importedSheetNames: importedSheets.map((sheet) => sheet.sheetName),
    ignoredSheetNames: ignoredSheets.map((sheet) => sheet.sheetName),
    totalRowsRead: totalRowsRead || records.length + totalRowsSkipped,
    totalRowsImported: consolidated.length,
    sheetsImported: importedSheets.length,
    sheetsIgnored: ignoredSheets.length,
    totalRowsSkipped: (consolidateLinkedOccurrences.lastStats?.totalRowsSkipped || 0) + totalRowsSkipped,
  };
  return consolidated;
}

function decodeCsvBuffer(buffer) {
  const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : new Uint8Array(buffer || []);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    try {
      return new TextDecoder("windows-1252").decode(bytes);
    } catch (fallbackError) {
      return new TextDecoder("latin1").decode(bytes);
    }
  }
}

function countCsvDelimiter(line, delimiter) {
  let count = 0;
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (!inQuotes && char === delimiter) {
      count += 1;
    }
  }
  return count;
}

function detectCsvDelimiter(text) {
  const firstLine = String(text || "").split(/\r?\n/).find((line) => line.trim()) || "";
  const separatorDeclaration = firstLine.match(/^\uFEFF?sep\s*=\s*([,;\t|])/i);
  if (separatorDeclaration) return separatorDeclaration[1];
  const sample = String(text || "").split(/\r?\n/).filter((line) => line.trim()).slice(0, 20);
  const candidates = [",", ";", "\t", "|"];
  const scores = candidates.map((delimiter) => ({
    delimiter,
    score: sample.reduce((total, line) => total + countCsvDelimiter(line, delimiter), 0),
  }));
  scores.sort((a, b) => b.score - a.score);
  return scores[0]?.score > 0 ? scores[0].delimiter : ",";
}

function parseCsvText(text, delimiter = ",") {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;
  const normalized = String(text || "").replace(/^\uFEFF/, "");
  let index = 0;
  if (/^sep\s*=/i.test(normalized.split(/\r?\n/, 1)[0] || "")) {
    index = (normalized.indexOf("\n") + 1) || 0;
  }
  for (; index < normalized.length; index += 1) {
    const char = normalized[index];
    if (char === '"') {
      if (inQuotes && normalized[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (!inQuotes && char === delimiter) {
      row.push(value);
      value = "";
    } else if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && normalized[index + 1] === "\n") index += 1;
      row.push(value);
      if (row.some((cell) => String(cell || "").trim() !== "")) rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }
  row.push(value);
  if (row.some((cell) => String(cell || "").trim() !== "")) rows.push(row);
  return rows;
}

async function buildWorkbookFromCsvBuffer(buffer, fileName) {
  const engineReady = await loadWorkbookEngine();
  if (!engineReady || !window.XLSX?.utils?.aoa_to_sheet) {
    throw new Error("Não foi possível ler o CSV porque o parser local não carregou.");
  }
  const text = decodeCsvBuffer(buffer);
  const delimiter = detectCsvDelimiter(text);
  const matrix = parseCsvText(text, delimiter);
  const sheetName = identificarTipoArquivo(fileName) === PACKAGE_MANAGEMENT_FILE_CATEGORY
    ? "ALINHAMENTO"
    : "CSV";
  const worksheet = XLSX.utils.aoa_to_sheet(matrix);
  return {
    workbook: {
      SheetNames: [sheetName],
      Sheets: { [sheetName]: worksheet },
    },
    stats: {
      delimiter,
      rows: Math.max(matrix.length - 1, 0),
      encoding: "utf-8/windows-1252",
    },
  };
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
      showToast(successCount === 1 ? "Arquivo processado com sucesso. Os dados foram salvos na base do painel." : `${successCount} arquivos processados e salvos na base do painel.`, "good", 6200);
    }
    if (failures.length) {
      const firstError = failures[0].error?.message || "Não foi possível processar esse arquivo.";
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
  const pnrFileRole = previewDataset.fileCategory === DEVIATION_PNR_FILE_CATEGORY
    ? getPnrFileRole(file.name)
    : "";
  const isPnrMaster = pnrFileRole === "master";
  const monthAbbr = packagePeriod?.mes || firstRow.competencia?.split("/")?.[0] || capitalize((getMonthAbbr(referenceMonth) || "").toLowerCase());
  const year = packagePeriod?.ano || firstRow.ano || referenceYear || "";
  const competencia = packagePeriod?.competencia || firstRow.competencia || (monthAbbr && year ? `${monthAbbr}/${String(year).slice(-2)}` : "");
  const quinzena = packagePeriod?.quinzena || firstRow.quinzena || periodLabel;
  const detectedPeriodType = normalizePeriodMode(getPeriodModeFromLabel(packagePeriod?.quinzena) || periodType);
  const detectedReferenceMonth = getMonthNumberFromAny(packagePeriod?.mes) || referenceMonth || "";
  return {
    parsed_rows: previewDataset.rows.length,
    period_label: packagePeriod?.quinzena ? getPeriodModeLabel(detectedPeriodType) : periodLabel,
    period_type: detectedPeriodType,
    file_category: previewDataset.fileCategory,
    semantic_file_type: previewDataset.fileCategory,
    file_type: previewDataset.fileCategory,
    mime_type: file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    original_name: file.name,
    display_name: displayName,
    fileDisplayName: previewDataset.fileCategory === DEVIATION_PNR_FILE_CATEGORY && isPnrMaster ? "Base mestre" : displayName,
    fileCategory: previewDataset.fileCategory === DEVIATION_PNR_FILE_CATEGORY ? "Gestão de Desvios" : getSettingsFileCategoryLabel(previewDataset.fileCategory),
    fileDescription: previewDataset.fileCategory === DEVIATION_PNR_FILE_CATEGORY && isPnrMaster ? "Histórico consolidado" : "",
    file_role: pnrFileRole,
    pnr_file_role: pnrFileRole,
    isMasterFile: isPnrMaster,
    is_master_file: isPnrMaster,
    competencia,
    quinzena,
    mes: monthAbbr || "",
    ano: year || "",
    reference_month: detectedReferenceMonth,
    reference_year: referenceYear || "",
    file_hash: fileHash,
    size_bytes: file.size,
    uploaded_at: new Date().toISOString(),
    sync_source: "manual-upload",
    source_format: previewDataset.sourceFormat || (isCsvFile(file) ? "csv" : "xlsx"),
    file_format: previewDataset.sourceFormat || (isCsvFile(file) ? "csv" : "xlsx"),
    sheet_count: previewStats.sheetCount || previewDataset.workbookSheetCount || 1,
    imported_sheets: previewStats.importedSheetNames || [],
    ignored_sheets: previewStats.ignoredSheets || [],
    total_rows_read: previewStats.totalRowsRead || previewStats.originalRows || previewDataset.rows.length,
    total_rows_imported: previewStats.totalRowsImported || previewStats.consolidatedRows || previewDataset.rows.length,
    csv_delimiter: previewDataset.csvStats?.delimiter || "",
    csv_detected_rows: previewDataset.csvStats?.rows || "",
    raw_file_deleted: !KEEP_RAW_UPLOADS_IN_STORAGE,
    storage_mode: KEEP_RAW_UPLOADS_IN_STORAGE ? "raw-file" : "processed-only",
    original_rows: previewStats.originalRows || previewDataset.rows.length,
    consolidated_rows: previewStats.consolidatedRows || previewDataset.rows.length,
    duplicatesSkipped: previewStats.duplicatesSkipped || 0,
    duplicate_rows_skipped: previewStats.duplicateRowsSkipped || 0,
    duplicate_rows_updated: previewStats.duplicateRowsUpdated || 0,
    duplicate_rows_removed: previewStats.duplicateRowsRemoved || 0,
    pnr_master_file: isPnrMaster,
    period_start_year: previewStats.periodStartYear || "",
    period_end_year: previewStats.periodEndYear || "",
    linked_occurrences: previewStats.linkedOccurrences || 0,
    linked_ids_count: previewStats.linkedIds || 0,
    total_rows_skipped: previewStats.totalRowsSkipped || 0,
  };
}

async function findDashboardFileByHash(fileCategory, fileHash) {
  if (!window.supabaseClient || !fileHash) return null;
  const requestedRole = fileCategory === DEVIATION_PNR_FILE_CATEGORY ? getPnrFileRole(dashboardImportState.fileName || "") : "";
  const { data, error } = await window.supabaseClient
    .from("dashboard_files")
    .select("*")
    .eq("file_type", fileCategory)
    .contains("metadata", { file_hash: fileHash })
    .limit(1);

  if (error) throw error;
  const candidates = Array.isArray(data) ? data : [];
  if (fileCategory !== DEVIATION_PNR_FILE_CATEGORY) return candidates.length ? candidates[0] : null;
  return candidates.find((record) => getDashboardFileRole(record) === requestedRole) || null;
}

function getDashboardModuleKeyForFileCategory(fileCategory) {
  if (fileCategory === DEVIATION_PNR_FILE_CATEGORY) return DASHBOARD_MODULE_KEYS.desviosPnr;
  if (fileCategory === PACKAGE_MANAGEMENT_FILE_CATEGORY) return DASHBOARD_MODULE_KEYS.pacotes;
  return DASHBOARD_MODULE_KEYS.preFatura;
}

async function findProcessedDashboardFile(moduleKey, fileHash) {
  if (!window.supabaseClient || !moduleKey || !fileHash) return null;
  const requestedRole = moduleKey === DASHBOARD_MODULE_KEYS.desviosPnr ? getPnrFileRole(dashboardImportState.fileName || "") : "";
  const { data, error } = await window.supabaseClient
    .from("processed_dashboard_files")
    .select("*")
    .eq("module_key", moduleKey)
    .eq("file_hash", fileHash)
    .limit(10);
  if (error) {
    console.warn("[Painel Cache] Controle processed_dashboard_files indisponível.", error);
    return null;
  }
  const candidates = Array.isArray(data) ? data : [];
  if (moduleKey !== DASHBOARD_MODULE_KEYS.desviosPnr) return candidates[0] || null;
  return candidates.find((record) => getProcessedFileRole(record) === requestedRole) || null;
}

function getDashboardFileRole(record = {}) {
  const metadata = record.metadata || {};
  const name = record.file_name || record.fileName || metadata.original_name || metadata.display_name || "";
  return getFileRecordCategory(record) === DEVIATION_PNR_FILE_CATEGORY && isPnrMasterFile(name) ? "master" : "incremental";
}

function getProcessedFileRole(record = {}) {
  const metadata = record.metadata || {};
  const name = record.file_name || record.fileName || metadata.original_name || metadata.display_name || "";
  return isPnrMasterFile(name) ? "master" : "incremental";
}

function getProcessedDashboardModuleKeyAliases(moduleKey) {
  if (moduleKey === DASHBOARD_MODULE_KEYS.desviosPnr) return [moduleKey, "desvios_pnr"];
  if (moduleKey === DASHBOARD_MODULE_KEYS.preFatura) return [moduleKey, "pre_fatura"];
  if (moduleKey === DASHBOARD_MODULE_KEYS.pacotes) return [moduleKey, "gestao_pacotes"];
  if (moduleKey === DASHBOARD_MODULE_KEYS.evolucao) return [moduleKey, "evolucao_mensal"];
  return [moduleKey].filter(Boolean);
}

function mapProcessedDashboardFileToDashboardRecord(record = {}, moduleKey = "") {
  if (!record) return null;
  const metadata = record.metadata || {};
  const resolvedModuleKey = moduleKey || record.module_key || "";
  const category = resolvedModuleKey === DASHBOARD_MODULE_KEYS.desviosPnr || record.module_key === "desvios_pnr"
    ? DEVIATION_PNR_FILE_CATEGORY
    : resolvedModuleKey === DASHBOARD_MODULE_KEYS.pacotes || record.module_key === "gestao_pacotes"
      ? PACKAGE_MANAGEMENT_FILE_CATEGORY
      : PRE_FATURA_FILE_CATEGORY;
  const sourceDashboardFileId = metadata.dashboard_file_id || metadata.file_id || record.dashboard_file_id || "";
  const fileName = record.file_name || metadata.original_name || metadata.display_name || "Arquivo importado";
  const rowCount = Number(record.row_count || metadata.row_count || metadata.record_count || metadata.parsed_rows || metadata.total_rows_imported || 0) || 0;
  const storagePath = record.storage_path || metadata.storage_path || `${PROCESSED_ONLY_STORAGE_PREFIX}/${category.toLowerCase()}/${record.id || sourceDashboardFileId || "processed"}`;
  return {
    id: sourceDashboardFileId || `processed:${record.id || record.file_hash || fileName}`,
    file_name: fileName,
    storage_path: storagePath,
    file_type: category,
    file_size: record.file_size || metadata.size_bytes || null,
    reference_month: metadata.reference_month || metadata.mes || "",
    reference_year: metadata.reference_year || metadata.ano || "",
    period_label: metadata.period_label || metadata.quinzena || "",
    period_type: metadata.period_type || getPeriodModeFromLabel(`${metadata.quinzena || ""} ${fileName}`) || "",
    is_active: true,
    status: record.status || "processed",
    row_count: rowCount,
    created_at: record.created_at || record.processed_at || metadata.uploaded_at || "",
    updated_at: record.processed_at || record.updated_at || metadata.processed_at || metadata.uploaded_at || "",
    metadata: {
      ...metadata,
      file_category: category,
      semantic_file_type: category,
      file_type: category,
      original_name: metadata.original_name || fileName,
      display_name: metadata.display_name || getDashboardFileDisplayName({ fileName, fileCategory: category, metadata }),
      file_hash: record.file_hash || metadata.file_hash || "",
      file_role: record.file_role || metadata.file_role || metadata.pnr_file_role || "",
      pnr_file_role: record.file_role || metadata.pnr_file_role || metadata.file_role || "",
      row_count: rowCount,
      record_count: rowCount,
      parsed_rows: rowCount,
      total_rows_imported: metadata.total_rows_imported || rowCount,
      status: record.status || metadata.status || "processed",
      processed_at: record.processed_at || metadata.processed_at || "",
      raw_file_deleted: record.raw_file_deleted === true || metadata.raw_file_deleted === true,
      storage_path: storagePath,
      processed_dashboard_file_id: record.id || "",
      dashboard_file_id: sourceDashboardFileId,
      file_id: sourceDashboardFileId,
      source: "processed_dashboard_files",
    },
  };
}

async function loadProcessedDashboardFileRecords(moduleKey) {
  if (!window.supabaseClient || !moduleKey) return [];
  try {
    const { data, error } = await withTimeout(
      window.supabaseClient
        .from("processed_dashboard_files")
        .select("*")
        .in("module_key", getProcessedDashboardModuleKeyAliases(moduleKey))
        .eq("status", "processed")
        .gt("row_count", 0)
        .order("processed_at", { ascending: false }),
      SUPABASE_QUERY_TIMEOUT_MS,
      "Tempo limite excedido ao buscar metadados de arquivos processados.",
    );
    if (error) throw error;
    return (Array.isArray(data) ? data : [])
      .filter((record) => record?.metadata?.hidden_from_history !== true && record?.metadata?.removed_from_history !== true)
      .map((record) => mapProcessedDashboardFileToDashboardRecord(record, moduleKey))
      .filter(Boolean);
  } catch (error) {
    console.warn("[PNR Files Refresh] Não foi possível buscar processed_dashboard_files.", error);
    return [];
  }
}

async function mergeProcessedDashboardFileRecords(records = [], moduleKey = DASHBOARD_MODULE_KEYS.desviosPnr) {
  const processedRecords = await loadProcessedDashboardFileRecords(moduleKey);
  if (!processedRecords.length) return Array.isArray(records) ? records : [];
  const merged = new Map();
  (Array.isArray(records) ? records : []).forEach((record) => {
    if (record?.id) merged.set(record.id, record);
  });
  processedRecords.forEach((record) => {
    const metadata = record.metadata || {};
    const key = metadata.dashboard_file_id || record.id;
    const existing = merged.get(key);
    if (existing) {
      merged.set(key, {
        ...existing,
        row_count: getFileRowsCount(existing) || record.row_count,
        metadata: {
          ...(existing.metadata || {}),
          ...metadata,
          row_count: getFileRowsCount(existing) || metadata.row_count,
          record_count: getFileRowsCount(existing) || metadata.record_count,
          parsed_rows: getFileRowsCount(existing) || metadata.parsed_rows,
          raw_file_deleted: metadata.raw_file_deleted === true || existing.metadata?.raw_file_deleted === true,
        },
      });
    } else {
      merged.set(key, record);
    }
  });
  return Array.from(merged.values());
}

async function upsertProcessedDashboardFile({ moduleKey, fileRecord, fileHash, rowCount, competencia, status = "processed", storagePath = "", rawFileDeleted = false, metadata = {} }) {
  if (!window.supabaseClient || !moduleKey || !fileHash || !fileRecord) return;
  const payload = {
    module_key: moduleKey,
    file_name: fileRecord.file_name || fileRecord.fileName || metadata.original_name || "",
    file_hash: fileHash,
    file_role: moduleKey === DASHBOARD_MODULE_KEYS.desviosPnr ? getDashboardFileRole(fileRecord) : (metadata.file_role || metadata.pnr_file_role || ""),
    file_size: Number(fileRecord.file_size || metadata.size_bytes || 0) || null,
    last_modified: metadata.last_modified || metadata.uploaded_at || fileRecord.updated_at || "",
    competencia: competencia || metadata.competencia || "",
    row_count: Number(rowCount || metadata.record_count || metadata.parsed_rows || 0) || 0,
    status,
    processed_at: new Date().toISOString(),
    storage_path: storagePath || fileRecord.storage_path || metadata.storage_path || "",
    raw_file_deleted: rawFileDeleted === true || metadata.raw_file_deleted === true,
    metadata: {
      ...metadata,
      file_id: fileRecord.id || metadata.file_id || "",
      dashboard_file_id: fileRecord.id || metadata.dashboard_file_id || "",
      storage_path: storagePath || fileRecord.storage_path || metadata.storage_path || "",
      raw_file_deleted: rawFileDeleted === true || metadata.raw_file_deleted === true,
    },
  };
  let { error } = await window.supabaseClient
    .from("processed_dashboard_files")
    .upsert(payload, { onConflict: "module_key,file_hash" });
  if (error && /file_role|PGRST204|schema cache|Could not find/i.test(`${error.code || ""} ${error.message || ""} ${error.details || ""}`)) {
    const fallbackPayload = { ...payload };
    delete fallbackPayload.file_role;
    ({ error } = await window.supabaseClient
      .from("processed_dashboard_files")
      .upsert(fallbackPayload, { onConflict: "module_key,file_hash" }));
  }
  if (error) console.warn("[Painel Cache] Não foi possível atualizar processed_dashboard_files.", error);
}

async function getPersistedProcessedRowsCount(fileRecord) {
  if (!window.supabaseClient || !fileRecord?.id) return 0;
  try {
    const tableName = getProcessedRecordsTable(getFileRecordCategory(fileRecord));
    const { count, error } = await window.supabaseClient
      .from(tableName)
      .select("id", { count: "exact", head: true })
      .eq("file_id", fileRecord.id);
    if (error) throw error;
    return Number(count || 0);
  } catch (error) {
    if (isMissingProcessedRecordsTableError(error)) return 0;
    console.warn("[Painel Cache] Não foi possível contar registros processados do arquivo.", error);
    return 0;
  }
}

async function getProcessedTableTotalCount(fileCategory) {
  if (!window.supabaseClient) return 0;
  const tableName = getProcessedRecordsTable(fileCategory);
  const { count, error } = await window.supabaseClient
    .from(tableName)
    .select("id", { count: "exact", head: true });
  if (error) throw error;
  return Number(count || 0);
}

async function validatePnrImportPersistence(fileRecord, processedSaveResult, expectedRows = 0, metadata = {}) {
  if (getFileRecordCategory(fileRecord) !== DEVIATION_PNR_FILE_CATEGORY) return null;
  const fileRole = metadata.file_role || getDashboardFileRole(fileRecord);
  const [fileRows, totalRows] = await Promise.all([
    getPersistedProcessedRowsCount(fileRecord),
    getProcessedTableTotalCount(DEVIATION_PNR_FILE_CATEGORY),
  ]);
  console.info("[PNR Import]", {
    stage: "persistência validada",
    fileName: fileRecord?.file_name,
    fileRole,
    expectedRows,
    fileRows,
    totalRows,
    inserted: processedSaveResult?.inserted ?? 0,
    updated: processedSaveResult?.updated ?? 0,
    ignored: processedSaveResult?.ignored ?? 0,
  });
  const affectedRows = Number(processedSaveResult?.inserted || 0) + Number(processedSaveResult?.updated || 0) + Number(processedSaveResult?.ignoredOlder || 0);
  if (!processedSaveResult || totalRows <= 0 || affectedRows <= 0) {
    throw new Error("A importação de PNR não encontrou registros consolidados em desvios_pnr_records. O arquivo não será marcado como processado.");
  }
  return { fileRows, totalRows };
}

async function refreshPnrDashboardAfterImport(fileRecord, metadata = {}) {
  if (getFileRecordCategory(fileRecord) !== DEVIATION_PNR_FILE_CATEGORY) return null;
  const moduleKey = DASHBOARD_MODULE_KEYS.desviosPnr;
  const expectedRows = Number(metadata.row_count || metadata.total_rows_imported || metadata.parsed_rows || metadata.record_count || 0) || 0;
  try {
    console.info("[PNR Import Success]", {
      fileName: fileRecord?.file_name,
      fileRole: metadata.file_role || getDashboardFileRole(fileRecord),
      row_count: expectedRows,
      raw_file_deleted: metadata.raw_file_deleted === true,
      processed_status: metadata.status || fileRecord?.status || "",
    });
    console.info("[PNR Post Import Refresh]", {
      stage: "início do refresh pós-importação",
      fileName: fileRecord?.file_name,
      fileRole: metadata.file_role || getDashboardFileRole(fileRecord),
    });
    clearPnrPostImportLocalState();
    state.appView = "dashboard";
    state.sheet = DEVIATION_MANAGEMENT_VIEW;
    state.activeDesvioCategory = DEVIATION_CATEGORY_PNRS;
    moduleLoadingState[moduleKey] = true;
    setModuleBaseState(moduleKey, {
      status: MODULE_BASE_STATUS.refreshing,
      hasHydratedFromSupabase: false,
      hasCheckedPersistedData: false,
      error: null,
      source: "post-import",
      reason: "pnr-post-import",
    });
    pnrRowsLoadedKey = "";
    resetPnrRemoteState();
    const baseState = await checkModulePersistedData(moduleKey, { reason: "pnr-post-import" });
    const totalPersisted = Number(baseState.totalPersisted || baseState.total || 0);
    if (totalPersisted <= 0) {
      throw new Error("A importação informou sucesso, mas desvios_pnr_records continua sem registros.");
    }
    const files = await loadDashboardFilesFromSupabase({ loadActive: false, render: false, validateStorage: false, showLoading: false });
    const pnrFiles = getPnrFilesForView(files.length ? files : dashboardFileRecords);
    console.info("[PNR Files Refresh]", {
      files: pnrFiles.length,
      fileNames: pnrFiles.slice(0, 8).map((record) => record.file_name),
      rawFileDeleted: pnrFiles.filter((record) => record.metadata?.raw_file_deleted === true).length,
    });
    await loadPnrRowsForView(files.length ? files : dashboardFileRecords, new Map());
    window.clearTimeout(pnrRemoteDebounceTimer);
    await refreshPnrRemoteDashboard({ force: true, reason: "upload" });
    const rpcTotal = Number(pnrRemoteState.total || 0);
    const rpcRows = Array.isArray(pnrRemoteState.rows) ? pnrRemoteState.rows.length : 0;
    if (rpcTotal <= 0 && totalPersisted > 0) {
      throw new Error("A base PNR possui registros persistidos, mas a RPC retornou total zero após a importação.");
    }
    moduleLoadingState[moduleKey] = false;
    setModuleBaseState(moduleKey, {
      status: MODULE_BASE_STATUS.loaded,
      hasHydratedFromSupabase: true,
      hasCheckedPersistedData: true,
      moduleHasPersistedData: true,
      hasPersistedData: true,
      totalPersisted,
      total: totalPersisted,
      filteredTotal: rpcTotal || totalPersisted,
      error: null,
      source: "Supabase",
      reason: "pnr-post-import-refresh-complete",
    });
    console.info("[PNR Post Import Refresh]", {
      stage: "fim do refresh pós-importação",
      totalPersisted,
      total: rpcTotal,
      rows: rpcRows,
      source: pnrRemoteState.source,
    });
    console.info("[PNR Render After Import]", {
      status: getModuleBaseState(moduleKey).status,
      empty: moduleIsConfirmedEmpty(moduleKey),
      files: pnrFiles.length,
      totalPersisted,
      rpcTotal,
      tableRows: rpcRows,
    });
    hydrateControls();
    renderAll();
    return rpcTotal || totalPersisted;
  } catch (error) {
    moduleLoadingState[moduleKey] = false;
    console.error("[PNR Post Import Refresh] Falha ao atualizar PNRs após upload:", error);
    pnrRemoteState.error = error?.message || "Não foi possível atualizar os dados de PNR após a importação.";
    setModuleBaseState(moduleKey, {
      status: MODULE_BASE_STATUS.error,
      hasHydratedFromSupabase: true,
      hasCheckedPersistedData: true,
      error: pnrRemoteState.error,
      source: "post-import",
      reason: "pnr-post-import-refresh-error",
    });
    renderAll();
    showToast("Importação gravada, mas a atualização da aba PNR falhou. Verifique o console e tente reprocessar.", "error", 7200);
    return null;
  }
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
  data.metadata = {
    ...(data.metadata || {}),
    file_id: data.id,
    dashboard_file_id: data.id,
  };
  const processedSaveResult = await saveProcessedRowsForFile(data, previewDataset.rows);
  const validation = await validatePnrImportPersistence(data, processedSaveResult, previewDataset.rows.length, nextMetadata);
  await upsertProcessedDashboardFile({
    moduleKey: getDashboardModuleKeyForFileCategory(fileCategory),
    fileRecord: data,
    fileHash: nextMetadata.file_hash || previewDataset.fileHash,
    rowCount: validation?.fileRows || previewDataset.rows.length,
    competencia: nextMetadata.competencia,
    metadata: {
      ...nextMetadata,
      file_id: data.id,
      dashboard_file_id: data.id,
    },
  });
  mergeUploadedDatasetIntoMemory(data, previewDataset);
  return data;
}

async function processDashboardFile(file, fileRecord = null, options = {}) {
  setDashboardImportState({
    fileName: fileRecord?.file_name || file.name,
    fileType: isCsvFile(file || file.name) ? "csv" : "xlsx",
    stage: "Preparando arquivo...",
    progress: Math.max(8, Number(dashboardImportState.progress || 0)),
  }, { render: false });
  const buffer = await withTimeout(
    file.arrayBuffer(),
    XLSX_PROCESS_TIMEOUT_MS,
    "Tempo limite excedido ao ler o arquivo.",
  );
  const fileName = fileRecord?.file_name || file.name;
  const isCsv = isCsvFile(file || fileName);
  let workbook;
  let csvStats = null;
  if (isCsv) {
    setDashboardImportState({ stage: "Lendo arquivo CSV...", progress: 18 }, { render: true });
    const csvResult = await buildWorkbookFromCsvBuffer(buffer, fileName);
    workbook = csvResult.workbook;
    csvStats = csvResult.stats;
  } else {
    setDashboardImportState({ stage: "Lendo arquivo XLSX...", progress: 18 }, { render: true });
    showToast("Lendo arquivo XLSX...", "info", 2600);
    const engineReady = await loadWorkbookEngine();
    if (!engineReady || !window.XLSX || typeof window.XLSX.read !== "function") {
      throw new Error("Não foi possível ler o Excel porque o parser local não carregou.");
    }
    workbook = XLSX.read(buffer, { type: "array", cellDates: true });
    setDashboardImportState({
      stage: workbook.SheetNames.length > 1 ? "Arquivo com múltiplas abas detectado." : "Detectando abas...",
      progress: 28,
      sheetCount: workbook.SheetNames.length,
    }, { render: true });
    showToast(`Detectando abas: ${workbook.SheetNames.length} encontrada(s).`, "info", 2800);
  }
  const fileHash = options.calculateHash ? await calculateSha256FromBuffer(buffer) : fileRecord?.metadata?.file_hash || "";
  let fileCategory = options.fileCategory || getFileRecordCategory(fileRecord || { file_name: fileName });
  if (fileCategory === PRE_FATURA_FILE_CATEGORY && workbookLooksLikePnr(workbook)) {
    fileCategory = DEVIATION_PNR_FILE_CATEGORY;
  }
  setDashboardImportState({
    moduleKey: getDashboardModuleKeyForFileCategory(fileCategory),
    stage: workbook.SheetNames.length > 1 ? `Processando aba 1 de ${workbook.SheetNames.length}: ${workbook.SheetNames[0] || "Aba 1"}` : "Normalizando colunas...",
    progress: 40,
    sheetName: workbook.SheetNames[0] || "",
    sheetIndex: workbook.SheetNames.length ? 1 : 0,
    sheetCount: workbook.SheetNames.length,
  }, { render: true });
  showToast("Normalizando colunas...", "info", 2600);
  const rows = fileCategory === DEVIATION_PNR_FILE_CATEGORY
    ? normalizePnrWorkbook(workbook, fileName)
    : fileCategory === PACKAGE_MANAGEMENT_FILE_CATEGORY
      ? normalizePackageManagementWorkbook(workbook, fileName)
      : normalizeWorkbook(workbook);
  const stats = getWorkbookStatsForCategory(fileCategory);
  setDashboardImportState({
    stage: "Validando registros...",
    progress: 56,
    rowsRead: stats.totalRowsRead || stats.originalRows || rows.length,
    rowsImported: stats.totalRowsImported || stats.consolidatedRows || rows.length,
    duplicatesIgnored: stats.duplicatesSkipped || stats.duplicateRowsSkipped || 0,
    ignoredSheets: stats.ignoredSheets || [],
    importedSheets: stats.importedSheetNames || [],
  }, { render: true });
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
    sourceFormat: isCsv ? "csv" : "xlsx",
    workbookSheetCount: workbook.SheetNames.length,
    csvStats,
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
    state.sheet = DEVIATION_MANAGEMENT_VIEW;
    state.activeDesvioCategory = DEVIATION_CATEGORY_PNRS;
    state.pnrQuery = "";
    state.pnrMonths = [];
    state.pnrQuinzena = "all";
    state.pnrStatus = "Todos";
    state.pnrTipoOperacional = "Todos";
    state.pnrEstacao = "Todos";
    state.pnrStatusMotorista = "Todos";
    state.pnrFonteCruzamento = "Todos";
    state.pnrMotorista = "Todos";
    state.pnrRota = "Todos";
    state.page = 1;
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
  if (!isSpreadsheetImportFile(file)) {
    showToast("Formatos aceitos: XLSX e CSV.", "warn", 5200);
    return;
  }

  dashboardFilesLoading = true;
  resetDashboardImportState();
  setDashboardImportState({
    active: true,
    moduleKey: getDashboardModuleKeyForFileCategory(getUploadFileCategory(file.name)),
    fileName: file.name,
    fileType: isCsvFile(file) ? "csv" : "xlsx",
    stage: "Preparando arquivo...",
    progress: 6,
  }, { render: false });
  setDashboardVisualState("processing-file");
  updateDatasetMeta();
  showToast(isCsvFile(file) ? "Lendo CSV..." : "Lendo arquivo XLSX...", "info", 3200);
  setDashboardImportState({ stage: "Calculando assinatura do arquivo...", progress: 10 }, { render: true });
  const preflightBuffer = await withTimeout(
    file.arrayBuffer(),
    XLSX_PROCESS_TIMEOUT_MS,
    "Tempo limite excedido ao ler o arquivo para validação.",
  );
  const preflightHash = await calculateSha256FromBuffer(preflightBuffer);
  const guessedFileCategory = getUploadFileCategory(file.name);
  const moduleKey = getDashboardModuleKeyForFileCategory(guessedFileCategory);
  const uploadFileRole = guessedFileCategory === DEVIATION_PNR_FILE_CATEGORY ? getPnrFileRole(file.name) : "";
  if (guessedFileCategory === DEVIATION_PNR_FILE_CATEGORY) {
    console.info("[PNR Import]", {
      stage: "upload recebido",
      fileName: file.name,
      fileRole: uploadFileRole,
      fileHash: preflightHash,
    });
  }
  setDashboardImportState({ moduleKey, stage: "Verificando duplicidade...", progress: 14 }, { render: true });
  window.dashboardCacheService?.log?.(moduleKey, "upload recebido", {
    fileName: file.name,
    size: file.size,
    hash: preflightHash,
  });
  const alreadyProcessed = await findProcessedDashboardFile(moduleKey, preflightHash);
  const duplicatedBeforeParse = await findDashboardFileByHash(guessedFileCategory, preflightHash);
  const duplicatedProcessedRowsCount = duplicatedBeforeParse ? await getPersistedProcessedRowsCount(duplicatedBeforeParse) : 0;
  const alreadyProcessedRowsCount = Number(alreadyProcessed?.row_count || 0);
  const pnrTableTotalForDuplicate = guessedFileCategory === DEVIATION_PNR_FILE_CATEGORY
    ? await getProcessedTableTotalCount(DEVIATION_PNR_FILE_CATEGORY).catch(() => 0)
    : 1;
  const alreadyProcessedIsValid = alreadyProcessedRowsCount > 0 &&
    String(alreadyProcessed?.status || "").toLowerCase() === "processed" &&
    (guessedFileCategory !== DEVIATION_PNR_FILE_CATEGORY || pnrTableTotalForDuplicate > 0);
  const duplicatedRecordIsValid = duplicatedProcessedRowsCount > 0 &&
    (guessedFileCategory !== DEVIATION_PNR_FILE_CATEGORY || getDashboardFileRole(duplicatedBeforeParse) === uploadFileRole);
  if (alreadyProcessedIsValid || duplicatedRecordIsValid) {
    window.dashboardCacheService?.log?.(moduleKey, "arquivo já processado; evitando reprocessamento", {
      fileName: file.name,
      hash: preflightHash,
      controlRows: alreadyProcessedRowsCount,
      persistedRows: duplicatedProcessedRowsCount,
      fileRole: uploadFileRole,
    });
    showToast("Arquivo já processado. Dados carregados da base.", "info", 5200);
    dashboardFilesLoading = false;
    finishDashboardImportState({ status: "already-processed" });
    showDashboardImportSummary({
      original_name: file.name,
      total_rows_imported: alreadyProcessedRowsCount || duplicatedProcessedRowsCount,
      total_rows_read: alreadyProcessedRowsCount || duplicatedProcessedRowsCount,
      sheet_count: 1,
    }, { fileCategory: guessedFileCategory }, { rowsImported: alreadyProcessedRowsCount || duplicatedProcessedRowsCount });
    setDashboardVisualState("", { render: false });
    await loadDashboardFilesFromSupabase({ loadActive: true, render: true, validateStorage: false, showLoading: false });
    if (guessedFileCategory === DEVIATION_PNR_FILE_CATEGORY) {
      const processedRecord = alreadyProcessed ? mapProcessedDashboardFileToDashboardRecord(alreadyProcessed, DASHBOARD_MODULE_KEYS.desviosPnr) : null;
      const refreshRecord = duplicatedBeforeParse || processedRecord;
      if (refreshRecord) {
        await refreshPnrDashboardAfterImport(refreshRecord, {
          ...(refreshRecord.metadata || {}),
          row_count: alreadyProcessedRowsCount || duplicatedProcessedRowsCount,
          total_rows_imported: alreadyProcessedRowsCount || duplicatedProcessedRowsCount,
          status: "processed",
        });
      }
    }
    return;
  }
  if (duplicatedBeforeParse) {
    window.dashboardCacheService?.log?.(moduleKey, "arquivo cadastrado sem registros persistidos; processando cadastro existente", {
      fileName: file.name,
      hash: preflightHash,
      fileId: duplicatedBeforeParse.id,
    });
    showToast("Arquivo já cadastrado. Processando registros pendentes da base...", "info", 5200);
    setDashboardImportState({ stage: "Processando cadastro existente...", progress: 22 }, { render: true });
    const pendingDataset = await processDashboardFile(file, duplicatedBeforeParse, { calculateHash: false, fileCategory: guessedFileCategory });
    if (!pendingDataset.rows.length) {
      dashboardFilesLoading = false;
      setDashboardVisualState("");
      updateDatasetMeta();
      throw new Error("Nenhuma aba válida foi encontrada no arquivo. Verifique se o arquivo contém colunas reconhecidas para este módulo.");
    }
    const pendingPeriod = getDatasetPeriod(pendingDataset);
    const pendingStats = getWorkbookStatsForCategory(pendingDataset.fileCategory);
    const [pendingReferenceYear, pendingReferenceMonth] = String(pendingPeriod.key || "").split("-");
    const pendingNamedPeriod = pendingDataset.fileCategory === PACKAGE_MANAGEMENT_FILE_CATEGORY || pendingDataset.fileCategory === DEVIATION_PNR_FILE_CATEGORY
      ? identificarPeriodoGestaoPacotes(file.name)
      : null;
    const pendingPeriodType = normalizePeriodMode(getPeriodModeFromLabel(pendingNamedPeriod?.quinzena) || getDatasetQuarterMode(pendingDataset));
    const pendingDisplayName = getDashboardFileDisplayName({
      fileName: file.name,
      fileCategory: pendingDataset.fileCategory,
      metadata: pendingNamedPeriod ? {
        quinzena: pendingNamedPeriod.quinzena,
        competencia: pendingNamedPeriod.competencia,
      } : {},
    });
    const pendingMetadata = buildUploadPeriodMetadata({
      file,
      previewDataset: pendingDataset,
      referenceYear: pendingNamedPeriod?.ano || pendingReferenceYear,
      referenceMonth: getMonthNumberFromAny(pendingNamedPeriod?.mes) || pendingReferenceMonth,
      periodLabel: getPeriodModeLabel(pendingPeriodType),
      periodType: pendingPeriodType,
      packagePeriod: pendingNamedPeriod,
      displayName: pendingDisplayName,
      fileHash: preflightHash,
      previewStats: pendingStats,
    });
    Object.assign(pendingMetadata, {
      file_hash: preflightHash,
      duplicate_processing_repaired_at: new Date().toISOString(),
    });
    duplicatedBeforeParse.metadata = {
      ...(duplicatedBeforeParse.metadata || {}),
      ...pendingMetadata,
      file_id: duplicatedBeforeParse.id,
      dashboard_file_id: duplicatedBeforeParse.id,
    };
    duplicatedBeforeParse.file_type = pendingDataset.fileCategory;
    duplicatedBeforeParse.file_size = file.size;
    setDashboardImportState({ stage: "Gravando dados no Supabase...", progress: 74 }, { render: true });
    const processedSaveResult = await saveProcessedRowsForFile(duplicatedBeforeParse, pendingDataset.rows);
    const pendingPnrValidation = await validatePnrImportPersistence(duplicatedBeforeParse, processedSaveResult, pendingDataset.rows.length, pendingMetadata);
    setDashboardImportState({ stage: "Atualizando indicadores...", progress: 88 }, { render: true });
    await upsertProcessedDashboardFile({
      moduleKey: getDashboardModuleKeyForFileCategory(pendingDataset.fileCategory),
      fileRecord: duplicatedBeforeParse,
      fileHash: preflightHash,
      rowCount: pendingPnrValidation?.fileRows || pendingDataset.rows.length,
      competencia: pendingMetadata.competencia,
      status: processedSaveResult ? "processed" : "pending",
      metadata: pendingMetadata,
    });
    finishDashboardImportState({
      rowsImported: pendingDataset.rows.length,
      status: processedSaveResult ? "processed" : "pending",
    });
    showDashboardImportSummary(pendingMetadata, pendingDataset, {
      rowsImported: pendingPnrValidation?.fileRows || pendingDataset.rows.length,
      totalRows: pendingPnrValidation?.totalRows,
    });
    showToast("Registros pendentes processados e incorporados à base.", "good", 5200);
    dashboardFilesLoading = false;
    setDashboardVisualState("", { render: false });
    await loadDashboardFilesFromSupabase({ loadActive: true, render: true, validateStorage: false, showLoading: false });
    await refreshPnrDashboardAfterImport(duplicatedBeforeParse, pendingMetadata);
    return;
  }
  showToast("Novo arquivo identificado. Processando e incorporando à base...", "info", 4200);
  setDashboardImportState({ stage: "Novo arquivo identificado. Processando e incorporando à base...", progress: 20 }, { render: true });
  const previewDataset = await processDashboardFile(file, null, { calculateHash: true, fileCategory: guessedFileCategory });
  showToast("Normalizando colunas...", "info", 3000);
  const previewStats = getWorkbookStatsForCategory(previewDataset.fileCategory);
  if (!previewDataset.rows.length) {
    dashboardFilesLoading = false;
    setDashboardVisualState("");
    updateDatasetMeta();
    const stats = getWorkbookStatsForCategory(previewDataset.fileCategory);
    console.warn("[UPLOAD] Nenhuma aba válida encontrada.", {
      fileName: file.name,
      sheetCount: stats.sheetCount || previewDataset.workbookSheetCount || 0,
      ignoredSheets: stats.ignoredSheets || [],
    });
    throw new Error("Nenhuma aba válida foi encontrada no arquivo. Verifique se o arquivo contém colunas reconhecidas para este módulo.");
  }
  const period = getDatasetPeriod(previewDataset);
  const [referenceYear, referenceMonth] = String(period.key || "").split("-");
  const periodType = getDatasetQuarterMode(previewDataset);
  const periodLabel = getPeriodModeLabel(periodType);
  const packagePeriod = previewDataset.fileCategory === PACKAGE_MANAGEMENT_FILE_CATEGORY || previewDataset.fileCategory === DEVIATION_PNR_FILE_CATEGORY
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
    displayName = "Base mestre";
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
  if (KEEP_RAW_UPLOADS_IN_STORAGE && previewDataset.fileCategory === DEVIATION_PNR_FILE_CATEGORY && !previewStats.isMasterFile) {
    uploadFile = await buildStandardizedPnrUploadFile(file, previewDataset.rows);
    uploadMetadata.standardized_storage = true;
    uploadMetadata.storage_file_name = uploadFile.name;
    uploadMetadata.storage_model = "Arquivo complementar de PNR";
  } else if (previewDataset.fileCategory === DEVIATION_PNR_FILE_CATEGORY) {
    uploadMetadata.standardized_storage = false;
    uploadMetadata.storage_model = previewStats.isMasterFile ? "Arquivo mestre PNR 2024/2025" : "Arquivo complementar de PNR";
  }

  const duplicatedRecord = await findDashboardFileByHash(previewDataset.fileCategory, previewDataset.fileHash);
  if (duplicatedRecord) {
    const data = await updateDuplicateDashboardFileRecord(duplicatedRecord, uploadMetadata, previewDataset);
    let previousRecords = await findDashboardFilesByUploadMetadata(previewDataset.fileCategory, file.name, uploadMetadata);
    if (previewDataset.fileCategory === DEVIATION_PNR_FILE_CATEGORY && previewStats.isMasterFile) {
      const previousMasterRecords = dashboardFileRecords
        .filter(isUsableDashboardFileRecord)
        .filter(isPnrMasterDashboardFile);
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
    finishDashboardImportState({
      rowsImported: uploadMetadata.total_rows_imported || previewDataset.rows.length,
      duplicatesIgnored: uploadMetadata.duplicate_rows_skipped || 0,
      importedSheets: uploadMetadata.imported_sheets || [],
      ignoredSheets: uploadMetadata.ignored_sheets || [],
      status: "processed",
    });
    showDashboardImportSummary(uploadMetadata, previewDataset, {
      rowsImported: uploadMetadata.total_rows_imported || previewDataset.rows.length,
      duplicatesIgnored: uploadMetadata.duplicate_rows_skipped || 0,
    });
    showToast("Arquivo já existia no painel. Os metadados foram atualizados sem duplicar.", "info", 5200);
    await refreshPnrDashboardAfterImport(data, uploadMetadata);
    return;
  }

  let previousRecords = await findDashboardFilesByUploadMetadata(previewDataset.fileCategory, file.name, uploadMetadata);
  if (previewDataset.fileCategory === DEVIATION_PNR_FILE_CATEGORY && previewStats.isMasterFile) {
    const previousMasterRecords = dashboardFileRecords
      .filter(isUsableDashboardFileRecord)
      .filter(isPnrMasterDashboardFile);
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
  const storagePath = KEEP_RAW_UPLOADS_IN_STORAGE
    ? `${storageFolder}/${referenceYear || "sem-ano"}/${referenceMonth || "sem-mes"}/${Date.now()}_${safeName}`
    : `${PROCESSED_ONLY_STORAGE_PREFIX}/${storageFolder}/${referenceYear || "sem-ano"}/${referenceMonth || "sem-mes"}/${Date.now()}_${safeName}`;

  if (KEEP_RAW_UPLOADS_IN_STORAGE) {
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
  }

  showToast("Gravando dados no Supabase...", "info", 3600);
  setDashboardImportState({ stage: "Gravando dados no Supabase...", progress: 74 }, { render: true });
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
      status: "processing",
      metadata: uploadMetadata,
    })
    .select()
    .single();

  if (error) {
    console.error("Erro ao salvar metadados:", error);
    if (KEEP_RAW_UPLOADS_IN_STORAGE) await window.supabaseClient.storage.from("dashboard-files").remove([storagePath]);
    throw new Error("Arquivo enviado, mas houve erro ao salvar o registro.");
  }
  data.metadata = {
    ...(data.metadata || {}),
    file_id: data.id,
    dashboard_file_id: data.id,
  };

  if (previousRecords.length) {
    await deactivateDashboardFileRecords(previousRecords, data.id);
    removeDashboardFileRecordsFromMemory(previousRecords, data.id);
  }
  if (previewDataset.fileCategory === PRE_FATURA_FILE_CATEGORY) {
    await deactivateOtherPreFaturaRecords(data.id);
  }
  setDashboardImportState({ stage: "Validando registros persistidos...", progress: 82 }, { render: true });
  const processedSaveResult = await saveProcessedRowsForFile(data, previewDataset.rows);
  const pnrValidation = await validatePnrImportPersistence(data, processedSaveResult, previewDataset.rows.length, uploadMetadata);
  showToast("Atualizando indicadores...", "info", 3000);
  setDashboardImportState({ stage: "Atualizando indicadores...", progress: 90 }, { render: true });
  await upsertProcessedDashboardFile({
    moduleKey: getDashboardModuleKeyForFileCategory(previewDataset.fileCategory),
    fileRecord: data,
    fileHash: previewDataset.fileHash,
    rowCount: pnrValidation?.fileRows || previewDataset.rows.length,
    competencia: uploadMetadata.competencia,
    storagePath,
    rawFileDeleted: !KEEP_RAW_UPLOADS_IN_STORAGE,
    metadata: {
      ...uploadMetadata,
      file_id: data.id,
      dashboard_file_id: data.id,
    },
  });
  console.info("[UPLOAD] Resumo da importação", {
    fileName: file.name,
    sourceFormat: uploadMetadata.source_format,
    sheetCount: uploadMetadata.sheet_count,
    importedSheets: uploadMetadata.imported_sheets,
    ignoredSheets: uploadMetadata.ignored_sheets,
    totalRowsRead: uploadMetadata.total_rows_read,
    totalRowsImported: uploadMetadata.total_rows_imported,
    rawFileDeleted: uploadMetadata.raw_file_deleted,
  });

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
  if (!KEEP_RAW_UPLOADS_IN_STORAGE) {
    showToast("Arquivo de origem não foi mantido no Storage após processamento seguro.", "info", 5200);
  }
  finishDashboardImportState({
    rowsRead: uploadMetadata.total_rows_read || previewDataset.rows.length,
    rowsImported: uploadMetadata.total_rows_imported || previewDataset.rows.length,
    duplicatesIgnored: uploadMetadata.duplicate_rows_skipped || 0,
    importedSheets: uploadMetadata.imported_sheets || [],
    ignoredSheets: uploadMetadata.ignored_sheets || [],
    status: "processed",
  });
  showDashboardImportSummary(uploadMetadata, previewDataset, {
    rowsImported: pnrValidation?.fileRows || uploadMetadata.total_rows_imported || previewDataset.rows.length,
    duplicatesIgnored: uploadMetadata.duplicate_rows_skipped || 0,
    totalRows: pnrValidation?.totalRows,
  });
  if (Number(uploadMetadata.sheet_count || 0) > 1) {
    showToast(`Importação concluída. Abas encontradas: ${uploadMetadata.sheet_count}. Abas importadas: ${(uploadMetadata.imported_sheets || []).length}. Abas ignoradas: ${(uploadMetadata.ignored_sheets || []).length}. Registros importados: ${integer.format(uploadMetadata.total_rows_imported || previewDataset.rows.length)}.`, "good", 7600);
  }
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
      showToast(`Arquivo mestre PNR 2024/2025 importado. Registros lidos: ${integer.format(stats.originalRows || previewDataset.rows.length)}. Registros importados: ${integer.format(previewDataset.rows.length)}. Duplicados removidos: ${integer.format(removed)}. Registros atualizados: ${integer.format(updated)}. Período identificado: ${periodText}.`, removed ? "warn" : "good", 9000);
    } else {
      showToast(`Arquivo complementar de PNR importado. Registros novos: ${inserted}. Registros atualizados: ${updated}. Duplicados ignorados: ${ignored}.`, "good", 7200);
    }
    await refreshPnrDashboardAfterImport(data, uploadMetadata);
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
    rows: fileCategory === DEVIATION_PNR_FILE_CATEGORY ? [] : previewDataset.rows,
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
  pnrRows = [];
  const files = dashboardFileRecords
    .filter(isUsableDashboardFileRecord)
    .filter((record) => getFileRecordCategory(record) === DEVIATION_PNR_FILE_CATEGORY);
  pnrRowsLoadedKey = files.map((record) => `${record.id || record.file_name}:${record.updated_at || record.metadata?.last_loaded_at || ""}`).join("|") || "__empty";
  resetPnrRemoteState();
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
      if (didSetLoadingState || !hasLoadedDashboardData()) setDashboardVisualState("supabase-error", { render: false, error });
      if (!hasLoadedDashboardData()) {
        clearDashboardData({ render: false, preserveRecords: false });
      }
      return dashboardFileRecords;
    }

    dashboardFileRecords = (Array.isArray(data) ? data : [])
      .filter(isUsableDashboardFileRecord)
      .filter(isDashboardFileActive);
    dashboardFileRecords = await mergeProcessedDashboardFileRecords(dashboardFileRecords, DASHBOARD_MODULE_KEYS.desviosPnr);
    await hydrateDashboardFileMetadata(dashboardFileRecords, { inferFromFile: options.inferMissingMetadataFromFile === true });
    if (validateStorage && dashboardFileRecords.length) {
      dashboardFileRecords = await validateDashboardFileRecords(dashboardFileRecords);
    }
    await checkAllModulePersistedBases({ reason: hasInitialLoadCompleted ? "reload" : "initial-load" });
    if (!dashboardFileRecords.length) {
      const activeModuleKey = getDashboardModuleKeyForSheet();
      clearDashboardData({ render: false, preserveRecords: moduleHasConfirmedBase(activeModuleKey) || moduleBaseCheckPending(activeModuleKey) });
      if (loadActive && moduleHasConfirmedBase(activeModuleKey)) {
        if (activeModuleKey === DASHBOARD_MODULE_KEYS.preFatura || activeModuleKey === DASHBOARD_MODULE_KEYS.evolucao) {
          const fallbackDataset = await loadPersistedDatasetForModule(DASHBOARD_MODULE_KEYS.preFatura, PRE_FATURA_FILE_CATEGORY);
          if (fallbackDataset?.rows?.length) {
            replaceDashboardData(fallbackDataset.rows, {
              selectedFiles: [],
              selectedDatasets: [fallbackDataset],
              allHistoricalDatasets: [fallbackDataset],
              selectedMonth: "all",
              selectedPeriod: state.prefaturaPeriod || state.period,
              fileCategory: PRE_FATURA_FILE_CATEGORY,
            });
          }
        }
        if (activeModuleKey === DASHBOARD_MODULE_KEYS.pacotes) {
          await loadPackageManagementRowsForCards([], new Map());
        }
        if (activeModuleKey === DASHBOARD_MODULE_KEYS.desviosPnr) {
          schedulePnrRemoteRefresh({ immediate: true, force: true, reason: "reload" });
        }
      }
      if (didSetLoadingState && !moduleBaseCheckPending(activeModuleKey)) setDashboardVisualState("", { render: false });
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

    if (loadActive && state.sheet === DEVIATION_MANAGEMENT_VIEW && state.activeDesvioCategory === DEVIATION_CATEGORY_PNRS) {
      window.dashboardCacheService?.log?.(DASHBOARD_MODULE_KEYS.desviosPnr, "carga inicial independente da aba PNR");
      activeDataset = buildEmptyDataset();
      allRows = [];
      if (shouldLoadPnrRowsForCurrentView(dashboardFileRecords)) {
        void loadPnrRowsForView(dashboardFileRecords, new Map()).catch((error) => {
          console.error("[Gestão Desvios PNR] Falha ao iniciar carga independente:", error);
        });
      }
    } else if (loadActive && activeFile) {
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
    if (didSetLoadingState || !hasLoadedDashboardData()) setDashboardVisualState("supabase-error", { render: false, error });
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
    const persistedRows = await getPersistedProcessedRowsCount(record);
    if (persistedRows > 0) {
      validRecords.push(record);
      continue;
    }
    const storagePath = String(record.storage_path || "");
    const rawFileDeleted = record.metadata?.raw_file_deleted === true || storagePath.startsWith(`${PROCESSED_ONLY_STORAGE_PREFIX}/`);
    if (rawFileDeleted) {
      console.info("[Painel Cache] Registro sem linhas persistidas e sem arquivo bruto. Aguardando nova importação.", {
        fileName: record.file_name,
        fileType: getFileRecordCategory(record),
      });
      validRecords.push(record);
      continue;
    }
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
  if (!packageFiles.length) {
    const baseState = await checkModulePersistedData(DASHBOARD_MODULE_KEYS.pacotes, { reason: "package-load" });
    if (Number(baseState.total || 0) > 0) {
      const dataset = await loadPersistedDatasetForModule(DASHBOARD_MODULE_KEYS.pacotes, PACKAGE_MANAGEMENT_FILE_CATEGORY);
      packageManagementRows = dataset?.rows?.map(normalizePackageManagementStoredRow).filter(Boolean) || [];
      packageManagementRowsLoadedKey = `persisted:${baseState.total}:${baseState.lastCheckedAt || ""}`;
      resetDerivedDataCache();
      return dataset ? [dataset] : [];
    }
    packageManagementRows = [];
    packageManagementRowsLoadedKey = "__empty";
    resetDerivedDataCache();
    return [];
  }
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

function getPnrCurrentTotalRows() {
  if (hasPnrRemoteData() || pnrRemoteState.total) return Number(pnrRemoteState.total || 0);
  return getFilteredPnrRows().length;
}

function hasPnrRemoteData() {
  return pnrRemoteState.source === "remote" || pnrRemoteState.source === "local-cache";
}

function getPnrRemoteFileIds(records = dashboardFileRecords) {
  return getPnrFilesForView(records)
    .map((record) => record.metadata?.dashboard_file_id || record.metadata?.file_id || record.id)
    .filter((id) => id && !String(id).startsWith("processed:"));
}

function buildPnrCacheSignature(records = dashboardFileRecords) {
  if (window.dashboardCacheService?.buildFilesSignature) {
    return window.dashboardCacheService.buildFilesSignature(DASHBOARD_MODULE_KEYS.desviosPnr, getPnrFilesForView(records));
  }
  const pnrFiles = getPnrFilesForView(records);
  if (!pnrFiles.length && moduleHasConfirmedBase(DASHBOARD_MODULE_KEYS.desviosPnr)) {
    const baseState = getModuleBaseState(DASHBOARD_MODULE_KEYS.desviosPnr);
    return `${PNR_LIGHT_CACHE_VERSION}::persisted:${baseState.total || 0}:${baseState.lastCheckedAt || ""}`;
  }
  const files = pnrFiles.map((record) => {
    const metadata = record.metadata || {};
    return [
      record.id || "",
      record.file_name || "",
      record.file_size || metadata.size_bytes || "",
      record.updated_at || metadata.last_loaded_at || metadata.processed_at || "",
      metadata.file_hash || "",
      metadata.record_count || metadata.parsed_rows || metadata.consolidated_rows || "",
      metadata.competencia || record.reference_year || "",
      metadata.reference_month || record.reference_month || "",
      metadata.period_type || record.period_type || "",
    ].join(":");
  }).sort();
  return `${PNR_LIGHT_CACHE_VERSION}::${files.join("|") || "__empty"}`;
}

function buildPnrRemotePayload(records = dashboardFileRecords) {
  const filterOptions = pnrRemoteState.filterOptions || {};
  const basePayload = {
    p_file_ids: getPnrRemoteFileIds(records),
    p_month_keys: getPnrFilterSelectedValues(state.pnrMonths, pnrRemoteState.monthOptions.map((option) => option.key)),
    p_quinzenas: getPnrFilterSelectedValues(state.pnrQuinzena, ["q1", "q2"]),
    p_statuses: getPnrFilterSelectedValues(state.pnrStatus, filterOptions.statuses),
    p_tipos: [],
    p_estacoes: getPnrFilterSelectedValues(state.pnrEstacao, filterOptions.estacoes),
    p_status_motoristas: [],
    p_fontes: [],
    p_motoristas: [],
    p_rotas: [],
    p_search: String(state.pnrQuery || "").trim(),
  };
  return {
    ...basePayload,
    p_page: Math.max(1, Number(state.page || 1)),
    p_page_size: Math.min(100, Math.max(10, Number(state.pageSize || 15))),
    p_sort_key: String(state.sortKey || ""),
    p_sort_dir: state.sortDir === "asc" ? "asc" : "desc",
  };
}

function buildPnrSummaryPayload(records = dashboardFileRecords) {
  const payload = buildPnrRemotePayload(records);
  const {
    p_page,
    p_page_size,
    p_sort_key,
    p_sort_dir,
    ...summaryPayload
  } = payload;
  return summaryPayload;
}

function buildPnrTablePayload(records = dashboardFileRecords) {
  return buildPnrRemotePayload(records);
}

function getPnrRemoteKey(records = dashboardFileRecords, mode = "table") {
  const payload = mode === "summary" ? buildPnrSummaryPayload(records) : buildPnrTablePayload(records);
  return JSON.stringify({ signature: buildPnrCacheSignature(records), payload });
}

function readPnrLightCache() {
  const central = window.dashboardCacheService?.get?.(DASHBOARD_MODULE_KEYS.desviosPnr);
  if (central) return central;
  try {
    const cache = JSON.parse(window.localStorage.getItem(PNR_LIGHT_CACHE_KEY) || "null");
    return cache?.version === PNR_LIGHT_CACHE_VERSION ? cache : null;
  } catch (error) {
    return null;
  }
}

function writePnrLightCache(cache) {
  if (window.dashboardCacheService?.set) {
    window.dashboardCacheService.set(DASHBOARD_MODULE_KEYS.desviosPnr, cache);
    return;
  }
  try {
    window.localStorage.setItem(PNR_LIGHT_CACHE_KEY, JSON.stringify({
      ...cache,
      version: PNR_LIGHT_CACHE_VERSION,
      savedAt: new Date().toISOString(),
    }));
  } catch (error) {
    // localStorage can be unavailable in restrictive browser modes.
  }
}

function clearPnrPostImportLocalState() {
  window.dashboardCacheService?.invalidate?.(DASHBOARD_MODULE_KEYS.desviosPnr, "pnr-post-import");
  try {
    window.localStorage.removeItem(PNR_LIGHT_CACHE_KEY);
    const patterns = [
      /desvios[_-]?pnr/i,
      /no[_-]?files/i,
      /empty[_-]?state/i,
      /no[_-]?base/i,
      /base[_-]?missing/i,
      /uploaded[_-]?files[_-]?empty/i,
      /dashboard[_-]?files[_-]?empty/i,
    ];
    const removeMatching = (storage) => {
      const keys = [];
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (key && patterns.some((pattern) => pattern.test(key))) keys.push(key);
      }
      keys.forEach((key) => storage.removeItem(key));
    };
    removeMatching(window.localStorage);
    removeMatching(window.sessionStorage);
  } catch (error) {
    console.warn("[PNR Post Import Refresh] Não foi possível limpar cache local antigo.", error);
  }
}

function applyPnrLightCacheIfAvailable(signature) {
  const cache = readPnrLightCache();
  if (!cache || cache.signature !== signature || !cache.summary) return false;
  pnrRemoteState.source = "local-cache";
  pnrRemoteState.summary = cache.summary;
  pnrRemoteState.statusRows = Array.isArray(cache.statusRows) ? cache.statusRows : [];
  pnrRemoteState.operationRows = Array.isArray(cache.operationRows) ? cache.operationRows : [];
  pnrRemoteState.stationRows = Array.isArray(cache.stationRows) ? cache.stationRows : [];
  pnrRemoteState.driverRows = Array.isArray(cache.driverRows) ? cache.driverRows : [];
  pnrRemoteState.evolutionRows = Array.isArray(cache.evolutionRows) ? cache.evolutionRows : [];
  pnrRemoteState.monthOptions = Array.isArray(cache.monthOptions) ? cache.monthOptions : [];
  pnrRemoteState.filterOptions = cache.filterOptions || pnrRemoteState.filterOptions;
  pnrRemoteState.rows = [];
  pnrRemoteState.total = Number(cache.total || cache.summary.count || 0);
  pnrRemoteState.lastProcessedAt = cache.lastUpdatedAt || cache.savedAt || "";
  pnrRemoteState.cacheMeta = cache;
  return true;
}

function normalizePnrRemoteOptionList(values) {
  return (Array.isArray(values) ? values : [])
    .map((item) => (typeof item === "string" ? item : item?.value || item?.label || ""))
    .map(String)
    .map((item) => item.trim())
    .filter(Boolean);
}

function applyPnrRemoteTable(payload) {
  pnrRemoteState.source = "remote";
  pnrRemoteState.rows = (Array.isArray(payload?.rows) ? payload.rows : [])
    .map((record) => mapProcessedPnrRecord(record, { file_name: record?.source_file_name || "" }))
    .filter(Boolean);
  pnrRemoteState.total = Number(payload?.total || pnrRemoteState.summary?.count || 0);
  pnrRemoteState.lastProcessedAt = payload?.cachedAt || payload?.processedAt || pnrRemoteState.lastProcessedAt || new Date().toISOString();
}

function applyPnrRemoteSummary(payload) {
  const summary = payload?.summary || {};
  const options = payload?.filterOptions || payload?.filter_options || {};
  pnrRemoteState.source = "remote";
  pnrRemoteState.total = Number(payload?.total || summary.count || 0);
  pnrRemoteState.summary = {
    count: Number(summary.count || 0),
    totalValue: Number(summary.totalValue ?? summary.total_value ?? 0),
    avgValue: Number(summary.avgValue ?? summary.avg_value ?? 0),
    anulado: Number(summary.anulado || 0),
    faturamento: Number(summary.faturamento || 0),
    aberto: Number(summary.aberto || 0),
    valorFaturado: Number(summary.valorFaturado ?? summary.valor_faturado ?? summary.faturadoValue ?? summary.faturado_value ?? 0),
    valorAnulado: Number(summary.valorAnulado ?? summary.valor_anulado ?? summary.anuladoValue ?? summary.anulado_value ?? 0),
    valorAberto: Number(summary.valorAberto ?? summary.valor_aberto ?? summary.valorEmAbertoAnalise ?? summary.valor_em_aberto_analise ?? 0),
    ticketMedioGeral: Number(summary.ticketMedioGeral ?? summary.ticket_medio_geral ?? summary.avgValue ?? summary.avg_value ?? 0),
    ticketMedioFaturado: Number(summary.ticketMedioFaturado ?? summary.ticket_medio_faturado ?? 0),
    ticketMedioAnulado: Number(summary.ticketMedioAnulado ?? summary.ticket_medio_anulado ?? 0),
  };
  pnrRemoteState.statusRows = Array.isArray(payload?.statusRows || payload?.status_rows) ? (payload.statusRows || payload.status_rows) : [];
  pnrRemoteState.operationRows = Array.isArray(payload?.operationRows || payload?.operation_rows) ? (payload.operationRows || payload.operation_rows) : [];
  pnrRemoteState.stationRows = Array.isArray(payload?.stationRows || payload?.station_rows) ? (payload.stationRows || payload.station_rows) : [];
  pnrRemoteState.driverRows = Array.isArray(payload?.driverRows || payload?.driver_rows) ? (payload.driverRows || payload.driver_rows) : [];
  pnrRemoteState.evolutionRows = Array.isArray(payload?.evolutionRows || payload?.evolution_rows) ? (payload.evolutionRows || payload.evolution_rows) : [];
  pnrRemoteState.monthOptions = (Array.isArray(payload?.monthOptions || payload?.month_options) ? (payload.monthOptions || payload.month_options) : [])
    .map((option) => ({
      key: String(option.key || ""),
      label: String(option.label || option.key || ""),
      year: Number(option.year || 0),
      month: Number(option.month || 0),
    }))
    .filter((option) => option.key);
  pnrRemoteState.filterOptions = {
    statuses: normalizePnrRemoteOptionList(options.statuses),
    tipos: normalizePnrRemoteOptionList(options.tipos),
    estacoes: normalizePnrRemoteOptionList(options.estacoes),
    statusMotoristas: normalizePnrRemoteOptionList(options.statusMotoristas || options.status_motoristas),
    fontesCruzamento: normalizePnrRemoteOptionList(options.fontesCruzamento || options.fontes_cruzamento),
    motoristas: normalizePnrRemoteOptionList(options.motoristas),
    rotas: normalizePnrRemoteOptionList(options.rotas),
  };
  pnrRemoteState.lastProcessedAt = payload?.cachedAt || payload?.processedAt || new Date().toISOString();
  pnrRemoteState.cacheMeta = readPnrLightCache();
}

function applyPnrRemoteDashboard(payload) {
  applyPnrRemoteSummary(payload);
  applyPnrRemoteTable(payload);
}

function setPnrRemoteLoading(value) {
  pnrRemoteState.loadingSummary = value;
  pnrRemoteState.loadingCharts = value;
  pnrRemoteState.loadingTable = value;
  pnrRemoteState.processingStatus = value ? "Processando dados de PNRs em segundo plano..." : "";
}

async function refreshPnrRemoteDashboard(options = {}) {
  if (state.appView !== "dashboard" || state.sheet !== DEVIATION_MANAGEMENT_VIEW || state.activeDesvioCategory !== DEVIATION_CATEGORY_PNRS) return;
  const moduleKey = DASHBOARD_MODULE_KEYS.desviosPnr;
  if (!window.supabaseClient) {
    resetPnrRemoteState();
    return;
  }
  const hasFileScope = getPnrRemoteFileIds().length > 0;
  if (!hasFileScope && !moduleHasConfirmedBase(moduleKey)) {
    const baseState = await checkModulePersistedData(moduleKey, { reason: options.reason || "pnr-rpc" });
    if (Number(baseState.total || 0) <= 0) {
      if (baseState.status === MODULE_BASE_STATUS.empty) resetPnrRemoteState();
      return;
    }
  }
  const summaryKey = getPnrRemoteKey(dashboardFileRecords, "summary");
  const tableKey = getPnrRemoteKey(dashboardFileRecords, "table");
  const tableOnly = ["page", "pageSize", "sort"].includes(options.reason) && pnrRemoteState.summary;
  const shouldLoadSummary = options.force === true || !tableOnly || pnrRemoteState.summaryKey !== summaryKey;
  const shouldLoadTable = options.force === true || pnrRemoteState.tableKey !== tableKey || !pnrRemoteState.rows.length;
  if (!shouldLoadSummary && !shouldLoadTable && pnrRemoteState.source === "remote") return;
  const requestId = ++pnrRemoteRequestId;
  pnrRemoteState.key = tableKey;
  pnrRemoteState.cacheSignature = summaryKey;
  pnrRemoteState.error = "";
  if (shouldLoadSummary && options.force !== true && applyPnrLightCacheIfAvailable(summaryKey)) {
    pnrRemoteState.summaryKey = summaryKey;
    window.dashboardCacheService?.log?.(moduleKey, "origem dos dados: cache local", { signature: summaryKey });
    hydrateControls();
    renderAll();
  }
  pnrRemoteState.loadingSummary = shouldLoadSummary;
  pnrRemoteState.loadingCharts = shouldLoadSummary;
  pnrRemoteState.loadingTable = shouldLoadTable;
  pnrRemoteState.processingStatus = (shouldLoadSummary || shouldLoadTable) ? "Processando dados de PNRs em segundo plano..." : "";
  moduleLoadingState[moduleKey] = true;
  renderPnrRemoteLoadingOnly();
  try {
    if (shouldLoadSummary) {
      const summaryPayload = buildPnrSummaryPayload();
      window.dashboardCacheService?.log?.(moduleKey, "origem dos dados: Supabase RPC resumo", { rpc: PNR_SUMMARY_RPC, payload: summaryPayload });
      const start = performance.now();
      const { data, error } = await withTimeout(
        window.supabaseClient.rpc(PNR_SUMMARY_RPC, summaryPayload),
        SUPABASE_QUERY_TIMEOUT_MS,
        "Tempo limite excedido ao consultar resumo de PNRs.",
      );
      if (requestId !== pnrRemoteRequestId) return;
      if (error) throw error;
      window.dashboardCacheService?.log?.(moduleKey, "resumo RPC recebido", {
        ms: Math.round(performance.now() - start),
        total: data?.total || 0,
      });
      applyPnrRemoteSummary(data || {});
      pnrRemoteState.summaryKey = summaryKey;
      pnrRemoteState.loadingSummary = false;
      pnrRemoteState.loadingCharts = false;
      hydrateControls();
      renderAll();
    }
    if (shouldLoadTable) {
      const tablePayload = buildPnrTablePayload();
      window.dashboardCacheService?.log?.(moduleKey, "origem dos dados: Supabase RPC tabela", { rpc: PNR_TABLE_RPC, payload: tablePayload });
      const start = performance.now();
      const { data, error } = await withTimeout(
        window.supabaseClient.rpc(PNR_TABLE_RPC, tablePayload),
        SUPABASE_QUERY_TIMEOUT_MS,
        "Tempo limite excedido ao consultar tabela de PNRs.",
      );
      if (requestId !== pnrRemoteRequestId) return;
      if (error) throw error;
      window.dashboardCacheService?.log?.(moduleKey, "tabela RPC recebida", {
        ms: Math.round(performance.now() - start),
        rows: Array.isArray(data?.rows) ? data.rows.length : 0,
        total: data?.total || 0,
      });
      applyPnrRemoteTable(data || {});
      pnrRemoteState.tableKey = tableKey;
    }
    pnrRemoteState.source = "remote";
    const lightCache = {
      signature: summaryKey,
      status: "loaded",
      lastUpdatedAt: new Date().toISOString(),
      total: pnrRemoteState.total,
      filters: {
        months: state.pnrMonths,
        quinzena: state.pnrQuinzena,
        status: state.pnrStatus,
        estacao: state.pnrEstacao,
      },
      competencia: pnrRemoteState.monthOptions.map((option) => option.label).filter(Boolean).join(", "),
      summary: pnrRemoteState.summary,
      statusRows: pnrRemoteState.statusRows,
      operationRows: pnrRemoteState.operationRows,
      stationRows: pnrRemoteState.stationRows,
      driverRows: pnrRemoteState.driverRows,
      evolutionRows: pnrRemoteState.evolutionRows,
      monthOptions: pnrRemoteState.monthOptions,
      filterOptions: pnrRemoteState.filterOptions,
    };
    pnrRemoteState.cacheMeta = lightCache;
    pnrRemoteState.lastProcessedAt = lightCache.lastUpdatedAt;
    writePnrLightCache(lightCache);
  } catch (error) {
    if (requestId !== pnrRemoteRequestId) return;
    console.error("[PNRS] Falha ao carregar dados paginados/agregados:", error);
    console.error("[Gestão Desvios PNR] Erro completo:", error);
    pnrRemoteState.error = error?.message || "Não foi possível consultar PNRs processados.";
    pnrRemoteState.source = pnrRemoteState.source === "local-cache" ? "local-cache" : "";
    pnrRemoteState.cacheMeta = readPnrLightCache();
  } finally {
    if (requestId === pnrRemoteRequestId) {
      moduleLoadingState[moduleKey] = false;
      setPnrRemoteLoading(false);
      hydrateControls();
      renderAll();
    }
  }
}

function schedulePnrRemoteRefresh(options = {}) {
  window.clearTimeout(pnrRemoteDebounceTimer);
  pnrRemoteDebounceTimer = window.setTimeout(() => {
    void refreshPnrRemoteDashboard({ force: options.force === true, reason: options.reason || "" });
  }, options.immediate ? 0 : PNR_REMOTE_QUERY_DEBOUNCE_MS);
}

async function loadPnrRowsForView(records, cachedDatasets = new Map()) {
  const files = getPnrFilesForView(records);
  const loadKey = getPnrFilesLoadKey(records);
  if (pnrRowsLoadedKey === loadKey) {
    return (Array.isArray(library.datasets) ? library.datasets : []).filter((dataset) => dataset?.fileCategory === DEVIATION_PNR_FILE_CATEGORY);
  }
  const datasets = files.map((fileRecord) => normalizeDatasetRecord({
    id: fileRecord.id,
    fileName: fileRecord.file_name,
    label: getDashboardFileDisplayName(fileRecord),
    source: "supabase",
    importedAt: fileRecord.created_at,
    remoteRecord: fileRecord,
    storagePath: fileRecord.storage_path,
    fileCategory: DEVIATION_PNR_FILE_CATEGORY,
    rows: [],
  })).filter(Boolean);
  isLoadingPnrRows = true;
  try {
    pnrRows = [];
    pnrRowsLoadedKey = loadKey;
    resetDerivedDataCache();
    schedulePnrRemoteRefresh({ immediate: true, force: true });
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
  moduleLoadingState[DASHBOARD_MODULE_KEYS.preFatura] = true;
  dashboardFilesLoading = shouldShowLoading;
  if (shouldShowLoading && !hasLoadedDashboardData()) setDashboardVisualState("loading-files", { render: shouldRender });
  window.dashboardCacheService?.log?.(DASHBOARD_MODULE_KEYS.preFatura, "início da carga", {
    showLoading: shouldShowLoading,
    hasData: hasLoadedDashboardData(),
  });
  updateDatasetMeta();
  try {
    const files = Array.isArray(options.files) ? options.files : await loadDashboardFilesFromSupabase({ loadActive: false, render: false, validateStorage: false, showLoading: false });
    await hydrateDashboardFileMetadata(files);
    dashboardFileRecords = files.filter(isUsableDashboardFileRecord).filter(isDashboardFileActive);
    if (!dashboardFileRecords.length) {
      const baseState = await checkModulePersistedData(DASHBOARD_MODULE_KEYS.preFatura, { reason: "prefatura-load" });
      const fallbackDataset = Number(baseState.total || 0) > 0
        ? await loadPersistedDatasetForModule(DASHBOARD_MODULE_KEYS.preFatura, PRE_FATURA_FILE_CATEGORY)
        : null;
      if (fallbackDataset?.rows?.length) {
        replaceDashboardData(fallbackDataset.rows, {
          selectedFiles: [],
          selectedDatasets: [fallbackDataset],
          allHistoricalDatasets: [fallbackDataset],
          selectedMonth: "all",
          selectedPeriod: state.prefaturaPeriod || state.period,
          fileCategory: PRE_FATURA_FILE_CATEGORY,
        });
        setDashboardVisualState("", { render: false });
        return;
      }
      dashboardFilesLoading = false;
      setDashboardVisualState(baseState.status === MODULE_BASE_STATUS.error ? "supabase-error" : "", { render: false, error: baseState.error ? new Error(baseState.error) : undefined });
      clearDashboardData({ render: shouldRender, preserveRecords: !moduleIsConfirmedEmpty(DASHBOARD_MODULE_KEYS.preFatura) });
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
    const packageDatasets = library.datasets.filter((dataset) => dataset?.source !== "filtered" && dataset?.fileCategory === PACKAGE_MANAGEMENT_FILE_CATEGORY);
    const pnrDatasets = library.datasets.filter((dataset) => dataset?.source !== "filtered" && dataset?.fileCategory === DEVIATION_PNR_FILE_CATEGORY);
    void Promise.allSettled([
      loadPackageManagementRowsForCards(dashboardFileRecords, cachedDatasets),
      shouldLoadPnrRowsForCurrentView(dashboardFileRecords)
        ? loadPnrRowsForView(dashboardFileRecords, cachedDatasets)
        : Promise.resolve(pnrDatasets),
    ]).then((results) => {
      results.forEach((result, index) => {
        if (result.status === "rejected") {
          console.error(index === 0 ? "[Gestão de Pacotes] Falha na carga em segundo plano:" : "[Gestão Desvios PNR] Falha na carga em segundo plano:", result.reason);
        }
      });
    });
    const currentFileCategory = PRE_FATURA_FILE_CATEGORY;
    const categoryFiles = dashboardFileRecords.filter((record) => getFileRecordCategory(record) === currentFileCategory);
    if (!categoryFiles.length) {
      const baseState = await checkModulePersistedData(DASHBOARD_MODULE_KEYS.preFatura, { reason: "prefatura-category-load" });
      const fallbackDataset = Number(baseState.total || 0) > 0
        ? await loadPersistedDatasetForModule(DASHBOARD_MODULE_KEYS.preFatura, PRE_FATURA_FILE_CATEGORY)
        : null;
      if (fallbackDataset?.rows?.length) {
        replaceDashboardData(fallbackDataset.rows, {
          selectedFiles: [],
          selectedDatasets: [fallbackDataset],
          allHistoricalDatasets: [fallbackDataset, ...packageDatasets, ...pnrDatasets],
          selectedMonth: "all",
          selectedPeriod: state.prefaturaPeriod || state.period,
          fileCategory: PRE_FATURA_FILE_CATEGORY,
        });
        setDashboardVisualState("", { render: false });
        return;
      }
      dashboardFilesLoading = false;
      setDashboardVisualState(baseState.status === MODULE_BASE_STATUS.error ? "supabase-error" : "", { render: false, error: baseState.error ? new Error(baseState.error) : undefined });
      clearDashboardData({ render: shouldRender, preserveRecords: !moduleIsConfirmedEmpty(DASHBOARD_MODULE_KEYS.preFatura) });
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
    if (!hasLoadedDashboardData()) setDashboardVisualState("supabase-error", { render: false, error });
  } finally {
    moduleLoadingState[DASHBOARD_MODULE_KEYS.preFatura] = false;
    dashboardFilesLoading = false;
    isLoadingDashboardData = false;
    if (shouldShowLoading && dashboardVisualState === "loading-files") setDashboardVisualState("", { render: false });
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
  const iso = parsed.iso || "";
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  const isValid =
    date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() === Number(month) - 1 &&
    date.getUTCDate() === Number(day);
  if (!isValid || Number(year) < 1901) return null;
  return iso;
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
      file_category: PRE_FATURA_FILE_CATEGORY,
      arquivo_origem: row.arquivo_origem || fileRecord.file_name,
      competencia: getFileCompetencia(fileRecord, row),
      quinzena: getFileQuinzena(fileRecord, row),
      tipo_desconto: row.tipo_desconto || row.tipo_registro || "",
      tipo_registro: row.tipo_registro || "",
      cidade_base: row.cidade_base || "",
      sigla_base: row.sigla_base || "",
      descricao: row.descricao || "",
      ids_vinculados: Array.isArray(row.ids_vinculados) ? row.ids_vinculados : [],
      quantidade_ids: Number(row.quantidade_ids || 0),
      linked_ids_count: Number(row.linked_ids_count || row.quantidade_ids || 0),
      ocorrencias: Number(row.ocorrencias || 1),
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
      file_category: PACKAGE_MANAGEMENT_FILE_CATEGORY,
      arquivo_origem: row.arquivo_origem || fileRecord.file_name,
      competencia: getFileCompetencia(fileRecord, row),
      quinzena: getFileQuinzena(fileRecord, row),
      categoria_label: row.categoria_label || PACKAGE_CATEGORY_LABELS[category] || "",
      tipo_desconto: row.tipo_desconto || PACKAGE_CATEGORY_LABELS[category] || "",
      aba_gestao: row.aba_gestao || "",
      aba_gestao_label: row.aba_gestao_label || "",
      id_caso: row.id_caso || "",
      id_pacote: row.id_pacote || row.id_caso || "",
      evidencia_1: row.evidencia_1 || "",
      evidencia_2: row.evidencia_2 || "",
      canal: row.canal || "",
      ocorrencias: Number(row.ocorrencias || 1),
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
    source_file_type: row.sourceFileType || row.source_file_type || getPnrSourceFileTypeForFileRecord(fileRecord),
    source_period: row.sourcePeriodo || row.periodoFaturamentoOriginal || row.periodoFaturamento || "",
    source_periodo: row.sourcePeriodo || row.periodoFaturamentoOriginal || row.periodoFaturamento || "",
    source_quinzena: row.quinzenaRef || row.quinzena || "",
    upload_batch_id: fileRecord.id,
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
    tipo_ocorrencia: "PNR",
    tipo_base: row.tipoBase || row.tipoOperacional || "",
    base_identificada: row.baseIdentificada || "",
    nome_base_operacao: row.nomeBaseOperacao || "",
    tipo_operacional: row.tipoOperacional || "",
    id_rota: row.idRota || "",
    id_motorista: row.idMotorista || "",
    nome_motorista: row.nomeMotorista || "",
    motorista_display: row.motoristaDisplay || "",
    status_motorista: row.statusMotorista || "",
    fonte_cruzamento: row.fonteCruzamento || "",
    observacao_cruzamento: row.observacaoCruzamento || "",
    motorista_match_source: row.motoristaMatchSource || "",
    data_caso: toDatabaseDate(row.dataCaso),
    data_entrega: toDatabaseDate(row.dataEntrega),
    id_reclamacao: row.idReclamacao || "",
    data_reclamacao: toDatabaseDate(row.dataReclamacao),
    first_seen_at: null,
    last_seen_at: null,
    status_previous: "",
    status_current: row.statusNormalizado || row.statusOriginal || "",
    status_updated_at: null,
    raw_data: {},
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
    tipoOcorrencia: record.tipo_ocorrencia || raw.tipoOcorrencia,
    tipoBase: record.tipo_base || raw.tipoBase,
    tipoOperacional: record.tipo_base || record.tipo_operacional || raw.tipoBase || raw.tipoOperacional,
    baseIdentificada: record.base_identificada || raw.baseIdentificada,
    nomeBaseOperacao: record.nome_base_operacao || raw.nomeBaseOperacao,
    idRota: record.id_rota || raw.idRota,
    idMotorista: record.id_motorista || raw.idMotorista,
    nomeMotorista: record.nome_motorista || raw.nomeMotorista || raw.nome_motorista,
    motoristaDisplay: record.motorista_display || raw.motoristaDisplay || raw.motorista_display,
    statusMotorista: record.status_motorista || raw.statusMotorista || raw.status_motorista,
    fonteCruzamento: record.fonte_cruzamento || raw.fonteCruzamento || raw.fonte_cruzamento,
    observacaoCruzamento: record.observacao_cruzamento || raw.observacaoCruzamento || raw.observacao_cruzamento,
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

async function fetchAllProcessedRowsFromTable(tableName) {
  const rows = [];
  for (let from = 0; ; from += PROCESSED_RECORDS_PAGE_SIZE) {
    const to = from + PROCESSED_RECORDS_PAGE_SIZE - 1;
    const { data, error } = await window.supabaseClient
      .from(tableName)
      .select("*")
      .range(from, to);

    if (error) throw error;
    const page = Array.isArray(data) ? data : [];
    rows.push(...page);
    if (page.length < PROCESSED_RECORDS_PAGE_SIZE) break;
  }
  return rows;
}

async function loadPersistedDatasetForModule(moduleKey, fileCategory) {
  if (!window.supabaseClient || moduleKey === DASHBOARD_MODULE_KEYS.desviosPnr) return null;
  const tableName = getModulePersistedTableName(moduleKey);
  if (!tableName) return null;
  const processedRows = await fetchAllProcessedRowsFromTable(tableName);
  if (!processedRows.length) return null;
  const fallbackName = DASHBOARD_MODULE_LABELS[moduleKey] || "Base persistida";
  const rows = processedRows
    .map((record) => {
      const raw = record.raw_data || {};
      const fileRecord = {
        id: record.file_id || `persisted-${moduleKey}`,
        file_name: record.source_file_name || raw.arquivo_origem || fallbackName,
        file_type: fileCategory,
        metadata: {
          file_category: fileCategory,
          semantic_file_type: fileCategory,
          raw_file_deleted: true,
        },
      };
      return mapProcessedRecordToRow(record, fileRecord, fileCategory);
    })
    .filter(Boolean);
  if (!rows.length) return null;
  console.info("[Painel Cache] Dados carregados direto da tabela persistida", { moduleKey, tableName, rows: rows.length });
  return normalizeDatasetRecord({
    id: `persisted-${moduleKey}`,
    fileName: fallbackName,
    label: fallbackName,
    source: "supabase",
    importedAt: new Date().toISOString(),
    remoteRecord: null,
    storagePath: "",
    fileCategory,
    rows,
  });
}

function isMissingProcessedRecordsTableError(error) {
  const text = `${error?.code || ""} ${error?.message || ""} ${error?.details || ""}`;
  return /42P01|PGRST204|PGRST205|does not exist|schema cache|Could not find the table|Could not find .* column/i.test(text);
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
  const fullSelect = "id,file_id,dedupe_key,status_normalizado,status_current,periodo_faturamento,periodo_faturamento_original,source_period,source_periodo,source_quinzena,quinzena_ref,month_key,quinzena_key,data_encerramento_caso,data_caso,first_seen_at,last_seen_at,status_updated_at,created_at";
  const fallbackSelect = "id,file_id,dedupe_key,status_normalizado,periodo_faturamento,periodo_faturamento_original,source_periodo,quinzena_ref,month_key,quinzena_key,data_encerramento_caso,data_caso,created_at";
  for (let index = 0; index < uniqueKeys.length; index += PNR_PROCESSED_RECORDS_BATCH_SIZE) {
    const batch = uniqueKeys.slice(index, index + PNR_PROCESSED_RECORDS_BATCH_SIZE);
    let { data, error } = await window.supabaseClient
      .from(tableName)
      .select(fullSelect)
      .in("dedupe_key", batch);
    if (error && /source_file_type|source_period|source_quinzena|first_seen_at|last_seen_at|status_previous|status_current|status_updated_at|upload_batch_id|PGRST204|schema cache|Could not find/i.test(`${error.code || ""} ${error.message || ""} ${error.details || ""}`)) {
      ({ data, error } = await window.supabaseClient
        .from(tableName)
        .select(fallbackSelect)
        .in("dedupe_key", batch));
    }
    if (error) {
      console.error("[PNR Import] Falha ao buscar dedupe existente", { index, size: batch.length, error });
      throw error;
    }
    (Array.isArray(data) ? data : []).forEach((record) => {
      if (record?.dedupe_key) existing.set(record.dedupe_key, record);
    });
  }
  return existing;
}

async function refreshPnrMetricsSummaryForFiles(fileIds = []) {
  if (!window.supabaseClient) return;
  const ids = [...new Set((Array.isArray(fileIds) ? fileIds : [fileIds]).filter(Boolean))];
  const start = performance.now();
  const { data, error } = await withTimeout(
    window.supabaseClient.rpc(PNR_METRICS_REFRESH_RPC, { p_file_ids: ids }),
    SUPABASE_QUERY_TIMEOUT_MS,
    "Tempo limite excedido ao atualizar agregados de PNRs.",
  );
  if (error) throw error;
  console.info("[Gestão Desvios PNR] agregados atualizados", {
    fileIds: ids,
    scope: ids.length ? "affected-files" : "all",
    groups: Number(data || 0),
    ms: Math.round(performance.now() - start),
  });
}

async function refreshPnrMetricsSummaryForFile(fileId) {
  return refreshPnrMetricsSummaryForFiles([fileId]);
}

function getPnrSourceFileTypeForFileRecord(fileRecord = {}) {
  const metadata = fileRecord.metadata || {};
  const role = metadata.file_role || metadata.pnr_file_role || fileRecord.file_role || getPnrFileRole(fileRecord.file_name || metadata.original_name || "");
  return role === "master" ? "master" : "quinzena";
}

function preparePnrConsolidatedRecord(record, fileRecord, uploadTimestamp) {
  const statusCurrent = record.status_normalizado || record.status_current || record.status_original || "";
  return {
    ...record,
    dedupe_key: record.dedupe_key || getPnrDedupeKey(record.raw_data || record),
    source_file_name: record.source_file_name || fileRecord.file_name || "",
    source_file_type: record.source_file_type || getPnrSourceFileTypeForFileRecord(fileRecord),
    source_period: record.source_period || record.source_periodo || record.periodo_faturamento || "",
    source_quinzena: record.source_quinzena || record.quinzena_ref || record.quinzena || "",
    upload_batch_id: fileRecord.id,
    last_seen_at: uploadTimestamp,
    status_current: statusCurrent,
    status_updated_at: uploadTimestamp,
  };
}

async function savePnrProcessedRowsForFile(fileRecord, tableName, payload) {
  const uploadTimestamp = new Date().toISOString();
  const rows = (Array.isArray(payload) ? payload : [])
    .map((record) => preparePnrConsolidatedRecord(record, fileRecord, uploadTimestamp))
    .filter((record) => record.dedupe_key);
  await window.supabaseClient.from(tableName).delete().eq("file_id", fileRecord.id);
  const existingByKey = await fetchExistingPnrRecordsByDedupeKey(tableName, rows.map((record) => record.dedupe_key));
  const updates = [];
  const inserts = [];
  const ignoredOlder = [];
  const affectedFileIds = new Set([fileRecord.id]);
  rows.forEach((record) => {
    const existing = existingByKey.get(record.dedupe_key);
    if (!existing) {
      inserts.push({ ...record, first_seen_at: uploadTimestamp });
      return;
    }
    if (existing.file_id) affectedFileIds.add(existing.file_id);
    const isIncomingNewer = comparePnrRecordFreshness(record, existing) >= 0;
    if (isIncomingNewer) {
      updates.push({
        ...record,
        id: existing.id,
        first_seen_at: existing.first_seen_at || existing.created_at || uploadTimestamp,
        status_previous: existing.status_current || existing.status_normalizado || "",
      });
    } else {
      ignoredOlder.push(record);
    }
  });

  for (let index = 0; index < updates.length; index += PNR_PROCESSED_RECORDS_BATCH_SIZE) {
    const batch = updates.slice(index, index + PNR_PROCESSED_RECORDS_BATCH_SIZE);
    const { error } = await window.supabaseClient.from(tableName).upsert(batch, { onConflict: "id" });
    if (error) {
      console.error("[PNR Import] Falha no batch de atualização", { index, size: batch.length, error });
      throw error;
    }
  }
  for (let index = 0; index < inserts.length; index += PNR_PROCESSED_RECORDS_BATCH_SIZE) {
    const batch = inserts.slice(index, index + PNR_PROCESSED_RECORDS_BATCH_SIZE);
    const { error } = await window.supabaseClient.from(tableName).insert(batch);
    if (error) {
      console.error("[PNR Import] Falha no batch de inserção", { index, size: batch.length, error });
      throw error;
    }
  }

  const stats = getWorkbookStatsForCategory(DEVIATION_PNR_FILE_CATEGORY);
  const ignored = Number(stats.duplicateRowsSkipped || 0) + ignoredOlder.length;
  console.info("[PNR Import] consolidação concluída", {
    fileName: fileRecord.file_name,
    fileType: getPnrSourceFileTypeForFileRecord(fileRecord),
    rowsRead: rows.length,
    inserted: inserts.length,
    updated: updates.length,
    ignoredOlder: ignoredOlder.length,
    invalidRows: Number(stats.skipped || stats.errors || 0),
  });
  await updateProcessedFileMetadata(fileRecord, rows.length, {
    records_new: inserts.length,
    records_updated: updates.length,
    duplicates_ignored: ignored,
    duplicate_rows_updated: Number(stats.duplicateRowsUpdated || 0),
    duplicate_rows_removed: Number(stats.duplicateRowsRemoved || 0),
    duplicate_rows_older_ignored: ignoredOlder.length,
    source_file_type: getPnrSourceFileTypeForFileRecord(fileRecord),
  });
  await refreshPnrMetricsSummaryForFiles([...affectedFileIds]);
  return { inserted: inserts.length, updated: updates.length, ignored, ignoredOlder: ignoredOlder.length };
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

async function loadRowsFromStorage(fileRecord, options = {}) {
  const allowStorageFallback = options.allowStorageFallback === true;
  const processedDataset = await loadProcessedDatasetForFile(fileRecord);
  if (processedDataset?.rows?.length) return processedDataset;

  if (!allowStorageFallback) {
    console.info("[Painel Cache] Base persistida ausente; Storage bruto não será relido automaticamente.", {
      fileName: fileRecord?.file_name,
      fileType: getFileRecordCategory(fileRecord),
      status: fileRecord?.status,
    });
    return null;
  }

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
  const moduleKey = fileCategory === PACKAGE_MANAGEMENT_FILE_CATEGORY
    ? DASHBOARD_MODULE_KEYS.pacotes
    : DASHBOARD_MODULE_KEYS.preFatura;
  window.dashboardCacheService?.set?.(moduleKey, {
    status: "loaded",
    signature: window.dashboardCacheService?.buildFilesSignature?.(moduleKey, selectedFiles) || "",
    total: consolidatedRows.length,
    lastCompetencia: label,
    filters: {
      month: context.selectedMonth || "all",
      period: context.selectedPeriod || "month",
      tipo: state.tipo,
    },
    summary: {
      rowCount: consolidatedRows.length,
      filesCount: selectedFiles.length,
    },
  });
}

async function updateDashboardFileParsedRows(fileRecord, parsedRows, stats = {}) {
  const fileCategory = getFileRecordCategory(fileRecord);
  const packagePeriod = fileCategory === PACKAGE_MANAGEMENT_FILE_CATEGORY
    ? identificarPeriodoGestaoPacotes(fileRecord.file_name)
    : null;
  const pnrFileRole = fileCategory === DEVIATION_PNR_FILE_CATEGORY ? getPnrFileRole(fileRecord.file_name || fileRecord.metadata?.original_name || "") : "";
  const isPnrMaster = pnrFileRole === "master";
  const metadata = {
    ...(fileRecord.metadata || {}),
    parsed_rows: parsedRows,
    original_rows: stats.originalRows || fileRecord.metadata?.original_rows || parsedRows,
    consolidated_rows: stats.consolidatedRows || parsedRows,
    duplicatesSkipped: stats.duplicatesSkipped ?? fileRecord.metadata?.duplicatesSkipped ?? 0,
    duplicate_rows_skipped: stats.duplicateRowsSkipped ?? fileRecord.metadata?.duplicate_rows_skipped ?? 0,
    duplicate_rows_updated: stats.duplicateRowsUpdated ?? fileRecord.metadata?.duplicate_rows_updated ?? 0,
    duplicate_rows_removed: stats.duplicateRowsRemoved ?? fileRecord.metadata?.duplicate_rows_removed ?? 0,
    file_role: pnrFileRole || fileRecord.metadata?.file_role || "",
    pnr_file_role: pnrFileRole || fileRecord.metadata?.pnr_file_role || "",
    pnr_master_file: isPnrMaster,
    isMasterFile: isPnrMaster,
    is_master_file: isPnrMaster,
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
    fileDisplayName: isPnrMaster ? "Base mestre" : fileRecord.metadata?.display_name || fileRecord.metadata?.original_name || fileRecord.file_name || getDashboardFileDisplayName(fileRecord),
    fileDescription: isPnrMaster ? "Histórico consolidado" : "",
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
      setDashboardVisualState("supabase-error", { render: false, error });
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
  setDashboardVisualState("loading-files", { render });
  updateDatasetMeta();
  let dataset = skipDownloadDataset;
  try {
    if (!dataset) {
      dataset = await loadProcessedDatasetForFile(fileRecord);
    }
    if (!dataset && options.allowStorageFallback !== true) {
      const fileCategory = getFileRecordCategory(fileRecord);
      const moduleKey = getDashboardModuleKeyForFileCategory(fileCategory);
      const baseState = await checkModulePersistedData(moduleKey, { reason: "file-load-no-dataset" });
      console.info("[Painel Cache] Arquivo bruto não será relido do Storage; base validada pela tabela persistida.", {
        fileName: fileRecord.file_name,
        fileType: fileCategory,
        totalPersisted: baseState.total,
        state: baseState.status,
      });
      dashboardFilesLoading = false;
      setDashboardVisualState(baseState.status === MODULE_BASE_STATUS.error ? "supabase-error" : "", { render: false, error: baseState.error ? new Error(baseState.error) : undefined });
      clearDashboardData({ render, preserveRecords: !moduleIsConfirmedEmpty(moduleKey) });
      if (!silent && moduleIsConfirmedEmpty(moduleKey)) showToast("Base ainda não importada. Envie um arquivo XLSX ou CSV para alimentar este módulo.", "info", 6200);
      return;
    }
    if (!dataset && options.allowStorageFallback === true) {
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
    setDashboardVisualState("supabase-error", { render: false, error });
    clearDashboardData({ render });
  } finally {
    dashboardFilesLoading = false;
    if (dashboardVisualState === "loading-files") setDashboardVisualState("", { render: false });
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

function getDashboardFileModuleKey(record = {}) {
  return getDashboardModuleKeyForFileCategory(getFileRecordCategory(record));
}

function getDashboardFileHash(record = {}) {
  return record?.metadata?.file_hash || record?.file_hash || "";
}

function getProcessedDashboardFileId(record = {}) {
  return record?.metadata?.processed_dashboard_file_id || record?.processed_dashboard_file_id || "";
}

function getDashboardFileIdsForRecord(record = {}) {
  return [...new Set([
    record?.id,
    record?.metadata?.dashboard_file_id,
    record?.metadata?.file_id,
  ].filter((id) => id && !String(id).startsWith("processed:")))];
}

function isSyntheticOrDeletedRawFile(record = {}) {
  const storagePath = String(record.storage_path || record.metadata?.storage_path || "");
  return record.metadata?.raw_file_deleted === true ||
    record.raw_file_deleted === true ||
    storagePath.startsWith(`${PROCESSED_ONLY_STORAGE_PREFIX}/`) ||
    !storagePath;
}

async function getProcessedDashboardFileMatches(record = {}) {
  if (!window.supabaseClient) return [];
  const moduleKey = getDashboardFileModuleKey(record);
  const aliases = getProcessedDashboardModuleKeyAliases(moduleKey);
  const fileHash = getDashboardFileHash(record);
  const processedId = getProcessedDashboardFileId(record);
  const dashboardIds = getDashboardFileIdsForRecord(record);
  const matches = new Map();
  const addRows = (rows) => {
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      if (row?.id) matches.set(row.id, row);
    });
  };

  const run = async (query, label) => {
    const { data, error } = await query;
    if (error) {
      console.warn("[File Delete] Falha ao consultar processed_dashboard_files.", { label, error });
      return;
    }
    addRows(data);
  };

  if (processedId) {
    await run(
      window.supabaseClient
        .from("processed_dashboard_files")
        .select("*")
        .eq("id", processedId),
      "processed-id",
    );
  }
  if (fileHash) {
    await run(
      window.supabaseClient
        .from("processed_dashboard_files")
        .select("*")
        .in("module_key", aliases)
        .eq("file_hash", fileHash),
      "file-hash",
    );
  }
  for (const id of dashboardIds) {
    await run(
      window.supabaseClient
        .from("processed_dashboard_files")
        .select("*")
        .in("module_key", aliases)
        .contains("metadata", { dashboard_file_id: id }),
      "dashboard-file-id",
    );
    await run(
      window.supabaseClient
        .from("processed_dashboard_files")
        .select("*")
        .in("module_key", aliases)
        .contains("metadata", { file_id: id }),
      "file-id",
    );
  }
  return Array.from(matches.values());
}

async function updateProcessedDashboardFilesForListRemoval(records = []) {
  for (const record of records) {
    const matches = await getProcessedDashboardFileMatches(record);
    for (const match of matches) {
      const { error } = await window.supabaseClient
        .from("processed_dashboard_files")
        .update({
          metadata: {
            ...(match.metadata || {}),
            hidden_from_history: true,
            removed_from_history: true,
            removed_from_history_at: new Date().toISOString(),
            removal_mode: FILE_DELETE_MODES.listOnly,
          },
        })
        .eq("id", match.id);
      if (error) throw error;
    }
  }
}

async function deleteProcessedDashboardFileMetadata(records = []) {
  const ids = new Set();
  for (const record of records) {
    const matches = await getProcessedDashboardFileMatches(record);
    matches.forEach((match) => {
      if (match?.id) ids.add(match.id);
    });
  }
  if (!ids.size) return 0;
  const { error } = await window.supabaseClient
    .from("processed_dashboard_files")
    .delete()
    .in("id", Array.from(ids));
  if (error) throw error;
  return ids.size;
}

async function updateDashboardFilesForListRemoval(records = []) {
  const ids = records.flatMap(getDashboardFileIdsForRecord);
  if (!ids.length) return 0;
  const { data: existing, error: selectError } = await window.supabaseClient
    .from("dashboard_files")
    .select("id,metadata")
    .in("id", ids);
  if (selectError) throw selectError;
  for (const row of Array.isArray(existing) ? existing : []) {
    const { error } = await window.supabaseClient
      .from("dashboard_files")
      .update({
        is_active: false,
        status: "removed_from_history",
        metadata: {
          ...(row.metadata || {}),
          hidden_from_history: true,
          removed_from_history: true,
          removed_from_history_at: new Date().toISOString(),
          removal_mode: FILE_DELETE_MODES.listOnly,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (error) throw error;
  }
  return Array.isArray(existing) ? existing.length : 0;
}

async function deleteDashboardFileMetadata(records = []) {
  const ids = records.flatMap(getDashboardFileIdsForRecord);
  if (!ids.length) return 0;
  const { error } = await window.supabaseClient
    .from("dashboard_files")
    .delete()
    .in("id", ids);
  if (error) throw error;
  return ids.length;
}

async function tryDeleteRowsByColumn(tableName, column, values = []) {
  const uniqueValues = [...new Set((Array.isArray(values) ? values : []).filter(Boolean))];
  if (!uniqueValues.length) return 0;
  const { count, error } = await window.supabaseClient
    .from(tableName)
    .delete({ count: "exact" })
    .in(column, uniqueValues);
  if (error) {
    const text = `${error.code || ""} ${error.message || ""} ${error.details || ""}`;
    if (/PGRST204|schema cache|Could not find|column/i.test(text)) {
      console.warn("[Delete Imported Data] Coluna indisponível durante exclusão.", { tableName, column, error });
      return 0;
    }
    throw error;
  }
  return Number(count || 0);
}

async function deleteImportedRowsForRecord(record = {}) {
  const category = getFileRecordCategory(record);
  const tableName = getProcessedRecordsTable(category);
  if (!tableName) return 0;
  const ids = getDashboardFileIdsForRecord(record);
  const fileName = record.file_name || record.metadata?.original_name || "";
  const before = await countRowsInPersistedTable(tableName).catch(() => null);
  let removed = 0;
  removed += await tryDeleteRowsByColumn(tableName, "file_id", ids);
  if (category === DEVIATION_PNR_FILE_CATEGORY) {
    removed += await tryDeleteRowsByColumn(tableName, "upload_batch_id", ids);
    if (!ids.length && fileName) removed += await tryDeleteRowsByColumn(tableName, "source_file_name", [fileName]);
    await refreshPnrMetricsSummaryForFiles(ids).catch((error) => {
      console.warn("[Delete Imported Data] Não foi possível recalcular agregados PNR após exclusão.", error);
    });
  }
  const after = await countRowsInPersistedTable(tableName).catch(() => null);
  console.info("[Delete Imported Data]", {
    module_key: getDashboardFileModuleKey(record),
    file_name: fileName,
    tableName,
    ids,
    before,
    removed,
    after,
  });
  return removed;
}

async function deleteProcessedRowsForDashboardFiles(records = []) {
  if (!window.supabaseClient) return 0;
  let removed = 0;
  for (const record of Array.isArray(records) ? records : []) {
    removed += await deleteImportedRowsForRecord(record);
  }
  return removed;
}

async function refreshAfterFileDeletion(records = [], mode = FILE_DELETE_MODES.withData) {
  const affectedModules = new Set((Array.isArray(records) ? records : []).map(getDashboardFileModuleKey).filter(Boolean));
  selectedSettingsFileIds.clear();
  const deletedIds = new Set(records.flatMap(getDashboardFileIdsForRecord));
  dashboardFileRecords = dashboardFileRecords.filter((record) => !deletedIds.has(record.id));
  library.datasets = (Array.isArray(library.datasets) ? library.datasets : []).filter((dataset) => !deletedIds.has(dataset.id));
  packageManagementRowsLoadedKey = "";
  pnrRowsLoadedKey = "";
  pnrRows = [];
  resetDerivedDataCache();

  if (affectedModules.has(DASHBOARD_MODULE_KEYS.desviosPnr)) {
    clearPnrPostImportLocalState();
    resetPnrRemoteState();
  }

  const files = await loadDashboardFilesFromSupabase({ loadActive: true, render: false, validateStorage: false, showLoading: false });
  await Promise.allSettled([...affectedModules].map((moduleKey) => checkModulePersistedData(moduleKey, { reason: `file-delete-${mode}` })));

  if (affectedModules.has(DASHBOARD_MODULE_KEYS.desviosPnr) && state.appView === "dashboard" && state.sheet === DEVIATION_MANAGEMENT_VIEW) {
    await refreshPnrRemoteDashboard({ force: true, reason: "file-delete" });
  } else {
    hydrateControls();
    renderAll();
  }
  renderSettingsFileManagement();
  return files;
}

async function removeStorageFilesIfPresent(records = []) {
  const storagePaths = records
    .filter((record) => !isSyntheticOrDeletedRawFile(record))
    .map((record) => record.storage_path)
    .filter(Boolean);
  if (!storagePaths.length) return 0;
  const { error } = await window.supabaseClient.storage.from("dashboard-files").remove(storagePaths);
  if (error) {
    console.warn("[File Delete] Arquivo bruto não encontrado no Storage; seguindo com metadados/dados.", { storagePaths, error });
    return 0;
  }
  return storagePaths.length;
}

async function deleteDashboardFiles(fileRecords = [], options = {}) {
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

  const mode = options.mode === FILE_DELETE_MODES.listOnly ? FILE_DELETE_MODES.listOnly : FILE_DELETE_MODES.withData;
  const moduleKeys = [...new Set(records.map(getDashboardFileModuleKey))];
  console.info("[File Delete]", {
    action: mode,
    files: records.map((record) => ({
      module_key: getDashboardFileModuleKey(record),
      file_name: record.file_name,
      file_hash: getDashboardFileHash(record),
      processed_file_id: getProcessedDashboardFileId(record),
      raw_file_deleted: isSyntheticOrDeletedRawFile(record),
      storage_path: record.storage_path,
    })),
  });

  try {
    const removedStorageFiles = await removeStorageFilesIfPresent(records);
    let removedRows = 0;
    let removedProcessedMetadata = 0;
    let changedDashboardMetadata = 0;
    if (mode === FILE_DELETE_MODES.withData) {
      removedRows = await deleteProcessedRowsForDashboardFiles(records);
      removedProcessedMetadata = await deleteProcessedDashboardFileMetadata(records);
      changedDashboardMetadata = await deleteDashboardFileMetadata(records);
    } else {
      await updateProcessedDashboardFilesForListRemoval(records);
      changedDashboardMetadata = await updateDashboardFilesForListRemoval(records);
    }

    await Promise.all(
      records.map((record) =>
        logAudit("delete_file", "dashboard_file", record.id, {
          file_name: record.file_name,
          storage_path: record.storage_path,
          mode,
          module_key: getDashboardFileModuleKey(record),
        }),
      ),
    );

    console.info("[Module File Delete]", {
      action: mode,
      moduleKeys,
      removedStorageFiles,
      removedRows,
      removedProcessedMetadata,
      changedDashboardMetadata,
      status: "ok",
    });

    await refreshAfterFileDeletion(records, mode);
    showToast(
      mode === FILE_DELETE_MODES.listOnly
        ? (records.length === 1 ? "Arquivo removido da lista. Os dados importados foram mantidos." : "Arquivos removidos da lista. Os dados importados foram mantidos.")
        : (records.length === 1 ? "Arquivo e dados importados excluídos com sucesso." : "Arquivos e dados importados excluídos com sucesso."),
      "good",
      5200,
    );
  } catch (error) {
    console.error("[File Delete] Falha ao excluir arquivo/metadados.", error);
    showToast("Não foi possível concluir a exclusão. Verifique o console para detalhes técnicos.", "error", 7200);
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
    const clientError = new Error("Cliente Supabase indisponível.");
    if (shouldShowLoading || !hasLoadedDashboardData()) setDashboardVisualState("supabase-error", { render: false, error: clientError });
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
    if (shouldShowLoading || !hasLoadedDashboardData()) setDashboardVisualState("supabase-error", { render: false, error });
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
  const mode = await showFileDeleteChoiceDialog(files);
  if (!mode) return;
  await deleteDashboardFiles(files, { mode });
}

function showFileDeleteChoiceDialog(files = []) {
  const count = Array.isArray(files) ? files.length : 0;
  const moduleLabel = getSettingsFileTabLabel(settingsFilesTab);
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "file-delete-dialog-backdrop";
    overlay.setAttribute("role", "presentation");
    overlay.innerHTML = `
      <section class="file-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="file-delete-dialog-title">
        <div class="file-delete-dialog__header">
          <strong id="file-delete-dialog-title">${escapeHtml(count === 1 ? "Excluir arquivo importado?" : `Excluir ${count} arquivos importados?`)}</strong>
          <p>Você deseja remover apenas o arquivo da lista ou excluir também os dados importados por ele?</p>
        </div>
        <div class="file-delete-dialog__body">
          <span><strong>Módulo</strong>${escapeHtml(moduleLabel)}</span>
          <span><strong>Selecionados</strong>${integer.format(count)}</span>
          <p>Excluir os dados removerá os registros importados por este arquivo da base do painel. As demais abas não serão afetadas.</p>
        </div>
        <div class="file-delete-dialog__actions">
          <button class="secondary-button" type="button" data-file-delete-choice="${FILE_DELETE_MODES.listOnly}">Remover da lista</button>
          <button class="danger-button" type="button" data-file-delete-choice="${FILE_DELETE_MODES.withData}">Excluir arquivo e dados</button>
          <button class="ghost-button" type="button" data-file-delete-cancel>Cancelar</button>
        </div>
      </section>
    `;
    const close = (value) => {
      document.removeEventListener("keydown", onKeydown);
      overlay.remove();
      resolve(value);
    };
    const onKeydown = (event) => {
      if (event.key === "Escape") close("");
    };
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay || event.target.closest("[data-file-delete-cancel]")) {
        close("");
        return;
      }
      const button = event.target.closest("[data-file-delete-choice]");
      if (button) close(button.dataset.fileDeleteChoice);
    });
    document.addEventListener("keydown", onKeydown);
    document.body.appendChild(overlay);
    overlay.querySelector("[data-file-delete-choice]")?.focus();
  });
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
  if (loadedState.sheet === MONTHLY_BASE_VIEW) {
    loadedState.sheet = PRE_FATURA_VIEW;
    loadedState.preFaturaView = PREFATURA_VIEW_EVOLUTION;
  } else if (loadedState.sheet === "Todos") {
    loadedState.sheet = PRE_FATURA_VIEW;
  } else if (SHEET_ORDER.includes(loadedState.sheet)) {
    loadedState.prefaturaTipo = getPrefaturaTypeForDivision(loadedState.sheet);
    loadedState.sheet = PRE_FATURA_VIEW;
  } else if (!SHEET_TABS.includes(loadedState.sheet)) {
    loadedState.sheet = PRE_FATURA_VIEW;
  }
  loadedState.preFaturaView = normalizePreFaturaView(loadedState.preFaturaView);
  loadedState.prefaturaTipo = normalizeTypeSelection(loadedState.prefaturaTipo);
  loadedState.packageTipo = normalizeTypeSelection(loadedState.packageTipo);
  loadedState.prefaturaMonths = Array.isArray(loadedState.prefaturaMonths) ? loadedState.prefaturaMonths : [];
  loadedState.packageMonths = Array.isArray(loadedState.packageMonths) ? loadedState.packageMonths : [];
  loadedState.prefaturaPeriod = normalizePeriodMode(loadedState.prefaturaPeriod || loadedState.period);
  loadedState.packagePeriod = normalizePeriodMode(loadedState.packagePeriod || "month");
  loadedState.activeDesvioCategory = normalizeDeviationCategory(loadedState.activeDesvioCategory);
  loadedState.pnrQuery = String(loadedState.pnrQuery || "");
  loadedState.pnrMonths = Array.isArray(loadedState.pnrMonths) ? loadedState.pnrMonths : [];
  loadedState.pnrQuinzena = Array.isArray(loadedState.pnrQuinzena)
    ? getPnrFilterSelectedValues(loadedState.pnrQuinzena, ["q1", "q2"])
    : ["all", "q1", "q2"].includes(loadedState.pnrQuinzena) ? loadedState.pnrQuinzena : "all";
  loadedState.pnrStatus = Array.isArray(loadedState.pnrStatus) ? loadedState.pnrStatus : normalizePnrSelectValue(loadedState.pnrStatus);
  loadedState.pnrEstacao = Array.isArray(loadedState.pnrEstacao) ? loadedState.pnrEstacao : normalizePnrSelectValue(loadedState.pnrEstacao);
  loadedState.pnrTipoOperacional = "Todos";
  loadedState.pnrStatusMotorista = "Todos";
  loadedState.pnrFonteCruzamento = "Todos";
  loadedState.pnrMotorista = "Todos";
  loadedState.pnrRota = "Todos";
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

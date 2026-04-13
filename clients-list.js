import { ensureClientsAccess, formatDate, formatDoes, formatPrice, formatSignedDoes } from "./clients-data.js";
import { getDashboardClientScopeSnapshotSecure, unfreezeClientAccountSecure } from "./secure-functions.js";

const scope = String(window.__CLIENTS_SCOPE || "active").trim().toLowerCase();
const isFrozenPage = scope === "frozen";
const pageLabel = scope === "frozen"
  ? "comptes gelés"
  : scope === "gain"
    ? "comptes en gain"
    : scope === "loss"
      ? "comptes en perte"
      : "comptes actifs";
const emptyLabel = scope === "frozen"
  ? "compte gelé"
  : scope === "gain"
    ? "compte en gain"
    : scope === "loss"
      ? "compte en perte"
      : "compte actif";

const adminEmailEl = document.getElementById("clientsListAdminEmail");
const loadingEl = document.getElementById("clientsListLoading");
const errorEl = document.getElementById("clientsListError");
const contentEl = document.getElementById("clientsListContent");
const countEl = document.getElementById("clientsListCount");
const ordersEl = document.getElementById("clientsListOrders");
const balanceEl = document.getElementById("clientsListBalance");
const listEl = document.getElementById("clientsCards");
const emptyEl = document.getElementById("clientsListEmpty");
const searchInputEl = document.getElementById("clientsSearchInput");
const searchMetaEl = document.getElementById("clientsSearchMeta");
const sortSelectEl = document.getElementById("clientsSortSelect");
const paginationEl = document.getElementById("clientsPagination");
const loadMoreBtn = document.getElementById("clientsLoadMoreBtn");

let loadedRows = [];
let currentRows = [];
let unfreezeKey = "";
let toastTimer = 0;
let nextOffset = 0;
let hasMoreRows = true;
let loadInFlight = false;
let loadRequestToken = 0;
let searchDebounceTimer = 0;
let queuedRefresh = false;
let currentStats = {
  total: 0,
  totalOrders: 0,
  totalHtgBalance: 0,
  totalDoesBalance: 0,
};
let currentTotalMatches = 0;

function escapeHtml(value = "") {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function showToast(message, tone = "info") {
  let toast = document.getElementById("clientsToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "clientsToast";
    toast.style.position = "fixed";
    toast.style.right = "18px";
    toast.style.bottom = "18px";
    toast.style.zIndex = "3000";
    toast.style.minWidth = "220px";
    toast.style.maxWidth = "min(92vw, 420px)";
    toast.style.padding = "14px 16px";
    toast.style.borderRadius = "18px";
    toast.style.boxShadow = "0 18px 36px rgba(15,23,42,.18)";
    toast.style.fontWeight = "800";
    toast.style.transition = "opacity .2s ease, transform .2s ease";
    document.body.appendChild(toast);
  }

  toast.textContent = String(message || "");
  toast.style.opacity = "1";
  toast.style.transform = "translateY(0)";
  toast.style.color = "white";
  toast.style.background = tone === "success" ? "#065f46" : tone === "error" ? "#991b1b" : "#0f172a";

  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(8px)";
  }, 2800);
}

function getFreezeLabel(row = {}) {
  if (row.freezeMode === "global") return "Gel global";
  if (row.freezeMode === "withdrawal") return "Gel retrait";
  return "Actif";
}

function getPerformanceLabel(row = {}) {
  const net = Number(row.netGameDoes || 0);
  if (net > 0) return "En gain";
  if (net < 0) return "En perte";
  return "Neutre";
}

function renderRows(rows = []) {
  if (!listEl || !emptyEl) return;
  if (!rows.length) {
    listEl.innerHTML = "";
    const query = String(searchInputEl?.value || "").trim();
    emptyEl.textContent = query
      ? `Aucun client ne correspond à “${query}”.`
      : `Aucun ${emptyLabel} trouvé.`;
    emptyEl.classList.remove("hidden");
    return;
  }

  emptyEl.classList.add("hidden");
  listEl.innerHTML = rows.map((row) => `
    <article class="client-card" data-client-card="${escapeHtml(row.id)}">
      <div class="client-card__head">
        <div class="client-card__identity">
          <p class="client-card__eyebrow">${escapeHtml(getFreezeLabel(row))}</p>
          <h2 class="client-card__title">${escapeHtml(row.displayName)}</h2>
          <p class="client-card__subtitle">${escapeHtml(row.email || row.phone || row.id)}</p>
        </div>
        <span class="client-card__badge">${safeText(row.orderCount)} commande(s)</span>
      </div>

      <div class="client-card__grid">
        <div><span class="client-card__label">Téléphone</span><strong>${escapeHtml(row.phone || "-")}</strong></div>
        <div><span class="client-card__label">Créé le</span><strong>${escapeHtml(formatDate(row.createdAtMs))}</strong></div>
        <div><span class="client-card__label">Dernière commande</span><strong>${escapeHtml(formatDate(row.lastOrderAtMs))}</strong></div>
        <div><span class="client-card__label">Rejets</span><strong>${safeText(row.rejectedDepositStrikeCount)}/3</strong></div>
        <div><span class="client-card__label">HTG actuel</span><strong>${escapeHtml(formatPrice(row.htgBalance))}</strong></div>
        <div><span class="client-card__label">Does actuel</span><strong>${escapeHtml(formatDoes(row.doesBalanceCurrent))}</strong></div>
        <div><span class="client-card__label">Performance</span><strong>${escapeHtml(getPerformanceLabel(row))}</strong></div>
        <div><span class="client-card__label">Net jeu</span><strong>${escapeHtml(formatSignedDoes(row.netGameDoes))}</strong></div>
      </div>

      <div class="client-card__actions">
        <a class="client-card__action client-card__action--primary" href="./Dclient-view.html?id=${encodeURIComponent(row.id)}">Voir le dossier</a>
        ${isFrozenPage && row.isFrozen ? `
          <button type="button" class="client-card__action client-card__action--warn" data-unfreeze-client="${escapeHtml(row.id)}">
            Dégeler
          </button>
        ` : ""}
      </div>
    </article>
  `).join("");
}

function safeText(value) {
  return String(Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : value ?? "");
}

function setLoadMoreState() {
  if (!paginationEl || !loadMoreBtn) return;
  const shouldShow = loadedRows.length > 0 && (hasMoreRows || loadInFlight);
  paginationEl.classList.toggle("hidden", !shouldShow);
  loadMoreBtn.disabled = loadInFlight || !hasMoreRows;
  loadMoreBtn.textContent = loadInFlight ? "Chargement..." : "Voir plus";
}

function getCurrentQuery() {
  return String(searchInputEl?.value || "").trim();
}

function compareDefault(left = {}, right = {}) {
  if (scope === "frozen") {
    return safeNumber(right.rejectedDepositStrikeCount) - safeNumber(left.rejectedDepositStrikeCount)
      || safeNumber(right.updatedAtMs) - safeNumber(left.updatedAtMs)
      || String(left.displayName || "").localeCompare(String(right.displayName || ""), "fr");
  }
  if (scope === "gain") {
    return safeNumber(right.netGameDoes) - safeNumber(left.netGameDoes)
      || safeNumber(right.lastOrderAtMs) - safeNumber(left.lastOrderAtMs)
      || String(left.displayName || "").localeCompare(String(right.displayName || ""), "fr");
  }
  if (scope === "loss") {
    return safeNumber(left.netGameDoes) - safeNumber(right.netGameDoes)
      || safeNumber(right.lastOrderAtMs) - safeNumber(left.lastOrderAtMs)
      || String(left.displayName || "").localeCompare(String(right.displayName || ""), "fr");
  }
  return safeNumber(right.lastOrderAtMs) - safeNumber(left.lastOrderAtMs)
    || safeNumber(right.createdAtMs) - safeNumber(left.createdAtMs)
    || String(left.displayName || "").localeCompare(String(right.displayName || ""), "fr");
}

function safeNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function sortRows(rows = [], sortKey = "") {
  const list = [...rows];
  switch (String(sortKey || "default").trim().toLowerCase()) {
    case "htg_desc":
      return list.sort((left, right) =>
        safeNumber(right.htgBalance) - safeNumber(left.htgBalance)
        || compareDefault(left, right)
      );
    case "htg_asc":
      return list.sort((left, right) =>
        safeNumber(left.htgBalance) - safeNumber(right.htgBalance)
        || compareDefault(left, right)
      );
    case "does_desc":
      return list.sort((left, right) =>
        safeNumber(right.doesBalanceCurrent) - safeNumber(left.doesBalanceCurrent)
        || compareDefault(left, right)
      );
    case "does_asc":
      return list.sort((left, right) =>
        safeNumber(left.doesBalanceCurrent) - safeNumber(right.doesBalanceCurrent)
        || compareDefault(left, right)
      );
    default:
      return list.sort(compareDefault);
  }
}

function renderStats(rows = []) {
  if (countEl) countEl.textContent = String(currentStats.total || 0);
  if (ordersEl) ordersEl.textContent = String(currentStats.totalOrders || 0);
  if (balanceEl) {
    balanceEl.textContent = scope === "frozen"
      ? formatPrice(currentStats.totalHtgBalance || 0)
      : `${formatPrice(currentStats.totalHtgBalance || 0)} · ${formatDoes(currentStats.totalDoesBalance || 0)}`;
  }
}

function renderCurrentRows() {
  const sortKey = String(sortSelectEl?.value || "default").trim().toLowerCase();
  const query = getCurrentQuery();
  currentRows = sortRows(loadedRows, sortKey);
  if (searchMetaEl) {
    const sortLabel = sortSelectEl?.selectedOptions?.[0]?.textContent?.trim();
    const suffix = sortLabel ? ` · ${sortLabel}` : "";
    if (query) {
      searchMetaEl.textContent = hasMoreRows
        ? `${currentTotalMatches} résultat(s) trouvés pour "${query}"${suffix} · ${currentRows.length} affiché(s)`
        : `${currentTotalMatches} résultat(s) trouvés pour "${query}"${suffix}`;
    } else {
      searchMetaEl.textContent = hasMoreRows
        ? `${currentStats.total || 0} client(s) sur la page${suffix} · ${currentRows.length} affiché(s)`
        : `${currentStats.total || 0} client(s) sur la page${suffix}`;
    }
  }
  renderStats(currentRows);
  renderRows(currentRows);
  setLoadMoreState();
}

async function loadRowsPage({ reset = false } = {}) {
  if (loadInFlight) {
    if (reset) queuedRefresh = true;
    return;
  }

  const requestToken = ++loadRequestToken;
  if (reset) {
    loadedRows = [];
    currentRows = [];
    nextOffset = 0;
    hasMoreRows = true;
    currentTotalMatches = 0;
    renderCurrentRows();
  }
  loadInFlight = true;
  setLoadMoreState();

  try {
    const page = await getDashboardClientScopeSnapshotSecure({
      scope,
      query: getCurrentQuery(),
      offset: reset ? 0 : nextOffset,
      pageSize: 10,
    });

    if (requestToken !== loadRequestToken) return;

    currentStats = page?.stats && typeof page.stats === "object"
      ? {
          total: Number(page.stats.total || 0),
          totalOrders: Number(page.stats.totalOrders || 0),
          totalHtgBalance: Number(page.stats.totalHtgBalance || 0),
          totalDoesBalance: Number(page.stats.totalDoesBalance || 0),
        }
      : currentStats;
    currentTotalMatches = Number(page?.totalMatches || 0);
    nextOffset = Number(page?.nextOffset || 0);
    hasMoreRows = page?.hasMore === true;
    loadedRows = reset ? [...(page?.rows || [])] : [...loadedRows, ...(page?.rows || [])];
    renderCurrentRows();
  } finally {
    if (requestToken === loadRequestToken) {
      loadInFlight = false;
      setLoadMoreState();
    }
    if (!loadInFlight && queuedRefresh) {
      queuedRefresh = false;
      void loadRowsPage({ reset: true });
    }
  }
}

async function refresh() {
  await loadRowsPage({ reset: true });
}

async function handleUnfreeze(clientId) {
  const normalizedId = String(clientId || "").trim();
  if (!normalizedId || unfreezeKey) return;
  const target = currentRows.find((item) => item.id === normalizedId);
  if (!target) return;

  const confirmed = window.confirm(`Dégeler ${target.displayName} ?`);
  if (!confirmed) return;

  unfreezeKey = normalizedId;
  try {
    await unfreezeClientAccountSecure({
      uid: normalizedId,
      reason: "dashboard_clients_frozen",
    });
    showToast("Compte dégélé avec succès.", "success");
    await refresh();
  } catch (error) {
    console.error("[CLIENTS_LIST] unfreeze failed", error);
    showToast(error?.message || "Impossible de dégeler ce compte.", "error");
  } finally {
    unfreezeKey = "";
  }
}

listEl?.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-unfreeze-client]");
  if (!button) return;
  const clientId = String(button.dataset.unfreezeClient || "").trim();
  void handleUnfreeze(clientId);
});

searchInputEl?.addEventListener("input", () => {
  window.clearTimeout(searchDebounceTimer);
  searchDebounceTimer = window.setTimeout(() => {
    void refresh();
  }, 260);
});

sortSelectEl?.addEventListener("change", () => {
  renderCurrentRows();
});

loadMoreBtn?.addEventListener("click", () => {
  if (loadInFlight || !hasMoreRows) return;
  void loadRowsPage();
});

async function init() {
  try {
    const adminUser = await ensureClientsAccess(pageLabel.charAt(0).toUpperCase() + pageLabel.slice(1));
    if (adminEmailEl) {
      adminEmailEl.textContent = adminUser?.email || adminUser?.uid || "Admin connecté";
    }
    await refresh();
    loadingEl?.classList.add("hidden");
    contentEl?.classList.remove("hidden");
  } catch (error) {
    console.error("[CLIENTS_LIST] init failed", error);
    loadingEl?.classList.add("hidden");
    if (errorEl) {
      errorEl.textContent = error?.message || "Impossible de charger les clients.";
      errorEl.classList.remove("hidden");
    }
  }
}

void init();

import { ensureClientsAccess, formatDoes, formatPrice } from "./clients-data.js";
import {
  archiveClientAccountSecure,
  deleteClientAccountSecure,
  getDashboardDeletionReviewSnapshotSecure,
  setClientDeletionReviewStatusSecure,
} from "./secure-functions.js";

const dom = {
  adminEmail: document.getElementById("deletionReviewAdminEmail"),
  loading: document.getElementById("deletionReviewLoading"),
  error: document.getElementById("deletionReviewError"),
  content: document.getElementById("deletionReviewContent"),
  count: document.getElementById("deletionReviewCount"),
  contacted: document.getElementById("deletionReviewContacted"),
  withBalance: document.getElementById("deletionReviewWithBalance"),
  archived: document.getElementById("deletionReviewArchived"),
  searchInput: document.getElementById("deletionReviewSearchInput"),
  searchMeta: document.getElementById("deletionReviewSearchMeta"),
  results: document.getElementById("deletionReviewCards"),
  empty: document.getElementById("deletionReviewEmpty"),
  pagination: document.getElementById("deletionReviewPagination"),
  loadMoreBtn: document.getElementById("deletionReviewLoadMoreBtn"),
};

const state = {
  rows: [],
  stats: {
    totalFlagged: 0,
    contacted: 0,
    withBalance: 0,
    archived: 0,
  },
  totalMatches: 0,
  nextOffset: 0,
  hasMore: true,
  loadInFlight: false,
  loadToken: 0,
  queuedRefresh: false,
  debounceTimer: 0,
  actionKey: "",
};

function escapeHtml(value = "") {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function formatDateTime(ms = 0) {
  const ts = safeNumber(ms);
  if (!ts) return "-";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(ts));
}

function showToast(message, tone = "info") {
  let toast = document.getElementById("deletionReviewToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "deletionReviewToast";
    toast.style.position = "fixed";
    toast.style.right = "18px";
    toast.style.bottom = "18px";
    toast.style.zIndex = "4000";
    toast.style.minWidth = "220px";
    toast.style.maxWidth = "min(92vw, 420px)";
    toast.style.padding = "14px 16px";
    toast.style.borderRadius = "18px";
    toast.style.boxShadow = "0 18px 36px rgba(15,23,42,.18)";
    toast.style.fontWeight = "800";
    document.body.appendChild(toast);
  }
  toast.textContent = String(message || "");
  toast.style.color = "white";
  toast.style.background = tone === "success" ? "#166534" : tone === "error" ? "#991b1b" : "#0f172a";
  toast.style.opacity = "1";
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toast.style.opacity = "0";
  }, 2800);
}
showToast.timer = 0;

function getStatusLabel(row = {}) {
  if (row.accountArchived === true || row.deletionReviewStatus === "archived") return "Archive";
  if (row.deletionReviewStatus === "contacted") return "Contacte";
  if (row.deletionReviewStatus === "cleared") return "Retire";
  if (row.deletionReviewStatus === "pending_review") return "A revoir";
  return "Non marque";
}

function getStatusClass(row = {}) {
  if (row.accountArchived === true || row.deletionReviewStatus === "archived") return "client-card__badge is-archived";
  if (row.deletionReviewStatus === "contacted") return "client-card__badge is-contacted";
  if (row.deletionReviewStatus === "pending_review") return "client-card__badge is-pending";
  return "client-card__badge";
}

function getCurrentQuery() {
  return String(dom.searchInput?.value || "").trim();
}

function setLoadMoreState() {
  const shouldShow = state.rows.length > 0 && (state.hasMore || state.loadInFlight);
  dom.pagination?.classList.toggle("hidden", !shouldShow);
  if (dom.loadMoreBtn) {
    dom.loadMoreBtn.disabled = state.loadInFlight || !state.hasMore;
    dom.loadMoreBtn.textContent = state.loadInFlight ? "Chargement..." : "Voir plus";
  }
}

function renderStats() {
  if (dom.count) dom.count.textContent = String(state.stats.totalFlagged || 0);
  if (dom.contacted) dom.contacted.textContent = String(state.stats.contacted || 0);
  if (dom.withBalance) dom.withBalance.textContent = String(state.stats.withBalance || 0);
  if (dom.archived) dom.archived.textContent = String(state.stats.archived || 0);
}

function renderMeta() {
  if (!dom.searchMeta) return;
  const query = getCurrentQuery();
  if (query) {
    dom.searchMeta.textContent = state.hasMore
      ? `${state.totalMatches} resultat(s) pour "${query}" · ${state.rows.length} affiche(s)`
      : `${state.totalMatches} resultat(s) pour "${query}"`;
    return;
  }
  dom.searchMeta.textContent = state.hasMore
    ? `${state.stats.totalFlagged || 0} compte(s) marque(s) · ${state.rows.length} affiche(s)`
    : `${state.stats.totalFlagged || 0} compte(s) marque(s)`;
}

function renderRows() {
  renderStats();
  renderMeta();
  setLoadMoreState();

  if (!dom.results || !dom.empty) return;
  if (!state.rows.length) {
    dom.results.innerHTML = "";
    dom.empty.textContent = getCurrentQuery()
      ? "Aucun compte ne correspond a cette recherche."
      : "Aucun compte n'est actuellement marque pour suppression.";
    dom.empty.classList.remove("hidden");
    return;
  }

  dom.empty.classList.add("hidden");
  dom.results.innerHTML = state.rows.map((row) => {
    const identity = escapeHtml(row.email || row.phone || row.uid || "-");
    const canArchive = row.accountArchived !== true;
    const actionKey = escapeHtml(row.uid || row.id || "");
    return `
      <article class="client-card" data-client-card="${actionKey}">
        <div class="client-card__head">
          <div class="client-card__identity">
            <p class="client-card__eyebrow">${escapeHtml(row.username ? `@${row.username}` : "Compte client")}</p>
            <h2 class="client-card__title">${escapeHtml(row.name || row.username || row.uid || "Client")}</h2>
            <p class="client-card__subtitle">${identity}</p>
          </div>
          <span class="${getStatusClass(row)}">${escapeHtml(getStatusLabel(row))}</span>
        </div>

        <div class="client-card__grid">
          <div><span class="client-card__label">UID</span><strong>${escapeHtml(row.uid || row.id || "-")}</strong></div>
          <div><span class="client-card__label">Derniere activite</span><strong>${escapeHtml(formatDateTime(row.lastSeenAtMs))}</strong></div>
          <div><span class="client-card__label">Marque le</span><strong>${escapeHtml(formatDateTime(row.deletionReviewFlaggedAtMs))}</strong></div>
          <div><span class="client-card__label">Contacte le</span><strong>${escapeHtml(formatDateTime(row.deletionReviewContactedAtMs))}</strong></div>
          <div><span class="client-card__label">HTG</span><strong>${escapeHtml(formatPrice(row.htgBalance || 0))}</strong></div>
          <div><span class="client-card__label">Does</span><strong>${escapeHtml(formatDoes(row.doesBalance || 0))}</strong></div>
        </div>

        <p class="client-card__reason">
          ${row.hasBalance ? "Compte avec solde. Archivage recommande avant toute suppression." : "Compte sans solde detecte."}
        </p>

        <div class="client-card__actions">
          <a class="client-card__action client-card__action--primary" href="./Dclient-view.html?id=${encodeURIComponent(row.uid || row.id || "")}">Voir le dossier</a>
          ${row.deletionReviewStatus !== "pending_review" && canArchive ? `
            <button type="button" class="client-card__action" data-review-status="pending_review" data-client-id="${actionKey}">
              Marquer
            </button>
          ` : ""}
          ${row.deletionReviewStatus !== "contacted" && canArchive ? `
            <button type="button" class="client-card__action" data-review-status="contacted" data-client-id="${actionKey}">
              Marquer contacte
            </button>
          ` : ""}
          ${row.deletionReviewStatus !== "cleared" && row.accountArchived !== true ? `
            <button type="button" class="client-card__action" data-review-status="cleared" data-client-id="${actionKey}">
              Retirer
            </button>
          ` : ""}
          ${canArchive ? `
            <button type="button" class="client-card__action client-card__action--warn" data-archive-client="${actionKey}">
              Archiver
            </button>
          ` : ""}
          ${canArchive ? `
            <button type="button" class="client-card__action client-card__action--danger" data-delete-client="${actionKey}">
              Supprimer
            </button>
          ` : ""}
        </div>
      </article>
    `;
  }).join("");
}

async function loadPage({ reset = false } = {}) {
  if (state.loadInFlight) {
    if (reset) state.queuedRefresh = true;
    return;
  }

  const token = ++state.loadToken;
  if (reset) {
    state.rows = [];
    state.totalMatches = 0;
    state.nextOffset = 0;
    state.hasMore = true;
    renderRows();
  }

  state.loadInFlight = true;
  setLoadMoreState();

  try {
    const payload = {
      query: getCurrentQuery(),
      offset: reset ? 0 : state.nextOffset,
      pageSize: 10,
    };
    const page = await getDashboardDeletionReviewSnapshotSecure(payload);
    if (token !== state.loadToken) return;

    state.stats = page?.stats && typeof page.stats === "object"
      ? {
          totalFlagged: Number(page.stats.totalFlagged || 0),
          contacted: Number(page.stats.contacted || 0),
          withBalance: Number(page.stats.withBalance || 0),
          archived: Number(page.stats.archived || 0),
        }
      : state.stats;
    state.totalMatches = Number(page?.totalMatches || 0);
    state.nextOffset = Number(page?.nextOffset || 0);
    state.hasMore = page?.hasMore === true;
    state.rows = reset ? [...(page?.rows || [])] : [...state.rows, ...(page?.rows || [])];
    renderRows();
  } finally {
    if (token === state.loadToken) {
      state.loadInFlight = false;
      setLoadMoreState();
    }
    if (!state.loadInFlight && state.queuedRefresh) {
      state.queuedRefresh = false;
      void loadPage({ reset: true });
    }
  }
}

async function refresh() {
  await loadPage({ reset: true });
}

async function runAction(clientId, runner) {
  const safeClientId = String(clientId || "").trim();
  if (!safeClientId || state.actionKey) return;
  state.actionKey = safeClientId;
  try {
    await runner();
    await refresh();
  } catch (error) {
    console.error("[DELETION_REVIEW] action failed", safeClientId, error);
    showToast(error?.message || "Action impossible.", "error");
  } finally {
    state.actionKey = "";
  }
}

async function handleStatus(clientId, nextStatus) {
  const message = nextStatus === "contacted"
    ? "Marquer ce compte comme contacte ?"
    : nextStatus === "cleared"
      ? "Retirer ce compte de la liste de suppression ?"
      : "Marquer ce compte pour suppression ?";
  if (!window.confirm(message)) return;
  await runAction(clientId, async () => {
    await setClientDeletionReviewStatusSecure({ clientId, status: nextStatus });
    showToast("Statut mis a jour.", "success");
  });
}

async function handleArchive(clientId) {
  if (!window.confirm("Archiver ce compte et bloquer sa connexion ?")) return;
  const note = window.prompt("Note optionnelle pour l'archivage :", "") || "";
  await runAction(clientId, async () => {
    await archiveClientAccountSecure({ clientId, note });
    showToast("Compte archive avec succes.", "success");
  });
}

async function handleDelete(clientId) {
  if (!window.confirm("Supprimer definitivement ce compte si aucun solde ni historique ne bloque l'action ?")) return;
  const note = window.prompt("Note optionnelle pour la suppression :", "") || "";
  await runAction(clientId, async () => {
    await deleteClientAccountSecure({ clientId, note });
    showToast("Compte supprime avec succes.", "success");
  });
}

dom.results?.addEventListener("click", (event) => {
  const statusBtn = event.target.closest("button[data-review-status]");
  if (statusBtn) {
    void handleStatus(statusBtn.dataset.clientId || "", statusBtn.dataset.reviewStatus || "");
    return;
  }

  const archiveBtn = event.target.closest("button[data-archive-client]");
  if (archiveBtn) {
    void handleArchive(archiveBtn.dataset.archiveClient || "");
    return;
  }

  const deleteBtn = event.target.closest("button[data-delete-client]");
  if (deleteBtn) {
    void handleDelete(deleteBtn.dataset.deleteClient || "");
  }
});

dom.searchInput?.addEventListener("input", () => {
  window.clearTimeout(state.debounceTimer);
  state.debounceTimer = window.setTimeout(() => {
    void refresh();
  }, 260);
});

dom.loadMoreBtn?.addEventListener("click", () => {
  if (state.loadInFlight || !state.hasMore) return;
  void loadPage();
});

async function init() {
  try {
    const adminUser = await ensureClientsAccess("Revue suppression comptes");
    if (dom.adminEmail) {
      dom.adminEmail.textContent = adminUser?.email || adminUser?.uid || "Admin connecte";
    }
    await refresh();
    dom.loading?.classList.add("hidden");
    dom.content?.classList.remove("hidden");
  } catch (error) {
    console.error("[DELETION_REVIEW] init failed", error);
    dom.loading?.classList.add("hidden");
    if (dom.error) {
      dom.error.textContent = error?.message || "Impossible de charger la revue de suppression.";
      dom.error.classList.remove("hidden");
    }
  }
}

void init();

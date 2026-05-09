import { ensureFinanceDashboardSession } from "./dashboard-admin-auth.js";
import {
  getAgentDepositClientContextSecure,
  searchAgentDepositClientsSecure,
  unfreezeClientAccountSecure,
} from "./secure-functions.js";

const dom = {
  searchInput: document.getElementById("unfreezeSearchInput"),
  searchBtn: document.getElementById("unfreezeSearchBtn"),
  searchStatus: document.getElementById("unfreezeSearchStatus"),
  resultsCount: document.getElementById("unfreezeResultsCount"),
  queryEcho: document.getElementById("unfreezeQueryEcho"),
  adminEmail: document.getElementById("unfreezeAdminEmail"),
  results: document.getElementById("unfreezeResults"),
  empty: document.getElementById("unfreezeEmpty"),
  reasonInput: document.getElementById("unfreezeReasonInput"),
  actionBtn: document.getElementById("unfreezeActionBtn"),
  actionStatus: document.getElementById("unfreezeActionStatus"),
};

const state = {
  adminUser: null,
  lastQuery: "",
  searchSeq: 0,
  results: [],
  selectedClientId: "",
  selectedClientContext: null,
  actionBusy: false,
};

function safeInt(value) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.trunc(num) : 0;
}

function escapeHtml(value = "") {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatInt(value) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(safeInt(value));
}

function formatHtg(value) {
  return `${formatInt(value)} HTG`;
}

function formatDateTime(ms = 0) {
  const ts = safeInt(ms);
  if (ts <= 0) return "Date inconnue";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(ts));
}

function setSearchStatus(text, tone = "neutral") {
  dom.searchStatus.textContent = String(text || "");
  dom.searchStatus.style.color = tone === "error"
    ? "#ff9bab"
    : tone === "success"
      ? "#88f3ca"
      : tone === "warn"
        ? "#ffd38a"
        : "";
}

function setActionStatus(text, tone = "neutral") {
  dom.actionStatus.textContent = String(text || "");
  dom.actionStatus.style.color = tone === "error"
    ? "#ff9bab"
    : tone === "success"
      ? "#88f3ca"
      : tone === "warn"
        ? "#ffd38a"
        : "";
}

function setSearchBusy(busy) {
  const disabled = busy === true;
  dom.searchBtn.disabled = disabled;
  dom.searchInput.disabled = disabled;
  dom.searchBtn.textContent = disabled ? "Recherche..." : "Chercher";
}

function setActionBusy(busy) {
  state.actionBusy = busy === true;
  dom.actionBtn.disabled = state.actionBusy;
  dom.reasonInput.disabled = state.actionBusy;
  dom.actionBtn.textContent = state.actionBusy ? "Deblocage..." : "Debloquer le compte";
}

function buildClientSubtitle(client = {}) {
  const chunks = [];
  if (client.email) chunks.push(client.email);
  if (client.phone) chunks.push(client.phone);
  if (client.username) chunks.push(`@${client.username}`);
  return chunks.join(" · ") || `UID ${client.uid || client.id || "-"}`;
}

function getFreezeMode(client = {}) {
  if (client.accountFrozen === true) return "global";
  if (client.withdrawalHold === true) return "withdrawal";
  return "none";
}

function renderEmptyState(message = "Aucun client trouve pour cette recherche.") {
  dom.results.innerHTML = "";
  dom.empty.textContent = message;
  dom.empty.style.display = "block";
  dom.resultsCount.textContent = "0";
}

function renderResults() {
  const results = Array.isArray(state.results) ? state.results : [];
  dom.resultsCount.textContent = formatInt(results.length);
  dom.queryEcho.textContent = state.lastQuery || "-";

  if (!results.length) {
    renderEmptyState(state.lastQuery ? "Aucun client trouve pour cette recherche." : "Entre un identifiant client pour commencer.");
    return;
  }

  dom.empty.style.display = "none";
  dom.results.innerHTML = results.map((client) => {
    const uid = String(client.uid || client.id || "").trim();
    const freezeMode = getFreezeMode(client);
    const isFrozen = freezeMode !== "none";
    const strikeCount = safeInt(client.rejectedDepositStrikeCount);
    const frozenLabel = freezeMode === "global"
      ? "Compte bloque"
      : freezeMode === "withdrawal"
        ? "Retrait bloque"
        : "Compte ouvert";
    return `
      <article class="result-card" data-client-id="${escapeHtml(uid)}" style="${state.selectedClientId === uid ? "outline:2px solid rgba(64,196,255,0.45);" : ""}">
        <div class="result-head">
          <div>
            <h3 class="result-title">${escapeHtml(client.name || client.username || client.email || uid || "Client")}</h3>
            <p class="result-copy">${escapeHtml(buildClientSubtitle(client))}</p>
          </div>
          <span class="freeze-pill ${isFrozen ? "is-frozen" : "is-open"}">${escapeHtml(frozenLabel)}</span>
        </div>

        <div class="result-grid">
          <div>
            <span>HTG visibles</span>
            <strong>${formatHtg(safeInt(client.approvedHtgAvailable) + safeInt(client.provisionalHtgAvailable))}</strong>
          </div>
          <div>
            <span>Strikes rejet depot</span>
            <strong>${formatInt(strikeCount)}</strong>
          </div>
          <div>
            <span>Raison blocage</span>
            <strong>${escapeHtml(client.freezeReason || client.withdrawalHoldReason || "-")}</strong>
          </div>
          <div>
            <span>Derniere activite</span>
            <strong>${escapeHtml(formatDateTime(client.updatedAtMs || client.lastSeenAtMs || client.createdAtMs))}</strong>
          </div>
        </div>

        <div class="result-actions">
          <button class="primary-btn" type="button" data-unfreeze-select="${escapeHtml(uid)}">Selectionner ce client</button>
        </div>
      </article>
    `;
  }).join("");
}

async function searchClients() {
  const query = String(dom.searchInput.value || "").trim();
  state.lastQuery = query;
  dom.queryEcho.textContent = query || "-";

  if (!query) {
    setSearchStatus("Entre un UID, un email, un telephone ou un username.", "warn");
    state.results = [];
    renderResults();
    return;
  }

  const currentSeq = ++state.searchSeq;
  setSearchBusy(true);
  setSearchStatus("Recherche client en cours...");

  try {
    const response = await searchAgentDepositClientsSecure({ query });
    if (currentSeq !== state.searchSeq) return;
    state.results = Array.isArray(response?.results) ? response.results : [];
    state.selectedClientId = "";
    state.selectedClientContext = null;
    renderResults();
    setSearchStatus(
      state.results.length ? `${formatInt(state.results.length)} client(s) trouve(s).` : "Aucun client trouve.",
      state.results.length ? "success" : "warn",
    );
    setActionStatus("");
  } catch (error) {
    if (currentSeq !== state.searchSeq) return;
    state.results = [];
    state.selectedClientId = "";
    state.selectedClientContext = null;
    renderResults();
    setSearchStatus(error?.message || "Impossible de rechercher le client.", "error");
  } finally {
    if (currentSeq === state.searchSeq) setSearchBusy(false);
  }
}

async function selectClient(clientId = "") {
  const uid = String(clientId || "").trim();
  if (!uid) return;
  state.selectedClientId = uid;
  setActionStatus("Chargement du contexte client...");
  renderResults();

  try {
    const response = await getAgentDepositClientContextSecure({ clientId: uid });
    state.selectedClientContext = response?.client || null;
    const client = state.selectedClientContext || {};
    const freezeMode = getFreezeMode(client);
    if (freezeMode === "none") {
      setActionStatus("Compte charge. Ce client n'est pas bloque pour le moment.", "warn");
    } else {
      setActionStatus(`Client charge. Statut actuel: ${freezeMode === "global" ? "compte bloque" : "retrait bloque"}.`, "success");
    }
    state.results = state.results.map((item) => {
      const itemUid = String(item.uid || item.id || "").trim();
      return itemUid === uid ? { ...item, ...client } : item;
    });
    renderResults();
  } catch (error) {
    state.selectedClientContext = null;
    setActionStatus(error?.message || "Impossible de charger le contexte client.", "error");
  }
}

async function unfreezeClient() {
  if (!state.selectedClientId) {
    setActionStatus("Selectionne d'abord un client.", "warn");
    return;
  }

  const reason = String(dom.reasonInput.value || "").trim();
  setActionBusy(true);
  setActionStatus("Deblocage du compte en cours...");

  try {
    const response = await unfreezeClientAccountSecure({
      uid: state.selectedClientId,
      reason,
    });
    state.selectedClientContext = {
      ...(state.selectedClientContext || {}),
      accountFrozen: false,
      withdrawalHold: false,
      rejectedDepositStrikeCount: 0,
      freezeReason: "",
      withdrawalHoldReason: "",
      unfrozenAtMs: Date.now(),
    };
    state.results = state.results.map((item) => {
      const itemUid = String(item.uid || item.id || "").trim();
      return itemUid === state.selectedClientId
        ? {
            ...item,
            accountFrozen: false,
            withdrawalHold: false,
            rejectedDepositStrikeCount: 0,
            freezeReason: "",
            withdrawalHoldReason: "",
          }
        : item;
    });
    renderResults();
    setActionStatus(response?.ok ? "Compte debloque avec succes." : "Deblocage termine.", "success");
  } catch (error) {
    setActionStatus(error?.message || "Impossible de debloquer le compte client.", "error");
  } finally {
    setActionBusy(false);
  }
}

function bindEvents() {
  dom.searchBtn.addEventListener("click", () => {
    void searchClients();
  });

  dom.searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void searchClients();
    }
  });

  dom.results.addEventListener("click", (event) => {
    const target = event.target instanceof Element
      ? event.target.closest("[data-unfreeze-select]")
      : null;
    if (!target) return;
    const clientId = String(target.getAttribute("data-unfreeze-select") || "").trim();
    void selectClient(clientId);
  });

  dom.actionBtn.addEventListener("click", () => {
    void unfreezeClient();
  });
}

async function bootstrap() {
  setSearchStatus("Connexion admin en cours...");
  renderEmptyState("Connexion admin en cours...");

  try {
    state.adminUser = await ensureFinanceDashboardSession({
      title: "Deblocage compte client",
      description: "Connecte-toi avec le compte finance autorise pour rechercher un client bloque et lever la suspension apres verification.",
    });
    dom.adminEmail.textContent = state.adminUser?.email || "-";
    setSearchStatus("Recherche prete. Entre un client pour commencer.");
    renderEmptyState("Entre un identifiant client pour commencer.");
  } catch (error) {
    dom.adminEmail.textContent = "-";
    setSearchStatus(error?.message || "Acces refuse.", "error");
    renderEmptyState("Connexion admin requise pour utiliser cette page.");
  }
}

bindEvents();
void bootstrap();

import { ensureFinanceDashboardSession } from "./dashboard-admin-auth.js";
import {
  getAgentDepositClientContextSecure,
  searchAgentDepositClientsSecure,
  setWithdrawalTemporaryHoldSecure,
} from "./secure-functions.js";

const TEMPORARY_WITHDRAWAL_HOLD_MESSAGE = "Le retrait est temporairement indisponible, veuillez attendre quelques minutes.";

const dom = {
  searchInput: document.getElementById("withdrawalTempHoldSearchInput"),
  searchBtn: document.getElementById("withdrawalTempHoldSearchBtn"),
  searchStatus: document.getElementById("withdrawalTempHoldSearchStatus"),
  resultsCount: document.getElementById("withdrawalTempHoldResultsCount"),
  queryEcho: document.getElementById("withdrawalTempHoldQueryEcho"),
  adminEmail: document.getElementById("withdrawalTempHoldAdminEmail"),
  results: document.getElementById("withdrawalTempHoldResults"),
  empty: document.getElementById("withdrawalTempHoldEmpty"),
  reasonInput: document.getElementById("withdrawalTempHoldReasonInput"),
  enableBtn: document.getElementById("withdrawalTempHoldEnableBtn"),
  disableBtn: document.getElementById("withdrawalTempHoldDisableBtn"),
  actionStatus: document.getElementById("withdrawalTempHoldActionStatus"),
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
  dom.enableBtn.disabled = state.actionBusy || !state.selectedClientId;
  dom.disableBtn.disabled = state.actionBusy || !state.selectedClientId;
  dom.reasonInput.disabled = state.actionBusy;
  dom.enableBtn.textContent = state.actionBusy ? "Mise a jour..." : "Geler le retrait";
  dom.disableBtn.textContent = state.actionBusy ? "Mise a jour..." : "Retirer le gel";
}

function buildClientSubtitle(client = {}) {
  const chunks = [];
  if (client.email) chunks.push(client.email);
  if (client.phone) chunks.push(client.phone);
  if (client.username) chunks.push(`@${client.username}`);
  return chunks.join(" · ") || `UID ${client.uid || client.id || "-"}`;
}

function getLockMode(client = {}) {
  if (client.withdrawalTemporaryHold === true) return "temporary";
  if (client.accountFrozen === true) return "frozen";
  if (client.withdrawalHold === true) return "withdrawal";
  return "open";
}

function getLockPresentation(client = {}) {
  const mode = getLockMode(client);
  if (mode === "temporary") {
    return { className: "is-temp", label: "Retrait gele temporairement" };
  }
  if (mode === "frozen") {
    return { className: "is-frozen", label: "Compte gele" };
  }
  if (mode === "withdrawal") {
    return { className: "is-withdrawal", label: "Retrait deja bloque" };
  }
  return { className: "is-open", label: "Retrait ouvert" };
}

function renderEmptyState(message = "Aucun client trouve pour cette recherche.") {
  dom.results.innerHTML = "";
  dom.empty.textContent = message;
  dom.empty.style.display = "block";
  dom.resultsCount.textContent = "0";
  setActionBusy(false);
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
    const presentation = getLockPresentation(client);
    return `
      <article class="result-card" data-client-id="${escapeHtml(uid)}" style="${state.selectedClientId === uid ? "outline:2px solid rgba(64,196,255,0.45);" : ""}">
        <div class="result-head">
          <div>
            <h3 class="result-title">${escapeHtml(client.name || client.username || client.email || uid || "Client")}</h3>
            <p class="result-copy">${escapeHtml(buildClientSubtitle(client))}</p>
          </div>
          <span class="lock-pill ${presentation.className}">${escapeHtml(presentation.label)}</span>
        </div>

        <div class="result-grid">
          <div>
            <span>HTG visibles</span>
            <strong>${formatHtg(safeInt(client.approvedHtgAvailable) + safeInt(client.provisionalHtgAvailable))}</strong>
          </div>
          <div>
            <span>HTG retirable</span>
            <strong>${formatHtg(safeInt(client.withdrawableHtg))}</strong>
          </div>
          <div>
            <span>Gel temporaire</span>
            <strong>${client.withdrawalTemporaryHold === true ? "Wi" : "Non"}</strong>
          </div>
          <div>
            <span>Derniere activite</span>
            <strong>${escapeHtml(formatDateTime(client.updatedAtMs || client.lastSeenAtMs || client.createdAtMs))}</strong>
          </div>
        </div>

        <div class="result-actions">
          <button class="primary-btn" type="button" data-withdrawal-temp-select="${escapeHtml(uid)}">Selectionner ce client</button>
        </div>
      </article>
    `;
  }).join("");

  setActionBusy(false);
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
    state.results = state.results.map((item) => {
      const itemUid = String(item.uid || item.id || "").trim();
      return itemUid === uid ? { ...item, ...client } : item;
    });
    renderResults();
    if (client.withdrawalTemporaryHold === true) {
      setActionStatus("Client charge. Le gel retrait temporaire est deja actif sur ce compte.", "warn");
    } else {
      setActionStatus("Client charge. Tu peux maintenant activer ou retirer le gel retrait temporaire.", "success");
    }
  } catch (error) {
    state.selectedClientContext = null;
    setActionStatus(error?.message || "Impossible de charger le contexte client.", "error");
  }
}

async function setTemporaryHold(active) {
  if (!state.selectedClientId) {
    setActionStatus("Selectionne d'abord un client.", "warn");
    return;
  }

  const reason = String(dom.reasonInput.value || "").trim();
  setActionBusy(true);
  setActionStatus(active ? "Activation du gel retrait temporaire..." : "Retrait du gel temporaire...");

  try {
    await setWithdrawalTemporaryHoldSecure({
      uid: state.selectedClientId,
      active,
      reason,
      message: TEMPORARY_WITHDRAWAL_HOLD_MESSAGE,
    });
    await selectClient(state.selectedClientId);
    setActionStatus(
      active
        ? "Le gel retrait temporaire est maintenant actif pour ce joueur."
        : "Le gel retrait temporaire a ete retire pour ce joueur.",
      "success",
    );
  } catch (error) {
    setActionStatus(error?.message || "Impossible de mettre a jour le gel retrait temporaire.", "error");
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
    const target = event.target instanceof Element ? event.target.closest("[data-withdrawal-temp-select]") : null;
    if (!target) return;
    const uid = String(target.getAttribute("data-withdrawal-temp-select") || "").trim();
    if (!uid) return;
    void selectClient(uid);
  });
  dom.enableBtn.addEventListener("click", () => {
    void setTemporaryHold(true);
  });
  dom.disableBtn.addEventListener("click", () => {
    void setTemporaryHold(false);
  });
}

async function boot() {
  try {
    state.adminUser = await ensureFinanceDashboardSession({ fallbackUrl: "./index.html" });
  } catch (_) {
    return;
  }

  dom.adminEmail.textContent = state.adminUser?.email || "-";
  dom.empty.textContent = "Recherche un client pour activer ou retirer un gel retrait temporaire.";
  bindEvents();
  setActionBusy(false);
}

void boot();

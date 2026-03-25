import { ensureFinanceDashboardSession } from "./dashboard-admin-auth.js";
import {
  creditAgentDepositSecure,
  getAgentDepositClientContextSecure,
  searchAgentDepositClientsSecure,
} from "./secure-functions.js";

const dom = {
  searchInput: document.getElementById("agentDepositSearchInput"),
  searchBtn: document.getElementById("agentDepositSearchBtn"),
  status: document.getElementById("agentDepositStatus"),
  resultsCount: document.getElementById("agentDepositResultsCount"),
  queryEcho: document.getElementById("agentDepositQueryEcho"),
  adminEmail: document.getElementById("agentDepositAdminEmail"),
  results: document.getElementById("agentDepositResults"),
  empty: document.getElementById("agentDepositEmpty"),
  modalOverlay: document.getElementById("agentDepositModalOverlay"),
  modalTitle: document.getElementById("agentDepositModalTitle"),
  modalCopy: document.getElementById("agentDepositModalCopy"),
  modalClose: document.getElementById("agentDepositModalClose"),
  historyList: document.getElementById("agentDepositHistoryList"),
  creditForm: document.getElementById("agentDepositCreditForm"),
  amountInput: document.getElementById("agentDepositAmountInput"),
  methodSelect: document.getElementById("agentDepositMethodSelect"),
  noteInput: document.getElementById("agentDepositNoteInput"),
  modalStatus: document.getElementById("agentDepositModalStatus"),
  cancelBtn: document.getElementById("agentDepositCancelBtn"),
  submitBtn: document.getElementById("agentDepositSubmitBtn"),
};

const state = {
  adminUser: null,
  lastQuery: "",
  searchSeq: 0,
  results: [],
  activeClient: null,
  activeContext: null,
  modalBusy: false,
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

function formatDoes(value) {
  return `${formatInt(value)} Does`;
}

function formatDateTime(ms = 0) {
  const ts = safeInt(ms);
  if (ts <= 0) return "Date inconnue";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(ts));
}

function setStatus(text, tone = "neutral") {
  if (!dom.status) return;
  dom.status.textContent = String(text || "");
  dom.status.style.color = tone === "error"
    ? "#ff9bab"
    : tone === "success"
      ? "#88f3ca"
      : tone === "warn"
        ? "#ffd38a"
        : "";
}

function setModalStatus(text, tone = "neutral") {
  if (!dom.modalStatus) return;
  dom.modalStatus.textContent = String(text || "");
  dom.modalStatus.style.color = tone === "error"
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

function setModalBusy(busy) {
  state.modalBusy = busy === true;
  dom.submitBtn.disabled = state.modalBusy;
  dom.cancelBtn.disabled = state.modalBusy;
  dom.modalClose.disabled = state.modalBusy;
  dom.amountInput.disabled = state.modalBusy;
  dom.methodSelect.disabled = state.modalBusy;
  dom.noteInput.disabled = state.modalBusy;
  dom.submitBtn.textContent = state.modalBusy ? "Crédit..." : "Créditer";
}

function methodLabel(methodId = "", methodName = "") {
  const id = String(methodId || "").toLowerCase();
  if (id === "moncash") return "MonCash";
  if (id === "natcash") return "NatCash";
  if (String(methodName || "").trim()) return String(methodName || "").trim();
  return "Dépôt via agent";
}

function statusLabel(raw = "") {
  const status = String(raw || "").toLowerCase();
  if (status === "approved") return "Approuvé";
  if (status === "rejected") return "Rejeté";
  if (status === "pending") return "En attente";
  return status || "Inconnu";
}

function buildClientSubtitle(client = {}) {
  const chunks = [];
  if (client.email) chunks.push(client.email);
  if (client.phone) chunks.push(client.phone);
  if (client.username) chunks.push(`@${client.username}`);
  return chunks.join(" · ") || `UID ${client.uid || client.id || "-"}`;
}

function renderEmptyState(message = "Aucun client trouvé pour cette recherche.") {
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
    renderEmptyState(state.lastQuery ? "Aucun client trouvé pour cette recherche." : "Entre un identifiant client pour commencer.");
    return;
  }

  dom.empty.style.display = "none";
  dom.results.innerHTML = results.map((client) => `
    <article class="result-card">
      <div class="result-head">
        <div>
          <h3 class="result-title">${escapeHtml(client.name || client.username || client.email || client.uid || "Client sans nom")}</h3>
          <p class="result-copy">${escapeHtml(buildClientSubtitle(client))}</p>
        </div>
        <div style="text-align:right;">
          <div style="font-size:0.82rem;color:${client.accountFrozen ? "#ff9bab" : "#9fd8ff"};font-weight:700;">
            ${client.accountFrozen ? "Compte gelé" : client.hasApprovedDeposit ? "Déjà déposant" : "Sans dépôt approuvé"}
          </div>
          <div style="margin-top:8px;font-size:0.78rem;color:#9db0d5;">UID ${escapeHtml(client.uid || client.id || "-")}</div>
        </div>
      </div>

      <div class="result-grid">
        <div>
          <span>HTG approuvés</span>
          <strong>${formatHtg(client.approvedHtgAvailable)}</strong>
        </div>
        <div>
          <span>HTG provisoires</span>
          <strong>${formatHtg(client.provisionalHtgAvailable)}</strong>
        </div>
        <div>
          <span>Solde Does</span>
          <strong>${formatDoes(client.doesBalance)}</strong>
        </div>
        <div>
          <span>Dernière activité</span>
          <strong>${escapeHtml(formatDateTime(client.lastSeenAtMs || client.createdAtMs))}</strong>
        </div>
      </div>

      <div class="result-actions">
        <button class="primary-btn" type="button" data-agent-credit-client="${escapeHtml(client.uid || client.id || "")}">
          Créditer compte
        </button>
      </div>
    </article>
  `).join("");
}

function renderHistoryList(recentOrders = []) {
  if (!Array.isArray(recentOrders) || !recentOrders.length) {
    dom.historyList.innerHTML = `
      <li class="history-item">
        <small>Aucune commande récente sur ce compte.</small>
        <strong>Le premier crédit agent créera un dépôt approuvé réel.</strong>
      </li>
    `;
    return;
  }

  dom.historyList.innerHTML = recentOrders.map((order) => `
    <li class="history-item">
      <small>${escapeHtml(formatDateTime(order.createdAtMs))}</small>
      <strong>${formatHtg(order.amountHtg)} · ${escapeHtml(methodLabel(order.methodId, order.methodName))}</strong>
      <div style="margin-top:8px;font-size:0.9rem;color:#dbeafe;">
        ${escapeHtml(statusLabel(order.status))}
        ${order.agentAssisted ? " · crédit agent" : ""}
      </div>
      <div style="margin-top:8px;font-size:0.86rem;color:#9db0d5;">
        ${escapeHtml(order.orderType || "deposit")}
        ${safeInt(order.bonusDoesAwarded) > 0 ? ` · bonus ${formatDoes(order.bonusDoesAwarded)}` : ""}
      </div>
    </li>
  `).join("");
}

function openModal() {
  dom.modalOverlay.classList.add("is-open");
  dom.modalOverlay.setAttribute("aria-hidden", "false");
}

function closeModal() {
  if (state.modalBusy) return;
  dom.modalOverlay.classList.remove("is-open");
  dom.modalOverlay.setAttribute("aria-hidden", "true");
  state.activeClient = null;
  state.activeContext = null;
  setModalStatus("");
  dom.creditForm.reset();
  dom.methodSelect.value = "agent_assisted";
}

async function searchClients() {
  const query = String(dom.searchInput.value || "").trim();
  state.lastQuery = query;
  dom.queryEcho.textContent = query || "-";

  if (!query) {
    setStatus("Entre un UID, un email, un téléphone ou un username.", "warn");
    state.results = [];
    renderResults();
    return;
  }

  const currentSeq = ++state.searchSeq;
  setSearchBusy(true);
  setStatus("Recherche client en cours...");

  try {
    const response = await searchAgentDepositClientsSecure({ query });
    if (currentSeq !== state.searchSeq) return;

    state.results = Array.isArray(response?.results) ? response.results : [];
    renderResults();
    setStatus(
      state.results.length
        ? `${formatInt(state.results.length)} client(s) trouvé(s).`
        : "Aucun client trouvé.",
      state.results.length ? "success" : "warn"
    );
  } catch (error) {
    if (currentSeq !== state.searchSeq) return;
    state.results = [];
    renderResults();
    setStatus(error?.message || "Impossible de rechercher le client.", "error");
  } finally {
    if (currentSeq === state.searchSeq) {
      setSearchBusy(false);
    }
  }
}

async function openCreditModal(clientId = "") {
  const id = String(clientId || "").trim();
  if (!id) return;

  const seedClient = state.results.find((item) => String(item.uid || item.id || "") === id) || null;
  state.activeClient = seedClient;
  openModal();
  setModalBusy(false);
  setModalStatus("");
  dom.modalTitle.textContent = seedClient?.name || seedClient?.email || "Chargement du client";
  dom.modalCopy.textContent = "Chargement de l’historique commandes et du contexte du compte.";
  dom.historyList.innerHTML = `
    <li class="history-item">
      <small>Chargement...</small>
      <strong>Préparation du contexte client.</strong>
    </li>
  `;

  try {
    const response = await getAgentDepositClientContextSecure({ clientId: id });
    const client = response?.client || seedClient || { uid: id, id };
    state.activeClient = client;
    state.activeContext = response || null;

    dom.modalTitle.textContent = client.name || client.username || client.email || client.uid || "Client";
    dom.modalCopy.textContent = `UID ${client.uid || client.id || "-"} · ${buildClientSubtitle(client)} · solde HTG ${formatHtg(client.htgBalance)} · solde Does ${formatDoes(client.doesBalance)}.`;
    renderHistoryList(response?.recentOrders || []);
    dom.amountInput.focus();
  } catch (error) {
    dom.modalTitle.textContent = "Chargement impossible";
    dom.modalCopy.textContent = error?.message || "Impossible de charger le contexte client.";
    renderHistoryList([]);
    setModalStatus(error?.message || "Impossible de charger le contexte client.", "error");
  }
}

async function submitAgentCredit(event) {
  event.preventDefault();
  if (state.modalBusy) return;

  const clientId = String(state.activeClient?.uid || state.activeClient?.id || "").trim();
  const amountHtg = safeInt(dom.amountInput.value);
  const methodId = String(dom.methodSelect.value || "agent_assisted").trim().toLowerCase();
  const note = String(dom.noteInput.value || "").trim();

  if (!clientId) {
    setModalStatus("Client introuvable.", "error");
    return;
  }
  if (amountHtg <= 0) {
    setModalStatus("Entre un montant HTG valide.", "error");
    dom.amountInput.focus();
    return;
  }

  setModalBusy(true);
  setModalStatus("Crédit agent en cours...");

  try {
    const response = await creditAgentDepositSecure({
      clientId,
      amountHtg,
      methodId,
      note,
    });

    const bonusCopy = safeInt(response?.bonusDoesAwarded) > 0
      ? ` Bonus automatique: ${formatDoes(response.bonusDoesAwarded)}.`
      : "";
    setModalStatus(`Compte crédité: ${formatHtg(response?.amountHtg || amountHtg)} via ${methodLabel(response?.methodId, response?.methodName)}.${bonusCopy}`, "success");

    dom.amountInput.value = "";
    dom.noteInput.value = "";

    await openCreditModal(clientId);
    if (state.lastQuery) {
      void searchClients();
    }
  } catch (error) {
    setModalStatus(error?.message || "Impossible de créditer le compte.", "error");
  } finally {
    setModalBusy(false);
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
      ? event.target.closest("[data-agent-credit-client]")
      : null;
    if (!target) return;
    const clientId = String(target.getAttribute("data-agent-credit-client") || "").trim();
    void openCreditModal(clientId);
  });

  dom.creditForm.addEventListener("submit", (event) => {
    void submitAgentCredit(event);
  });

  dom.cancelBtn.addEventListener("click", () => {
    closeModal();
  });

  dom.modalClose.addEventListener("click", () => {
    closeModal();
  });

  dom.modalOverlay.addEventListener("click", (event) => {
    if (event.target === dom.modalOverlay) {
      closeModal();
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeModal();
    }
  });
}

async function bootstrap() {
  setStatus("Connexion admin en cours...");
  renderEmptyState("Connexion admin en cours...");

  try {
    state.adminUser = await ensureFinanceDashboardSession({
      title: "Crédit agent",
      description: "Connecte-toi avec le compte finance autorisé pour rechercher un client et créditer son compte.",
    });
    dom.adminEmail.textContent = state.adminUser?.email || "-";
    setStatus("Recherche prête. Entre un client pour commencer.");
    renderEmptyState("Entre un identifiant client pour commencer.");
  } catch (error) {
    dom.adminEmail.textContent = "-";
    setStatus(error?.message || "Accès refusé.", "error");
    renderEmptyState("Connexion admin requise pour utiliser cette page.");
  }
}

bindEvents();
void bootstrap();

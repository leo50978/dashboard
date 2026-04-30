import { ensureFinanceDashboardSession } from "./dashboard-admin-auth.js";
import {
  adminCreateAutomaticWithdrawalSecure,
  getAgentDepositClientContextSecure,
  searchAgentDepositClientsSecure,
} from "./secure-functions.js";

const dom = {
  searchInput: document.getElementById("agentWithdrawalSearchInput"),
  searchBtn: document.getElementById("agentWithdrawalSearchBtn"),
  status: document.getElementById("agentWithdrawalStatus"),
  resultsCount: document.getElementById("agentWithdrawalResultsCount"),
  queryEcho: document.getElementById("agentWithdrawalQueryEcho"),
  adminEmail: document.getElementById("agentWithdrawalAdminEmail"),
  results: document.getElementById("agentWithdrawalResults"),
  empty: document.getElementById("agentWithdrawalEmpty"),
  modalOverlay: document.getElementById("agentWithdrawalModalOverlay"),
  modalTitle: document.getElementById("agentWithdrawalModalTitle"),
  modalCopy: document.getElementById("agentWithdrawalModalCopy"),
  modalClose: document.getElementById("agentWithdrawalModalClose"),
  withdrawalList: document.getElementById("agentWithdrawalHistoryList"),
  form: document.getElementById("agentWithdrawalForm"),
  amountInput: document.getElementById("agentWithdrawalAmountInput"),
  methodSelect: document.getElementById("agentWithdrawalMethodSelect"),
  destinationInput: document.getElementById("agentWithdrawalDestinationInput"),
  noteInput: document.getElementById("agentWithdrawalNoteInput"),
  modalStatus: document.getElementById("agentWithdrawalModalStatus"),
  cancelBtn: document.getElementById("agentWithdrawalCancelBtn"),
  submitBtn: document.getElementById("agentWithdrawalSubmitBtn"),
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
  return Number.isFinite(num) ? Math.max(0, Math.trunc(num)) : 0;
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
  dom.status.dataset.tone = tone;
}

function setModalStatus(text, tone = "neutral") {
  if (!dom.modalStatus) return;
  dom.modalStatus.textContent = String(text || "");
  dom.modalStatus.dataset.tone = tone;
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
  dom.destinationInput.disabled = state.modalBusy;
  dom.noteInput.disabled = state.modalBusy;
  dom.submitBtn.textContent = state.modalBusy ? "Retrait..." : "Retirer HTG";
}

function methodLabel(methodId = "") {
  const id = String(methodId || "").toLowerCase();
  if (id === "moncash") return "MonCash";
  if (id === "natcash") return "NatCash";
  if (id === "cash") return "Cash";
  if (id === "admin_auto") return "Retrait automatique admin";
  return methodId || "Retrait";
}

function statusLabel(raw = "") {
  const status = String(raw || "").toLowerCase();
  if (status === "approved") return "Approuvé";
  if (status === "rejected") return "Rejeté";
  if (status === "pending") return "En attente";
  if (status === "review") return "En examen";
  if (status === "cancelled" || status === "canceled") return "Annulé";
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
  dom.results.innerHTML = results.map((client) => {
    const frozenCopy = client.accountFrozen ? "Compte gelé" : "Retrait possible après vérification";
    return `
      <article class="result-card">
        <div class="result-head">
          <div>
            <h3 class="result-title">${escapeHtml(client.name || client.username || client.email || client.uid || "Client sans nom")}</h3>
            <p class="result-copy">${escapeHtml(buildClientSubtitle(client))}</p>
          </div>
          <div class="result-state ${client.accountFrozen ? "is-danger" : ""}">
            ${escapeHtml(frozenCopy)}
          </div>
        </div>

        <div class="result-grid">
          <div>
            <span>HTG approuvés</span>
            <strong>${formatHtg(client.approvedHtgAvailable)}</strong>
          </div>
          <div>
            <span>HTG retirable</span>
            <strong>${formatHtg(client.withdrawableHtg)}</strong>
          </div>
          <div>
            <span>Retraits réservés</span>
            <strong>${formatHtg(client.reservedWithdrawalsHtg)}</strong>
          </div>
          <div>
            <span>Solde Does</span>
            <strong>${formatDoes(client.doesBalance)}</strong>
          </div>
        </div>

        <div class="result-actions">
          <button class="primary-btn" type="button" data-agent-withdraw-client="${escapeHtml(client.uid || client.id || "")}">
            Ouvrir retrait
          </button>
        </div>
      </article>
    `;
  }).join("");
}

function renderWithdrawalList(recentWithdrawals = []) {
  if (!Array.isArray(recentWithdrawals) || !recentWithdrawals.length) {
    dom.withdrawalList.innerHTML = `
      <li class="history-item">
        <small>Aucun retrait récent sur ce compte.</small>
        <strong>Le retrait automatique créera une trace approuvée et auditée.</strong>
      </li>
    `;
    return;
  }

  dom.withdrawalList.innerHTML = recentWithdrawals.map((withdrawal) => `
    <li class="history-item">
      <small>${escapeHtml(formatDateTime(withdrawal.createdAtMs))}</small>
      <strong>${formatHtg(withdrawal.amountHtg || withdrawal.requestedAmount)} · ${escapeHtml(methodLabel(withdrawal.methodId || withdrawal.destinationType))}</strong>
      <div class="history-meta">
        ${escapeHtml(statusLabel(withdrawal.status))}
        ${withdrawal.automaticWithdrawal ? " · retrait automatique" : ""}
        ${withdrawal.processedByAdminEmail ? ` · ${escapeHtml(withdrawal.processedByAdminEmail)}` : ""}
      </div>
      <div class="history-muted">ID ${escapeHtml(withdrawal.id || withdrawal.withdrawalId || "-")}</div>
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
  dom.form.reset();
  dom.methodSelect.value = "admin_auto";
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

async function openWithdrawalModal(clientId = "") {
  const id = String(clientId || "").trim();
  if (!id) return;

  const seedClient = state.results.find((item) => String(item.uid || item.id || "") === id) || null;
  state.activeClient = seedClient;
  openModal();
  setModalBusy(false);
  setModalStatus("");
  dom.modalTitle.textContent = seedClient?.name || seedClient?.email || "Chargement du client";
  dom.modalCopy.textContent = "Chargement des soldes, retraits réservés et historique.";
  dom.withdrawalList.innerHTML = `
    <li class="history-item">
      <small>Chargement...</small>
      <strong>Préparation du contexte retrait.</strong>
    </li>
  `;

  try {
    const response = await getAgentDepositClientContextSecure({
      clientId: id,
      recentOrdersLimit: 3,
      recentWithdrawalsLimit: 8,
    });
    const client = response?.client || seedClient || { uid: id, id };
    const funding = response?.fundingSnapshot || {};
    state.activeClient = {
      ...client,
      withdrawableHtg: safeInt(client.withdrawableHtg ?? funding.withdrawableHtg),
      approvedHtgAvailable: safeInt(client.approvedHtgAvailable ?? funding.approvedHtgAvailable),
      reservedWithdrawalsHtg: safeInt(client.reservedWithdrawalsHtg ?? funding.reservedWithdrawalsHtg),
    };
    state.activeContext = response || null;

    dom.modalTitle.textContent = client.name || client.username || client.email || client.uid || "Client";
    dom.modalCopy.textContent = `UID ${client.uid || client.id || "-"} · ${buildClientSubtitle(client)} · HTG retirable ${formatHtg(state.activeClient.withdrawableHtg)} · HTG approuvés ${formatHtg(state.activeClient.approvedHtgAvailable)} · retraits réservés ${formatHtg(state.activeClient.reservedWithdrawalsHtg)}.`;
    dom.amountInput.max = String(state.activeClient.withdrawableHtg || "");
    renderWithdrawalList(response?.recentWithdrawals || []);
    dom.amountInput.focus();
  } catch (error) {
    dom.modalTitle.textContent = "Chargement impossible";
    dom.modalCopy.textContent = error?.message || "Impossible de charger le contexte client.";
    renderWithdrawalList([]);
    setModalStatus(error?.message || "Impossible de charger le contexte client.", "error");
  }
}

async function submitAutomaticWithdrawal(event) {
  event.preventDefault();
  if (state.modalBusy) return;

  const clientId = String(state.activeClient?.uid || state.activeClient?.id || "").trim();
  const amountHtg = safeInt(dom.amountInput.value);
  const methodId = String(dom.methodSelect.value || "admin_auto").trim().toLowerCase();
  const destinationValue = String(dom.destinationInput.value || "").trim();
  const note = String(dom.noteInput.value || "").trim();
  const withdrawableHtg = safeInt(state.activeClient?.withdrawableHtg);

  if (!clientId) {
    setModalStatus("Client introuvable.", "error");
    return;
  }
  if (amountHtg <= 0) {
    setModalStatus("Entre un montant HTG valide.", "error");
    dom.amountInput.focus();
    return;
  }
  if (amountHtg > withdrawableHtg) {
    setModalStatus(`Montant supérieur au HTG retirable: ${formatHtg(withdrawableHtg)}.`, "error");
    dom.amountInput.focus();
    return;
  }
  if (note.length < 4) {
    setModalStatus("Ajoute une note interne pour expliquer ce retrait.", "error");
    dom.noteInput.focus();
    return;
  }

  const confirmed = window.confirm(
    `Confirmer le retrait automatique ?\n\nClient: ${clientId}\nMontant: ${formatHtg(amountHtg)}\nHTG retirable actuel: ${formatHtg(withdrawableHtg)}\nMéthode: ${methodLabel(methodId)}`
  );
  if (!confirmed) {
    setModalStatus("Retrait annulé.", "warn");
    return;
  }

  setModalBusy(true);
  setModalStatus("Retrait automatique en cours...");

  try {
    const response = await adminCreateAutomaticWithdrawalSecure({
      clientId,
      amountHtg,
      methodId,
      destinationValue,
      note,
    });

    const successMessage = `Retrait réussi: ${formatHtg(response?.amountHtg || amountHtg)} retirés. Nouveau HTG retirable: ${formatHtg(response?.afterWithdrawableHtg)}.`;
    setModalStatus(successMessage, "success");
    dom.amountInput.value = "";
    dom.destinationInput.value = "";
    dom.noteInput.value = "";

    await openWithdrawalModal(clientId);
    setModalStatus(successMessage, "success");
    if (state.lastQuery) {
      void searchClients();
    }
  } catch (error) {
    setModalStatus(error?.message || "Impossible d'effectuer le retrait automatique.", "error");
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
      ? event.target.closest("[data-agent-withdraw-client]")
      : null;
    if (!target) return;
    const clientId = String(target.getAttribute("data-agent-withdraw-client") || "").trim();
    void openWithdrawalModal(clientId);
  });

  dom.form.addEventListener("submit", (event) => {
    void submitAutomaticWithdrawal(event);
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
      title: "Retrait automatique",
      description: "Connecte-toi avec le compte finance autorisé pour rechercher un client et retirer du HTG de son compte.",
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

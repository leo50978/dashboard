import { ensureFinanceDashboardSession } from "./dashboard-admin-auth.js";
import {
  adminSetClientPasswordSecure,
  getAgentDepositClientContextSecure,
  searchAgentDepositClientsSecure,
} from "./secure-functions.js";

const dom = {
  searchInput: document.getElementById("passwordRecoverySearchInput"),
  searchBtn: document.getElementById("passwordRecoverySearchBtn"),
  status: document.getElementById("passwordRecoveryStatus"),
  resultsCount: document.getElementById("passwordRecoveryResultsCount"),
  queryEcho: document.getElementById("passwordRecoveryQueryEcho"),
  adminEmail: document.getElementById("passwordRecoveryAdminEmail"),
  results: document.getElementById("passwordRecoveryResults"),
  empty: document.getElementById("passwordRecoveryEmpty"),
  modalOverlay: document.getElementById("passwordRecoveryModalOverlay"),
  modalTitle: document.getElementById("passwordRecoveryModalTitle"),
  modalCopy: document.getElementById("passwordRecoveryModalCopy"),
  modalClose: document.getElementById("passwordRecoveryModalClose"),
  form: document.getElementById("passwordRecoveryForm"),
  newPasswordInput: document.getElementById("passwordRecoveryNewPassword"),
  confirmPasswordInput: document.getElementById("passwordRecoveryConfirmPassword"),
  noteInput: document.getElementById("passwordRecoveryNoteInput"),
  generateBtn: document.getElementById("passwordRecoveryGenerateBtn"),
  copyBtn: document.getElementById("passwordRecoveryCopyBtn"),
  modalStatus: document.getElementById("passwordRecoveryModalStatus"),
  cancelBtn: document.getElementById("passwordRecoveryCancelBtn"),
  submitBtn: document.getElementById("passwordRecoverySubmitBtn"),
};

const state = {
  adminUser: null,
  lastQuery: "",
  searchSeq: 0,
  results: [],
  activeClient: null,
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

function formatDateTime(ms = 0) {
  const ts = safeInt(ms);
  if (ts <= 0) return "Date inconnue";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(ts));
}

function formatDoes(value) {
  return `${formatInt(value)} Does`;
}

function formatHtg(value) {
  return `${formatInt(value)} HTG`;
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
  [dom.newPasswordInput, dom.confirmPasswordInput, dom.noteInput, dom.generateBtn, dom.copyBtn, dom.cancelBtn, dom.modalClose, dom.submitBtn]
    .forEach((el) => {
      if (el) el.disabled = state.modalBusy;
    });
  dom.submitBtn.textContent = state.modalBusy ? "Reinitialisation..." : "Reinitialiser";
}

function buildClientSubtitle(client = {}) {
  const chunks = [];
  if (client.email) chunks.push(client.email);
  if (client.phone) chunks.push(client.phone);
  if (client.username) chunks.push(`@${client.username}`);
  return chunks.join(" Â· ") || `UID ${client.uid || client.id || "-"}`;
}

function buildRandomPassword(length = 10) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let value = "DLK";
  while (value.length < Math.max(6, length)) {
    value += chars[Math.floor(Math.random() * chars.length)];
  }
  return value.slice(0, Math.max(6, length));
}

async function copyToClipboard(text) {
  const value = String(text || "").trim();
  if (!value) return false;
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch (_) {
    const area = document.createElement("textarea");
    area.value = value;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  }
}

function renderEmptyState(message = "Aucun client trouvÃ© pour cette recherche.") {
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
    renderEmptyState(state.lastQuery ? "Aucun client trouvÃ© pour cette recherche." : "Entre un identifiant client pour commencer.");
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
            ${client.accountFrozen ? "Compte gelÃ©" : "Compte actif"}
          </div>
          <div style="margin-top:8px;font-size:0.78rem;color:#9db0d5;">UID ${escapeHtml(client.uid || client.id || "-")}</div>
        </div>
      </div>

      <div class="result-grid">
        <div>
          <span>HTG approuvÃ©s</span>
          <strong>${formatHtg(client.approvedHtgAvailable)}</strong>
        </div>
        <div>
          <span>Does</span>
          <strong>${formatDoes(client.doesBalance)}</strong>
        </div>
        <div>
          <span>DerniÃ¨re activitÃ©</span>
          <strong>${escapeHtml(formatDateTime(client.lastSeenAtMs || client.createdAtMs))}</strong>
        </div>
        <div>
          <span>Statut dÃ©pÃ´t</span>
          <strong>${client.hasApprovedDeposit ? "DÃ©posant" : "Sans dÃ©pÃ´t approuvÃ©"}</strong>
        </div>
      </div>

      <div class="result-actions">
        <button class="primary-btn" type="button" data-password-client="${escapeHtml(client.uid || client.id || "")}">
          Reinitialiser mot de passe
        </button>
      </div>
    </article>
  `).join("");
}

async function searchClients() {
  const query = String(dom.searchInput.value || "").trim();
  state.lastQuery = query;
  dom.queryEcho.textContent = query || "-";

  if (!query) {
    setStatus("Entre un UID, un email, un tÃ©lÃ©phone ou un username.", "warn");
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
      state.results.length ? `${formatInt(state.results.length)} client(s) trouvÃ©(s).` : "Aucun client trouvÃ©.",
      state.results.length ? "success" : "warn",
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

function openModal() {
  dom.modalOverlay.classList.add("is-open");
  dom.modalOverlay.setAttribute("aria-hidden", "false");
}

function closeModal() {
  if (state.modalBusy) return;
  dom.modalOverlay.classList.remove("is-open");
  dom.modalOverlay.setAttribute("aria-hidden", "true");
  state.activeClient = null;
  setModalStatus("");
  dom.form.reset();
}

async function openResetModal(clientId = "") {
  const id = String(clientId || "").trim();
  if (!id) return;

  const seedClient = state.results.find((item) => String(item.uid || item.id || "") === id) || null;
  state.activeClient = seedClient;
  openModal();
  setModalBusy(false);
  setModalStatus("");
  dom.modalTitle.textContent = seedClient?.name || seedClient?.email || "Chargement du client";
  dom.modalCopy.textContent = "Chargement du contexte client.";
  dom.newPasswordInput.value = buildRandomPassword();
  dom.confirmPasswordInput.value = dom.newPasswordInput.value;
  dom.noteInput.value = "";

  try {
    const response = await getAgentDepositClientContextSecure({ clientId: id });
    const client = response?.client || seedClient || { uid: id, id };
    state.activeClient = client;
    dom.modalTitle.textContent = client.name || client.username || client.email || client.uid || "Client";
    dom.modalCopy.textContent = `UID ${client.uid || client.id || "-"} Â· ${buildClientSubtitle(client)} Â· HTG ${formatHtg(client.htgBalance)} Â· Does ${formatDoes(client.doesBalance)}.`;
    dom.newPasswordInput.focus();
    dom.newPasswordInput.select();
  } catch (error) {
    dom.modalTitle.textContent = "Chargement impossible";
    dom.modalCopy.textContent = error?.message || "Impossible de charger le contexte client.";
    setModalStatus(error?.message || "Impossible de charger le contexte client.", "error");
  }
}

async function submitPasswordReset(event) {
  event.preventDefault();
  if (state.modalBusy) return;

  const clientId = String(state.activeClient?.uid || state.activeClient?.id || "").trim();
  const newPassword = String(dom.newPasswordInput.value || "").trim();
  const confirmPassword = String(dom.confirmPasswordInput.value || "").trim();
  const note = String(dom.noteInput.value || "").trim();

  if (!clientId) {
    setModalStatus("Client introuvable.", "error");
    return;
  }
  if (newPassword.length < 6) {
    setModalStatus("Le nouveau mot de passe doit contenir au moins 6 caracteres.", "error");
    dom.newPasswordInput.focus();
    return;
  }
  if (newPassword !== confirmPassword) {
    setModalStatus("La confirmation ne correspond pas.", "error");
    dom.confirmPasswordInput.focus();
    return;
  }

  setModalBusy(true);
  setModalStatus("Reinitialisation du mot de passe en cours...");

  try {
    await adminSetClientPasswordSecure({
      clientId,
      newPassword,
      note,
    });
    setModalStatus(`Mot de passe mis a jour. Donne maintenant ce code au client: ${newPassword}`, "success");
  } catch (error) {
    setModalStatus(error?.message || "Impossible de reinitialiser le mot de passe.", "error");
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
      ? event.target.closest("[data-password-client]")
      : null;
    if (!target) return;
    const clientId = String(target.getAttribute("data-password-client") || "").trim();
    void openResetModal(clientId);
  });

  dom.form.addEventListener("submit", (event) => {
    void submitPasswordReset(event);
  });

  dom.generateBtn.addEventListener("click", () => {
    const password = buildRandomPassword();
    dom.newPasswordInput.value = password;
    dom.confirmPasswordInput.value = password;
    setModalStatus("Nouveau mot de passe temporaire genere.", "success");
  });

  dom.copyBtn.addEventListener("click", async () => {
    const ok = await copyToClipboard(dom.newPasswordInput.value || "");
    setModalStatus(ok ? "Mot de passe copie." : "Impossible de copier le mot de passe.", ok ? "success" : "error");
  });

  dom.cancelBtn.addEventListener("click", closeModal);
  dom.modalClose.addEventListener("click", closeModal);
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
      title: "Recuperation mot de passe",
      description: "Connecte-toi avec le compte finance autorise pour rechercher un client et definir un nouveau mot de passe temporaire.",
    });
    dom.adminEmail.textContent = state.adminUser?.email || "-";
    setStatus("Recherche prÃªte. Entre un client pour commencer.");
    renderEmptyState("Entre un identifiant client pour commencer.");
  } catch (error) {
    dom.adminEmail.textContent = "-";
    setStatus(error?.message || "AccÃ¨s refusÃ©.", "error");
    renderEmptyState("Connexion admin requise pour utiliser cette page.");
  }
}

bindEvents();
void bootstrap();


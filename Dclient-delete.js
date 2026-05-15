import { ensureFinanceDashboardSession } from "./dashboard-admin-auth.js";
import {
  deleteClientAccountSecure,
  searchAgentDepositClientsSecure,
} from "./secure-functions.js";

const dom = {
  searchInput: document.getElementById("clientDeleteSearchInput"),
  searchBtn: document.getElementById("clientDeleteSearchBtn"),
  searchStatus: document.getElementById("clientDeleteSearchStatus"),
  results: document.getElementById("clientDeleteResults"),
  selected: document.getElementById("clientDeleteSelected"),
  noteInput: document.getElementById("clientDeleteNoteInput"),
  deleteBtn: document.getElementById("clientDeleteBtn"),
  actionStatus: document.getElementById("clientDeleteActionStatus"),
  output: document.getElementById("clientDeleteOutput"),
};

const state = {
  adminUser: null,
  selectedClient: null,
  busy: false,
};

function escapeHtml(value = "") {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setSearchStatus(message = "", tone = "neutral") {
  dom.searchStatus.textContent = String(message || "");
  dom.searchStatus.dataset.tone = tone;
}

function setActionStatus(message = "", tone = "neutral") {
  dom.actionStatus.textContent = String(message || "");
  dom.actionStatus.dataset.tone = tone;
}

function renderOutput(payload = null) {
  dom.output.textContent = JSON.stringify(payload || {}, null, 2);
}

function setBusy(busy = false) {
  state.busy = busy === true;
  dom.searchInput.disabled = state.busy;
  dom.searchBtn.disabled = state.busy;
  dom.deleteBtn.disabled = state.busy || !state.selectedClient;
}

function getSelectedClientId() {
  return String(state.selectedClient?.uid || state.selectedClient?.id || "").trim();
}

function renderSelectedClient() {
  const client = state.selectedClient;
  if (!client) {
    dom.selected.innerHTML = `
      <strong>Aucun client selectionne.</strong>
      <div class="muted">Choisis d'abord un resultat de recherche.</div>
    `;
    dom.deleteBtn.disabled = true;
    return;
  }

  const uid = String(client.uid || client.id || "").trim();
  const label = client.name || client.displayName || client.username || client.email || uid || "Client";
  const meta = [
    client.email,
    client.phone,
    client.username ? `@${client.username}` : "",
  ].filter(Boolean).join(" | ");

  dom.selected.innerHTML = `
    <strong>${escapeHtml(label)}</strong>
    <div class="muted">${escapeHtml(meta || uid)}</div>
    <div class="muted" style="margin-top:6px;">UID: ${escapeHtml(uid)}</div>
  `;
  dom.deleteBtn.disabled = state.busy !== true ? false : true;
}

function selectClient(client = null) {
  state.selectedClient = client && typeof client === "object" ? client : null;
  renderSelectedClient();

  const selectedId = getSelectedClientId();
  dom.results.querySelectorAll(".result-item").forEach((node) => {
    node.classList.toggle("is-active", String(node.getAttribute("data-client-id") || "") === selectedId);
  });
}

function formatBlockers(blockers = {}) {
  const parts = [];
  if (blockers.isProtected) parts.push("compte protege");
  if (blockers.hasBalance) parts.push(`solde detecte (${Number(blockers.htgBalance || 0)} HTG)`);
  if (blockers.hasOrders) parts.push("orders presentes");
  if (blockers.hasWithdrawals) parts.push("withdrawals presentes");
  if (blockers.hasHistory) parts.push("historique detecte");
  return parts.length ? parts.join(" | ") : "aucun blocage detaille retourne";
}

function renderResults(rows = []) {
  if (!Array.isArray(rows) || !rows.length) {
    dom.results.innerHTML = `<div class="muted">Aucun client trouve.</div>`;
    selectClient(null);
    return;
  }

  dom.results.innerHTML = rows.map((row) => {
    const uid = String(row.uid || row.id || "").trim();
    const label = row.name || row.displayName || row.username || row.email || uid || "Client";
    const meta = [
      row.email,
      row.phone,
      row.username ? `@${row.username}` : "",
    ].filter(Boolean).join(" | ");

    return `
      <article class="result-item" data-client-id="${escapeHtml(uid)}">
        <div class="result-head">
          <div class="result-title">${escapeHtml(label)}</div>
          <button type="button" class="primary-btn" data-pick-id="${escapeHtml(uid)}">Choisir</button>
        </div>
        <div class="result-meta">${escapeHtml(meta || uid)}</div>
      </article>
    `;
  }).join("");

  dom.results.querySelectorAll(".result-item").forEach((node) => {
    node.addEventListener("click", (event) => {
      const clickedId = String(node.getAttribute("data-client-id") || "").trim();
      const client = rows.find((row) => String(row.uid || row.id || "").trim() === clickedId) || null;
      selectClient(client);
      if (event.target instanceof HTMLElement && event.target.matches("button")) {
        event.preventDefault();
      }
    });
  });
}

async function runSearch() {
  const query = String(dom.searchInput.value || "").trim();
  if (!query) {
    setSearchStatus("Entre une recherche.", "warn");
    return;
  }

  setBusy(true);
  setSearchStatus("Recherche en cours...", "neutral");
  setActionStatus("", "neutral");
  try {
    const response = await searchAgentDepositClientsSecure({ query });
    const rows = Array.isArray(response?.results) ? response.results : [];
    renderResults(rows);
    setSearchStatus(`${rows.length} client(s) trouve(s).`, rows.length ? "good" : "warn");
  } catch (error) {
    renderResults([]);
    setSearchStatus(error?.message || "Recherche impossible.", "bad");
  } finally {
    setBusy(false);
  }
}

async function runDelete() {
  const clientId = getSelectedClientId();
  if (!clientId) {
    setActionStatus("Choisis d'abord un client.", "warn");
    return;
  }

  const confirmed = window.confirm("Confirmer la suppression definitive de ce compte client ?");
  if (!confirmed) return;

  setBusy(true);
  setActionStatus("Suppression en cours...", "neutral");
  try {
    const response = await deleteClientAccountSecure({
      clientId,
      note: String(dom.noteInput.value || "").trim(),
    });
    renderOutput(response || {});
    setActionStatus("Compte supprime avec succes.", "good");
    selectClient(null);
    dom.results.innerHTML = `<div class="muted">Le compte a ete supprime. Relance une recherche pour continuer.</div>`;
    dom.noteInput.value = "";
  } catch (error) {
    const blockers = error?.blockers || error?.details?.blockers || null;
    renderOutput({
      ok: false,
      code: error?.code || "unknown",
      message: error?.message || "Suppression impossible.",
      blockers,
    });

    if (blockers) {
      setActionStatus(`${error?.message || "Suppression refusee."} ${formatBlockers(blockers)}.`, "bad");
    } else {
      setActionStatus(error?.message || "Suppression impossible.", "bad");
    }
  } finally {
    setBusy(false);
  }
}

function bindEvents() {
  dom.searchBtn.addEventListener("click", () => {
    void runSearch();
  });

  dom.searchInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void runSearch();
  });

  dom.deleteBtn.addEventListener("click", () => {
    void runDelete();
  });
}

async function bootstrap() {
  state.adminUser = await ensureFinanceDashboardSession({
    fallbackUrl: "./index.html",
  });
  bindEvents();
  renderSelectedClient();
}

void bootstrap().catch((error) => {
  console.error("[CLIENT_DELETE] bootstrap failed", error);
  setSearchStatus(error?.message || "Chargement impossible.", "bad");
});

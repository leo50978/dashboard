import { ensureFinanceDashboardSession } from "./dashboard-admin-auth.js";
import {
  resetClientFinancialAccountSecure,
  searchAgentDepositClientsSecure,
} from "./secure-functions.js";

const dom = {
  queryInput: document.getElementById("queryInput"),
  searchBtn: document.getElementById("searchBtn"),
  searchStatus: document.getElementById("searchStatus"),
  results: document.getElementById("results"),
  reasonInput: document.getElementById("reasonInput"),
  previewBtn: document.getElementById("previewBtn"),
  resetBtn: document.getElementById("resetBtn"),
  actionStatus: document.getElementById("actionStatus"),
  output: document.getElementById("output"),
};

const state = {
  selectedClientId: "",
};

function escapeHtml(value = "") {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setSearchStatus(text) {
  dom.searchStatus.textContent = String(text || "");
}

function setActionStatus(text) {
  dom.actionStatus.textContent = String(text || "");
}

function renderOutput(payload) {
  dom.output.textContent = JSON.stringify(payload || {}, null, 2);
}

function renderResults(rows = []) {
  if (!Array.isArray(rows) || !rows.length) {
    dom.results.innerHTML = "<p class='muted'>Aucun client trouvé.</p>";
    state.selectedClientId = "";
    return;
  }

  dom.results.innerHTML = rows.map((row) => {
    const uid = String(row.uid || row.id || "");
    const label = row.name || row.username || row.email || uid || "Client";
    const sub = [row.phone, row.email, row.username ? `@${row.username}` : ""].filter(Boolean).join(" · ");
    return `
      <article class="card result-item" data-client-id="${escapeHtml(uid)}" style="margin-top:10px; cursor:pointer;">
        <strong>${escapeHtml(label)}</strong>
        <div class="muted">${escapeHtml(sub || uid)}</div>
        <button type="button" data-client-id="${escapeHtml(uid)}" style="margin-top:10px;">Selectionner ce client</button>
      </article>
    `;
  }).join("");

  const setSelected = (clientId) => {
    state.selectedClientId = String(clientId || "").trim();
    dom.results.querySelectorAll(".result-item").forEach((item) => {
      const isActive = String(item.getAttribute("data-client-id") || "") === state.selectedClientId;
      item.style.outline = isActive ? "2px solid #36b37e" : "none";
      item.style.background = isActive ? "#183454" : "#132238";
    });
    setActionStatus(state.selectedClientId ? `Client sélectionné: ${state.selectedClientId}` : "");
  };

  dom.results.querySelectorAll("[data-client-id]").forEach((el) => {
    el.addEventListener("click", () => {
      setSelected(el.getAttribute("data-client-id"));
    });
  });
}

async function doSearch() {
  const query = String(dom.queryInput.value || "").trim();
  if (!query) {
    setSearchStatus("Entre une recherche.");
    return;
  }
  dom.searchBtn.disabled = true;
  setSearchStatus("Recherche en cours...");
  try {
    const res = await searchAgentDepositClientsSecure({ query });
    const rows = Array.isArray(res?.results) ? res.results : [];
    renderResults(rows);
    setSearchStatus(`${rows.length} client(s) trouvé(s).`);
  } catch (error) {
    renderResults([]);
    setSearchStatus(error?.message || "Recherche impossible.");
  } finally {
    dom.searchBtn.disabled = false;
  }
}

async function runReset(dryRun) {
  if (!state.selectedClientId) {
    setActionStatus("Sélectionne d'abord un client.");
    return;
  }

  const payload = {
    clientId: state.selectedClientId,
    reason: String(dom.reasonInput.value || "").trim(),
    dryRun: dryRun === true,
  };

  setActionStatus(dryRun ? "Aperçu en cours..." : "Reset réel en cours...");
  dom.previewBtn.disabled = true;
  dom.resetBtn.disabled = true;
  try {
    const res = await resetClientFinancialAccountSecure(payload);
    renderOutput(res || {});
    setActionStatus(dryRun ? "Aperçu terminé." : "Reset financier terminé.");
  } catch (error) {
    setActionStatus(error?.message || "Action impossible.");
  } finally {
    dom.previewBtn.disabled = false;
    dom.resetBtn.disabled = false;
  }
}

dom.searchBtn.addEventListener("click", doSearch);
dom.queryInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    doSearch();
  }
});
dom.previewBtn.addEventListener("click", () => runReset(true));
dom.resetBtn.addEventListener("click", () => runReset(false));

await ensureFinanceDashboardSession({
  fallbackUrl: "./Dhero.html",
});

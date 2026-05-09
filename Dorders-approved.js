import { ensureFinanceDashboardSession } from "./dashboard-admin-auth.js";
import { getApprovedDepositsSnapshotSecure } from "./secure-functions.js";

const dom = {
  status: document.getElementById("approvedDepositsStatus"),
  refreshBtn: document.getElementById("approvedDepositsRefreshBtn"),
  windowSelect: document.getElementById("approvedDepositsWindow"),
  dateFrom: document.getElementById("approvedDepositsDateFrom"),
  dateTo: document.getElementById("approvedDepositsDateTo"),
  generatedAt: document.getElementById("approvedDepositsGeneratedAt"),
  coverage: document.getElementById("approvedDepositsCoverage"),
  totalCount: document.getElementById("approvedDepositsTotalCount"),
  totalAmount: document.getElementById("approvedDepositsTotalAmount"),
  directCount: document.getElementById("approvedDepositsDirectCount"),
  directAmount: document.getElementById("approvedDepositsDirectAmount"),
  agentCount: document.getElementById("approvedDepositsAgentCount"),
  agentAmount: document.getElementById("approvedDepositsAgentAmount"),
  share: document.getElementById("approvedDepositsAgentShare"),
  avgTicket: document.getElementById("approvedDepositsAvgTicket"),
  moncash: document.getElementById("approvedDepositsMoncash"),
  natcash: document.getElementById("approvedDepositsNatcash"),
  other: document.getElementById("approvedDepositsOther"),
  source: document.getElementById("approvedDepositsSource"),
  tableBody: document.getElementById("approvedDepositsTableBody"),
  empty: document.getElementById("approvedDepositsEmpty"),
};

function safeInt(value) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.trunc(num) : 0;
}

function safeFloat(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function formatInt(value) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Math.max(0, safeFloat(value)));
}

function formatHtg(value) {
  return `${formatInt(value)} HTG`;
}

function formatDateTime(ms) {
  const safeMs = safeInt(ms);
  if (!safeMs) return "-";
  return new Date(safeMs).toLocaleString("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatDateInput(ms) {
  const safeMs = safeInt(ms);
  if (!safeMs) return "";
  const date = new Date(safeMs);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateInput(rawValue, endOfDay = false) {
  const raw = String(rawValue || "").trim();
  if (!raw) return 0;
  const parts = raw.split("-").map((item) => Number(item));
  if (parts.length !== 3 || parts.some((item) => !Number.isFinite(item))) return 0;
  const [year, month, day] = parts;
  return endOfDay
    ? new Date(year, month - 1, day, 23, 59, 59, 999).getTime()
    : new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function setStatus(text, tone = "neutral") {
  if (!dom.status) return;
  dom.status.textContent = String(text || "");
  dom.status.dataset.tone = tone;
}

function syncDatesForWindow(windowKey) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(todayStart);
  if (windowKey === "7d") {
    start.setDate(start.getDate() - 6);
  } else if (windowKey === "30d") {
    start.setDate(start.getDate() - 29);
  }
  if (windowKey === "global") {
    if (dom.dateFrom) dom.dateFrom.value = "";
    if (dom.dateTo) dom.dateTo.value = "";
    return;
  }
  if (windowKey === "custom") return;
  if (dom.dateFrom) dom.dateFrom.value = formatDateInput(start.getTime());
  if (dom.dateTo) dom.dateTo.value = formatDateInput(now.getTime());
}

function syncDateFieldState() {
  const isCustom = String(dom.windowSelect?.value || "").trim().toLowerCase() === "custom";
  if (dom.dateFrom) dom.dateFrom.disabled = !isCustom;
  if (dom.dateTo) dom.dateTo.disabled = !isCustom;
}

function buildPayload() {
  const windowKey = String(dom.windowSelect?.value || "global").trim().toLowerCase();
  if (windowKey === "custom") {
    return {
      window: "custom",
      startMs: parseDateInput(dom.dateFrom?.value || "", false),
      endMs: parseDateInput(dom.dateTo?.value || "", true),
      listLimit: 300,
    };
  }
  return {
    window: windowKey,
    listLimit: 300,
  };
}

function renderSummary(result = {}) {
  const snapshot = result?.snapshot || {};
  const summary = snapshot.summary || {};
  const range = result.range || {};

  if (dom.totalCount) dom.totalCount.textContent = formatInt(summary.totalApprovedCount);
  if (dom.totalAmount) dom.totalAmount.textContent = formatHtg(summary.totalApprovedHtg);
  if (dom.directCount) dom.directCount.textContent = formatInt(summary.directApprovedCount);
  if (dom.directAmount) dom.directAmount.textContent = formatHtg(summary.directApprovedHtg);
  if (dom.agentCount) dom.agentCount.textContent = formatInt(summary.agentApprovedCount);
  if (dom.agentAmount) dom.agentAmount.textContent = formatHtg(summary.agentApprovedHtg);
  if (dom.share) dom.share.textContent = `${safeFloat(summary.agentSharePct).toFixed(2)}%`;
  if (dom.avgTicket) dom.avgTicket.textContent = formatHtg(summary.avgApprovedHtgPerDeposit);
  if (dom.moncash) dom.moncash.textContent = `${formatHtg(summary.moncashApprovedHtg)} · ${formatInt(summary.moncashApprovedCount)} depot(s)`;
  if (dom.natcash) dom.natcash.textContent = `${formatHtg(summary.natcashApprovedHtg)} · ${formatInt(summary.natcashApprovedCount)} depot(s)`;
  if (dom.other) dom.other.textContent = `${formatHtg(summary.otherApprovedHtg)} · ${formatInt(summary.otherApprovedCount)} depot(s)`;
  if (dom.source) dom.source.textContent = snapshot?.definitions?.source || "Source indisponible.";

  if (dom.generatedAt) {
    dom.generatedAt.textContent = `Dernier snapshot: ${formatDateTime(result.generatedAtMs)}`;
  }
  if (dom.coverage) {
    const startText = range?.isGlobal ? "Debut historique" : formatDateTime(range.startMs);
    dom.coverage.textContent = `Couverture: ${startText} -> ${formatDateTime(range.endMs)}`;
  }
}

function renderRows(result = {}) {
  const snapshot = result?.snapshot || {};
  const rows = Array.isArray(snapshot.recentApprovedDeposits) ? snapshot.recentApprovedDeposits : [];
  if (!dom.tableBody) return;

  if (!rows.length) {
    dom.tableBody.innerHTML = "";
    dom.empty?.classList.remove("hidden");
    return;
  }

  dom.empty?.classList.add("hidden");
  dom.tableBody.innerHTML = rows.map((row) => {
    const clientLabel = row.customerName || row.clientId || "-";
    const contactParts = [row.customerEmail, row.customerPhone].filter(Boolean);
    const contactLabel = contactParts.length ? contactParts.join(" · ") : "-";
    const methodLabel = row.methodName || row.methodId || "-";
    const sourceTone = row.agentAssisted ? "agent" : "direct";
    return `
      <tr>
        <td data-label="Date">${escapeHtml(formatDateTime(row.createdAtMs))}</td>
        <td data-label="Client">${escapeHtml(clientLabel)}</td>
        <td data-label="Contact">${escapeHtml(contactLabel)}</td>
        <td data-label="Montant">${escapeHtml(formatHtg(row.approvedAmountHtg))}</td>
        <td data-label="Methode">${escapeHtml(methodLabel)}</td>
        <td data-label="Source"><span class="source-pill source-${escapeHtml(sourceTone)}">${escapeHtml(row.sourceLabel || "-")}</span></td>
        <td data-label="Code">${escapeHtml(row.uniqueCode || row.id || "-")}</td>
      </tr>
    `;
  }).join("");
}

async function refreshApprovedDeposits() {
  try {
    setStatus("Chargement des depots approuves...", "neutral");
    await ensureFinanceDashboardSession({
      title: "Depots approuves",
      description: "Connecte-toi avec le compte administrateur autorise pour consulter les depots approuves en V2.",
    });
    const result = await getApprovedDepositsSnapshotSecure(buildPayload());
    renderSummary(result || {});
    renderRows(result || {});
    setStatus("Depots approuves charges.", "success");
  } catch (error) {
    console.error("[APPROVED_DEPOSITS_DASHBOARD_V2] refresh error", error);
    setStatus(error?.message || "Impossible de charger les depots approuves.", "error");
  }
}

function bindEvents() {
  dom.refreshBtn?.addEventListener("click", () => {
    void refreshApprovedDeposits();
  });

  dom.windowSelect?.addEventListener("change", () => {
    const windowKey = String(dom.windowSelect?.value || "global").trim().toLowerCase();
    syncDateFieldState();
    syncDatesForWindow(windowKey);
    void refreshApprovedDeposits();
  });

  dom.dateFrom?.addEventListener("change", () => {
    if (String(dom.windowSelect?.value || "").trim().toLowerCase() === "custom") {
      void refreshApprovedDeposits();
    }
  });

  dom.dateTo?.addEventListener("change", () => {
    if (String(dom.windowSelect?.value || "").trim().toLowerCase() === "custom") {
      void refreshApprovedDeposits();
    }
  });
}

async function init() {
  syncDateFieldState();
  syncDatesForWindow(String(dom.windowSelect?.value || "global").trim().toLowerCase());
  bindEvents();
  await refreshApprovedDeposits();
}

void init();

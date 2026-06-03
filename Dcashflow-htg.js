import { ensureFinanceDashboardSession } from "./dashboard-admin-auth.js?v=20260603-cashflow2";
import { getHtgCashflowSnapshotSecure } from "./secure-functions.js?v=20260603-cashflow2";

const dom = {
  status: document.getElementById("cashflowStatus"),
  refreshBtn: document.getElementById("cashflowRefreshBtn"),
  windowSelect: document.getElementById("cashflowWindow"),
  dateFrom: document.getElementById("cashflowDateFrom"),
  dateTo: document.getElementById("cashflowDateTo"),
  generatedAt: document.getElementById("cashflowGeneratedAt"),
  coverage: document.getElementById("cashflowCoverage"),
  sourceNote: document.getElementById("cashflowSourceNote"),
  depositsValue: document.getElementById("cashflowDepositsValue"),
  depositsCopy: document.getElementById("cashflowDepositsCopy"),
  withdrawalsValue: document.getElementById("cashflowWithdrawalsValue"),
  withdrawalsCopy: document.getElementById("cashflowWithdrawalsCopy"),
  netCashValue: document.getElementById("cashflowNetCashValue"),
  netCashCopy: document.getElementById("cashflowNetCashCopy"),
  gameEdgeValue: document.getElementById("cashflowGameEdgeValue"),
  gameEdgeCopy: document.getElementById("cashflowGameEdgeCopy"),
  usersStakeValue: document.getElementById("cashflowUsersStakeValue"),
  usersStakeCopy: document.getElementById("cashflowUsersStakeCopy"),
  usersPayoutValue: document.getElementById("cashflowUsersPayoutValue"),
  usersPayoutCopy: document.getElementById("cashflowUsersPayoutCopy"),
  usersNetValue: document.getElementById("cashflowUsersNetValue"),
  usersNetCopy: document.getElementById("cashflowUsersNetCopy"),
  businessValue: document.getElementById("cashflowBusinessValue"),
  businessCopy: document.getElementById("cashflowBusinessCopy"),
  directValue: document.getElementById("cashflowDirectValue"),
  directCopy: document.getElementById("cashflowDirectCopy"),
  agentValue: document.getElementById("cashflowAgentValue"),
  agentCopy: document.getElementById("cashflowAgentCopy"),
  withdrawalsCountValue: document.getElementById("cashflowWithdrawalsCountValue"),
  withdrawalsCountCopy: document.getElementById("cashflowWithdrawalsCountCopy"),
  tableBody: document.getElementById("cashflowTableBody"),
  empty: document.getElementById("cashflowEmpty"),
  recentDeposits: document.getElementById("cashflowRecentDeposits"),
  recentDepositsEmpty: document.getElementById("cashflowRecentDepositsEmpty"),
  recentWithdrawals: document.getElementById("cashflowRecentWithdrawals"),
  recentWithdrawalsEmpty: document.getElementById("cashflowRecentWithdrawalsEmpty"),
  recentGames: document.getElementById("cashflowRecentGames"),
  recentGamesEmpty: document.getElementById("cashflowRecentGamesEmpty"),
};

function safeInt(value) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.trunc(num) : 0;
}

function formatInt(value) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Math.abs(safeInt(value)));
}

function formatHtg(value) {
  return `${formatInt(value)} HTG`;
}

function formatSignedHtg(value) {
  const safe = safeInt(value);
  if (safe === 0) return "0 HTG";
  return `${safe > 0 ? "+" : "-"}${formatInt(safe)} HTG`;
}

function formatDateTime(ms) {
  const safeMs = safeInt(ms);
  if (!safeMs) return "-";
  return new Date(safeMs).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
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
    .replace(/\"/g, "&quot;")
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
  if (windowKey === "7d") start.setDate(start.getDate() - 6);
  else if (windowKey === "30d") start.setDate(start.getDate() - 29);
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
  const windowKey = String(dom.windowSelect?.value || "today").trim().toLowerCase();
  if (windowKey === "custom") {
    return {
      window: "custom",
      startMs: parseDateInput(dom.dateFrom?.value || "", false),
      endMs: parseDateInput(dom.dateTo?.value || "", true),
      listLimit: 30,
    };
  }
  return {
    window: windowKey,
    listLimit: 30,
  };
}

function renderSummary(result = {}) {
  const snapshot = result?.snapshot || {};
  const summary = snapshot.summary || {};
  const range = result.range || {};
  const defs = snapshot.definitions || {};

  if (dom.depositsValue) dom.depositsValue.textContent = formatHtg(summary.approvedDepositsHtg);
  if (dom.depositsCopy) dom.depositsCopy.textContent = `${formatInt(summary.approvedDepositsCount)} depot(s) approuves`;
  if (dom.withdrawalsValue) dom.withdrawalsValue.textContent = formatHtg(summary.approvedWithdrawalsHtg);
  if (dom.withdrawalsCopy) dom.withdrawalsCopy.textContent = `${formatInt(summary.approvedWithdrawalsCount)} retrait(s) approuves`;
  if (dom.netCashValue) dom.netCashValue.textContent = formatSignedHtg(summary.netCashHtg);
  if (dom.gameEdgeValue) dom.gameEdgeValue.textContent = formatSignedHtg(summary.operatorGameEdgeHtg);
  if (dom.usersStakeValue) dom.usersStakeValue.textContent = formatHtg(summary.usersStakeHtg);
  if (dom.usersPayoutValue) dom.usersPayoutValue.textContent = formatHtg(summary.usersPayoutHtg);
  if (dom.usersNetValue) dom.usersNetValue.textContent = formatSignedHtg(summary.usersNetHtg);
  if (dom.businessValue) dom.businessValue.textContent = formatSignedHtg(summary.netBusinessHtg);
  if (dom.businessCopy) dom.businessCopy.textContent = "Lecture finale de la periode.";
  if (dom.directValue) dom.directValue.textContent = formatHtg(summary.directApprovedDepositsHtg);
  if (dom.directCopy) dom.directCopy.textContent = `${formatInt(summary.approvedDepositsCount - summary.agentApprovedDepositsCount)} depot(s) directs`;
  if (dom.agentValue) dom.agentValue.textContent = formatHtg(summary.agentApprovedDepositsHtg);
  if (dom.agentCopy) dom.agentCopy.textContent = `${formatInt(summary.agentApprovedDepositsCount)} depot(s) agent`;
  if (dom.withdrawalsCountValue) dom.withdrawalsCountValue.textContent = formatInt(summary.approvedWithdrawalsCount);
  if (dom.withdrawalsCountCopy) dom.withdrawalsCountCopy.textContent = `${formatHtg(summary.approvedWithdrawalsHtg)} sortis sur la periode`;
  if (dom.generatedAt) dom.generatedAt.textContent = `Dernier snapshot: ${formatDateTime(result.generatedAtMs)}`;
  if (dom.coverage) {
    const startText = range?.isGlobal ? "Debut historique" : formatDateTime(range.startMs);
    dom.coverage.textContent = `${startText} -> ${formatDateTime(range.endMs)}`;
  }
  if (dom.sourceNote) {
    dom.sourceNote.innerHTML = `
      <strong>Definitions:</strong><br>
      ${escapeHtml(defs.depositsRule || "-")}<br>
      ${escapeHtml(defs.withdrawalsRule || "-")}<br>
      ${escapeHtml(defs.gamesRule || "-")}<br>
      ${escapeHtml(defs.businessRule || "-")}
    `;
  }
}

function renderBuckets(result = {}) {
  const rows = Array.isArray(result?.snapshot?.buckets) ? result.snapshot.buckets : [];
  if (!dom.tableBody) return;
  if (!rows.length) {
    dom.tableBody.innerHTML = "";
    dom.empty?.classList.remove("hidden");
    return;
  }
  dom.empty?.classList.add("hidden");
  dom.tableBody.innerHTML = rows.map((row) => `
    <tr>
      <td data-label="Periode">${escapeHtml(row.label)}</td>
      <td data-label="Entrees">${escapeHtml(formatHtg(row.approvedDepositsHtg))}</td>
      <td data-label="Sorties">${escapeHtml(formatHtg(row.approvedWithdrawalsHtg))}</td>
      <td data-label="Net cash">${escapeHtml(formatSignedHtg(row.netCashHtg))}</td>
      <td data-label="Net joueurs">${escapeHtml(formatSignedHtg(row.usersNetHtg))}</td>
      <td data-label="Marge jeux">${escapeHtml(formatSignedHtg(row.operatorGameEdgeHtg))}</td>
      <td data-label="Resultat">${escapeHtml(formatSignedHtg(row.netBusinessHtg))}</td>
    </tr>
  `).join("");
}

function renderRecentList(target, emptyEl, rows = [], renderer) {
  if (!target) return;
  if (!rows.length) {
    target.innerHTML = "";
    emptyEl?.classList.remove("hidden");
    return;
  }
  emptyEl?.classList.add("hidden");
  target.innerHTML = rows.map(renderer).join("");
}

function renderRecent(result = {}) {
  const snapshot = result?.snapshot || {};
  renderRecentList(dom.recentDeposits, dom.recentDepositsEmpty, snapshot.recentApprovedDeposits || [], (row) => `
    <li>
      <div class="recent-head">
        <strong>${escapeHtml(row.customerName || row.customerEmail || row.uniqueCode || "Depot")}</strong>
        <span class="money-positive">${escapeHtml(formatHtg(row.amountHtg))}</span>
      </div>
      <div class="recent-meta">${escapeHtml(row.sourceLabel || "Depot")} · ${escapeHtml(row.methodName || "-")}<br>${escapeHtml(formatDateTime(row.resolvedAtMs))}</div>
    </li>
  `);
  renderRecentList(dom.recentWithdrawals, dom.recentWithdrawalsEmpty, snapshot.recentApprovedWithdrawals || [], (row) => `
    <li>
      <div class="recent-head">
        <strong>${escapeHtml(row.customerName || row.customerEmail || row.destinationValue || "Retrait")}</strong>
        <span class="money-negative">-${escapeHtml(formatHtg(row.amountHtg))}</span>
      </div>
      <div class="recent-meta">${escapeHtml(row.methodName || "-")}<br>${escapeHtml(formatDateTime(row.resolvedAtMs))}</div>
    </li>
  `);
  renderRecentList(dom.recentGames, dom.recentGamesEmpty, snapshot.recentGameEconomics || [], (row) => `
    <li>
      <div class="recent-head">
        <strong>${escapeHtml(row.gameLabel || "Jeu")}</strong>
        <span class="${safeInt(row.operatorGameEdgeHtg) >= 0 ? "money-positive" : "money-negative"}">${escapeHtml(formatSignedHtg(row.operatorGameEdgeHtg))}</span>
      </div>
      <div class="recent-meta">Mises users ${escapeHtml(formatHtg(row.usersStakeHtg))} · payout ${escapeHtml(formatHtg(row.payoutHtg))}<br>${escapeHtml(formatDateTime(row.resolvedAtMs))}</div>
    </li>
  `);
}

async function refreshCashflow() {
  try {
    setStatus("Chargement du cashflow HTG...", "neutral");
    await ensureFinanceDashboardSession({
      title: "Cashflow HTG",
      description: "Connecte-toi avec le compte administrateur autorise pour consulter le cashflow HTG du dashboard V2.",
    });
    const result = await getHtgCashflowSnapshotSecure(buildPayload());
    renderSummary(result || {});
    renderBuckets(result || {});
    renderRecent(result || {});
    setStatus("Cashflow HTG charge.", "success");
  } catch (error) {
    console.error("[CASHFLOW_HTG_DASHBOARD_V2] refresh error", error);
    setStatus(error?.message || "Impossible de charger le cashflow HTG.", "error");
  }
}

function bindEvents() {
  dom.refreshBtn?.addEventListener("click", () => { void refreshCashflow(); });
  dom.windowSelect?.addEventListener("change", () => {
    const windowKey = String(dom.windowSelect?.value || "today").trim().toLowerCase();
    syncDateFieldState();
    syncDatesForWindow(windowKey);
    void refreshCashflow();
  });
  dom.dateFrom?.addEventListener("change", () => {
    if (String(dom.windowSelect?.value || "").trim().toLowerCase() === "custom") void refreshCashflow();
  });
  dom.dateTo?.addEventListener("change", () => {
    if (String(dom.windowSelect?.value || "").trim().toLowerCase() === "custom") void refreshCashflow();
  });
}

async function init() {
  syncDateFieldState();
  syncDatesForWindow(String(dom.windowSelect?.value || "today").trim().toLowerCase());
  bindEvents();
  await refreshCashflow();
}

void init();


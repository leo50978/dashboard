import { ensureFinanceDashboardSession } from "./dashboard-admin-auth.js";
import {
  getMorpionWaitingQueueDashboardSecure,
  inviteMorpionWaitingPlayerSecure,
} from "./secure-functions.js";

const REFRESH_MS = 12 * 1000;

const dom = {
  adminEmail: document.getElementById("morpionQueueAdminEmail"),
  totalValue: document.getElementById("morpionQueueTotalValue"),
  onlineValue: document.getElementById("morpionQueueOnlineValue"),
  pendingValue: document.getElementById("morpionQueuePendingValue"),
  acceptedValue: document.getElementById("morpionQueueAcceptedValue"),
  statusCopy: document.getElementById("morpionQueueStatusCopy"),
  tableBody: document.getElementById("morpionQueueTableBody"),
  refreshBtn: document.getElementById("morpionQueueRefreshBtn"),
};

const state = {
  rows: [],
  loading: false,
};

let refreshTimer = 0;

function safeInt(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function formatInt(value) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(safeInt(value));
}

function formatDateTime(ms = 0) {
  const safeMs = safeInt(ms);
  if (safeMs <= 0) return "-";
  return new Date(safeMs).toLocaleString("fr-FR", {
    dateStyle: "short",
    timeStyle: "medium",
  });
}

function formatElapsed(ms = 0) {
  const safeMs = safeInt(ms);
  if (safeMs <= 0) return "-";
  const diffSec = Math.max(0, Math.floor((Date.now() - safeMs) / 1000));
  if (diffSec < 60) return `${diffSec}s`;
  const min = Math.floor(diffSec / 60);
  const sec = diffSec % 60;
  return `${min}m ${sec}s`;
}

function setLoading(loading) {
  state.loading = loading === true;
  dom.refreshBtn.disabled = state.loading;
}

function rowStatusLabel(status = "") {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "accepted_invite") return "Invitation acceptee";
  if (normalized === "pending") return "En attente";
  return normalized || "-";
}

function renderRows() {
  const rows = Array.isArray(state.rows) ? state.rows : [];
  if (!rows.length) {
    dom.tableBody.innerHTML = `
      <tr>
        <td colspan="8" class="empty-cell">Aucun joueur en attente pour le moment.</td>
      </tr>
    `;
    return;
  }

  dom.tableBody.innerHTML = rows.map((row) => {
    const uid = String(row.uid || "").trim();
    const online = row.online === true;
    const canInvite = row.canInvite === true;
    const statusLabel = rowStatusLabel(row.status);
    const inviteLabel = canInvite ? "Inviter" : "Indisponible";
    const safeUid = uid.replace(/"/g, "&quot;");
    return `
      <tr>
        <td><code>${safeUid.slice(0, 10)}...</code></td>
        <td>
          <span class="presence ${online ? "presence--on" : "presence--off"}"></span>
          ${online ? "En ligne" : "Hors ligne"}
        </td>
        <td>${statusLabel}</td>
        <td>${formatInt(row.stakeDoes)} Does</td>
        <td>${formatDateTime(row.lastAttemptAtMs || row.updatedAtMs)}</td>
        <td>${formatElapsed(row.lastSeenMs)}</td>
        <td>${formatDateTime(row.lastInviteAtMs)}</td>
        <td>
          <button type="button" class="invite-btn" data-invite-uid="${safeUid}" ${canInvite ? "" : "disabled"}>
            ${inviteLabel}
          </button>
        </td>
      </tr>
    `;
  }).join("");
}

function renderStats() {
  const rows = Array.isArray(state.rows) ? state.rows : [];
  const onlineCount = rows.filter((row) => row.online === true).length;
  const pendingCount = rows.filter((row) => String(row.status || "").toLowerCase() === "pending").length;
  const acceptedCount = rows.filter((row) => String(row.status || "").toLowerCase() === "accepted_invite").length;
  dom.totalValue.textContent = formatInt(rows.length);
  dom.onlineValue.textContent = formatInt(onlineCount);
  dom.pendingValue.textContent = formatInt(pendingCount);
  dom.acceptedValue.textContent = formatInt(acceptedCount);
}

async function refreshQueue({ silent = false } = {}) {
  if (!silent) setLoading(true);
  try {
    const response = await getMorpionWaitingQueueDashboardSecure({});
    state.rows = Array.isArray(response?.rows) ? response.rows : [];
    renderStats();
    renderRows();
    dom.statusCopy.textContent = `Mis a jour: ${new Date().toLocaleTimeString("fr-FR")}`;
  } catch (error) {
    console.error("[MORPION_QUEUE] refresh error", error);
    dom.statusCopy.textContent = `Erreur: ${String(error?.message || error)}`;
  } finally {
    if (!silent) setLoading(false);
  }
}

async function invitePlayer(targetUid = "") {
  const safeUid = String(targetUid || "").trim();
  if (!safeUid) return;
  try {
    await inviteMorpionWaitingPlayerSecure({ targetUid: safeUid });
    dom.statusCopy.textContent = `Invitation envoyee a ${safeUid.slice(0, 8)}...`;
    await refreshQueue({ silent: true });
  } catch (error) {
    console.error("[MORPION_QUEUE] invite error", error);
    dom.statusCopy.textContent = `Invite impossible: ${String(error?.message || error)}`;
  }
}

function bindEvents() {
  dom.refreshBtn.addEventListener("click", () => {
    void refreshQueue();
  });

  dom.tableBody.addEventListener("click", (event) => {
    const target = event.target instanceof HTMLElement ? event.target.closest("[data-invite-uid]") : null;
    if (!(target instanceof HTMLElement)) return;
    const uid = String(target.getAttribute("data-invite-uid") || "").trim();
    if (!uid) return;
    void invitePlayer(uid);
  });
}

function startAutoRefresh() {
  if (refreshTimer) window.clearInterval(refreshTimer);
  refreshTimer = window.setInterval(() => {
    void refreshQueue({ silent: true });
  }, REFRESH_MS);
}

async function bootstrap() {
  const session = await ensureFinanceDashboardSession({ fallbackUrl: "./Dpayment.html" });
  dom.adminEmail.textContent = session?.email || "Session admin";
  bindEvents();
  await refreshQueue();
  startAutoRefresh();
}

void bootstrap();

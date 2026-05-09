import {
  deleteWithdrawal,
  ensureWithdrawalsAccess,
  formatDate,
  formatPrice,
  getStatusMeta,
  getStatusText,
  loadWithdrawals,
  updateWithdrawalStatus,
} from "./withdrawals-data.js";

const status = String(window.__WITHDRAWALS_STATUS || "all").trim().toLowerCase();
const meta = getStatusMeta(status);
const canReview = status === "pending";

const adminEmailEl = document.getElementById("withdrawalsStatusAdminEmail");
const titleEl = document.getElementById("withdrawalsStatusTitle");
const subtitleEl = document.getElementById("withdrawalsStatusSubtitle");
const badgeEl = document.getElementById("withdrawalsStatusBadge");
const totalEl = document.getElementById("withdrawalsStatusCount");
const amountEl = document.getElementById("withdrawalsStatusAmount");
const tableBodyEl = document.getElementById("withdrawalsStatusTableBody");
const emptyEl = document.getElementById("withdrawalsStatusEmpty");
const loadingEl = document.getElementById("withdrawalsStatusLoading");
const errorEl = document.getElementById("withdrawalsStatusError");
const contentEl = document.getElementById("withdrawalsStatusContent");
const searchInputEl = document.getElementById("withdrawalsStatusSearch");
const tableHeadRowEl = document.querySelector("table thead tr");

let currentRows = [];
let currentModalWithdrawal = null;
let activeDecisionKey = "";
let toastTimeout = 0;

function escapeHtml(value = "") {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function ensureUiStyles() {
  if (document.getElementById("withdrawalsStatusUiStyles")) return;
  const style = document.createElement("style");
  style.id = "withdrawalsStatusUiStyles";
  style.textContent = `
    #withdrawalsStatusToast {
      right: max(14px, env(safe-area-inset-right, 0px));
      bottom: max(14px, env(safe-area-inset-bottom, 0px));
    }
    #withdrawalsStatusModal {
      position: fixed;
      inset: 0;
      z-index: 1600;
    }
    #withdrawalsStatusModal.hidden {
      display: none !important;
    }
    .withdrawals-status-modal-overlay {
      position: fixed;
      inset: 0;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      padding:
        max(12px, env(safe-area-inset-top, 0px))
        max(12px, env(safe-area-inset-right, 0px))
        max(12px, env(safe-area-inset-bottom, 0px))
        max(12px, env(safe-area-inset-left, 0px));
      background: rgba(2, 8, 20, 0.74);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
    }
    .withdrawals-status-modal-panel {
      width: min(100%, 920px);
      max-height: min(92dvh, 920px);
      min-height: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      border-radius: 24px;
      background: #08111f;
      color: #eff6ff;
      border: 1px solid rgba(148,163,184,.24);
      box-shadow: 0 32px 64px rgba(2,8,20,.46);
    }
    .withdrawals-status-modal-header {
      position: sticky;
      top: 0;
      z-index: 1;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      padding: clamp(16px, 3.6vw, 24px);
      background: rgba(8,17,31,.96);
      border-bottom: 1px solid rgba(148,163,184,.16);
    }
    .withdrawals-status-modal-content {
      flex: 1 1 auto;
      min-height: 0;
      overflow: auto;
      overflow-x: hidden;
      -webkit-overflow-scrolling: touch;
      padding: 0 clamp(16px, 3.6vw, 24px) clamp(18px, 3.8vw, 26px);
      scrollbar-gutter: stable;
    }
    .withdrawals-status-modal-footer {
      position: sticky;
      bottom: 0;
      z-index: 1;
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      flex-wrap: wrap;
      padding:
        16px
        clamp(16px, 3.6vw, 24px)
        max(16px, env(safe-area-inset-bottom, 0px))
        clamp(16px, 3.6vw, 24px);
      border-top: 1px solid rgba(148,163,184,.2);
      background: rgba(8,17,31,.98);
    }
    .withdrawals-status-modal-btn {
      min-height: 46px;
      border-radius: 16px;
      padding: 12px 16px;
      font-weight: 800;
      cursor: pointer;
    }
    .withdrawals-status-modal-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 14px;
    }
    .withdrawals-status-modal-card {
      border: 1px solid rgba(148,163,184,.2);
      border-radius: 18px;
      padding: 16px;
      min-width: 0;
    }
    .withdrawals-status-modal-card.soft {
      background: rgba(255,255,255,.04);
    }
    .withdrawals-status-modal-section {
      margin-top: 16px;
    }
    @media (max-width: 899px) {
      .withdrawals-status-modal-panel {
        width: 100%;
        max-height: min(94dvh, 1000px);
        border-radius: 24px 24px 18px 18px;
      }
      .withdrawals-status-modal-footer {
        justify-content: stretch;
      }
      .withdrawals-status-modal-footer .withdrawals-status-modal-btn {
        width: 100%;
      }
      .withdrawals-status-modal-grid {
        grid-template-columns: 1fr;
      }
    }
    @media (min-width: 900px) {
      .withdrawals-status-modal-overlay {
        align-items: center;
      }
    }
  `;
  document.head.appendChild(style);
}

function getDayKey(ms = 0) {
  if (!ms) return "unknown";
  const date = new Date(ms);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getRelativeDayLabel(dayKey = "") {
  if (!dayKey || dayKey === "unknown") return "Sans date";
  const [year, month, day] = String(dayKey).split("-").map((value) => Number(value) || 0);
  const target = new Date(year, Math.max(month - 1, 0), day);
  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffDays = Math.round((startToday.getTime() - target.getTime()) / 86400000);
  if (diffDays === 0) return "Aujourd'hui";
  if (diffDays === 1) return "Hier";
  return target.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function groupWithdrawalsByDay(rows = []) {
  const groups = [];
  const byKey = new Map();
  rows.forEach((item) => {
    const key = getDayKey(item.createdAtMs);
    if (!byKey.has(key)) {
      const group = { key, label: getRelativeDayLabel(key), rows: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    byKey.get(key).rows.push(item);
  });
  return groups;
}

function showToast(message, tone = "info") {
  let toast = document.getElementById("withdrawalsStatusToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "withdrawalsStatusToast";
    toast.style.position = "fixed";
    toast.style.zIndex = "2000";
    toast.style.minWidth = "240px";
    toast.style.maxWidth = "min(92vw, 420px)";
    toast.style.borderRadius = "18px";
    toast.style.padding = "14px 16px";
    toast.style.boxShadow = "0 18px 36px rgba(2,8,20,.32)";
    toast.style.fontWeight = "800";
    toast.style.transition = "opacity .2s ease, transform .2s ease";
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.style.opacity = "1";
  toast.style.transform = "translateY(0)";
  toast.style.background = tone === "error" ? "#7f1d1d" : tone === "success" ? "#065f46" : "#111827";
  toast.style.color = "white";
  window.clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(8px)";
  }, 2800);
}

function ensureModal() {
  let modal = document.getElementById("withdrawalsStatusModal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "withdrawalsStatusModal";
  modal.className = "hidden";
  modal.innerHTML = `
    <div data-modal-overlay="true" class="withdrawals-status-modal-overlay">
      <div class="withdrawals-status-modal-panel">
        <div class="withdrawals-status-modal-header">
          <div>
            <p style="margin:0;font-size:12px;text-transform:uppercase;letter-spacing:.18em;color:#9db1de;font-weight:800;">Retrait</p>
            <h2 id="withdrawalsStatusModalTitle" style="margin:10px 0 0;font-size:clamp(1.6rem,3vw,2.5rem);line-height:1.08;">Details</h2>
          </div>
          <button type="button" id="withdrawalsStatusModalClose" style="border:none;background:rgba(255,255,255,.06);color:#eff6ff;border-radius:999px;width:44px;height:44px;font-size:18px;font-weight:900;cursor:pointer;flex:0 0 auto;">×</button>
        </div>
        <div id="withdrawalsStatusModalContent" class="withdrawals-status-modal-content"></div>
        <div class="withdrawals-status-modal-footer">
          <button type="button" id="withdrawalsStatusApproveBtn" class="withdrawals-status-modal-btn" style="display:none;border:none;background:#059669;color:white;">Approuver</button>
          <button type="button" id="withdrawalsStatusRejectBtn" class="withdrawals-status-modal-btn" style="display:none;border:none;background:#dc2626;color:white;">Rejeter</button>
          <button type="button" id="withdrawalsStatusDeleteBtn" class="withdrawals-status-modal-btn" style="border:none;background:#111827;color:white;">Supprimer</button>
          <button type="button" id="withdrawalsStatusModalDone" class="withdrawals-status-modal-btn" style="border:1px solid rgba(148,163,184,.35);background:rgba(255,255,255,.04);color:#eff6ff;">Fermer</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const close = () => {
    modal.classList.add("hidden");
    currentModalWithdrawal = null;
  };
  modal.querySelector("[data-modal-overlay='true']")?.addEventListener("click", (event) => {
    if (event.target?.dataset?.modalOverlay === "true") close();
  });
  modal.querySelector("#withdrawalsStatusModalClose")?.addEventListener("click", close);
  modal.querySelector("#withdrawalsStatusModalDone")?.addEventListener("click", close);
  modal.querySelector("#withdrawalsStatusApproveBtn")?.addEventListener("click", () => {
    if (currentModalWithdrawal) void handleDecision(currentModalWithdrawal, "approve");
  });
  modal.querySelector("#withdrawalsStatusRejectBtn")?.addEventListener("click", () => {
    if (currentModalWithdrawal) void handleDecision(currentModalWithdrawal, "reject");
  });
  modal.querySelector("#withdrawalsStatusDeleteBtn")?.addEventListener("click", () => {
    if (currentModalWithdrawal) void handleDelete(currentModalWithdrawal);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.classList.contains("hidden")) close();
  });

  return modal;
}

function setModalButtonsEnabled(enabled) {
  const modal = ensureModal();
  ["#withdrawalsStatusApproveBtn", "#withdrawalsStatusRejectBtn", "#withdrawalsStatusDeleteBtn"].forEach((selector) => {
    const btn = modal.querySelector(selector);
    if (!btn) return;
    btn.disabled = !enabled;
    btn.style.opacity = enabled ? "1" : ".55";
    btn.style.cursor = enabled ? "pointer" : "not-allowed";
  });
}

function renderModal(withdrawal) {
  const modal = ensureModal();
  currentModalWithdrawal = withdrawal;
  const title = modal.querySelector("#withdrawalsStatusModalTitle");
  const content = modal.querySelector("#withdrawalsStatusModalContent");
  const approveBtn = modal.querySelector("#withdrawalsStatusApproveBtn");
  const rejectBtn = modal.querySelector("#withdrawalsStatusRejectBtn");
  const canAct = withdrawal.status === "pending" || withdrawal.status === "review";

  if (title) {
    title.textContent = withdrawal.customerName
      ? `Retrait de ${withdrawal.customerName}`
      : `Retrait ${withdrawal.id}`;
  }
  if (approveBtn) approveBtn.style.display = canAct ? "inline-flex" : "none";
  if (rejectBtn) rejectBtn.style.display = canAct ? "inline-flex" : "none";
  setModalButtonsEnabled(true);

  if (content) {
    content.innerHTML = `
      <div class="withdrawals-status-modal-grid" style="margin-top:18px;">
        <div class="withdrawals-status-modal-card soft">
          <p style="margin:0;font-size:12px;text-transform:uppercase;letter-spacing:.14em;color:#9db1de;font-weight:800;">Client</p>
          <p style="margin:10px 0 0;font-size:1.05rem;font-weight:800;">${escapeHtml(withdrawal.customerName || "-")}</p>
          <p style="margin:8px 0 0;color:#cbd5e1;">${escapeHtml(withdrawal.customerEmail || "-")}</p>
          <p style="margin:6px 0 0;color:#cbd5e1;">${escapeHtml(withdrawal.phone || "-")}</p>
        </div>
        <div class="withdrawals-status-modal-card soft">
          <p style="margin:0;font-size:12px;text-transform:uppercase;letter-spacing:.14em;color:#9db1de;font-weight:800;">Montant</p>
          <p style="margin:10px 0 0;font-size:1.3rem;font-weight:900;">${formatPrice(withdrawal.amount)}</p>
          <p style="margin:8px 0 0;color:#cbd5e1;">${escapeHtml(withdrawal.methodName || "Methode non definie")}</p>
          <p style="margin:6px 0 0;"><span style="display:inline-flex;align-items:center;justify-content:center;border-radius:999px;background:rgba(255,255,255,.08);padding:6px 10px;font-size:12px;font-weight:800;color:#eff6ff;">${escapeHtml(getStatusText(withdrawal.status))}</span></p>
        </div>
      </div>
      <div class="withdrawals-status-modal-grid withdrawals-status-modal-section">
        <div class="withdrawals-status-modal-card">
          <p style="margin:0;font-size:12px;text-transform:uppercase;letter-spacing:.14em;color:#9db1de;font-weight:800;">Trace</p>
          <p style="margin:10px 0 0;">ID: <strong>${escapeHtml(withdrawal.id || "-")}</strong></p>
          <p style="margin:8px 0 0;color:#cbd5e1;">Soumis le ${escapeHtml(formatDate(withdrawal.createdAtMs))}</p>
          <p style="margin:8px 0 0;color:#cbd5e1;">Revise le ${escapeHtml(formatDate(withdrawal.reviewedAtMs))}</p>
        </div>
        <div class="withdrawals-status-modal-card">
          <p style="margin:0;font-size:12px;text-transform:uppercase;letter-spacing:.14em;color:#9db1de;font-weight:800;">Note</p>
          <p style="margin:10px 0 0;line-height:1.7;">${escapeHtml(withdrawal.note || "Aucune note enregistree.")}</p>
        </div>
      </div>
    `;
  }

  modal.classList.remove("hidden");
}

async function handleDecision(withdrawal, action) {
  if (!withdrawal) return;
  const nextStatus = action === "approve" ? "approved" : "rejected";
  const decisionKey = `${withdrawal.clientId}:${withdrawal.id}:${nextStatus}`;
  if (activeDecisionKey === decisionKey) return;
  activeDecisionKey = decisionKey;
  setModalButtonsEnabled(false);
  try {
    await updateWithdrawalStatus(withdrawal, nextStatus);
    showToast(`Retrait ${getStatusText(nextStatus)}`, "success");
    await refreshRows();
    const refreshed = currentRows.find((item) => item.id === withdrawal.id && item.clientId === withdrawal.clientId);
    if (refreshed) renderModal(refreshed);
  } catch (error) {
    console.error("[WITHDRAWALS_STATUS_V2] decision failed", error);
    showToast(error?.message || "Erreur lors de la mise a jour du retrait.", "error");
  } finally {
    activeDecisionKey = "";
    setModalButtonsEnabled(true);
  }
}

async function handleDelete(withdrawal) {
  if (!withdrawal) return;
  const confirmed = window.confirm("Supprimer definitivement ce retrait ?");
  if (!confirmed) return;
  const decisionKey = `${withdrawal.clientId}:${withdrawal.id}:delete`;
  if (activeDecisionKey === decisionKey) return;
  activeDecisionKey = decisionKey;
  setModalButtonsEnabled(false);
  try {
    await deleteWithdrawal(withdrawal);
    showToast("Retrait supprime definitivement", "success");
    ensureModal().classList.add("hidden");
    currentModalWithdrawal = null;
    await refreshRows();
  } catch (error) {
    console.error("[WITHDRAWALS_STATUS_V2] delete failed", error);
    showToast(error?.message || "Erreur lors de la suppression du retrait.", "error");
  } finally {
    activeDecisionKey = "";
    setModalButtonsEnabled(true);
  }
}

function applyFilters(rows = []) {
  const search = String(searchInputEl?.value || "").trim().toLowerCase();
  if (!search) return rows;
  return rows.filter((item) => (
    String(item.customerName || "").toLowerCase().includes(search)
    || String(item.customerEmail || "").toLowerCase().includes(search)
    || String(item.phone || "").toLowerCase().includes(search)
    || String(item.methodName || "").toLowerCase().includes(search)
    || String(item.id || "").toLowerCase().includes(search)
  ));
}

function renderRows(rows) {
  if (!tableBodyEl) return;
  const groups = groupWithdrawalsByDay(rows);
  tableBodyEl.innerHTML = groups.map((group) => {
    const sectionRows = group.rows.map((item) => {
      const canAct = item.status === "pending" || item.status === "review";
      return `
        <tr>
          <td data-label="Date">${formatDate(item.createdAtMs)}</td>
          <td data-label="Client">${escapeHtml(item.customerName || "-")}</td>
          <td data-label="Email">${escapeHtml(item.customerEmail || "-")}</td>
          <td data-label="Montant">${formatPrice(item.amount)}</td>
          <td data-label="Methode">${escapeHtml(item.methodName || "-")}</td>
          <td data-label="Statut"><span class="status-pill">${escapeHtml(getStatusText(item.status))}</span></td>
          <td data-label="Telephone">${escapeHtml(item.phone || "-")}</td>
          <td data-label="Actions" class="actions-cell">
            <div class="row-actions">
              <button type="button" data-action="view" data-withdrawal-id="${escapeHtml(item.id)}" data-client-id="${escapeHtml(item.clientId)}" style="border:1px solid rgba(148,163,184,.26);background:rgba(255,255,255,.04);color:#eff6ff;border-radius:999px;padding:8px 12px;font-size:12px;font-weight:800;cursor:pointer;">Consulter</button>
              ${canReview && canAct ? `
                <button type="button" data-action="approve" data-withdrawal-id="${escapeHtml(item.id)}" data-client-id="${escapeHtml(item.clientId)}" style="border:none;background:#059669;color:white;border-radius:999px;padding:8px 12px;font-size:12px;font-weight:800;cursor:pointer;">Approuver</button>
                <button type="button" data-action="reject" data-withdrawal-id="${escapeHtml(item.id)}" data-client-id="${escapeHtml(item.clientId)}" style="border:none;background:#dc2626;color:white;border-radius:999px;padding:8px 12px;font-size:12px;font-weight:800;cursor:pointer;">Rejeter</button>
              ` : ""}
              <button type="button" data-action="delete" data-withdrawal-id="${escapeHtml(item.id)}" data-client-id="${escapeHtml(item.clientId)}" style="border:none;background:#111827;color:white;border-radius:999px;padding:8px 12px;font-size:12px;font-weight:800;cursor:pointer;">Supprimer</button>
            </div>
          </td>
        </tr>
      `;
    }).join("");

    return `
      <tr class="day-group-row">
        <td class="day-group-cell" colspan="8" style="padding:18px 12px 10px;border-bottom:none;background:rgba(255,255,255,.03);">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
            <span style="font-size:13px;text-transform:uppercase;letter-spacing:.16em;font-weight:900;color:var(--page-accent);">${escapeHtml(group.label)}</span>
            <span style="font-size:12px;font-weight:800;color:#9db1de;">${group.rows.length} retrait(s)</span>
          </div>
        </td>
      </tr>
      ${sectionRows}
    `;
  }).join("");
}

function bindTableActions() {
  tableBodyEl?.querySelectorAll("button[data-action]").forEach((button) => {
    if (button.dataset.boundAction === "1") return;
    button.dataset.boundAction = "1";
    button.addEventListener("click", () => {
      const action = String(button.dataset.action || "").trim().toLowerCase();
      const id = String(button.dataset.withdrawalId || "").trim();
      const clientId = String(button.dataset.clientId || "").trim();
      const withdrawal = currentRows.find((item) => item.id === id && item.clientId === clientId);
      if (!withdrawal) return;
      if (action === "view") {
        renderModal(withdrawal);
        return;
      }
      if (action === "approve" || action === "reject") {
        void handleDecision(withdrawal, action);
        return;
      }
      if (action === "delete") {
        void handleDelete(withdrawal);
      }
    });
  });
}

async function refreshRows() {
  const rows = await loadWithdrawals(status);
  currentRows = rows;
  const visibleRows = applyFilters(rows);

  if (totalEl) totalEl.textContent = String(rows.length);
  if (amountEl) {
    const totalAmount = rows.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    amountEl.textContent = formatPrice(totalAmount);
  }

  tableBodyEl.innerHTML = "";
  emptyEl?.classList.toggle("hidden", visibleRows.length > 0);
  if (visibleRows.length) {
    renderRows(visibleRows);
    bindTableActions();
  }
}

async function init() {
  try {
    const adminUser = await ensureWithdrawalsAccess(meta.label);
    if (adminEmailEl) {
      adminEmailEl.textContent = adminUser?.email || adminUser?.uid || "Admin connecte";
    }
    ensureUiStyles();
    document.documentElement.style.setProperty("--page-accent", meta.accent);
    if (titleEl) titleEl.textContent = meta.label;
    if (badgeEl) badgeEl.textContent = meta.shortLabel;
    if (subtitleEl) {
      subtitleEl.textContent = status === "pending"
        ? "Traite uniquement les retraits qui attendent encore une validation."
        : status === "approved"
          ? "Consulte uniquement les retraits deja valides."
          : status === "rejected"
            ? "Retrouve ici tous les retraits deja rejetes."
            : "Consulte les retraits de cette categorie.";
    }
    if (tableHeadRowEl && !tableHeadRowEl.querySelector('[data-actions-col="true"]')) {
      const th = document.createElement("th");
      th.textContent = "Actions";
      th.dataset.actionsCol = "true";
      tableHeadRowEl.appendChild(th);
    }

    await refreshRows();

    searchInputEl?.addEventListener("input", () => {
      const visibleRows = applyFilters(currentRows);
      emptyEl?.classList.toggle("hidden", visibleRows.length > 0);
      tableBodyEl.innerHTML = "";
      if (visibleRows.length) {
        renderRows(visibleRows);
        bindTableActions();
      }
    });

    loadingEl?.classList.add("hidden");
    contentEl?.classList.remove("hidden");
  } catch (error) {
    console.error("[WITHDRAWALS_STATUS_V2] init failed", error);
    loadingEl?.classList.add("hidden");
    if (errorEl) {
      errorEl.textContent = error?.message || "Impossible de charger la page retraits.";
      errorEl.classList.remove("hidden");
    }
  }
}

void init();

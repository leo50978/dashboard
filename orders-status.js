import {
  ensureOrdersAccess,
  loadOrders,
  loadClientOrders,
  computeOrderStats,
  formatDate,
  formatPrice,
  getStatusMeta,
} from "./orders-data.js";
import { resolveDepositReviewSecure } from "./secure-functions.js";

const status = String(window.__ORDERS_STATUS || "all").trim().toLowerCase();
const meta = getStatusMeta(status);
const canReview = status === "pending";
const adminEmailEl = document.getElementById("ordersStatusAdminEmail");
const titleEl = document.getElementById("ordersStatusTitle");
const subtitleEl = document.getElementById("ordersStatusSubtitle");
const badgeEl = document.getElementById("ordersStatusBadge");
const totalEl = document.getElementById("ordersStatusCount");
const amountEl = document.getElementById("ordersStatusAmount");
const tableBodyEl = document.getElementById("ordersStatusTableBody");
const emptyEl = document.getElementById("ordersStatusEmpty");
const loadingEl = document.getElementById("ordersStatusLoading");
const errorEl = document.getElementById("ordersStatusError");
const contentEl = document.getElementById("ordersStatusContent");
const tableHeadRowEl = document.querySelector("table thead tr");
const CACHE_VERSION = 1;
const CACHE_KEY = `domino_dashboard_orders_status_cache_v${CACHE_VERSION}_${status}`;

let currentRows = [];
let currentModalOrder = null;
let currentModalHistory = [];
let currentHistoryExpanded = false;
let activeDecisionKey = "";
let toastTimeout = 0;
let modalHistoryToken = 0;

function ensureOrdersStatusUiStyles() {
  if (document.getElementById("ordersStatusUiStyles")) return;
  const style = document.createElement("style");
  style.id = "ordersStatusUiStyles";
  style.textContent = `
    #ordersStatusToast {
      right: max(14px, env(safe-area-inset-right, 0px));
      bottom: max(14px, env(safe-area-inset-bottom, 0px));
    }
    #ordersStatusModal {
      position: fixed;
      inset: 0;
      z-index: 1600;
    }
    #ordersStatusModal.hidden {
      display: none !important;
    }
    .orders-status-modal-overlay {
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
      background: rgba(15, 23, 42, 0.52);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
    }
    .orders-status-modal-panel {
      width: min(100%, 980px);
      max-height: min(92dvh, 960px);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      min-height: 0;
      border-radius: 24px;
      background: white;
      border: 1px solid rgba(148,163,184,.24);
      box-shadow: 0 32px 64px rgba(15,23,42,.26);
    }
    .orders-status-modal-header {
      position: sticky;
      top: 0;
      z-index: 1;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      padding: clamp(16px, 3.6vw, 24px);
      background: rgba(255,255,255,.96);
      border-bottom: 1px solid rgba(148,163,184,.16);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
    }
    .orders-status-modal-content {
      flex: 1 1 auto;
      min-height: 0;
      overflow: auto;
      overflow-x: hidden;
      scrollbar-gutter: stable;
      -webkit-overflow-scrolling: touch;
      padding: 0 clamp(16px, 3.6vw, 24px) clamp(18px, 3.8vw, 26px);
    }
    .orders-status-modal-content::-webkit-scrollbar {
      width: 10px;
    }
    .orders-status-modal-content::-webkit-scrollbar-thumb {
      background: rgba(100,116,139,.45);
      border-radius: 999px;
    }
    .orders-status-history {
      margin-top: 16px;
      border: 1px solid rgba(148,163,184,.2);
      border-radius: 18px;
      background: white;
      overflow: hidden;
    }
    .orders-status-history summary {
      list-style: none;
      cursor: pointer;
      padding: 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      user-select: none;
    }
    .orders-status-history summary::-webkit-details-marker {
      display: none;
    }
    .orders-status-history-body {
      padding: 0 16px 16px;
      display: grid;
      gap: 10px;
    }
    .orders-status-history-caret {
      transition: transform .18s ease;
      color: #64748b;
      font-size: 14px;
      flex: 0 0 auto;
    }
    .orders-status-history[open] .orders-status-history-caret {
      transform: rotate(180deg);
    }
    .orders-status-modal-footer {
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
      background: rgba(255,255,255,.98);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
    }
    .orders-status-modal-btn {
      min-height: 46px;
      border-radius: 16px;
      padding: 12px 16px;
      font-weight: 800;
      cursor: pointer;
    }
    .orders-status-modal-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 14px;
    }
    .orders-status-modal-card {
      border: 1px solid rgba(148,163,184,.2);
      border-radius: 18px;
      padding: 16px;
      min-width: 0;
    }
    .orders-status-modal-card.soft {
      background: #f8fafc;
    }
    .orders-status-modal-section {
      margin-top: 16px;
    }
    .orders-status-modal-pre {
      margin: 12px 0 0;
      white-space: pre-wrap;
      word-break: break-word;
      font-family: ui-monospace,SFMono-Regular,Menlo,monospace;
      font-size: 13px;
      line-height: 1.7;
      background: #0f172a;
      color: #e2e8f0;
      border-radius: 16px;
      padding: 14px;
      overflow: auto;
      -webkit-overflow-scrolling: touch;
    }
    @media (max-width: 899px) {
      .orders-status-modal-panel {
        width: 100%;
        max-height: min(94dvh, 1000px);
        border-radius: 24px 24px 18px 18px;
      }
      .orders-status-modal-header {
        padding-bottom: 14px;
      }
      .orders-status-modal-content {
        padding-left: 16px;
        padding-right: 16px;
      }
      .orders-status-modal-footer {
        justify-content: stretch;
      }
      .orders-status-modal-footer .orders-status-modal-btn {
        width: 100%;
      }
      .orders-status-modal-grid {
        grid-template-columns: 1fr;
      }
    }
    @media (min-width: 900px) {
      .orders-status-modal-overlay {
        align-items: center;
      }
    }
  `;
  document.head.appendChild(style);
}

document.documentElement.style.setProperty("--page-accent", meta.accent);
ensureOrdersStatusUiStyles();
if (titleEl) titleEl.textContent = meta.label;
if (badgeEl) badgeEl.textContent = meta.shortLabel;
if (subtitleEl) {
  subtitleEl.textContent = status === "pending"
    ? "Traite uniquement les commandes qui attendent encore une validation."
    : status === "approved"
      ? "Consulte uniquement les commandes deja valides."
      : status === "rejected"
        ? "Retrouve ici toutes les commandes deja rejetees."
        : "Consulte les commandes de cette categorie.";
}
if (tableHeadRowEl && !tableHeadRowEl.querySelector('[data-actions-col="true"]')) {
  const th = document.createElement("th");
  th.textContent = "Actions";
  th.dataset.actionsCol = "true";
  tableHeadRowEl.appendChild(th);
}

function escapeHtml(value = "") {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getStatusLabel(value = "pending") {
  const normalized = String(value || "pending").trim().toLowerCase();
  if (normalized === "approved") return "Approuvee";
  if (normalized === "rejected") return "Rejetee";
  if (normalized === "review") return "En examen";
  return "En attente";
}

function formatItemOptions(item = {}) {
  const options = [];
  if (item?.sku) options.push(`SKU ${item.sku}`);
  if (Array.isArray(item?.options) && item.options.length) {
    item.options.forEach((opt) => {
      if (!opt) return;
      const name = String(opt.label || opt.name || opt.key || "Option").trim();
      const value = String(opt.value || opt.choice || opt.selected || "").trim();
      options.push(value ? `${name}: ${value}` : name);
    });
  }
  return options.length ? options.join(" · ") : "Aucune option";
}

function getDeliveryLabel(delivery) {
  if (!delivery) return "Aucune livraison enregistree.";
  if (delivery.method === "home") return "Livraison a domicile";
  if (delivery.method === "pickup") return "Retrait en point de vente";
  if (delivery.method === "meetup") return "Rencontre livreur";
  return "Livraison";
}

function getDeliveryTarget(delivery) {
  if (!delivery) return "";
  if (delivery.method === "home") return delivery.homeZone?.city || delivery.homeZone?.zone || "";
  if (delivery.method === "pickup") return delivery.pickupPoint?.name || "";
  if (delivery.method === "meetup") return delivery.meetupZone?.zone || "";
  return "";
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

function groupOrdersByDay(rows = []) {
  const groups = [];
  const byKey = new Map();
  rows.forEach((order) => {
    const key = getDayKey(order.createdAtMs);
    if (!byKey.has(key)) {
      const group = { key, label: getRelativeDayLabel(key), rows: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    byKey.get(key).rows.push(order);
  });
  return groups;
}


function renderHistorySection(history = [], currentOrderId = "", loading = false, errorMessage = "") {
  const otherHistory = Array.isArray(history)
    ? history.filter((entry) => String(entry?.id || "") !== String(currentOrderId || ""))
    : [];
  let bodyHtml = "";
  if (loading) {
    bodyHtml = `<p style="margin:0;color:#475569;">Chargement de l'historique...</p>`;
  } else if (errorMessage) {
    bodyHtml = `<p style="margin:0;color:#9f1239;">${escapeHtml(errorMessage)}</p>`;
  } else if (otherHistory.length) {
    bodyHtml = otherHistory.map((entry, index) => {
      const ocrPreview = String(entry.extractedText || '').replace(/\s+/g, ' ').trim();
      const isPending = String(entry.status || '').trim().toLowerCase() === 'pending';
      return `
        <div style="border:1px solid ${entry.id === currentOrderId ? 'rgba(37,99,235,.28)' : 'rgba(148,163,184,.18)'};border-radius:16px;padding:14px;background:${entry.id === currentOrderId ? 'rgba(219,234,254,.45)' : '#fafafa'};">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">
            <div>
              <p style="margin:0;font-weight:800;">${escapeHtml(entry.uniqueCode || `Demande ${index + 1}`)}</p>
              <p style="margin:8px 0 0;color:#475569;font-size:14px;">${formatDate(entry.createdAtMs)} · ${formatPrice(entry.amount)} · ${escapeHtml(entry.methodName || 'Methode non definie')}</p>
              <p style="margin:8px 0 0;color:#334155;font-size:13px;"><strong>OCR:</strong> ${escapeHtml(ocrPreview || '-')}</p>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;">
              <span style="display:inline-flex;align-items:center;justify-content:center;border-radius:999px;background:rgba(15,23,42,.06);padding:6px 10px;font-size:12px;font-weight:800;color:#0f172a;">${escapeHtml(getStatusLabel(entry.status))}</span>
              <div style="display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;">
                <button type="button" data-history-action="view" data-order-id="${escapeHtml(entry.id)}" data-client-id="${escapeHtml(entry.clientId)}" style="border:1px solid rgba(148,163,184,.26);background:white;color:#0f172a;border-radius:999px;padding:8px 12px;font-size:12px;font-weight:800;cursor:pointer;">Consulter</button>
                ${isPending ? `
                  <button type="button" data-history-action="approve" data-order-id="${escapeHtml(entry.id)}" data-client-id="${escapeHtml(entry.clientId)}" style="border:none;background:#059669;color:white;border-radius:999px;padding:8px 12px;font-size:12px;font-weight:800;cursor:pointer;">Approuver</button>
                  <button type="button" data-history-action="reject" data-order-id="${escapeHtml(entry.id)}" data-client-id="${escapeHtml(entry.clientId)}" style="border:none;background:#dc2626;color:white;border-radius:999px;padding:8px 12px;font-size:12px;font-weight:800;cursor:pointer;">Rejeter</button>
                ` : ''}
              </div>
            </div>
          </div>
        </div>
      `;
    }).join("");
  } else {
    bodyHtml = '<p style="margin:0;color:#64748b;">Aucune autre demande trouvee pour ce client.</p>';
  }

  return `
    <details id="ordersStatusHistoryDetails" class="orders-status-history"${currentHistoryExpanded ? " open" : ""}>
      <summary>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;flex:1 1 auto;min-width:0;">
          <p style="margin:0;font-size:12px;text-transform:uppercase;letter-spacing:.14em;color:#64748b;font-weight:800;">Historique de cette personne</p>
          <span style="display:inline-flex;align-items:center;justify-content:center;border-radius:999px;background:rgba(15,23,42,.06);padding:6px 10px;font-size:12px;font-weight:800;color:#0f172a;">${otherHistory.length} demande(s)</span>
        </div>
        <span class="orders-status-history-caret">▾</span>
      </summary>
      <div class="orders-status-history-body">
        ${bodyHtml}
      </div>
    </details>
  `;
}

function showToast(message, tone = "info") {
  let toast = document.getElementById("ordersStatusToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "ordersStatusToast";
    toast.style.position = "fixed";
    toast.style.right = "20px";
    toast.style.bottom = "20px";
    toast.style.zIndex = "2000";
    toast.style.minWidth = "240px";
    toast.style.maxWidth = "min(92vw, 420px)";
    toast.style.borderRadius = "18px";
    toast.style.padding = "14px 16px";
    toast.style.boxShadow = "0 18px 36px rgba(15,23,42,.18)";
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
  let modal = document.getElementById("ordersStatusModal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "ordersStatusModal";
  modal.className = "hidden";
  modal.innerHTML = `
    <div data-modal-overlay="true" class="orders-status-modal-overlay">
      <div class="orders-status-modal-panel">
        <div class="orders-status-modal-header">
          <div>
            <p style="margin:0;font-size:12px;text-transform:uppercase;letter-spacing:.18em;color:#64748b;font-weight:800;">Commande</p>
            <h2 id="ordersStatusModalTitle" style="margin:10px 0 0;font-size:clamp(1.6rem,3vw,2.5rem);line-height:1.08;">Details</h2>
          </div>
          <button type="button" id="ordersStatusModalClose" style="border:none;background:#f8fafc;color:#0f172a;border-radius:999px;width:44px;height:44px;font-size:18px;font-weight:900;cursor:pointer;flex:0 0 auto;">×</button>
        </div>
        <div id="ordersStatusModalContent" class="orders-status-modal-content"></div>
        <div class="orders-status-modal-footer">
          <button type="button" id="ordersStatusApproveBtn" class="orders-status-modal-btn" style="display:none;border:none;background:#059669;color:white;">Approuver</button>
          <button type="button" id="ordersStatusRejectBtn" class="orders-status-modal-btn" style="display:none;border:none;background:#dc2626;color:white;">Rejeter</button>
          <button type="button" id="ordersStatusModalDone" class="orders-status-modal-btn" style="border:1px solid rgba(148,163,184,.35);background:white;color:#0f172a;">Fermer</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const close = () => {
    modal.classList.add("hidden");
    currentModalOrder = null;
    currentModalHistory = [];
    currentHistoryExpanded = false;
    modalHistoryToken += 1;
  };
  modal.querySelector("[data-modal-overlay='true']")?.addEventListener("click", (event) => {
    if (event.target?.dataset?.modalOverlay === "true") close();
  });
  modal.querySelector("#ordersStatusModalClose")?.addEventListener("click", close);
  modal.querySelector("#ordersStatusModalDone")?.addEventListener("click", close);
  modal.querySelector("#ordersStatusApproveBtn")?.addEventListener("click", () => {
    if (currentModalOrder) void handleDecision(currentModalOrder, "approve");
  });
  modal.querySelector("#ordersStatusRejectBtn")?.addEventListener("click", () => {
    if (currentModalOrder) void handleDecision(currentModalOrder, "reject");
  });
  modal.querySelector("#ordersStatusModalContent")?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-history-action]");
    if (!button) return;
    const action = String(button.dataset.historyAction || "").trim().toLowerCase();
    const orderId = String(button.dataset.orderId || "").trim();
    const clientId = String(button.dataset.clientId || "").trim();
    const targetOrder = currentModalHistory.find((entry) => entry.id === orderId && entry.clientId === clientId);
    if (!targetOrder) return;
    if (action === "view") {
      void openOrderModal(targetOrder, currentModalHistory);
      return;
    }
    if (action === "approve" || action === "reject") {
      void handleDecision(targetOrder, action);
    }
  });
  modal.querySelector("#ordersStatusModalContent")?.addEventListener("toggle", (event) => {
    const details = event.target;
    if (!(details instanceof HTMLElement)) return;
    if (details.id !== "ordersStatusHistoryDetails") return;
    currentHistoryExpanded = details.hasAttribute("open");
  }, true);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.classList.contains("hidden")) {
      close();
    }
  });

  return modal;
}

function setModalButtonsEnabled(enabled) {
  const modal = ensureModal();
  const approveBtn = modal.querySelector("#ordersStatusApproveBtn");
  const rejectBtn = modal.querySelector("#ordersStatusRejectBtn");
  [approveBtn, rejectBtn].forEach((btn) => {
    if (!btn) return;
    btn.disabled = !enabled;
    btn.style.opacity = enabled ? "1" : ".55";
    btn.style.cursor = enabled ? "pointer" : "not-allowed";
  });
}

function renderOrderModal(order, options = {}) {
  const modal = ensureModal();
  currentModalOrder = order;
  const title = modal.querySelector("#ordersStatusModalTitle");
  const content = modal.querySelector("#ordersStatusModalContent");
  const approveBtn = modal.querySelector("#ordersStatusApproveBtn");
  const rejectBtn = modal.querySelector("#ordersStatusRejectBtn");
  const delivery = order.delivery || null;
  const items = Array.isArray(order.items) ? order.items : [];
  const extractedText = String(order.extractedText || "").trim();
  const deliveryTarget = getDeliveryTarget(delivery);
  const deliveryContact = [delivery?.phone ? `Tel: ${delivery.phone}` : "", delivery?.whatsapp ? `WA: ${delivery.whatsapp}` : ""]
    .filter(Boolean)
    .join(" | ");
  const history = Array.isArray(options.history) ? options.history : [];
  const historyLoading = Boolean(options.historyLoading);
  const historyError = String(options.historyError || "").trim();

  if (title) {
    title.textContent = order.uniqueCode ? `Commande ${order.uniqueCode}` : `Commande ${order.id}`;
  }

  if (approveBtn) approveBtn.style.display = order.status === "pending" ? "inline-flex" : "none";
  if (rejectBtn) rejectBtn.style.display = order.status === "pending" ? "inline-flex" : "none";
  setModalButtonsEnabled(true);

  if (content) {
    content.innerHTML = `
      <div class="orders-status-modal-grid" style="margin-top:18px;">
        <div class="orders-status-modal-card soft">
          <p style="margin:0;font-size:12px;text-transform:uppercase;letter-spacing:.14em;color:#64748b;font-weight:800;">Client</p>
          <p style="margin:10px 0 0;font-size:1.05rem;font-weight:800;">${escapeHtml(order.customerName || "-")}</p>
          <p style="margin:8px 0 0;color:#475569;">${escapeHtml(order.customerEmail || "-")}</p>
          <p style="margin:6px 0 0;color:#475569;">${escapeHtml(order.customerPhone || "-")}</p>
          <p style="margin:10px 0 0;font-size:12px;text-transform:uppercase;letter-spacing:.14em;color:#64748b;font-weight:800;">Numero deposant</p>
          <p style="margin:6px 0 0;color:#0f172a;font-weight:700;">${escapeHtml(order.depositorPhone || "-")}</p>
        </div>
        <div class="orders-status-modal-card soft">
          <p style="margin:0;font-size:12px;text-transform:uppercase;letter-spacing:.14em;color:#64748b;font-weight:800;">Montant</p>
          <p style="margin:10px 0 0;font-size:1.3rem;font-weight:900;">${formatPrice(order.amount)}</p>
          <p style="margin:8px 0 0;color:#475569;">${escapeHtml(order.methodName || "Methode non definie")}</p>
          <p style="margin:6px 0 0;"><span style="display:inline-flex;align-items:center;justify-content:center;border-radius:999px;background:rgba(15,23,42,.06);padding:6px 10px;font-size:12px;font-weight:800;color:#0f172a;">${escapeHtml(getStatusLabel(order.status))}</span></p>
          ${order.bonusEligible ? `
            <div style="margin-top:12px;border-radius:14px;background:rgba(217,119,6,.08);padding:12px;">
              <p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:.14em;color:#9a3412;font-weight:800;">Bonus automatique</p>
              <p style="margin:8px 0 0;color:#7c2d12;font-weight:800;">${order.bonusDoesAwarded > 0 ? `+${escapeHtml(String(order.bonusDoesAwarded))} Does accordes` : `${escapeHtml(String(order.bonusPercent || 10))}% prevu apres approbation`}</p>
              <p style="margin:6px 0 0;color:#92400e;font-size:13px;">Base: ${formatPrice(order.bonusHtgBasis || order.amount)} · Taux: ${escapeHtml(String(order.bonusRateHtgToDoes || 20))} Does / HTG</p>
              ${order.bonusAwardedAtMs > 0 ? `<p style="margin:6px 0 0;color:#92400e;font-size:13px;">Accorde le ${escapeHtml(formatDate(order.bonusAwardedAtMs))}</p>` : ""}
            </div>
          ` : ""}
        </div>
      </div>
      ${renderHistorySection(history, order.id, historyLoading, historyError)}
      <div class="orders-status-modal-grid orders-status-modal-section">
        <div class="orders-status-modal-card">
          <p style="margin:0;font-size:12px;text-transform:uppercase;letter-spacing:.14em;color:#64748b;font-weight:800;">Adresse</p>
          <p style="margin:10px 0 0;line-height:1.7;">${escapeHtml(order.customerAddress || "-")}</p>
          <p style="margin:8px 0 0;color:#475569;">Ville: ${escapeHtml(order.customerCity || "-")}</p>
        </div>
        <div class="orders-status-modal-card">
          <p style="margin:0;font-size:12px;text-transform:uppercase;letter-spacing:.14em;color:#64748b;font-weight:800;">Trace</p>
          <p style="margin:10px 0 0;">Code: <strong>${escapeHtml(order.uniqueCode || "-")}</strong></p>
          <p style="margin:8px 0 0;color:#475569;">Soumis le ${escapeHtml(formatDate(order.createdAtMs))}</p>
          <p style="margin:8px 0 0;color:#475569;">Nom sur preuve: ${escapeHtml(order.proofName || "-")}</p>
        </div>
      </div>
      <div class="orders-status-modal-card orders-status-modal-section">
        <p style="margin:0;font-size:12px;text-transform:uppercase;letter-spacing:.14em;color:#64748b;font-weight:800;">Livraison</p>
        <p style="margin:10px 0 0;font-weight:800;">${escapeHtml(getDeliveryLabel(delivery))}</p>
        ${deliveryTarget ? `<p style="margin:8px 0 0;color:#475569;">Zone/Point: ${escapeHtml(deliveryTarget)}</p>` : ""}
        ${delivery?.address ? `<p style="margin:8px 0 0;color:#475569;">Adresse: ${escapeHtml(delivery.address)}</p>` : ""}
        ${deliveryContact ? `<p style="margin:8px 0 0;color:#475569;">Contact: ${escapeHtml(deliveryContact)}</p>` : ""}
        ${delivery?.meetupProposal ? `<p style="margin:8px 0 0;color:#475569;">Proposition: ${escapeHtml(delivery.meetupProposal)}</p>` : ""}
      </div>
      <div class="orders-status-modal-card orders-status-modal-section">
        <p style="margin:0;font-size:12px;text-transform:uppercase;letter-spacing:.14em;color:#64748b;font-weight:800;">Produits (${items.length})</p>
        <div style="margin-top:12px;display:grid;gap:12px;">
          ${items.length ? items.map((item, index) => {
            const quantity = Number(item?.quantity) || 1;
            const price = Number(item?.price) || 0;
            const total = quantity * price;
            return `
              <div style="border:1px solid rgba(148,163,184,.18);border-radius:16px;padding:14px;background:#fafafa;">
                <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;">
                  <div>
                    <p style="margin:0;font-weight:800;">${escapeHtml(item?.name || "Produit")}</p>
                    <p style="margin:8px 0 0;color:#475569;font-size:14px;">Qte ${quantity} · PU ${formatPrice(price)} · Total ${formatPrice(total)}</p>
                    <p style="margin:6px 0 0;color:#64748b;font-size:13px;">${escapeHtml(formatItemOptions(item))}</p>
                  </div>
                  <span style="font-size:12px;color:#64748b;font-weight:800;">#${index + 1}</span>
                </div>
              </div>
            `;
          }).join("") : `<p style="margin:0;color:#64748b;">Aucun produit detaille pour cette commande.</p>`}
        </div>
      </div>
      <div class="orders-status-modal-card orders-status-modal-section">
        <p style="margin:0;font-size:12px;text-transform:uppercase;letter-spacing:.14em;color:#64748b;font-weight:800;">OCR</p>
        <p style="margin:10px 0 0;color:#475569;">Statut: ${escapeHtml(order.extractedTextStatus || (extractedText ? "success" : "empty"))}</p>
        <pre class="orders-status-modal-pre">${escapeHtml(extractedText || "-")}</pre>
      </div>
    `;
  }

  modal.classList.remove("hidden");
}

async function openOrderModal(order, preloadedHistory = null) {
  currentHistoryExpanded = false;
  const initialHistory = Array.isArray(preloadedHistory) && preloadedHistory.length ? preloadedHistory : [];
  currentModalHistory = initialHistory;
  renderOrderModal(order, { history: initialHistory, historyLoading: !initialHistory.length });
  const historyToken = ++modalHistoryToken;

  try {
    const history = await loadClientOrders(order.clientId);
    if (historyToken !== modalHistoryToken || currentModalOrder?.id !== order.id || currentModalOrder?.clientId !== order.clientId) return;
    currentModalHistory = history;
    renderOrderModal(order, { history });
  } catch (error) {
    console.error("[ORDERS_STATUS] history load failed", error);
    if (historyToken !== modalHistoryToken || currentModalOrder?.id !== order.id || currentModalOrder?.clientId !== order.clientId) return;
    currentModalHistory = [];
    renderOrderModal(order, {
      history: [],
      historyError: error?.message || "Impossible de charger l'historique de ce client.",
    });
  }
}

function renderRows(rows) {
  if (!tableBodyEl) return;
  const groups = groupOrdersByDay(rows);
  tableBodyEl.innerHTML = groups.map((group) => {
    const sectionRows = group.rows.map((order) => `
      <tr>
        <td data-label="Date">${formatDate(order.createdAtMs)}</td>
        <td data-label="Client">${escapeHtml(order.customerName || "-")}</td>
        <td data-label="Email">${escapeHtml(order.customerEmail || "-")}</td>
        <td data-label="Montant">${formatPrice(order.amount)}</td>
        <td data-label="Methode">${escapeHtml(order.methodName || "-")}</td>
        <td data-label="Statut"><span class="status-pill">${escapeHtml(getStatusLabel(order.status))}</span></td>
        <td data-label="Code">${escapeHtml(order.uniqueCode || "-")}</td>
        <td data-label="Actions" class="actions-cell">
          <div class="row-actions">
            <button type="button" data-action="view" data-order-id="${escapeHtml(order.id)}" data-client-id="${escapeHtml(order.clientId)}" style="border:1px solid rgba(148,163,184,.26);background:white;color:#0f172a;border-radius:999px;padding:8px 12px;font-size:12px;font-weight:800;cursor:pointer;">Consulter</button>
            ${canReview ? `
              <button type="button" data-action="approve" data-order-id="${escapeHtml(order.id)}" data-client-id="${escapeHtml(order.clientId)}" style="border:none;background:#059669;color:white;border-radius:999px;padding:8px 12px;font-size:12px;font-weight:800;cursor:pointer;">Approuver</button>
              <button type="button" data-action="reject" data-order-id="${escapeHtml(order.id)}" data-client-id="${escapeHtml(order.clientId)}" style="border:none;background:#dc2626;color:white;border-radius:999px;padding:8px 12px;font-size:12px;font-weight:800;cursor:pointer;">Rejeter</button>
            ` : ""}
          </div>
        </td>
      </tr>
    `).join("");

    return `
      <tr class="day-group-row">
        <td class="day-group-cell" colspan="8" style="padding:18px 12px 10px;border-bottom:none;background:rgba(15,23,42,.03);">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
            <span style="font-size:13px;text-transform:uppercase;letter-spacing:.16em;font-weight:900;color:var(--page-accent);">${escapeHtml(group.label)}</span>
            <span style="font-size:12px;font-weight:800;color:#64748b;">${group.rows.length} commande(s)</span>
          </div>
        </td>
      </tr>
      ${sectionRows}
    `;
  }).join("");
}

function findOrder(orderId, clientId) {
  return currentRows.find((row) => row.id === orderId && row.clientId === clientId) || null;
}

function readRowsCache() {
  try {
    const raw = window.localStorage?.getItem(CACHE_KEY) || "";
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const rows = Array.isArray(parsed?.rows) ? parsed.rows : [];
    return {
      savedAtMs: Number(parsed?.savedAtMs || 0) || 0,
      rows,
    };
  } catch (error) {
    console.warn("[ORDERS_STATUS] read cache failed", error);
    return null;
  }
}

function writeRowsCache(rows = []) {
  try {
    window.localStorage?.setItem(CACHE_KEY, JSON.stringify({
      savedAtMs: Date.now(),
      rows: Array.isArray(rows) ? rows : [],
    }));
  } catch (error) {
    console.warn("[ORDERS_STATUS] write cache failed", error);
  }
}

function removeOrderFromCache(order) {
  if (!order?.id || !order?.clientId) return;
  const cached = readRowsCache();
  if (!cached) return;
  const nextRows = cached.rows.filter((row) => !(row?.id === order.id && row?.clientId === order.clientId));
  writeRowsCache(nextRows);
}

function applyRows(rows, options = {}) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const fromCache = options.fromCache === true;
  currentRows = safeRows;
  const stats = computeOrderStats(safeRows);

  if (totalEl) totalEl.textContent = String(safeRows.length);
  if (amountEl) amountEl.textContent = formatPrice(stats.amount);

  if (!safeRows.length) {
    tableBodyEl && (tableBodyEl.innerHTML = "");
    emptyEl?.classList.remove("hidden");
  } else {
    emptyEl?.classList.add("hidden");
    renderRows(safeRows);
  }

  if (loadingEl) {
    loadingEl.textContent = fromCache ? "Affichage du cache local. Synchronisation en cours..." : "Chargement des commandes...";
  }
}

async function refreshRows() {
  const rows = await loadOrders(status);
  applyRows(rows, { fromCache: false });
  writeRowsCache(rows);
}

function hydrateFromCache() {
  const cached = readRowsCache();
  if (!cached || !Array.isArray(cached.rows) || cached.rows.length <= 0) return false;
  applyRows(cached.rows, { fromCache: true });
  loadingEl?.classList.remove("hidden");
  contentEl?.classList.remove("hidden");
  return true;
}

async function refreshRowsAndHandleFailure() {
  try {
    await refreshRows();
    errorEl?.classList.add("hidden");
    loadingEl?.classList.add("hidden");
    contentEl?.classList.remove("hidden");
  } catch (error) {
    if (currentRows.length > 0) {
      console.error("[ORDERS_STATUS] refresh failed, cache kept", error);
      loadingEl?.classList.add("hidden");
      contentEl?.classList.remove("hidden");
      if (errorEl) {
        errorEl.textContent = "Synchronisation impossible pour le moment. Dernier cache affiche.";
        errorEl.classList.remove("hidden");
      }
      return;
    }
    throw error;
  }
}

async function handleDecision(order, decision) {
  const decisionLabel = decision === "approve" ? "approuver" : "rejeter";
  const decisionKey = `${order.clientId}:${order.id}:${decision}`;
  if (activeDecisionKey === decisionKey) return;
  if (!window.confirm(`Confirmer ${decisionLabel} la commande ${order.uniqueCode || order.id} ?`)) return;

  activeDecisionKey = decisionKey;
  setModalButtonsEnabled(false);

  try {
    console.log("[ORDERS_STATUS] resolve decision request", {
      orderId: order.id,
      clientId: order.clientId,
      decision,
      currentStatus: order.status,
    });

    const result = await resolveDepositReviewSecure({
      orderId: order.id,
      clientId: order.clientId,
      decision,
    });

    console.log("[ORDERS_STATUS] resolve decision response", result || null);
    showToast(
      decision === "approve" ? "Commande approuvee avec succes." : "Commande rejetee avec succes.",
      "success",
    );

    document.getElementById("ordersStatusModal")?.classList.add("hidden");
    currentModalOrder = null;
    removeOrderFromCache(order);
    const nextRows = currentRows.filter((row) => !(row.id === order.id && row.clientId === order.clientId));
    applyRows(nextRows, { fromCache: false });
    writeRowsCache(nextRows);
    void refreshRowsAndHandleFailure();
  } catch (error) {
    console.error("[ORDERS_STATUS] resolve decision failed", error);
    showToast(error?.message || "Impossible de traiter cette commande.", "error");
  } finally {
    activeDecisionKey = "";
    setModalButtonsEnabled(true);
  }
}

tableBodyEl?.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const orderId = String(button.dataset.orderId || "");
  const clientId = String(button.dataset.clientId || "");
  const action = String(button.dataset.action || "");
  const order = findOrder(orderId, clientId);
  if (!order) return;

  if (action === "view") {
    void openOrderModal(order);
    return;
  }

  if (action === "approve" || action === "reject") {
    void handleDecision(order, action);
  }
});

async function init() {
  try {
    const adminUser = await ensureOrdersAccess(meta.label);
    if (adminEmailEl) {
      adminEmailEl.textContent = adminUser?.email || adminUser?.uid || "Admin connecte";
    }

    hydrateFromCache();
    await refreshRowsAndHandleFailure();
  } catch (error) {
    console.error("[ORDERS_STATUS] init failed", error);
    loadingEl?.classList.add("hidden");
    if (errorEl) {
      errorEl.textContent = error?.message || "Impossible de charger cette page commandes.";
      errorEl.classList.remove("hidden");
    }
  }
}

void init();

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

let currentRows = [];
let currentModalOrder = null;
let currentModalHistory = [];
let activeDecisionKey = "";
let toastTimeout = 0;
let modalHistoryToken = 0;

document.documentElement.style.setProperty("--page-accent", meta.accent);
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

  if (loading) {
    return `
      <div style="margin-top:16px;border:1px solid rgba(148,163,184,.2);border-radius:18px;padding:16px;">
        <p style="margin:0;font-size:12px;text-transform:uppercase;letter-spacing:.14em;color:#64748b;font-weight:800;">Historique de cette personne</p>
        <p style="margin:12px 0 0;color:#475569;">Chargement de l'historique...</p>
      </div>
    `;
  }

  if (errorMessage) {
    return `
      <div style="margin-top:16px;border:1px solid rgba(248,113,113,.34);border-radius:18px;padding:16px;background:#fff1f2;">
        <p style="margin:0;font-size:12px;text-transform:uppercase;letter-spacing:.14em;color:#be123c;font-weight:800;">Historique de cette personne</p>
        <p style="margin:12px 0 0;color:#9f1239;">${escapeHtml(errorMessage)}</p>
      </div>
    `;
  }

  return `
    <div style="margin-top:16px;border:1px solid rgba(148,163,184,.2);border-radius:18px;padding:16px;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
        <p style="margin:0;font-size:12px;text-transform:uppercase;letter-spacing:.14em;color:#64748b;font-weight:800;">Historique de cette personne</p>
        <span style="display:inline-flex;align-items:center;justify-content:center;border-radius:999px;background:rgba(15,23,42,.06);padding:6px 10px;font-size:12px;font-weight:800;color:#0f172a;">${otherHistory.length} demande(s)</span>
      </div>
      <div style="margin-top:12px;display:grid;gap:10px;">
        ${otherHistory.length ? otherHistory.map((entry, index) => {
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
        }).join('') : '<p style="margin:0;color:#64748b;">Aucune autre demande trouvee pour ce client.</p>'}
      </div>
    </div>
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
    <div data-modal-overlay="true" style="position:fixed;inset:0;background:rgba(15,23,42,.52);backdrop-filter:blur(10px);display:flex;align-items:center;justify-content:center;padding:max(12px, env(safe-area-inset-top, 0px)) max(12px, env(safe-area-inset-right, 0px)) max(12px, env(safe-area-inset-bottom, 0px)) max(12px, env(safe-area-inset-left, 0px));z-index:1600;">
      <div style="width:min(900px,100%);max-height:min(92dvh,920px);overflow:auto;-webkit-overflow-scrolling:touch;border-radius:24px;background:white;border:1px solid rgba(148,163,184,.24);box-shadow:0 32px 64px rgba(15,23,42,.26);padding:clamp(16px,3.6vw,24px);">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;">
          <div>
            <p style="margin:0;font-size:12px;text-transform:uppercase;letter-spacing:.18em;color:#64748b;font-weight:800;">Commande</p>
            <h2 id="ordersStatusModalTitle" style="margin:10px 0 0;font-size:clamp(1.6rem,3vw,2.5rem);line-height:1.08;">Details</h2>
          </div>
          <button type="button" id="ordersStatusModalClose" style="border:none;background:#f8fafc;color:#0f172a;border-radius:999px;width:44px;height:44px;font-size:18px;font-weight:900;cursor:pointer;">×</button>
        </div>
        <div id="ordersStatusModalContent" style="margin-top:22px;"></div>
        <div style="display:flex;justify-content:flex-end;gap:12px;flex-wrap:wrap;margin-top:24px;padding-top:20px;border-top:1px solid rgba(148,163,184,.2);">
          <button type="button" id="ordersStatusApproveBtn" style="display:none;border:none;background:#059669;color:white;border-radius:16px;padding:12px 16px;font-weight:800;cursor:pointer;">Approuver</button>
          <button type="button" id="ordersStatusRejectBtn" style="display:none;border:none;background:#dc2626;color:white;border-radius:16px;padding:12px 16px;font-weight:800;cursor:pointer;">Rejeter</button>
          <button type="button" id="ordersStatusModalDone" style="border:1px solid rgba(148,163,184,.35);background:white;color:#0f172a;border-radius:16px;padding:12px 16px;font-weight:800;cursor:pointer;">Fermer</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const close = () => {
    modal.classList.add("hidden");
    currentModalOrder = null;
    currentModalHistory = [];
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
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;">
        <div style="border:1px solid rgba(148,163,184,.2);border-radius:18px;padding:16px;background:#f8fafc;">
          <p style="margin:0;font-size:12px;text-transform:uppercase;letter-spacing:.14em;color:#64748b;font-weight:800;">Client</p>
          <p style="margin:10px 0 0;font-size:1.05rem;font-weight:800;">${escapeHtml(order.customerName || "-")}</p>
          <p style="margin:8px 0 0;color:#475569;">${escapeHtml(order.customerEmail || "-")}</p>
          <p style="margin:6px 0 0;color:#475569;">${escapeHtml(order.customerPhone || "-")}</p>
        </div>
        <div style="border:1px solid rgba(148,163,184,.2);border-radius:18px;padding:16px;background:#f8fafc;">
          <p style="margin:0;font-size:12px;text-transform:uppercase;letter-spacing:.14em;color:#64748b;font-weight:800;">Montant</p>
          <p style="margin:10px 0 0;font-size:1.3rem;font-weight:900;">${formatPrice(order.amount)}</p>
          <p style="margin:8px 0 0;color:#475569;">${escapeHtml(order.methodName || "Methode non definie")}</p>
          <p style="margin:6px 0 0;"><span style="display:inline-flex;align-items:center;justify-content:center;border-radius:999px;background:rgba(15,23,42,.06);padding:6px 10px;font-size:12px;font-weight:800;color:#0f172a;">${escapeHtml(getStatusLabel(order.status))}</span></p>
        </div>
      </div>
      ${renderHistorySection(history, order.id, historyLoading, historyError)}
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin-top:16px;">
        <div style="border:1px solid rgba(148,163,184,.2);border-radius:18px;padding:16px;">
          <p style="margin:0;font-size:12px;text-transform:uppercase;letter-spacing:.14em;color:#64748b;font-weight:800;">Adresse</p>
          <p style="margin:10px 0 0;line-height:1.7;">${escapeHtml(order.customerAddress || "-")}</p>
          <p style="margin:8px 0 0;color:#475569;">Ville: ${escapeHtml(order.customerCity || "-")}</p>
        </div>
        <div style="border:1px solid rgba(148,163,184,.2);border-radius:18px;padding:16px;">
          <p style="margin:0;font-size:12px;text-transform:uppercase;letter-spacing:.14em;color:#64748b;font-weight:800;">Trace</p>
          <p style="margin:10px 0 0;">Code: <strong>${escapeHtml(order.uniqueCode || "-")}</strong></p>
          <p style="margin:8px 0 0;color:#475569;">Soumis le ${escapeHtml(formatDate(order.createdAtMs))}</p>
          <p style="margin:8px 0 0;color:#475569;">Nom sur preuve: ${escapeHtml(order.proofName || "-")}</p>
        </div>
      </div>
      <div style="margin-top:16px;border:1px solid rgba(148,163,184,.2);border-radius:18px;padding:16px;">
        <p style="margin:0;font-size:12px;text-transform:uppercase;letter-spacing:.14em;color:#64748b;font-weight:800;">Livraison</p>
        <p style="margin:10px 0 0;font-weight:800;">${escapeHtml(getDeliveryLabel(delivery))}</p>
        ${deliveryTarget ? `<p style="margin:8px 0 0;color:#475569;">Zone/Point: ${escapeHtml(deliveryTarget)}</p>` : ""}
        ${delivery?.address ? `<p style="margin:8px 0 0;color:#475569;">Adresse: ${escapeHtml(delivery.address)}</p>` : ""}
        ${deliveryContact ? `<p style="margin:8px 0 0;color:#475569;">Contact: ${escapeHtml(deliveryContact)}</p>` : ""}
        ${delivery?.meetupProposal ? `<p style="margin:8px 0 0;color:#475569;">Proposition: ${escapeHtml(delivery.meetupProposal)}</p>` : ""}
      </div>
      <div style="margin-top:16px;border:1px solid rgba(148,163,184,.2);border-radius:18px;padding:16px;">
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
      <div style="margin-top:16px;border:1px solid rgba(148,163,184,.2);border-radius:18px;padding:16px;">
        <p style="margin:0;font-size:12px;text-transform:uppercase;letter-spacing:.14em;color:#64748b;font-weight:800;">OCR</p>
        <p style="margin:10px 0 0;color:#475569;">Statut: ${escapeHtml(order.extractedTextStatus || (extractedText ? "success" : "empty"))}</p>
        <pre style="margin:12px 0 0;white-space:pre-wrap;word-break:break-word;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;line-height:1.7;background:#0f172a;color:#e2e8f0;border-radius:16px;padding:14px;">${escapeHtml(extractedText || "-")}</pre>
      </div>
    `;
  }

  modal.classList.remove("hidden");
}

async function openOrderModal(order, preloadedHistory = null) {
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

async function refreshRows() {
  const rows = await loadOrders(status);
  currentRows = rows;
  const stats = computeOrderStats(rows);

  if (totalEl) totalEl.textContent = String(rows.length);
  if (amountEl) amountEl.textContent = formatPrice(stats.amount);

  if (!rows.length) {
    tableBodyEl && (tableBodyEl.innerHTML = "");
    emptyEl?.classList.remove("hidden");
  } else {
    emptyEl?.classList.add("hidden");
    renderRows(rows);
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
    await refreshRows();
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

    await refreshRows();

    loadingEl?.classList.add("hidden");
    contentEl?.classList.remove("hidden");
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

import { ensureOrdersAccess, loadOrders, computeOrderStats, formatPrice } from "./orders-data.js";

const statusCards = {
  pending: document.getElementById("ordersPendingCount"),
  approved: document.getElementById("ordersApprovedCount"),
  rejected: document.getElementById("ordersRejectedCount"),
  total: document.getElementById("ordersTotalCount"),
  amount: document.getElementById("ordersTotalAmount"),
  totalCard: document.getElementById("ordersTotalCountCard"),
};

const adminEmailEl = document.getElementById("ordersAdminEmail");
const loadingEl = document.getElementById("ordersLoadingState");
const errorEl = document.getElementById("ordersErrorState");
const contentEl = document.getElementById("ordersHomeContent");

async function init() {
  try {
    const adminUser = await ensureOrdersAccess("Commandes admin");
    if (adminEmailEl) {
      adminEmailEl.textContent = adminUser?.email || adminUser?.uid || "Admin connecté";
    }

    const orders = await loadOrders("all");
    const stats = computeOrderStats(orders);

    if (statusCards.pending) statusCards.pending.textContent = String(stats.pending);
    if (statusCards.approved) statusCards.approved.textContent = String(stats.approved);
    if (statusCards.rejected) statusCards.rejected.textContent = String(stats.rejected);
    if (statusCards.total) statusCards.total.textContent = String(stats.total);
    if (statusCards.totalCard) statusCards.totalCard.textContent = String(stats.total);
    if (statusCards.amount) statusCards.amount.textContent = formatPrice(stats.amount);

    loadingEl?.classList.add("hidden");
    contentEl?.classList.remove("hidden");
  } catch (error) {
    console.error("[ORDERS_HOME] init failed", error);
    loadingEl?.classList.add("hidden");
    if (errorEl) {
      errorEl.textContent = error?.message || "Impossible de charger la page commandes.";
      errorEl.classList.remove("hidden");
    }
  }
}

void init();

import { computeWithdrawalStats, ensureWithdrawalsAccess, formatPrice, loadWithdrawals } from "./withdrawals-data.js";

const cards = {
  pending: document.getElementById("withdrawalsPendingCount"),
  approved: document.getElementById("withdrawalsApprovedCount"),
  rejected: document.getElementById("withdrawalsRejectedCount"),
  total: document.getElementById("withdrawalsTotalCount"),
  amount: document.getElementById("withdrawalsTotalAmount"),
  totalCard: document.getElementById("withdrawalsTotalCountCard"),
};

const adminEmailEl = document.getElementById("withdrawalsAdminEmail");
const loadingEl = document.getElementById("withdrawalsLoadingState");
const errorEl = document.getElementById("withdrawalsErrorState");
const contentEl = document.getElementById("withdrawalsHomeContent");

async function init() {
  try {
    const adminUser = await ensureWithdrawalsAccess("Retraits admin");
    if (adminEmailEl) {
      adminEmailEl.textContent = adminUser?.email || adminUser?.uid || "Admin connecté";
    }

    const withdrawals = await loadWithdrawals("all");
    const stats = computeWithdrawalStats(withdrawals);

    if (cards.pending) cards.pending.textContent = String(stats.pending);
    if (cards.approved) cards.approved.textContent = String(stats.approved);
    if (cards.rejected) cards.rejected.textContent = String(stats.rejected);
    if (cards.total) cards.total.textContent = String(stats.total);
    if (cards.totalCard) cards.totalCard.textContent = String(stats.total);
    if (cards.amount) cards.amount.textContent = formatPrice(stats.amount);

    loadingEl?.classList.add("hidden");
    contentEl?.classList.remove("hidden");
  } catch (error) {
    console.error("[WITHDRAWALS_HOME] init failed", error);
    loadingEl?.classList.add("hidden");
    if (errorEl) {
      errorEl.textContent = error?.message || "Impossible de charger la page retraits.";
      errorEl.classList.remove("hidden");
    }
  }
}

void init();

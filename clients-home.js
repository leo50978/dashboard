import { ensureClientsAccess, loadClientRows, computeClientStats, formatDoes, formatPrice } from "./clients-data.js";

const adminEmailEl = document.getElementById("clientsAdminEmail");
const loadingEl = document.getElementById("clientsLoadingState");
const errorEl = document.getElementById("clientsErrorState");
const contentEl = document.getElementById("clientsHomeContent");
const totalCountEl = document.getElementById("clientsTotalCount");
const totalHtgEl = document.getElementById("clientsTotalHtg");
const totalDoesEl = document.getElementById("clientsTotalDoes");
const activeCountEl = document.getElementById("clientsActiveCount");
const frozenCountEl = document.getElementById("clientsFrozenCount");
const gainCountEl = document.getElementById("clientsGainCount");
const lossCountEl = document.getElementById("clientsLossCount");

async function init() {
  try {
    const adminUser = await ensureClientsAccess("Clients admin");
    if (adminEmailEl) {
      adminEmailEl.textContent = adminUser?.email || adminUser?.uid || "Admin connecté";
    }

    const rows = await loadClientRows("all");
    const stats = computeClientStats(rows);

    if (totalCountEl) totalCountEl.textContent = String(stats.total);
    if (totalHtgEl) totalHtgEl.textContent = formatPrice(stats.totalHtgBalance);
    if (totalDoesEl) totalDoesEl.textContent = formatDoes(stats.totalDoesBalance);
    if (activeCountEl) activeCountEl.textContent = String(stats.active);
    if (frozenCountEl) frozenCountEl.textContent = String(stats.frozen);
    if (gainCountEl) gainCountEl.textContent = String(stats.gain);
    if (lossCountEl) lossCountEl.textContent = String(stats.loss);

    loadingEl?.classList.add("hidden");
    contentEl?.classList.remove("hidden");
  } catch (error) {
    console.error("[CLIENTS_HOME] init failed", error);
    loadingEl?.classList.add("hidden");
    if (errorEl) {
      errorEl.textContent = error?.message || "Impossible de charger la page clients.";
      errorEl.classList.remove("hidden");
    }
  }
}

void init();

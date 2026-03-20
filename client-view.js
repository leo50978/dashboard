import {
  ensureClientsAccess,
  loadClientDetail,
  formatDate,
  formatDateTime,
  formatDoes,
  formatPrice,
  formatSignedDoes,
} from "./clients-data.js";
import { unfreezeClientAccountSecure } from "./secure-functions.js";

const params = new URLSearchParams(window.location.search);
const clientId = String(params.get("id") || "").trim();

const adminEmailEl = document.getElementById("clientViewAdminEmail");
const titleEl = document.getElementById("clientViewTitle");
const subtitleEl = document.getElementById("clientViewSubtitle");
const loadingEl = document.getElementById("clientViewLoading");
const errorEl = document.getElementById("clientViewError");
const contentEl = document.getElementById("clientViewContent");
const unfreezeBtn = document.getElementById("clientViewUnfreezeBtn");

const statusBadgeEl = document.getElementById("clientViewStatusBadge");
const performanceBadgeEl = document.getElementById("clientViewPerformanceBadge");
const htgBalanceEl = document.getElementById("clientViewHtgBalance");
const doesBalanceEl = document.getElementById("clientViewDoesBalance");
const rejectsEl = document.getElementById("clientViewRejects");
const matchesPlayedEl = document.getElementById("clientViewMatchesPlayed");
const matchesWonEl = document.getElementById("clientViewMatchesWon");
const matchesLostEl = document.getElementById("clientViewMatchesLost");
const emailEl = document.getElementById("clientViewEmail");
const phoneEl = document.getElementById("clientViewPhone");
const createdAtEl = document.getElementById("clientViewCreatedAt");
const lastMatchEl = document.getElementById("clientViewLastMatch");
const withdrawableEl = document.getElementById("clientViewWithdrawable");
const exchangeableDoesEl = document.getElementById("clientViewExchangeableDoes");
const totalBetEl = document.getElementById("clientViewTotalBet");
const totalRewardEl = document.getElementById("clientViewTotalReward");
const netGameEl = document.getElementById("clientViewNetGame");
const gameInsightEl = document.getElementById("clientViewGameInsight");
const ordersListEl = document.getElementById("clientViewOrdersList");
const gameplayListEl = document.getElementById("clientViewGameplayList");

let currentDetail = null;
let unfreezeBusy = false;

function escapeHtml(value = "") {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setStatusBadge(client = {}) {
  if (!statusBadgeEl) return;
  const isFrozen = client.isFrozen === true;
  statusBadgeEl.textContent = isFrozen
    ? (client.freezeMode === "global" ? "Gel global" : "Gel retrait")
    : "Actif";
  statusBadgeEl.className = `badge ${isFrozen ? "badge-frozen" : "badge-active"}`;
}

function setPerformanceBadge(metrics = {}) {
  if (!performanceBadgeEl) return;
  const mode = String(metrics.gamePerformance || "neutre");
  performanceBadgeEl.textContent = mode === "gain" ? "En gain" : mode === "perte" ? "En perte" : "Neutre";
  performanceBadgeEl.className = `badge ${mode === "perte" ? "badge-loss" : "badge-gain"}`;
}

function renderOrders(orders = []) {
  if (!ordersListEl) return;
  if (!orders.length) {
    ordersListEl.innerHTML = `<div class="list-card"><p style="margin:0;color:#94a3b8;">Aucune commande enregistrée pour ce client.</p></div>`;
    return;
  }

  ordersListEl.innerHTML = orders.map((order) => `
    <article class="list-card">
      <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start;">
        <div>
          <p style="margin:0;font-weight:800;">${escapeHtml(order.uniqueCode || order.id || "Commande")}</p>
          <p style="margin:8px 0 0;color:#94a3b8;">${escapeHtml(formatDateTime(order.createdAtMs))}</p>
        </div>
        <span class="badge ${String(order.status || "").toLowerCase() === "rejected" ? "badge-loss" : String(order.status || "").toLowerCase() === "approved" ? "badge-gain" : "badge-frozen"}">${escapeHtml(String(order.status || "pending"))}</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr;gap:10px;margin-top:14px;">
        <div><span style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:#94a3b8;font-weight:800;">Montant</span><strong>${escapeHtml(formatPrice(order.amount))}</strong></div>
        <div><span style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:#94a3b8;font-weight:800;">Méthode</span><strong>${escapeHtml(order.methodName || order.methodId || "-")}</strong></div>
        <div><span style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:#94a3b8;font-weight:800;">OCR</span><strong style="font-weight:700;overflow-wrap:anywhere;">${escapeHtml(order.extractedText || "-")}</strong></div>
      </div>
    </article>
  `).join("");
}

function renderGameplay(detail = {}) {
  if (!gameplayListEl) return;
  const rooms = Array.isArray(detail.rooms) ? detail.rooms : [];
  const xchanges = Array.isArray(detail.xchanges) ? detail.xchanges : [];
  const combined = [
    ...xchanges
      .filter((item) => ["game_entry", "game_cost", "game_reward"].includes(String(item.type || "").toLowerCase()))
      .map((item) => ({
        kind: String(item.type || "").toLowerCase().includes("reward") ? "reward" : "entry",
        createdAtMs: Number(item.createdAtMs || 0),
        amountDoes: Number(item.amountDoes || 0),
        label: String(item.type || "").toLowerCase().includes("reward") ? "Gain de match" : "Mise de match",
      })),
    ...rooms.map((room) => ({
      kind: "room",
      createdAtMs: Number(room.endedAtMs || room.updatedAtMs || room.createdAtMs || 0),
      room,
      label: "Match terminé",
    })),
  ]
    .filter((item) => Number(item.createdAtMs) > 0)
    .sort((left, right) => Number(right.createdAtMs) - Number(left.createdAtMs))
    .slice(0, 12);

  if (!combined.length) {
    gameplayListEl.innerHTML = `<div class="list-card"><p style="margin:0;color:#94a3b8;">Aucune activité de jeu détectée pour ce client.</p></div>`;
    return;
  }

  gameplayListEl.innerHTML = combined.map((entry) => {
    if (entry.kind === "room") {
      const room = entry.room || {};
      const won = String(room.winnerUid || "").trim() && String(room.winnerUid || "").trim() === String(detail.client?.id || "");
      return `
        <article class="list-card">
          <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start;">
            <div>
              <p style="margin:0;font-weight:800;">Match ${escapeHtml(room.id || "")}</p>
              <p style="margin:8px 0 0;color:#94a3b8;">${escapeHtml(formatDateTime(entry.createdAtMs))}</p>
            </div>
            <span class="badge ${won ? "badge-gain" : "badge-loss"}">${won ? "Gagné" : "Perdu / autre"}</span>
          </div>
          <p style="margin:14px 0 0;color:#cbd5e1;">Statut: ${escapeHtml(room.status || "-")} · Joueurs: ${Array.isArray(room.playerUids) ? room.playerUids.length : 0}</p>
        </article>
      `;
    }

    return `
      <article class="list-card">
        <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start;">
          <div>
            <p style="margin:0;font-weight:800;">${escapeHtml(entry.label)}</p>
            <p style="margin:8px 0 0;color:#94a3b8;">${escapeHtml(formatDateTime(entry.createdAtMs))}</p>
          </div>
          <span class="badge ${entry.kind === "reward" ? "badge-gain" : "badge-loss"}">${escapeHtml(formatDoes(entry.amountDoes))}</span>
        </div>
      </article>
    `;
  }).join("");
}

function render(detail) {
  currentDetail = detail;
  const { client, metrics } = detail;

  if (titleEl) titleEl.textContent = client.displayName || client.id || "Client";
  if (subtitleEl) {
    subtitleEl.textContent = `UID: ${client.id} · ${client.email || client.phone || "Aucune coordonnée principale"}`;
  }
  if (htgBalanceEl) htgBalanceEl.textContent = formatPrice(client.htgBalance);
  if (doesBalanceEl) doesBalanceEl.textContent = formatDoes(client.doesBalanceCurrent);
  if (rejectsEl) rejectsEl.textContent = `${metrics.rejectedDepositStrikeCount || client.rejectedDepositStrikeCount || 0}/3`;
  if (matchesPlayedEl) matchesPlayedEl.textContent = String(metrics.matchesPlayed || 0);
  if (matchesWonEl) matchesWonEl.textContent = String(metrics.matchesWon || 0);
  if (matchesLostEl) matchesLostEl.textContent = String(metrics.matchesLost || 0);
  if (emailEl) emailEl.textContent = client.email || "-";
  if (phoneEl) phoneEl.textContent = client.phone || "-";
  if (createdAtEl) createdAtEl.textContent = formatDateTime(client.createdAtMs);
  if (lastMatchEl) lastMatchEl.textContent = formatDateTime(metrics.lastMatchAtMs);
  if (withdrawableEl) withdrawableEl.textContent = formatPrice(metrics.withdrawableHtg);
  if (exchangeableDoesEl) exchangeableDoesEl.textContent = formatDoes(metrics.exchangeableDoesAvailable);
  if (totalBetEl) totalBetEl.textContent = formatDoes(metrics.totalBetDoes);
  if (totalRewardEl) totalRewardEl.textContent = formatDoes(metrics.totalRewardDoes);
  if (netGameEl) netGameEl.textContent = formatSignedDoes(metrics.netGameDoes);
  if (gameInsightEl) {
    gameInsightEl.textContent = metrics.gamePerformance === "gain"
      ? "Le client est actuellement en gain sur son activité de jeu."
      : metrics.gamePerformance === "perte"
        ? "Le client est actuellement en perte sur son activité de jeu."
        : "Le client est pour l’instant neutre sur son activité de jeu.";
  }

  setStatusBadge(client);
  setPerformanceBadge(metrics);
  renderOrders(detail.orders);
  renderGameplay(detail);

  if (unfreezeBtn) {
    unfreezeBtn.classList.toggle("hidden", client.isFrozen !== true);
  }
}

async function handleUnfreeze() {
  if (!currentDetail?.client?.id || unfreezeBusy) return;
  const confirmed = window.confirm(`Dégeler ${currentDetail.client.displayName || currentDetail.client.id} ?`);
  if (!confirmed) return;

  unfreezeBusy = true;
  if (unfreezeBtn) {
    unfreezeBtn.disabled = true;
    unfreezeBtn.textContent = "Dégel en cours...";
  }
  try {
    await unfreezeClientAccountSecure({
      uid: currentDetail.client.id,
      reason: "dashboard_client_view",
    });
    const refreshed = await loadClientDetail(currentDetail.client.id);
    render(refreshed);
  } catch (error) {
    console.error("[CLIENT_VIEW] unfreeze failed", error);
    window.alert(error?.message || "Impossible de dégeler ce compte.");
  } finally {
    unfreezeBusy = false;
    if (unfreezeBtn) {
      unfreezeBtn.disabled = false;
      unfreezeBtn.innerHTML = `<i class="fas fa-unlock"></i>Dégeler ce compte`;
    }
  }
}

unfreezeBtn?.addEventListener("click", () => {
  void handleUnfreeze();
});

async function init() {
  if (!clientId) {
    loadingEl?.classList.add("hidden");
    if (errorEl) {
      errorEl.textContent = "Aucun client sélectionné.";
      errorEl.classList.remove("hidden");
    }
    return;
  }

  try {
    const adminUser = await ensureClientsAccess("Dossier client");
    if (adminEmailEl) {
      adminEmailEl.textContent = adminUser?.email || adminUser?.uid || "Admin connecté";
    }

    const detail = await loadClientDetail(clientId);
    render(detail);

    loadingEl?.classList.add("hidden");
    contentEl?.classList.remove("hidden");
  } catch (error) {
    console.error("[CLIENT_VIEW] init failed", error);
    loadingEl?.classList.add("hidden");
    if (errorEl) {
      errorEl.textContent = error?.message || "Impossible de charger le dossier client.";
      errorEl.classList.remove("hidden");
    }
  }
}

void init();

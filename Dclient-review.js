import { ensureFinanceDashboardSession } from "./dashboard-admin-auth.js";
import {
  approveClientPendingBalancesSecure,
  getAgentDepositClientContextSecure,
  getClientFraudAnalysisSecure,
  getClientGameHistorySecure,
  getClientOrdersSecure,
  getClientPendingDepositOrdersSecure,
  repairResolvedDepositResiduesSecure,
  searchAgentDepositClientsSecure,
} from "./secure-functions.js";

const dom = {
  adminEmail: document.getElementById("clientReviewAdminEmail"),
  selectedChip: document.getElementById("clientReviewSelectedChip"),
  searchInput: document.getElementById("clientReviewSearchInput"),
  searchBtn: document.getElementById("clientReviewSearchBtn"),
  status: document.getElementById("clientReviewStatus"),
  results: document.getElementById("clientReviewResults"),
  resultsEmpty: document.getElementById("clientReviewResultsEmpty"),
  dashboard: document.getElementById("clientReviewDashboard"),
  contextCopy: document.getElementById("clientReviewContextCopy"),
  approvedHtg: document.getElementById("clientReviewApprovedHtg"),
  pendingHtg: document.getElementById("clientReviewPendingHtg"),
  playableHtg: document.getElementById("clientReviewPlayableHtg"),
  withdrawableHtg: document.getElementById("clientReviewWithdrawableHtg"),
  pendingBadge: document.getElementById("clientReviewPendingCountBadge"),
  approveAllBtn: document.getElementById("clientReviewApproveAllBtn"),
  approveAllStatus: document.getElementById("clientReviewApproveAllStatus"),
  refreshBtn: document.getElementById("clientReviewRefreshBtn"),
  orders: document.getElementById("clientReviewOrders"),
  ordersEmpty: document.getElementById("clientReviewOrdersEmpty"),
  ordersPagination: document.getElementById("clientReviewOrdersPagination"),
  ordersLoadMoreBtn: document.getElementById("clientReviewOrdersLoadMoreBtn"),
  gameFilter: document.getElementById("clientReviewGameFilter"),
  resultFilter: document.getElementById("clientReviewResultFilter"),
  opponentFilter: document.getElementById("clientReviewOpponentFilter"),
  dateFrom: document.getElementById("clientReviewDateFrom"),
  dateTo: document.getElementById("clientReviewDateTo"),
  historyRefreshBtn: document.getElementById("clientReviewHistoryRefreshBtn"),
  historyMeta: document.getElementById("clientReviewHistoryMeta"),
  totalMatches: document.getElementById("clientReviewTotalMatches"),
  totalWagered: document.getElementById("clientReviewTotalWagered"),
  totalWon: document.getElementById("clientReviewTotalWon"),
  totalNet: document.getElementById("clientReviewTotalNet"),
  gameBreakdown: document.getElementById("clientReviewGameBreakdown"),
  history: document.getElementById("clientReviewHistory"),
  historyEmpty: document.getElementById("clientReviewHistoryEmpty"),
  pagination: document.getElementById("clientReviewPagination"),
  loadMoreBtn: document.getElementById("clientReviewLoadMoreBtn"),
  actionStatus: document.getElementById("clientReviewActionStatus"),
  fraudAnalyzeBtn: document.getElementById("clientReviewFraudAnalyzeBtn"),
  fraudRefreshBtn: document.getElementById("clientReviewFraudRefreshBtn"),
  repairResolvedBtn: document.getElementById("clientReviewRepairResolvedBtn"),
  fraudStatus: document.getElementById("clientReviewFraudStatus"),
  fraudScore: document.getElementById("clientReviewFraudScore"),
  fraudLevel: document.getElementById("clientReviewFraudLevel"),
  fraudFlag: document.getElementById("clientReviewFraudFlag"),
  fraudWindow: document.getElementById("clientReviewFraudWindow"),
  fraudFindings: document.getElementById("clientReviewFraudFindings"),
  fraudFindingsEmpty: document.getElementById("clientReviewFraudFindingsEmpty"),
  fraudTimeline: document.getElementById("clientReviewFraudTimeline"),
  fraudTimelineEmpty: document.getElementById("clientReviewFraudTimelineEmpty"),
};

const state = {
  adminUser: null,
  searchSeq: 0,
  loadingClientId: "",
  selectedClient: null,
  clientContext: null,
  pendingOrders: [],
  orderRows: [],
  ordersTotal: 0,
  ordersNextOffset: 0,
  ordersHasMore: false,
  historyRows: [],
  historyTotal: 0,
  historyNextOffset: 0,
  historyHasMore: false,
  historySummaryHtg: null,
  historyByGameHtg: [],
  fraudAnalysis: null,
  busy: false,
  approvingAll: false,
};

function safeInt(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.max(0, Math.trunc(num)) : fallback;
}

function safeSignedInt(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.trunc(num) : fallback;
}

function escapeHtml(value = "") {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatHtg(value = 0) {
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(safeInt(value))} HTG`;
}

function formatSignedHtg(value = 0) {
  const amount = safeSignedInt(value);
  const abs = `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Math.abs(amount))} HTG`;
  if (amount === 0) return abs;
  return `${amount > 0 ? "+" : "-"}${abs}`;
}

function formatDateTime(ms = 0) {
  const safeMs = safeSignedInt(ms);
  if (!safeMs) return "-";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(safeMs));
}

function formatShortDate(ms = 0) {
  const safeMs = safeSignedInt(ms);
  if (!safeMs) return "-";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(safeMs));
}

function pickNumeric(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) return Math.trunc(numeric);
    }
  }
  return 0;
}

function getToneForStatus(status = "") {
  const normalized = String(status || "").toLowerCase();
  if (["approved", "resolved", "settled", "success"].includes(normalized)) return "good";
  if (["rejected", "cancelled", "canceled", "failed", "error"].includes(normalized)) return "bad";
  if (["pending", "review", "waiting"].includes(normalized)) return "warn";
  return "neutral";
}

function getFraudTone(level = "") {
  const normalized = String(level || "").toLowerCase();
  if (normalized === "critical" || normalized === "high") return "bad";
  if (normalized === "medium" || normalized === "warn") return "warn";
  if (normalized === "good" || normalized === "low") return "good";
  return "neutral";
}

function getSearchQuery() {
  return String(dom.searchInput?.value || "").trim();
}

function getSelectedClientId() {
  return String(state.selectedClient?.uid || state.selectedClient?.id || "").trim();
}

function getHistoryFilters() {
  return {
    game: String(dom.gameFilter?.value || "all").trim().toLowerCase(),
    result: String(dom.resultFilter?.value || "all").trim().toLowerCase(),
    opponent: String(dom.opponentFilter?.value || "all").trim().toLowerCase(),
    startMs: dom.dateFrom?.value ? new Date(`${dom.dateFrom.value}T00:00:00`).getTime() : 0,
    endMs: dom.dateTo?.value ? new Date(`${dom.dateTo.value}T23:59:59.999`).getTime() : 0,
  };
}

function setStatus(message = "", tone = "neutral") {
  if (!dom.status) return;
  dom.status.textContent = String(message || "");
  dom.status.dataset.tone = tone;
}

function setActionStatus(message = "", tone = "neutral") {
  if (!dom.actionStatus) return;
  dom.actionStatus.textContent = String(message || "");
  dom.actionStatus.dataset.tone = tone;
}

function setApproveAllStatus(message = "", tone = "neutral") {
  if (!dom.approveAllStatus) return;
  dom.approveAllStatus.textContent = String(message || "");
  dom.approveAllStatus.dataset.tone = tone;
}

function setBusy(busy = false) {
  state.busy = busy === true;
  const disabled = state.busy;
  if (dom.searchBtn) dom.searchBtn.disabled = disabled;
  if (dom.searchInput) dom.searchInput.disabled = disabled;
  if (dom.refreshBtn) dom.refreshBtn.disabled = disabled;
  if (dom.approveAllBtn) dom.approveAllBtn.disabled = disabled || state.approvingAll || (!state.pendingOrders.length && pickNumeric(state.clientContext?.fundingSnapshot?.provisionalHtgAvailable) <= 0);
  if (dom.ordersLoadMoreBtn) dom.ordersLoadMoreBtn.disabled = disabled || !state.ordersHasMore;
  if (dom.historyRefreshBtn) dom.historyRefreshBtn.disabled = disabled;
  if (dom.loadMoreBtn) dom.loadMoreBtn.disabled = disabled || !state.historyHasMore;
  if (dom.fraudAnalyzeBtn) dom.fraudAnalyzeBtn.disabled = disabled;
  if (dom.fraudRefreshBtn) dom.fraudRefreshBtn.disabled = disabled;
  if (dom.repairResolvedBtn) dom.repairResolvedBtn.disabled = disabled || !state.selectedClient;
  if (dom.gameFilter) dom.gameFilter.disabled = disabled;
  if (dom.resultFilter) dom.resultFilter.disabled = disabled;
  if (dom.opponentFilter) dom.opponentFilter.disabled = disabled;
  if (dom.dateFrom) dom.dateFrom.disabled = disabled;
  if (dom.dateTo) dom.dateTo.disabled = disabled;
}

function summarizeLoadedHistory(rows = []) {
  const list = Array.isArray(rows) ? rows : [];
  const byGameMap = new Map();
  const summary = {
    totalMatches: list.length,
    totalWageredHtg: 0,
    totalWonHtg: 0,
    totalNetHtg: 0,
  };

  list.forEach((row) => {
    const stakeHtg = pickNumeric(row.stakeHtg, row.wageredHtg, row.wageredAmountHtg);
    const wonHtg = pickNumeric(row.wonHtg, row.rewardAmountHtg, row.rewardExpectedHtg);
    const netHtg = safeSignedInt(row.netHtg, wonHtg - stakeHtg);

    summary.totalWageredHtg += stakeHtg;
    summary.totalWonHtg += wonHtg;
    summary.totalNetHtg += netHtg;

    const gameKey = String(row.gameKey || "unknown").trim() || "unknown";
    const bucket = byGameMap.get(gameKey) || {
      gameKey,
      gameLabel: String(row.gameLabel || gameKey).trim() || "Jeu",
      matches: 0,
      wageredHtg: 0,
      wonHtg: 0,
      netHtg: 0,
      lastPlayedAtMs: 0,
    };
    bucket.matches += 1;
    bucket.wageredHtg += stakeHtg;
    bucket.wonHtg += wonHtg;
    bucket.netHtg += netHtg;
    bucket.lastPlayedAtMs = Math.max(bucket.lastPlayedAtMs, safeSignedInt(row.endedAtMs));
    byGameMap.set(gameKey, bucket);
  });

  return {
    summary,
    byGame: Array.from(byGameMap.values()).sort((left, right) =>
      safeSignedInt(right.lastPlayedAtMs) - safeSignedInt(left.lastPlayedAtMs)
      || String(left.gameLabel || "").localeCompare(String(right.gameLabel || ""), "fr")
    ),
  };
}

function renderSearchResults(results = []) {
  const list = Array.isArray(results) ? results : [];
  if (!dom.results || !dom.resultsEmpty) return;

  if (!list.length) {
    dom.results.innerHTML = "";
    dom.resultsEmpty.textContent = getSearchQuery()
      ? "Aucun client trouve pour cette recherche."
      : "Entre un UID, un email, un telephone ou un username.";
    dom.resultsEmpty.classList.remove("hidden");
    return;
  }

  dom.resultsEmpty.classList.add("hidden");
  dom.results.innerHTML = list.map((client) => {
    const uid = String(client.uid || client.id || "").trim();
    const displayName = client.displayName || client.name || client.username || client.email || uid || "Client";
    const badgeTone = client.accountFrozen ? "bad" : client.hasApprovedDeposit ? "good" : "warn";
    const badgeText = client.accountFrozen ? "Compte gele" : client.hasApprovedDeposit ? "Compte actif" : "A verifier";
    const approvedHtg = pickNumeric(client.approvedHtgAvailable, client.htgApprovedAvailable, client.approvedHtg);
    const pendingHtg = pickNumeric(client.provisionalHtgAvailable, client.htgProvisionalAvailable);
    const withdrawableHtg = pickNumeric(client.withdrawableHtg, client.withdrawableHtgAvailable);

    return `
      <article class="result-card">
        <div class="result-head">
          <div>
            <h3 class="result-title">${escapeHtml(displayName)}</h3>
            <p class="result-copy">${escapeHtml([client.email, client.phone, client.username ? `@${client.username}` : ""].filter(Boolean).join(" · ") || `UID ${uid}`)}</p>
          </div>
          <span class="badge" data-tone="${badgeTone}">${escapeHtml(badgeText)}</span>
        </div>
        <div class="mini-grid">
          <div><span>HTG approuves</span><strong>${escapeHtml(formatHtg(approvedHtg))}</strong></div>
          <div><span>HTG en attente</span><strong>${escapeHtml(formatHtg(pendingHtg))}</strong></div>
          <div><span>HTG retirables</span><strong>${escapeHtml(formatHtg(withdrawableHtg))}</strong></div>
        </div>
        <div class="result-actions" style="margin-top:14px;">
          <button type="button" class="primary-button" data-select-client="${escapeHtml(uid)}">Ouvrir</button>
        </div>
      </article>
    `;
  }).join("");

  dom.results.querySelectorAll("[data-select-client]").forEach((button) => {
    button.addEventListener("click", () => {
      const clientId = String(button.getAttribute("data-select-client") || "").trim();
      const target = list.find((item) => String(item.uid || item.id || "").trim() === clientId) || null;
      if (target) void loadClientDashboard(target);
    });
  });
}

function renderOrders(orders = []) {
  const list = Array.isArray(orders) ? orders : [];
  if (!dom.orders || !dom.ordersEmpty || !dom.ordersPagination) return;

  if (!list.length) {
    dom.orders.innerHTML = "";
    dom.ordersEmpty.textContent = "Aucune commande recente a afficher.";
    dom.ordersEmpty.classList.remove("hidden");
    dom.ordersPagination.classList.add("hidden");
    return;
  }

  dom.ordersEmpty.classList.add("hidden");
  dom.orders.innerHTML = list.map((order) => {
    const status = String(order.status || order.resolutionStatus || "").trim().toLowerCase();
    const tone = getToneForStatus(status);
    const amountHtg = pickNumeric(order.amountHtg, order.approvedAmountHtg, order.amount);
    const approvedAmountHtg = pickNumeric(order.approvedAmountHtg);
    const pendingHtg = pickNumeric(order.provisionalHtgRemaining);
    const methodLabel = order.methodName || order.destinationType || order.methodId || "Methode";
    const reference = order.uniqueCode || order.reference || order.proofRef || order.id || "-";
    return `
      <article class="order-row">
        <div class="order-head">
          <div>
            <p class="order-title">${escapeHtml(methodLabel)}</p>
            <p class="order-meta">${escapeHtml(formatDateTime(order.createdAtMs))}</p>
          </div>
          <span class="badge" data-tone="${tone}">${escapeHtml((status || "unknown").toUpperCase())}</span>
        </div>
        <div class="order-grid">
          <div><span>Montant demande</span><strong>${escapeHtml(formatHtg(amountHtg))}</strong></div>
          <div><span>Montant approuve</span><strong>${escapeHtml(formatHtg(approvedAmountHtg))}</strong></div>
          <div><span>HTG pending restant</span><strong>${escapeHtml(formatHtg(pendingHtg))}</strong></div>
          <div><span>Reference</span><strong>${escapeHtml(reference)}</strong></div>
        </div>
      </article>
    `;
  }).join("");

  dom.ordersPagination.classList.toggle("hidden", !state.ordersHasMore);
}

function renderHistoryMeta() {
  if (!dom.historyMeta) return;
  const filters = getHistoryFilters();
  const filterParts = [];
  if (filters.game !== "all") filterParts.push(filters.game);
  if (filters.result !== "all") filterParts.push(filters.result === "win" ? "gagnes" : "perdus");
  if (filters.opponent !== "all") filterParts.push(filters.opponent === "bot" ? "vs bot" : "vs humain");
  if (filters.startMs > 0 || filters.endMs > 0) filterParts.push("periode filtree");
  const suffix = filterParts.length ? ` · ${filterParts.join(" · ")}` : "";
  dom.historyMeta.textContent = `${state.historyRows.length} partie(s) affichee(s) sur ${state.historyTotal}${suffix}`;
}

function renderHistorySummary() {
  const summary = state.historySummaryHtg || { totalMatches: 0, totalWageredHtg: 0, totalWonHtg: 0, totalNetHtg: 0 };
  if (dom.totalMatches) dom.totalMatches.textContent = String(summary.totalMatches);
  if (dom.totalWagered) dom.totalWagered.textContent = formatHtg(summary.totalWageredHtg);
  if (dom.totalWon) dom.totalWon.textContent = formatHtg(summary.totalWonHtg);
  if (dom.totalNet) dom.totalNet.textContent = formatSignedHtg(summary.totalNetHtg);

  if (!dom.gameBreakdown) return;
  const list = Array.isArray(state.historyByGameHtg) ? state.historyByGameHtg : [];
  if (!list.length) {
    dom.gameBreakdown.innerHTML = "";
    return;
  }

  dom.gameBreakdown.innerHTML = list.map((item) => `
    <article class="order-row">
      <div class="order-head">
        <div>
          <p class="order-title">${escapeHtml(item.gameLabel || "Jeu")}</p>
          <p class="order-meta">${escapeHtml(`${item.matches} partie(s)`)}</p>
        </div>
        <span class="badge" data-tone="${item.netHtg > 0 ? "good" : item.netHtg < 0 ? "bad" : "neutral"}">${escapeHtml(formatSignedHtg(item.netHtg))}</span>
      </div>
      <div class="order-grid">
        <div><span>Mise</span><strong>${escapeHtml(formatHtg(item.wageredHtg))}</strong></div>
        <div><span>Gain</span><strong>${escapeHtml(formatHtg(item.wonHtg))}</strong></div>
        <div><span>Derniere partie</span><strong>${escapeHtml(formatShortDate(item.lastPlayedAtMs))}</strong></div>
      </div>
    </article>
  `).join("");
}

function renderHistory(rows = []) {
  const list = Array.isArray(rows) ? rows : [];
  if (!dom.history || !dom.historyEmpty || !dom.pagination) return;

  state.historyRows = list;
  const computed = summarizeLoadedHistory(list);
  state.historySummaryHtg = computed.summary;
  state.historyByGameHtg = computed.byGame;
  renderHistoryMeta();
  renderHistorySummary();

  if (!list.length) {
    dom.history.innerHTML = "";
    dom.historyEmpty.textContent = "Aucune partie pour ce filtre.";
    dom.historyEmpty.classList.remove("hidden");
    dom.pagination.classList.add("hidden");
    return;
  }

  dom.historyEmpty.classList.add("hidden");
  dom.history.innerHTML = list.map((row) => {
    const won = row.won === true;
    const lost = row.lost === true;
    const stakeHtg = pickNumeric(row.stakeHtg, row.wageredHtg);
    const wonHtg = pickNumeric(row.wonHtg, row.rewardAmountHtg, row.rewardExpectedHtg);
    const netHtg = safeSignedInt(row.netHtg, wonHtg - stakeHtg);
    const tone = won ? "good" : lost ? "bad" : "warn";
    return `
      <article class="history-row">
        <div class="history-head">
          <div>
            <p class="history-title">${escapeHtml(row.gameLabel || "Jeu")}</p>
            <p class="history-meta">${escapeHtml(formatShortDate(row.endedAtMs))}</p>
          </div>
          <span class="badge" data-tone="${tone}">${escapeHtml(won ? "GAGNE" : lost ? "PERDU" : "CLOTURE")}</span>
        </div>
        <div class="history-grid">
          <div><span>Mise</span><strong>${escapeHtml(formatHtg(stakeHtg))}</strong></div>
          <div><span>Gain</span><strong>${escapeHtml(formatHtg(wonHtg))}</strong></div>
          <div><span>Net</span><strong>${escapeHtml(formatSignedHtg(netHtg))}</strong></div>
          <div><span>Adversaire</span><strong>${escapeHtml(row.opponentLabel || (row.opponentType === "bot" ? "Bot" : "Humain"))}</strong></div>
        </div>
        <p class="history-meta" style="margin-top:12px;">
          ${escapeHtml(row.scoreLabel ? `Score ${row.scoreLabel}` : row.roomMode || row.gameKey || "-")}
        </p>
      </article>
    `;
  }).join("");

  dom.pagination.classList.toggle("hidden", !state.historyHasMore);
}

function renderFraudAnalysis(analysis = null) {
  state.fraudAnalysis = analysis || null;
  const score = safeInt(analysis?.score);
  const level = String(analysis?.level || "low").toUpperCase();
  const suspicious = analysis?.isSuspicious === true;
  const statusText = suspicious ? "Signal a revoir" : "Aucun signal fort";
  const statusTone = suspicious ? getFraudTone(analysis?.level) : "good";
  const windowLabel = analysis?.windowLabel || analysis?.timeWindowLabel || analysis?.window || "Aucune alerte";

  if (dom.fraudScore) dom.fraudScore.textContent = `${score}/100`;
  if (dom.fraudLevel) dom.fraudLevel.textContent = level;
  if (dom.fraudFlag) dom.fraudFlag.textContent = statusText;
  if (dom.fraudWindow) dom.fraudWindow.textContent = String(windowLabel || "Aucune alerte");
  if (dom.fraudStatus) {
    dom.fraudStatus.textContent = String(analysis?.summary || analysis?.status || (suspicious ? "Analyse a revoir." : "Aucune alerte majeure."));
    dom.fraudStatus.dataset.tone = statusTone;
  }

  const findings = Array.isArray(analysis?.findings) ? analysis.findings : [];
  if (dom.fraudFindings && dom.fraudFindingsEmpty) {
    if (!findings.length) {
      dom.fraudFindings.innerHTML = "";
      dom.fraudFindingsEmpty.textContent = analysis ? "Aucune anomalie detectee pour ce filtre." : "Aucune anomalie detectee pour le moment.";
      dom.fraudFindingsEmpty.classList.remove("hidden");
    } else {
      dom.fraudFindingsEmpty.classList.add("hidden");
      dom.fraudFindings.innerHTML = findings.map((finding) => `
        <article class="history-row">
          <div class="history-head">
            <div>
              <p class="history-title">${escapeHtml(finding.title || "Anomalie")}</p>
              <p class="history-meta">${escapeHtml(formatShortDate(finding.occurredAtMs || finding.atMs || 0))}</p>
            </div>
            <span class="badge" data-tone="${getFraudTone(finding.severity)}">${escapeHtml(String(finding.severity || "medium").toUpperCase())}</span>
          </div>
          <p class="history-meta">${escapeHtml(finding.detail || "Aucun detail supplementaire.")}</p>
          <p class="history-meta"><strong>Action:</strong> ${escapeHtml(finding.recommendedAction || "review")}</p>
        </article>
      `).join("");
    }
  }

  const timeline = Array.isArray(analysis?.timeline) ? analysis.timeline : [];
  if (dom.fraudTimeline && dom.fraudTimelineEmpty) {
    if (!timeline.length) {
      dom.fraudTimeline.innerHTML = "";
      dom.fraudTimelineEmpty.textContent = analysis ? "Aucune chronologie disponible pour ce filtre." : "La chronologie apparaitra apres analyse.";
      dom.fraudTimelineEmpty.classList.remove("hidden");
    } else {
      dom.fraudTimelineEmpty.classList.add("hidden");
      dom.fraudTimeline.innerHTML = timeline.map((item) => `
        <article class="history-row">
          <div class="history-head">
            <div>
              <p class="history-title">${escapeHtml(item.title || "Evenement")}</p>
              <p class="history-meta">${escapeHtml(formatShortDate(item.atMs || item.occurredAtMs || 0))}</p>
            </div>
            <span class="badge" data-tone="${getFraudTone(item.severity)}">${escapeHtml(item.kind || "event")}</span>
          </div>
          <p class="history-meta">${escapeHtml(item.detail || "")}</p>
        </article>
      `).join("");
    }
  }
}

function renderAccountSummary() {
  const client = state.clientContext?.client || state.selectedClient || {};
  const funding = state.clientContext?.fundingSnapshot || {};
  const displayName = client.displayName || client.name || client.username || client.email || getSelectedClientId() || "Client";
  const approvedHtg = pickNumeric(client.approvedHtgAvailable, client.htgApprovedAvailable, funding.approvedHtgAvailable);
  const pendingHtg = pickNumeric(client.provisionalHtgAvailable, client.htgProvisionalAvailable, funding.provisionalHtgAvailable);
  const playableHtg = pickNumeric(client.playableHtg, funding.playableHtg, client.approvedHtgAvailable, 0) + Math.max(0, pickNumeric(client.provisionalHtgAvailable, client.htgProvisionalAvailable) > 0 ? 0 : 0);
  const withdrawableHtg = pickNumeric(client.withdrawableHtg, client.withdrawableHtgAvailable, funding.withdrawableHtg);
  const pendingOrdersCount = state.pendingOrders.length;

  if (dom.selectedChip) dom.selectedChip.textContent = `${displayName} · ${getSelectedClientId()}`;
  if (dom.contextCopy) {
    const flags = [];
    if (client.accountFrozen === true) flags.push("compte gele");
    if (client.withdrawalHold === true) flags.push("retrait bloque");
    if (!flags.length) flags.push("compte actif");
    dom.contextCopy.textContent = `${displayName} · ${flags.join(" · ")} · ${pendingOrdersCount} commande(s) en examen.`;
  }
  if (dom.approvedHtg) dom.approvedHtg.textContent = formatHtg(approvedHtg);
  if (dom.pendingHtg) dom.pendingHtg.textContent = formatHtg(pendingHtg);
  if (dom.playableHtg) dom.playableHtg.textContent = formatHtg(pickNumeric(client.playableHtg, funding.playableHtg, approvedHtg + pendingHtg));
  if (dom.withdrawableHtg) dom.withdrawableHtg.textContent = formatHtg(withdrawableHtg);
  if (dom.pendingBadge) {
    dom.pendingBadge.textContent = `${pendingOrdersCount} en examen`;
    dom.pendingBadge.dataset.tone = pendingOrdersCount > 0 || pendingHtg > 0 ? "warn" : "good";
  }
  if (dom.approveAllBtn) dom.approveAllBtn.disabled = state.busy || state.approvingAll || (pendingOrdersCount <= 0 && pendingHtg <= 0);
}

async function doSearch() {
  const query = getSearchQuery();
  if (!query) {
    setStatus("Entre une recherche.", "warn");
    renderSearchResults([]);
    return;
  }

  const seq = ++state.searchSeq;
  setBusy(true);
  setStatus("Recherche en cours...", "neutral");
  try {
    const response = await searchAgentDepositClientsSecure({ query });
    if (seq !== state.searchSeq) return;
    const rows = Array.isArray(response?.results) ? response.results : [];
    renderSearchResults(rows);
    setStatus(`${rows.length} client(s) trouve(s).`, rows.length ? "good" : "warn");
  } catch (error) {
    if (seq !== state.searchSeq) return;
    renderSearchResults([]);
    setStatus(error?.message || "Recherche impossible.", "bad");
  } finally {
    if (seq === state.searchSeq) setBusy(false);
  }
}

async function loadOrders({ reset = true } = {}) {
  const clientId = getSelectedClientId();
  if (!clientId) return;

  const response = await getClientOrdersSecure({
    clientId,
    offset: reset ? 0 : state.ordersNextOffset,
    pageSize: 8,
  });
  const rows = Array.isArray(response?.orders) ? response.orders : [];
  state.orderRows = reset ? rows : [...state.orderRows, ...rows];
  state.ordersTotal = safeInt(response?.total);
  state.ordersNextOffset = safeInt(response?.nextOffset);
  state.ordersHasMore = response?.hasMore === true;
  renderOrders(state.orderRows);
}

async function loadHistory({ reset = true } = {}) {
  const clientId = getSelectedClientId();
  if (!clientId) return;

  const filters = getHistoryFilters();
  const response = await getClientGameHistorySecure({
    clientId,
    game: filters.game,
    result: filters.result,
    opponent: filters.opponent,
    startMs: filters.startMs,
    endMs: filters.endMs,
    offset: reset ? 0 : state.historyNextOffset,
    pageSize: 12,
  });

  const rows = Array.isArray(response?.rows) ? response.rows : [];
  state.historyRows = reset ? rows : [...state.historyRows, ...rows];
  state.historyTotal = safeInt(response?.totalMatches);
  state.historyNextOffset = safeInt(response?.nextOffset);
  state.historyHasMore = response?.hasMore === true;
  renderHistory(state.historyRows);
}

async function loadFraudAnalysis() {
  const clientId = getSelectedClientId();
  if (!clientId) return;

  const filters = getHistoryFilters();
  const response = await getClientFraudAnalysisSecure({
    clientId,
    game: filters.game,
    result: filters.result,
    opponent: filters.opponent,
    startMs: filters.startMs,
    endMs: filters.endMs,
    findingsLimit: 12,
    timelineLimit: 20,
  });
  renderFraudAnalysis(response || null);
}

async function loadClientDashboard(client) {
  const clientId = String(client?.uid || client?.id || "").trim();
  if (!clientId) return;

  state.selectedClient = client;
  state.loadingClientId = clientId;
  state.clientContext = null;
  state.pendingOrders = [];
  state.orderRows = [];
  state.historyRows = [];
  state.historyTotal = 0;
  state.historyNextOffset = 0;
  state.historyHasMore = false;
  renderOrders([]);
  renderHistory([]);
  renderFraudAnalysis(null);
  dom.dashboard?.classList.remove("hidden");
  setBusy(true);
  setActionStatus("Chargement du compte client...", "neutral");

  try {
    const [contextResponse, pendingResponse] = await Promise.all([
      getAgentDepositClientContextSecure({ clientId, recentOrdersLimit: 1 }),
      getClientPendingDepositOrdersSecure({ clientId }),
    ]);

    if (state.loadingClientId !== clientId) return;

    state.clientContext = contextResponse || null;
    state.pendingOrders = Array.isArray(pendingResponse?.orders) ? pendingResponse.orders : [];
    renderAccountSummary();

    await loadOrders({ reset: true });
    await loadHistory({ reset: true });
    await loadFraudAnalysis();
    renderAccountSummary();
    setActionStatus("Compte charge.", "good");
  } catch (error) {
    if (state.loadingClientId !== clientId) return;
    setActionStatus(error?.message || "Impossible de charger le compte.", "bad");
  } finally {
    if (state.loadingClientId === clientId) setBusy(false);
  }
}

async function refreshSelectedClient() {
  if (!state.selectedClient) return;
  await loadClientDashboard(state.selectedClient);
}

async function approveAllPendingBalances() {
  const clientId = getSelectedClientId();
  if (!clientId) {
    setApproveAllStatus("Selectionne d'abord un client.", "warn");
    return;
  }

  const pendingHtg = pickNumeric(
    state.clientContext?.client?.provisionalHtgAvailable,
    state.clientContext?.fundingSnapshot?.provisionalHtgAvailable
  );
  if (!state.pendingOrders.length && pendingHtg <= 0) {
    setApproveAllStatus("Aucun solde pending a approuver.", "warn");
    return;
  }

  const confirmed = window.confirm(
    `Approuver les soldes en attente pour ce client ?\n\nCommandes en examen: ${state.pendingOrders.length}\nHTG en attente: ${formatHtg(pendingHtg)}`
  );
  if (!confirmed) return;

  state.approvingAll = true;
  setBusy(true);
  setApproveAllStatus("Approbation en cours...", "neutral");
  try {
    const response = await approveClientPendingBalancesSecure({ clientId });
    const approvedOrdersCount = safeInt(response?.approvedOrdersCount);
    setApproveAllStatus(`Approbation terminee: ${approvedOrdersCount} commande(s) approuvee(s).`, "good");
    await refreshSelectedClient();
  } catch (error) {
    setApproveAllStatus(error?.message || "Impossible d'approuver les soldes pending.", "bad");
  } finally {
    state.approvingAll = false;
    setBusy(false);
  }
}

async function repairResolvedOrders() {
  const clientId = getSelectedClientId();
  if (!clientId) {
    setActionStatus("Selectionne d'abord un client.", "warn");
    return;
  }

  const confirmed = window.confirm("Reparer les residus de commandes resolues pour ce client ?");
  if (!confirmed) return;

  setBusy(true);
  setActionStatus("Reparation en cours...", "neutral");
  try {
    const response = await repairResolvedDepositResiduesSecure({ clientId, limit: 100 });
    setActionStatus(`Reparation terminee: ${safeInt(response?.repairedCount)} commande(s) corrigee(s).`, "good");
    await refreshSelectedClient();
  } catch (error) {
    setActionStatus(error?.message || "Impossible de reparer les commandes resolues.", "bad");
  } finally {
    setBusy(false);
  }
}

function bindEvents() {
  dom.searchBtn?.addEventListener("click", () => {
    void doSearch();
  });
  dom.searchInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void doSearch();
    }
  });
  dom.refreshBtn?.addEventListener("click", () => {
    void refreshSelectedClient();
  });
  dom.approveAllBtn?.addEventListener("click", () => {
    void approveAllPendingBalances();
  });
  dom.ordersLoadMoreBtn?.addEventListener("click", () => {
    void loadOrders({ reset: false });
  });
  dom.historyRefreshBtn?.addEventListener("click", () => {
    void loadHistory({ reset: true });
  });
  dom.loadMoreBtn?.addEventListener("click", () => {
    void loadHistory({ reset: false });
  });
  dom.gameFilter?.addEventListener("change", () => {
    void loadHistory({ reset: true });
  });
  dom.resultFilter?.addEventListener("change", () => {
    void loadHistory({ reset: true });
  });
  dom.opponentFilter?.addEventListener("change", () => {
    void loadHistory({ reset: true });
  });
  dom.dateFrom?.addEventListener("change", () => {
    void loadHistory({ reset: true });
  });
  dom.dateTo?.addEventListener("change", () => {
    void loadHistory({ reset: true });
  });
  dom.fraudAnalyzeBtn?.addEventListener("click", () => {
    void loadFraudAnalysis();
  });
  dom.fraudRefreshBtn?.addEventListener("click", () => {
    void loadFraudAnalysis();
  });
  dom.repairResolvedBtn?.addEventListener("click", () => {
    void repairResolvedOrders();
  });
}

async function boot() {
  bindEvents();
  state.adminUser = await ensureFinanceDashboardSession({
    title: "Dashboard revue client",
    description: "Connecte-toi avec le compte administrateur autorise pour consulter les wallets, les commandes et l'historique joueur.",
    fallbackUrl: "./Dhero.html",
  });
  if (dom.adminEmail) {
    dom.adminEmail.textContent = `Admin connecte: ${state.adminUser?.email || "-"}`;
  }
}

await boot();

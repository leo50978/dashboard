import { ensureClientsAccess, formatDateTime, formatDoes, formatPrice, safeInt, safeSignedInt } from "./clients-data.js";
import {
  approveClientPendingBalancesSecure,
  getAgentDepositClientContextSecure,
  getClientFraudAnalysisSecure,
  getClientGameHistorySecure,
  getClientOrdersSecure,
  getClientPendingDepositOrdersSecure,
  repairResolvedDepositResiduesSecure,
  resolveDepositReviewSecure,
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
  approvedDoes: document.getElementById("clientReviewApprovedDoes"),
  pendingDoes: document.getElementById("clientReviewPendingDoes"),
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
  minWonDoes: document.getElementById("clientReviewMinWonDoes"),
  maxWonDoes: document.getElementById("clientReviewMaxWonDoes"),
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
  hasPendingBalance: false,
  orderRows: [],
  ordersTotal: 0,
  ordersNextOffset: 0,
  ordersHasMore: false,
  ordersSeq: 0,
  searchResults: [],
  historyRows: [],
  historySummary: null,
  historyByGame: [],
  historyTotal: 0,
  historyNextOffset: 0,
  historyHasMore: false,
  historySeq: 0,
  fraudSeq: 0,
  fraudAnalysis: null,
  busy: false,
  approvingAll: false,
};

function escapeHtml(value = "") {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
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

function logApproveAll(step, details = {}) {
  console.log("[CLIENT_REVIEW_APPROVE_ALL]", step, {
    selectedClient: state.selectedClient?.uid || state.selectedClient?.id || null,
    pendingOrders: state.pendingOrders.length,
    hasPendingBalance: state.hasPendingBalance,
    busy: state.busy,
    approvingAll: state.approvingAll,
    ...details,
  });
}

function setBusy(busy = false) {
  state.busy = busy === true;
  const disabled = state.busy;
  if (dom.searchBtn) dom.searchBtn.disabled = disabled;
  if (dom.searchInput) dom.searchInput.disabled = disabled;
  if (dom.refreshBtn) dom.refreshBtn.disabled = disabled;
  if (dom.approveAllBtn) dom.approveAllBtn.disabled = disabled || state.approvingAll || (!state.pendingOrders.length && !state.hasPendingBalance);
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
  if (dom.minWonDoes) dom.minWonDoes.disabled = disabled;
  if (dom.maxWonDoes) dom.maxWonDoes.disabled = disabled;
}

function formatShortDate(ms = 0) {
  const safeMs = safeSignedInt(ms);
  if (!safeMs) return "-";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(safeMs));
}

function formatSignedDoes(value = 0) {
  const amount = safeSignedInt(value);
  const label = formatDoes(Math.abs(amount));
  if (amount === 0) return label;
  return `${amount > 0 ? "+" : "-"}${label}`;
}

function getFraudLevelTone(level = "low") {
  const normalized = String(level || "").toLowerCase();
  if (normalized === "critical") return "bad";
  if (normalized === "high") return "bad";
  if (normalized === "medium") return "warn";
  return "good";
}

function formatFraudEvidence(evidence = {}) {
  const entries = Object.entries(evidence || {})
    .filter(([, value]) => value !== undefined && value !== null && value !== "");
  if (!entries.length) return "";
  return entries.slice(0, 5).map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`).join(" · ");
}

function formatFraudEvidenceBlocks(evidence = {}) {
  if (!evidence || typeof evidence !== "object") return "";
  const lines = [];
  const game = evidence.gameLabel || evidence.gameKey || "";
  const type = evidence.typeLabel || evidence.type || "";
  const rowId = evidence.rowId || evidence.currentId || "";
  if (game || type) lines.push(`Contexte: ${[game, type].filter(Boolean).join(" · ")}`);
  if (evidence.beforeDoes !== undefined || evidence.movementDoes !== undefined || evidence.expectedAfterDoes !== undefined || evidence.actualAfterDoes !== undefined) {
    const before = evidence.beforeDoes !== undefined ? formatDoes(evidence.beforeDoes) : "-";
    const movement = evidence.movementDoes !== undefined
      ? formatSignedDoes(evidence.movementDoes)
      : evidence.amountDoes !== undefined
        ? formatDoes(evidence.amountDoes)
        : "-";
    const expected = evidence.expectedAfterDoes !== undefined ? formatDoes(evidence.expectedAfterDoes) : "-";
    const actual = evidence.actualAfterDoes !== undefined ? formatDoes(evidence.actualAfterDoes) : "-";
    const deltaValue = evidence.deltaDoes !== undefined ? safeSignedInt(evidence.deltaDoes) : 0;
    const delta = evidence.deltaDoes !== undefined ? formatSignedDoes(deltaValue) : "";
    const deltaLabel = evidence.deltaDoes !== undefined
      ? deltaValue === 0
        ? " · mouvement correct"
        : ` · écart mouvement ${delta}`
      : "";
    lines.push(`Does: avant ${before} · mouvement ${movement} · attendu après ${expected} · réel après ${actual}${deltaLabel}`);
  }
  if (evidence.previousAfterDoes !== undefined || evidence.currentBeforeDoes !== undefined) {
    const previous = evidence.previousAfterDoes !== undefined ? formatDoes(evidence.previousAfterDoes) : "-";
    const current = evidence.currentBeforeDoes !== undefined ? formatDoes(evidence.currentBeforeDoes) : "-";
    const chainDelta = evidence.chainDeltaDoes !== undefined ? evidence.chainDeltaDoes : evidence.deltaDoes;
    const delta = chainDelta !== undefined ? formatSignedDoes(chainDelta) : "";
    lines.push(`Chaîne ledger: l'événement précédent finit à ${previous}, mais le suivant commence à ${current}${delta ? ` · trou ${delta}` : ""}.`);
  }
  if (evidence.expected !== undefined || evidence.actual !== undefined) {
    const delta = evidence.delta !== undefined ? ` · écart ${formatSignedDoes(evidence.delta)}` : "";
    lines.push(`Compte: attendu ${evidence.expected ?? "-"} · affiché ${evidence.actual ?? "-"}${delta}`);
  }
  if (evidence.amountHtg !== undefined || evidence.approvedAmountHtg !== undefined) {
    lines.push(`Commande: montant ${formatPrice(evidence.amountHtg || 0)} · approuvé ${formatPrice(evidence.approvedAmountHtg || 0)} · statut ${evidence.status || "-"}`);
  }
  if (rowId) lines.push(`Document: ${rowId}`);
  if (!lines.length) {
    const fallback = formatFraudEvidence(evidence);
    if (fallback) lines.push(fallback);
  }
  return lines.map((line) => `<p class="history-meta">${escapeHtml(line)}</p>`).join("");
}

function pickNumeric(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") {
      return safeInt(value);
    }
  }
  return 0;
}

function getSearchQuery() {
  return String(dom.searchInput?.value || "").trim();
}

function getHistoryFilters() {
  const minWonDoes = safeInt(dom.minWonDoes?.value);
  const maxWonDoes = safeInt(dom.maxWonDoes?.value);
  return {
    game: String(dom.gameFilter?.value || "all").trim().toLowerCase(),
    result: String(dom.resultFilter?.value || "all").trim().toLowerCase(),
    opponent: String(dom.opponentFilter?.value || "all").trim().toLowerCase(),
    startMs: dom.dateFrom?.value ? new Date(`${dom.dateFrom.value}T00:00:00`).getTime() : 0,
    endMs: dom.dateTo?.value ? new Date(`${dom.dateTo.value}T23:59:59.999`).getTime() : 0,
    minWonDoes: minWonDoes > 0 ? minWonDoes : 0,
    maxWonDoes: maxWonDoes > 0 ? maxWonDoes : 0,
  };
}

function renderSearchResults(results = []) {
  state.searchResults = Array.isArray(results) ? results : [];
  if (!dom.results) return;

  if (!state.searchResults.length) {
    dom.results.innerHTML = "";
    dom.resultsEmpty.textContent = getSearchQuery()
      ? "Aucun utilisateur trouvé pour cette recherche."
      : "Entre un UID, un email, un téléphone ou un username.";
    dom.resultsEmpty.classList.remove("hidden");
    return;
  }

  dom.resultsEmpty.classList.add("hidden");
  dom.results.innerHTML = state.searchResults.map((client) => {
    const badgeTone = client.accountFrozen ? "bad" : client.hasApprovedDeposit ? "good" : "warn";
    const badgeText = client.accountFrozen ? "Compte gelé" : client.hasApprovedDeposit ? "Compte actif" : "Sans dépôt approuvé";
    const displayName = client.displayName || client.name || client.username || client.email || client.uid || "Client";
    const approvedHtg = pickNumeric(client.approvedHtgAvailable, client.htgApprovedAvailable, client.approvedHtg);
    const pendingHtg = pickNumeric(client.provisionalHtgAvailable, client.htgProvisionalAvailable);
    const approvedDoes = pickNumeric(client.doesBalance, client.doesApprovedBalance, client.approvedDoesBalance);
    return `
      <article class="result-card">
        <div class="history-head">
          <div>
            <h3 class="result-title">${escapeHtml(displayName)}</h3>
            <p class="result-copy">${escapeHtml([client.email, client.phone, client.username ? `@${client.username}` : ""].filter(Boolean).join(" · ") || `UID ${client.uid || client.id || "-"}`)}</p>
          </div>
          <span class="badge" data-tone="${badgeTone}">${escapeHtml(badgeText)}</span>
        </div>

        <div class="history-grid">
          <div><span>HTG approuvés</span><strong>${escapeHtml(formatPrice(approvedHtg))}</strong></div>
          <div><span>HTG provisoires</span><strong>${escapeHtml(formatPrice(pendingHtg))}</strong></div>
          <div><span>Does dispo.</span><strong>${escapeHtml(formatDoes(approvedDoes))}</strong></div>
        </div>

        <div class="result-actions">
          <button type="button" class="primary-button" data-select-client="${escapeHtml(client.uid || client.id || "")}">Ouvrir</button>
        </div>
      </article>
    `;
  }).join("");
}

function renderOrders(orders = []) {
  if (!dom.orders || !dom.ordersEmpty) return;
  const list = Array.isArray(orders) ? orders : [];
  if (!list.length) {
    dom.orders.innerHTML = "";
    dom.ordersEmpty.textContent = "Aucune commande récente à afficher.";
    dom.ordersEmpty.classList.remove("hidden");
    if (dom.ordersPagination) dom.ordersPagination.classList.add("hidden");
    return;
  }

  dom.ordersEmpty.classList.add("hidden");
  dom.orders.innerHTML = list.map((order) => {
    const status = String(order.status || "").toLowerCase();
    const tone = status === "approved" ? "good" : status === "rejected" ? "bad" : "warn";
    return `
      <article class="order-row">
        <div class="order-head">
          <div>
            <p class="order-title">${escapeHtml(order.uniqueCode || order.id || "Commande")}</p>
            <p class="order-meta">${escapeHtml(formatShortDate(order.createdAtMs))}</p>
          </div>
          <span class="badge" data-tone="${tone}">${escapeHtml(status || "pending")}</span>
        </div>
        <div class="order-grid">
          <div><span>Montant</span><strong>${escapeHtml(formatPrice(order.amountHtg || order.amount || order.approvedAmountHtg || 0))}</strong></div>
          <div><span>Méthode</span><strong>${escapeHtml(order.methodName || order.methodId || "-")}</strong></div>
          <div><span>OCR</span><strong>${escapeHtml(order.extractedText || "-")}</strong></div>
        </div>
      </article>
    `;
  }).join("");

  if (dom.ordersPagination) dom.ordersPagination.classList.toggle("hidden", !state.ordersHasMore);
  if (dom.ordersLoadMoreBtn) {
    dom.ordersLoadMoreBtn.disabled = state.busy || !state.ordersHasMore;
    dom.ordersLoadMoreBtn.textContent = state.busy ? "Chargement..." : `Voir plus de commandes (${list.length}/${state.ordersTotal || list.length})`;
  }
}

function renderHistoryMeta() {
  if (!dom.historyMeta) return;
  const filters = getHistoryFilters();
  const summary = state.historySummary || {};
  const filterParts = [];
  if (filters.game !== "all") filterParts.push(filters.game);
  if (filters.result !== "all") filterParts.push(filters.result === "win" ? "gagnés" : "perdus");
  if (filters.opponent !== "all") filterParts.push(filters.opponent === "bot" ? "contre bot" : "contre humain");
  if (filters.startMs || filters.endMs) filterParts.push("période personnalisée");
  if (filters.minWonDoes > 0 || filters.maxWonDoes > 0) filterParts.push("gain filtré");
  const suffix = filterParts.length ? ` · ${filterParts.join(" · ")}` : "";
  const winCopy = safeInt(summary.wins);
  const lossCopy = safeInt(summary.losses);
  dom.historyMeta.textContent = `${state.historyRows.length} partie(s) affichée(s) sur ${state.historyTotal} · ${winCopy} gagnées · ${lossCopy} perdues${suffix}`;
}

function renderHistorySummary() {
  const summary = state.historySummary || {};
  if (dom.totalMatches) dom.totalMatches.textContent = String(safeInt(summary.totalMatches));
  if (dom.totalWagered) dom.totalWagered.textContent = formatDoes(safeInt(summary.totalWageredDoes));
  if (dom.totalWon) dom.totalWon.textContent = formatDoes(safeInt(summary.totalWonDoes));
  if (dom.totalNet) dom.totalNet.textContent = formatSignedDoes(summary.totalNetDoes);

  if (!dom.gameBreakdown) return;
  const list = Array.isArray(state.historyByGame) ? state.historyByGame : [];
  if (!list.length) {
    dom.gameBreakdown.innerHTML = "";
    return;
  }

  dom.gameBreakdown.innerHTML = list.map((item) => `
    <article class="game-card">
      <h4>${escapeHtml(item.gameLabel || item.gameKey || "Jeu")}</h4>
      <p>${escapeHtml(`${safeInt(item.matches)} partie(s) · ${safeInt(item.wins)} gagnées · ${safeInt(item.losses)} perdues`)}</p>
      <div class="mini-grid">
        <div>
          <span>Misé</span>
          <strong>${escapeHtml(formatDoes(safeInt(item.wageredDoes)))}</strong>
        </div>
        <div>
          <span>Gagné</span>
          <strong>${escapeHtml(formatDoes(safeInt(item.wonDoes)))}</strong>
        </div>
        <div>
          <span>Net</span>
          <strong>${escapeHtml(formatSignedDoes(item.netDoes))}</strong>
        </div>
        <div>
          <span>Adversaire</span>
          <strong>${escapeHtml(`${safeInt(item.vsHumanMatches)} H · ${safeInt(item.vsBotMatches)} B`)}</strong>
        </div>
      </div>
    </article>
  `).join("");
}

function renderHistory(rows = []) {
  if (!dom.history || !dom.historyEmpty) return;
  const list = Array.isArray(rows) ? rows : [];
  state.historyRows = list;
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
    const tone = row.won ? "good" : row.lost ? "bad" : "warn";
    const scoreCopy = row.scoreLabel ? `Score ${row.scoreLabel}` : row.roomMode || "-";
    const netTone = row.netDoes > 0 ? "good" : row.netDoes < 0 ? "bad" : "warn";
    return `
      <article class="history-row">
        <div class="history-head">
          <div>
            <p class="history-title">${escapeHtml(row.gameLabel || "Jeu")}</p>
            <p class="history-meta">${escapeHtml(formatShortDate(row.endedAtMs))}</p>
          </div>
          <span class="badge" data-tone="${tone}">${escapeHtml(row.resultLabel || "Terminé")}</span>
        </div>
        <div class="history-grid">
          <div><span>Mise</span><strong>${escapeHtml(formatDoes(row.wageredDoes || 0))}</strong></div>
          <div><span>Gain brut</span><strong>${escapeHtml(formatDoes(row.wonDoes || 0))}</strong></div>
          <div><span>Net</span><strong class="badge" data-tone="${netTone}" style="padding:8px 10px;">${escapeHtml(formatSignedDoes(row.netDoes || 0))}</strong></div>
          <div><span>Adversaire</span><strong>${escapeHtml(row.opponentLabel || "-")}</strong></div>
          <div><span>Score / salle</span><strong>${escapeHtml(scoreCopy)}</strong></div>
          <div><span>ID</span><strong>${escapeHtml(row.matchId || row.roomId || row.id || "-")}</strong></div>
        </div>
        <p class="history-meta">
          ${escapeHtml(row.roomMode || row.sourceKey || "-")}
          ${row.winnerUid ? ` · gagnant ${escapeHtml(row.winnerUid)}` : ""}
        </p>
      </article>
    `;
  }).join("");

  dom.pagination.classList.toggle("hidden", !state.historyHasMore);
  if (dom.loadMoreBtn) {
    dom.loadMoreBtn.disabled = state.busy || !state.historyHasMore;
    dom.loadMoreBtn.textContent = state.busy ? "Chargement..." : "Voir plus";
  }
}

function renderFraudAnalysis(analysis = null) {
  state.fraudAnalysis = analysis || null;
  const findings = Array.isArray(analysis?.findings) ? analysis.findings : [];
  const timeline = Array.isArray(analysis?.timeline) ? analysis.timeline : [];
  const findingsTotal = safeInt(analysis?.findingsTotal || findings.length);
  const score = safeInt(analysis?.riskScore);
  const level = String(analysis?.riskLevel || "low").toLowerCase();
  const suspicious = analysis?.isSuspicious === true;
  const scoreTone = level === "critical" || level === "high" ? "bad" : level === "medium" ? "warn" : "good";

  if (dom.fraudScore) dom.fraudScore.textContent = `${score}/100`;
  if (dom.fraudLevel) dom.fraudLevel.textContent = level.toUpperCase();
  if (dom.fraudLevel) dom.fraudLevel.dataset.tone = scoreTone;
  if (dom.fraudFlag) {
    dom.fraudFlag.textContent = suspicious ? "Compte suspect" : "Aucun signal fort";
    dom.fraudFlag.dataset.tone = suspicious ? "bad" : "good";
  }
  if (dom.fraudWindow) {
    const first = analysis?.firstAnomalyAtMs ? formatShortDate(analysis.firstAnomalyAtMs) : "Aucune alerte";
    const last = analysis?.lastAnomalyAtMs ? formatShortDate(analysis.lastAnomalyAtMs) : "Aucune alerte";
    dom.fraudWindow.textContent = `${first} · ${last}`;
  }
  if (dom.fraudStatus) {
    if (!analysis) {
      dom.fraudStatus.textContent = "Lance une analyse pour comparer le wallet, les ordres et l'historique.";
      dom.fraudStatus.dataset.tone = "neutral";
    } else {
      const visibleCopy = findingsTotal > findings.length ? `${findings.length}/${findingsTotal}` : String(findings.length);
      dom.fraudStatus.textContent = `${visibleCopy} anomalie(s) affichée(s) · action recommandée: ${analysis.recommendedAction || "monitor"}`;
      dom.fraudStatus.dataset.tone = suspicious ? "bad" : findings.length ? "warn" : "good";
    }
  }

  if (dom.fraudFindings) {
    if (!findings.length) {
      dom.fraudFindings.innerHTML = "";
      dom.fraudFindingsEmpty.textContent = analysis
        ? "Aucune anomalie détectée pour ce filtre."
        : "Aucune analyse chargée pour le moment.";
      dom.fraudFindingsEmpty.classList.remove("hidden");
    } else {
      dom.fraudFindingsEmpty.classList.add("hidden");
      dom.fraudFindings.innerHTML = findings.map((finding) => {
        const tone = getFraudLevelTone(finding.severity);
        const evidence = formatFraudEvidenceBlocks(finding.evidence);
        return `
          <article class="history-row">
            <div class="history-head">
              <div>
                <p class="history-title">${escapeHtml(finding.title || "Anomalie")}</p>
                <p class="history-meta">${escapeHtml(formatShortDate(finding.occurredAtMs || 0))}</p>
              </div>
              <span class="badge" data-tone="${tone}">${escapeHtml((finding.severity || "medium").toUpperCase())}</span>
            </div>
            <p class="history-meta">${escapeHtml(finding.detail || "")}</p>
            ${evidence ? `<div class="fraud-evidence">${evidence}</div>` : ""}
            <p class="history-meta"><strong>Action:</strong> ${escapeHtml(finding.recommendedAction || "review")}</p>
          </article>
        `;
      }).join("");
    }
  }

  if (dom.fraudTimeline) {
    if (!timeline.length) {
      dom.fraudTimeline.innerHTML = "";
      dom.fraudTimelineEmpty.textContent = analysis
        ? "Aucune chronologie disponible pour ce filtre."
        : "La chronologie apparaîtra après analyse.";
      dom.fraudTimelineEmpty.classList.remove("hidden");
    } else {
      dom.fraudTimelineEmpty.classList.add("hidden");
      dom.fraudTimeline.innerHTML = timeline.map((item) => {
        const tone = item.severity === "good" ? "good" : item.severity === "bad" ? "bad" : item.severity === "warn" ? "warn" : "neutral";
        const evidence = formatFraudEvidenceBlocks(item.evidence);
        return `
          <article class="history-row">
            <div class="history-head">
              <div>
                <p class="history-title">${escapeHtml(item.title || "Événement")}</p>
                <p class="history-meta">${escapeHtml(formatShortDate(item.atMs || 0))}</p>
              </div>
              <span class="badge" data-tone="${tone}">${escapeHtml(item.kind || "event")}</span>
            </div>
            <p class="history-meta">${escapeHtml(item.detail || "")}</p>
            ${evidence ? `<div class="fraud-evidence">${evidence}</div>` : ""}
          </article>
        `;
      }).join("");
    }
  }
}

function renderClientContext(context = null) {
  state.clientContext = context;
  const client = context?.client || state.selectedClient || null;
  const funding = context?.fundingSnapshot || {};
  if (!client) return;

  if (dom.selectedChip) {
    dom.selectedChip.textContent = `${client.displayName || client.name || client.username || client.email || client.uid || "Client"} · UID ${client.uid || client.id || "-"}`;
  }
  if (dom.contextCopy) {
    dom.contextCopy.textContent = `UID ${client.uid || client.id || "-"} · ${client.email || client.phone || client.username || "Aucune coordonnée"}`;
  }
  if (dom.approvedHtg) dom.approvedHtg.textContent = formatPrice(
    pickNumeric(client.approvedHtgAvailable, client.htgApprovedAvailable, client.approvedHtg, funding.approvedHtgAvailable)
  );
  if (dom.pendingHtg) dom.pendingHtg.textContent = formatPrice(
    pickNumeric(client.provisionalHtgAvailable, client.htgProvisionalAvailable, funding.provisionalHtgAvailable)
  );
  const pendingHtgValue = pickNumeric(client.provisionalHtgAvailable, client.htgProvisionalAvailable, funding.provisionalHtgAvailable);
  const pendingDoesValue = pickNumeric(client.doesProvisionalBalance, client.provisionalDoesBalance, funding.doesProvisionalBalance);
  if (dom.approvedDoes) dom.approvedDoes.textContent = formatDoes(
    pickNumeric(client.doesApprovedBalance, client.approvedDoesBalance, funding.approvedDoesBalance)
  );
  if (dom.pendingDoes) dom.pendingDoes.textContent = formatDoes(pendingDoesValue);
  state.hasPendingBalance = safeInt(pendingHtgValue) > 0 || safeInt(pendingDoesValue) > 0;
  if (dom.pendingBadge) dom.pendingBadge.textContent = `${state.pendingOrders.length} en examen`;
  if (dom.approveAllBtn) dom.approveAllBtn.disabled = state.busy || (!state.pendingOrders.length && !state.hasPendingBalance);
}

async function loadOrders({ reset = true } = {}) {
  const clientId = String(state.selectedClient?.uid || state.selectedClient?.id || "").trim();
  if (!clientId) return;

  const seq = ++state.ordersSeq;
  if (reset) {
    state.orderRows = [];
    state.ordersTotal = 0;
    state.ordersNextOffset = 0;
    state.ordersHasMore = true;
    renderOrders([]);
  }

  setBusy(true);
  setActionStatus("Chargement des commandes...", "neutral");

  try {
    const response = await getClientOrdersSecure({
      clientId,
      offset: reset ? 0 : state.ordersNextOffset,
      pageSize: 8,
    });
    if (seq !== state.ordersSeq) return;
    const rows = Array.isArray(response?.orders) ? response.orders : [];
    state.ordersTotal = safeInt(response?.total);
    state.ordersNextOffset = safeInt(response?.nextOffset);
    state.ordersHasMore = response?.hasMore === true;
    state.orderRows = reset ? rows : [...state.orderRows, ...rows];
    renderOrders(state.orderRows);
    setActionStatus(rows.length ? "Commandes chargées." : "Aucune commande à afficher.", rows.length ? "good" : "warn");
  } catch (error) {
    if (seq !== state.ordersSeq) return;
    renderOrders(state.orderRows);
    setActionStatus(error?.message || "Impossible de charger les commandes.", "bad");
  } finally {
    if (seq === state.ordersSeq) setBusy(false);
  }
}

async function loadFraudAnalysis({ reset = true } = {}) {
  const clientId = String(state.selectedClient?.uid || state.selectedClient?.id || "").trim();
  if (!clientId) return;

  const filters = getHistoryFilters();
  const seq = ++state.fraudSeq;
  if (reset) {
    renderFraudAnalysis(null);
  }

  setBusy(true);
  setActionStatus("Analyse antifraude en cours...", "neutral");
  if (dom.fraudStatus) dom.fraudStatus.textContent = "Analyse du wallet, des ordres et du ledger...";

  try {
    const response = await getClientFraudAnalysisSecure({
      clientId,
      game: filters.game,
      opponent: filters.opponent,
      result: filters.result,
      startMs: filters.startMs,
      endMs: filters.endMs,
      minWonDoes: filters.minWonDoes,
      maxWonDoes: filters.maxWonDoes,
      findingsLimit: 12,
      timelineLimit: 20,
    });
    if (seq !== state.fraudSeq) return;
    renderFraudAnalysis(response || null);
    setActionStatus(
      response?.isSuspicious
        ? `Analyse terminée: ${response.riskLevel || "low"} · ${response.riskScore || 0}/100`
        : `Analyse terminée: ${response?.riskScore || 0}/100`,
      response?.isSuspicious ? "warn" : "good"
    );
  } catch (error) {
    if (seq !== state.fraudSeq) return;
    renderFraudAnalysis(null);
    if (dom.fraudStatus) dom.fraudStatus.textContent = error?.message || "Impossible de charger l'analyse antifraude.";
    setActionStatus(error?.message || "Impossible de charger l'analyse antifraude.", "bad");
  } finally {
    if (seq === state.fraudSeq) setBusy(false);
  }
}

async function searchClients() {
  const query = getSearchQuery();
  state.searchSeq += 1;
  const seq = state.searchSeq;
  if (!query) {
    setStatus("Entre un UID, un email, un téléphone ou un username.", "warn");
    renderSearchResults([]);
    return;
  }

  setBusy(true);
  setStatus("Recherche utilisateur en cours...");

  try {
    const response = await searchAgentDepositClientsSecure({ query });
    if (seq !== state.searchSeq) return;
    const results = Array.isArray(response?.results) ? response.results : [];
    renderSearchResults(results);
    setStatus(results.length ? `${results.length} utilisateur(s) trouvé(s).` : "Aucun utilisateur trouvé.", results.length ? "good" : "warn");
  } catch (error) {
    if (seq !== state.searchSeq) return;
    renderSearchResults([]);
    setStatus(error?.message || "Impossible de rechercher le client.", "bad");
  } finally {
    if (seq === state.searchSeq) setBusy(false);
  }
}

async function loadGameHistory({ reset = true } = {}) {
  const clientId = String(state.selectedClient?.uid || state.selectedClient?.id || "").trim();
  if (!clientId) return;

  const filters = getHistoryFilters();
  const seq = ++state.historySeq;

  if (reset) {
    state.historyRows = [];
    state.historyTotal = 0;
    state.historyNextOffset = 0;
    state.historyHasMore = true;
    state.historySummary = null;
    state.historyByGame = [];
    renderHistory([]);
  }

  setBusy(true);
  setActionStatus("Chargement de l'historique de jeu...", "neutral");

  try {
    const response = await getClientGameHistorySecure({
      clientId,
      game: filters.game,
      opponent: filters.opponent,
      result: filters.result,
      startMs: filters.startMs,
      endMs: filters.endMs,
      minWonDoes: filters.minWonDoes,
      maxWonDoes: filters.maxWonDoes,
      offset: reset ? 0 : state.historyNextOffset,
      pageSize: 12,
    });
    if (seq !== state.historySeq) return;
    const rows = Array.isArray(response?.rows) ? response.rows : [];
    state.historyTotal = Number(response?.totalMatches || 0);
    state.historyNextOffset = Number(response?.nextOffset || 0);
    state.historyHasMore = response?.hasMore === true;
    state.historySummary = response?.summary || null;
    state.historyByGame = Array.isArray(response?.byGame) ? response.byGame : [];
    state.historyRows = reset ? rows : [...state.historyRows, ...rows];
    renderHistory(state.historyRows);

    setActionStatus(rows.length ? "Historique chargé." : "Aucune partie pour ce filtre.", rows.length ? "good" : "warn");
  } catch (error) {
    if (seq !== state.historySeq) return;
    renderHistory([]);
    setActionStatus(error?.message || "Impossible de charger l'historique de jeu.", "bad");
  } finally {
    if (seq === state.historySeq) setBusy(false);
  }
}

async function loadClientWorkspace(client) {
  const clientId = String(client?.uid || client?.id || "").trim();
  if (!clientId) return;

  state.loadingClientId = clientId;
  state.selectedClient = client;
  state.fraudAnalysis = null;
  state.orderRows = [];
  state.ordersTotal = 0;
  state.ordersNextOffset = 0;
  state.ordersHasMore = false;
  renderFraudAnalysis(null);
  renderOrders([]);
  setBusy(true);
  setActionStatus("Chargement du compte...", "neutral");

  try {
    const [context, pendingOrders] = await Promise.all([
      getAgentDepositClientContextSecure({ clientId, recentOrdersLimit: 1 }),
      getClientPendingDepositOrdersSecure({ clientId }),
    ]);

    if (state.loadingClientId !== clientId) return;

    state.clientContext = context || null;
    state.pendingOrders = Array.isArray(pendingOrders?.orders) ? pendingOrders.orders : [];
    if (dom.pendingBadge) dom.pendingBadge.textContent = `${state.pendingOrders.length} en examen`;
    renderClientContext(context);
    if (dom.dashboard) dom.dashboard.classList.remove("hidden");
    await loadOrders({ reset: true });
    await loadGameHistory({ reset: true });
    await loadFraudAnalysis({ reset: true });
  } catch (error) {
    setActionStatus(error?.message || "Impossible de charger le compte.", "bad");
  } finally {
    if (state.loadingClientId === clientId) {
      setBusy(false);
      if (dom.approveAllBtn) dom.approveAllBtn.disabled = state.busy || state.approvingAll || (!state.pendingOrders.length && !state.hasPendingBalance);
    }
  }
}

async function refreshSelectedClient() {
  if (!state.selectedClient) return;
  await loadClientWorkspace(state.selectedClient);
}

async function approveAllPendingOrders() {
  const clientId = String(state.selectedClient?.uid || state.selectedClient?.id || "").trim();
  logApproveAll("click", { clientId });
  setApproveAllStatus("Clic recu, verification des soldes...", "neutral");
  setActionStatus("Clic sur Approuver tout recu. Verification des soldes en attente...", "neutral");
  if (!clientId) {
    logApproveAll("blocked_no_client");
    setApproveAllStatus("Aucun joueur selectionne.", "bad");
    setActionStatus("Aucun joueur selectionne.", "bad");
    return;
  }

  const context = state.clientContext || {};
  const funding = context.fundingSnapshot || {};
  const client = context.client || state.selectedClient || {};
  const pendingDoesValue = pickNumeric(client.doesProvisionalBalance, client.provisionalDoesBalance, funding.doesProvisionalBalance);
  const pendingHtgValue = pickNumeric(client.provisionalHtgAvailable, client.htgProvisionalAvailable, funding.provisionalHtgAvailable);

  let pendingOrders = state.pendingOrders;
  try {
    logApproveAll("fetch_pending_orders_start", {
      pendingDoesValue: safeInt(pendingDoesValue),
      pendingHtgValue: safeInt(pendingHtgValue),
    });
    const pendingResponse = await getClientPendingDepositOrdersSecure({ clientId });
    pendingOrders = Array.isArray(pendingResponse?.orders) ? pendingResponse.orders : [];
    state.pendingOrders = pendingOrders;
    if (dom.pendingBadge) dom.pendingBadge.textContent = `${state.pendingOrders.length} en examen`;
    logApproveAll("fetch_pending_orders_success", {
      fetchedPendingOrders: pendingOrders.length,
      pendingResponse,
    });
  } catch (error) {
    logApproveAll("fetch_pending_orders_failed", {
      message: error?.message || String(error),
      code: error?.code || null,
      error,
    });
    setApproveAllStatus("Impossible de relire les commandes en attente.", "bad");
    setActionStatus(error?.message || "Impossible de relire les commandes en attente.", "bad");
    return;
  }

  if (!pendingOrders.length && safeInt(pendingDoesValue) <= 0 && safeInt(pendingHtgValue) <= 0) {
    logApproveAll("blocked_no_pending_balance", {
      pendingDoesValue: safeInt(pendingDoesValue),
      pendingHtgValue: safeInt(pendingHtgValue),
    });
    setApproveAllStatus("Aucun solde en attente trouve.", "warn");
    setActionStatus("Aucun solde en attente à approuver.", "warn");
    return;
  }

  logApproveAll("confirm_prompt", {
    pendingOrders: pendingOrders.length,
    pendingDoesValue: safeInt(pendingDoesValue),
    pendingHtgValue: safeInt(pendingHtgValue),
  });
  const confirmed = window.confirm(
    `Approuver les soldes en attente pour ce joueur ?\n\nCommandes en examen: ${pendingOrders.length}\nDoes en attente: ${formatDoes(pendingDoesValue)}\nHTG en attente: ${formatPrice(pendingHtgValue)}`
  );
  if (!confirmed) {
    logApproveAll("cancelled_by_user");
    setApproveAllStatus("Approbation annulee.", "warn");
    setActionStatus("Approbation annulée.", "warn");
    return;
  }

  state.approvingAll = true;
  setBusy(true);
  if (dom.approveAllBtn) dom.approveAllBtn.textContent = "Approbation...";
  setApproveAllStatus("Appel serveur en cours...", "neutral");
  setActionStatus("Approbation globale en cours...", "neutral");

  try {
    const payload = { clientId };
    logApproveAll("call_start", { payload });
    const response = await approveClientPendingBalancesSecure(payload);
    logApproveAll("call_success", { response });
    const repairResponse = await repairResolvedDepositResiduesSecure({ clientId, limit: 200 }).catch((repairError) => {
      logApproveAll("repair_failed_non_blocking", {
        message: repairError?.message || String(repairError),
        code: repairError?.code || null,
        error: repairError,
      });
      return null;
    });
    logApproveAll("repair_done", { repairResponse });
    const successMessage = `Approbation terminee: ${safeInt(response?.approvedDoesMoved)} Does deplaces vers approuves · ${safeInt(response?.approvedOrdersCount)} commande(s) approuvee(s).`;
    setApproveAllStatus(successMessage, "good");
    setActionStatus(successMessage, "good");
    logApproveAll("reload_workspace_start");
    await loadClientWorkspace(state.selectedClient);
    logApproveAll("reload_workspace_done");
  } catch (error) {
    logApproveAll("call_failed", {
      message: error?.message || String(error),
      code: error?.code || null,
      details: error?.details || null,
      error,
    });
    setApproveAllStatus(error?.message || "Approbation echouee.", "bad");
    setActionStatus(error?.message || "Impossible d'approuver les soldes en attente.", "bad");
  } finally {
    state.approvingAll = false;
    if (dom.approveAllBtn) dom.approveAllBtn.textContent = "Approuver tout";
    setBusy(false);
    logApproveAll("finished");
  }
}

async function repairResolvedDepositResidues() {
  const clientId = String(state.selectedClient?.uid || state.selectedClient?.id || "").trim();
  if (!clientId) return;

  const confirmed = window.confirm(
    "Réparer les commandes déjà approuvées/refusées qui gardent encore des montants en attente ? Le solde du joueur ne sera pas recrédité, seuls les champs résiduels de commande seront nettoyés."
  );
  if (!confirmed) return;

  setBusy(true);
  setActionStatus("Réparation des commandes résolues...", "neutral");

  try {
    const response = await repairResolvedDepositResiduesSecure({ clientId, limit: 200 });
    const repairedCount = safeInt(response?.repairedCount);
    setActionStatus(
      repairedCount
        ? `${repairedCount} commande(s) résolue(s) réparée(s).`
        : "Aucune commande résolue à réparer.",
      repairedCount ? "good" : "warn"
    );
    await loadOrders({ reset: true });
    await loadFraudAnalysis({ reset: true });
  } catch (error) {
    setActionStatus(error?.message || "Impossible de réparer les commandes résolues.", "bad");
  } finally {
    setBusy(false);
  }
}

function attachEvents() {
  dom.searchBtn?.addEventListener("click", () => {
    void searchClients();
  });
  dom.searchInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void searchClients();
    }
  });
  dom.results?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-select-client]");
    if (!button) return;
    const clientId = String(button.dataset.selectClient || "").trim();
    const match = state.searchResults.find((item) => String(item.uid || item.id || "") === clientId);
    if (!match) return;
    void loadClientWorkspace(match);
  });
  dom.approveAllBtn?.addEventListener("click", () => {
    void approveAllPendingOrders();
  });
  dom.refreshBtn?.addEventListener("click", () => {
    void refreshSelectedClient();
  });
  dom.ordersLoadMoreBtn?.addEventListener("click", () => {
    void loadOrders({ reset: false });
  });
  dom.fraudAnalyzeBtn?.addEventListener("click", () => {
    void loadFraudAnalysis({ reset: true });
  });
  dom.fraudRefreshBtn?.addEventListener("click", () => {
    void loadFraudAnalysis({ reset: true });
  });
  dom.repairResolvedBtn?.addEventListener("click", () => {
    void repairResolvedDepositResidues();
  });
  dom.historyRefreshBtn?.addEventListener("click", () => {
    void loadGameHistory({ reset: true });
  });
  dom.loadMoreBtn?.addEventListener("click", () => {
    void loadGameHistory({ reset: false });
  });
  dom.gameFilter?.addEventListener("change", () => {
    void loadGameHistory({ reset: true });
  });
  dom.resultFilter?.addEventListener("change", () => {
    void loadGameHistory({ reset: true });
  });
  dom.opponentFilter?.addEventListener("change", () => {
    void loadGameHistory({ reset: true });
  });
  dom.dateFrom?.addEventListener("change", () => {
    void loadGameHistory({ reset: true });
  });
  dom.dateTo?.addEventListener("change", () => {
    void loadGameHistory({ reset: true });
  });
  dom.minWonDoes?.addEventListener("change", () => {
    void loadGameHistory({ reset: true });
  });
  dom.maxWonDoes?.addEventListener("change", () => {
    void loadGameHistory({ reset: true });
  });
}

async function init() {
  try {
    const adminUser = await ensureClientsAccess("Revue joueur");
    state.adminUser = adminUser;
    if (dom.adminEmail) {
      dom.adminEmail.textContent = adminUser?.email || adminUser?.uid || "Admin connecté";
    }
    attachEvents();
    setStatus("Recherche un joueur pour ouvrir son espace de revue.", "neutral");
  } catch (error) {
    setStatus(error?.message || "Accès admin requis.", "bad");
  }
}

void init();

import { ensureFinanceDashboardSession } from "./dashboard-admin-auth.js";
import { getDuelAnalyticsSnapshotSecure } from "./secure-functions.js";

const chartState = {
  trend: null,
  outcomes: null,
  modes: null,
  stakes: null,
};

const dom = {
  status: document.getElementById("duelStatus"),
  refreshBtn: document.getElementById("duelRefreshBtn"),
  windowSelect: document.getElementById("duelWindow"),
  dateFrom: document.getElementById("duelDateFrom"),
  dateTo: document.getElementById("duelDateTo"),
  coverage: document.getElementById("duelCoverage"),
  generatedAt: document.getElementById("duelGeneratedAt"),
  totalMatches: document.getElementById("duelTotalMatches"),
  withBots: document.getElementById("duelWithBots"),
  botWins: document.getElementById("duelBotWins"),
  humanWins: document.getElementById("duelHumanWins"),
  totalMatchesNote: document.getElementById("duelTotalMatchesNote"),
  withBotsNote: document.getElementById("duelWithBotsNote"),
  botWinsNote: document.getElementById("duelBotWinsNote"),
  humanWinsNote: document.getElementById("duelHumanWinsNote"),
  avgDuration: document.getElementById("duelAvgDuration"),
  avgStake: document.getElementById("duelAvgStake"),
  publicMatches: document.getElementById("duelPublicMatches"),
  friendMatches: document.getElementById("duelFriendMatches"),
  stakeMix: document.getElementById("duelStakeMix"),
  recentResults: document.getElementById("duelRecentResults"),
};

function safeInt(value) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.max(0, Math.trunc(num)) : 0;
}

function safeFloat(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function formatInt(value) {
  return new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: 0,
  }).format(safeFloat(value));
}

function formatDoes(value) {
  return `${formatInt(value)} Does`;
}

function formatPercent(ratio) {
  return `${(safeFloat(ratio) * 100).toFixed(1)}%`;
}

function formatDateTime(ms) {
  const safeMs = safeInt(ms);
  if (!safeMs) return "-";
  return new Date(safeMs).toLocaleString("fr-FR");
}

function formatDateInput(ms) {
  const safeMs = safeInt(ms);
  if (!safeMs) return "";
  const date = new Date(safeMs);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateInput(rawValue, endOfDay = false) {
  const raw = String(rawValue || "").trim();
  if (!raw) return 0;
  const parts = raw.split("-").map((item) => Number(item));
  if (parts.length !== 3 || parts.some((item) => !Number.isFinite(item))) return 0;
  const [year, month, day] = parts;
  return endOfDay
    ? new Date(year, month - 1, day, 23, 59, 59, 999).getTime()
    : new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
}

function formatDuration(ms) {
  const safeMs = safeInt(ms);
  if (!safeMs) return "-";
  const totalMinutes = safeMs / 60000;
  if (totalMinutes < 60) {
    return `${totalMinutes.toFixed(totalMinutes < 10 ? 1 : 0)} min`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.round(totalMinutes % 60);
  return `${hours} h ${String(minutes).padStart(2, "0")} min`;
}

function setStatus(text, tone = "neutral") {
  if (!dom.status) return;
  dom.status.textContent = String(text || "");
  dom.status.dataset.tone = tone;
}

function destroyChart(name) {
  if (chartState[name]) {
    chartState[name].destroy();
    chartState[name] = null;
  }
}

function syncDatesForWindow(windowKey) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let start = new Date(todayStart);
  if (windowKey === "7d") {
    start.setDate(start.getDate() - 6);
  } else if (windowKey === "30d") {
    start.setDate(start.getDate() - 29);
  }
  if (windowKey === "global") {
    dom.dateFrom.value = "";
    dom.dateTo.value = "";
    return;
  }
  if (windowKey === "custom") return;
  dom.dateFrom.value = formatDateInput(start.getTime());
  dom.dateTo.value = formatDateInput(now.getTime());
}

function buildPayload() {
  const windowKey = String(dom.windowSelect?.value || "30d").trim().toLowerCase();
  if (windowKey === "custom") {
    return {
      window: "custom",
      startMs: parseDateInput(dom.dateFrom?.value || "", false),
      endMs: parseDateInput(dom.dateTo?.value || "", true),
    };
  }
  return { window: windowKey };
}

function renderSummary(snapshot = {}) {
  const summary = snapshot.summary || {};
  const range = snapshot.range || {};
  if (dom.totalMatches) dom.totalMatches.textContent = formatInt(summary.matchesPlayed);
  if (dom.withBots) dom.withBots.textContent = formatInt(summary.matchesWithBot);
  if (dom.botWins) dom.botWins.textContent = formatInt(summary.botWins);
  if (dom.humanWins) dom.humanWins.textContent = formatInt(summary.humanWins);

  if (dom.totalMatchesNote) dom.totalMatchesNote.textContent = `${formatInt(summary.matchesWithoutBot)} sans bot sur la période`;
  if (dom.withBotsNote) dom.withBotsNote.textContent = `${formatPercent(summary.botMatchRatePct)} des duels contiennent un bot`;
  if (dom.botWinsNote) dom.botWinsNote.textContent = `${formatPercent(summary.botWinRatePct)} des duels finissent sur une victoire bot`;
  if (dom.humanWinsNote) dom.humanWinsNote.textContent = `${formatPercent(summary.humanWinRatePct)} des duels finissent sur une victoire humain`;

  if (dom.avgDuration) dom.avgDuration.textContent = formatDuration(summary.avgDurationMs);
  if (dom.avgStake) dom.avgStake.textContent = formatDoes(summary.avgStakeDoes);
  if (dom.publicMatches) dom.publicMatches.textContent = formatInt(summary.publicMatches);
  if (dom.friendMatches) dom.friendMatches.textContent = formatInt(summary.friendMatches);

  if (dom.stakeMix) {
    const stakeMix = Array.isArray(snapshot.stakeMix) ? snapshot.stakeMix : [];
    dom.stakeMix.textContent = stakeMix.length > 0
      ? stakeMix.map((item) => `${formatInt(item.count)} en ${item.label}`).join(" • ")
      : "Aucune mise duel dans la période.";
  }

  if (dom.coverage) {
    const startText = range?.isGlobal ? "Début historique" : formatDateTime(range.startMs);
    const endText = formatDateTime(range.endMs);
    dom.coverage.textContent = `Couverture: ${startText} -> ${endText}`;
  }
  if (dom.generatedAt) {
    dom.generatedAt.textContent = `Dernier snapshot: ${formatDateTime(snapshot.generatedAtMs)}`;
  }
}

function renderRecentResults(snapshot = {}) {
  if (!dom.recentResults) return;
  const recentResults = Array.isArray(snapshot.recentResults) ? snapshot.recentResults : [];
  if (recentResults.length <= 0) {
    dom.recentResults.innerHTML = `<div class="empty-state">Aucun duel terminé sur cette période.</div>`;
    return;
  }
  dom.recentResults.innerHTML = recentResults
    .map((item) => {
      const winnerLabel = item.winnerType === "bot" ? "Victoire bot" : item.winnerType === "human" ? "Victoire humain" : "Résultat inconnu";
      const modeLabel = item.roomMode === "friends" ? "Entre amis" : "Public";
      const botLabel = item.withBot ? `${formatInt(item.botCount)} bot` : "Sans bot";
      return `
        <div class="result-row">
          <div>
            <div class="result-title">${winnerLabel}</div>
            <div class="result-meta">${modeLabel} • ${botLabel} • ${formatDoes(item.stakeDoes)} • ${formatDateTime(item.endedAtMs)}</div>
          </div>
          <div class="result-value">${formatDuration(item.durationMs)}</div>
        </div>
      `;
    })
    .join("");
}

function renderCharts(snapshot = {}) {
  const ChartLib = window.Chart;
  if (!ChartLib) return;

  destroyChart("trend");
  destroyChart("outcomes");
  destroyChart("modes");
  destroyChart("stakes");

  const trend = Array.isArray(snapshot.trend) ? snapshot.trend : [];
  const modeMix = Array.isArray(snapshot.modeMix) ? snapshot.modeMix : [];
  const stakeMix = Array.isArray(snapshot.stakeMix) ? snapshot.stakeMix : [];
  const summary = snapshot.summary || {};

  const trendCtx = document.getElementById("duelMatchesTrendChart");
  const outcomeCtx = document.getElementById("duelOutcomeChart");
  const modeCtx = document.getElementById("duelModeChart");
  const stakeCtx = document.getElementById("duelStakeChart");

  if (trendCtx) {
    chartState.trend = new ChartLib(trendCtx, {
      type: "line",
      data: {
        labels: trend.map((item) => item.label),
        datasets: [
          {
            label: "Matchs joués",
            data: trend.map((item) => safeInt(item.matchesPlayed)),
            borderColor: "#68d7ff",
            backgroundColor: "rgba(104, 215, 255, 0.2)",
            fill: true,
            tension: 0.28,
            borderWidth: 2,
          },
          {
            label: "Matchs avec bot",
            data: trend.map((item) => safeInt(item.matchesWithBot)),
            borderColor: "#ff9c5f",
            backgroundColor: "rgba(255, 156, 95, 0.18)",
            fill: false,
            tension: 0.28,
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: { color: "#edf2ff" },
          },
        },
        scales: {
          x: {
            ticks: { color: "#95a4cb" },
            grid: { color: "rgba(163, 184, 255, 0.08)" },
          },
          y: {
            ticks: { color: "#95a4cb", precision: 0 },
            grid: { color: "rgba(163, 184, 255, 0.08)" },
          },
        },
      },
    });
  }

  if (outcomeCtx) {
    chartState.outcomes = new ChartLib(outcomeCtx, {
      type: "doughnut",
      data: {
        labels: ["Victoires humain", "Victoires bot"],
        datasets: [{
          data: [safeInt(summary.humanWins), safeInt(summary.botWins)],
          backgroundColor: ["#4be7b8", "#ff7d8d"],
          borderColor: ["rgba(75, 231, 184, 0.95)", "rgba(255, 125, 141, 0.95)"],
          borderWidth: 1,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "bottom",
            labels: { color: "#edf2ff" },
          },
        },
      },
    });
  }

  if (modeCtx) {
    chartState.modes = new ChartLib(modeCtx, {
      type: "doughnut",
      data: {
        labels: modeMix.map((item) => item.label),
        datasets: [{
          data: modeMix.map((item) => safeInt(item.count)),
          backgroundColor: ["#7c5cff", "#68d7ff"],
          borderWidth: 1,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "bottom",
            labels: { color: "#edf2ff" },
          },
        },
      },
    });
  }

  if (stakeCtx) {
    chartState.stakes = new ChartLib(stakeCtx, {
      type: "bar",
      data: {
        labels: stakeMix.map((item) => item.label),
        datasets: [{
          label: "Matchs",
          data: stakeMix.map((item) => safeInt(item.count)),
          backgroundColor: ["rgba(104, 215, 255, 0.72)", "rgba(124, 92, 255, 0.72)", "rgba(255, 156, 95, 0.72)"],
          borderRadius: 14,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
        },
        scales: {
          x: {
            ticks: { color: "#95a4cb" },
            grid: { display: false },
          },
          y: {
            ticks: { color: "#95a4cb", precision: 0 },
            grid: { color: "rgba(163, 184, 255, 0.08)" },
          },
        },
      },
    });
  }
}

async function refreshDuelAnalytics() {
  try {
    setStatus("Chargement des analytics duel...", "neutral");
    await ensureFinanceDashboardSession({
      title: "Analytics Duel 2 joueurs",
      description: "Connecte-toi avec le compte administrateur autorisé pour consulter les performances du mode duel.",
    });
    const result = await getDuelAnalyticsSnapshotSecure(buildPayload());
    const snapshot = result?.snapshot || {};
    renderSummary(snapshot);
    renderRecentResults(snapshot);
    renderCharts(snapshot);
    setStatus("Analytics duel mises à jour.", "success");
  } catch (error) {
    console.error("[DUEL_DASHBOARD] refresh error", error);
    setStatus(error?.message || "Impossible de charger les analytics duel.", "error");
  }
}

function bindEvents() {
  dom.refreshBtn?.addEventListener("click", refreshDuelAnalytics);
  dom.windowSelect?.addEventListener("change", () => {
    syncDatesForWindow(dom.windowSelect.value);
    void refreshDuelAnalytics();
  });
  dom.dateFrom?.addEventListener("change", () => {
    if (dom.windowSelect) dom.windowSelect.value = "custom";
  });
  dom.dateTo?.addEventListener("change", () => {
    if (dom.windowSelect) dom.windowSelect.value = "custom";
  });
}

async function bootstrap() {
  syncDatesForWindow(String(dom.windowSelect?.value || "30d"));
  bindEvents();
  await refreshDuelAnalytics();
}

void bootstrap();

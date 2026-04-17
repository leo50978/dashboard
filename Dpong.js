import { ensureFinanceDashboardSession } from "./dashboard-admin-auth.js";
import { getPongAnalyticsSnapshotSecure } from "./secure-functions.js";

const chartState = {
  trend: null,
  outcomes: null,
  aiProfiles: null,
  stakes: null,
};

const dom = {
  status: document.getElementById("pongStatus"),
  refreshBtn: document.getElementById("pongRefreshBtn"),
  windowSelect: document.getElementById("pongWindow"),
  dateFrom: document.getElementById("pongDateFrom"),
  dateTo: document.getElementById("pongDateTo"),
  aiProfile: document.getElementById("pongAiProfile"),
  winnerType: document.getElementById("pongWinnerType"),
  stake: document.getElementById("pongStake"),
  coverage: document.getElementById("pongCoverage"),
  generatedAt: document.getElementById("pongGeneratedAt"),
  totalMatches: document.getElementById("pongTotalMatches"),
  botWins: document.getElementById("pongBotWins"),
  humanWins: document.getElementById("pongHumanWins"),
  rewardedMatches: document.getElementById("pongRewardedMatches"),
  totalMatchesNote: document.getElementById("pongTotalMatchesNote"),
  botWinsNote: document.getElementById("pongBotWinsNote"),
  humanWinsNote: document.getElementById("pongHumanWinsNote"),
  rewardedMatchesNote: document.getElementById("pongRewardedMatchesNote"),
  avgDuration: document.getElementById("pongAvgDuration"),
  avgStake: document.getElementById("pongAvgStake"),
  avgReward: document.getElementById("pongAvgReward"),
  aiProfileMix: document.getElementById("pongAiProfileMix"),
  recentResults: document.getElementById("pongRecentResults"),
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
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(safeFloat(value));
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
  const date = new Date(ms);
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
  if (totalMinutes < 60) return `${totalMinutes.toFixed(totalMinutes < 10 ? 1 : 0)} min`;
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
  if (!chartState[name]) return;
  chartState[name].destroy();
  chartState[name] = null;
}

function syncDatesForWindow(windowKey) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(todayStart);
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
  const payload = {
    aiProfile: String(dom.aiProfile?.value || "all"),
    winnerType: String(dom.winnerType?.value || "all"),
    stakeDoes: safeInt(dom.stake?.value || 0),
  };
  if (windowKey === "custom") {
    return {
      ...payload,
      window: "custom",
      startMs: parseDateInput(dom.dateFrom?.value || "", false),
      endMs: parseDateInput(dom.dateTo?.value || "", true),
    };
  }
  return { ...payload, window: windowKey };
}

function renderSummary(snapshot = {}) {
  const summary = snapshot.summary || {};
  const range = snapshot.range || {};

  if (dom.totalMatches) dom.totalMatches.textContent = formatInt(summary.matchesPlayed);
  if (dom.botWins) dom.botWins.textContent = formatInt(summary.botWins);
  if (dom.humanWins) dom.humanWins.textContent = formatInt(summary.humanWins);
  if (dom.rewardedMatches) dom.rewardedMatches.textContent = formatInt(summary.rewardedMatches);

  if (dom.totalMatchesNote) dom.totalMatchesNote.textContent = `${formatInt(summary.matchesPlayed)} matchs Pong termines`;
  if (dom.botWinsNote) dom.botWinsNote.textContent = `${formatPercent(summary.botWinRatePct)} victoires bot`;
  if (dom.humanWinsNote) dom.humanWinsNote.textContent = `${formatPercent(summary.humanWinRatePct)} victoires humain`;
  if (dom.rewardedMatchesNote) dom.rewardedMatchesNote.textContent = `${formatPercent(summary.rewardedMatchRatePct)} matchs avec gain paye`;

  if (dom.avgDuration) dom.avgDuration.textContent = formatDuration(summary.avgDurationMs);
  if (dom.avgStake) dom.avgStake.textContent = formatDoes(summary.avgStakeDoes);
  if (dom.avgReward) dom.avgReward.textContent = formatDoes(summary.avgRewardDoes);

  if (dom.aiProfileMix) {
    const rows = Array.isArray(snapshot.aiProfileMix) ? snapshot.aiProfileMix : [];
    dom.aiProfileMix.textContent = rows.length > 0
      ? rows.map((item) => `${String(item.label || "-")}: ${formatInt(item.count)}`).join(" • ")
      : "Aucun profil IA utilise sur la periode.";
  }

  if (dom.coverage) {
    const startText = range?.isGlobal ? "Debut historique" : formatDateTime(range.startMs);
    const endText = formatDateTime(range.endMs);
    dom.coverage.textContent = `Couverture: ${startText} -> ${endText}`;
  }
  if (dom.generatedAt) {
    dom.generatedAt.textContent = `Dernier snapshot: ${formatDateTime(snapshot.generatedAtMs)}`;
  }
}

function renderRecentResults(snapshot = {}) {
  if (!dom.recentResults) return;
  const rows = Array.isArray(snapshot.recentResults) ? snapshot.recentResults : [];
  if (rows.length <= 0) {
    dom.recentResults.innerHTML = `<div class="empty-state">Aucun match Pong termine sur cette periode.</div>`;
    return;
  }
  dom.recentResults.innerHTML = rows.map((item) => {
    const winnerLabel = item.winnerType === "human" ? "Victoire humain" : item.winnerType === "bot" ? "Victoire bot" : "Resultat inconnu";
    const rewardLabel = item.rewardGranted ? `Gain ${formatDoes(item.rewardAmountDoes)}` : "Sans gain";
    return `
      <div class="result-row">
        <div>
          <div class="result-title">${winnerLabel} • Score ${formatInt(item.leftScore)}-${formatInt(item.rightScore)}</div>
          <div class="result-meta">${String(item.aiProfile || "normal")} • ${formatDoes(item.stakeDoes)} • ${rewardLabel} • ${formatDateTime(item.endedAtMs)}</div>
        </div>
        <div class="result-value">${formatDuration(item.durationMs)}</div>
      </div>
    `;
  }).join("");
}

function renderCharts(snapshot = {}) {
  const ChartLib = window.Chart;
  if (!ChartLib) return;

  destroyChart("trend");
  destroyChart("outcomes");
  destroyChart("aiProfiles");
  destroyChart("stakes");

  const trend = Array.isArray(snapshot.trend) ? snapshot.trend : [];
  const aiProfileMix = Array.isArray(snapshot.aiProfileMix) ? snapshot.aiProfileMix : [];
  const stakeMix = Array.isArray(snapshot.stakeMix) ? snapshot.stakeMix : [];
  const summary = snapshot.summary || {};

  const trendCtx = document.getElementById("pongMatchesTrendChart");
  const outcomeCtx = document.getElementById("pongOutcomeChart");
  const aiProfileCtx = document.getElementById("pongAiProfileChart");
  const stakeCtx = document.getElementById("pongStakeChart");

  if (trendCtx) {
    chartState.trend = new ChartLib(trendCtx, {
      type: "line",
      data: {
        labels: trend.map((item) => item.label),
        datasets: [
          {
            label: "Matchs joues",
            data: trend.map((item) => safeInt(item.matchesPlayed)),
            borderColor: "#68d7ff",
            backgroundColor: "rgba(104, 215, 255, 0.18)",
            fill: true,
            tension: 0.28,
            borderWidth: 2,
          },
          {
            label: "Victoires humain",
            data: trend.map((item) => safeInt(item.humanWins)),
            borderColor: "#4be7b8",
            backgroundColor: "rgba(75, 231, 184, 0.14)",
            fill: false,
            tension: 0.28,
            borderWidth: 2,
          },
          {
            label: "Victoires bot",
            data: trend.map((item) => safeInt(item.botWins)),
            borderColor: "#ff7d8d",
            backgroundColor: "rgba(255, 125, 141, 0.14)",
            fill: false,
            tension: 0.28,
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: "#edf2ff" } } },
        scales: {
          x: { ticks: { color: "#95a4cb" }, grid: { color: "rgba(163, 184, 255, 0.08)" } },
          y: { ticks: { color: "#95a4cb", precision: 0 }, grid: { color: "rgba(163, 184, 255, 0.08)" } },
        },
      },
    });
  }

  if (outcomeCtx) {
    chartState.outcomes = new ChartLib(outcomeCtx, {
      type: "doughnut",
      data: {
        labels: ["Humain gagne", "Bot gagne"],
        datasets: [{
          data: [safeInt(summary.humanWins), safeInt(summary.botWins)],
          backgroundColor: ["#4be7b8", "#ff7d8d"],
          borderWidth: 1,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "bottom", labels: { color: "#edf2ff" } } },
      },
    });
  }

  if (aiProfileCtx) {
    chartState.aiProfiles = new ChartLib(aiProfileCtx, {
      type: "bar",
      data: {
        labels: aiProfileMix.map((item) => String(item.label || "-")),
        datasets: [{
          label: "Matchs",
          data: aiProfileMix.map((item) => safeInt(item.count)),
          backgroundColor: "rgba(124, 92, 255, 0.78)",
          borderRadius: 10,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: "#95a4cb" }, grid: { display: false } },
          y: { ticks: { color: "#95a4cb", precision: 0 }, grid: { color: "rgba(163, 184, 255, 0.08)" } },
        },
      },
    });
  }

  if (stakeCtx) {
    chartState.stakes = new ChartLib(stakeCtx, {
      type: "bar",
      data: {
        labels: stakeMix.map((item) => String(item.label || "-")),
        datasets: [{
          label: "Matchs",
          data: stakeMix.map((item) => safeInt(item.count)),
          backgroundColor: "rgba(255, 209, 102, 0.82)",
          borderRadius: 10,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: "#95a4cb" }, grid: { display: false } },
          y: { ticks: { color: "#95a4cb", precision: 0 }, grid: { color: "rgba(163, 184, 255, 0.08)" } },
        },
      },
    });
  }
}

async function refreshPong() {
  try {
    setStatus("Chargement des analytics Pong...", "neutral");
    await ensureFinanceDashboardSession({
      title: "Analytics Pong",
      description: "Connecte-toi avec le compte administrateur autorise pour consulter les analytics Pong.",
    });
    const response = await getPongAnalyticsSnapshotSecure(buildPayload());
    const snapshot = response?.snapshot || {};
    renderSummary(snapshot);
    renderRecentResults(snapshot);
    renderCharts(snapshot);
    setStatus("Analytics Pong a jour.", "success");
  } catch (error) {
    console.error("[PONG_DASHBOARD] refresh error", error);
    setStatus(error?.message || "Impossible de charger les analytics Pong.", "error");
  }
}

function bindEvents() {
  dom.refreshBtn?.addEventListener("click", () => {
    void refreshPong();
  });
  dom.windowSelect?.addEventListener("change", () => {
    const nextWindow = String(dom.windowSelect.value || "30d").trim().toLowerCase();
    syncDatesForWindow(nextWindow);
    void refreshPong();
  });
  dom.dateFrom?.addEventListener("change", () => {
    if (dom.windowSelect) dom.windowSelect.value = "custom";
  });
  dom.dateTo?.addEventListener("change", () => {
    if (dom.windowSelect) dom.windowSelect.value = "custom";
  });
  dom.aiProfile?.addEventListener("change", () => {
    void refreshPong();
  });
  dom.winnerType?.addEventListener("change", () => {
    void refreshPong();
  });
  dom.stake?.addEventListener("change", () => {
    void refreshPong();
  });
}

async function init() {
  syncDatesForWindow("30d");
  bindEvents();
  await refreshPong();
}

void init();

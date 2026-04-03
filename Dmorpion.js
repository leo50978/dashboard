import { ensureFinanceDashboardSession } from "./dashboard-admin-auth.js";
import { getMorpionAnalyticsSnapshotSecure } from "./secure-functions.js";

const chartState = {
  trend: null,
  outcomes: null,
  composition: null,
  stakes: null,
};

const dom = {
  status: document.getElementById("morpionStatus"),
  refreshBtn: document.getElementById("morpionRefreshBtn"),
  windowSelect: document.getElementById("morpionWindow"),
  dateFrom: document.getElementById("morpionDateFrom"),
  dateTo: document.getElementById("morpionDateTo"),
  composition: document.getElementById("morpionComposition"),
  winnerType: document.getElementById("morpionWinnerType"),
  stake: document.getElementById("morpionStake"),
  coverage: document.getElementById("morpionCoverage"),
  generatedAt: document.getElementById("morpionGeneratedAt"),
  totalMatches: document.getElementById("morpionTotalMatches"),
  humanOnlyMatches: document.getElementById("morpionHumanOnlyMatches"),
  withBots: document.getElementById("morpionWithBots"),
  botWins: document.getElementById("morpionBotWins"),
  humanWins: document.getElementById("morpionHumanWins"),
  totalMatchesNote: document.getElementById("morpionTotalMatchesNote"),
  humanOnlyMatchesNote: document.getElementById("morpionHumanOnlyMatchesNote"),
  withBotsNote: document.getElementById("morpionWithBotsNote"),
  botWinsNote: document.getElementById("morpionBotWinsNote"),
  humanWinsNote: document.getElementById("morpionHumanWinsNote"),
  avgDuration: document.getElementById("morpionAvgDuration"),
  avgStake: document.getElementById("morpionAvgStake"),
  humanOnlyShare: document.getElementById("morpionHumanOnlyShare"),
  withBotShare: document.getElementById("morpionWithBotShare"),
  stakeMix: document.getElementById("morpionStakeMix"),
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
    composition: String(dom.composition?.value || "all"),
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
  if (dom.humanOnlyMatches) dom.humanOnlyMatches.textContent = formatInt(summary.matchesHumanOnly);
  if (dom.withBots) dom.withBots.textContent = formatInt(summary.matchesWithBot);
  if (dom.botWins) dom.botWins.textContent = formatInt(summary.botMatchBotWins);
  if (dom.humanWins) dom.humanWins.textContent = formatInt(summary.botMatchHumanWins);

  if (dom.totalMatchesNote) dom.totalMatchesNote.textContent = `${formatInt(summary.matchesPlayed)} salles terminees dans la fenetre`;
  if (dom.humanOnlyMatchesNote) dom.humanOnlyMatchesNote.textContent = `${formatPercent(summary.humanOnlyRatePct)} du trafic Morpion`;
  if (dom.withBotsNote) dom.withBotsNote.textContent = `${formatPercent(summary.withBotRatePct)} des salles avec bot`;
  if (dom.botWinsNote) dom.botWinsNote.textContent = `${formatPercent(summary.botMatchBotWinRatePct)} des matchs humain + bot`;
  if (dom.humanWinsNote) dom.humanWinsNote.textContent = `${formatPercent(summary.botMatchHumanWinRatePct)} des matchs humain + bot`;

  if (dom.avgDuration) dom.avgDuration.textContent = formatDuration(summary.avgDurationMs);
  if (dom.avgStake) dom.avgStake.textContent = formatDoes(summary.avgStakeDoes);
  if (dom.humanOnlyShare) dom.humanOnlyShare.textContent = formatPercent(summary.humanOnlyRatePct);
  if (dom.withBotShare) dom.withBotShare.textContent = formatPercent(summary.withBotRatePct);

  if (dom.stakeMix) {
    const stakeMix = Array.isArray(snapshot.stakeMix) ? snapshot.stakeMix : [];
    dom.stakeMix.textContent = stakeMix.length > 0
      ? stakeMix.map((item) => `${formatInt(item.count)} en ${item.label}`).join(" • ")
      : "Aucune salle Morpion sur la période.";
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

function renderCharts(snapshot = {}) {
  const ChartLib = window.Chart;
  if (!ChartLib) return;

  destroyChart("trend");
  destroyChart("outcomes");
  destroyChart("composition");
  destroyChart("stakes");

  const trend = Array.isArray(snapshot.trend) ? snapshot.trend : [];
  const compositionMix = Array.isArray(snapshot.compositionMix) ? snapshot.compositionMix : [];
  const stakeMix = Array.isArray(snapshot.stakeMix) ? snapshot.stakeMix : [];
  const summary = snapshot.summary || {};

  const trendCtx = document.getElementById("morpionMatchesTrendChart");
  const outcomeCtx = document.getElementById("morpionOutcomeChart");
  const compositionCtx = document.getElementById("morpionCompositionChart");
  const stakeCtx = document.getElementById("morpionStakeChart");

  if (trendCtx) {
    chartState.trend = new ChartLib(trendCtx, {
      type: "line",
      data: {
        labels: trend.map((item) => item.label),
        datasets: [
          {
            label: "Salles jouees",
            data: trend.map((item) => safeInt(item.matchesPlayed)),
            borderColor: "#68d7ff",
            backgroundColor: "rgba(104, 215, 255, 0.18)",
            fill: true,
            tension: 0.28,
            borderWidth: 2,
          },
          {
            label: "1 humain + 1 bot",
            data: trend.map((item) => safeInt(item.matchesWithBot)),
            borderColor: "#ff9c5f",
            backgroundColor: "rgba(255, 156, 95, 0.15)",
            fill: false,
            tension: 0.28,
            borderWidth: 2,
          },
          {
            label: "2 humains",
            data: trend.map((item) => safeInt(item.matchesHumanOnly)),
            borderColor: "#4be7b8",
            backgroundColor: "rgba(75, 231, 184, 0.14)",
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
          legend: { labels: { color: "#edf2ff" } },
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
        labels: ["Humain gagne", "Bot gagne"],
        datasets: [{
          data: [safeInt(summary.botMatchHumanWins), safeInt(summary.botMatchBotWins)],
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

  if (compositionCtx) {
    chartState.composition = new ChartLib(compositionCtx, {
      type: "doughnut",
      data: {
        labels: compositionMix.map((item) => item.label),
        datasets: [{
          data: compositionMix.map((item) => safeInt(item.count)),
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
          label: "Salles",
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

async function refreshMorpionAnalytics() {
  try {
    setStatus("Chargement des analytics Morpion...", "neutral");
    await ensureFinanceDashboardSession({
      title: "Analytics Morpion 5",
      description: "Connecte-toi avec le compte administrateur autorisé pour consulter les performances du mode Morpion.",
    });
    const result = await getMorpionAnalyticsSnapshotSecure(buildPayload());
    const snapshot = result?.snapshot || {};
    renderSummary(snapshot);
    renderCharts(snapshot);
    setStatus("Analytics Morpion mises a jour.", "success");
  } catch (error) {
    console.error("[MORPION_DASHBOARD] refresh error", error);
    setStatus(error?.message || "Impossible de charger les analytics Morpion.", "error");
  }
}

function bindEvents() {
  dom.refreshBtn?.addEventListener("click", refreshMorpionAnalytics);
  dom.windowSelect?.addEventListener("change", () => {
    syncDatesForWindow(dom.windowSelect.value);
    void refreshMorpionAnalytics();
  });
  dom.dateFrom?.addEventListener("change", () => {
    if (dom.windowSelect) dom.windowSelect.value = "custom";
  });
  dom.dateTo?.addEventListener("change", () => {
    if (dom.windowSelect) dom.windowSelect.value = "custom";
  });
  dom.composition?.addEventListener("change", () => void refreshMorpionAnalytics());
  dom.winnerType?.addEventListener("change", () => void refreshMorpionAnalytics());
  dom.stake?.addEventListener("change", () => void refreshMorpionAnalytics());
}

async function bootstrap() {
  syncDatesForWindow(String(dom.windowSelect?.value || "30d"));
  bindEvents();
  await refreshMorpionAnalytics();
}

void bootstrap();

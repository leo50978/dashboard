import { ensureFinanceDashboardSession } from "./dashboard-admin-auth.js";
import { getMorpionAnalyticsSnapshotSecure } from "./secure-functions.js";

const chartState = {
  curve: null,
  mix: null,
};

const dom = {
  adminEmail: document.getElementById("morpionTrendAdminEmail"),
  status: document.getElementById("morpionTrendStatus"),
  refreshBtn: document.getElementById("morpionTrendRefreshBtn"),
  windowSelect: document.getElementById("morpionTrendWindow"),
  dateFrom: document.getElementById("morpionTrendDateFrom"),
  dateTo: document.getElementById("morpionTrendDateTo"),
  composition: document.getElementById("morpionTrendComposition"),
  winnerType: document.getElementById("morpionTrendWinnerType"),
  stake: document.getElementById("morpionTrendStake"),
  matchesPlayed: document.getElementById("morpionTrendMatchesPlayed"),
  matchesPlayedNote: document.getElementById("morpionTrendMatchesPlayedNote"),
  humanOnly: document.getElementById("morpionTrendHumanOnly"),
  humanOnlyNote: document.getElementById("morpionTrendHumanOnlyNote"),
  withBot: document.getElementById("morpionTrendWithBot"),
  withBotNote: document.getElementById("morpionTrendWithBotNote"),
  avgDuration: document.getElementById("morpionTrendAvgDuration"),
  avgDurationNote: document.getElementById("morpionTrendAvgDurationNote"),
  curveChart: document.getElementById("morpionTrendCurveChart"),
  mixChart: document.getElementById("morpionTrendMixChart"),
};

function safeInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function safeFloat(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatInt(value) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(safeFloat(value));
}

function formatPercent(ratio) {
  return `${(safeFloat(ratio) * 100).toFixed(1)}%`;
}

function formatDateTime(ms = 0) {
  const safeMs = safeInt(ms);
  if (!safeMs) return "-";
  return new Date(safeMs).toLocaleString("fr-FR");
}

function formatDateInput(ms) {
  const safeMs = safeInt(ms);
  if (!safeMs) return "";
  const d = new Date(safeMs);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDateInput(rawValue, endOfDay = false) {
  const raw = String(rawValue || "").trim();
  if (!raw) return 0;
  const parts = raw.split("-").map((v) => Number(v));
  if (parts.length !== 3 || parts.some((v) => !Number.isFinite(v))) return 0;
  const [y, m, d] = parts;
  return endOfDay
    ? new Date(y, m - 1, d, 23, 59, 59, 999).getTime()
    : new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}

function formatDuration(ms = 0) {
  const safeMs = safeInt(ms);
  if (!safeMs) return "-";
  const mins = safeMs / 60000;
  if (mins < 60) return `${mins.toFixed(mins < 10 ? 1 : 0)} min`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return `${h} h ${String(m).padStart(2, "0")} min`;
}

function setStatus(text, tone = "neutral") {
  dom.status.textContent = String(text || "");
  dom.status.dataset.tone = tone;
}

function destroyChart(key) {
  if (!chartState[key]) return;
  chartState[key].destroy();
  chartState[key] = null;
}

function syncDatesForWindow(windowKey) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (windowKey === "7d") start.setDate(start.getDate() - 6);
  if (windowKey === "30d") start.setDate(start.getDate() - 29);

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
  const windowKey = String(dom.windowSelect.value || "30d").trim().toLowerCase();
  const payload = {
    composition: String(dom.composition.value || "all"),
    winnerType: String(dom.winnerType.value || "all"),
    stakeDoes: safeInt(dom.stake.value || 0),
  };
  if (windowKey === "custom") {
    return {
      ...payload,
      window: "custom",
      startMs: parseDateInput(dom.dateFrom.value || "", false),
      endMs: parseDateInput(dom.dateTo.value || "", true),
    };
  }
  return { ...payload, window: windowKey };
}

function renderSummary(snapshot = {}) {
  const summary = snapshot.summary || {};
  const range = snapshot.range || {};
  dom.matchesPlayed.textContent = formatInt(summary.matchesPlayed);
  dom.humanOnly.textContent = formatInt(summary.matchesHumanOnly);
  dom.withBot.textContent = formatInt(summary.matchesWithBot);
  dom.avgDuration.textContent = formatDuration(summary.avgDurationMs);

  dom.matchesPlayedNote.textContent = `Couverture: ${range.isGlobal ? "historique" : formatDateTime(range.startMs)} → ${formatDateTime(range.endMs)}`;
  dom.humanOnlyNote.textContent = `${formatPercent(summary.humanOnlyRatePct)} du total`;
  dom.withBotNote.textContent = `${formatPercent(summary.withBotRatePct)} du total`;
  dom.avgDurationNote.textContent = `Mise moyenne: ${formatInt(summary.avgStakeDoes)} Does`;
}

function renderCharts(snapshot = {}) {
  const ChartLib = window.Chart;
  if (!ChartLib) return;

  const trend = Array.isArray(snapshot.trend) ? snapshot.trend : [];
  const summary = snapshot.summary || {};
  const labels = trend.map((item) => item.label || "-");
  const playedSeries = trend.map((item) => safeInt(item.matchesPlayed));
  const cumulative = [];
  let running = 0;
  for (const value of playedSeries) {
    running += safeInt(value);
    cumulative.push(running);
  }

  destroyChart("curve");
  destroyChart("mix");

  if (dom.curveChart) {
    chartState.curve = new ChartLib(dom.curveChart, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Matchs joués (période)",
            data: playedSeries,
            borderColor: "#64d2ff",
            backgroundColor: "rgba(100, 210, 255, 0.16)",
            borderWidth: 2,
            fill: true,
            tension: 0.24,
            yAxisID: "y",
          },
          {
            label: "Cumul matchs (courbe)",
            data: cumulative,
            borderColor: "#7c5cff",
            backgroundColor: "rgba(124, 92, 255, 0)",
            borderWidth: 2,
            fill: false,
            tension: 0.2,
            yAxisID: "y1",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: "#edf3ff" } },
        },
        scales: {
          x: {
            ticks: { color: "#9bb0d9" },
            grid: { color: "rgba(148, 163, 184, 0.08)" },
          },
          y: {
            position: "left",
            ticks: { color: "#9bb0d9", precision: 0 },
            grid: { color: "rgba(148, 163, 184, 0.08)" },
          },
          y1: {
            position: "right",
            ticks: { color: "#9bb0d9", precision: 0 },
            grid: { drawOnChartArea: false },
          },
        },
      },
    });
  }

  if (dom.mixChart) {
    chartState.mix = new ChartLib(dom.mixChart, {
      type: "doughnut",
      data: {
        labels: ["2 humains", "Humain + bot"],
        datasets: [{
          data: [safeInt(summary.matchesHumanOnly), safeInt(summary.matchesWithBot)],
          backgroundColor: ["#43d8ab", "#ff9f59"],
          borderColor: ["rgba(67, 216, 171, 0.9)", "rgba(255, 159, 89, 0.9)"],
          borderWidth: 1,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "bottom",
            labels: { color: "#edf3ff" },
          },
        },
      },
    });
  }
}

async function refresh() {
  try {
    setStatus("Chargement des tendances Morpion...", "neutral");
    const result = await getMorpionAnalyticsSnapshotSecure(buildPayload());
    const snapshot = result?.snapshot || {};
    renderSummary(snapshot);
    renderCharts(snapshot);
    setStatus("Tendances Morpion mises à jour.", "success");
  } catch (error) {
    console.error("[MORPION_TENDANCE] refresh error", error);
    setStatus(error?.message || "Erreur de chargement des tendances.", "error");
  }
}

function bindEvents() {
  dom.refreshBtn.addEventListener("click", () => void refresh());
  dom.windowSelect.addEventListener("change", () => {
    syncDatesForWindow(dom.windowSelect.value);
    void refresh();
  });
  dom.dateFrom.addEventListener("change", () => {
    dom.windowSelect.value = "custom";
  });
  dom.dateTo.addEventListener("change", () => {
    dom.windowSelect.value = "custom";
  });
  dom.composition.addEventListener("change", () => void refresh());
  dom.winnerType.addEventListener("change", () => void refresh());
  dom.stake.addEventListener("change", () => void refresh());
}

async function bootstrap() {
  const session = await ensureFinanceDashboardSession({ fallbackUrl: "./Dpayment.html" });
  dom.adminEmail.textContent = session?.email || "Session admin";
  syncDatesForWindow(String(dom.windowSelect.value || "30d"));
  bindEvents();
  await refresh();
}

void bootstrap();

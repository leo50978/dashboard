import { ensureFinanceDashboardSession } from "./dashboard-admin-auth.js";
import { getGamesVolumeAnalyticsSnapshotSecure } from "./secure-functions.js";

const chartState = {
  trend: null,
  mix: null,
  compare: null,
};

const dom = {
  status: document.getElementById("gamesVolumeStatus"),
  refreshBtn: document.getElementById("gamesVolumeRefreshBtn"),
  windowSelect: document.getElementById("gamesVolumeWindow"),
  dateFrom: document.getElementById("gamesVolumeDateFrom"),
  dateTo: document.getElementById("gamesVolumeDateTo"),
  coverage: document.getElementById("gamesVolumeCoverage"),
  generatedAt: document.getElementById("gamesVolumeGeneratedAt"),
  totalMatches: document.getElementById("gamesVolumeTotal"),
  classicMatches: document.getElementById("gamesVolumeClassic"),
  duelMatches: document.getElementById("gamesVolumeDuel"),
  morpionMatches: document.getElementById("gamesVolumeMorpion"),
  dameMatches: document.getElementById("gamesVolumeDame"),
  pongMatches: document.getElementById("gamesVolumePong"),
  totalMatchesNote: document.getElementById("gamesVolumeTotalNote"),
  classicMatchesNote: document.getElementById("gamesVolumeClassicNote"),
  duelMatchesNote: document.getElementById("gamesVolumeDuelNote"),
  morpionMatchesNote: document.getElementById("gamesVolumeMorpionNote"),
  dameMatchesNote: document.getElementById("gamesVolumeDameNote"),
  pongMatchesNote: document.getElementById("gamesVolumePongNote"),
  avgMatches: document.getElementById("gamesVolumeAvg"),
  peakMatches: document.getElementById("gamesVolumePeak"),
  peakLabel: document.getElementById("gamesVolumePeakLabel"),
  botMix: document.getElementById("gamesVolumeBotMix"),
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
  const windowKey = String(dom.windowSelect?.value || "today").trim().toLowerCase();
  if (windowKey === "custom") {
    return {
      window: "custom",
      startMs: parseDateInput(dom.dateFrom?.value || "", false),
      endMs: parseDateInput(dom.dateTo?.value || "", true),
    };
  }
  return { window: windowKey };
}

function renderSummary(snapshot = {}, result = {}) {
  const summary = snapshot.summary || {};
  const range = result.range || {};

  if (dom.totalMatches) dom.totalMatches.textContent = formatInt(summary.totalMatches);
  if (dom.classicMatches) dom.classicMatches.textContent = formatInt(summary.classicMatches);
  if (dom.duelMatches) dom.duelMatches.textContent = formatInt(summary.duelMatches);
  if (dom.morpionMatches) dom.morpionMatches.textContent = formatInt(summary.morpionMatches);
  if (dom.dameMatches) dom.dameMatches.textContent = formatInt(summary.dameMatches);
  if (dom.pongMatches) dom.pongMatches.textContent = formatInt(summary.pongMatches);

  if (dom.totalMatchesNote) dom.totalMatchesNote.textContent = `${formatInt(summary.avgMatchesPerBucket)} match(s) en moyenne par point`;
  if (dom.classicMatchesNote) dom.classicMatchesNote.textContent = `${formatInt(summary.classicWithBots)} avec bot sur domino classique`;
  if (dom.duelMatchesNote) dom.duelMatchesNote.textContent = `${formatInt(summary.duelWithBots)} avec bot sur le duel`;
  if (dom.morpionMatchesNote) dom.morpionMatchesNote.textContent = `${formatInt(summary.morpionWithBots)} avec bot sur Morpion`;
  if (dom.dameMatchesNote) dom.dameMatchesNote.textContent = `${formatInt(summary.dameWithBots)} avec bot sur Dame`;
  if (dom.pongMatchesNote) dom.pongMatchesNote.textContent = `${formatInt(summary.pongWithBots)} avec bot sur Pong`;

  if (dom.avgMatches) dom.avgMatches.textContent = formatInt(summary.avgMatchesPerBucket);
  if (dom.peakMatches) dom.peakMatches.textContent = formatInt(summary.peakBucketMatches);
  if (dom.peakLabel) dom.peakLabel.textContent = summary.peakBucketLabel || "--";
  if (dom.botMix) {
    dom.botMix.textContent = `Bots: classique ${formatInt(summary.classicWithBots)} • duel ${formatInt(summary.duelWithBots)} • Morpion ${formatInt(summary.morpionWithBots)} • Dame ${formatInt(summary.dameWithBots)} • Pong ${formatInt(summary.pongWithBots)}`;
  }

  if (dom.coverage) {
    const startText = range?.isGlobal ? "Début historique" : formatDateTime(range.startMs);
    dom.coverage.textContent = `Couverture: ${startText} -> ${formatDateTime(range.endMs)}`;
  }
  if (dom.generatedAt) {
    dom.generatedAt.textContent = `Dernier snapshot: ${formatDateTime(snapshot.generatedAtMs)}`;
  }
}

function renderCharts(snapshot = {}) {
  const ChartLib = window.Chart;
  if (!ChartLib) return;

  destroyChart("trend");
  destroyChart("mix");
  destroyChart("compare");

  const trend = Array.isArray(snapshot.trend) ? snapshot.trend : [];
  const mix = Array.isArray(snapshot.mix) ? snapshot.mix : [];

  const trendCtx = document.getElementById("gamesVolumeTrendChart");
  const mixCtx = document.getElementById("gamesVolumeMixChart");
  const compareCtx = document.getElementById("gamesVolumeCompareChart");

  if (trendCtx) {
    chartState.trend = new ChartLib(trendCtx, {
      type: "line",
      data: {
        labels: trend.map((item) => item.label),
        datasets: [
          {
            label: "Total",
            data: trend.map((item) => safeInt(item.totalMatches)),
            borderColor: "#68d7ff",
            backgroundColor: "rgba(104, 215, 255, 0.16)",
            fill: true,
            tension: 0.24,
            borderWidth: 2,
          },
          {
            label: "Domino",
            data: trend.map((item) => safeInt(item.classicMatches)),
            borderColor: "#7c5cff",
            backgroundColor: "rgba(124, 92, 255, 0.12)",
            fill: false,
            tension: 0.24,
            borderWidth: 2,
          },
          {
            label: "Duel",
            data: trend.map((item) => safeInt(item.duelMatches)),
            borderColor: "#ff9c5f",
            backgroundColor: "rgba(255, 156, 95, 0.12)",
            fill: false,
            tension: 0.24,
            borderWidth: 2,
          },
          {
            label: "Morpion",
            data: trend.map((item) => safeInt(item.morpionMatches)),
            borderColor: "#4be7b8",
            backgroundColor: "rgba(75, 231, 184, 0.12)",
            fill: false,
            tension: 0.24,
            borderWidth: 2,
          },
          {
            label: "Dame",
            data: trend.map((item) => safeInt(item.dameMatches)),
            borderColor: "#ff7d8d",
            backgroundColor: "rgba(255, 125, 141, 0.12)",
            fill: false,
            tension: 0.24,
            borderWidth: 2,
          },
          {
            label: "Pong",
            data: trend.map((item) => safeInt(item.pongMatches)),
            borderColor: "#ffd166",
            backgroundColor: "rgba(255, 209, 102, 0.12)",
            fill: false,
            tension: 0.24,
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: "#edf2ff" } } },
        scales: {
          x: { ticks: { color: "#95a4cb", maxRotation: 0, autoSkip: true }, grid: { display: false } },
          y: { ticks: { color: "#95a4cb", precision: 0 }, grid: { color: "rgba(163, 184, 255, 0.08)" } },
        },
      },
    });
  }

  if (mixCtx) {
    chartState.mix = new ChartLib(mixCtx, {
      type: "doughnut",
      data: {
        labels: mix.map((item) => item.label),
        datasets: [{
          data: mix.map((item) => safeInt(item.count)),
          backgroundColor: ["#7c5cff", "#ff9c5f", "#4be7b8", "#ff7d8d", "#ffd166"],
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

  if (compareCtx) {
    chartState.compare = new ChartLib(compareCtx, {
      type: "bar",
      data: {
        labels: mix.map((item) => item.label),
        datasets: [{
          label: "Parties",
          data: mix.map((item) => safeInt(item.count)),
          backgroundColor: [
            "rgba(124, 92, 255, 0.78)",
            "rgba(255, 156, 95, 0.78)",
            "rgba(75, 231, 184, 0.78)",
            "rgba(255, 125, 141, 0.78)",
            "rgba(255, 209, 102, 0.78)",
          ],
          borderRadius: 14,
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

async function refreshGamesVolume() {
  try {
    setStatus("Chargement des volumes de parties...", "neutral");
    await ensureFinanceDashboardSession({
      title: "Volumes de parties",
      description: "Connecte-toi avec le compte administrateur autorisé pour consulter le volume de parties de tous les jeux.",
    });
    const result = await getGamesVolumeAnalyticsSnapshotSecure(buildPayload());
    const snapshot = result?.snapshot || {};
    renderSummary(snapshot, result || {});
    renderCharts(snapshot);
    setStatus("Analytics de parties à jour.", "success");
  } catch (error) {
    console.error("[GAMES_VOLUME_DASHBOARD] refresh error", error);
    setStatus(error?.message || "Impossible de charger les analytics de parties.", "error");
  }
}

function bindEvents() {
  dom.refreshBtn?.addEventListener("click", () => {
    void refreshGamesVolume();
  });
  dom.windowSelect?.addEventListener("change", () => {
    const nextWindow = String(dom.windowSelect.value || "today").trim().toLowerCase();
    syncDatesForWindow(nextWindow);
    void refreshGamesVolume();
  });
  dom.dateFrom?.addEventListener("change", () => {
    if (dom.windowSelect) dom.windowSelect.value = "custom";
  });
  dom.dateTo?.addEventListener("change", () => {
    if (dom.windowSelect) dom.windowSelect.value = "custom";
  });
}

async function init() {
  syncDatesForWindow("today");
  bindEvents();
  await refreshGamesVolume();
}

void init();

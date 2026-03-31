import { ensureFinanceDashboardSession } from "./dashboard-admin-auth.js";
import { getPresenceAnalyticsSnapshotSecure } from "./secure-functions.js";

const chartState = {
  daily: null,
  snapshots: null,
  hour: null,
  weekday: null,
};

const dom = {
  status: document.getElementById("analyticsStatus"),
  refreshBtn: document.getElementById("analyticsRefreshBtn"),
  applyBtn: document.getElementById("analyticsApplyBtn"),
  windowSelect: document.getElementById("analyticsWindow"),
  dateFrom: document.getElementById("analyticsDateFrom"),
  dateTo: document.getElementById("analyticsDateTo"),
  coverage: document.getElementById("analyticsCoverage"),
  generatedAt: document.getElementById("analyticsGeneratedAt"),
  snapshotsNote: document.getElementById("analyticsSnapshotsNote"),
  currentOnline: document.getElementById("analyticsCurrentOnline"),
  currentPlayers: document.getElementById("analyticsCurrentPlayers"),
  currentRooms: document.getElementById("analyticsCurrentRooms"),
  peakVisitors: document.getElementById("analyticsPeakVisitors"),
  peakPlayers: document.getElementById("analyticsPeakPlayers"),
  avgVisitors: document.getElementById("analyticsAvgVisitors"),
  avgPlayers: document.getElementById("analyticsAvgPlayers"),
  peakRooms: document.getElementById("analyticsPeakRooms"),
  peakDay: document.getElementById("analyticsPeakDay"),
  peakList: document.getElementById("analyticsPeakList"),
};

function safeInt(value) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.trunc(num) : 0;
}

function formatInt(value) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Math.max(0, safeInt(value)));
}

function formatDateTime(ms) {
  const safeMs = safeInt(ms);
  if (!safeMs) return "-";
  return new Date(safeMs).toLocaleString("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  });
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

function destroyChart(key) {
  if (chartState[key]) {
    chartState[key].destroy();
    chartState[key] = null;
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

  if (dom.currentOnline) dom.currentOnline.textContent = formatInt(summary.currentOnlineUsers);
  if (dom.currentPlayers) dom.currentPlayers.textContent = formatInt(summary.currentInGameUsers);
  if (dom.currentRooms) dom.currentRooms.textContent = formatInt(summary.currentPlayingRooms);
  if (dom.peakVisitors) dom.peakVisitors.textContent = formatInt(summary.peakVisitors);
  if (dom.peakPlayers) dom.peakPlayers.textContent = formatInt(summary.peakPlayers);
  if (dom.avgVisitors) dom.avgVisitors.textContent = formatInt(summary.avgDailyPeakVisitors);
  if (dom.avgPlayers) dom.avgPlayers.textContent = formatInt(summary.avgDailyPeakPlayers);
  if (dom.peakRooms) dom.peakRooms.textContent = formatInt(summary.peakPlayingRooms);
  if (dom.peakDay) dom.peakDay.textContent = summary.peakDayLabel || "--";

  if (dom.coverage) {
    const startText = range?.startMs ? formatDateTime(range.startMs) : "Historique";
    dom.coverage.textContent = `Couverture: ${startText} -> ${formatDateTime(range.endMs)}`;
  }
  if (dom.generatedAt) {
    dom.generatedAt.textContent = `Derniere actualisation: ${formatDateTime(result.generatedAtMs)}`;
  }

  if (dom.snapshotsNote) {
    const coverage = snapshot.snapshotsCoverage || {};
    dom.snapshotsNote.textContent = coverage.limitedToRecentWindow
      ? `Courbe fine limitee aux snapshots recents: ${formatDateTime(coverage.startMs)} -> ${formatDateTime(coverage.endMs)}`
      : `Courbe fine: ${formatDateTime(coverage.startMs)} -> ${formatDateTime(coverage.endMs)}`;
  }
}

function renderPeakList(snapshot = {}) {
  if (!dom.peakList) return;
  const peakMoments = Array.isArray(snapshot.peakMoments) ? snapshot.peakMoments : [];
  if (peakMoments.length <= 0) {
    dom.peakList.innerHTML = `<div class="empty-state">Pas encore assez de snapshots pour afficher les moments de pic.</div>`;
    return;
  }
  dom.peakList.innerHTML = peakMoments.map((item) => `
    <article class="peak-row">
      <div>
        <p class="peak-title">${formatDateTime(item.bucketMs)}</p>
        <p class="peak-meta">${formatInt(item.onlineInGameUsers)} joueurs actifs • ${formatInt(item.playingRooms)} rooms playing</p>
      </div>
      <div class="peak-title">${formatInt(item.onlineUsers)}</div>
    </article>
  `).join("");
}

function buildHourSeries(items = []) {
  return items.map((item) => {
    const samples = Math.max(1, safeInt(item.samples));
    return {
      label: `${String(item.hourKey || "").padStart(2, "0")}h`,
      avgVisitors: Math.round(safeInt(item.onlineUsersSum) / samples),
      peakVisitors: safeInt(item.onlineUsersMax),
    };
  });
}

function buildWeekdaySeries(items = []) {
  const order = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const labels = {
    mon: "Lun",
    tue: "Mar",
    wed: "Mer",
    thu: "Jeu",
    fri: "Ven",
    sat: "Sam",
    sun: "Dim",
  };
  return items
    .slice()
    .sort((a, b) => order.indexOf(String(a.weekdayKey || "").toLowerCase()) - order.indexOf(String(b.weekdayKey || "").toLowerCase()))
    .map((item) => {
      const samples = Math.max(1, safeInt(item.samples));
      const key = String(item.weekdayKey || "").toLowerCase();
      return {
        label: labels[key] || key,
        avgVisitors: Math.round(safeInt(item.onlineUsersSum) / samples),
        peakVisitors: safeInt(item.onlineUsersMax),
      };
    });
}

function renderCharts(snapshot = {}) {
  const ChartLib = window.Chart;
  if (!ChartLib) return;

  destroyChart("daily");
  destroyChart("snapshots");
  destroyChart("hour");
  destroyChart("weekday");

  const trend = Array.isArray(snapshot.trend) ? snapshot.trend : [];
  const snapshotTrend = Array.isArray(snapshot.snapshotTrend) ? snapshot.snapshotTrend : [];
  const hourSeries = buildHourSeries(Array.isArray(snapshot.hourOfDay) ? snapshot.hourOfDay : []);
  const weekdaySeries = buildWeekdaySeries(Array.isArray(snapshot.weekday) ? snapshot.weekday : []);

  const dailyCtx = document.getElementById("analyticsDailyTrendChart");
  const snapshotCtx = document.getElementById("analyticsSnapshotTrendChart");
  const hourCtx = document.getElementById("analyticsHourChart");
  const weekdayCtx = document.getElementById("analyticsWeekdayChart");

  if (dailyCtx) {
    chartState.daily = new ChartLib(dailyCtx, {
      type: "line",
      data: {
        labels: trend.map((item) => item.label),
        datasets: [
          {
            label: "Pic visiteurs",
            data: trend.map((item) => safeInt(item.peakVisitors)),
            borderColor: "#68d7ff",
            backgroundColor: "rgba(104, 215, 255, 0.18)",
            fill: true,
            tension: 0.28,
            borderWidth: 2,
          },
          {
            label: "Pic joueurs",
            data: trend.map((item) => safeInt(item.peakPlayers)),
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
        plugins: { legend: { labels: { color: "#edf2ff" } } },
        scales: {
          x: { ticks: { color: "#95a4cb" }, grid: { color: "rgba(163, 184, 255, 0.08)" } },
          y: { ticks: { color: "#95a4cb", precision: 0 }, grid: { color: "rgba(163, 184, 255, 0.08)" } },
        },
      },
    });
  }

  if (snapshotCtx) {
    chartState.snapshots = new ChartLib(snapshotCtx, {
      type: "line",
      data: {
        labels: snapshotTrend.map((item) => formatDateTime(item.bucketMs)),
        datasets: [
          {
            label: "Presence totale",
            data: snapshotTrend.map((item) => safeInt(item.onlineUsers)),
            borderColor: "#7c5cff",
            backgroundColor: "rgba(124, 92, 255, 0.16)",
            fill: true,
            tension: 0.26,
            borderWidth: 2,
          },
          {
            label: "En jeu",
            data: snapshotTrend.map((item) => safeInt(item.onlineInGameUsers)),
            borderColor: "#ff9c5f",
            backgroundColor: "rgba(255, 156, 95, 0.14)",
            fill: false,
            tension: 0.26,
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

  if (hourCtx) {
    chartState.hour = new ChartLib(hourCtx, {
      type: "bar",
      data: {
        labels: hourSeries.map((item) => item.label),
        datasets: [
          {
            label: "Pic visiteurs",
            data: hourSeries.map((item) => safeInt(item.peakVisitors)),
            backgroundColor: "rgba(104, 215, 255, 0.74)",
            borderRadius: 12,
          },
          {
            label: "Moyenne visiteurs",
            data: hourSeries.map((item) => safeInt(item.avgVisitors)),
            backgroundColor: "rgba(124, 92, 255, 0.56)",
            borderRadius: 12,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: "#edf2ff" } } },
        scales: {
          x: { ticks: { color: "#95a4cb" }, grid: { display: false } },
          y: { ticks: { color: "#95a4cb", precision: 0 }, grid: { color: "rgba(163, 184, 255, 0.08)" } },
        },
      },
    });
  }

  if (weekdayCtx) {
    chartState.weekday = new ChartLib(weekdayCtx, {
      type: "radar",
      data: {
        labels: weekdaySeries.map((item) => item.label),
        datasets: [{
          label: "Pic visiteurs",
          data: weekdaySeries.map((item) => safeInt(item.peakVisitors)),
          borderColor: "#ff9c5f",
          backgroundColor: "rgba(255, 156, 95, 0.18)",
          pointBackgroundColor: "#ff9c5f",
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: "#edf2ff" } } },
        scales: {
          r: {
            angleLines: { color: "rgba(163, 184, 255, 0.12)" },
            grid: { color: "rgba(163, 184, 255, 0.12)" },
            pointLabels: { color: "#edf2ff" },
            ticks: { color: "#95a4cb", backdropColor: "transparent", precision: 0 },
          },
        },
      },
    });
  }
}

async function refreshAnalytics() {
  try {
    setStatus("Chargement des analytics de presence...", "neutral");
    await ensureFinanceDashboardSession({
      title: "Analytics presence",
      description: "Connecte-toi avec le compte administrateur autorise pour consulter la presence, les visiteurs et l'activite de jeu.",
    });

    const result = await getPresenceAnalyticsSnapshotSecure(buildPayload());
    const snapshot = result?.snapshot || {};
    renderSummary(snapshot, result || {});
    renderPeakList(snapshot);
    renderCharts(snapshot);
    setStatus("Analytics de presence a jour.", "success");
  } catch (error) {
    console.error("[ANALYTICS_PRESENCE] refresh error", error);
    setStatus(error?.message || "Impossible de charger les analytics de presence.", "error");
  }
}

function bindEvents() {
  dom.windowSelect?.addEventListener("change", () => {
    const nextWindow = String(dom.windowSelect.value || "today").trim().toLowerCase();
    syncDatesForWindow(nextWindow);
  });
  dom.refreshBtn?.addEventListener("click", () => {
    void refreshAnalytics();
  });
  dom.applyBtn?.addEventListener("click", () => {
    void refreshAnalytics();
  });
}

async function init() {
  syncDatesForWindow("today");
  bindEvents();
  await refreshAnalytics();
}

void init();

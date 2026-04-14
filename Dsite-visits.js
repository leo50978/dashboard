import { ensureFinanceDashboardSession } from "./dashboard-admin-auth.js";
import { getSiteVisitsAnalyticsSnapshotSecure } from "./secure-functions.js";

const chartState = {
  trend: null,
  hour: null,
  weekday: null,
};

const dom = {
  status: document.getElementById("siteVisitsStatus"),
  refreshBtn: document.getElementById("siteVisitsRefreshBtn"),
  windowSelect: document.getElementById("siteVisitsWindow"),
  dateFrom: document.getElementById("siteVisitsDateFrom"),
  dateTo: document.getElementById("siteVisitsDateTo"),
  coverage: document.getElementById("siteVisitsCoverage"),
  generatedAt: document.getElementById("siteVisitsGeneratedAt"),
  rangeVisits: document.getElementById("siteVisitsRange"),
  allTimeVisits: document.getElementById("siteVisitsAllTime"),
  todayVisits: document.getElementById("siteVisitsToday"),
  peakVisits: document.getElementById("siteVisitsPeak"),
  rangeVisitsNote: document.getElementById("siteVisitsRangeNote"),
  allTimeVisitsNote: document.getElementById("siteVisitsAllTimeNote"),
  todayVisitsNote: document.getElementById("siteVisitsTodayNote"),
  peakVisitsNote: document.getElementById("siteVisitsPeakNote"),
  avgVisits: document.getElementById("siteVisitsAvg"),
  activeBuckets: document.getElementById("siteVisitsBuckets"),
  peakBucketLabel: document.getElementById("siteVisitsPeakLabel"),
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

  if (dom.rangeVisits) dom.rangeVisits.textContent = formatInt(summary.rangeVisits);
  if (dom.allTimeVisits) dom.allTimeVisits.textContent = formatInt(summary.allTimeVisits);
  if (dom.todayVisits) dom.todayVisits.textContent = formatInt(summary.todayVisits);
  if (dom.peakVisits) dom.peakVisits.textContent = formatInt(summary.peakBucketVisits);

  if (dom.rangeVisitsNote) dom.rangeVisitsNote.textContent = `${formatInt(summary.activeBuckets)} point(s) sur la période filtrée`;
  if (dom.allTimeVisitsNote) dom.allTimeVisitsNote.textContent = "Compteur historique toutes sessions confondues";
  if (dom.todayVisitsNote) dom.todayVisitsNote.textContent = "Visites enregistrées depuis 00h aujourd'hui";
  if (dom.peakVisitsNote) dom.peakVisitsNote.textContent = summary.peakBucketLabel || "Pas encore de pic relevé";

  if (dom.avgVisits) dom.avgVisits.textContent = formatInt(summary.avgPerBucket);
  if (dom.activeBuckets) dom.activeBuckets.textContent = formatInt(summary.activeBuckets);
  if (dom.peakBucketLabel) dom.peakBucketLabel.textContent = summary.peakBucketLabel || "--";

  if (dom.coverage) {
    const startText = range?.isGlobal ? "Début historique" : formatDateTime(range.startMs);
    dom.coverage.textContent = `Couverture: ${startText} -> ${formatDateTime(range.endMs)}`;
  }
  if (dom.generatedAt) {
    dom.generatedAt.textContent = `Dernier snapshot: ${formatDateTime(result.generatedAtMs)}`;
  }
}

function renderCharts(snapshot = {}) {
  const ChartLib = window.Chart;
  if (!ChartLib) return;

  destroyChart("trend");
  destroyChart("hour");
  destroyChart("weekday");

  const trend = Array.isArray(snapshot.trend) ? snapshot.trend : [];
  const hourOfDay = Array.isArray(snapshot.hourOfDay) ? snapshot.hourOfDay : [];
  const weekday = Array.isArray(snapshot.weekday) ? snapshot.weekday : [];

  const trendCtx = document.getElementById("siteVisitsTrendChart");
  const hourCtx = document.getElementById("siteVisitsHourChart");
  const weekdayCtx = document.getElementById("siteVisitsWeekdayChart");

  if (trendCtx) {
    chartState.trend = new ChartLib(trendCtx, {
      type: "line",
      data: {
        labels: trend.map((item) => item.label),
        datasets: [{
          label: "Visites",
          data: trend.map((item) => safeInt(item.visitCount)),
          borderColor: "#68d7ff",
          backgroundColor: "rgba(104, 215, 255, 0.18)",
          fill: true,
          tension: 0.28,
          borderWidth: 2,
        }],
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
        labels: hourOfDay.map((item) => item.label),
        datasets: [{
          label: "Visites",
          data: hourOfDay.map((item) => safeInt(item.visitCount)),
          backgroundColor: "rgba(124, 92, 255, 0.72)",
          borderRadius: 12,
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

  if (weekdayCtx) {
    chartState.weekday = new ChartLib(weekdayCtx, {
      type: "radar",
      data: {
        labels: weekday.map((item) => item.label),
        datasets: [{
          label: "Visites",
          data: weekday.map((item) => safeInt(item.visitCount)),
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

async function refreshSiteVisits() {
  try {
    setStatus("Chargement des visites du site...", "neutral");
    await ensureFinanceDashboardSession({
      title: "Visites du site",
      description: "Connecte-toi avec le compte administrateur autorisé pour consulter les visites globales du site.",
    });
    const result = await getSiteVisitsAnalyticsSnapshotSecure(buildPayload());
    const snapshot = result?.snapshot || {};
    renderSummary(snapshot, result || {});
    renderCharts(snapshot);
    setStatus("Analytics de visites à jour.", "success");
  } catch (error) {
    console.error("[SITE_VISITS_DASHBOARD] refresh error", error);
    setStatus(error?.message || "Impossible de charger les analytics de visites.", "error");
  }
}

function bindEvents() {
  dom.refreshBtn?.addEventListener("click", () => {
    void refreshSiteVisits();
  });
  dom.windowSelect?.addEventListener("change", () => {
    const nextWindow = String(dom.windowSelect.value || "today").trim().toLowerCase();
    syncDatesForWindow(nextWindow);
    void refreshSiteVisits();
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
  await refreshSiteVisits();
}

void init();

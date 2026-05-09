import { ensureFinanceDashboardSession } from "./dashboard-admin-auth.js";
import { getClientAcquisitionSnapshotSecure } from "./secure-functions.js";

const DEFAULT_RANGE_DAYS = 30;

const dom = {
  adminEmail: document.getElementById("acquisitionAdminEmail"),
  windowBadge: document.getElementById("acquisitionWindowBadge"),
  scanBadge: document.getElementById("acquisitionScanBadge"),
  dateFrom: document.getElementById("acquisitionDateFrom"),
  dateTo: document.getElementById("acquisitionDateTo"),
  granularity: document.getElementById("acquisitionGranularity"),
  refreshBtn: document.getElementById("acquisitionRefreshBtn"),
  status: document.getElementById("acquisitionStatus"),
  totalAccounts: document.getElementById("acquisitionTotalAccounts"),
  totalAccountsCopy: document.getElementById("acquisitionTotalAccountsCopy"),
  signupsValue: document.getElementById("acquisitionSignupsValue"),
  signupsCopy: document.getElementById("acquisitionSignupsCopy"),
  realClientsValue: document.getElementById("acquisitionRealClientsValue"),
  realClientsCopy: document.getElementById("acquisitionRealClientsCopy"),
  activeValue: document.getElementById("acquisitionActiveValue"),
  activeCopy: document.getElementById("acquisitionActiveCopy"),
  depositRateValue: document.getElementById("acquisitionDepositRateValue"),
  depositRateCopy: document.getElementById("acquisitionDepositRateCopy"),
  fidelizedRateValue: document.getElementById("acquisitionFidelizedRateValue"),
  fidelizedRateCopy: document.getElementById("acquisitionFidelizedRateCopy"),
  activeRateValue: document.getElementById("acquisitionActiveRateValue"),
  welcomeValue: document.getElementById("acquisitionWelcomeValue"),
  frozenValue: document.getElementById("acquisitionFrozenValue"),
  highlightsCopy: document.getElementById("acquisitionHighlightsCopy"),
  definitionsCopy: document.getElementById("acquisitionDefinitionsCopy"),
  signupsSvg: document.getElementById("acquisitionSignupsSvg"),
  signupsAxis: document.getElementById("acquisitionSignupsAxis"),
  signupsLastValue: document.getElementById("acquisitionSignupsLastValue"),
  signupsLastCopy: document.getElementById("acquisitionSignupsLastCopy"),
  signupsDeltaValue: document.getElementById("acquisitionSignupsDeltaValue"),
  signupsDeltaCopy: document.getElementById("acquisitionSignupsDeltaCopy"),
  signupsPeakValue: document.getElementById("acquisitionSignupsPeakValue"),
  signupsPeakCopy: document.getElementById("acquisitionSignupsPeakCopy"),
  cumulativeSvg: document.getElementById("acquisitionCumulativeSvg"),
  cumulativeAxis: document.getElementById("acquisitionCumulativeAxis"),
  cumulativeLastValue: document.getElementById("acquisitionCumulativeLastValue"),
  cumulativeLastCopy: document.getElementById("acquisitionCumulativeLastCopy"),
  cumulativeDeltaValue: document.getElementById("acquisitionCumulativeDeltaValue"),
  cumulativeDeltaCopy: document.getElementById("acquisitionCumulativeDeltaCopy"),
  cumulativePeakValue: document.getElementById("acquisitionCumulativePeakValue"),
  cumulativePeakCopy: document.getElementById("acquisitionCumulativePeakCopy"),
  tableBody: document.getElementById("acquisitionTableBody"),
  tableNote: document.getElementById("acquisitionTableNote"),
};

const state = {
  adminEmail: "",
  snapshot: null,
  loading: false,
};

function safeInt(value) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.trunc(num) : 0;
}

function safeFloat(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, safeFloat(value)));
}

function escapeHtml(value = "") {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatInt(value) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(safeFloat(value));
}

function formatPercent(value) {
  return `${clampPercent(value).toFixed(1)}%`;
}

function formatSignedInt(value) {
  const num = safeInt(value);
  return `${num > 0 ? "+" : ""}${formatInt(num)}`;
}

function formatDateInput(ms = 0) {
  if (!ms) return "";
  const date = new Date(ms);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateInputMs(rawValue = "", endOfDay = false) {
  const raw = String(rawValue || "").trim();
  if (!raw) return 0;
  const parts = raw.split("-").map((item) => Number(item));
  if (parts.length !== 3 || parts.some((item) => !Number.isFinite(item))) return 0;
  const [year, month, day] = parts;
  if (endOfDay) return new Date(year, month - 1, day, 23, 59, 59, 999).getTime();
  return new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
}

function setStatus(text, tone = "neutral") {
  if (!dom.status) return;
  dom.status.textContent = String(text || "");
  dom.status.style.color = tone === "error"
    ? "#ff9bab"
    : tone === "success"
      ? "#88f3ca"
      : tone === "warn"
        ? "#ffd38a"
        : "";
}

function setLoading(loading) {
  state.loading = loading === true;
  dom.refreshBtn.disabled = state.loading;
  dom.dateFrom.disabled = state.loading;
  dom.dateTo.disabled = state.loading;
  dom.granularity.disabled = state.loading;
}

function getSelectedPayload() {
  return {
    startMs: parseDateInputMs(dom.dateFrom.value, false),
    endMs: parseDateInputMs(dom.dateTo.value, true),
    granularity: String(dom.granularity.value || "day"),
  };
}

function syncWindowUi(snapshot = null) {
  const windowData = snapshot?.window || {};
  const startMs = safeInt(windowData.startMs);
  const endMs = safeInt(windowData.endMs);
  const rangeDays = Math.max(1, Math.round(safeInt(windowData.rangeMs) / (24 * 60 * 60 * 1000)));
  const granularity = String(windowData.granularity || "day");

  if (startMs) dom.dateFrom.value = formatDateInput(startMs);
  if (endMs) dom.dateTo.value = formatDateInput(endMs);
  dom.granularity.value = granularity === "hour" ? "hour" : "day";
  dom.windowBadge.textContent = `Fenêtre ${rangeDays} jour${rangeDays > 1 ? "s" : ""} · ${granularity === "hour" ? "horaire" : "journalière"}`;
}

function renderSummary(snapshot = null) {
  const summary = snapshot?.summary || {};
  const defs = snapshot?.definitions || {};

  dom.totalAccounts.textContent = formatInt(summary.totalAccounts);
  dom.totalAccountsCopy.textContent = `${formatInt(summary.accountsBeforeWindow)} comptes existaient déjà avant cette fenêtre.`;

  dom.signupsValue.textContent = formatInt(summary.signupsCount);
  dom.signupsCopy.textContent = `${formatInt(summary.welcomeBonusSignupsCount)} avaient déjà pris l'ancien bonus bienvenue sur cette cohorte.`;

  dom.realClientsValue.textContent = formatInt(summary.realClients);
  dom.realClientsCopy.textContent = `${formatPercent(summary.realClientRatePct)} de toute la base a déjà déposé au moins une fois.`;

  dom.activeValue.textContent = formatInt(summary.activeAccounts);
  dom.activeCopy.textContent = `${formatPercent(summary.activeRatePct)} de la base a été vue sur les ${formatInt(defs.activeLookbackDays || 7)} derniers jours.`;

  dom.depositRateValue.textContent = formatPercent(summary.signupToDepositRatePct);
  dom.depositRateCopy.textContent = `${formatInt(summary.depositingSignupsCount)} inscrits de la période ont déjà effectué un vrai dépôt.`;

  dom.fidelizedRateValue.textContent = formatPercent(summary.signupToFidelizedRatePct);
  dom.fidelizedRateCopy.textContent = `${formatInt(summary.fidelizedSignupsCount)} comptes ont déposé puis sont revenus après le seuil de fidélisation.`;

  dom.activeRateValue.textContent = formatPercent(summary.signupToActiveRatePct);
  dom.welcomeValue.textContent = formatInt(summary.welcomeBonusSignupsCount);
  dom.frozenValue.textContent = formatInt(summary.frozenSignupsCount);

  dom.highlightsCopy.textContent = `${formatInt(summary.signupsCount)} inscrits ont été trouvés sur la période. ${formatInt(summary.depositingSignupsCount)} sont déjà devenus déposants, ${formatInt(summary.activeSignupsCount)} sont revenus récemment, et ${formatInt(summary.fidelizedSignupsCount)} montrent un premier signal de fidélisation.`;
  dom.definitionsCopy.textContent = `${String(defs.cohortScope || "")} ${String(defs.fidelizedRule || "")}`.trim();

  if (snapshot?.truncated) {
    dom.scanBadge.textContent = `Source: clients · tronqué à ${formatInt(snapshot.scanLimit)} docs`;
  } else {
    dom.scanBadge.textContent = `Source: clients · ${formatInt(snapshot.scannedSignupDocs)} inscrits lus`;
  }
}

function renderChartInsights(config = {}) {
  const points = Array.isArray(config.points) ? config.points : [];
  const valueNode = config.valueNode;
  const valueCopyNode = config.valueCopyNode;
  const deltaNode = config.deltaNode;
  const deltaCopyNode = config.deltaCopyNode;
  const peakNode = config.peakNode;
  const peakCopyNode = config.peakCopyNode;
  const suffix = String(config.suffix || "");

  if (!valueNode || !valueCopyNode || !deltaNode || !deltaCopyNode || !peakNode || !peakCopyNode) return;

  if (!points.length) {
    valueNode.textContent = "-";
    valueCopyNode.textContent = "Aucune donnée visible sur cette fenêtre.";
    deltaNode.textContent = "-";
    deltaNode.className = "";
    deltaCopyNode.textContent = "Pas encore de momentum mesurable.";
    peakNode.textContent = "-";
    peakCopyNode.textContent = "Pas de point haut détecté.";
    return;
  }

  const lastPoint = points[points.length - 1] || null;
  const previousPoint = points.length > 1 ? points[points.length - 2] : null;
  const peakPoint = points.reduce((best, item) => {
    if (!best) return item;
    return safeFloat(item.value) > safeFloat(best.value) ? item : best;
  }, null);
  const delta = lastPoint ? (safeFloat(lastPoint.value) - safeFloat(previousPoint?.value || 0)) : 0;
  const deltaPct = previousPoint && safeFloat(previousPoint.value) > 0
    ? ((delta / safeFloat(previousPoint.value)) * 100)
    : 0;

  valueNode.textContent = `${formatInt(lastPoint?.value || 0)}${suffix}`;
  valueCopyNode.textContent = `Dernière lecture: ${String(lastPoint?.label || "-")}.`;

  if (!previousPoint) {
    deltaNode.textContent = `${formatSignedInt(delta)}${suffix}`;
    deltaNode.className = "tone-neutral";
    deltaCopyNode.textContent = "Pas assez de recul pour comparer au bucket précédent.";
  } else {
    deltaNode.textContent = `${formatSignedInt(delta)}${suffix}`;
    deltaNode.className = delta > 0 ? "tone-positive" : delta < 0 ? "tone-negative" : "tone-neutral";
    deltaCopyNode.textContent = `Variation vs ${String(previousPoint.label || "-")}: ${previousPoint ? formatPercent(Math.abs(deltaPct)) : "-"}.`;
  }

  peakNode.textContent = `${formatInt(peakPoint?.value || 0)}${suffix}`;
  peakCopyNode.textContent = `Sommet visible atteint sur ${String(peakPoint?.label || "-")}.`;
}

function renderLineChart(options = {}) {
  const points = Array.isArray(options.points) ? options.points : [];
  const svg = options.svg;
  const axis = options.axis;
  const tone = String(options.tone || "signups");
  const emptyLabel = String(options.emptyLabel || "Pas assez de points pour tracer la courbe.");

  if (!svg || !axis) return;

  if (!points.length) {
    svg.innerHTML = `<text x="50%" y="50%" text-anchor="middle" fill="rgba(226,232,240,0.75)" font-size="16">${escapeHtml(emptyLabel)}</text>`;
    axis.innerHTML = `<span>-</span><span>-</span><span>-</span>`;
    return;
  }

  const width = 760;
  const height = 260;
  const padLeft = 16;
  const padRight = 16;
  const padTop = 18;
  const padBottom = 20;
  const chartWidth = width - padLeft - padRight;
  const chartHeight = height - padTop - padBottom;
  const values = points.map((item) => safeFloat(item.value));
  let minValue = Math.min(...values, 0);
  let maxValue = Math.max(...values, 0);
  if (minValue === maxValue) {
    maxValue += 1;
    minValue = Math.min(0, minValue - 1);
  }

  const toX = (index) => padLeft + ((chartWidth * index) / Math.max(points.length - 1, 1));
  const toY = (value) => {
    const normalized = (safeFloat(value) - minValue) / Math.max(maxValue - minValue, 1);
    return padTop + (chartHeight - (normalized * chartHeight));
  };

  const plotted = points.map((item, index) => ({
    ...item,
    x: toX(index),
    y: toY(item.value),
  }));
  const baselineY = toY(Math.min(0, minValue));
  const gridLines = [0.2, 0.4, 0.6, 0.8].map((ratio) => {
    const y = padTop + (chartHeight * ratio);
    return `<line class="grid-line" x1="${padLeft}" y1="${y.toFixed(1)}" x2="${width - padRight}" y2="${y.toFixed(1)}"></line>`;
  }).join("");
  const linePoints = plotted.map((item) => `${item.x.toFixed(1)},${item.y.toFixed(1)}`).join(" ");
  const firstPoint = plotted[0];
  const lastPoint = plotted[plotted.length - 1];
  const areaPath = [
    `M ${firstPoint.x.toFixed(1)} ${baselineY.toFixed(1)}`,
    ...plotted.map((item) => `L ${item.x.toFixed(1)} ${item.y.toFixed(1)}`),
    `L ${lastPoint.x.toFixed(1)} ${baselineY.toFixed(1)}`,
    "Z",
  ].join(" ");
  const gradientId = tone === "cumulative" ? "acquisitionCumulativeGradient" : "acquisitionSignupsGradient";
  const dotTone = tone === "cumulative" ? "cumulative" : "signups";

  svg.innerHTML = `
    <defs>
      <linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${tone === "cumulative" ? "#34d399" : "#38bdf8"}" stop-opacity="0.42"></stop>
        <stop offset="100%" stop-color="${tone === "cumulative" ? "#34d399" : "#38bdf8"}" stop-opacity="0"></stop>
      </linearGradient>
    </defs>
    ${gridLines}
    <line class="baseline" x1="${padLeft}" y1="${baselineY.toFixed(1)}" x2="${width - padRight}" y2="${baselineY.toFixed(1)}"></line>
    <path class="chart-area ${tone}" d="${areaPath}"></path>
    <polyline class="chart-line ${tone}" points="${linePoints}"></polyline>
    <circle class="chart-dot ${dotTone}" cx="${lastPoint.x.toFixed(1)}" cy="${lastPoint.y.toFixed(1)}" r="5.5"></circle>
  `;

  const middle = points[Math.floor(points.length / 2)] || points[0];
  axis.innerHTML = `
    <span>${escapeHtml(points[0]?.label || "-")}</span>
    <span>${escapeHtml(middle?.label || "-")}</span>
    <span>${escapeHtml(points[points.length - 1]?.label || "-")}</span>
  `;
}

function renderBuckets(snapshot = null) {
  const buckets = Array.isArray(snapshot?.buckets) ? snapshot.buckets : [];
  if (!buckets.length) {
    dom.tableBody.innerHTML = `<tr><td colspan="7" class="empty-copy">Aucune inscription trouvée sur cette fenêtre.</td></tr>`;
    dom.tableNote.textContent = "Change la période si tu veux analyser une autre cohorte.";
    return;
  }

  dom.tableBody.innerHTML = buckets.map((bucket) => `
    <tr>
      <td>${escapeHtml(bucket.label || "-")}</td>
      <td>${formatInt(bucket.signups)}</td>
      <td>${formatInt(bucket.activeSignups)}</td>
      <td>${formatInt(bucket.depositingSignups)}</td>
      <td>${formatInt(bucket.fidelizedSignups)}</td>
      <td>${formatPercent(bucket.signupToDepositRatePct)}</td>
      <td>${formatInt(bucket.cumulativeAccounts)}</td>
    </tr>
  `).join("");

  if (snapshot?.truncated) {
    dom.tableNote.textContent = `Le snapshot a volontairement été tronqué après ${formatInt(snapshot.scanLimit)} inscrits lus pour protéger les coûts Firestore.`;
    return;
  }
  dom.tableNote.textContent = `${formatInt(snapshot.scannedSignupDocs)} inscrits de la période ont été lus directement depuis la collection clients.`;
}

function renderSnapshot(snapshot = null) {
  state.snapshot = snapshot;
  syncWindowUi(snapshot);
  renderSummary(snapshot);
  renderLineChart({
    points: snapshot?.series?.signups || [],
    svg: dom.signupsSvg,
    axis: dom.signupsAxis,
    tone: "signups",
    emptyLabel: "Pas encore assez d'inscriptions sur cette période pour tracer une courbe utile.",
  });
  renderChartInsights({
    points: snapshot?.series?.signups || [],
    valueNode: dom.signupsLastValue,
    valueCopyNode: dom.signupsLastCopy,
    deltaNode: dom.signupsDeltaValue,
    deltaCopyNode: dom.signupsDeltaCopy,
    peakNode: dom.signupsPeakValue,
    peakCopyNode: dom.signupsPeakCopy,
  });
  renderLineChart({
    points: snapshot?.series?.cumulativeAccounts || [],
    svg: dom.cumulativeSvg,
    axis: dom.cumulativeAxis,
    tone: "cumulative",
    emptyLabel: "La base cumulée apparaîtra ici quand la période contiendra des inscriptions.",
  });
  renderChartInsights({
    points: snapshot?.series?.cumulativeAccounts || [],
    valueNode: dom.cumulativeLastValue,
    valueCopyNode: dom.cumulativeLastCopy,
    deltaNode: dom.cumulativeDeltaValue,
    deltaCopyNode: dom.cumulativeDeltaCopy,
    peakNode: dom.cumulativePeakValue,
    peakCopyNode: dom.cumulativePeakCopy,
  });
  renderBuckets(snapshot);
}

async function loadSnapshot() {
  setLoading(true);
  setStatus("Chargement de la courbe d’acquisition…");
  try {
    const payload = getSelectedPayload();
    const response = await getClientAcquisitionSnapshotSecure(payload);
    const snapshot = response?.snapshot || null;
    renderSnapshot(snapshot);
    setStatus("Snapshot acquisition chargé.", "success");
  } catch (error) {
    console.error("[ACQUISITION] load failed", error);
    setStatus(error?.message || "Impossible de charger l’acquisition.", "error");
  } finally {
    setLoading(false);
  }
}

function seedDefaultDates() {
  const end = new Date();
  const start = new Date(end.getTime() - ((DEFAULT_RANGE_DAYS - 1) * 24 * 60 * 60 * 1000));
  dom.dateFrom.value = formatDateInput(start.getTime());
  dom.dateTo.value = formatDateInput(end.getTime());
  dom.granularity.value = "day";
}

async function bootstrap() {
  const session = await ensureFinanceDashboardSession({
    fallbackUrl: "./Dhero.html",
  });
  state.adminEmail = String(session?.email || "").trim();
  dom.adminEmail.textContent = state.adminEmail || "Session admin";
  seedDefaultDates();
  await loadSnapshot();
}

dom.refreshBtn?.addEventListener("click", () => {
  void loadSnapshot();
});

void bootstrap();

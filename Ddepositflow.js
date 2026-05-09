import { ensureFinanceDashboardSession } from "./dashboard-admin-auth.js";
import { getDepositMethodAnalyticsSnapshotSecure } from "./secure-functions.js";

const DEFAULT_RANGE_DAYS = 30;

const dom = {
  adminEmail: document.getElementById("depositFlowAdminEmail"),
  windowBadge: document.getElementById("depositFlowWindowBadge"),
  scanBadge: document.getElementById("depositFlowScanBadge"),
  dateFrom: document.getElementById("depositFlowDateFrom"),
  dateTo: document.getElementById("depositFlowDateTo"),
  granularity: document.getElementById("depositFlowGranularity"),
  refreshBtn: document.getElementById("depositFlowRefreshBtn"),
  status: document.getElementById("depositFlowStatus"),
  requestedValue: document.getElementById("depositFlowRequestedValue"),
  requestedCopy: document.getElementById("depositFlowRequestedCopy"),
  approvedValue: document.getElementById("depositFlowApprovedValue"),
  approvedCopy: document.getElementById("depositFlowApprovedCopy"),
  rejectedValue: document.getElementById("depositFlowRejectedValue"),
  rejectedCopy: document.getElementById("depositFlowRejectedCopy"),
  approvalRateValue: document.getElementById("depositFlowApprovalRateValue"),
  approvalRateCopy: document.getElementById("depositFlowApprovalRateCopy"),
  moncashValue: document.getElementById("depositFlowMoncashValue"),
  moncashCopy: document.getElementById("depositFlowMoncashCopy"),
  natcashValue: document.getElementById("depositFlowNatcashValue"),
  natcashCopy: document.getElementById("depositFlowNatcashCopy"),
  pendingValue: document.getElementById("depositFlowPendingValue"),
  moncashShareValue: document.getElementById("depositFlowMoncashShareValue"),
  natcashShareValue: document.getElementById("depositFlowNatcashShareValue"),
  highlightsCopy: document.getElementById("depositFlowHighlightsCopy"),
  definitionsCopy: document.getElementById("depositFlowDefinitionsCopy"),
  approvedSvg: document.getElementById("depositFlowApprovedSvg"),
  approvedAxis: document.getElementById("depositFlowApprovedAxis"),
  approvedLastValue: document.getElementById("depositFlowApprovedLastValue"),
  approvedLastCopy: document.getElementById("depositFlowApprovedLastCopy"),
  approvedDeltaValue: document.getElementById("depositFlowApprovedDeltaValue"),
  approvedDeltaCopy: document.getElementById("depositFlowApprovedDeltaCopy"),
  approvedPeakValue: document.getElementById("depositFlowApprovedPeakValue"),
  approvedPeakCopy: document.getElementById("depositFlowApprovedPeakCopy"),
  cumulativeSvg: document.getElementById("depositFlowCumulativeSvg"),
  cumulativeAxis: document.getElementById("depositFlowCumulativeAxis"),
  cumulativeLastValue: document.getElementById("depositFlowCumulativeLastValue"),
  cumulativeLastCopy: document.getElementById("depositFlowCumulativeLastCopy"),
  cumulativeDeltaValue: document.getElementById("depositFlowCumulativeDeltaValue"),
  cumulativeDeltaCopy: document.getElementById("depositFlowCumulativeDeltaCopy"),
  cumulativePeakValue: document.getElementById("depositFlowCumulativePeakValue"),
  cumulativePeakCopy: document.getElementById("depositFlowCumulativePeakCopy"),
  methodsSvg: document.getElementById("depositFlowMethodsSvg"),
  methodsAxis: document.getElementById("depositFlowMethodsAxis"),
  rejectsSvg: document.getElementById("depositFlowRejectsSvg"),
  rejectsAxis: document.getElementById("depositFlowRejectsAxis"),
  tableBody: document.getElementById("depositFlowTableBody"),
  tableNote: document.getElementById("depositFlowTableNote"),
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

function formatHtg(value) {
  return `${formatInt(value)} HTG`;
}

function formatPercent(value) {
  return `${clampPercent(value).toFixed(1)}%`;
}

function formatSignedInt(value) {
  const num = safeInt(value);
  return `${num > 0 ? "+" : ""}${formatInt(num)}`;
}

function formatSignedHtg(value) {
  return `${formatSignedInt(value)} HTG`;
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
  dom.granularity.value = ["hour", "day", "week"].includes(granularity) ? granularity : "day";
  dom.windowBadge.textContent = `Fenetre ${rangeDays} jour${rangeDays > 1 ? "s" : ""} · ${granularity === "hour" ? "horaire" : granularity === "week" ? "hebdomadaire" : "journaliere"}`;
}

function renderSummary(snapshot = null) {
  const summary = snapshot?.summary || {};
  const defs = snapshot?.definitions || {};

  dom.requestedValue.textContent = formatHtg(summary.requestedHtg);
  dom.requestedCopy.textContent = `${formatInt(summary.requestedCount)} demandes reelles ont ete lues sur cette fenetre.`;

  dom.approvedValue.textContent = formatHtg(summary.approvedHtg);
  dom.approvedCopy.textContent = `${formatInt(summary.approvedCount)} depots ont ete approuves et entrent dans l'entreprise.`;

  dom.rejectedValue.textContent = formatHtg(summary.rejectedHtg);
  dom.rejectedCopy.textContent = `${formatInt(summary.rejectedCount)} demandes ont ete rejetees sur cette fenetre.`;

  dom.approvalRateValue.textContent = formatPercent(summary.approvedRatePct);
  dom.approvalRateCopy.textContent = `${formatPercent(summary.rejectedRatePct)} des montants demandes ont fini rejetes.`;

  dom.moncashValue.textContent = formatHtg(summary.moncashApprovedHtg);
  dom.moncashCopy.textContent = `${formatInt(summary.moncashApprovedCount)} validations MonCash, soit ${formatPercent(summary.moncashApprovedSharePct)} du flux approuve.`;

  dom.natcashValue.textContent = formatHtg(summary.natcashApprovedHtg);
  dom.natcashCopy.textContent = `${formatInt(summary.natcashApprovedCount)} validations NatCash, soit ${formatPercent(summary.natcashApprovedSharePct)} du flux approuve.`;

  dom.pendingValue.textContent = formatHtg(summary.pendingHtg);
  dom.moncashShareValue.textContent = formatPercent(summary.moncashApprovedSharePct);
  dom.natcashShareValue.textContent = formatPercent(summary.natcashApprovedSharePct);

  dom.highlightsCopy.textContent = `${formatHtg(summary.approvedHtg)} ont ete approuves sur la fenetre, contre ${formatHtg(summary.rejectedHtg)} rejetes. MonCash pese ${formatPercent(summary.moncashApprovedSharePct)} du flux valide et NatCash ${formatPercent(summary.natcashApprovedSharePct)}.`;
  dom.definitionsCopy.textContent = `${String(defs.inflowRule || "")} ${String(defs.rejectionRule || "")}`.trim();

  dom.scanBadge.textContent = snapshot?.truncated
    ? `Source: orders · tronque a ${formatInt(snapshot.scanLimit)} docs`
    : `Source: orders · ${formatInt(snapshot.scannedOrderDocs)} depots lus`;
}

function renderChartInsights(config = {}) {
  const points = Array.isArray(config.points) ? config.points : [];
  const valueNode = config.valueNode;
  const valueCopyNode = config.valueCopyNode;
  const deltaNode = config.deltaNode;
  const deltaCopyNode = config.deltaCopyNode;
  const peakNode = config.peakNode;
  const peakCopyNode = config.peakCopyNode;
  const formatter = typeof config.formatter === "function" ? config.formatter : formatInt;
  const signedFormatter = typeof config.signedFormatter === "function" ? config.signedFormatter : formatSignedInt;

  if (!valueNode || !valueCopyNode || !deltaNode || !deltaCopyNode || !peakNode || !peakCopyNode) return;

  if (!points.length) {
    valueNode.textContent = "-";
    valueCopyNode.textContent = "Aucune donnee visible sur cette fenetre.";
    deltaNode.textContent = "-";
    deltaNode.className = "";
    deltaCopyNode.textContent = "Pas encore de momentum mesurable.";
    peakNode.textContent = "-";
    peakCopyNode.textContent = "Pas de point haut detecte.";
    return;
  }

  const lastPoint = points[points.length - 1] || null;
  const previousPoint = points.length > 1 ? points[points.length - 2] : null;
  const peakPoint = points.reduce((best, item) => {
    if (!best) return item;
    return safeFloat(item.value) > safeFloat(best.value) ? item : best;
  }, null);
  const delta = lastPoint ? (safeFloat(lastPoint.value) - safeFloat(previousPoint?.value || 0)) : 0;

  valueNode.textContent = formatter(lastPoint?.value || 0);
  valueCopyNode.textContent = `Derniere lecture: ${String(lastPoint?.label || "-")}.`;

  if (!previousPoint) {
    deltaNode.textContent = signedFormatter(delta);
    deltaNode.className = "tone-neutral";
    deltaCopyNode.textContent = "Pas assez de recul pour comparer au bucket precedent.";
  } else {
    deltaNode.textContent = signedFormatter(delta);
    deltaNode.className = delta > 0 ? "tone-positive" : delta < 0 ? "tone-negative" : "tone-neutral";
    deltaCopyNode.textContent = `Variation vs ${String(previousPoint.label || "-")}.`;
  }

  peakNode.textContent = formatter(peakPoint?.value || 0);
  peakCopyNode.textContent = `Sommet visible atteint sur ${String(peakPoint?.label || "-")}.`;
}

function renderLineChart(options = {}) {
  const points = Array.isArray(options.points) ? options.points : [];
  const svg = options.svg;
  const axis = options.axis;
  const tone = String(options.tone || "sky");
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

  const plotted = points.map((item, index) => ({ ...item, x: toX(index), y: toY(item.value) }));
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
  const gradientId = `depositFlowGradient-${tone}`;

  svg.innerHTML = `
    <defs>
      <linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--${tone})" stop-opacity="0.42"></stop>
        <stop offset="100%" stop-color="var(--${tone})" stop-opacity="0"></stop>
      </linearGradient>
    </defs>
    ${gridLines}
    <line class="baseline" x1="${padLeft}" y1="${baselineY.toFixed(1)}" x2="${width - padRight}" y2="${baselineY.toFixed(1)}"></line>
    <path class="chart-area" fill="url(#${gradientId})" d="${areaPath}"></path>
    <polyline class="chart-line ${tone}" points="${linePoints}"></polyline>
    <circle class="chart-dot ${tone}" cx="${lastPoint.x.toFixed(1)}" cy="${lastPoint.y.toFixed(1)}" r="5.5"></circle>
  `;

  const middle = points[Math.floor(points.length / 2)] || points[0];
  axis.innerHTML = `
    <span>${escapeHtml(points[0]?.label || "-")}</span>
    <span>${escapeHtml(middle?.label || "-")}</span>
    <span>${escapeHtml(points[points.length - 1]?.label || "-")}</span>
  `;
}

function renderDualLineChart(options = {}) {
  const primary = Array.isArray(options.primary) ? options.primary : [];
  const secondary = Array.isArray(options.secondary) ? options.secondary : [];
  const svg = options.svg;
  const axis = options.axis;
  const primaryTone = String(options.primaryTone || "amber");
  const secondaryTone = String(options.secondaryTone || "violet");
  const emptyLabel = String(options.emptyLabel || "Pas assez de points pour tracer cette comparaison.");

  if (!svg || !axis) return;
  if (!primary.length && !secondary.length) {
    svg.innerHTML = `<text x="50%" y="50%" text-anchor="middle" fill="rgba(226,232,240,0.75)" font-size="16">${escapeHtml(emptyLabel)}</text>`;
    axis.innerHTML = `<span>-</span><span>-</span><span>-</span>`;
    return;
  }

  const points = primary.length ? primary : secondary;
  const width = 760;
  const height = 260;
  const padLeft = 16;
  const padRight = 16;
  const padTop = 18;
  const padBottom = 20;
  const chartWidth = width - padLeft - padRight;
  const chartHeight = height - padTop - padBottom;
  const values = [
    ...primary.map((item) => safeFloat(item.value)),
    ...secondary.map((item) => safeFloat(item.value)),
  ];
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
  const gridLines = [0.2, 0.4, 0.6, 0.8].map((ratio) => {
    const y = padTop + (chartHeight * ratio);
    return `<line class="grid-line" x1="${padLeft}" y1="${y.toFixed(1)}" x2="${width - padRight}" y2="${y.toFixed(1)}"></line>`;
  }).join("");
  const baselineY = toY(Math.min(0, minValue));

  const buildPolyline = (series, tone) => {
    if (!series.length) return "";
    const plotted = series.map((item, index) => ({
      x: toX(index),
      y: toY(item.value),
    }));
    const linePoints = plotted.map((item) => `${item.x.toFixed(1)},${item.y.toFixed(1)}`).join(" ");
    const lastPoint = plotted[plotted.length - 1];
    return `
      <polyline class="chart-line ${tone}" points="${linePoints}"></polyline>
      <circle class="chart-dot ${tone}" cx="${lastPoint.x.toFixed(1)}" cy="${lastPoint.y.toFixed(1)}" r="4.8"></circle>
    `;
  };

  svg.innerHTML = `
    ${gridLines}
    <line class="baseline" x1="${padLeft}" y1="${baselineY.toFixed(1)}" x2="${width - padRight}" y2="${baselineY.toFixed(1)}"></line>
    ${buildPolyline(primary, primaryTone)}
    ${buildPolyline(secondary, secondaryTone)}
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
    dom.tableBody.innerHTML = `<tr><td colspan="8" class="empty-copy">Aucun depot trouve sur cette fenetre.</td></tr>`;
    dom.tableNote.textContent = "Change la periode si tu veux analyser un autre flux.";
    return;
  }

  dom.tableBody.innerHTML = buckets.map((bucket) => `
    <tr>
      <td>${escapeHtml(bucket.label || "-")}</td>
      <td>${formatHtg(bucket.requestedHtg)}</td>
      <td>${formatHtg(bucket.approvedHtg)}</td>
      <td>${formatHtg(bucket.rejectedHtg)}</td>
      <td>${formatPercent(bucket.approvalRatePct)}</td>
      <td>${formatHtg(bucket.moncashApprovedHtg)}</td>
      <td>${formatHtg(bucket.natcashApprovedHtg)}</td>
      <td>${formatHtg(bucket.cumulativeApprovedHtg)}</td>
    </tr>
  `).join("");

  dom.tableNote.textContent = snapshot?.truncated
    ? `Le snapshot a ete tronque apres ${formatInt(snapshot.scanLimit)} depots lus pour proteger les couts Firestore.`
    : `${formatInt(snapshot.scannedOrderDocs)} depots de la periode ont ete lus directement depuis les sous-collections orders.`;
}

function renderSnapshot(snapshot = null) {
  state.snapshot = snapshot;
  syncWindowUi(snapshot);
  renderSummary(snapshot);

  renderLineChart({
    points: snapshot?.series?.approvedHtg || [],
    svg: dom.approvedSvg,
    axis: dom.approvedAxis,
    tone: "emerald",
    emptyLabel: "Pas encore assez de depots approuves sur cette periode pour tracer une courbe utile.",
  });
  renderChartInsights({
    points: snapshot?.series?.approvedHtg || [],
    valueNode: dom.approvedLastValue,
    valueCopyNode: dom.approvedLastCopy,
    deltaNode: dom.approvedDeltaValue,
    deltaCopyNode: dom.approvedDeltaCopy,
    peakNode: dom.approvedPeakValue,
    peakCopyNode: dom.approvedPeakCopy,
    formatter: formatHtg,
    signedFormatter: formatSignedHtg,
  });

  renderLineChart({
    points: snapshot?.series?.cumulativeApprovedHtg || [],
    svg: dom.cumulativeSvg,
    axis: dom.cumulativeAxis,
    tone: "sky",
    emptyLabel: "La courbe cumulative apparaitra ici quand la periode contiendra des depots approuves.",
  });
  renderChartInsights({
    points: snapshot?.series?.cumulativeApprovedHtg || [],
    valueNode: dom.cumulativeLastValue,
    valueCopyNode: dom.cumulativeLastCopy,
    deltaNode: dom.cumulativeDeltaValue,
    deltaCopyNode: dom.cumulativeDeltaCopy,
    peakNode: dom.cumulativePeakValue,
    peakCopyNode: dom.cumulativePeakCopy,
    formatter: formatHtg,
    signedFormatter: formatSignedHtg,
  });

  renderDualLineChart({
    primary: snapshot?.series?.moncashApprovedHtg || [],
    secondary: snapshot?.series?.natcashApprovedHtg || [],
    svg: dom.methodsSvg,
    axis: dom.methodsAxis,
    primaryTone: "amber",
    secondaryTone: "violet",
    emptyLabel: "La comparaison MonCash/NatCash apparaitra ici.",
  });

  renderDualLineChart({
    primary: Array.isArray(snapshot?.series?.requestedHtg)
      ? snapshot.series.requestedHtg
      : [],
    secondary: Array.isArray(snapshot?.series?.rejectedHtg)
      ? snapshot.series.rejectedHtg
      : [],
    svg: dom.rejectsSvg,
    axis: dom.rejectsAxis,
    primaryTone: "sky",
    secondaryTone: "danger",
    emptyLabel: "La comparaison demande/rejete apparaitra ici.",
  });

  renderBuckets(snapshot);
}

async function loadSnapshot() {
  const payload = getSelectedPayload();
  setLoading(true);
  setStatus("Chargement des flux depots...");
  try {
    const response = await getDepositMethodAnalyticsSnapshotSecure(payload);
    const snapshot = response?.snapshot || null;
    renderSnapshot(snapshot);
    setStatus("Snapshot depots charge.", "success");
  } catch (error) {
    console.error("[DEPOSIT_FLOW_V2] load failed", error);
    setStatus(error?.message || "Impossible de charger les analytics de depots.", "error");
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
    title: "Flux depots",
    description: "Connecte-toi avec le compte administrateur autorise pour consulter le flux des depots.",
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

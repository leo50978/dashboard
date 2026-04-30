import { ensureFinanceDashboardSession } from "./dashboard-admin-auth.js";
import { getTransferAnalyticsSecure } from "./secure-functions.js";

const dom = {
  status: document.getElementById("transferDashboardStatus"),
  refreshBtn: document.getElementById("transferDashboardRefreshBtn"),
  applyBtn: document.getElementById("transferDashboardApplyBtn"),
  todayBtn: document.getElementById("transferDashboardTodayBtn"),
  startDate: document.getElementById("transferDashboardStartDate"),
  endDate: document.getElementById("transferDashboardEndDate"),
  count: document.getElementById("transferDashboardCount"),
  gross: document.getElementById("transferDashboardGross"),
  net: document.getElementById("transferDashboardNet"),
  fee: document.getElementById("transferDashboardFee"),
  grossChart: document.getElementById("transferDashboardGrossChart"),
  countChart: document.getElementById("transferDashboardCountChart"),
  recentList: document.getElementById("transferDashboardRecentList"),
  empty: document.getElementById("transferDashboardEmpty"),
};

function safeInt(value) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.trunc(num) : 0;
}

function formatInt(value) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(safeInt(value));
}

function formatHtg(value) {
  return `${formatInt(value)} HTG`;
}

function formatDateTime(ms) {
  const safeMs = safeInt(ms);
  if (!safeMs) return "-";
  return new Date(safeMs).toLocaleString("fr-FR");
}

function formatDateShort(key = "") {
  const text = String(key || "").trim();
  if (!text) return "-";
  const [year, month, day] = text.split("-");
  if (!year || !month || !day) return text;
  return `${day}/${month}`;
}

function escapeHtml(value = "") {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setStatus(text, tone = "neutral") {
  if (!dom.status) return;
  dom.status.textContent = String(text || "");
  dom.status.dataset.tone = tone;
}

function localDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function parseDateKey(value) {
  const text = String(value || "").trim();
  if (!text) return 0;
  const [year, month, day] = text.split("-").map((part) => Number(part));
  if (!year || !month || !day) return 0;
  const date = new Date(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function renderChart(svg, series = [], { color = "#68d7ff", label = "HTG" } = {}) {
  if (!svg) return;
  if (!Array.isArray(series) || series.length === 0) {
    svg.innerHTML = `
      <rect x="0" y="0" width="720" height="240" fill="rgba(255,255,255,0.02)"></rect>
      <line x1="0" y1="194" x2="720" y2="194" stroke="rgba(255,255,255,0.08)" stroke-width="1"></line>
      <text x="24" y="36" fill="rgba(255,255,255,0.58)" font-size="14">Aucune donnée pour ce filtre.</text>
    `;
    return;
  }

  const width = 720;
  const height = 240;
  const leftPad = 28;
  const rightPad = 20;
  const topPad = 24;
  const bottomPad = 36;
  const chartWidth = width - leftPad - rightPad;
  const chartHeight = height - topPad - bottomPad;
  const values = series.map((item) => Math.max(0, safeInt(item.value)));
  const maxValue = Math.max(...values, 1);
  const points = values.map((value, index) => {
    const x = leftPad + (series.length === 1 ? chartWidth / 2 : (index * chartWidth) / (series.length - 1));
    const y = topPad + chartHeight - ((value / maxValue) * chartHeight);
    return { x, y, value, label: String(series[index]?.label || "") };
  });
  const linePath = points.map((point) => `${point.x},${point.y}`).join(" ");
  const areaPath = [
    `M ${points[0].x} ${topPad + chartHeight}`,
    ...points.map((point) => `L ${point.x} ${point.y}`),
    `L ${points[points.length - 1].x} ${topPad + chartHeight}`,
    "Z",
  ].join(" ");
  const labels = points.map((point) => `
    <text x="${point.x}" y="${height - 10}" text-anchor="middle" fill="rgba(255,255,255,0.58)" font-size="12">${escapeHtml(point.label)}</text>
  `).join("");
  const markers = points.map((point) => `
    <circle cx="${point.x}" cy="${point.y}" r="4" fill="${color}"></circle>
  `).join("");

  svg.innerHTML = `
    <defs>
      <linearGradient id="transferChartFill" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color="rgba(104,215,255,0.28)"></stop>
        <stop offset="100%" stop-color="rgba(104,215,255,0.02)"></stop>
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="${width}" height="${height}" fill="rgba(255,255,255,0.02)"></rect>
    <line x1="${leftPad}" y1="${topPad + chartHeight}" x2="${width - rightPad}" y2="${topPad + chartHeight}" stroke="rgba(255,255,255,0.08)" stroke-width="1"></line>
    <path d="${areaPath}" fill="url(#transferChartFill)"></path>
    <polyline points="${linePath}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></polyline>
    ${markers}
    ${labels}
    <text x="${width - 20}" y="22" text-anchor="end" fill="rgba(255,255,255,0.52)" font-size="12">${escapeHtml(label)}</text>
  `;
}

function renderSummary(data = {}) {
  const totals = data?.totals || {};
  if (dom.count) dom.count.textContent = formatInt(totals.transferCount);
  if (dom.gross) dom.gross.textContent = formatHtg(totals.grossAmountHtg);
  if (dom.net) dom.net.textContent = formatHtg(totals.netAmountHtg);
  if (dom.fee) dom.fee.textContent = formatHtg(totals.feeHtg);
}

function renderRecentTransfers(items = []) {
  if (!dom.recentList || !dom.empty) return;
  if (!Array.isArray(items) || items.length === 0) {
    dom.recentList.innerHTML = "";
    dom.empty.style.display = "block";
    return;
  }

  dom.empty.style.display = "none";
  dom.recentList.innerHTML = items.map((item) => {
    const when = item.createdAtMs ? formatDateTime(item.createdAtMs) : "-";
    return `
      <article class="item">
        <div class="item-head">
          <div>
            <div class="item-title">${escapeHtml(formatHtg(item.grossAmountHtg))}</div>
            <div class="item-sub">
              ${escapeHtml(item.senderName || item.senderUsername || item.senderUid || "-")}
              →
              ${escapeHtml(item.recipientName || item.recipientUsername || item.recipientUid || "-")}
            </div>
          </div>
          <span class="pill ${item.direction === "received" ? "good" : "warn"}">${escapeHtml(item.direction === "received" ? "Reçu" : "Envoyé")}</span>
        </div>
        <div class="item-sub">Net: ${escapeHtml(formatHtg(item.netAmountHtg))} · Frais: ${escapeHtml(formatHtg(item.feeHtg))} · ${escapeHtml(when)}</div>
      </article>
    `;
  }).join("");
}

async function loadDashboard() {
  const startDate = String(dom.startDate?.value || "").trim();
  const endDate = String(dom.endDate?.value || "").trim();
  const startMs = parseDateKey(startDate);
  const endMs = parseDateKey(endDate) + (24 * 60 * 60 * 1000 - 1);

  setStatus("Chargement des transferts...", "neutral");
  try {
    const result = await getTransferAnalyticsSecure({
      startMs,
      endMs,
    });
    const daily = Array.isArray(result?.daily) ? result.daily : [];
    const grossSeries = daily.map((item) => ({ label: formatDateShort(item.dateKey), value: item.grossAmountHtg }));
    const countSeries = daily.map((item) => ({ label: formatDateShort(item.dateKey), value: item.transferCount }));

    renderSummary(result);
    renderChart(dom.grossChart, grossSeries, { color: "#68d7ff", label: "Montant brut HTG" });
    renderChart(dom.countChart, countSeries, { color: "#4be7b8", label: "Nombre de transferts" });
    renderRecentTransfers(Array.isArray(result?.recentTransfers) ? result.recentTransfers : []);

    const range = result?.range || {};
    setStatus(`Plage chargée du ${formatDateShort(range.startDateKey)} au ${formatDateShort(range.endDateKey)}.`, "success");
  } catch (error) {
    renderSummary({ totals: { transferCount: 0, grossAmountHtg: 0, netAmountHtg: 0, feeHtg: 0 } });
    renderChart(dom.grossChart, [], { color: "#68d7ff", label: "Montant brut HTG" });
    renderChart(dom.countChart, [], { color: "#4be7b8", label: "Nombre de transferts" });
    renderRecentTransfers([]);
    setStatus(error?.message || "Impossible de charger le dashboard transferts.", "error");
  }
}

function setTodayRange() {
  const today = localDateKey(new Date());
  if (dom.startDate) dom.startDate.value = today;
  if (dom.endDate) dom.endDate.value = today;
}

async function init() {
  await ensureFinanceDashboardSession({ fallbackUrl: "./auth.html" });
  setTodayRange();

  dom.refreshBtn?.addEventListener("click", () => void loadDashboard());
  dom.applyBtn?.addEventListener("click", () => void loadDashboard());
  dom.todayBtn?.addEventListener("click", async () => {
    setTodayRange();
    await loadDashboard();
  });
  dom.startDate?.addEventListener("change", () => void loadDashboard());
  dom.endDate?.addEventListener("change", () => void loadDashboard());

  await loadDashboard();
}

void init();

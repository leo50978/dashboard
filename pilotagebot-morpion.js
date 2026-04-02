import { ensureFinanceDashboardSession } from "./dashboard-admin-auth.js";
import { getMorpionPilotSnapshotSecure, setMorpionPilotControlSecure } from "./secure-functions.js";

const LIVE_REFRESH_INTERVAL_MS = 45 * 1000;

const dom = {
  adminEmail: document.getElementById("morpionPilotAdminEmail"),
  modeValue: document.getElementById("morpionPilotModeValue"),
  modeCopy: document.getElementById("morpionPilotModeCopy"),
  netValue: document.getElementById("morpionPilotNetValue"),
  netCopy: document.getElementById("morpionPilotNetCopy"),
  marginValue: document.getElementById("morpionPilotMarginValue"),
  marginCopy: document.getElementById("morpionPilotMarginCopy"),
  roomsValue: document.getElementById("morpionPilotRoomsValue"),
  roomsCopy: document.getElementById("morpionPilotRoomsCopy"),
  humanOnlyValue: document.getElementById("morpionPilotHumanOnlyValue"),
  humanOnlyCopy: document.getElementById("morpionPilotHumanOnlyCopy"),
  withBotValue: document.getElementById("morpionPilotWithBotValue"),
  withBotCopy: document.getElementById("morpionPilotWithBotCopy"),
  windowSelect: document.getElementById("morpionPilotWindowSelect"),
  modeManualBtn: document.getElementById("morpionPilotModeManualBtn"),
  modeAutoBtn: document.getElementById("morpionPilotModeAutoBtn"),
  allowHumanBtn: document.getElementById("morpionPilotAllowHumanBtn"),
  forceBotBtn: document.getElementById("morpionPilotForceBotBtn"),
  applyBtn: document.getElementById("morpionPilotApplyBtn"),
  bandBadge: document.getElementById("morpionPilotBandBadge"),
  routingBadge: document.getElementById("morpionPilotRoutingBadge"),
  reasonCopy: document.getElementById("morpionPilotReasonCopy"),
  fetchMeta: document.getElementById("morpionPilotFetchMeta"),
  equitySvg: document.getElementById("morpionPilotEquitySvg"),
  equityAxis: document.getElementById("morpionPilotEquityAxis"),
  trendList: document.getElementById("morpionPilotTrendList"),
  mixGrid: document.getElementById("morpionPilotMixGrid"),
};

const state = {
  mode: "manual",
  window: "today",
  manualForceBotOnly: false,
  autoHumanOnlyEnabled: true,
  appliedHumanOnlyEnabled: true,
  snapshot: null,
  loading: false,
};

let liveRefreshTimer = 0;

function safeInt(value) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.trunc(num) : 0;
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

function formatSignedDoes(value) {
  const num = safeInt(value);
  return `${num > 0 ? "+" : ""}${formatInt(num)} Does`;
}

function formatPercent(value) {
  return `${(safeFloat(value) * 100).toFixed(1)}%`;
}

function formatDateTime(ms = 0) {
  if (!ms) return "-";
  return new Date(ms).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

function modeLabel(mode = "") {
  return String(mode || "").toLowerCase() === "auto" ? "Automatique" : "Manuel";
}

function reasonLabel(reason = "") {
  const normalized = String(reason || "").trim().toLowerCase();
  if (normalized === "negative_net") return "Profit net negatif: fermeture temporaire du mode 2 humains pour proteger la marge.";
  if (normalized === "margin_too_low") return "Marge trop faible: le systeme bascule en defense avec plus de matchs contre bot.";
  if (normalized === "drawdown_critical") return "Drawdown critique: protection active sur Morpion pour stabiliser la courbe.";
  if (normalized === "too_many_human_rooms") return "Trop de salles 2 humains avec marge fragile: fermeture temporaire du 2 humains.";
  if (normalized === "low_volume") return "Volume encore faible: le systeme laisse le mode normal en attendant plus de donnees.";
  if (normalized === "profit_ok") return "Profit sain: le mode 2 humains reste ouvert sur Morpion.";
  return "Pilotage Morpion en cours de recalibrage.";
}

function bandMeta(band = "") {
  const normalized = String(band || "").trim().toLowerCase();
  if (normalized === "danger") return { label: "Danger", tone: "danger" };
  if (normalized === "defense") return { label: "Defense", tone: "defense" };
  if (normalized === "comfort") return { label: "Confort", tone: "comfort" };
  return { label: "Neutre", tone: "neutral" };
}

function setLoading(loading) {
  state.loading = loading === true;
  dom.applyBtn.disabled = state.loading;
  dom.modeManualBtn.disabled = state.loading;
  dom.modeAutoBtn.disabled = state.loading;
  dom.allowHumanBtn.disabled = state.loading || state.mode === "auto";
  dom.forceBotBtn.disabled = state.loading || state.mode === "auto";
  dom.windowSelect.disabled = state.loading;
}

function updateControls() {
  const isAuto = state.mode === "auto";
  dom.modeManualBtn.classList.toggle("is-active", !isAuto);
  dom.modeAutoBtn.classList.toggle("is-active", isAuto);
  dom.allowHumanBtn.classList.toggle("is-active", !state.manualForceBotOnly);
  dom.forceBotBtn.classList.toggle("is-active", state.manualForceBotOnly);
  dom.windowSelect.value = state.window;
  dom.modeValue.textContent = modeLabel(state.mode);
  dom.modeCopy.textContent = isAuto
    ? "Le routage Morpion suit automatiquement le signal profit."
    : (state.manualForceBotOnly
      ? "Mode manuel: Morpion force temporairement humain vs bot."
      : "Mode manuel: Morpion autorise 2 humains.");
}

function renderEquityCurve(snapshot = null) {
  const points = Array.isArray(snapshot?.equityCurve) ? snapshot.equityCurve : [];
  if (!dom.equitySvg || !dom.equityAxis) return;

  if (points.length < 2) {
    dom.equitySvg.innerHTML = `
      <defs>
        <linearGradient id="morpionPilotEquityGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#34d399" stop-opacity="0.38"></stop>
          <stop offset="100%" stop-color="#34d399" stop-opacity="0"></stop>
        </linearGradient>
      </defs>
      <text x="50%" y="50%" text-anchor="middle" fill="rgba(226,232,240,0.75)" font-size="16">
        Pas assez de donnees pour tracer la courbe.
      </text>
    `;
    dom.equityAxis.innerHTML = "<span>-</span><span>-</span><span>-</span>";
    return;
  }

  const width = 720;
  const height = 240;
  const padLeft = 16;
  const padRight = 16;
  const padTop = 18;
  const padBottom = 20;
  const chartWidth = width - padLeft - padRight;
  const chartHeight = height - padTop - padBottom;
  const values = points.map((item) => safeInt(item.equityDoes));
  const allValues = [...values, 0, safeInt(snapshot?.highWaterMarkDoes)];
  let minValue = Math.min(...allValues);
  let maxValue = Math.max(...allValues);
  if (minValue === maxValue) {
    maxValue += 1;
    minValue -= 1;
  }
  const toX = (index) => padLeft + ((chartWidth * index) / Math.max(points.length - 1, 1));
  const toY = (value) => {
    const normalized = (safeFloat(value) - minValue) / Math.max(maxValue - minValue, 1);
    return padTop + (chartHeight - (normalized * chartHeight));
  };
  const zeroY = toY(0);
  const plotted = points.map((item, index) => ({
    ...item,
    x: toX(index),
    y: toY(item.equityDoes),
  }));
  const linePoints = plotted.map((item) => `${item.x.toFixed(1)},${item.y.toFixed(1)}`).join(" ");
  const firstPoint = plotted[0];
  const lastPoint = plotted[plotted.length - 1];
  const areaPath = [
    `M ${firstPoint.x.toFixed(1)} ${zeroY.toFixed(1)}`,
    ...plotted.map((item) => `L ${item.x.toFixed(1)} ${item.y.toFixed(1)}`),
    `L ${lastPoint.x.toFixed(1)} ${zeroY.toFixed(1)}`,
    "Z",
  ].join(" ");
  const gridLines = [0.25, 0.5, 0.75].map((ratio) => {
    const y = padTop + (chartHeight * ratio);
    return `<line class="equity-grid-line" x1="${padLeft}" y1="${y.toFixed(1)}" x2="${width - padRight}" y2="${y.toFixed(1)}"></line>`;
  }).join("");

  dom.equitySvg.innerHTML = `
    <defs>
      <linearGradient id="morpionPilotEquityGradient" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#34d399" stop-opacity="0.38"></stop>
        <stop offset="100%" stop-color="#34d399" stop-opacity="0"></stop>
      </linearGradient>
    </defs>
    ${gridLines}
    <line class="equity-zero-line" x1="${padLeft}" y1="${zeroY.toFixed(1)}" x2="${width - padRight}" y2="${zeroY.toFixed(1)}"></line>
    <path class="equity-area" d="${areaPath}"></path>
    <polyline class="equity-line" points="${linePoints}"></polyline>
    <circle class="equity-dot" cx="${lastPoint.x.toFixed(1)}" cy="${lastPoint.y.toFixed(1)}" r="6"></circle>
  `;

  const middlePoint = points[Math.floor(points.length / 2)] || points[0];
  dom.equityAxis.innerHTML = `
    <span>${points[0]?.label || "-"}</span>
    <span>${middlePoint?.label || "-"}</span>
    <span>${points[points.length - 1]?.label || "-"}</span>
  `;
}

function renderTrend(snapshot = null) {
  const trend = Array.isArray(snapshot?.trend) ? snapshot.trend : [];
  if (!trend.length) {
    dom.trendList.innerHTML = `<p class="empty-copy">Aucune tranche disponible.</p>`;
    return;
  }
  const maxAbs = Math.max(1, ...trend.map((item) => Math.abs(safeInt(item.netDoes))));
  dom.trendList.innerHTML = trend
    .slice()
    .reverse()
    .map((item) => {
      const value = safeInt(item.netDoes);
      const width = Math.max(4, Math.round((Math.abs(value) / maxAbs) * 100));
      const polarity = value >= 0 ? "positive" : "negative";
      return `
        <div class="trend-row">
          <strong>${item.label || "-"}</strong>
          <div class="trend-track"><span class="trend-bar ${polarity}" style="width:${width}%"></span></div>
          <strong class="${polarity}">${formatSignedDoes(value)}</strong>
        </div>
      `;
    })
    .join("");
}

function renderMix(snapshot = null) {
  const rooms = Math.max(1, safeInt(snapshot?.roomsCount));
  const items = [
    {
      label: "2 humains",
      count: safeInt(snapshot?.humanOnlyRooms),
      ratio: safeFloat(snapshot?.humanOnlySharePct),
      net: safeInt(snapshot?.netDoes) * safeFloat(snapshot?.humanOnlySharePct),
    },
    {
      label: "1 humain + 1 bot",
      count: safeInt(snapshot?.withBotRooms),
      ratio: safeFloat(snapshot?.withBotSharePct),
      net: safeInt(snapshot?.netDoes) * safeFloat(snapshot?.withBotSharePct),
    },
  ];
  dom.mixGrid.innerHTML = items.map((item) => {
    const width = Math.max(4, Math.round((safeInt(item.count) / rooms) * 100));
    const polarity = safeInt(item.net) >= 0 ? "positive" : "negative";
    return `
      <article class="mix-card">
        <div class="mix-head">
          <strong>${item.label}</strong>
          <strong>${formatInt(item.count)} salles</strong>
        </div>
        <div class="mix-track"><span class="mix-fill ${polarity}" style="width:${width}%"></span></div>
        <div class="mix-inline">${formatPercent(item.ratio)} du volume Morpion</div>
      </article>
    `;
  }).join("");
}

function render(snapshot = null) {
  const s = snapshot || {};
  state.snapshot = s;

  dom.netValue.textContent = formatSignedDoes(s.netDoes);
  dom.marginValue.textContent = formatPercent(s.marginPct);
  dom.roomsValue.textContent = formatInt(s.roomsCount);
  dom.humanOnlyValue.textContent = formatInt(s.humanOnlyRooms);
  dom.withBotValue.textContent = formatInt(s.withBotRooms);

  dom.netCopy.textContent = `Encaisse: ${formatDoes(s.collectedDoes)} · Payout: ${formatDoes(s.payoutDoes)}`;
  dom.marginCopy.textContent = `Drawdown: ${formatPercent(s.drawdownPct)} · Equity: ${formatSignedDoes(s.currentEquityDoes)}`;
  dom.roomsCopy.textContent = `Fenetre ${state.window} · Snapshot ${formatDateTime(s.computedAtMs)}`;
  dom.humanOnlyCopy.textContent = `${formatPercent(s.humanOnlySharePct)} du trafic Morpion`;
  dom.withBotCopy.textContent = `${formatPercent(s.withBotSharePct)} du trafic Morpion`;

  const band = bandMeta(s.recommendedBand);
  dom.bandBadge.textContent = `Bande ${band.label}`;
  dom.bandBadge.dataset.tone = band.tone;

  dom.routingBadge.textContent = state.appliedHumanOnlyEnabled
    ? "Routage: 2 humains autorise"
    : "Routage: bot prioritaire";
  dom.routingBadge.dataset.tone = state.appliedHumanOnlyEnabled ? "comfort" : "danger";

  dom.reasonCopy.textContent = reasonLabel(s.recommendedReason);
  dom.fetchMeta.textContent = `Debut: ${formatDateTime(s.startMs)} · Fin: ${formatDateTime(s.endMs)} · fetchLimit: ${formatInt(s.fetchLimit)}`;

  renderEquityCurve(s);
  renderTrend(s);
  renderMix(s);
}

async function refreshMorpionPilot({ silent = false } = {}) {
  if (!silent) setLoading(true);
  try {
    const response = await getMorpionPilotSnapshotSecure({ window: state.window });
    state.mode = String(response?.mode || state.mode) === "auto" ? "auto" : "manual";
    state.window = String(response?.window || state.window);
    state.manualForceBotOnly = response?.manualForceBotOnly === true;
    state.autoHumanOnlyEnabled = response?.autoHumanOnlyEnabled !== false;
    state.appliedHumanOnlyEnabled = response?.appliedHumanOnlyEnabled !== false;
    updateControls();
    render(response?.snapshot || {});
  } catch (error) {
    console.error("[MORPION_PILOT] refresh error", error);
    dom.reasonCopy.textContent = `Erreur chargement: ${String(error?.message || error)}`;
  } finally {
    if (!silent) setLoading(false);
  }
}

async function applyControls() {
  setLoading(true);
  try {
    await setMorpionPilotControlSecure({
      mode: state.mode,
      window: state.window,
      manualForceBotOnly: state.manualForceBotOnly,
    });
    await refreshMorpionPilot({ silent: true });
  } catch (error) {
    console.error("[MORPION_PILOT] apply error", error);
    dom.reasonCopy.textContent = `Erreur application: ${String(error?.message || error)}`;
  } finally {
    setLoading(false);
  }
}

function bindEvents() {
  dom.modeManualBtn.addEventListener("click", () => {
    state.mode = "manual";
    updateControls();
  });
  dom.modeAutoBtn.addEventListener("click", () => {
    state.mode = "auto";
    updateControls();
  });
  dom.allowHumanBtn.addEventListener("click", () => {
    if (state.mode === "auto") return;
    state.manualForceBotOnly = false;
    updateControls();
  });
  dom.forceBotBtn.addEventListener("click", () => {
    if (state.mode === "auto") return;
    state.manualForceBotOnly = true;
    updateControls();
  });
  dom.windowSelect.addEventListener("change", () => {
    state.window = String(dom.windowSelect.value || "today");
    void refreshMorpionPilot();
  });
  dom.applyBtn.addEventListener("click", () => {
    void applyControls();
  });
}

function startLiveRefresh() {
  if (liveRefreshTimer) window.clearInterval(liveRefreshTimer);
  liveRefreshTimer = window.setInterval(() => {
    void refreshMorpionPilot({ silent: true });
  }, LIVE_REFRESH_INTERVAL_MS);
}

async function bootstrap() {
  const session = await ensureFinanceDashboardSession({ fallbackUrl: "./Dpayment.html" });
  dom.adminEmail.textContent = session?.email || "Session admin";
  bindEvents();
  updateControls();
  await refreshMorpionPilot();
  startLiveRefresh();
}

void bootstrap();

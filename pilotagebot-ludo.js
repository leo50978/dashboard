import { ensureFinanceDashboardSession } from "./dashboard-admin-auth.js?v=20260515-ludo-pilot2";
import { getLudoBotPilotSnapshotSecure, setLudoBotPilotControlSecure } from "./secure-functions.js?v=20260515-ludo-pilot2";

const DEFAULT_LEVEL = "weak";
const LIVE_REFRESH_INTERVAL_MS = 45 * 1000;

const dom = {
  adminEmail: document.getElementById("ludoPilotAdminEmail"),
  modeValue: document.getElementById("ludoPilotModeValue"),
  modeCopy: document.getElementById("ludoPilotModeCopy"),
  netValue: document.getElementById("ludoPilotNetValue"),
  netCopy: document.getElementById("ludoPilotNetCopy"),
  marginValue: document.getElementById("ludoPilotMarginValue"),
  marginCopy: document.getElementById("ludoPilotMarginCopy"),
  roomsValue: document.getElementById("ludoPilotRoomsValue"),
  roomsCopy: document.getElementById("ludoPilotRoomsCopy"),
  windowSelect: document.getElementById("ludoPilotWindowSelect"),
  modeManualBtn: document.getElementById("ludoPilotModeManualBtn"),
  modeAutoBtn: document.getElementById("ludoPilotModeAutoBtn"),
  levelButtons: Array.from(document.querySelectorAll("#ludoPilotLevelGrid [data-level]")),
  applyBtn: document.getElementById("ludoPilotApplyBtn"),
  bandBadge: document.getElementById("ludoPilotBandBadge"),
  appliedBadge: document.getElementById("ludoPilotAppliedBadge"),
  reasonCopy: document.getElementById("ludoPilotReasonCopy"),
  fetchMeta: document.getElementById("ludoPilotFetchMeta"),
  collectedValue: document.getElementById("ludoPilotCollectedValue"),
  payoutValue: document.getElementById("ludoPilotPayoutValue"),
  equityValue: document.getElementById("ludoPilotEquityValue"),
  equityCopy: document.getElementById("ludoPilotEquityCopy"),
  peakValue: document.getElementById("ludoPilotPeakValue"),
  peakCopy: document.getElementById("ludoPilotPeakCopy"),
  drawdownValue: document.getElementById("ludoPilotDrawdownValue"),
  drawdownCopy: document.getElementById("ludoPilotDrawdownCopy"),
  winrateValue: document.getElementById("ludoPilotWinrateValue"),
  equitySvg: document.getElementById("ludoPilotEquitySvg"),
  equityAxis: document.getElementById("ludoPilotEquityAxis"),
  recoveryCopy: document.getElementById("ludoPilotRecoveryCopy"),
  trendList: document.getElementById("ludoPilotTrendList"),
  difficultyMixGrid: document.getElementById("ludoPilotDifficultyMixGrid"),
  stakeMixGrid: document.getElementById("ludoPilotStakeMixGrid"),
};

const state = {
  userEmail: "",
  mode: "manual",
  window: "today",
  manualBotDifficulty: DEFAULT_LEVEL,
  autoBotDifficulty: DEFAULT_LEVEL,
  appliedBotDifficulty: DEFAULT_LEVEL,
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

function escapeHtml(value = "") {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeLevel(value = "") {
  const level = String(value || "").trim().toLowerCase();
  if (level === "strong" || level === "fort" || level === "fo" || level === "impossible") return "strong";
  if (level === "ultra" || level === "expert" || level === "dominov1") return "strong";
  if (level === "weak" || level === "faible" || level === "amateur" || level === "userpro") return "weak";
  return DEFAULT_LEVEL;
}

function levelLabel(level = "") {
  return normalizeLevel(level) === "strong" ? "Bot fò" : "Bot fèb";
}

function modeLabel(mode = "") {
  return String(mode || "").trim().toLowerCase() === "auto" ? "Automatique" : "Manuel";
}

function bandMeta(band = "") {
  const normalized = String(band || "").trim().toLowerCase();
  if (normalized === "danger") return { label: "Danger", tone: "danger" };
  if (normalized === "defense") return { label: "Defense", tone: "defense" };
  if (normalized === "comfort") return { label: "Confort", tone: "comfort" };
  if (normalized === "neutral") return { label: "Neutre", tone: "equilibrium" };
  return { label: "Equilibre", tone: "equilibrium" };
}

function reasonLabel(reason = "") {
  const normalized = String(reason || "").trim().toLowerCase();
  if (normalized === "drawdown_critical") return "Le Ludo replonge trop fort sous son dernier sommet: le moteur force le bot fort pour stopper l'hemorragie.";
  if (normalized === "drawdown_high") return "Le Ludo reste sous son dernier pic HTG, donc le pilotage garde un mode de defense.";
  if (normalized === "margin_too_low") return "La marge Ludo est trop basse ou negative: le systeme passe sur le bot fort triche.";
  if (normalized === "margin_low") return "La marge Ludo reste fragile, donc l'auto prefere garder un bot fort.";
  if (normalized === "new_high_comfort") return "Le Ludo tient une marge confortable et reste pres du sommet: le systeme peut relacher vers le bot faible.";
  if (normalized === "no_volume") return "Pas encore assez de parties Ludo archivees: le systeme reste sur une base neutre.";
  return "Le pilotage Ludo reste dans une zone d'equilibre sans raison critique.";
}

function formatInt(value) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(safeFloat(value));
}

function formatHtg(value) {
  return `${formatInt(value)} HTG`;
}

function formatSignedHtg(value) {
  const num = safeInt(value);
  return `${num > 0 ? "+" : ""}${formatInt(num)} HTG`;
}

function formatPercent(value) {
  return `${(safeFloat(value) * 100).toFixed(1)}%`;
}

function formatDateTime(ms = 0) {
  if (!ms) return "-";
  return new Date(ms).toLocaleString("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Port-au-Prince",
  });
}

function setLoading(loading) {
  state.loading = loading === true;
  dom.applyBtn.disabled = state.loading;
  dom.modeManualBtn.disabled = state.loading;
  dom.modeAutoBtn.disabled = state.loading;
  dom.windowSelect.disabled = state.loading;
  dom.levelButtons.forEach((button) => {
    button.disabled = state.loading || state.mode === "auto";
  });
}

function updateControls() {
  const isAuto = state.mode === "auto";
  dom.modeManualBtn.classList.toggle("is-active", !isAuto);
  dom.modeAutoBtn.classList.toggle("is-active", isAuto);

  dom.levelButtons.forEach((button) => {
    const level = normalizeLevel(button.dataset.level);
    button.classList.toggle("is-active", level === state.manualBotDifficulty);
    button.setAttribute("aria-pressed", level === state.manualBotDifficulty ? "true" : "false");
    button.disabled = state.loading || isAuto;
  });

  dom.windowSelect.value = state.window;
  dom.applyBtn.textContent = isAuto ? "Appliquer le pilotage automatique Ludo" : "Appliquer le niveau manuel Ludo";
  dom.modeValue.textContent = modeLabel(state.mode);
  dom.modeCopy.textContent = isAuto
    ? `Le niveau Ludo applique suit la recommandation calculee sur ${state.window === "today" ? "la journee" : state.window}.`
    : `Le niveau Ludo reste fixe sur ${levelLabel(state.manualBotDifficulty)} tant que tu restes en manuel.`;
}

function renderEquityCurve(snapshot = null) {
  const points = Array.isArray(snapshot?.equityCurve) ? snapshot.equityCurve : [];
  if (!dom.equitySvg || !dom.equityAxis || !dom.recoveryCopy) return;

  if (points.length < 2) {
    dom.equitySvg.innerHTML = `
      <defs>
        <linearGradient id="ludoPilotEquityAreaGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.38"></stop>
          <stop offset="100%" stop-color="#38bdf8" stop-opacity="0"></stop>
        </linearGradient>
      </defs>
      <text x="50%" y="50%" text-anchor="middle" fill="rgba(226,232,240,0.75)" font-size="16">
        Pas encore assez de Ludos archives pour tracer une courbe.
      </text>
    `;
    dom.equityAxis.innerHTML = `<span>-</span><span>-</span><span>-</span>`;
    dom.recoveryCopy.textContent = "La courbe equity Ludo apparaitra ici des que le volume archive sera suffisant.";
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
  const values = points.map((item) => safeInt(item.equityHtg));
  const allValues = [...values, 0, safeInt(snapshot?.highWaterMarkHtg)];
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
  const peakY = toY(safeInt(snapshot?.highWaterMarkHtg));
  const plotted = points.map((item, index) => ({
    ...item,
    x: toX(index),
    y: toY(safeInt(item.equityHtg)),
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
      <linearGradient id="ludoPilotEquityAreaGradient" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.38"></stop>
        <stop offset="100%" stop-color="#38bdf8" stop-opacity="0"></stop>
      </linearGradient>
    </defs>
    ${gridLines}
    <line class="equity-zero-line" x1="${padLeft}" y1="${zeroY.toFixed(1)}" x2="${width - padRight}" y2="${zeroY.toFixed(1)}"></line>
    <line class="equity-peak-line" x1="${padLeft}" y1="${peakY.toFixed(1)}" x2="${width - padRight}" y2="${peakY.toFixed(1)}"></line>
    <path class="equity-area" d="${areaPath}"></path>
    <polyline class="equity-line" points="${linePoints}"></polyline>
    <circle class="equity-dot" cx="${lastPoint.x.toFixed(1)}" cy="${lastPoint.y.toFixed(1)}" r="6"></circle>
  `;

  const middlePoint = points[Math.floor(points.length / 2)] || points[0];
  dom.equityAxis.innerHTML = `
    <span>${escapeHtml(points[0]?.label || "Debut")}</span>
    <span>${escapeHtml(middlePoint?.label || "-")}</span>
    <span>${escapeHtml(points[points.length - 1]?.label || "Maintenant")}</span>
  `;

  const drawdownHtg = Math.max(0, safeInt(snapshot?.drawdownHtg));
  if (drawdownHtg <= 0) {
    dom.recoveryCopy.textContent = `Le Ludo tient actuellement son sommet sur la fenetre ${state.window}. L'auto peut relacher sans pression immediate.`;
    return;
  }
  dom.recoveryCopy.textContent = `La courbe Ludo reste sous son dernier sommet de ${formatHtg(drawdownHtg)} (${formatPercent(snapshot?.drawdownPct)}). Dernier pic atteint le ${formatDateTime(snapshot?.lastPeakAtMs)}.`;
}

function renderTrend(snapshot = null) {
  const trend = Array.isArray(snapshot?.trend) ? snapshot.trend : [];
  if (!trend.length) {
    dom.trendList.innerHTML = `<p class="empty-copy">Pas encore assez de Ludos archives sur cette fenetre.</p>`;
    return;
  }

  const maxAbs = Math.max(...trend.map((item) => Math.abs(safeInt(item.netHtg))), 1);
  dom.trendList.innerHTML = trend.map((item) => {
    const netHtg = safeInt(item.netHtg);
    const width = Math.max(10, Math.round((Math.abs(netHtg) / maxAbs) * 100));
    return `
      <div class="trend-row">
        <div class="trend-meta">
          <strong>${escapeHtml(item.label || "-")}</strong>
          <span>${formatInt(item.rooms)} Ludo${safeInt(item.rooms) > 1 ? "s" : ""}</span>
        </div>
        <div class="trend-track">
          <span class="trend-bar ${netHtg >= 0 ? "positive" : "negative"}" style="width:${width}%"></span>
        </div>
        <div class="${netHtg >= 0 ? "positive" : "negative"}">${escapeHtml(formatSignedHtg(netHtg))}</div>
      </div>
    `;
  }).join("");
}

function renderDifficultyMix(snapshot = null) {
  const rows = Array.isArray(snapshot?.difficultyMix) ? snapshot.difficultyMix : [];
  if (!rows.length) {
    dom.difficultyMixGrid.innerHTML = `<p class="empty-copy">Le mix par niveau apparaitra ici quand l'archive Ludo aura assez de volume.</p>`;
    return;
  }

  const maxRooms = Math.max(...rows.map((item) => safeInt(item.rooms)), 1);
  dom.difficultyMixGrid.innerHTML = rows.map((item) => {
    const rooms = safeInt(item.rooms);
    const netHtg = safeInt(item.netHtg);
    const width = rooms > 0 ? Math.max(10, Math.round((rooms / maxRooms) * 100)) : 0;
    return `
      <article class="mix-card">
        <div class="mix-head">
          <strong>${escapeHtml(levelLabel(item.level))}</strong>
          <span>${formatInt(rooms)} Ludo${rooms > 1 ? "s" : ""}</span>
        </div>
        <div class="mix-track">
          <span class="mix-fill ${netHtg >= 0 ? "positive" : "negative"}" style="width:${width}%"></span>
        </div>
        <div class="mix-inline">
          <span>Net <b class="${netHtg >= 0 ? "positive" : "negative"}">${escapeHtml(formatSignedHtg(netHtg))}</b></span>
          <span>Humains <b>${formatInt(item.humanWins)}</b></span>
          <span>Bot <b>${formatInt(item.botWins)}</b></span>
        </div>
      </article>
    `;
  }).join("");
}

function renderStakeMix(snapshot = null) {
  const rows = Array.isArray(snapshot?.stakeMix) ? snapshot.stakeMix : [];
  if (!rows.length) {
    dom.stakeMixGrid.innerHTML = `<p class="empty-copy">Le mix par mise apparaitra ici quand des parties Ludo seront archivees.</p>`;
    return;
  }

  const maxRooms = Math.max(...rows.map((item) => safeInt(item.rooms)), 1);
  dom.stakeMixGrid.innerHTML = rows.map((item) => {
    const rooms = safeInt(item.rooms);
    const netHtg = safeInt(item.netHtg);
    const width = rooms > 0 ? Math.max(10, Math.round((rooms / maxRooms) * 100)) : 0;
    return `
      <article class="mix-card">
        <div class="mix-head">
          <strong>${escapeHtml(item.labelHtg || `${formatInt(item.stakeHtg)} HTG`)}</strong>
          <span>${formatInt(rooms)} partie(s)</span>
        </div>
        <div class="mix-track">
          <span class="mix-fill ${netHtg >= 0 ? "positive" : "negative"}" style="width:${width}%"></span>
        </div>
        <div class="mix-inline">
          <span>Net <b class="${netHtg >= 0 ? "positive" : "negative"}">${escapeHtml(formatSignedHtg(netHtg))}</b></span>
          <span>Humains <b>${formatInt(item.humanWins)}</b></span>
          <span>Bot <b>${formatInt(item.botWins)}</b></span>
        </div>
      </article>
    `;
  }).join("");
}

function renderSnapshot(result = {}) {
  const snapshot = result?.snapshot || {};
  state.snapshot = snapshot;
  state.mode = String(result?.mode || "manual").trim().toLowerCase() === "auto" ? "auto" : "manual";
  state.window = String(result?.window || "today").trim().toLowerCase() || "today";
  state.manualBotDifficulty = normalizeLevel(result?.manualBotDifficulty || DEFAULT_LEVEL);
  state.autoBotDifficulty = normalizeLevel(result?.autoBotDifficulty || result?.snapshot?.recommendedLevel || DEFAULT_LEVEL);
  state.appliedBotDifficulty = normalizeLevel(result?.appliedBotDifficulty || state.manualBotDifficulty);

  const band = bandMeta(snapshot?.recommendedBand || "equilibrium");
  dom.bandBadge.textContent = `Auto: ${band.label}`;
  dom.bandBadge.dataset.tone = band.tone;
  dom.appliedBadge.textContent = `Applique: ${levelLabel(state.appliedBotDifficulty)}`;
  dom.appliedBadge.dataset.tone = state.appliedBotDifficulty === "strong" ? "danger" : "comfort";
  dom.reasonCopy.textContent = reasonLabel(snapshot?.recommendedReason || "");
  dom.fetchMeta.textContent = `Snapshot calcule le ${formatDateTime(snapshot?.computedAtMs)} sur ${formatInt(snapshot?.roomsCount)} partie(s).`;

  dom.netValue.textContent = formatSignedHtg(snapshot?.netHtg);
  dom.netCopy.textContent = `Encaisse ${formatHtg(snapshot?.collectedHtg)} · payout ${formatHtg(snapshot?.payoutHtg)}`;
  dom.marginValue.textContent = formatPercent(snapshot?.marginPct);
  dom.marginCopy.textContent = `Winrate bot ${formatPercent(snapshot?.botWinRatePct)} · humains ${formatPercent(snapshot?.humanWinRatePct)}`;
  dom.roomsValue.textContent = formatInt(snapshot?.roomsCount);
  dom.roomsCopy.textContent = `Fenetre ${state.window} · dernier pic ${formatDateTime(snapshot?.lastPeakAtMs)}`;

  dom.collectedValue.textContent = formatHtg(snapshot?.collectedHtg);
  dom.payoutValue.textContent = formatHtg(snapshot?.payoutHtg);
  dom.equityValue.textContent = formatSignedHtg(snapshot?.currentEquityHtg);
  dom.equityCopy.textContent = `Sommet ${formatHtg(snapshot?.highWaterMarkHtg)}`;
  dom.peakValue.textContent = formatHtg(snapshot?.highWaterMarkHtg);
  dom.peakCopy.textContent = formatDateTime(snapshot?.lastPeakAtMs);
  dom.drawdownValue.textContent = formatHtg(snapshot?.drawdownHtg);
  dom.drawdownCopy.textContent = `${formatPercent(snapshot?.drawdownPct)} sous le dernier sommet`;
  dom.winrateValue.textContent = formatPercent(snapshot?.botWinRatePct);

  updateControls();
  renderEquityCurve(snapshot);
  renderTrend(snapshot);
  renderDifficultyMix(snapshot);
  renderStakeMix(snapshot);
}

async function refreshSnapshot() {
  setLoading(true);
  try {
    const result = await getLudoBotPilotSnapshotSecure({ window: state.window });
    renderSnapshot(result || {});
  } finally {
    setLoading(false);
  }
}

async function applyControl() {
  setLoading(true);
  try {
    const result = await setLudoBotPilotControlSecure({
      mode: state.mode,
      window: state.window,
      manualBotDifficulty: state.manualBotDifficulty,
    });
    renderSnapshot(result || {});
  } finally {
    setLoading(false);
  }
}

function bindEvents() {
  dom.modeManualBtn?.addEventListener("click", () => {
    state.mode = "manual";
    updateControls();
  });
  dom.modeAutoBtn?.addEventListener("click", () => {
    state.mode = "auto";
    updateControls();
  });
  dom.windowSelect?.addEventListener("change", () => {
    state.window = String(dom.windowSelect.value || "today").trim().toLowerCase();
    void refreshSnapshot();
  });
  dom.levelButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.manualBotDifficulty = normalizeLevel(button.dataset.level || DEFAULT_LEVEL);
      updateControls();
    });
  });
  dom.applyBtn?.addEventListener("click", () => {
    void applyControl();
  });
}

function startLiveRefresh() {
  if (liveRefreshTimer) {
    window.clearInterval(liveRefreshTimer);
  }
  liveRefreshTimer = window.setInterval(() => {
    if (state.loading) return;
    void refreshSnapshot();
  }, LIVE_REFRESH_INTERVAL_MS);
}

async function init() {
  const session = await ensureFinanceDashboardSession({
    title: "Pilotage bot Ludo",
    description: "Connecte-toi avec le compte administrateur autorise pour piloter le bot Ludo V2.",
  });
  state.userEmail = String(session?.email || "");
  if (dom.adminEmail) {
    dom.adminEmail.textContent = state.userEmail || "Admin connecte";
  }

  bindEvents();
  updateControls();
  await refreshSnapshot();
  startLiveRefresh();
}

void init();

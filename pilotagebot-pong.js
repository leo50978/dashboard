import { ensureFinanceDashboardSession } from "./dashboard-admin-auth.js";
import { getPongBotPilotSnapshotSecure, setPongBotPilotControlSecure } from "./secure-functions.js";

const DEFAULT_LEVEL = "ultra";
const LIVE_REFRESH_INTERVAL_MS = 45 * 1000;
const RATE_HTG_TO_DOES = 20;

const dom = {
  adminEmail: document.getElementById("pongPilotAdminEmail"),
  modeValue: document.getElementById("pongPilotModeValue"),
  modeCopy: document.getElementById("pongPilotModeCopy"),
  netValue: document.getElementById("pongPilotNetValue"),
  netCopy: document.getElementById("pongPilotNetCopy"),
  marginValue: document.getElementById("pongPilotMarginValue"),
  marginCopy: document.getElementById("pongPilotMarginCopy"),
  roomsValue: document.getElementById("pongPilotRoomsValue"),
  roomsCopy: document.getElementById("pongPilotRoomsCopy"),
  windowSelect: document.getElementById("pongPilotWindowSelect"),
  modeManualBtn: document.getElementById("pongPilotModeManualBtn"),
  modeAutoBtn: document.getElementById("pongPilotModeAutoBtn"),
  levelButtons: Array.from(document.querySelectorAll("#pongPilotLevelGrid [data-level]")),
  applyBtn: document.getElementById("pongPilotApplyBtn"),
  bandBadge: document.getElementById("pongPilotBandBadge"),
  appliedBadge: document.getElementById("pongPilotAppliedBadge"),
  reasonCopy: document.getElementById("pongPilotReasonCopy"),
  fetchMeta: document.getElementById("pongPilotFetchMeta"),
  collectedValue: document.getElementById("pongPilotCollectedValue"),
  payoutValue: document.getElementById("pongPilotPayoutValue"),
  equityValue: document.getElementById("pongPilotEquityValue"),
  equityCopy: document.getElementById("pongPilotEquityCopy"),
  peakValue: document.getElementById("pongPilotPeakValue"),
  peakCopy: document.getElementById("pongPilotPeakCopy"),
  drawdownValue: document.getElementById("pongPilotDrawdownValue"),
  drawdownCopy: document.getElementById("pongPilotDrawdownCopy"),
  equitySvg: document.getElementById("pongPilotEquitySvg"),
  equityAxis: document.getElementById("pongPilotEquityAxis"),
  recoveryCopy: document.getElementById("pongPilotRecoveryCopy"),
  trendList: document.getElementById("pongPilotTrendList"),
  difficultyMixGrid: document.getElementById("pongPilotDifficultyMixGrid"),
  stakeMixGrid: document.getElementById("pongPilotStakeMixGrid"),
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
  refreshing: false,
};

let liveRefreshTimer = 0;

function safeInt(value) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.trunc(num) : 0;
}

function safeSignedInt(value) {
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
  if (level === "ultra" || level === "expert") return "ultra";
  if (level === "amateur" || level === "userpro") return "amateur";
  return DEFAULT_LEVEL;
}

function levelLabel(level = "") {
  const normalized = normalizeLevel(level);
  if (normalized === "amateur") return "Faible";
  return "Fò";
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
  if (normalized === "drawdown_critical") return "Le Pong replonge trop loin sous son dernier sommet: le systeme serre fort le niveau du bot pour stopper la perte.";
  if (normalized === "drawdown_high") return "La courbe Pong reste sous pression sous son dernier plus haut, le systeme reste en defense.";
  if (normalized === "recovery_guard") return "Le Pong remonte mais n'a pas encore repris son dernier sommet: le systeme garde un niveau intermediaire pour proteger la reprise.";
  if (normalized === "margin_too_low") return "La marge Pong est trop basse ou negative, le systeme durcit le bot pour proteger le profit.";
  if (normalized === "margin_low") return "La marge Pong reste fragile, le systeme garde une defense legere.";
  if (normalized === "bot_win_rate_too_high") return "Le bot Pong gagne deja trop souvent, le systeme refuse de durcir davantage pour ne pas etouffer les joueurs.";
  if (normalized === "new_high_comfort" || normalized === "margin_high") return "Le Pong tient une marge confortable, le systeme peut adoucir le bot sans casser le profit.";
  if (normalized === "no_volume") return "Pas assez de matchs Pong archives sur la fenetre, le systeme reste neutre.";
  return "Le Pong reste dans une zone d'equilibre, le systeme garde un niveau intermediaire.";
}

function formatInt(value) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(safeFloat(value));
}

function readMetricValue(source = {}, htgKey = "", doesKey = "") {
  if (source && htgKey && Number.isFinite(Number(source[htgKey]))) {
    return safeSignedInt(source[htgKey]);
  }
  if (source && doesKey && Number.isFinite(Number(source[doesKey]))) {
    return Math.trunc(safeFloat(source[doesKey]) / RATE_HTG_TO_DOES);
  }
  return 0;
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

function formatDrawdown(htgValue, pctValue) {
  const drawdown = Math.max(0, safeInt(htgValue));
  return `${drawdown > 0 ? "-" : ""}${formatInt(drawdown)} HTG | ${formatPercent(pctValue)}`;
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
    button.disabled = state.loading;
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
  dom.applyBtn.textContent = isAuto ? "Appliquer le pilotage automatique Pong" : "Appliquer le niveau manuel Pong";
  dom.modeValue.textContent = modeLabel(state.mode);
  dom.modeCopy.textContent = isAuto
    ? `Le niveau Pong applique suit la recommandation calculee sur ${state.window === "today" ? "la journee" : state.window}.`
    : `Le niveau Pong reste fixe sur ${levelLabel(state.manualBotDifficulty)} tant que tu restes en manuel.`;
}

function renderEquityCurve(snapshot = null) {
  const points = Array.isArray(snapshot?.equityCurve) ? snapshot.equityCurve : [];
  if (!dom.equitySvg || !dom.equityAxis || !dom.recoveryCopy) return;

  if (points.length < 2) {
    dom.equitySvg.innerHTML = `
      <defs>
        <linearGradient id="pongPilotEquityAreaGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.38"></stop>
          <stop offset="100%" stop-color="#38bdf8" stop-opacity="0"></stop>
        </linearGradient>
      </defs>
      <text x="50%" y="50%" text-anchor="middle" fill="rgba(226,232,240,0.75)" font-size="16">
        Pas encore assez de Pongs archives pour tracer une courbe.
      </text>
    `;
    dom.equityAxis.innerHTML = `<span>-</span><span>-</span><span>-</span>`;
    dom.recoveryCopy.textContent = "Le moteur affichera ici le sommet precedent, le drawdown et la reprise des Pongs quand le volume sera suffisant.";
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
  const values = points.map((item) => readMetricValue(item, "equityHtg", "equityDoes"));
  const allValues = [...values, 0, readMetricValue(snapshot, "highWaterMarkHtg", "highWaterMarkDoes")];
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
  const peakY = toY(readMetricValue(snapshot, "highWaterMarkHtg", "highWaterMarkDoes"));
  const plotted = points.map((item, index) => ({
    ...item,
    x: toX(index),
    y: toY(readMetricValue(item, "equityHtg", "equityDoes")),
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
      <linearGradient id="pongPilotEquityAreaGradient" x1="0" y1="0" x2="0" y2="1">
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

  const drawdownHtg = Math.max(0, readMetricValue(snapshot, "drawdownHtg", "drawdownDoes"));
  if (drawdownHtg <= 0) {
    dom.recoveryCopy.textContent = `La courbe Pong tient actuellement son sommet sur la fenetre ${state.window}. Le systeme peut respirer sans trop charger le bot.`;
    return;
  }
  dom.recoveryCopy.textContent = `La courbe Pong reste sous son dernier sommet de ${formatDrawdown(readMetricValue(snapshot, "drawdownHtg", "drawdownDoes"), snapshot?.drawdownPct)}. Dernier pic atteint le ${formatDateTime(snapshot?.lastPeakAtMs)}. Tant que ce drawdown reste ouvert, le pilotage automatique garde plus de pression.`;
}

function renderTrend(snapshot = null) {
  const trend = Array.isArray(snapshot?.trend) ? snapshot.trend : [];
  if (!trend.length) {
    dom.trendList.innerHTML = `<p class="empty-copy">Pas encore assez de Pongs archives sur cette fenetre.</p>`;
    return;
  }

  const maxAbs = Math.max(...trend.map((item) => Math.abs(readMetricValue(item, "netHtg", "netDoes"))), 1);
  dom.trendList.innerHTML = trend.map((item) => {
    const netHtg = readMetricValue(item, "netHtg", "netDoes");
    const width = Math.max(10, Math.round((Math.abs(netHtg) / maxAbs) * 100));
    return `
      <div class="trend-row">
        <div class="trend-meta">
          <strong>${escapeHtml(item.label || "-")}</strong>
          <span>${formatInt(item.rooms)} Pong${safeInt(item.rooms) > 1 ? "s" : ""}</span>
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
    dom.difficultyMixGrid.innerHTML = `<p class="empty-copy">Le mix par niveau apparaitra ici quand l'archive Pong aura assez de volume.</p>`;
    return;
  }

  const maxRooms = Math.max(...rows.map((item) => safeInt(item.rooms)), 1);
  dom.difficultyMixGrid.innerHTML = rows.map((item) => {
    const rooms = safeInt(item.rooms);
    const netHtg = readMetricValue(item, "netHtg", "netDoes");
    const width = rooms > 0 ? Math.max(10, Math.round((rooms / maxRooms) * 100)) : 0;
    return `
      <article class="mix-card">
        <div class="mix-head">
          <strong>${escapeHtml(levelLabel(item.level))}</strong>
          <span>${formatInt(rooms)} Pong${rooms > 1 ? "s" : ""}</span>
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
    dom.stakeMixGrid.innerHTML = `<p class="empty-copy">Le mix par mise apparaitra ici quand les Pongs bots seront archives.</p>`;
    return;
  }

  const maxRooms = Math.max(...rows.map((item) => safeInt(item.rooms)), 1);
  dom.stakeMixGrid.innerHTML = rows.map((item) => {
    const rooms = safeInt(item.rooms);
    const netHtg = readMetricValue(item, "netHtg", "netDoes");
    const stakeHtg = Math.max(0, readMetricValue(item, "stakeHtg", "stakeDoes"));
    const width = rooms > 0 ? Math.max(10, Math.round((rooms / maxRooms) * 100)) : 0;
    return `
      <article class="mix-card">
        <div class="mix-head">
          <strong>${escapeHtml(item.labelHtg || `${formatInt(stakeHtg)} HTG`)}</strong>
          <span>${formatInt(rooms)} Pong${rooms > 1 ? "s" : ""}</span>
        </div>
        <div class="mix-track">
          <span class="mix-fill ${netHtg >= 0 ? "positive" : "negative"}" style="width:${width}%"></span>
        </div>
        <div class="mix-inline">
          <span>Net <b class="${netHtg >= 0 ? "positive" : "negative"}">${escapeHtml(formatSignedHtg(netHtg))}</b></span>
          <span>Mise <b>${formatInt(stakeHtg)} HTG</b></span>
        </div>
      </article>
    `;
  }).join("");
}

function renderSnapshot() {
  const snapshot = state.snapshot || {};
  const band = bandMeta(snapshot.recommendedBand);
  const appliedLevel = state.mode === "auto" ? state.autoBotDifficulty : state.manualBotDifficulty;
  const netHtg = readMetricValue(snapshot, "netHtg", "netDoes");
  const collectedHtg = readMetricValue(snapshot, "collectedHtg", "collectedDoes");
  const payoutHtg = readMetricValue(snapshot, "payoutHtg", "payoutDoes");
  const currentEquityHtg = readMetricValue(snapshot, "currentEquityHtg", "currentEquityDoes");
  const highWaterMarkHtg = readMetricValue(snapshot, "highWaterMarkHtg", "highWaterMarkDoes");
  const drawdownHtg = Math.max(0, readMetricValue(snapshot, "drawdownHtg", "drawdownDoes"));

  dom.netValue.textContent = formatSignedHtg(netHtg);
  dom.netValue.classList.toggle("positive", netHtg > 0);
  dom.netValue.classList.toggle("negative", netHtg < 0);
  dom.netCopy.textContent = `Encaisse ${formatHtg(collectedHtg)} | payout ${formatHtg(payoutHtg)}.`;

  dom.marginValue.textContent = formatPercent(snapshot.marginPct);
  dom.marginCopy.textContent = `Bot gagne ${formatPercent(snapshot.botWinRatePct)} | humain ${formatPercent(snapshot.humanWinRatePct)}.`;

  dom.roomsValue.textContent = formatInt(snapshot.roomsCount);
  dom.roomsCopy.textContent = snapshot.truncated
    ? `Lecture Pong plafonnee a ${formatInt(snapshot.fetchLimit)} matchs recents.`
    : `Fenetre ${state.window} archivee de ${formatDateTime(snapshot.startMs)} a ${formatDateTime(snapshot.endMs)}.`;

  dom.collectedValue.textContent = formatHtg(collectedHtg);
  dom.payoutValue.textContent = formatHtg(payoutHtg);
  dom.equityValue.textContent = formatSignedHtg(currentEquityHtg);
  dom.equityValue.classList.toggle("positive", currentEquityHtg > 0);
  dom.equityValue.classList.toggle("negative", currentEquityHtg < 0);
  dom.equityCopy.textContent = `Depart a zero le ${formatDateTime(snapshot.startMs)} | dernier point ${formatDateTime(snapshot.endMs)}.`;
  dom.peakValue.textContent = formatHtg(highWaterMarkHtg);
  dom.peakCopy.textContent = `Dernier sommet Pong observe le ${formatDateTime(snapshot.lastPeakAtMs)}.`;
  dom.drawdownValue.textContent = formatDrawdown(drawdownHtg, snapshot.drawdownPct);
  dom.drawdownValue.classList.toggle("negative", drawdownHtg > 0);
  dom.drawdownValue.classList.toggle("positive", drawdownHtg <= 0);
  dom.drawdownCopy.textContent = drawdownHtg > 0
    ? "Le pilotage Pong doit reconstruire au-dessus de ce pic."
    : "Aucun drawdown ouvert sur la fenetre Pong active.";

  dom.bandBadge.textContent = `Bande ${band.label}`;
  dom.bandBadge.dataset.tone = band.tone;
  dom.appliedBadge.textContent = `Niveau applique ${levelLabel(appliedLevel)}`;
  dom.appliedBadge.dataset.tone = state.mode === "auto" ? band.tone : "equilibrium";

  dom.reasonCopy.textContent = `${reasonLabel(snapshot.recommendedReason)} Dernier calcul: ${formatDateTime(snapshot.computedAtMs)}.`;
  dom.fetchMeta.textContent = `Mode ${modeLabel(state.mode)} | niveau manuel ${levelLabel(state.manualBotDifficulty)} | niveau auto recommande ${levelLabel(state.autoBotDifficulty)}. Source: pongMatchResults | refresh ${Math.round(LIVE_REFRESH_INTERVAL_MS / 1000)}s.`;

  updateControls();
  renderEquityCurve(snapshot);
  renderTrend(snapshot);
  renderDifficultyMix(snapshot);
  renderStakeMix(snapshot);
}

function hydrateFromResponse(response = {}) {
  state.mode = String(response.mode || state.mode || "manual").toLowerCase() === "auto" ? "auto" : "manual";
  state.window = String(response.window || state.window || "today");
  state.manualBotDifficulty = normalizeLevel(response.manualBotDifficulty || state.manualBotDifficulty);
  state.autoBotDifficulty = normalizeLevel(response.autoBotDifficulty || response.snapshot?.recommendedLevel || state.autoBotDifficulty);
  state.appliedBotDifficulty = normalizeLevel(response.appliedBotDifficulty || state.appliedBotDifficulty);
  state.snapshot = response.snapshot || state.snapshot || null;
  renderSnapshot();
}

async function loadSnapshot(options = {}) {
  const silent = options && options.silent === true;
  if (state.refreshing) return;
  state.refreshing = true;
  if (!silent) setLoading(true);
  try {
    const response = await getPongBotPilotSnapshotSecure({ window: state.window });
    hydrateFromResponse(response || {});
  } finally {
    state.refreshing = false;
    if (!silent) {
      setLoading(false);
      updateControls();
    }
  }
}

async function applyControl(next = {}) {
  setLoading(true);
  try {
    const payload = {
      mode: next.mode || state.mode,
      window: next.window || state.window,
      manualBotDifficulty: next.manualBotDifficulty || state.manualBotDifficulty,
    };
    const response = await setPongBotPilotControlSecure(payload);
    hydrateFromResponse(response || {});
  } finally {
    setLoading(false);
    updateControls();
  }
}

function bindEvents() {
  dom.modeManualBtn.addEventListener("click", () => {
    if (state.mode === "manual" || state.loading) return;
    state.mode = "manual";
    updateControls();
  });

  dom.modeAutoBtn.addEventListener("click", () => {
    if (state.mode === "auto" || state.loading) return;
    state.mode = "auto";
    updateControls();
  });

  dom.windowSelect.addEventListener("change", () => {
    state.window = dom.windowSelect.value || "today";
    void loadSnapshot();
  });

  dom.levelButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (state.loading || state.mode === "auto") return;
      state.manualBotDifficulty = normalizeLevel(button.dataset.level);
      updateControls();
    });
  });

  dom.applyBtn.addEventListener("click", () => {
    if (state.loading) return;
    void applyControl({
      mode: state.mode,
      window: state.window,
      manualBotDifficulty: state.manualBotDifficulty,
    });
  });
}

function startLiveRefresh() {
  window.clearInterval(liveRefreshTimer);
  liveRefreshTimer = window.setInterval(() => {
    if (document.hidden || state.loading) return;
    void loadSnapshot({ silent: true });
  }, LIVE_REFRESH_INTERVAL_MS);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden || state.loading) return;
    void loadSnapshot({ silent: true });
  });
}

async function bootstrap() {
  const user = await ensureFinanceDashboardSession({
    title: "Pilotage Pong",
    subtitle: "Connecte-toi avec l'admin finance pour piloter le bot Pong.",
  });
  state.userEmail = String(user?.email || "").trim();
  if (dom.adminEmail) {
    dom.adminEmail.textContent = state.userEmail
      ? `Session admin: ${state.userEmail}`
      : "Session admin finance active";
  }

  bindEvents();
  startLiveRefresh();
  updateControls();
  await loadSnapshot();
}

void bootstrap().catch((error) => {
  console.error("[Pong_BOT_PILOT] bootstrap failed", error);
  if (dom.reasonCopy) {
    dom.reasonCopy.textContent = error?.message || "Impossible de charger le pilotage Pong.";
  }
  dom.trendList.innerHTML = `<p class="empty-copy">Chargement impossible pour le moment.</p>`;
  dom.difficultyMixGrid.innerHTML = `<p class="empty-copy">Les donnees n'ont pas pu etre chargees.</p>`;
  dom.stakeMixGrid.innerHTML = `<p class="empty-copy">Les donnees n'ont pas pu etre chargees.</p>`;
});


import { ensureFinanceDashboardSession } from "./dashboard-admin-auth.js";
import {
  getChessBotPilotSnapshotSecure,
  setChessBotPilotControlSecure,
} from "./secure-functions.js?v=20260611-chess-pilot1";

const DEFAULT_LEVEL = "fo";
const LIVE_REFRESH_INTERVAL_MS = 45 * 1000;

const dom = {
  adminEmail: document.getElementById("chessPilotAdminEmail"),
  netValue: document.getElementById("chessPilotNetValue"),
  netCopy: document.getElementById("chessPilotNetCopy"),
  marginValue: document.getElementById("chessPilotMarginValue"),
  marginCopy: document.getElementById("chessPilotMarginCopy"),
  roomsValue: document.getElementById("chessPilotRoomsValue"),
  roomsCopy: document.getElementById("chessPilotRoomsCopy"),
  windowSelect: document.getElementById("chessPilotWindowSelect"),
  modeManualBtn: document.getElementById("chessPilotModeManualBtn"),
  modeAutoBtn: document.getElementById("chessPilotModeAutoBtn"),
  levelButtons: Array.from(document.querySelectorAll("#chessPilotLevelGrid [data-level]")),
  applyBtn: document.getElementById("chessPilotApplyBtn"),
  bandBadge: document.getElementById("chessPilotBandBadge"),
  appliedBadge: document.getElementById("chessPilotAppliedBadge"),
  reasonCopy: document.getElementById("chessPilotReasonCopy"),
  fetchMeta: document.getElementById("chessPilotFetchMeta"),
  collectedValue: document.getElementById("chessPilotCollectedValue"),
  payoutValue: document.getElementById("chessPilotPayoutValue"),
  equityValue: document.getElementById("chessPilotEquityValue"),
  equityCopy: document.getElementById("chessPilotEquityCopy"),
  peakValue: document.getElementById("chessPilotPeakValue"),
  peakCopy: document.getElementById("chessPilotPeakCopy"),
  drawdownValue: document.getElementById("chessPilotDrawdownValue"),
  drawdownCopy: document.getElementById("chessPilotDrawdownCopy"),
  equitySvg: document.getElementById("chessPilotEquitySvg"),
  equityAxis: document.getElementById("chessPilotEquityAxis"),
  recoveryCopy: document.getElementById("chessPilotRecoveryCopy"),
  trendList: document.getElementById("chessPilotTrendList"),
  difficultyMixGrid: document.getElementById("chessPilotDifficultyMixGrid"),
  stakeMixGrid: document.getElementById("chessPilotStakeMixGrid"),
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
  if (level === "weak" || level === "easy" || level === "amateur" || level === "low") return "weak";
  if (level === "fo" || level === "strong" || level === "expert" || level === "ultra") return "fo";
  return DEFAULT_LEVEL;
}

function levelLabel(level = "") {
  return normalizeLevel(level) === "weak" ? "Weak" : "Fo";
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
  if (normalized === "drawdown_critical") return "Le profit Echec est trop loin sous son dernier sommet: le systeme force `Fo` pour proteger les HTG.";
  if (normalized === "drawdown_high") return "La courbe Echec reste sous pression: le systeme garde `Fo` en defense.";
  if (normalized === "recovery_guard") return "Le bot Echec remonte mais n'a pas encore repris son dernier sommet: le systeme garde `Fo`.";
  if (normalized === "margin_too_low") return "La marge Echec est trop basse ou negative: le systeme passe en `Fo`.";
  if (normalized === "margin_low") return "La marge reste fragile: le systeme conserve `Fo`.";
  if (normalized === "new_high_comfort" || normalized === "margin_high") return "Le bot Echec tient une marge confortable: le systeme peut revenir sur `Weak`.";
  if (normalized === "no_volume") return "Pas assez de parties Echec archivees sur la fenetre, le systeme reste neutre.";
  return "Le bot Echec reste dans une zone de pilotage simple entre `Weak` et `Fo`.";
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

function formatDrawdown(htgValue, pctValue) {
  const drawdown = Math.max(0, safeInt(htgValue));
  return `${drawdown > 0 ? "-" : ""}${formatInt(drawdown)} HTG · ${formatPercent(pctValue)}`;
}

function formatDateTime(ms = 0) {
  if (!ms) return "-";
  return new Date(ms).toLocaleString("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
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
    const isActive = level === state.manualBotDifficulty;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
    button.disabled = state.loading || isAuto;
  });
  dom.windowSelect.value = state.window;
  dom.applyBtn.textContent = isAuto ? "Appliquer le pilotage automatique Echec" : "Appliquer le pilotage Echec";
}

function renderEquityCurve(snapshot = null) {
  const points = Array.isArray(snapshot?.equityCurve) ? snapshot.equityCurve : [];
  if (points.length < 2) {
    dom.equitySvg.innerHTML = `
      <defs>
        <linearGradient id="chessPilotEquityAreaGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#34d399" stop-opacity="0.38"></stop>
          <stop offset="100%" stop-color="#34d399" stop-opacity="0"></stop>
        </linearGradient>
      </defs>
      <text x="50%" y="50%" text-anchor="middle" fill="rgba(226,232,240,0.75)" font-size="16">
        Pas encore assez de matchs Echec archives pour tracer une courbe.
      </text>
    `;
    dom.equityAxis.innerHTML = `<span>-</span><span>-</span><span>-</span>`;
    dom.recoveryCopy.textContent = "La courbe apparaitra quand le bot Echec aura assez de matchs termines.";
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
  const peakY = toY(snapshot?.highWaterMarkHtg || 0);
  const plotted = points.map((item, index) => ({ ...item, x: toX(index), y: toY(item.equityHtg) }));
  const linePoints = plotted.map((item) => `${item.x.toFixed(1)},${item.y.toFixed(1)}`).join(" ");
  const firstPoint = plotted[0];
  const lastPoint = plotted[plotted.length - 1];
  const areaPath = [
    `M ${firstPoint.x.toFixed(1)} ${zeroY.toFixed(1)}`,
    ...plotted.map((item) => `L ${item.x.toFixed(1)} ${item.y.toFixed(1)}`),
    `L ${lastPoint.x.toFixed(1)} ${zeroY.toFixed(1)}`,
    "Z",
  ].join(" ");

  dom.equitySvg.innerHTML = `
    <defs>
      <linearGradient id="chessPilotEquityAreaGradient" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#34d399" stop-opacity="0.38"></stop>
        <stop offset="100%" stop-color="#34d399" stop-opacity="0"></stop>
      </linearGradient>
    </defs>
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
    dom.recoveryCopy.textContent = `La courbe Echec tient actuellement son sommet sur la fenetre ${state.window}.`;
    return;
  }
  dom.recoveryCopy.textContent = `La courbe Echec reste sous son dernier sommet de ${formatDrawdown(snapshot?.drawdownHtg, snapshot?.drawdownPct)}. Dernier pic atteint le ${formatDateTime(snapshot?.lastPeakAtMs)}.`;
}

function renderTrend(snapshot = null) {
  const trend = Array.isArray(snapshot?.trend) ? snapshot.trend : [];
  if (!trend.length) {
    dom.trendList.innerHTML = `<p class="empty-copy">Pas encore assez de matchs Echec archives sur cette fenetre.</p>`;
    return;
  }

  const maxAbs = Math.max(...trend.map((item) => Math.abs(safeInt(item.netHtg))), 1);
  dom.trendList.innerHTML = trend.map((item) => {
    const netHtg = safeInt(item.netHtg);
    const width = Math.max(10, Math.round((Math.abs(netHtg) / maxAbs) * 100));
    return `
      <div class="trend-row">
        <div>
          <strong>${escapeHtml(item.label || "-")}</strong>
          <br>
          <span>${formatInt(item.rooms)} partie${safeInt(item.rooms) > 1 ? "s" : ""}</span>
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
    dom.difficultyMixGrid.innerHTML = `<p class="empty-copy">Le mix par niveau apparaitra ici quand l'archive Echec aura assez de volume.</p>`;
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
          <span>${formatInt(rooms)} partie${rooms > 1 ? "s" : ""}</span>
        </div>
        <div class="mix-track">
          <span class="mix-fill ${netHtg >= 0 ? "positive" : "negative"}" style="width:${width}%"></span>
        </div>
        <div class="mix-inline">
          <span>Net <b class="${netHtg >= 0 ? "positive" : "negative"}">${escapeHtml(formatSignedHtg(netHtg))}</b></span>
          <span>Humains <b>${formatInt(item.humanWins)}</b></span>
          <span>Bots <b>${formatInt(item.botWins)}</b></span>
        </div>
      </article>
    `;
  }).join("");
}

function renderStakeMix(snapshot = null) {
  const rows = Array.isArray(snapshot?.stakeMix) ? snapshot.stakeMix : [];
  if (!rows.length) {
    dom.stakeMixGrid.innerHTML = `<p class="empty-copy">Le mix par mise apparaitra ici quand les matchs Echec seront archives.</p>`;
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
          <strong>${escapeHtml(item.label || `${safeInt(item.stakeHtg)} HTG`)}</strong>
          <span>${formatInt(rooms)} partie${rooms > 1 ? "s" : ""}</span>
        </div>
        <div class="mix-track">
          <span class="mix-fill ${netHtg >= 0 ? "positive" : "negative"}" style="width:${width}%"></span>
        </div>
        <div class="mix-inline">
          <span>Net <b class="${netHtg >= 0 ? "positive" : "negative"}">${escapeHtml(formatSignedHtg(netHtg))}</b></span>
          <span>Mise <b>${formatInt(item.stakeHtg)} HTG</b></span>
        </div>
      </article>
    `;
  }).join("");
}

function renderSnapshot() {
  const snapshot = state.snapshot || {};
  const band = bandMeta(snapshot.recommendedBand);
  const appliedLevel = state.mode === "auto" ? state.autoBotDifficulty : state.manualBotDifficulty;
  const drawdownHtg = Math.max(0, safeInt(snapshot.drawdownHtg));

  dom.netValue.textContent = formatSignedHtg(snapshot.netHtg);
  dom.netValue.classList.toggle("positive", safeInt(snapshot.netHtg) > 0);
  dom.netValue.classList.toggle("negative", safeInt(snapshot.netHtg) < 0);
  dom.netCopy.textContent = `Encaisse ${formatHtg(snapshot.collectedHtg)} · payout ${formatHtg(snapshot.payoutHtg)}.`;

  dom.marginValue.textContent = formatPercent(snapshot.marginPct);
  dom.marginCopy.textContent = `Bot gagne ${formatPercent(snapshot.botWinRatePct)} · humain ${formatPercent(snapshot.humanWinRatePct)} · nuls ${formatPercent(snapshot.drawRatePct)}.`;

  dom.roomsValue.textContent = formatInt(snapshot.roomsCount);
  dom.roomsCopy.textContent = snapshot.truncated
    ? "Lecture Echec plafonnee aux matchs recents."
    : `Fenetre ${state.window} archivee de ${formatDateTime(snapshot.startMs)} a ${formatDateTime(snapshot.endMs)}.`;

  dom.collectedValue.textContent = formatHtg(snapshot.collectedHtg);
  dom.payoutValue.textContent = formatHtg(snapshot.payoutHtg);
  dom.equityValue.textContent = formatSignedHtg(snapshot.currentEquityHtg);
  dom.equityValue.classList.toggle("positive", safeInt(snapshot.currentEquityHtg) > 0);
  dom.equityValue.classList.toggle("negative", safeInt(snapshot.currentEquityHtg) < 0);
  dom.equityCopy.textContent = `Depart a zero le ${formatDateTime(snapshot.startMs)} · dernier point ${formatDateTime(snapshot.endMs)}.`;
  dom.peakValue.textContent = formatHtg(snapshot.highWaterMarkHtg);
  dom.peakCopy.textContent = `Dernier sommet Echec observe le ${formatDateTime(snapshot.lastPeakAtMs)}.`;
  dom.drawdownValue.textContent = formatDrawdown(snapshot.drawdownHtg, snapshot.drawdownPct);
  dom.drawdownValue.classList.toggle("negative", drawdownHtg > 0);
  dom.drawdownValue.classList.toggle("positive", drawdownHtg <= 0);
  dom.drawdownCopy.textContent = drawdownHtg > 0
    ? "Le pilotage Echec doit reconstruire au-dessus de ce pic."
    : "Aucun drawdown ouvert sur la fenetre Echec active.";

  dom.bandBadge.textContent = `Bande ${band.label}`;
  dom.bandBadge.dataset.tone = band.tone;
  dom.appliedBadge.textContent = `Niveau applique ${levelLabel(appliedLevel)}`;
  dom.appliedBadge.dataset.tone = state.mode === "auto" ? band.tone : "equilibrium";
  dom.reasonCopy.textContent = `${reasonLabel(snapshot.recommendedReason)} Dernier calcul: ${formatDateTime(snapshot.computedAtMs)}.`;
  dom.fetchMeta.textContent = `Mode ${modeLabel(state.mode)} · niveau manuel ${levelLabel(state.manualBotDifficulty)} · niveau auto recommande ${levelLabel(state.autoBotDifficulty)}. Source: chessRoomResults · refresh ${Math.round(LIVE_REFRESH_INTERVAL_MS / 1000)}s.`;

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
    const response = await getChessBotPilotSnapshotSecure({ window: state.window });
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
    const response = await setChessBotPilotControlSecure(payload);
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
    title: "Pilotage Echec",
    subtitle: "Connecte-toi avec l'admin finance pour piloter le bot Echec.",
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
  console.error("[CHESS_BOT_PILOT] bootstrap failed", error);
  if (dom.reasonCopy) {
    dom.reasonCopy.textContent = error?.message || "Impossible de charger le pilotage Echec.";
  }
  dom.trendList.innerHTML = `<p class="empty-copy">Chargement impossible pour le moment.</p>`;
  dom.difficultyMixGrid.innerHTML = `<p class="empty-copy">Les donnees n'ont pas pu etre chargees.</p>`;
  dom.stakeMixGrid.innerHTML = `<p class="empty-copy">Les donnees n'ont pas pu etre chargees.</p>`;
});

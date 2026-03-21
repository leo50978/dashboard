import { ensureFinanceDashboardSession } from "./dashboard-admin-auth.js";
import { getBotPilotSnapshotSecure, setBotPilotControlSecure } from "./secure-functions.js";

const DEFAULT_LEVEL = "expert";

const dom = {
  adminEmail: document.getElementById("pilotageAdminEmail"),
  modeValue: document.getElementById("pilotageModeValue"),
  modeCopy: document.getElementById("pilotageModeCopy"),
  netValue: document.getElementById("pilotageNetValue"),
  netCopy: document.getElementById("pilotageNetCopy"),
  marginValue: document.getElementById("pilotageMarginValue"),
  marginCopy: document.getElementById("pilotageMarginCopy"),
  roomsValue: document.getElementById("pilotageRoomsValue"),
  roomsCopy: document.getElementById("pilotageRoomsCopy"),
  windowSelect: document.getElementById("pilotageWindowSelect"),
  modeManualBtn: document.getElementById("pilotageModeManualBtn"),
  modeAutoBtn: document.getElementById("pilotageModeAutoBtn"),
  levelButtons: Array.from(document.querySelectorAll("#pilotageLevelGrid [data-level]")),
  applyBtn: document.getElementById("pilotageApplyBtn"),
  bandBadge: document.getElementById("pilotageBandBadge"),
  appliedBadge: document.getElementById("pilotageAppliedBadge"),
  reasonCopy: document.getElementById("pilotageReasonCopy"),
  fetchMeta: document.getElementById("pilotageFetchMeta"),
  collectedValue: document.getElementById("pilotageCollectedValue"),
  payoutValue: document.getElementById("pilotagePayoutValue"),
  trendList: document.getElementById("pilotageTrendList"),
  mixGrid: document.getElementById("pilotageMixGrid"),
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
  return level === "userpro" || level === "amateur" || level === "expert" || level === "ultra"
    ? level
    : DEFAULT_LEVEL;
}

function levelLabel(level = "") {
  const normalized = normalizeLevel(level);
  if (normalized === "userpro") return "UserPro";
  if (normalized === "amateur") return "Amateur";
  if (normalized === "ultra") return "Ultra";
  return "Expert";
}

function modeLabel(mode = "") {
  return String(mode || "").trim().toLowerCase() === "auto" ? "Automatique" : "Manuel";
}

function bandMeta(band = "") {
  const normalized = String(band || "").trim().toLowerCase();
  if (normalized === "danger") return { label: "Danger", tone: "danger" };
  if (normalized === "defense") return { label: "Defense", tone: "defense" };
  if (normalized === "comfort") return { label: "Confort", tone: "comfort" };
  return { label: "Equilibre", tone: "equilibrium" };
}

function reasonLabel(reason = "") {
  const normalized = String(reason || "").trim().toLowerCase();
  if (normalized === "margin_too_low") return "La marge est trop basse ou negative, le systeme renforce les bots pour proteger la journee.";
  if (normalized === "margin_low") return "La marge reste fragile, le systeme reste en defense pour garder le profit positif.";
  if (normalized === "margin_high") return "La marge est confortable, le systeme peut adoucir les bots sans te faire basculer en perte.";
  if (normalized === "no_volume") return "Pas assez de volume pour piloter automatiquement, le systeme garde un niveau neutre.";
  return "La marge reste dans la zone d'equilibre, le systeme maintient un niveau intermediaire.";
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
  dom.applyBtn.textContent = isAuto ? "Appliquer le pilotage automatique" : "Appliquer le niveau manuel";
  dom.modeValue.textContent = modeLabel(state.mode);
  dom.modeCopy.textContent = isAuto
    ? `Le niveau applique suit la recommandation calculee sur ${state.window === "today" ? "la journee" : state.window}.`
    : `Le niveau applique reste fixe sur ${levelLabel(state.manualBotDifficulty)} tant que tu restes en manuel.`;
}

function renderTrend(snapshot = null) {
  const trend = Array.isArray(snapshot?.trend) ? snapshot.trend : [];
  if (!trend.length) {
    dom.trendList.innerHTML = `<p class="empty-copy">Pas encore assez de salles archivees sur cette fenetre pour dessiner une courbe utile.</p>`;
    return;
  }

  const maxAbs = Math.max(...trend.map((item) => Math.abs(safeInt(item.netDoes))), 1);
  dom.trendList.innerHTML = trend.map((item) => {
    const netDoes = safeInt(item.netDoes);
    const width = Math.max(10, Math.round((Math.abs(netDoes) / maxAbs) * 100));
    return `
      <div class="trend-row">
        <div class="trend-meta">
          <strong>${escapeHtml(item.label || "-")}</strong>
          <span>${formatInt(item.rooms)} salle${safeInt(item.rooms) > 1 ? "s" : ""}</span>
        </div>
        <div class="trend-track">
          <span class="trend-bar ${netDoes >= 0 ? "positive" : "negative"}" style="width:${width}%"></span>
        </div>
        <div class="${netDoes >= 0 ? "positive" : "negative"}">${escapeHtml(formatSignedDoes(netDoes))}</div>
      </div>
    `;
  }).join("");
}

function renderBotMix(snapshot = null) {
  const rows = Array.isArray(snapshot?.botMix) ? snapshot.botMix : [];
  if (!rows.length) {
    dom.mixGrid.innerHTML = `<p class="empty-copy">Le mix bots apparaitra ici quand l'archive aura assez de volume.</p>`;
    return;
  }

  const maxRooms = Math.max(...rows.map((item) => safeInt(item.rooms)), 1);
  dom.mixGrid.innerHTML = rows.map((item) => {
    const rooms = safeInt(item.rooms);
    const netDoes = safeInt(item.netDoes);
    const width = rooms > 0 ? Math.max(10, Math.round((rooms / maxRooms) * 100)) : 0;
    return `
      <article class="mix-card">
        <div class="mix-head">
          <strong>${safeInt(item.botCount)} bot${safeInt(item.botCount) > 1 ? "s" : ""}</strong>
          <span>${formatInt(rooms)} salle${rooms > 1 ? "s" : ""}</span>
        </div>
        <div class="mix-track">
          <span class="mix-fill ${netDoes >= 0 ? "positive" : "negative"}" style="width:${width}%"></span>
        </div>
        <div class="mix-inline">
          <span>Net <b class="${netDoes >= 0 ? "positive" : "negative"}">${escapeHtml(formatSignedDoes(netDoes))}</b></span>
          <span>Humains <b>${formatInt(item.humanWins)}</b></span>
          <span>Bots <b>${formatInt(item.botWins)}</b></span>
        </div>
      </article>
    `;
  }).join("");
}

function renderSnapshot() {
  const snapshot = state.snapshot || {};
  const band = bandMeta(snapshot.recommendedBand);
  const appliedLevel = state.mode === "auto" ? state.autoBotDifficulty : state.manualBotDifficulty;

  dom.netValue.textContent = formatSignedDoes(snapshot.netDoes);
  dom.netValue.classList.toggle("positive", safeInt(snapshot.netDoes) > 0);
  dom.netValue.classList.toggle("negative", safeInt(snapshot.netDoes) < 0);
  dom.netCopy.textContent = `Encaisse ${formatDoes(snapshot.collectedDoes)} · payout ${formatDoes(snapshot.payoutDoes)}.`;

  dom.marginValue.textContent = formatPercent(snapshot.marginPct);
  dom.marginCopy.textContent = `Bots gagnent ${formatPercent(snapshot.botWinRatePct)} des salles sur cette fenetre.`;

  dom.roomsValue.textContent = formatInt(snapshot.roomsCount);
  dom.roomsCopy.textContent = snapshot.truncated
    ? `Lecture plafonnee a ${formatInt(snapshot.fetchLimit)} salles recentes.`
    : `Fenetre ${state.window} archivee de ${formatDateTime(snapshot.startMs)} a ${formatDateTime(snapshot.endMs)}.`;

  dom.collectedValue.textContent = formatDoes(snapshot.collectedDoes);
  dom.payoutValue.textContent = formatDoes(snapshot.payoutDoes);

  dom.bandBadge.textContent = `Bande ${band.label}`;
  dom.bandBadge.dataset.tone = band.tone;
  dom.appliedBadge.textContent = `Niveau applique ${levelLabel(appliedLevel)}`;
  dom.appliedBadge.dataset.tone = state.mode === "auto" ? band.tone : "equilibrium";

  dom.reasonCopy.textContent = `${reasonLabel(snapshot.recommendedReason)} Dernier calcul: ${formatDateTime(snapshot.computedAtMs)}.`;
  dom.fetchMeta.textContent = `Mode ${modeLabel(state.mode)} · niveau manuel ${levelLabel(state.manualBotDifficulty)} · niveau auto recommande ${levelLabel(state.autoBotDifficulty)}. Source: roomResults.`;

  updateControls();
  renderTrend(snapshot);
  renderBotMix(snapshot);
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

async function loadSnapshot() {
  setLoading(true);
  try {
    const response = await getBotPilotSnapshotSecure({ window: state.window });
    hydrateFromResponse(response || {});
  } finally {
    setLoading(false);
    updateControls();
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
    const response = await setBotPilotControlSecure(payload);
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

async function bootstrap() {
  const user = await ensureFinanceDashboardSession({
    title: "Pilotage bots",
    subtitle: "Connecte-toi avec l'admin finance pour piloter les bots.",
  });
  state.userEmail = String(user?.email || "").trim();
  if (dom.adminEmail) {
    dom.adminEmail.textContent = state.userEmail
      ? `Session admin: ${state.userEmail}`
      : "Session admin finance active";
  }

  bindEvents();
  updateControls();
  await loadSnapshot();
}

void bootstrap().catch((error) => {
  console.error("[BOT_PILOT] bootstrap failed", error);
  if (dom.reasonCopy) {
    dom.reasonCopy.textContent = error?.message || "Impossible de charger le pilotage des bots.";
  }
  dom.trendList.innerHTML = `<p class="empty-copy">Chargement impossible pour le moment.</p>`;
  dom.mixGrid.innerHTML = `<p class="empty-copy">Les donnees n'ont pas pu etre chargees.</p>`;
});

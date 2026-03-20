import {
  DEFAULT_FINANCE_FETCH_LIMIT,
  buildBotMix,
  buildDailySummaries,
  buildFinanceTrend,
  computeFinanceStats,
  ensureFinanceAccess,
  filterFinanceRooms,
  formatDateLabel,
  formatDateTime,
  formatDoes,
  formatSignedDoes,
  getDayOptions,
  getStakeOptions,
  loadFinanceRooms,
} from "./finance-data.js";

const adminEmailEl = document.getElementById("financeAdminEmail");
const loadingEl = document.getElementById("financeLoadingState");
const errorEl = document.getElementById("financeErrorState");
const contentEl = document.getElementById("financeContent");
const totalNetEl = document.getElementById("financeTotalNet");
const totalCollectedEl = document.getElementById("financeTotalCollected");
const totalPayoutEl = document.getElementById("financeTotalPayout");
const totalRoomsEl = document.getElementById("financeTotalRooms");
const botRoomsEl = document.getElementById("financeBotRooms");
const botWinRateEl = document.getElementById("financeBotWinRate");
const averageNetEl = document.getElementById("financeAverageNet");
const exposureNoteEl = document.getElementById("financeExposureNote");
const fetchMetaEl = document.getElementById("financeFetchMeta");
const trendChartEl = document.getElementById("financeTrendChart");
const botMixChartEl = document.getElementById("financeBotMixChart");
const dayDigestEl = document.getElementById("financeDayDigest");
const roomListEl = document.getElementById("financeRoomList");
const roomCountEl = document.getElementById("financeRoomCount");
const roomEmptyEl = document.getElementById("financeEmptyState");
const roomRenderNoteEl = document.getElementById("financeRoomRenderNote");
const searchInputEl = document.getElementById("financeSearchInput");
const periodSelectEl = document.getElementById("financePeriodFilter");
const daySelectEl = document.getElementById("financeDayFilter");
const botSelectEl = document.getElementById("financeBotFilter");
const winnerSelectEl = document.getElementById("financeWinnerFilter");
const stakeSelectEl = document.getElementById("financeStakeFilter");
const sortSelectEl = document.getElementById("financeSortFilter");
const roomLimitSelectEl = document.getElementById("financeRoomLimit");
const dateFromEl = document.getElementById("financeDateFrom");
const dateToEl = document.getElementById("financeDateTo");

const state = {
  rooms: [],
  filteredRooms: [],
  fetchMeta: null,
  fetchSignature: "",
};

function escapeHtml(value = "") {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function groupRoomsByDay(rows = []) {
  return rows.reduce((groups, row) => {
    const key = row.dayKey || String(row.periodMs || "unknown");
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: formatDateLabel(row.periodMs),
        rooms: [],
      });
    }
    groups.get(key).rooms.push(row);
    return groups;
  }, new Map());
}

function collectFilters() {
  return {
    search: searchInputEl?.value || "",
    period: periodSelectEl?.value || "today",
    dayKey: daySelectEl?.value || "all",
    botFilter: botSelectEl?.value || "all",
    winnerFilter: winnerSelectEl?.value || "all",
    stakeFilter: stakeSelectEl?.value || "all",
    sortBy: sortSelectEl?.value || "recent",
    roomLimit: roomLimitSelectEl?.value || "50",
    dateFrom: dateFromEl?.value || "",
    dateTo: dateToEl?.value || "",
  };
}

function syncCustomDateVisibility() {
  const isCustom = (periodSelectEl?.value || "") === "custom";
  dateFromEl?.toggleAttribute("required", isCustom);
  dateToEl?.toggleAttribute("required", false);
  document.getElementById("financeCustomRange")?.classList.toggle("hidden", !isCustom);
}

function getFetchSignature() {
  const filters = collectFilters();
  return JSON.stringify({
    period: filters.period,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    fetchLimit: DEFAULT_FINANCE_FETCH_LIMIT,
  });
}

async function refreshDatasetIfNeeded(force = false) {
  const nextSignature = getFetchSignature();
  if (!force && state.fetchSignature === nextSignature) return;

  const filters = collectFilters();
  const response = await loadFinanceRooms({
    period: filters.period,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    fetchLimit: DEFAULT_FINANCE_FETCH_LIMIT,
  });

  state.rooms = response.rows || [];
  state.fetchMeta = response.fetchMeta || null;
  state.fetchSignature = nextSignature;
}

function renderStakeOptions(rows = []) {
  const currentValue = stakeSelectEl?.value || "all";
  const options = getStakeOptions(rows);
  if (!stakeSelectEl) return;

  stakeSelectEl.innerHTML = `<option value="all">Toutes les mises</option>${options
    .map((value) => `<option value="${value}">${value} Does</option>`)
    .join("")}`;

  if (options.some((value) => String(value) === currentValue)) {
    stakeSelectEl.value = currentValue;
  } else {
    stakeSelectEl.value = "all";
  }
}

function renderDayOptions(rows = []) {
  if (!daySelectEl) return;
  const currentValue = daySelectEl.value || "all";
  const options = getDayOptions(rows);
  daySelectEl.innerHTML = `<option value="all">Toutes les journées</option>${options
    .map((item) => `<option value="${escapeHtml(item.value)}">${escapeHtml(item.label)} (${item.count})</option>`)
    .join("")}`;

  if (options.some((item) => item.value === currentValue)) {
    daySelectEl.value = currentValue;
  } else {
    daySelectEl.value = "all";
  }
}

function renderStats(rows = []) {
  const stats = computeFinanceStats(rows);
  if (totalNetEl) totalNetEl.textContent = formatSignedDoes(stats.totalNetDoes);
  if (totalCollectedEl) totalCollectedEl.textContent = formatDoes(stats.totalCollectedDoes);
  if (totalPayoutEl) totalPayoutEl.textContent = formatDoes(stats.totalPayoutDoes);
  if (totalRoomsEl) totalRoomsEl.textContent = String(stats.totalRooms);
  if (botRoomsEl) botRoomsEl.textContent = `${stats.botRooms} salles (${stats.botRoomRate}%)`;
  if (botWinRateEl) botWinRateEl.textContent = `${stats.botWins} victoires bot (${stats.botWinRate}%)`;
  if (averageNetEl) averageNetEl.textContent = formatSignedDoes(stats.averageNetDoes);
  if (exposureNoteEl) {
    exposureNoteEl.textContent = `Cette vue calcule le résultat jeu réalisé sur ${stats.totalRooms} salles filtrées, sans modifier les flux métier.`;
  }
  totalNetEl?.classList.toggle("positive", stats.totalNetDoes > 0);
  totalNetEl?.classList.toggle("negative", stats.totalNetDoes < 0);
}

function renderFetchMeta() {
  if (!fetchMetaEl) return;
  if (!state.fetchMeta) {
    fetchMetaEl.textContent = "";
    return;
  }
  const { windowLabel, loadedCount, fetchLimit, capped } = state.fetchMeta;
  fetchMetaEl.textContent = capped
    ? `Fenêtre ${windowLabel} · ${loadedCount} salles récentes chargées sur un plafond de ${fetchLimit}. Les cartes restent fluides, mais les chiffres de cette fenêtre doivent être lus comme un échantillon récent tant qu’on n’a pas d’agrégats journaliers côté backend.`
    : `Fenêtre ${windowLabel} · ${loadedCount} salles chargées.`;
}

function renderTrend(rows = []) {
  if (!trendChartEl) return;
  const series = buildFinanceTrend(rows, 10);
  if (!series.length) {
    trendChartEl.innerHTML = `<p class="empty-copy">Aucune salle terminée sur cette fenêtre.</p>`;
    return;
  }

  const maxAbs = Math.max(...series.map((item) => Math.abs(Number(item.netDoes) || 0)), 1);
  trendChartEl.innerHTML = series.map((item) => {
    const value = Number(item.netDoes) || 0;
    const ratio = Math.min(100, Math.round((Math.abs(value) / maxAbs) * 100));
    const barClass = value >= 0 ? "bar-positive" : "bar-negative";
    return `
      <div class="trend-row">
        <div class="trend-meta">
          <strong>${escapeHtml(item.label)}</strong>
          <span>${item.rooms} salle${item.rooms > 1 ? "s" : ""}</span>
        </div>
        <div class="trend-track">
          <span class="trend-bar ${barClass}" style="width:${Math.max(ratio, 6)}%"></span>
        </div>
        <div class="trend-value ${value >= 0 ? "positive" : "negative"}">${escapeHtml(formatSignedDoes(value))}</div>
      </div>
    `;
  }).join("");
}

function renderBotMix(rows = []) {
  if (!botMixChartEl) return;
  const mix = buildBotMix(rows);
  const maxRooms = Math.max(...mix.map((item) => item.rooms), 1);
  botMixChartEl.innerHTML = mix.map((item) => {
    const width = Math.max(item.rooms > 0 ? Math.round((item.rooms / maxRooms) * 100) : 0, item.rooms > 0 ? 10 : 0);
    return `
      <div class="mix-card">
        <div class="mix-head">
          <strong>${escapeHtml(item.label)}</strong>
          <span>${item.rooms} salle${item.rooms > 1 ? "s" : ""}</span>
        </div>
        <div class="mix-track"><span class="mix-fill" style="width:${width}%"></span></div>
        <div class="mix-grid-inline">
          <span>Net <b class="${item.netDoes >= 0 ? "positive" : "negative"}">${escapeHtml(formatSignedDoes(item.netDoes))}</b></span>
          <span>Humains gagnent <b>${item.humanWins}</b></span>
          <span>Bots gagnent <b>${item.botWins}</b></span>
        </div>
      </div>
    `;
  }).join("");
}

function bindDayDigestClicks() {
  if (!dayDigestEl || !daySelectEl) return;
  dayDigestEl.querySelectorAll("[data-day-key]").forEach((button) => {
    button.addEventListener("click", () => {
      const dayKey = button.getAttribute("data-day-key") || "all";
      daySelectEl.value = daySelectEl.value === dayKey ? "all" : dayKey;
      applyFilters();
    });
  });
}

function renderDayDigest(rows = []) {
  if (!dayDigestEl) return;
  const selectedDayKey = daySelectEl?.value || "all";
  const days = buildDailySummaries(rows, 8);
  if (!days.length) {
    dayDigestEl.innerHTML = `<p class="empty-copy">Aucune journée disponible avec les filtres actuels.</p>`;
    return;
  }

  dayDigestEl.innerHTML = days.map((day) => {
    const activeClass = selectedDayKey === day.dayKey ? " is-active" : "";
    return `
      <button type="button" class="digest-card${activeClass}" data-day-key="${escapeHtml(day.dayKey)}" aria-pressed="${selectedDayKey === day.dayKey ? "true" : "false"}">
        <p class="room-kicker">${escapeHtml(day.label)}</p>
        <strong class="digest-net ${day.netDoes >= 0 ? "positive" : "negative"}">${escapeHtml(formatSignedDoes(day.netDoes))}</strong>
        <div class="digest-grid">
          <span>${day.rooms} salle${day.rooms > 1 ? "s" : ""}</span>
          <span>Encaisse ${escapeHtml(formatDoes(day.collectedDoes))}</span>
          <span>Payout ${escapeHtml(formatDoes(day.payoutDoes))}</span>
        </div>
      </button>
    `;
  }).join("");
  bindDayDigestClicks();
}

function renderRooms(rows = [], visibleLimit = 50) {
  if (!roomListEl || !roomCountEl || !roomEmptyEl || !roomRenderNoteEl) return;
  const safeLimit = Math.max(20, Number.parseInt(String(visibleLimit || 50), 10) || 50);
  const visibleRows = rows.slice(0, safeLimit);
  roomCountEl.textContent = `${rows.length} salle${rows.length > 1 ? "s" : ""} matchent les filtres`;
  roomRenderNoteEl.textContent = rows.length > safeLimit
    ? `Affichage limité aux ${safeLimit} salles les plus récentes pour garder la page fluide sur mobile.`
    : `Affichage complet des ${visibleRows.length} salles de la fenêtre chargée.`;

  if (!rows.length) {
    roomListEl.innerHTML = "";
    roomEmptyEl.classList.remove("hidden");
    return;
  }

  roomEmptyEl.classList.add("hidden");
  const grouped = [...groupRoomsByDay(visibleRows).values()];
  roomListEl.innerHTML = grouped.map((group) => `
    <section class="day-group">
      <header class="day-header">
        <h3>${escapeHtml(group.label)}</h3>
        <span>${group.rooms.length} salle${group.rooms.length > 1 ? "s" : ""}</span>
      </header>
      <div class="room-grid">
        ${group.rooms.map((row) => `
          <article class="room-card">
            <div class="room-topline">
              <span class="room-badge">${escapeHtml(row.compositionLabel)}</span>
              <span class="room-time">${escapeHtml(formatDateTime(row.periodMs))}</span>
            </div>
            <div class="room-heading">
              <div>
                <p class="room-kicker">Salle</p>
                <h4>${escapeHtml(row.id)}</h4>
              </div>
              <div class="room-net ${row.companyNetDoes >= 0 ? "positive" : "negative"}">${escapeHtml(formatSignedDoes(row.companyNetDoes))}</div>
            </div>
            <div class="room-stats">
              <div><span>Mise</span><strong>${escapeHtml(formatDoes(row.entryCostDoes))}</strong></div>
              <div><span>Encaisse</span><strong>${escapeHtml(formatDoes(row.companyCollectedDoes))}</strong></div>
              <div><span>Payout</span><strong>${escapeHtml(formatDoes(row.companyPayoutDoes))}</strong></div>
              <div><span>Gagnant</span><strong>${escapeHtml(row.winnerLabel)}</strong></div>
            </div>
            <div class="room-players">
              ${(row.players || []).length
                ? row.players.map((player) => `<span class="player-pill">${escapeHtml(player.displayName)}</span>`).join("")
                : `<span class="player-pill muted">Aucun joueur humain</span>`}
            </div>
          </article>
        `).join("")}
      </div>
    </section>
  `).join("");
}

function applyFilters() {
  const filters = collectFilters();
  const baseFilters = { ...filters, dayKey: "all" };
  const baseRows = filterFinanceRooms(state.rooms, baseFilters);
  renderStakeOptions(state.rooms);
  renderDayOptions(baseRows);

  const finalFilters = { ...filters, dayKey: daySelectEl?.value || "all" };
  state.filteredRooms = filterFinanceRooms(state.rooms, finalFilters);
  renderStats(state.filteredRooms);
  renderFetchMeta();
  renderTrend(state.filteredRooms);
  renderBotMix(state.filteredRooms);
  renderDayDigest(baseRows);
  renderRooms(state.filteredRooms, finalFilters.roomLimit);
}

async function handleWindowChange(force = false) {
  try {
    loadingEl?.classList.remove("hidden");
    if (!force) {
      errorEl?.classList.add("hidden");
    }
    await refreshDatasetIfNeeded(force);
    applyFilters();
    loadingEl?.classList.add("hidden");
    contentEl?.classList.remove("hidden");
  } catch (error) {
    console.error("[FINANCE] reload failed", error);
    loadingEl?.classList.add("hidden");
    if (errorEl) {
      errorEl.textContent = error?.message || "Impossible de recharger la fenêtre finance.";
      errorEl.classList.remove("hidden");
    }
  }
}

function bindFilters() {
  searchInputEl?.addEventListener("input", applyFilters);
  [botSelectEl, winnerSelectEl, stakeSelectEl, sortSelectEl, roomLimitSelectEl, daySelectEl]
    .filter(Boolean)
    .forEach((element) => {
      element.addEventListener("change", applyFilters);
    });

  [periodSelectEl, dateFromEl, dateToEl]
    .filter(Boolean)
    .forEach((element) => {
      element.addEventListener("change", async () => {
        syncCustomDateVisibility();
        await handleWindowChange();
      });
    });
}

async function init() {
  try {
    const adminUser = await ensureFinanceAccess("Finance réelle");
    if (adminEmailEl) {
      adminEmailEl.textContent = adminUser?.email || adminUser?.uid || "Admin connecté";
    }

    syncCustomDateVisibility();
    await handleWindowChange(true);
  } catch (error) {
    console.error("[FINANCE] init failed", error);
    loadingEl?.classList.add("hidden");
    if (errorEl) {
      errorEl.textContent = error?.message || "Impossible de charger le dashboard finance.";
      errorEl.classList.remove("hidden");
    }
  }
}

bindFilters();
void init();

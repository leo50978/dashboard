import { ensureFinanceDashboardSession } from "./dashboard-admin-auth.js";
import {
  getChampionnaDashboardSnapshotSecure,
  removeChampionnaRegistrationSecure,
  updateChampionnaMatchScoreSecure,
} from "./secure-functions.js?v=20260601-championna-remove1";

const state = {
  loading: false,
  savingMatchId: "",
  removingRegistrationId: "",
  selectedGameKey: "domino",
  snapshot: null,
};

const dom = {
  gameSelect: document.getElementById("championnaGameSelect"),
  refreshBtn: document.getElementById("championnaRefreshBtn"),
  status: document.getElementById("championnaStatus"),
  registeredMetric: document.getElementById("championnaRegisteredMetric"),
  completedMetric: document.getElementById("championnaCompletedMetric"),
  stateMetric: document.getElementById("championnaStateMetric"),
  winnerMetric: document.getElementById("championnaWinnerMetric"),
  registeredList: document.getElementById("championnaRegisteredList"),
  matches: document.getElementById("championnaMatches"),
};

function safeInt(value) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.trunc(num) : 0;
}

function escapeHtml(value = "") {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setStatus(message = "", tone = "neutral") {
  if (!dom.status) return;
  dom.status.textContent = String(message || "");
  dom.status.dataset.tone = tone;
}

function getParts() {
  const snapshot = state.snapshot && typeof state.snapshot === "object" ? state.snapshot : {};
  return {
    games: Array.isArray(snapshot.games) ? snapshot.games : [],
    registrationsByGame: snapshot.registrationsByGame && typeof snapshot.registrationsByGame === "object" ? snapshot.registrationsByGame : {},
    bracketsByGame: snapshot.bracketsByGame && typeof snapshot.bracketsByGame === "object" ? snapshot.bracketsByGame : {},
  };
}

function groupMatchesByRound(matches = []) {
  const groups = [];
  const byKey = new Map();
  (Array.isArray(matches) ? matches : []).forEach((match) => {
    const roundOrder = safeInt(match?.roundOrder || 99);
    const label = String(match?.roundLabel || "Match").replace(/\s+-\s+Match\s+\d+$/i, "");
    const key = `${roundOrder}_${label}`;
    if (!byKey.has(key)) {
      byKey.set(key, { label, matches: [] });
      groups.push(byKey.get(key));
    }
    byKey.get(key).matches.push(match);
  });
  return groups;
}

function renderGameSelect(games = []) {
  if (!dom.gameSelect || !games.length) return;
  dom.gameSelect.innerHTML = games.map((game) => `
    <option value="${escapeHtml(game.key)}" ${game.key === state.selectedGameKey ? "selected" : ""}>
      ${escapeHtml(game.name)} (${safeInt(game.registrationCount)}/8)
    </option>
  `).join("");
}

function render() {
  const { games, registrationsByGame, bracketsByGame } = getParts();
  const gameKey = state.selectedGameKey || "domino";
  const registrations = registrationsByGame[gameKey] || [];
  const bracket = bracketsByGame[gameKey] || null;
  const matches = Array.isArray(bracket?.matches) ? bracket.matches : [];
  const completed = matches.filter((match) => String(match?.status || "") === "completed");

  renderGameSelect(games);
  if (dom.registeredMetric) dom.registeredMetric.textContent = `${registrations.length}/8`;
  if (dom.completedMetric) dom.completedMetric.textContent = `${completed.length}/${matches.length || 7}`;
  if (dom.stateMetric) dom.stateMetric.textContent = bracket?.status || (bracket ? "active" : "attente");
  if (dom.winnerMetric) dom.winnerMetric.textContent = bracket?.championName || "-";
  if (dom.refreshBtn) dom.refreshBtn.disabled = state.loading;
  renderRegisteredList(registrations, bracket);

  if (!bracket) {
    if (dom.matches) {
      dom.matches.innerHTML = `<div class="empty">Aucun bracket pour ce jeu pour le moment. Inscrits: ${escapeHtml(String(registrations.length))}/8.</div>`;
    }
    setStatus(state.loading ? "Chargement..." : "Aucun calendrier cree pour ce jeu.", state.loading ? "neutral" : "error");
    return;
  }

  setStatus(state.loading ? "Chargement..." : "Dashboard Championna pret.", state.loading ? "neutral" : "success");
  if (!matches.length) {
    dom.matches.innerHTML = `<div class="empty">Le bracket existe, mais aucun match n'est encore disponible.</div>`;
    return;
  }

  dom.matches.innerHTML = groupMatchesByRound(matches).map((group) => `
    <section>
      <h3 class="round-title">${escapeHtml(group.label)}</h3>
      <div class="round-grid">${group.matches.map(renderMatch).join("")}</div>
    </section>
  `).join("");

  dom.matches.querySelectorAll("[data-score-form]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void saveScore({
        matchId: form.getAttribute("data-match-id"),
        homeScore: form.querySelector("[data-home-score]")?.value,
        awayScore: form.querySelector("[data-away-score]")?.value,
      });
    });
  });
}

function renderRegisteredList(registrations = [], bracket = null) {
  if (!dom.registeredList) return;
  const safeRows = Array.isArray(registrations) ? registrations : [];
  if (!safeRows.length) {
    dom.registeredList.innerHTML = `<div class="empty">Pa gen inscrit pou ce jeu.</div>`;
    return;
  }

  const matches = Array.isArray(bracket?.matches) ? bracket.matches : [];
  const hasCompletedMatch = matches.some((match) => String(match?.status || "") === "completed");
  dom.registeredList.innerHTML = safeRows.map((row) => {
    const rowId = String(row?.id || "").trim();
    const uid = String(row?.uid || "").trim();
    const busy = state.removingRegistrationId === rowId;
    const disabled = state.loading || Boolean(state.removingRegistrationId) || hasCompletedMatch || !rowId || !uid;
    const title = hasCompletedMatch
      ? "Retrait bloque: un match est deja termine."
      : "Retirer cet inscrit du championna.";
    return `
      <article class="registered-row">
        <div class="registered-row__main">
          <strong>${escapeHtml(row?.username || "Utilisateur")}</strong>
          <span>${escapeHtml(uid || rowId)} - ${escapeHtml(row?.gameName || state.selectedGameKey)}</span>
        </div>
        <button class="danger-btn" type="button" data-remove-registration data-registration-id="${escapeHtml(rowId)}" data-uid="${escapeHtml(uid)}" ${disabled ? "disabled" : ""} title="${escapeHtml(title)}">
          ${escapeHtml(busy ? "Retrait..." : "Retirer")}
        </button>
      </article>
    `;
  }).join("");

  dom.registeredList.querySelectorAll("[data-remove-registration]").forEach((button) => {
    button.addEventListener("click", () => {
      const username = button.closest(".registered-row")?.querySelector("strong")?.textContent?.trim() || "cet inscrit";
      const ok = window.confirm(`Retirer ${username} du championna ${state.selectedGameKey}?`);
      if (!ok) return;
      void removeRegistration({
        registrationId: button.getAttribute("data-registration-id"),
        uid: button.getAttribute("data-uid"),
      });
    });
  });
}

function renderMatch(match = {}) {
  const matchId = String(match?.id || "").trim();
  const completed = String(match?.status || "") === "completed";
  const ready = Boolean(match?.homeUid && match?.awayUid);
  const saving = state.savingMatchId === matchId;
  const homeScore = match?.homeScore == null ? "" : safeInt(match.homeScore);
  const awayScore = match?.awayScore == null ? "" : safeInt(match.awayScore);
  const winner = completed && match?.winnerName ? `Gagnant: ${match.winnerName}` : ready ? "Pret pour score" : "Attend gagnant precedent";
  return `
    <article class="match-card">
      <div class="match-top">
        <div>
          <strong>${escapeHtml(match.roundLabel || matchId || "Match")}</strong>
          <p class="match-meta">${escapeHtml(winner)}</p>
        </div>
        <span class="status-pill ${completed ? "done" : ""}">${escapeHtml(completed ? "Termine" : "A jouer")}</span>
      </div>
      <div class="pair">
        <div class="player"><strong>${escapeHtml(match.homeName || "TBD")}</strong><span>Home</span></div>
        <div class="versus">${escapeHtml(completed ? `${homeScore} - ${awayScore}` : "VS")}</div>
        <div class="player"><strong>${escapeHtml(match.awayName || "TBD")}</strong><span>Away</span></div>
      </div>
      <form class="score-form" data-score-form data-match-id="${escapeHtml(matchId)}">
        <div><label>Score home</label><input type="number" min="0" max="2" step="1" value="${escapeHtml(String(homeScore))}" data-home-score ${!ready || saving ? "disabled" : ""} /></div>
        <div><label>Score away</label><input type="number" min="0" max="2" step="1" value="${escapeHtml(String(awayScore))}" data-away-score ${!ready || saving ? "disabled" : ""} /></div>
        <button class="action-btn primary" type="submit" ${!ready || saving ? "disabled" : ""}>${escapeHtml(saving ? "Sauvegarde..." : "Sauver score")}</button>
      </form>
    </article>
  `;
}

async function refreshDashboard() {
  if (state.loading) return;
  state.loading = true;
  render();
  try {
    const snapshot = await getChampionnaDashboardSnapshotSecure({});
    state.snapshot = snapshot || {};
  } catch (error) {
    console.error("[DCHAMPIONNA] snapshot failed", error);
    setStatus(error?.message || "Impossible de charger Championna.", "error");
  } finally {
    state.loading = false;
    render();
  }
}

async function saveScore({ matchId = "", homeScore = "", awayScore = "" } = {}) {
  const normalizedMatchId = String(matchId || "").trim();
  if (!normalizedMatchId || state.savingMatchId) return;
  state.savingMatchId = normalizedMatchId;
  render();
  try {
    await updateChampionnaMatchScoreSecure({
      gameKey: state.selectedGameKey,
      matchId: normalizedMatchId,
      homeScore: safeInt(homeScore),
      awayScore: safeInt(awayScore),
    });
    setStatus("Score sauvegarde. Le site public est mis a jour.", "success");
    await refreshDashboard();
  } catch (error) {
    console.error("[DCHAMPIONNA] update score failed", error);
    setStatus(error?.message || "Impossible de sauvegarder le score.", "error");
  } finally {
    state.savingMatchId = "";
    render();
  }
}

async function removeRegistration({ registrationId = "", uid = "" } = {}) {
  const normalizedRegistrationId = String(registrationId || "").trim();
  const normalizedUid = String(uid || "").trim();
  if (!normalizedRegistrationId || !normalizedUid || state.removingRegistrationId) return;
  state.removingRegistrationId = normalizedRegistrationId;
  render();
  try {
    await removeChampionnaRegistrationSecure({
      gameKey: state.selectedGameKey,
      registrationId: normalizedRegistrationId,
      uid: normalizedUid,
    });
    setStatus("Inscrit retire. Le site public va se mettre a jour.", "success");
    await refreshDashboard();
  } catch (error) {
    console.error("[DCHAMPIONNA] remove registration failed", error);
    setStatus(error?.message || "Impossible de retirer cet inscrit.", "error");
  } finally {
    state.removingRegistrationId = "";
    render();
  }
}

function bindEvents() {
  dom.gameSelect?.addEventListener("change", () => {
    state.selectedGameKey = String(dom.gameSelect.value || "domino").trim() || "domino";
    render();
  });
  dom.refreshBtn?.addEventListener("click", () => void refreshDashboard());
}

async function bootstrap() {
  bindEvents();
  render();
  await ensureFinanceDashboardSession({
    title: "Dashboard Championna",
    description: "Connecte-toi avec le compte admin autorise pour manager les scores Championna.",
  });
  await refreshDashboard();
}

void bootstrap();

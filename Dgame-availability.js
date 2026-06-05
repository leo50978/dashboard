import { ensureFinanceDashboardSession } from "./dashboard-admin-auth.js";
import {
  db,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "./firebase-init.js";

const PUBLIC_SETTINGS_DOC = "public_app_settings";
const DEFAULT_GAME_AVAILABILITY = Object.freeze({
  pongEnabled: true,
  dominoClassicEnabled: true,
  dominoDuelPublicEnabled: true,
  ludoEnabled: true,
});

const GAME_META = Object.freeze({
  pong: {
    label: "Pong",
    field: "pongEnabled",
    statusOpen: "Pong actif",
    statusClosed: "Pong ferme",
    copyOpen: "Les utilisateurs peuvent lancer Pong depuis la page d'accueil.",
    copyClosed: "Le site affiche maintenant une modal d'indisponibilite pour Pong.",
  },
  ludo: {
    label: "Ludo",
    field: "ludoEnabled",
    statusOpen: "Ludo actif",
    statusClosed: "Ludo ferme",
    copyOpen: "Les utilisateurs peuvent lancer Ludo depuis la page d'accueil.",
    copyClosed: "Le site affiche maintenant une modal d'indisponibilite pour Ludo.",
  },
  dominoDuelPublic: {
    label: "Domino duel 2 joueurs",
    field: "dominoDuelPublicEnabled",
    statusOpen: "Domino duel actif",
    statusClosed: "Domino duel ferme",
    copyOpen: "Les utilisateurs peuvent ouvrir Domino duel depuis la page d'accueil.",
    copyClosed: "Le site ferme maintenant tout Domino duel et affiche une modal d'indisponibilite.",
  },
  dominoClassic: {
    label: "Domino 4 player",
    field: "dominoClassicEnabled",
    statusOpen: "Domino 4 player actif",
    statusClosed: "Domino 4 player ferme",
    copyOpen: "Les utilisateurs peuvent choisir Domino 4 player depuis la modal DOMINO.",
    copyClosed: "Le site affiche maintenant une modal d'indisponibilite pour Domino 4 player.",
  },
});

const GAME_KEYS = Object.freeze(Object.keys(GAME_META));

const dom = {
  status: document.getElementById("gameAvailabilityStatus"),
  lastUpdate: document.getElementById("lastGameAvailabilityUpdate"),
  reloadBtn: document.getElementById("reloadGameAvailabilityBtn"),
  closeAllBtn: document.getElementById("closeAllGamesBtn"),
  openAllBtn: document.getElementById("openAllGamesBtn"),
  actionButtons: Array.from(document.querySelectorAll("[data-game-key][data-game-next-state]")),
};

let currentAdmin = null;
let currentSnapshot = {
  ...DEFAULT_GAME_AVAILABILITY,
  updatedAtMs: 0,
  updatedByEmail: "",
};

function setStatus(message = "", tone = "") {
  if (!dom.status) return;
  dom.status.textContent = String(message || "");
  dom.status.classList.remove("error", "success");
  if (tone === "error") dom.status.classList.add("error");
  if (tone === "success") dom.status.classList.add("success");
}

function setLoading(isLoading) {
  [dom.reloadBtn, dom.closeAllBtn, dom.openAllBtn, ...dom.actionButtons].forEach((button) => {
    if (button) button.disabled = isLoading;
  });
}

function formatDateTime(value) {
  const date = new Date(Number(value) || 0);
  if (!Number.isFinite(date.getTime()) || date.getTime() <= 0) return "Aucune mise a jour";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function normalizeSnapshot(raw = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    pongEnabled: source.pongEnabled !== false,
    dominoClassicEnabled: source.dominoClassicEnabled !== false,
    dominoDuelPublicEnabled: source.dominoDuelPublicEnabled !== false,
    ludoEnabled: source.ludoEnabled !== false,
    updatedAtMs: Number(source.gameAvailabilityUpdatedAtMs || source.updatedAtMs || 0) || 0,
    updatedByEmail: String(
      source.gameAvailabilityUpdatedByEmail
      || source.updatedByEmail
      || source.lastUpdatedByEmail
      || ""
    ).trim(),
  };
}

function buildAvailabilityPatch(snapshot = currentSnapshot) {
  const normalized = normalizeSnapshot(snapshot);
  return GAME_KEYS.reduce((acc, gameKey) => {
    const fieldName = GAME_META[gameKey]?.field;
    if (!fieldName) return acc;
    acc[fieldName] = normalized[fieldName] !== false;
    return acc;
  }, {});
}

function renderGameCard(gameKey, isEnabled) {
  const card = document.querySelector(`[data-game-card="${gameKey}"]`);
  const badge = document.querySelector(`[data-game-status-badge="${gameKey}"]`);
  const copy = document.querySelector(`[data-game-status-copy="${gameKey}"]`);
  const meta = GAME_META[gameKey];
  if (!card || !badge || !copy || !meta) return;

  card.classList.toggle("is-closed", !isEnabled);
  badge.textContent = isEnabled ? meta.statusOpen : meta.statusClosed;
  badge.classList.toggle("is-open", isEnabled);
  badge.classList.toggle("is-closed", !isEnabled);
  copy.textContent = isEnabled ? meta.copyOpen : meta.copyClosed;
}

function renderSnapshot(snapshot = currentSnapshot) {
  currentSnapshot = normalizeSnapshot(snapshot);
  GAME_KEYS.forEach((gameKey) => {
    const fieldName = GAME_META[gameKey]?.field;
    renderGameCard(gameKey, currentSnapshot[fieldName] !== false);
  });

  if (dom.lastUpdate) {
    const updatedBy = currentSnapshot.updatedByEmail
      ? ` par ${currentSnapshot.updatedByEmail}`
      : "";
    dom.lastUpdate.textContent = currentSnapshot.updatedAtMs > 0
      ? `Derniere mise a jour: ${formatDateTime(currentSnapshot.updatedAtMs)}${updatedBy}.`
      : "Aucune mise a jour relevee pour l'instant.";
  }
}

async function loadAvailability() {
  setLoading(true);
  setStatus("Chargement des disponibilites jeux...");
  try {
    const snap = await getDoc(doc(db, "settings", PUBLIC_SETTINGS_DOC));
    const data = snap.exists() ? (snap.data() || {}) : {};
    renderSnapshot(data);
    setStatus("Disponibilite jeux chargee.", "success");
  } catch (error) {
    console.error("[DGAME_AVAILABILITY] load error", error);
    renderSnapshot(DEFAULT_GAME_AVAILABILITY);
    setStatus(error?.message || "Impossible de charger la disponibilite jeux.", "error");
  } finally {
    setLoading(false);
  }
}

async function saveAvailability(nextState = {}, successMessage = "Configuration enregistree.") {
  setLoading(true);
  setStatus("Enregistrement en cours...");

  const normalizedState = normalizeSnapshot({
    ...currentSnapshot,
    ...nextState,
  });
  const availabilityPatch = buildAvailabilityPatch(normalizedState);

  try {
    await setDoc(doc(db, "settings", PUBLIC_SETTINGS_DOC), {
      ...availabilityPatch,
      gameAvailabilityVersion: "gav-v2",
      gameAvailabilityUpdatedAtMs: Date.now(),
      gameAvailabilityUpdatedAt: serverTimestamp(),
      gameAvailabilityUpdatedByUid: String(currentAdmin?.uid || "").trim(),
      gameAvailabilityUpdatedByEmail: String(currentAdmin?.email || "").trim(),
    }, { merge: true });

    renderSnapshot({
      ...normalizedState,
      updatedAtMs: Date.now(),
      updatedByEmail: String(currentAdmin?.email || "").trim(),
    });
    setStatus(successMessage, "success");
    await loadAvailability();
  } catch (error) {
    console.error("[DGAME_AVAILABILITY] save error", error);
    setStatus(error?.message || "Impossible d'enregistrer la disponibilite jeux.", "error");
    setLoading(false);
  }
}

function buildBulkState(nextValue) {
  return GAME_KEYS.reduce((acc, gameKey) => {
    const fieldName = GAME_META[gameKey]?.field;
    if (!fieldName) return acc;
    acc[fieldName] = nextValue;
    return acc;
  }, {});
}

function bindActions() {
  dom.reloadBtn?.addEventListener("click", () => {
    loadAvailability();
  });

  dom.closeAllBtn?.addEventListener("click", () => {
    saveAvailability(
      buildBulkState(false),
      "Pong, Ludo, Domino duel et Domino 4 player sont maintenant fermes."
    );
  });

  dom.openAllBtn?.addEventListener("click", () => {
    saveAvailability(
      buildBulkState(true),
      "Pong, Ludo, Domino duel et Domino 4 player sont maintenant rouverts."
    );
  });

  dom.actionButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const gameKey = String(button.getAttribute("data-game-key") || "").trim();
      const nextStateRaw = String(button.getAttribute("data-game-next-state") || "").trim().toLowerCase();
      const meta = GAME_META[gameKey];
      if (!meta?.field) return;

      const nextValue = nextStateRaw === "open";
      saveAvailability({
        [meta.field]: nextValue,
      }, `${meta.label} est maintenant ${nextValue ? "ouvert" : "ferme"}.`);
    });
  });
}

async function boot() {
  try {
    currentAdmin = await ensureFinanceDashboardSession({ fallbackUrl: "./index.html" });
  } catch (_) {
    return;
  }

  bindActions();
  await loadAvailability();
}

boot();

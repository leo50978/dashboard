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
  ludoEnabled: true,
});

const GAME_META = Object.freeze({
  pong: {
    label: "Pong",
    statusOpen: "Pong actif",
    statusClosed: "Pong ferme",
    copyOpen: "Les utilisateurs peuvent lancer Pong depuis la page d'accueil.",
    copyClosed: "Le site affiche maintenant une modal d'indisponibilite pour Pong.",
  },
  ludo: {
    label: "Ludo",
    statusOpen: "Ludo actif",
    statusClosed: "Ludo ferme",
    copyOpen: "Les utilisateurs peuvent lancer Ludo depuis la page d'accueil.",
    copyClosed: "Le site affiche maintenant une modal d'indisponibilite pour Ludo.",
  },
  dominoClassic: {
    label: "Domino 4 player",
    statusOpen: "Domino 4 player actif",
    statusClosed: "Domino 4 player ferme",
    copyOpen: "Les utilisateurs peuvent choisir Domino 4 player depuis la modal DOMINO.",
    copyClosed: "Le site affiche maintenant une modal d'indisponibilite pour Domino 4 player.",
  },
});

const dom = {
  status: document.getElementById("gameAvailabilityStatus"),
  lastUpdate: document.getElementById("lastGameAvailabilityUpdate"),
  reloadBtn: document.getElementById("reloadGameAvailabilityBtn"),
  closeAllBtn: document.getElementById("closeAllGamesBtn"),
  openAllBtn: document.getElementById("openAllGamesBtn"),
  actionButtons: Array.from(document.querySelectorAll("[data-game-action]")),
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
  renderGameCard("pong", currentSnapshot.pongEnabled !== false);
  renderGameCard("ludo", currentSnapshot.ludoEnabled !== false);
  renderGameCard("dominoClassic", currentSnapshot.dominoClassicEnabled !== false);

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

  try {
    await setDoc(doc(db, "settings", PUBLIC_SETTINGS_DOC), {
      pongEnabled: normalizedState.pongEnabled !== false,
      dominoClassicEnabled: normalizedState.dominoClassicEnabled !== false,
      ludoEnabled: normalizedState.ludoEnabled !== false,
      gameAvailabilityVersion: "gav-v1",
      gameAvailabilityUpdatedAtMs: Date.now(),
      gameAvailabilityUpdatedAt: serverTimestamp(),
      gameAvailabilityUpdatedByUid: String(currentAdmin?.uid || "").trim(),
      gameAvailabilityUpdatedByEmail: String(currentAdmin?.email || "").trim(),
    }, { merge: true });

    await loadAvailability();
    setStatus(successMessage, "success");
  } catch (error) {
    console.error("[DGAME_AVAILABILITY] save error", error);
    setStatus(error?.message || "Impossible d'enregistrer la disponibilite jeux.", "error");
    setLoading(false);
  }
}

function bindActions() {
  dom.reloadBtn?.addEventListener("click", () => {
    loadAvailability();
  });

  dom.closeAllBtn?.addEventListener("click", () => {
    saveAvailability({
      pongEnabled: false,
      dominoClassicEnabled: false,
      ludoEnabled: false,
    }, "Pong, Ludo et Domino 4 player sont maintenant fermes.");
  });

  dom.openAllBtn?.addEventListener("click", () => {
    saveAvailability({
      pongEnabled: true,
      dominoClassicEnabled: true,
      ludoEnabled: true,
    }, "Pong, Ludo et Domino 4 player sont maintenant rouverts.");
  });

  dom.actionButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const raw = String(button.getAttribute("data-game-action") || "").trim();
      const [gameKey, action] = raw.split(":");
      if (!GAME_META[gameKey]) return;

      const nextValue = action === "open";
      const fieldName = gameKey === "pong"
        ? "pongEnabled"
        : gameKey === "ludo"
          ? "ludoEnabled"
          : "dominoClassicEnabled";
      saveAvailability({
        [fieldName]: nextValue,
      }, `${GAME_META[gameKey].label} est maintenant ${nextValue ? "ouvert" : "ferme"}.`);
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

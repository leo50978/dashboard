import { ensureDashboardServiceWorker } from "./push-subscriptions.js";

const DISMISS_KEY = "dlk_dashboard_pwa_prompt_dismissed_v1";
const installStateListeners = new Set();
let deferredInstallPrompt = null;
let installPromptBound = false;
let installPromptActive = false;

function isStandalone() {
  return window.matchMedia?.("(display-mode: standalone)")?.matches
    || window.navigator?.standalone === true;
}

function isIosSafari() {
  const ua = String(window.navigator?.userAgent || "").toLowerCase();
  const isIos = /iphone|ipad|ipod/.test(ua);
  const isSafari = ua.includes("safari") && !ua.includes("crios") && !ua.includes("fxios");
  return isIos && isSafari;
}

function readDismissed() {
  try {
    return window.sessionStorage?.getItem(DISMISS_KEY) === "true";
  } catch (_) {
    return false;
  }
}

function writeDismissed() {
  try {
    window.sessionStorage?.setItem(DISMISS_KEY, "true");
  } catch (_) {}
}

function clearDismissed() {
  try {
    window.sessionStorage?.removeItem(DISMISS_KEY);
  } catch (_) {}
}

function getInstallMode() {
  if (isStandalone()) return "installed";
  if (isIosSafari()) return "ios";
  if (deferredInstallPrompt) return "native";
  return "pending";
}

function getInstallState() {
  const mode = getInstallMode();
  switch (mode) {
    case "installed":
      return {
        mode,
        label: "Déjà installée",
        detail: "Le dashboard est déjà installé sur cet appareil.",
        actionLabel: "Ouvrir l’app",
      };
    case "ios":
      return {
        mode,
        label: "Ajout iPhone",
        detail: "Sur iPhone, utilise Partager > Sur l’écran d’accueil pour installer le dashboard.",
        actionLabel: "Voir les étapes",
      };
    case "native":
      return {
        mode,
        label: "Installation prête",
        detail: "Le navigateur a préparé l’installation. Un clic suffit pour ajouter le dashboard à l’écran d’accueil.",
        actionLabel: "Installer l’app",
      };
    default:
      return {
        mode,
        label: "Préparation",
        detail: "L’installation native n’est pas encore prête pour cette visite. Laisse la page chargée quelques instants ou reviens après une interaction.",
        actionLabel: "Préparer l’installation",
      };
  }
}

function notifyInstallState() {
  const state = getInstallState();
  installStateListeners.forEach((listener) => {
    try {
      listener(state);
    } catch (_) {}
  });
}

function ensurePromptHost() {
  let host = document.getElementById("dashboardPwaPrompt");
  if (host) return host;
  host = document.createElement("aside");
  host.id = "dashboardPwaPrompt";
  host.style.position = "fixed";
  host.style.right = "18px";
  host.style.bottom = "18px";
  host.style.zIndex = "8000";
  host.style.maxWidth = "360px";
  host.style.display = "none";
  document.body.appendChild(host);
  return host;
}

function renderPrompt({ title, body, ctaLabel, secondaryLabel = "Plus tard", onConfirm, onSecondary }) {
  const host = ensurePromptHost();
  host.innerHTML = `
    <div style="border-radius:24px;border:1px solid rgba(148,163,184,.18);background:rgba(8,15,28,.92);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);box-shadow:0 22px 48px rgba(2,8,23,.34);padding:18px;color:#eaf2ff;font-family:'Space Grotesk','Sora',sans-serif;">
      <p style="margin:0;font-size:.74rem;letter-spacing:.18em;text-transform:uppercase;color:#8de0ff;font-weight:700;">PWA</p>
      <h3 style="margin:10px 0 8px;font-size:1.15rem;line-height:1.2;">${title}</h3>
      <p style="margin:0;color:#a7b8d7;line-height:1.55;font-size:.94rem;">${body}</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px;">
        <button id="dashboardPwaConfirm" type="button" style="border:none;border-radius:999px;background:#38bdf8;color:#082032;padding:11px 16px;font-weight:800;cursor:pointer;">${ctaLabel}</button>
        <button id="dashboardPwaLater" type="button" style="border:1px solid rgba(148,163,184,.2);border-radius:999px;background:rgba(255,255,255,.04);color:#dce8ff;padding:11px 16px;font-weight:700;cursor:pointer;">${secondaryLabel}</button>
      </div>
    </div>
  `;
  host.style.display = "block";
  host.querySelector("#dashboardPwaConfirm")?.addEventListener("click", onConfirm);
  host.querySelector("#dashboardPwaLater")?.addEventListener("click", onSecondary);
}

function hidePrompt() {
  const host = document.getElementById("dashboardPwaPrompt");
  if (!host) return;
  host.style.display = "none";
}

function renderInstallPrompt() {
  if (readDismissed() || isStandalone() || installPromptActive) return;
  const state = getInstallState();
  if (state.mode === "pending") return;
  installPromptActive = true;
  renderPrompt({
    title: state.mode === "ios" ? "Ajouter le dashboard" : "Installer le dashboard",
    body: state.detail,
    ctaLabel: state.mode === "ios" ? "Voir les étapes" : "Installer",
    onConfirm: async () => {
      if (state.mode === "ios") {
        writeDismissed();
        installPromptActive = false;
        hidePrompt();
        notifyInstallState();
        return;
      }
      await triggerDashboardInstallPrompt();
      installPromptActive = false;
      hidePrompt();
      notifyInstallState();
    },
    onSecondary: () => {
      writeDismissed();
      installPromptActive = false;
      hidePrompt();
      notifyInstallState();
    },
  });
}

function bindNativePromptListener() {
  if (installPromptBound || typeof window === "undefined") return;
  installPromptBound = true;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    clearDismissed();
    notifyInstallState();
    renderInstallPrompt();
  });
  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    notifyInstallState();
    hidePrompt();
  });
}

export function subscribeDashboardInstallState(listener) {
  if (typeof listener !== "function") {
    return () => {};
  }
  installStateListeners.add(listener);
  listener(getInstallState());
  return () => installStateListeners.delete(listener);
}

export async function triggerDashboardInstallPrompt() {
  const state = getInstallState();
  if (state.mode === "installed") {
    return state;
  }
  if (state.mode === "ios") {
    renderPrompt({
      title: "Installer sur iPhone",
      body: "Appuie sur Partager dans Safari, puis choisis « Sur l’écran d’accueil ». L’application s’ouvrira ensuite comme une vraie app.",
      ctaLabel: "Compris",
      secondaryLabel: "Fermer",
      onConfirm: () => {
        hidePrompt();
      },
      onSecondary: () => {
        hidePrompt();
      },
    });
    return state;
  }
  if (!deferredInstallPrompt) {
    return state;
  }
  const prompt = deferredInstallPrompt;
  deferredInstallPrompt = null;
  prompt.prompt();
  await prompt.userChoice.catch(() => null);
  notifyInstallState();
  return getInstallState();
}

export function attachDashboardInstallButton(button, statusNode = null) {
  if (!button) return () => {};
  const applyState = (state) => {
    button.textContent = state.actionLabel;
    button.disabled = state.mode === "installed";
    button.setAttribute("aria-disabled", state.mode === "installed" ? "true" : "false");
    if (statusNode) {
      statusNode.textContent = state.detail;
    }
  };
  const unsubscribe = subscribeDashboardInstallState(applyState);
  const handleClick = async () => {
    await triggerDashboardInstallPrompt();
    applyState(getInstallState());
  };
  button.addEventListener("click", handleClick);
  return () => {
    unsubscribe();
    button.removeEventListener("click", handleClick);
  };
}

export async function initDashboardPwaInstallPrompt() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  bindNativePromptListener();
  notifyInstallState();
  if (readDismissed() || isStandalone()) return;

  await ensureDashboardServiceWorker().catch(() => null);

  if (isIosSafari()) {
    renderInstallPrompt();
  }
}

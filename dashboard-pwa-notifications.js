import { ensureDashboardServiceWorker } from "./push-subscriptions.js";
import { loadOrders } from "./orders-data.js";
import { loadWithdrawals } from "./withdrawals-data.js";

const NOTIFICATIONS_ENABLED_KEY = "kobposh_dashboard_notifications_enabled_v1";
const SEEN_PENDING_DEPOSIT_IDS_KEY = "kobposh_dashboard_seen_pending_deposit_ids_v1";
const SEEN_PENDING_WITHDRAWAL_IDS_KEY = "kobposh_dashboard_seen_pending_withdrawal_ids_v1";
const POLL_INTERVAL_MS = 45000;
const PANEL_ID = "kobposhDashboardPwaPanel";
const STYLE_ID = "kobposhDashboardPwaPanelStyle";

let installPromptEvent = null;
let pollingTimer = 0;
let pollingInFlight = false;
let started = false;

function readJsonArray(key) {
  try {
    const raw = window.localStorage?.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map((item) => String(item || "")).filter(Boolean) : [];
  } catch (_) {
    return [];
  }
}

function writeJsonArray(key, values) {
  try {
    const safeValues = Array.isArray(values) ? values.map((item) => String(item || "")).filter(Boolean).slice(0, 400) : [];
    window.localStorage?.setItem(key, JSON.stringify(safeValues));
  } catch (_) {}
}

function readNotificationPreference() {
  try {
    return window.localStorage?.getItem(NOTIFICATIONS_ENABLED_KEY) === "true";
  } catch (_) {
    return false;
  }
}

function writeNotificationPreference(enabled) {
  try {
    window.localStorage?.setItem(NOTIFICATIONS_ENABLED_KEY, enabled ? "true" : "false");
  } catch (_) {}
}

function isStandaloneDisplay() {
  return window.matchMedia?.("(display-mode: standalone)")?.matches === true || window.navigator?.standalone === true;
}

function formatInt(value) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Math.max(0, Number(value) || 0));
}

function formatHtg(value) {
  return `${formatInt(value)} HTG`;
}

function buildOrderKey(order = {}) {
  return `${String(order.clientId || "")}:${String(order.id || "")}`;
}

function buildWithdrawalKey(withdrawal = {}) {
  return `${String(withdrawal.clientId || "")}:${String(withdrawal.id || "")}`;
}

function getNotificationPermissionLabel() {
  if (!("Notification" in window)) return "Navigateur sans support notifications";
  if (Notification.permission === "granted") return "Notifications autorisees";
  if (Notification.permission === "denied") return "Notifications refusees";
  return "Notifications en attente d'autorisation";
}

function isNotificationGranted() {
  return "Notification" in window && Notification.permission === "granted";
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #${PANEL_ID} {
      position: fixed;
      right: max(16px, env(safe-area-inset-right, 0px));
      bottom: max(16px, env(safe-area-inset-bottom, 0px));
      z-index: 1200;
      width: min(92vw, 360px);
      border-radius: 24px;
      border: 1px solid rgba(148, 163, 184, 0.18);
      background:
        radial-gradient(circle at top right, rgba(46,183,255,.18), transparent 34%),
        linear-gradient(160deg, rgba(5, 15, 28, 0.96), rgba(10, 23, 40, 0.94));
      box-shadow: 0 26px 60px rgba(2, 8, 20, 0.38);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
      color: #edf7ff;
      padding: 18px;
    }
    #${PANEL_ID}.collapsed .dashboard-pwa-panel-body {
      display: none;
    }
    #${PANEL_ID} .dashboard-pwa-panel-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
    }
    #${PANEL_ID} .dashboard-pwa-kicker {
      margin: 0;
      font-size: 0.72rem;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: #8ad8ff;
      font-weight: 800;
    }
    #${PANEL_ID} .dashboard-pwa-title {
      margin: 8px 0 0;
      font-size: 1.18rem;
      line-height: 1.15;
      font-weight: 800;
    }
    #${PANEL_ID} .dashboard-pwa-copy,
    #${PANEL_ID} .dashboard-pwa-status,
    #${PANEL_ID} .dashboard-pwa-metrics,
    #${PANEL_ID} .dashboard-pwa-note {
      margin: 0;
      color: #a6bfd3;
      line-height: 1.65;
      font-size: 0.92rem;
    }
    #${PANEL_ID} .dashboard-pwa-panel-body {
      margin-top: 14px;
      display: grid;
      gap: 12px;
    }
    #${PANEL_ID} .dashboard-pwa-actions {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }
    #${PANEL_ID} .dashboard-pwa-btn,
    #${PANEL_ID} .dashboard-pwa-toggle {
      min-height: 44px;
      border-radius: 16px;
      border: 1px solid rgba(148, 163, 184, 0.16);
      padding: 11px 14px;
      font: inherit;
      font-weight: 800;
      cursor: pointer;
    }
    #${PANEL_ID} .dashboard-pwa-btn.primary {
      border: none;
      background: linear-gradient(135deg, #2eb7ff, #2bc48a);
      color: #04111b;
    }
    #${PANEL_ID} .dashboard-pwa-btn.secondary,
    #${PANEL_ID} .dashboard-pwa-toggle {
      background: rgba(255,255,255,.05);
      color: #edf7ff;
    }
    #${PANEL_ID} .dashboard-pwa-btn:disabled {
      opacity: .48;
      cursor: not-allowed;
    }
    #${PANEL_ID} .dashboard-pwa-toggle {
      width: 40px;
      min-width: 40px;
      min-height: 40px;
      padding: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 1.15rem;
    }
    @media (max-width: 640px) {
      #${PANEL_ID} {
        left: max(12px, env(safe-area-inset-left, 0px));
        right: max(12px, env(safe-area-inset-right, 0px));
        width: auto;
      }
      #${PANEL_ID} .dashboard-pwa-actions {
        grid-template-columns: 1fr;
      }
    }
  `;
  document.head.appendChild(style);
}

function ensurePanel() {
  ensureStyles();
  let panel = document.getElementById(PANEL_ID);
  if (panel) return panel;

  panel = document.createElement("aside");
  panel.id = PANEL_ID;
  panel.innerHTML = `
    <div class="dashboard-pwa-panel-head">
      <div>
        <p class="dashboard-pwa-kicker">PWA dashboard</p>
        <p class="dashboard-pwa-title">Instale dashboard la epi resevwa alèt yo</p>
      </div>
      <button type="button" class="dashboard-pwa-toggle" aria-label="Reduire le panneau">−</button>
    </div>
    <div class="dashboard-pwa-panel-body">
      <p class="dashboard-pwa-copy">Lè gen nouvo depo oswa nouvo retrait an atant, dashboard la ka voye yon notifikasyon natif sou aparèy la.</p>
      <p id="dashboardPwaStatus" class="dashboard-pwa-status">Etat en attente...</p>
      <p id="dashboardPwaMetrics" class="dashboard-pwa-metrics">Suivi pending en attente...</p>
      <div class="dashboard-pwa-actions">
        <button id="dashboardPwaInstallBtn" type="button" class="dashboard-pwa-btn secondary">Installer l'app</button>
        <button id="dashboardPwaNotificationsBtn" type="button" class="dashboard-pwa-btn primary">Activer les notifications</button>
        <button id="dashboardPwaTestBtn" type="button" class="dashboard-pwa-btn secondary">Tester</button>
        <button id="dashboardPwaDisableBtn" type="button" class="dashboard-pwa-btn secondary">Couper les alertes</button>
      </div>
      <p class="dashboard-pwa-note">Le mode actuel surveille les files depot pending et retrait pending et affiche une alerte native quand une nouvelle demande arrive.</p>
    </div>
  `;
  document.body.appendChild(panel);

  panel.querySelector(".dashboard-pwa-toggle")?.addEventListener("click", () => {
    const collapsed = panel.classList.toggle("collapsed");
    const toggle = panel.querySelector(".dashboard-pwa-toggle");
    if (toggle) {
      toggle.textContent = collapsed ? "+" : "−";
      toggle.setAttribute("aria-label", collapsed ? "Ouvrir le panneau" : "Reduire le panneau");
    }
  });

  panel.querySelector("#dashboardPwaInstallBtn")?.addEventListener("click", async () => {
    if (installPromptEvent) {
      await installPromptEvent.prompt();
      await installPromptEvent.userChoice.catch(() => null);
      installPromptEvent = null;
      updatePanelState();
      return;
    }
    const statusEl = document.getElementById("dashboardPwaStatus");
    if (statusEl) {
      statusEl.textContent = isStandaloneDisplay()
        ? "L'app dashboard deja lancee en mode installe."
        : "L'installation automatique n'est pas disponible ici. Ouvre le menu du navigateur puis choisis Installer l'application.";
    }
  });

  panel.querySelector("#dashboardPwaNotificationsBtn")?.addEventListener("click", async () => {
    try {
      await ensureDashboardServiceWorker().catch(() => null);
      if (!("Notification" in window)) {
        throw new Error("Navigateur san sipò notifikasyon.");
      }
      if (Notification.permission !== "granted") {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          throw new Error("Otorizasyon notifikasyon an pa t aksepte.");
        }
      }
      writeNotificationPreference(true);
      await showNativeNotification({
        title: "Kobposh Dashboard",
        body: "Notifikasyon yo aktive sou aparèy sa a.",
        url: "./index.html",
        tag: "dashboard_notifications_enabled",
      });
      updatePanelState();
      void pollPendingQueues({ allowNotifications: false });
    } catch (error) {
      const statusEl = document.getElementById("dashboardPwaStatus");
      if (statusEl) {
        statusEl.textContent = error?.message || "Impossible d'activer les notifications.";
      }
    }
  });

  panel.querySelector("#dashboardPwaDisableBtn")?.addEventListener("click", () => {
    writeNotificationPreference(false);
    updatePanelState();
  });

  panel.querySelector("#dashboardPwaTestBtn")?.addEventListener("click", async () => {
    try {
      await showNativeNotification({
        title: "Test dashboard",
        body: "Tout pare. W ap ka resevwa alèt pou depo ak retrait an atant.",
        url: "./index.html",
        tag: "dashboard_notification_test",
      });
    } catch (error) {
      const statusEl = document.getElementById("dashboardPwaStatus");
      if (statusEl) {
        statusEl.textContent = error?.message || "Test notification impossible.";
      }
    }
  });

  return panel;
}

function updatePanelState(extra = {}) {
  const panel = ensurePanel();
  const installBtn = panel.querySelector("#dashboardPwaInstallBtn");
  const notificationsBtn = panel.querySelector("#dashboardPwaNotificationsBtn");
  const disableBtn = panel.querySelector("#dashboardPwaDisableBtn");
  const testBtn = panel.querySelector("#dashboardPwaTestBtn");
  const statusEl = panel.querySelector("#dashboardPwaStatus");
  const metricsEl = panel.querySelector("#dashboardPwaMetrics");

  const notificationsEnabled = readNotificationPreference();
  const installed = isStandaloneDisplay();
  const installReady = !!installPromptEvent;

  if (installBtn) {
    installBtn.disabled = installed;
    installBtn.textContent = installed ? "App deja installee" : (installReady ? "Installer l'app" : "Installer l'app");
  }
  if (notificationsBtn) {
    notificationsBtn.disabled = notificationsEnabled && isNotificationGranted();
    notificationsBtn.textContent = notificationsEnabled && isNotificationGranted()
      ? "Notifications actives"
      : "Activer les notifications";
  }
  if (disableBtn) {
    disableBtn.disabled = !notificationsEnabled;
  }
  if (testBtn) {
    testBtn.disabled = !notificationsEnabled || !isNotificationGranted();
  }
  if (statusEl) {
    const statusBits = [
      installed ? "PWA installee" : "PWA non installee",
      getNotificationPermissionLabel(),
      notificationsEnabled ? "Alerte pending active" : "Alerte pending inactive",
    ];
    statusEl.textContent = extra.statusText || statusBits.join(" · ");
  }
  if (metricsEl && extra.metricsText) {
    metricsEl.textContent = extra.metricsText;
  }
}

async function showNativeNotification({ title, body, url, tag }) {
  if (!("Notification" in window)) {
    throw new Error("Navigateur san sipò notifikasyon.");
  }
  if (Notification.permission !== "granted") {
    throw new Error("Otorizasyon notifikasyon poko aktive.");
  }

  const registration = await ensureDashboardServiceWorker().catch(() => null);
  const payload = {
    body: String(body || ""),
    icon: "./apple-touch-icon.png",
    badge: "./favicon-96x96.png",
    tag: String(tag || `dashboard_${Date.now()}`),
    data: { url: String(url || "./index.html") },
  };

  if (registration?.showNotification) {
    await registration.showNotification(String(title || "Kobposh Dashboard"), payload);
    return;
  }

  const notification = new Notification(String(title || "Kobposh Dashboard"), payload);
  notification.onclick = () => {
    window.location.href = String(url || "./index.html");
    window.focus();
    notification.close();
  };
}

function summarizeNewItems(newRows = [], kind = "deposit") {
  if (!newRows.length) return null;
  if (newRows.length === 1) {
    const row = newRows[0] || {};
    const amount = formatHtg(row.amount);
    const name = String(row.customerName || row.customerEmail || row.clientId || "Client").trim();
    const method = String(row.methodName || row.destinationType || "").trim();
    return {
      title: kind === "deposit" ? "Nouvo depo an atant" : "Nouvo retrait an atant",
      body: `${name} · ${amount}${method ? ` · ${method}` : ""}`,
    };
  }
  return {
    title: kind === "deposit" ? "Nouvo depots an atant" : "Nouvo retraits an atant",
    body: `${newRows.length} nouvelle(s) demande(s) viennent d'arriver dans la file pending.`,
  };
}

async function pollPendingQueues({ allowNotifications = true } = {}) {
  if (pollingInFlight) return;
  pollingInFlight = true;
  try {
    const [ordersResult, withdrawalsResult] = await Promise.allSettled([
      loadOrders("pending"),
      loadWithdrawals("pending"),
    ]);

    const pendingOrders = ordersResult.status === "fulfilled" && Array.isArray(ordersResult.value) ? ordersResult.value : [];
    const pendingWithdrawals = withdrawalsResult.status === "fulfilled" && Array.isArray(withdrawalsResult.value) ? withdrawalsResult.value : [];

    const orderKeys = pendingOrders.map(buildOrderKey);
    const withdrawalKeys = pendingWithdrawals.map(buildWithdrawalKey);
    const storedOrderKeys = readJsonArray(SEEN_PENDING_DEPOSIT_IDS_KEY);
    const storedWithdrawalKeys = readJsonArray(SEEN_PENDING_WITHDRAWAL_IDS_KEY);
    const hasOrderBaseline = window.localStorage?.getItem(SEEN_PENDING_DEPOSIT_IDS_KEY) !== null;
    const hasWithdrawalBaseline = window.localStorage?.getItem(SEEN_PENDING_WITHDRAWAL_IDS_KEY) !== null;

    const newOrders = hasOrderBaseline
      ? pendingOrders.filter((order) => !storedOrderKeys.includes(buildOrderKey(order)))
      : [];
    const newWithdrawals = hasWithdrawalBaseline
      ? pendingWithdrawals.filter((item) => !storedWithdrawalKeys.includes(buildWithdrawalKey(item)))
      : [];

    writeJsonArray(SEEN_PENDING_DEPOSIT_IDS_KEY, orderKeys);
    writeJsonArray(SEEN_PENDING_WITHDRAWAL_IDS_KEY, withdrawalKeys);

    updatePanelState({
      metricsText: `En cours: ${formatInt(pendingOrders.length)} depot(s) pending · ${formatInt(pendingWithdrawals.length)} retrait(s) pending`,
    });

    const shouldNotify = allowNotifications && readNotificationPreference() && isNotificationGranted();
    if (shouldNotify) {
      const orderNotif = summarizeNewItems(newOrders, "deposit");
      if (orderNotif) {
        await showNativeNotification({
          ...orderNotif,
          url: "./Dorders-pending.html",
          tag: "dashboard_pending_deposits",
        });
      }
      const withdrawalNotif = summarizeNewItems(newWithdrawals, "withdrawal");
      if (withdrawalNotif) {
        await showNativeNotification({
          ...withdrawalNotif,
          url: "./Dwithdrawals-pending.html",
          tag: "dashboard_pending_withdrawals",
        });
      }
    }
  } catch (error) {
    updatePanelState({
      statusText: error?.message || "Le suivi pending n'a pas pu etre mis a jour.",
    });
  } finally {
    pollingInFlight = false;
  }
}

function bindInstallSignals() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPromptEvent = event;
    updatePanelState();
  });

  window.addEventListener("appinstalled", () => {
    installPromptEvent = null;
    updatePanelState({
      statusText: `${getNotificationPermissionLabel()} · PWA installee avec succes`,
    });
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void pollPendingQueues({ allowNotifications: false });
    }
  });

  window.addEventListener("online", () => {
    void pollPendingQueues({ allowNotifications: false });
  });
}

export async function initDashboardPwaExperience() {
  if (started) {
    updatePanelState();
    return;
  }
  started = true;
  ensurePanel();
  bindInstallSignals();
  await ensureDashboardServiceWorker().catch(() => null);
  updatePanelState();
  await pollPendingQueues({ allowNotifications: false });
  pollingTimer = window.setInterval(() => {
    void pollPendingQueues({ allowNotifications: true });
  }, POLL_INTERVAL_MS);
}

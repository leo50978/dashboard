import { dashboardRuntimeConfig, auth, functions, httpsCallable } from "./firebase-init.js";
import {
  registerDashboardPushSubscriptionSecure,
  unregisterDashboardPushSubscriptionSecure,
} from "./secure-functions.js";

const PUSH_PREF_KEY = "dlk_dashboard_push_enabled_v1";
const SW_URL = "./sw.js";

function readPushPreference() {
  try {
    return window.localStorage?.getItem(PUSH_PREF_KEY) === "true";
  } catch (_) {
    return false;
  }
}

function writePushPreference(enabled) {
  try {
    window.localStorage?.setItem(PUSH_PREF_KEY, enabled ? "true" : "false");
  } catch (_) {}
}

function urlBase64ToUint8Array(base64String = "") {
  const normalized = String(base64String || "").trim()
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  const base64 = normalized + padding;
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

let remoteRuntimeConfigPromise = null;

async function getRemoteRuntimeConfig() {
  if (remoteRuntimeConfigPromise) return remoteRuntimeConfigPromise;
  remoteRuntimeConfigPromise = (async () => {
    try {
      const callable = httpsCallable(functions, "getPublicRuntimeConfigSecure");
      const response = await callable({});
      return response?.data && typeof response.data === "object" ? response.data : {};
    } catch (_) {
      return {};
    }
  })();
  return remoteRuntimeConfigPromise;
}

async function getWebPushPublicKey() {
  const localValue = String(dashboardRuntimeConfig?.webPushPublicKey || "").trim();
  if (localValue) return localValue;
  const remoteConfig = await getRemoteRuntimeConfig();
  return String(remoteConfig?.dashboardWebPushPublicKey || "").trim();
}

function detectPlatform() {
  const ua = String(window.navigator?.userAgent || "").toLowerCase();
  if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ipod")) return "ios";
  if (ua.includes("android")) return "android";
  if (ua.includes("mac")) return "mac";
  if (ua.includes("win")) return "windows";
  return "web";
}

async function ensureServiceWorkerRegistration() {
  if (!("serviceWorker" in navigator)) {
    throw new Error("Service worker non supporté.");
  }
  const existing = await navigator.serviceWorker.getRegistration("./");
  if (existing) return existing;
  return navigator.serviceWorker.register(SW_URL, { scope: "./" });
}

export class DashboardPushSubscriptionController {
  constructor(options = {}) {
    this.defaultUrl = options.defaultUrl || "./Dpayment.html";
  }

  isSupported() {
    return typeof window !== "undefined"
      && "Notification" in window
      && "serviceWorker" in navigator
      && "PushManager" in window;
  }

  async getState() {
    const preferenceEnabled = readPushPreference();
    const permission = this.isSupported() ? Notification.permission : "unsupported";
    const publicKey = await getWebPushPublicKey();

    if (!this.isSupported()) {
      return {
        supported: false,
        permission,
        preferenceEnabled,
        subscribed: false,
        pushConfigured: !!publicKey,
      };
    }

    const registration = await ensureServiceWorkerRegistration();
    const subscription = await registration.pushManager.getSubscription();
    return {
      supported: true,
      permission,
      preferenceEnabled,
      subscribed: !!subscription,
      pushConfigured: !!publicKey,
      endpoint: subscription?.endpoint || "",
    };
  }

  async requestPermission() {
    if (!this.isSupported()) return "unsupported";
    if (Notification.permission === "granted") return "granted";
    return Notification.requestPermission();
  }

  async syncCurrentSubscription() {
    if (!this.isSupported()) return this.getState();
    const registration = await ensureServiceWorkerRegistration();
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription || !readPushPreference() || !auth.currentUser) {
      return this.getState();
    }
    await registerDashboardPushSubscriptionSecure({
      subscription: subscription.toJSON(),
      platform: detectPlatform(),
      userAgent: String(window.navigator?.userAgent || ""),
    });
    return this.getState();
  }

  async enable() {
    if (!this.isSupported()) {
      throw new Error("Notifications push non supportées sur cet appareil.");
    }
    const publicKey = await getWebPushPublicKey();
    if (!publicKey) {
      throw new Error("Clé publique Web Push absente du runtime dashboard.");
    }
    const permission = await this.requestPermission();
    if (permission !== "granted") {
      throw new Error("Permission notifications refusée.");
    }

    const registration = await ensureServiceWorkerRegistration();
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }

    writePushPreference(true);
    await registerDashboardPushSubscriptionSecure({
      subscription: subscription.toJSON(),
      platform: detectPlatform(),
      userAgent: String(window.navigator?.userAgent || ""),
    });
    return this.getState();
  }

  async disable() {
    if (!this.isSupported()) {
      writePushPreference(false);
      return this.getState();
    }
    const registration = await ensureServiceWorkerRegistration();
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await unregisterDashboardPushSubscriptionSecure({
        endpoint: subscription.endpoint,
      }).catch(() => {});
      await subscription.unsubscribe().catch(() => {});
    }
    writePushPreference(false);
    return this.getState();
  }

  async showTestNotification() {
    if (!this.isSupported()) {
      throw new Error("Notifications non supportées.");
    }
    const registration = await ensureServiceWorkerRegistration();
    await registration.showNotification("Dashboard Dominoes Lakay", {
      body: "Les notifications push du dashboard sont actives sur cet appareil.",
      icon: String(dashboardRuntimeConfig?.notificationIcon || "./apple-touch-icon.png"),
      badge: String(dashboardRuntimeConfig?.notificationBadge || "./favicon-96x96.png"),
      tag: "dashboard_push_test",
      data: {
        url: this.defaultUrl,
      },
    });
  }
}

export async function ensureDashboardServiceWorker() {
  if (!("serviceWorker" in navigator)) return null;
  return ensureServiceWorkerRegistration();
}

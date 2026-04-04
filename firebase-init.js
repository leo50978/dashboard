import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  initializeAppCheck,
  ReCaptchaV3Provider,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app-check.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  getIdTokenResult,
  sendPasswordResetEmail,
  signOut,
  sendEmailVerification,
  reload,
  applyActionCode,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFunctions,
  httpsCallable,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-functions.js";
 import {
  getFirestore,
  collection,
  collectionGroup,
  addDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  runTransaction,
  serverTimestamp,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  onSnapshot,
  deleteDoc,
  writeBatch,
  arrayUnion,
  increment,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

function readDashboardRuntimeConfig() {
  if (typeof window === "undefined") return {};
  const raw = window.__DASHBOARD_RUNTIME_CONFIG__;
  return raw && typeof raw === "object" ? raw : {};
}

function readRuntimeFirebaseConfig() {
  const runtime = readDashboardRuntimeConfig();
  const source = runtime.firebaseConfig && typeof runtime.firebaseConfig === "object"
    ? runtime.firebaseConfig
    : {};

  const fieldNames = Object.freeze({
    api: ["api", "Key"],
    auth: ["auth", "Domain"],
    project: ["project", "Id"],
    storage: ["storage", "Bucket"],
    messaging: ["messaging", "SenderId"],
    app: ["app", "Id"],
    measurement: ["measurement", "Id"],
  });
  const keyOf = (parts) => parts.join("");
  const readField = (parts) => String(source[keyOf(parts)] || "").trim();

  const config = {
    [keyOf(fieldNames.api)]: readField(fieldNames.api),
    [keyOf(fieldNames.auth)]: readField(fieldNames.auth),
    [keyOf(fieldNames.project)]: readField(fieldNames.project),
    [keyOf(fieldNames.storage)]: readField(fieldNames.storage),
    [keyOf(fieldNames.messaging)]: readField(fieldNames.messaging),
    [keyOf(fieldNames.app)]: readField(fieldNames.app),
    [keyOf(fieldNames.measurement)]: readField(fieldNames.measurement),
  };

  const missing = [
    keyOf(fieldNames.api),
    keyOf(fieldNames.auth),
    keyOf(fieldNames.project),
    keyOf(fieldNames.storage),
    keyOf(fieldNames.messaging),
    keyOf(fieldNames.app),
  ].filter((key) => !config[key]);

  if (missing.length) {
    throw new Error(
      `Configuration Firebase dashboard incomplète. Champs manquants: ${missing.join(", ")}.`
    );
  }

  return config;
}

const dashboardRuntimeConfig = readDashboardRuntimeConfig();
const firebaseConfig = readRuntimeFirebaseConfig();

function isDashboardAppCheckEnabled() {
  return dashboardRuntimeConfig?.appCheckEnabled === true;
}

function resolveRuntimeAuthDomain(defaultAuthDomain) {
  if (typeof window === "undefined") return defaultAuthDomain;

  const protocol = String(window.location?.protocol || "").trim().toLowerCase();
  const host = String(window.location?.hostname || "").trim().toLowerCase();
  if (!host) return defaultAuthDomain;
  if (protocol !== "http:" && protocol !== "https:") return defaultAuthDomain;
  if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".local")) {
    return defaultAuthDomain;
  }
  // Keep Firebase-managed auth domain on custom-hosted frontends (e.g. GitHub Pages)
  // to avoid redirect_uri_mismatch unless OAuth clients are explicitly configured
  // with custom-domain /__/auth/handler redirect URIs.
  if (host.endsWith(".firebaseapp.com") || host.endsWith(".web.app")) {
    return host;
  }
  return defaultAuthDomain;
}

firebaseConfig.authDomain = resolveRuntimeAuthDomain(firebaseConfig.authDomain);

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app);
const storage = getStorage(app);

function shouldSkipAppCheckOnCurrentPage() {
  if (typeof window === "undefined") return false;
  const path = String(window.location?.pathname || "").toLowerCase();
  const protocol = String(window.location?.protocol || "").toLowerCase();
  const host = String(window.location?.hostname || "").toLowerCase();
  const isLocalDevHost =
    protocol === "file:" ||
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.endsWith(".local");
  return (
    isLocalDevHost ||
    path.startsWith("/__/auth/")
  );
}

function readAppCheckSiteKey() {
  const runtimeValue = String(dashboardRuntimeConfig.appCheckSiteKey || "").trim();
  const meta = typeof document !== "undefined"
    ? document.querySelector('meta[name="firebase-app-check-site-key"]')
    : null;
  const metaValue = meta?.getAttribute("content") || "";
  const globalValue = typeof window !== "undefined" ? String(window.__DOMINO_APPCHECK_SITE_KEY || "") : "";
  const picked = String(runtimeValue || metaValue || globalValue || "").trim();
  if (!picked || picked === "REPLACE_WITH_RECAPTCHA_V3_SITE_KEY") return "";
  return picked;
}

function setupAppCheckDebugToken() {
  if (typeof window === "undefined") return;
  const debugToken = String(
    window.__DOMINO_APPCHECK_DEBUG_TOKEN ||
    window.localStorage?.getItem("domino_app_check_debug_token") ||
    ""
  ).trim();
  if (!debugToken) return;
  window.FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
}

let appCheck = null;
let appCheckBootstrapPromise = null;
let appCheckBootstrapScheduled = false;

function initializeAppCheckWithKey(siteKey) {
  const normalized = String(siteKey || "").trim();
  if (!normalized || normalized === "REPLACE_WITH_RECAPTCHA_V3_SITE_KEY") return false;
  if (appCheck) return true;
  if (typeof document !== "undefined" && !document.body) return false;

  try {
    appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(normalized),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (error) {
    const message = String(error?.message || "");
    // reCAPTCHA can fail if the page is not fully ready yet; allow a deferred retry.
    if (message.includes("placeholder element")) return false;
    throw error;
  }

  if (typeof window !== "undefined") {
    window.__DOMINO_APPCHECK_SITE_KEY = normalized;
  }

  return true;
}

async function bootstrapRemoteAppCheck() {
  if (shouldSkipAppCheckOnCurrentPage()) return null;
  if (appCheck || appCheckBootstrapPromise) return appCheckBootstrapPromise;

  appCheckBootstrapPromise = (async () => {
    try {
      const callable = httpsCallable(functions, "getPublicRuntimeConfigSecure");
      const response = await callable({});
      const payload = response?.data && typeof response.data === "object" ? response.data : {};
      const remoteSiteKey = String(payload.appCheckSiteKey || "").trim();
      if (initializeAppCheckWithKey(remoteSiteKey)) return;
    } catch (error) {
      if (typeof console !== "undefined") {
        console.warn("[APP_CHECK] config distante indisponible.", error);
      }
    }

    if (typeof console !== "undefined" && !appCheck) {
      console.warn("[APP_CHECK] firebase-app-check-site-key manquant; App Check web inactif.");
    }
  })();

  return appCheckBootstrapPromise;
}

function initializeAppCheckSafely() {
  if (!isDashboardAppCheckEnabled()) {
    if (typeof console !== "undefined") {
      console.info("[APP_CHECK] désactivé sur le dashboard.");
    }
    return;
  }

  if (shouldSkipAppCheckOnCurrentPage()) {
    if (typeof console !== "undefined") {
      console.info("[APP_CHECK] ignoré en environnement local/dev ou handler Firebase Auth.");
    }
    return;
  }

  setupAppCheckDebugToken();
  const siteKey = readAppCheckSiteKey();
  if (!initializeAppCheckWithKey(siteKey)) {
    void bootstrapRemoteAppCheck();
  }

  if (!appCheck && !appCheckBootstrapScheduled && typeof document !== "undefined" && document.readyState === "loading") {
    appCheckBootstrapScheduled = true;
    document.addEventListener(
      "DOMContentLoaded",
      () => {
        try {
          initializeAppCheckSafely();
        } catch (error) {
          if (typeof console !== "undefined") {
            console.warn("[APP_CHECK] initialisation différée échouée", error);
          }
        } finally {
          appCheckBootstrapScheduled = false;
        }
      },
      { once: true }
    );
  }
}

try {
  initializeAppCheckSafely();
} catch (error) {
  if (typeof console !== "undefined") {
    console.warn("[APP_CHECK] initialisation échouée", error);
  }
}

export {
  app,
  appCheck,
  auth,
  db,
  dashboardRuntimeConfig,
  functions,
  storage,
  httpsCallable,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  getIdTokenResult,
  sendPasswordResetEmail,
  signOut,
  sendEmailVerification,
  reload,
  applyActionCode,
  collection,
  collectionGroup,
  addDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  runTransaction,
  serverTimestamp,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  onSnapshot,
  deleteDoc,
  writeBatch,
  arrayUnion,
  increment,
  storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject,
};

import { auth, functions as firebaseFunctions, httpsCallable } from "./firebase-init.js";
import "./runtime-config.js";

const CALLABLE_CACHE = new Map();
const DEFAULT_HTTP_TIMEOUT_MS = 15000;

function getCallable(name) {
  const key = String(name || "").trim();
  if (!key) throw new Error("Callable name is required");
  if (!CALLABLE_CACHE.has(key)) {
    CALLABLE_CACHE.set(key, httpsCallable(firebaseFunctions, key));
  }
  return CALLABLE_CACHE.get(key);
}

function normalizeCallableError(err, fallback = "Erreur serveur") {
  const codeRaw = String(err?.code || "");
  const firebaseCode = codeRaw.startsWith("functions/") ? codeRaw.slice("functions/".length) : codeRaw;
  const details = err?.details && typeof err.details === "object" ? err.details : {};

  const normalized = new Error(String(err?.message || fallback));
  normalized.code = String(details.code || firebaseCode || "unknown");
  normalized.details = details;

  Object.keys(details).forEach((key) => {
    normalized[key] = details[key];
  });

  return normalized;
}

async function invokeCallable(name, payload = {}, fallbackError = "Erreur serveur") {
  try {
    const callable = getCallable(name);
    const response = await callable(payload);
    return response?.data || null;
  } catch (error) {
    console.error("[DASHBOARD_V2_CALLABLE] failed", {
      name,
      payload,
      code: error?.code || "",
      message: error?.message || "",
      details: error?.details || null,
    });
    throw normalizeCallableError(error, fallbackError);
  }
}

function getConfiguredApiBaseUrl() {
  if (typeof window === "undefined") return "";

  const localOverride = String(
    window.localStorage?.getItem("dashboard_api_base_url")
    || window.localStorage?.getItem("kobposh_api_base_url")
    || ""
  ).trim();
  if (localOverride) {
    return localOverride.replace(/\/+$/, "");
  }

  const globalOverride = String(window.__KOBPOSH_API_BASE_URL || "").trim();
  if (globalOverride) {
    return globalOverride.replace(/\/+$/, "");
  }

  const runtimeConfig = window.__DASHBOARD_RUNTIME_CONFIG__ && typeof window.__DASHBOARD_RUNTIME_CONFIG__ === "object"
    ? window.__DASHBOARD_RUNTIME_CONFIG__
    : {};
  const configured = String(runtimeConfig.apiBaseUrl || "").trim();
  return configured ? configured.replace(/\/+$/, "") : "";
}

function buildHttpBackendError(payload = {}, fallback = "Erreur serveur", status = 500) {
  const normalized = new Error(String(payload?.message || fallback));
  normalized.code = String(payload?.code || "unknown");
  normalized.details = payload?.details && typeof payload.details === "object" ? payload.details : {};
  normalized.httpStatus = Number(status) || 500;

  Object.keys(normalized.details).forEach((key) => {
    normalized[key] = normalized.details[key];
  });

  return normalized;
}

async function invokeBackendHttp(path, {
  payload = {},
  fallbackError = "Erreur serveur",
  requireAuth = false,
  method = "POST",
  timeoutMs = DEFAULT_HTTP_TIMEOUT_MS,
} = {}) {
  const baseUrl = getConfiguredApiBaseUrl();
  if (!baseUrl) {
    throw buildHttpBackendError({
      code: "http-backend-not-configured",
      message: "Backend HTTP non configure.",
    }, fallbackError, 503);
  }

  const headers = {
    "Content-Type": "application/json",
  };

  if (requireAuth) {
    const user = auth.currentUser;
    const token = await user?.getIdToken?.();
    if (!token) {
      throw buildHttpBackendError({
        code: "missing-auth-token",
        message: "Connexion requise.",
      }, fallbackError, 401);
    }
    headers.Authorization = `Bearer ${token}`;
  }

  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller
    ? window.setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || DEFAULT_HTTP_TIMEOUT_MS))
    : 0;

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: method === "GET" ? undefined : JSON.stringify(payload || {}),
      signal: controller?.signal,
    });

    const responseText = await response.text();
    let responseJson = {};
    try {
      responseJson = responseText ? JSON.parse(responseText) : {};
    } catch (_) {
      responseJson = {};
    }

    if (!response.ok) {
      throw buildHttpBackendError(responseJson, fallbackError, response.status);
    }

    return responseJson && typeof responseJson === "object" ? responseJson : {};
  } catch (error) {
    if (error?.name === "AbortError") {
      throw buildHttpBackendError({
        code: "http-timeout",
        message: "Le backend HTTP a mis trop de temps a repondre.",
      }, fallbackError, 504);
    }
    if (error instanceof Error && typeof error.code === "string") {
      throw error;
    }
    throw buildHttpBackendError({
      code: "http-request-failed",
      message: String(error?.message || fallbackError),
    }, fallbackError, 502);
  } finally {
    if (timer) {
      window.clearTimeout(timer);
    }
  }
}

export async function searchAgentDepositClientsSecure(payload = {}) {
  const fallbackError = "Impossible de rechercher le client.";
  return invokeBackendHttp("/api/dashboard/agent-deposits/search-clients", {
    payload,
    requireAuth: true,
    fallbackError,
  });
}

export async function getAgentDepositClientContextSecure(payload = {}) {
  const fallbackError = "Impossible de charger le contexte client.";
  return invokeBackendHttp("/api/dashboard/agent-deposits/client-context", {
    payload,
    requireAuth: true,
    fallbackError,
  });
}

export async function creditAgentDepositSecure(payload = {}) {
  const fallbackError = "Impossible de crediter le compte client.";
  return invokeBackendHttp("/api/dashboard/agent-deposits/credit", {
    payload,
    requireAuth: true,
    fallbackError,
  });
}

export async function resolveDepositReviewSecure(payload = {}) {
  const fallbackError = "Impossible de traiter la commande.";
  return invokeBackendHttp("/api/dashboard/deposits/resolve-review", {
    payload,
    requireAuth: true,
    fallbackError,
  });
}

export async function getClientAcquisitionSnapshotSecure(payload = {}) {
  const fallbackError = "Impossible de charger le snapshot acquisition.";
  return invokeBackendHttp("/api/dashboard/acquisition/snapshot", {
    payload,
    requireAuth: true,
    fallbackError,
  });
}

export async function resetClientFinancialAccountSecure(payload = {}) {
  const fallbackError = "Impossible de reinitialiser le compte financier client.";
  return invokeBackendHttp("/api/dashboard/client-admin/reset-financial-account", {
    payload,
    requireAuth: true,
    fallbackError,
  });
}

export async function adminSetClientPasswordSecure(payload = {}) {
  const fallbackError = "Impossible de reinitialiser le mot de passe du client.";
  return invokeBackendHttp("/api/dashboard/client-admin/set-password", {
    payload,
    requireAuth: true,
    fallbackError,
  });
}

export async function unfreezeClientAccountSecure(payload = {}) {
  const fallbackError = "Impossible de debloquer le compte client.";
  return invokeBackendHttp("/api/dashboard/client-admin/unfreeze-account", {
    payload,
    requireAuth: true,
    fallbackError,
  });
}

export async function setWithdrawalTemporaryHoldSecure(payload = {}) {
  const fallbackError = "Impossible de mettre a jour le gel retrait temporaire.";
  return invokeBackendHttp("/api/dashboard/client-admin/set-withdrawal-temporary-hold", {
    payload,
    requireAuth: true,
    fallbackError,
  });
}

export async function setClientDeletionReviewStatusSecure(payload = {}) {
  return invokeCallable("setClientDeletionReviewStatusSecure", payload, "Impossible de mettre a jour le statut de revue suppression.");
}

export async function archiveClientAccountSecure(payload = {}) {
  return invokeCallable("archiveClientAccountSecure", payload, "Impossible d'archiver le compte client.");
}

export async function deleteClientAccountSecure(payload = {}) {
  const fallbackError = "Impossible de supprimer le compte client.";
  return invokeBackendHttp("/api/dashboard/client-admin/delete-account", {
    payload,
    requireAuth: true,
    fallbackError,
  });
}

export async function getClientPendingDepositOrdersSecure(payload = {}) {
  const fallbackError = "Impossible de charger les commandes pending du client.";
  return invokeBackendHttp("/api/dashboard/client-review/pending-orders", {
    payload,
    requireAuth: true,
    fallbackError,
  });
}

export async function getClientOrdersSecure(payload = {}) {
  const fallbackError = "Impossible de charger les commandes client.";
  return invokeBackendHttp("/api/dashboard/client-review/orders", {
    payload,
    requireAuth: true,
    fallbackError,
  });
}

export async function getClientGameHistorySecure(payload = {}) {
  const fallbackError = "Impossible de charger l'historique de jeu du client.";
  return invokeBackendHttp("/api/dashboard/client-review/game-history", {
    payload,
    requireAuth: true,
    fallbackError,
  });
}

export async function getClientFraudAnalysisSecure(payload = {}) {
  const fallbackError = "Impossible de charger l'analyse client.";
  return invokeBackendHttp("/api/dashboard/client-review/fraud-analysis", {
    payload,
    requireAuth: true,
    fallbackError,
  });
}

export async function approveClientPendingBalancesSecure(payload = {}) {
  const fallbackError = "Impossible d'approuver les soldes pending du client.";
  return invokeBackendHttp("/api/dashboard/client-review/approve-pending", {
    payload,
    requireAuth: true,
    fallbackError,
  });
}

export async function repairResolvedDepositResiduesSecure(payload = {}) {
  const fallbackError = "Impossible de reparer les residus des commandes resolues.";
  return invokeBackendHttp("/api/dashboard/client-review/repair-resolved-residues", {
    payload,
    requireAuth: true,
    fallbackError,
  });
}

export async function registerDashboardPushSubscriptionSecure(payload = {}) {
  const fallbackError = "Impossible d'enregistrer la subscription push.";
  return invokeBackendHttp("/api/dashboard/push/register", {
    payload,
    requireAuth: true,
    fallbackError,
  });
}

export async function unregisterDashboardPushSubscriptionSecure(payload = {}) {
  const fallbackError = "Impossible de retirer la subscription push.";
  return invokeBackendHttp("/api/dashboard/push/unregister", {
    payload,
    requireAuth: true,
    fallbackError,
  });
}

export async function getTransferAnalyticsSecure(payload = {}) {
  const fallbackError = "Impossible de charger les analytics de transferts.";
  return invokeBackendHttp("/api/dashboard/transfers/analytics", {
    payload,
    requireAuth: true,
    fallbackError,
  });
}

export async function getSiteVisitsAnalyticsSnapshotSecure(payload = {}) {
  const fallbackError = "Impossible de charger les analytics des visites.";
  return invokeBackendHttp("/api/dashboard/site-visits/snapshot", {
    payload,
    requireAuth: true,
    fallbackError,
  });
}

export async function getAiAdvisorSnapshotSecure(payload = {}) {
  const fallbackError = "Impossible de charger le rapport conseiller IA.";
  return invokeBackendHttp("/api/dashboard/ai-advisor/snapshot", {
    payload,
    requireAuth: true,
    fallbackError,
  });
}

export async function getDepositMethodAnalyticsSnapshotSecure(payload = {}) {
  const fallbackError = "Impossible de charger les analytics des depots.";
  return invokeBackendHttp("/api/dashboard/deposit-flow/snapshot", {
    payload,
    requireAuth: true,
    fallbackError,
  });
}

export async function getApprovedDepositsSnapshotSecure(payload = {}) {
  const fallbackError = "Impossible de charger les depots approuves.";
  return invokeBackendHttp("/api/dashboard/approved-deposits/snapshot", {
    payload,
    requireAuth: true,
    fallbackError,
  });
}

export async function getGamesVolumeAnalyticsSnapshotSecure(payload = {}) {
  const fallbackError = "Impossible de charger les analytics des parties.";
  return invokeBackendHttp("/api/dashboard/games-volume/snapshot", {
    payload,
    requireAuth: true,
    fallbackError,
  });
}

export async function getPongBotPilotSnapshotSecure(payload = {}) {
  const fallbackError = "Impossible de charger le pilotage Pong.";
  return invokeBackendHttp("/api/dashboard/pong-bot-pilot/snapshot", {
    payload,
    requireAuth: true,
    fallbackError,
  });
}

export async function setPongBotPilotControlSecure(payload = {}) {
  const fallbackError = "Impossible de mettre a jour le pilotage Pong.";
  return invokeBackendHttp("/api/dashboard/pong-bot-pilot/control", {
    payload,
    requireAuth: true,
    fallbackError,
  });
}

export async function getDominoClassicBotPilotSnapshotSecure(payload = {}) {
  const fallbackError = "Impossible de charger le pilotage Domino classique.";
  return invokeBackendHttp("/api/dashboard/domino-classic-bot-pilot/snapshot", {
    payload,
    requireAuth: true,
    fallbackError,
  });
}

export async function setDominoClassicBotPilotControlSecure(payload = {}) {
  const fallbackError = "Impossible de mettre a jour le pilotage Domino classique.";
  return invokeBackendHttp("/api/dashboard/domino-classic-bot-pilot/control", {
    payload,
    requireAuth: true,
    fallbackError,
  });
}

export async function getLudoBotPilotSnapshotSecure(payload = {}) {
  const fallbackError = "Impossible de charger le pilotage Ludo.";
  return invokeBackendHttp("/api/dashboard/ludo-bot-pilot/snapshot", {
    payload,
    requireAuth: true,
    fallbackError,
  });
}

export async function setLudoBotPilotControlSecure(payload = {}) {
  const fallbackError = "Impossible de mettre a jour le pilotage Ludo.";
  return invokeBackendHttp("/api/dashboard/ludo-bot-pilot/control", {
    payload,
    requireAuth: true,
    fallbackError,
  });
}

export async function getMorpionAnalyticsSnapshotSecure(payload = {}) {
  const fallbackError = "Impossible de charger les analytics Morpion.";
  return invokeBackendHttp("/api/dashboard/morpion/snapshot", {
    payload,
    requireAuth: true,
    fallbackError,
  });
}

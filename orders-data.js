import { collection, collectionGroup, db, getDocs, query, where } from "./firebase-init.js";
import { ensureFinanceDashboardSession } from "./dashboard-admin-auth.js";

export const ORDER_STATUS_META = {
  all: {
    label: "Toutes les commandes",
    shortLabel: "Toutes",
    accent: "#2563eb",
  },
  pending: {
    label: "Commandes en attente",
    shortLabel: "En attente",
    accent: "#d97706",
  },
  approved: {
    label: "Commandes approuvees",
    shortLabel: "Approuvees",
    accent: "#059669",
  },
  rejected: {
    label: "Commandes rejetees",
    shortLabel: "Rejetees",
    accent: "#dc2626",
  },
};

function getErrorCode(error) {
  const rawCode = String(error?.code || "").trim().toLowerCase();
  if (!rawCode) return "";
  if (rawCode.includes("/")) {
    const parts = rawCode.split("/");
    return parts[parts.length - 1] || rawCode;
  }
  return rawCode;
}

function shouldFallbackPerClient(error) {
  const code = getErrorCode(error);
  if (!code) return true;
  if (code === "permission-denied") return false;
  if (code === "resource-exhausted") return false;
  if (code === "unauthenticated") return false;
  return true;
}

async function mapWithConcurrency(items, mapper, concurrency = 4) {
  const safeItems = Array.isArray(items) ? items : [];
  if (!safeItems.length) return [];
  const limit = Math.max(1, Number(concurrency) || 1);
  const results = new Array(safeItems.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.min(limit, safeItems.length) }, async () => {
    while (true) {
      const currentIndex = cursor;
      cursor += 1;
      if (currentIndex >= safeItems.length) return;
      results[currentIndex] = await mapper(safeItems[currentIndex], currentIndex);
    }
  });

  await Promise.all(workers);
  return results;
}

function toMs(value) {
  if (!value) return 0;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value?.toMillis === "function") {
    try {
      return value.toMillis();
    } catch (_) {
      return 0;
    }
  }
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function getOrderItems(order) {
  return Array.isArray(order?.items) ? order.items : [];
}

function getOrderAmount(order) {
  if (typeof order?.amount === "number" && Number.isFinite(order.amount)) return order.amount;
  return getOrderItems(order).reduce((sum, item) => {
    const quantity = Number(item?.quantity) || 1;
    const price = Number(item?.price) || 0;
    return sum + (quantity * price);
  }, 0);
}

function normalizeOrder(docSnap) {
  const data = docSnap.data() || {};
  const parentClientId = docSnap?.ref?.parent?.parent?.id || "";
  const createdAtMs = toMs(data.createdAt) || toMs(data.updatedAt) || toMs(data.reviewedAt) || 0;
  const status = String(data.status || "pending").trim().toLowerCase();

  return {
    ...data,
    id: docSnap.id,
    clientId: String(data.clientId || parentClientId || "").trim(),
    customerName: String(data.customerName || data.name || "").trim(),
    customerEmail: String(data.customerEmail || data.email || "").trim(),
    customerPhone: String(data.customerPhone || data.phone || "").trim(),
    depositorPhone: String(data.depositorPhone || "").trim(),
    customerAddress: String(data.customerAddress || data.address || "").trim(),
    customerCity: String(data.customerCity || data.city || "").trim(),
    methodName: String(data.methodName || "").trim(),
    methodId: String(data.methodId || "").trim(),
    status,
    uniqueCode: String(data.uniqueCode || "").trim(),
    createdAtMs,
    createdAtLabel: data.createdAt || data.updatedAt || "",
    amount: getOrderAmount(data),
    items: getOrderItems(data),
    delivery: data.delivery || null,
    proofName: String(data.proofName || "").trim(),
    extractedText: String(data.extractedText || ""),
    extractedTextStatus: String(data.extractedTextStatus || (data.extractedText ? "success" : "empty")).trim().toLowerCase(),
    resolvedAtMs: toMs(data.resolvedAt) || toMs(data.reviewedAt) || 0,
    bonusEligible: data.bonusEligible === true || ((Number(getOrderAmount(data)) || 0) >= 100),
    bonusPercent: Number(data.bonusPercent ?? 10) || 0,
    bonusThresholdHtg: Number(data.bonusThresholdHtg ?? 100) || 0,
    bonusRateHtgToDoes: Number(data.bonusRateHtgToDoes ?? 20) || 0,
    bonusHtgBasis: Number(data.bonusHtgBasis ?? getOrderAmount(data)) || 0,
    bonusHtgRaw: Number(data.bonusHtgRaw ?? 0) || 0,
    bonusDoesAwarded: Number(data.bonusDoesAwarded ?? 0) || 0,
    bonusAwardedAtMs: toMs(data.bonusAwardedAt) || Number(data.bonusAwardedAtMs || 0) || 0,
  };
}

export function formatPrice(amount = 0) {
  const safeAmount = Number(amount) || 0;
  return `${safeAmount.toLocaleString("fr-FR")} HTG`;
}

export function formatDate(ms = 0) {
  if (!ms) return "-";
  return new Date(ms).toLocaleString("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export async function ensureOrdersAccess(pageTitle = "Dashboard commandes") {
  return ensureFinanceDashboardSession({
    title: pageTitle,
    description: "Connecte-toi avec le compte administrateur autorise pour ouvrir cette page commandes.",
  });
}

export async function loadClientOrders(clientId = "") {
  const normalizedClientId = String(clientId || "").trim();
  if (!normalizedClientId) return [];

  try {
    const ordersSnapshot = await getDocs(collection(db, "clients", normalizedClientId, "orders"));
    return ordersSnapshot.docs
      .map(normalizeOrder)
      .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
  } catch (error) {
    console.error(`[ORDERS_DATA] impossible de lire orders pour ${normalizedClientId}`, error);
    return [];
  }
}

export async function loadOrders(status = "all") {
  const normalizedStatus = String(status || "all").trim().toLowerCase();
  try {
    const ordersRef = collectionGroup(db, "orders");
    const ordersQuery = normalizedStatus === "all"
      ? ordersRef
      : query(ordersRef, where("status", "==", normalizedStatus));
    const snap = await getDocs(ordersQuery);
    return snap.docs
      .map(normalizeOrder)
      .filter((order) => normalizedStatus === "all" || order.status === normalizedStatus)
      .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
  } catch (error) {
    if (!shouldFallbackPerClient(error)) {
      console.error("[ORDERS_DATA] loadOrders blocked (no fallback)", error);
      throw error;
    }

    console.warn("[ORDERS_DATA] fallback loadOrders per-client (limited concurrency)", error);
    const clientsSnapshot = await getDocs(collection(db, "clients"));
    const clientIds = clientsSnapshot.docs.map((docSnap) => docSnap.id).filter(Boolean);
    const perClientOrders = await mapWithConcurrency(
      clientIds,
      (clientId) => loadClientOrders(clientId),
      4,
    );
    return perClientOrders
      .flat()
      .filter((order) => normalizedStatus === "all" || order.status === normalizedStatus)
      .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
  }
}

export function computeOrderStats(orders = []) {
  const stats = {
    total: orders.length,
    pending: 0,
    approved: 0,
    rejected: 0,
    review: 0,
    amount: 0,
  };

  orders.forEach((order) => {
    stats.amount += Number(order.amount) || 0;
    if (order.status === "pending") stats.pending += 1;
    else if (order.status === "approved") stats.approved += 1;
    else if (order.status === "rejected") stats.rejected += 1;
    else if (order.status === "review") stats.review += 1;
  });

  return stats;
}

export function getStatusMeta(status = "all") {
  const normalized = String(status || "all").trim().toLowerCase();
  return ORDER_STATUS_META[normalized] || ORDER_STATUS_META.all;
}

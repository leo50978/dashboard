import { collection, db, getDocs } from "./firebase-init.js";
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
  const clientsSnapshot = await getDocs(collection(db, "clients"));
  const clientIds = clientsSnapshot.docs.map((docSnap) => docSnap.id).filter(Boolean);
  const perClientOrders = await Promise.all(clientIds.map((clientId) => loadClientOrders(clientId)));

  return perClientOrders
    .flat()
    .filter((order) => normalizedStatus === "all" || order.status === normalizedStatus)
    .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
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

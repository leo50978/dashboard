import {
  collection,
  collectionGroup,
  db,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  updateDoc,
  where,
} from "./firebase-init.js";
import { ensureFinanceDashboardSession } from "./dashboard-admin-auth.js";

export const WITHDRAWAL_STATUS_META = {
  all: { label: "Tous les retraits", shortLabel: "Tous", accent: "#2563eb" },
  pending: { label: "Retraits en attente", shortLabel: "En attente", accent: "#d97706" },
  approved: { label: "Retraits approuves", shortLabel: "Approuves", accent: "#059669" },
  rejected: { label: "Retraits rejetes", shortLabel: "Rejetes", accent: "#dc2626" },
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

function normalizeStatus(value = "pending") {
  const normalized = String(value || "pending").trim().toLowerCase();
  if (
    normalized === "approved"
    || normalized === "rejected"
    || normalized === "review"
    || normalized === "cancelled"
    || normalized === "canceled"
  ) return normalized;
  return "pending";
}

function normalizeWithdrawal(docSnap) {
  const data = docSnap.data() || {};
  const parentClientId = docSnap?.ref?.parent?.parent?.id || "";
  const createdAtMs = toMs(data.createdAt) || toMs(data.updatedAt) || toMs(data.reviewedAt) || 0;
  const amount = Number(data.requestedAmount ?? data.amount ?? 0) || 0;

  return {
    ...data,
    id: docSnap.id,
    clientId: String(data.clientId || parentClientId || "").trim(),
    customerName: String(data.customerName || data.name || "").trim(),
    customerEmail: String(data.customerEmail || data.email || "").trim(),
    customerPhone: String(data.customerPhone || data.phone || "").trim(),
    phone: String(data.phone || data.customerPhone || "").trim(),
    methodName: String(data.methodName || data.method || "").trim(),
    status: normalizeStatus(data.status),
    amount,
    requestedAmount: amount,
    createdAtMs,
    reviewedAtMs: toMs(data.reviewedAt),
    note: String(data.note || data.reason || "").trim(),
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

export function getStatusText(status = "pending") {
  const normalized = normalizeStatus(status);
  if (normalized === "approved") return "Approuve";
  if (normalized === "rejected") return "Rejete";
  if (normalized === "review") return "En examen";
  if (normalized === "cancelled" || normalized === "canceled") return "Annule";
  return "En attente";
}

export async function ensureWithdrawalsAccess(pageTitle = "Dashboard retraits") {
  return ensureFinanceDashboardSession({
    title: pageTitle,
    description: "Connecte-toi avec le compte administrateur autorise pour ouvrir cette page retraits.",
  });
}

export async function loadClientWithdrawals(clientId = "") {
  const normalizedClientId = String(clientId || "").trim();
  if (!normalizedClientId) return [];

  try {
    const snap = await getDocs(collection(db, "clients", normalizedClientId, "withdrawals"));
    return snap.docs
      .map(normalizeWithdrawal)
      .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
  } catch (error) {
    console.error(`[WITHDRAWALS_DATA] impossible de lire withdrawals pour ${normalizedClientId}`, error);
    return [];
  }
}

export async function loadWithdrawals(status = "all") {
  const normalizedStatus = String(status || "all").trim().toLowerCase();
  const normalizedFilter = normalizedStatus === "all" ? "all" : normalizeStatus(normalizedStatus);
  const baseRef = collectionGroup(db, "withdrawals");
  const constraints = [];
  if (normalizedFilter !== "all") {
    constraints.push(where("status", "==", normalizedFilter));
  }
  constraints.push(orderBy("createdAt", "desc"));
  constraints.push(limit(200));

  try {
    const snap = await getDocs(query(baseRef, ...constraints));
    return snap.docs.map(normalizeWithdrawal);
  } catch (error) {
    console.warn("[WITHDRAWALS_DATA] fallback sans orderBy pour withdrawals", error);
    const fallbackConstraints = [];
    if (normalizedFilter !== "all") {
      fallbackConstraints.push(where("status", "==", normalizedFilter));
    }
    fallbackConstraints.push(limit(200));
    const snap = await getDocs(query(baseRef, ...fallbackConstraints));
    return snap.docs
      .map(normalizeWithdrawal)
      .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
  }
}

export function computeWithdrawalStats(withdrawals = []) {
  const stats = {
    total: withdrawals.length,
    pending: 0,
    approved: 0,
    rejected: 0,
    review: 0,
    amount: 0,
  };

  withdrawals.forEach((item) => {
    stats.amount += Number(item.amount) || 0;
    if (item.status === "pending") stats.pending += 1;
    else if (item.status === "approved") stats.approved += 1;
    else if (item.status === "rejected") stats.rejected += 1;
    else if (item.status === "review") stats.review += 1;
    else if (item.status === "cancelled" || item.status === "canceled") stats.cancelled = (stats.cancelled || 0) + 1;
  });

  return stats;
}

export function getStatusMeta(status = "all") {
  const normalized = String(status || "all").trim().toLowerCase();
  return WITHDRAWAL_STATUS_META[normalized] || WITHDRAWAL_STATUS_META.all;
}

export async function updateWithdrawalStatus(withdrawal, status) {
  const normalizedStatus = normalizeStatus(status);
  const clientId = String(withdrawal?.clientId || "").trim();
  const id = String(withdrawal?.id || "").trim();
  if (!clientId || !id) throw new Error("Retrait invalide.");

  await updateDoc(doc(db, "clients", clientId, "withdrawals", id), {
    status: normalizedStatus,
    reviewedAt: new Date().toISOString(),
  });

  return {
    ...withdrawal,
    status: normalizedStatus,
    reviewedAt: new Date().toISOString(),
  };
}

export async function deleteWithdrawal(withdrawal) {
  const clientId = String(withdrawal?.clientId || "").trim();
  const id = String(withdrawal?.id || "").trim();
  if (!clientId || !id) throw new Error("Retrait invalide.");
  await deleteDoc(doc(db, "clients", clientId, "withdrawals", id));
  return true;
}

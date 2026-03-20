import {
  db,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "./firebase-init.js";
import { ensureFinanceDashboardSession } from "./dashboard-admin-auth.js";

const CLIENTS_COLLECTION = "clients";
const ORDERS_SUBCOLLECTION = "orders";
const WITHDRAWALS_SUBCOLLECTION = "withdrawals";
const XCHANGES_SUBCOLLECTION = "xchanges";
const ROOMS_COLLECTION = "rooms";
const RATE_HTG_TO_DOES = 20;

function safeInt(value) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.max(0, Math.floor(num)) : 0;
}

function safeSignedInt(value) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.trunc(num) : 0;
}

function tsToMs(value) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function snapshotRecord(docSnap) {
  const base = docSnap.data() || {};
  return {
    id: docSnap.id,
    ...base,
    createdAtMs: tsToMs(base.createdAt) || safeSignedInt(base.createdAtMs),
    updatedAtMs: tsToMs(base.updatedAt) || safeSignedInt(base.updatedAtMs),
  };
}

function normalizeOrderRecord(docSnap, clientId) {
  const base = snapshotRecord(docSnap);
  return {
    ...base,
    clientId: String(clientId || base.clientId || "").trim(),
    amount: safeInt(base.amount || base.amountHtg),
    createdAtMs: tsToMs(base.createdAt) || safeSignedInt(base.createdAtMs),
    extractedText: String(base.extractedText || "").trim(),
  };
}

function normalizeXchangeRecord(docSnap, clientId) {
  const base = snapshotRecord(docSnap);
  return {
    ...base,
    clientId: String(clientId || base.clientId || base.uid || "").trim(),
    createdAtMs: tsToMs(base.createdAt) || safeSignedInt(base.createdAtMs),
    amountDoes: safeInt(base.amountDoes),
    amountGourdes: safeInt(base.amountGourdes || base.amountHtg),
    type: String(base.type || "").trim().toLowerCase(),
  };
}

function normalizeRoomRecord(docSnap) {
  const base = snapshotRecord(docSnap);
  return {
    ...base,
    id: docSnap.id,
    createdAtMs: tsToMs(base.createdAt) || safeSignedInt(base.createdAtMs),
    updatedAtMs: tsToMs(base.updatedAt) || safeSignedInt(base.updatedAtMs),
    endedAtMs:
      tsToMs(base.endedAt) ||
      safeSignedInt(base.endedAtMs) ||
      tsToMs(base.finishedAt) ||
      safeSignedInt(base.finishedAtMs),
    playerUids: Array.isArray(base.playerUids)
      ? base.playerUids.map((item) => String(item || "").trim()).filter(Boolean)
      : [],
    status: String(base.status || "").trim().toLowerCase(),
    winnerUid: String(base.winnerUid || "").trim(),
  };
}

function classifyXchange(item) {
  const type = String(item?.type || "").toLowerCase();
  if (type === "xchange_buy" || type === "exchange_htg_to_does") return "buy";
  if (type === "xchange_sell" || type === "exchange_does_to_htg") return "sell";
  if (type === "game_entry" || type === "game_cost" || type === "entry") return "entry";
  if (type === "game_reward") return "reward";
  if (type.includes("referral")) return "referral";
  return "other";
}

function getDisplayName(client = {}) {
  return String(client.name || client.displayName || client.email || client.id || "Client").trim();
}

function getPhoneValue(client = {}) {
  return String(client.phone || client.customerPhone || "").trim();
}

function getClientHtgBalance(client = {}) {
  return safeInt(client.approvedHtgAvailable) + safeInt(client.provisionalHtgAvailable);
}

function getClientDoesBalance(client = {}) {
  return safeInt(client.doesBalance || (safeInt(client.doesApprovedBalance) + safeInt(client.doesProvisionalBalance)));
}

function getFreezeMode(client = {}) {
  if (client.accountFrozen === true) return "global";
  if (client.withdrawalHold === true) return "withdrawal";
  return "none";
}

function isFrozenClient(client = {}) {
  return getFreezeMode(client) !== "none";
}

function isActiveClient(client = {}) {
  return safeInt(client.orderCount) > 0;
}

function formatPrice(value) {
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(safeInt(value))} HTG`;
}

function formatDoes(value) {
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(safeInt(value))} Does`;
}

function formatSignedDoes(value) {
  const amount = safeSignedInt(value);
  return `${amount > 0 ? "+" : ""}${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(amount)} Does`;
}

function formatDateTime(value) {
  const ms = tsToMs(value);
  if (!ms) return "-";
  return new Date(ms).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(value) {
  const ms = tsToMs(value);
  if (!ms) return "-";
  return new Date(ms).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getRoomPeriodMs(room = {}) {
  return safeSignedInt(room.endedAtMs || room.updatedAtMs || room.createdAtMs);
}

async function loadClientOrderStats(clientId) {
  const snap = await getDocs(collection(db, CLIENTS_COLLECTION, clientId, ORDERS_SUBCOLLECTION));
  const orders = snap.docs.map((item) => normalizeOrderRecord(item, clientId));
  const lastOrderAtMs = orders.reduce((max, item) => Math.max(max, safeSignedInt(item.createdAtMs)), 0);
  const totalOrderAmount = orders.reduce((sum, item) => sum + safeInt(item.amount), 0);
  return {
    orderCount: orders.length,
    lastOrderAtMs,
    totalOrderAmount,
  };
}

async function loadClientGameStats(clientId) {
  const snap = await getDocs(collection(db, CLIENTS_COLLECTION, clientId, XCHANGES_SUBCOLLECTION));
  const xchanges = snap.docs.map((item) => normalizeXchangeRecord(item, clientId));
  const entryEvents = xchanges.filter((item) => classifyXchange(item) === "entry");
  const rewardEvents = xchanges.filter((item) => classifyXchange(item) === "reward");
  const totalBetDoes = entryEvents.reduce((sum, item) => sum + safeInt(item.amountDoes), 0);
  const totalRewardDoes = rewardEvents.reduce((sum, item) => sum + safeInt(item.amountDoes), 0);
  const netGameDoes = safeSignedInt(totalRewardDoes - totalBetDoes);
  return {
    totalBetDoes,
    totalRewardDoes,
    netGameDoes,
    gamePerformance: netGameDoes > 0 ? "gain" : netGameDoes < 0 ? "perte" : "neutre",
  };
}

function sortClientRows(rows = [], scope = "all") {
  const copy = [...rows];
  if (scope === "frozen") {
    return copy.sort((left, right) =>
      safeInt(right.rejectedDepositStrikeCount) - safeInt(left.rejectedDepositStrikeCount)
      || safeSignedInt(right.updatedAtMs) - safeSignedInt(left.updatedAtMs)
      || String(left.displayName || "").localeCompare(String(right.displayName || ""), "fr")
    );
  }
  if (scope === "gain") {
    return copy.sort((left, right) =>
      safeSignedInt(right.netGameDoes) - safeSignedInt(left.netGameDoes)
      || safeSignedInt(right.lastOrderAtMs) - safeSignedInt(left.lastOrderAtMs)
      || String(left.displayName || "").localeCompare(String(right.displayName || ""), "fr")
    );
  }
  if (scope === "loss") {
    return copy.sort((left, right) =>
      safeSignedInt(left.netGameDoes) - safeSignedInt(right.netGameDoes)
      || safeSignedInt(right.lastOrderAtMs) - safeSignedInt(left.lastOrderAtMs)
      || String(left.displayName || "").localeCompare(String(right.displayName || ""), "fr")
    );
  }
  return copy.sort((left, right) =>
    safeSignedInt(right.lastOrderAtMs) - safeSignedInt(left.lastOrderAtMs)
    || safeSignedInt(right.createdAtMs) - safeSignedInt(left.createdAtMs)
    || String(left.displayName || "").localeCompare(String(right.displayName || ""), "fr")
  );
}

export async function ensureClientsAccess(contextTitle = "Clients admin") {
  return ensureFinanceDashboardSession({
    title: contextTitle,
    description: "Connecte-toi avec le compte administrateur autorisé pour consulter les clients.",
  });
}

export async function loadClientRows(scope = "all") {
  const clientSnap = await getDocs(collection(db, CLIENTS_COLLECTION));
  const baseClients = clientSnap.docs.map(snapshotRecord);

  const [orderStatsEntries, gameStatsEntries] = await Promise.all([
    Promise.all(
      baseClients.map(async (client) => {
        try {
          return [client.id, await loadClientOrderStats(client.id)];
        } catch (error) {
          console.warn("[CLIENTS_DATA] order stats unavailable", client.id, error);
          return [client.id, { orderCount: 0, lastOrderAtMs: 0, totalOrderAmount: 0 }];
        }
      })
    ),
    Promise.all(
      baseClients.map(async (client) => {
        try {
          return [client.id, await loadClientGameStats(client.id)];
        } catch (error) {
          console.warn("[CLIENTS_DATA] game stats unavailable", client.id, error);
          return [client.id, { totalBetDoes: 0, totalRewardDoes: 0, netGameDoes: 0, gamePerformance: "neutre" }];
        }
      })
    ),
  ]);

  const orderStatsMap = new Map(orderStatsEntries);
  const gameStatsMap = new Map(gameStatsEntries);
  const rows = baseClients.map((client) => {
    const orderStats = orderStatsMap.get(client.id) || { orderCount: 0, lastOrderAtMs: 0, totalOrderAmount: 0 };
    const gameStats = gameStatsMap.get(client.id) || { totalBetDoes: 0, totalRewardDoes: 0, netGameDoes: 0, gamePerformance: "neutre" };
    const freezeMode = getFreezeMode(client);
    return {
      ...client,
      ...orderStats,
      ...gameStats,
      displayName: getDisplayName(client),
      phone: getPhoneValue(client),
      htgBalance: getClientHtgBalance(client),
      doesBalanceCurrent: getClientDoesBalance(client),
      freezeMode,
      isFrozen: freezeMode !== "none",
      isActive: safeInt(orderStats.orderCount) > 0,
      rejectedDepositStrikeCount: safeInt(client.rejectedDepositStrikeCount),
    };
  });

  const filtered = rows.filter((row) => {
    if (scope === "active") return isActiveClient(row);
    if (scope === "frozen") return isFrozenClient(row);
    if (scope === "gain") return safeSignedInt(row.netGameDoes) > 0;
    if (scope === "loss") return safeSignedInt(row.netGameDoes) < 0;
    return true;
  });

  return sortClientRows(filtered, scope);
}

export function computeClientStats(rows = []) {
  const list = Array.isArray(rows) ? rows : [];
  return {
    total: list.length,
    active: list.filter((item) => item.isActive).length,
    frozen: list.filter((item) => item.isFrozen).length,
    gain: list.filter((item) => safeSignedInt(item.netGameDoes) > 0).length,
    loss: list.filter((item) => safeSignedInt(item.netGameDoes) < 0).length,
    totalOrders: list.reduce((sum, item) => sum + safeInt(item.orderCount), 0),
    totalHtgBalance: list.reduce((sum, item) => sum + safeInt(item.htgBalance), 0),
    totalDoesBalance: list.reduce((sum, item) => sum + safeInt(item.doesBalanceCurrent), 0),
    totalNetGameDoes: list.reduce((sum, item) => sum + safeSignedInt(item.netGameDoes), 0),
  };
}

export async function loadClientDetail(clientId = "") {
  const normalizedId = String(clientId || "").trim();
  if (!normalizedId) throw new Error("Client introuvable.");

  const [clientSnap, ordersSnap, withdrawalsSnap, xchangesSnap, roomsSnap] = await Promise.all([
    getDoc(doc(db, CLIENTS_COLLECTION, normalizedId)),
    getDocs(collection(db, CLIENTS_COLLECTION, normalizedId, ORDERS_SUBCOLLECTION)),
    getDocs(collection(db, CLIENTS_COLLECTION, normalizedId, WITHDRAWALS_SUBCOLLECTION)),
    getDocs(collection(db, CLIENTS_COLLECTION, normalizedId, XCHANGES_SUBCOLLECTION)),
    getDocs(query(collection(db, ROOMS_COLLECTION), where("playerUids", "array-contains", normalizedId))).catch(() => ({ docs: [] })),
  ]);

  if (!clientSnap.exists()) {
    throw new Error("Client introuvable.");
  }

  const client = snapshotRecord(clientSnap);
  const orders = ordersSnap.docs.map((item) => normalizeOrderRecord(item, normalizedId))
    .sort((left, right) => safeSignedInt(right.createdAtMs) - safeSignedInt(left.createdAtMs));
  const withdrawals = withdrawalsSnap.docs.map((item) => snapshotRecord(item))
    .sort((left, right) => safeSignedInt(right.createdAtMs) - safeSignedInt(left.createdAtMs));
  const xchanges = xchangesSnap.docs.map((item) => normalizeXchangeRecord(item, normalizedId))
    .sort((left, right) => safeSignedInt(right.createdAtMs) - safeSignedInt(left.createdAtMs));
  const rooms = roomsSnap.docs.map(normalizeRoomRecord)
    .sort((left, right) => getRoomPeriodMs(right) - getRoomPeriodMs(left));

  const entryEvents = xchanges.filter((item) => classifyXchange(item) === "entry");
  const rewardEvents = xchanges.filter((item) => classifyXchange(item) === "reward");
  const endedRooms = rooms.filter((item) => item.status === "ended");

  const totalBetDoes = entryEvents.reduce((sum, item) => sum + safeInt(item.amountDoes), 0);
  const totalRewardDoes = rewardEvents.reduce((sum, item) => sum + safeInt(item.amountDoes), 0);
  const matchesPlayed = Math.max(endedRooms.length, entryEvents.length);
  const matchesWon = rewardEvents.length;
  const matchesLost = Math.max(0, matchesPlayed - matchesWon);
  const lastMatchAtMs = Math.max(
    0,
    ...endedRooms.map((item) => getRoomPeriodMs(item)),
    ...entryEvents.map((item) => safeSignedInt(item.createdAtMs)),
    ...rewardEvents.map((item) => safeSignedInt(item.createdAtMs))
  );
  const netGameDoes = safeSignedInt(totalRewardDoes - totalBetDoes);

  return {
    client: {
      ...client,
      displayName: getDisplayName(client),
      phone: getPhoneValue(client),
      htgBalance: getClientHtgBalance(client),
      doesBalanceCurrent: getClientDoesBalance(client),
      freezeMode: getFreezeMode(client),
      isFrozen: isFrozenClient(client),
      rejectedDepositStrikeCount: safeInt(client.rejectedDepositStrikeCount),
    },
    orders,
    withdrawals,
    xchanges,
    rooms,
    metrics: {
      orderCount: orders.length,
      totalOrderAmount: orders.reduce((sum, item) => sum + safeInt(item.amount), 0),
      approvedOrders: orders.filter((item) => String(item.status || "").trim().toLowerCase() === "approved").length,
      pendingOrders: orders.filter((item) => String(item.status || "").trim().toLowerCase() === "pending").length,
      rejectedOrders: orders.filter((item) => String(item.status || "").trim().toLowerCase() === "rejected").length,
      matchesPlayed,
      matchesWon,
      matchesLost,
      totalBetDoes,
      totalRewardDoes,
      netGameDoes,
      gamePerformance: netGameDoes > 0 ? "gain" : netGameDoes < 0 ? "perte" : "neutre",
      lastMatchAtMs,
      withdrawableHtg: safeInt(client.withdrawableHtg),
      exchangeableDoesAvailable: safeInt(client.exchangeableDoesAvailable),
      approvedDoesBalance: safeInt(client.doesApprovedBalance),
      provisionalDoesBalance: safeInt(client.doesProvisionalBalance),
      approvedHtgAvailable: safeInt(client.approvedHtgAvailable),
      provisionalHtgAvailable: safeInt(client.provisionalHtgAvailable),
      totalExchangedHtgEver: safeInt(client.totalExchangedHtgEver),
      totalExchangedDoes: safeInt(client.totalExchangedHtgEver) * RATE_HTG_TO_DOES,
      lastOrderAtMs: orders.length ? safeSignedInt(orders[0].createdAtMs) : 0,
      lastWithdrawalAtMs: withdrawals.length ? safeSignedInt(withdrawals[0].createdAtMs) : 0,
    },
  };
}

export {
  formatDate,
  formatDateTime,
  formatDoes,
  formatPrice,
  formatSignedDoes,
  classifyXchange,
  safeInt,
  safeSignedInt,
  tsToMs,
};

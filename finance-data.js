import { collection, db, getDocs, limit, orderBy, query, where } from "./firebase-init.js";
import { ensureFinanceDashboardSession } from "./dashboard-admin-auth.js";

const CLIENTS_COLLECTION = "clients";
const ROOMS_COLLECTION = "rooms";
const DEFAULT_REWARD_MULTIPLIER = 3;
export const DEFAULT_FINANCE_FETCH_LIMIT = 2500;

function safeInt(value) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.max(0, Math.trunc(num)) : 0;
}

function safeSignedInt(value) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.trunc(num) : 0;
}

function tsToMs(value) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value?.toMillis === "function") {
    try {
      return value.toMillis();
    } catch (_) {
      return 0;
    }
  }
  if (typeof value?.toDate === "function") {
    try {
      return value.toDate().getTime();
    } catch (_) {
      return 0;
    }
  }
  if (typeof value?.seconds === "number") return value.seconds * 1000;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeText(value = "") {
  return String(value || "").trim();
}

function normalizeStatus(value = "") {
  return normalizeText(value).toLowerCase();
}

function getDisplayName(client = {}) {
  return normalizeText(client.name || client.displayName || client.email || client.id || "Client");
}

function getShortUid(uid = "") {
  const normalized = normalizeText(uid);
  if (!normalized) return "-";
  if (normalized.length <= 10) return normalized;
  return `${normalized.slice(0, 5)}...${normalized.slice(-4)}`;
}

function formatDayKey(ms = 0) {
  if (!ms) return "";
  const date = new Date(ms);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getPresetRange(period = "today") {
  const now = new Date();
  const endMs = now.getTime();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  if (period === "today") {
    return { startMs: todayStart, endMs, label: "Aujourd'hui" };
  }
  if (period === "yesterday") {
    return { startMs: todayStart - 86400000, endMs: todayStart - 1, label: "Hier" };
  }
  if (period === "7d") {
    return { startMs: todayStart - (6 * 86400000), endMs, label: "7 derniers jours" };
  }
  if (period === "30d") {
    return { startMs: todayStart - (29 * 86400000), endMs, label: "30 derniers jours" };
  }
  return { startMs: 0, endMs: 0, label: "Fenêtre libre" };
}

function resolveFetchRange(filters = {}) {
  const period = normalizeText(filters.period || "today").toLowerCase();
  const dateFrom = normalizeText(filters.dateFrom || "");
  const dateTo = normalizeText(filters.dateTo || "");
  if (period === "custom" && (dateFrom || dateTo)) {
    const startMs = dateFrom ? (Date.parse(`${dateFrom}T00:00:00`) || 0) : 0;
    const endMs = dateTo ? (Date.parse(`${dateTo}T23:59:59`) || 0) : 0;
    return {
      startMs,
      endMs,
      label: dateFrom && dateTo ? `${dateFrom} → ${dateTo}` : "Période personnalisée",
    };
  }
  return getPresetRange(period);
}

function resolveRewardAmount(entryCostDoes, explicitRewardDoes) {
  const explicit = safeInt(explicitRewardDoes);
  if (explicit > 0) return explicit;
  return safeInt(entryCostDoes) * DEFAULT_REWARD_MULTIPLIER;
}

function buildClientDirectory(clientDocs = []) {
  return new Map(
    clientDocs.map((docSnap) => {
      const data = docSnap.data() || {};
      return [
        docSnap.id,
        {
          id: docSnap.id,
          email: normalizeText(data.email),
          displayName: getDisplayName({ ...data, id: docSnap.id }),
        },
      ];
    })
  );
}

function resolveParticipant(roomData = {}, clientDirectory = new Map(), seatIndex = -1) {
  const uid = normalizeText((roomData.playerUids || [])[seatIndex] || "");
  const fallbackName = normalizeText((roomData.playerNames || [])[seatIndex] || "");
  const client = uid ? clientDirectory.get(uid) : null;
  return {
    uid,
    displayName: normalizeText(client?.displayName || fallbackName || (uid ? getShortUid(uid) : "Bot")),
    email: normalizeText(client?.email || ""),
  };
}

function detectWinner(roomData = {}, clientDirectory = new Map()) {
  const winnerUid = normalizeText(roomData.winnerUid);
  const winnerSeat = Number.isFinite(Number(roomData.winnerSeat)) ? Math.trunc(Number(roomData.winnerSeat)) : -1;
  const playerUids = Array.isArray(roomData.playerUids)
    ? roomData.playerUids.map((item) => normalizeText(item))
    : [];

  if (winnerUid) {
    const seatIndex = playerUids.findIndex((uid) => uid === winnerUid);
    const participant = seatIndex >= 0 ? resolveParticipant(roomData, clientDirectory, seatIndex) : null;
    return {
      type: participant ? "human" : "bot",
      uid: winnerUid,
      seatIndex,
      label: participant?.displayName || getShortUid(winnerUid),
    };
  }

  if (winnerSeat >= 0) {
    const participant = resolveParticipant(roomData, clientDirectory, winnerSeat);
    if (participant.uid) {
      return {
        type: "human",
        uid: participant.uid,
        seatIndex: winnerSeat,
        label: participant.displayName,
      };
    }
    return {
      type: "bot",
      uid: "",
      seatIndex: winnerSeat,
      label: `Bot #${winnerSeat + 1}`,
    };
  }

  return {
    type: "unknown",
    uid: "",
    seatIndex: -1,
    label: "Inconnu",
  };
}

function normalizeRoomRow(docSnap, clientDirectory = new Map()) {
  const data = docSnap.data() || {};
  const playerUids = Array.isArray(data.playerUids)
    ? data.playerUids.map((item) => normalizeText(item))
    : [];
  const humanPlayerUids = playerUids.filter(Boolean);
  const humanCount = humanPlayerUids.length;
  const botCount = safeInt(data.botCount);
  const entryCostDoes = safeInt(data.entryCostDoes || data.stakeDoes);
  const rewardAmountDoes = resolveRewardAmount(entryCostDoes, data.rewardAmountDoes);
  const periodMs = tsToMs(data.endedAt)
    || safeSignedInt(data.endedAtMs)
    || tsToMs(data.updatedAt)
    || safeSignedInt(data.updatedAtMs)
    || tsToMs(data.createdAt)
    || safeSignedInt(data.createdAtMs);
  const winner = detectWinner(data, clientDirectory);
  const companyCollectedDoes = humanCount * entryCostDoes;
  const companyPayoutDoes = winner.type === "human" ? rewardAmountDoes : 0;
  const companyNetDoes = companyCollectedDoes - companyPayoutDoes;
  const players = playerUids
    .map((_, seatIndex) => resolveParticipant(data, clientDirectory, seatIndex))
    .filter((participant) => participant.uid);

  return {
    id: docSnap.id,
    status: normalizeStatus(data.status),
    createdAtMs: tsToMs(data.createdAt) || safeSignedInt(data.createdAtMs),
    updatedAtMs: tsToMs(data.updatedAt) || safeSignedInt(data.updatedAtMs),
    endedAtMs: periodMs,
    periodMs,
    dayKey: formatDayKey(periodMs),
    playerUids,
    playerNames: Array.isArray(data.playerNames) ? data.playerNames.map((item) => normalizeText(item)) : [],
    players,
    humanCount,
    botCount,
    totalSeats: humanCount + botCount,
    entryCostDoes,
    rewardAmountDoes,
    winnerUid: winner.uid,
    winnerSeat: winner.seatIndex,
    winnerType: winner.type,
    winnerLabel: winner.label,
    companyCollectedDoes,
    companyPayoutDoes,
    companyNetDoes,
    hasBots: botCount > 0,
    compositionLabel: `${humanCount} humain${humanCount > 1 ? "s" : ""} / ${botCount} bot${botCount > 1 ? "s" : ""}`,
    searchText: [
      docSnap.id,
      winner.label,
      winner.uid,
      ...players.flatMap((player) => [player.displayName, player.email, player.uid]),
    ].join(" ").toLowerCase(),
  };
}

export function formatDoes(value = 0) {
  const safeValue = safeSignedInt(value);
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(safeValue)} Does`;
}

export function formatSignedDoes(value = 0) {
  const safeValue = safeSignedInt(value);
  const sign = safeValue > 0 ? "+" : safeValue < 0 ? "-" : "";
  return `${sign}${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Math.abs(safeValue))} Does`;
}

export function formatDateTime(ms = 0) {
  if (!ms) return "-";
  return new Date(ms).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDateLabel(ms = 0) {
  if (!ms) return "-";
  const now = new Date();
  const value = new Date(ms);
  const todayKey = formatDayKey(now.getTime());
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const yesterdayKey = formatDayKey(yesterday.getTime());
  const key = formatDayKey(ms);
  if (key === todayKey) return "Aujourd'hui";
  if (key === yesterdayKey) return "Hier";
  return value.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export async function ensureFinanceAccess(pageTitle = "Finance réelle") {
  return ensureFinanceDashboardSession({
    title: pageTitle,
    description: "Connecte-toi avec le compte administrateur autorisé pour ouvrir le dashboard finance.",
  });
}

export async function loadFinanceRooms(filters = {}) {
  const { startMs, endMs, label } = resolveFetchRange(filters);
  const fetchLimit = Math.max(200, safeInt(filters.fetchLimit) || DEFAULT_FINANCE_FETCH_LIMIT);
  const constraints = [];

  if (startMs) constraints.push(where("endedAtMs", ">=", startMs));
  if (endMs) constraints.push(where("endedAtMs", "<=", endMs));
  constraints.push(orderBy("endedAtMs", "desc"));
  constraints.push(limit(fetchLimit));

  const [clientsSnap, roomsSnap] = await Promise.all([
    getDocs(collection(db, CLIENTS_COLLECTION)).catch(() => ({ docs: [] })),
    getDocs(query(collection(db, ROOMS_COLLECTION), ...constraints)),
  ]);

  const clientDirectory = buildClientDirectory(clientsSnap.docs || []);
  const rows = (roomsSnap.docs || [])
    .map((docSnap) => normalizeRoomRow(docSnap, clientDirectory))
    .filter((row) => row.status === "ended" && row.humanCount > 0 && row.entryCostDoes > 0)
    .sort((left, right) => safeSignedInt(right.periodMs) - safeSignedInt(left.periodMs));

  return {
    rows,
    fetchMeta: {
      windowLabel: label,
      startMs,
      endMs,
      fetchLimit,
      loadedCount: rows.length,
      capped: rows.length >= fetchLimit,
    },
  };
}

export function filterFinanceRooms(rows = [], filters = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const search = normalizeText(filters.search).toLowerCase();
  const botFilter = normalizeText(filters.botFilter || "all").toLowerCase();
  const winnerFilter = normalizeText(filters.winnerFilter || "all").toLowerCase();
  const stakeFilter = normalizeText(filters.stakeFilter || "all").toLowerCase();
  const sortBy = normalizeText(filters.sortBy || "recent").toLowerCase();
  const dayKey = normalizeText(filters.dayKey || "all").toLowerCase();

  const filtered = list.filter((row) => {
    if (search && !row.searchText.includes(search)) return false;
    if (dayKey !== "all" && normalizeText(row.dayKey).toLowerCase() !== dayKey) return false;
    if (botFilter !== "all") {
      if (botFilter === "bots" && row.botCount <= 0) return false;
      if (botFilter === "humans" && row.botCount !== 0) return false;
      if (/^\d+$/.test(botFilter) && row.botCount !== safeInt(botFilter)) return false;
    }
    if (winnerFilter !== "all" && row.winnerType !== winnerFilter) return false;
    if (stakeFilter !== "all" && safeInt(stakeFilter) !== row.entryCostDoes) return false;
    return true;
  });

  const sorted = [...filtered];
  if (sortBy === "net_desc") {
    sorted.sort((left, right) => safeSignedInt(right.companyNetDoes) - safeSignedInt(left.companyNetDoes) || safeSignedInt(right.periodMs) - safeSignedInt(left.periodMs));
  } else if (sortBy === "net_asc") {
    sorted.sort((left, right) => safeSignedInt(left.companyNetDoes) - safeSignedInt(right.companyNetDoes) || safeSignedInt(right.periodMs) - safeSignedInt(left.periodMs));
  } else if (sortBy === "stake_desc") {
    sorted.sort((left, right) => safeInt(right.entryCostDoes) - safeInt(left.entryCostDoes) || safeSignedInt(right.periodMs) - safeSignedInt(left.periodMs));
  } else {
    sorted.sort((left, right) => safeSignedInt(right.periodMs) - safeSignedInt(left.periodMs));
  }

  return sorted;
}

export function computeFinanceStats(rows = []) {
  const list = Array.isArray(rows) ? rows : [];
  const totalRooms = list.length;
  const totalCollectedDoes = list.reduce((sum, row) => sum + safeInt(row.companyCollectedDoes), 0);
  const totalPayoutDoes = list.reduce((sum, row) => sum + safeInt(row.companyPayoutDoes), 0);
  const totalNetDoes = list.reduce((sum, row) => sum + safeSignedInt(row.companyNetDoes), 0);
  const botRooms = list.filter((row) => row.botCount > 0).length;
  const botWins = list.filter((row) => row.winnerType === "bot").length;
  const averageNetDoes = totalRooms > 0 ? Math.round(totalNetDoes / totalRooms) : 0;

  return {
    totalRooms,
    totalCollectedDoes,
    totalPayoutDoes,
    totalNetDoes,
    botRooms,
    botWins,
    averageNetDoes,
    botRoomRate: totalRooms > 0 ? Math.round((botRooms / totalRooms) * 100) : 0,
    botWinRate: totalRooms > 0 ? Math.round((botWins / totalRooms) * 100) : 0,
  };
}

export function buildFinanceTrend(rows = [], limitPoints = 14) {
  const groups = new Map();
  rows.forEach((row) => {
    const key = row.dayKey || formatDayKey(row.periodMs);
    if (!groups.has(key)) {
      groups.set(key, {
        dayKey: key,
        label: formatDateLabel(row.periodMs),
        dateMs: row.periodMs,
        rooms: 0,
        netDoes: 0,
        collectedDoes: 0,
        payoutDoes: 0,
      });
    }
    const bucket = groups.get(key);
    bucket.rooms += 1;
    bucket.netDoes += safeSignedInt(row.companyNetDoes);
    bucket.collectedDoes += safeInt(row.companyCollectedDoes);
    bucket.payoutDoes += safeInt(row.companyPayoutDoes);
    bucket.dateMs = Math.max(bucket.dateMs, safeSignedInt(row.periodMs));
  });

  return [...groups.values()]
    .sort((left, right) => safeSignedInt(left.dateMs) - safeSignedInt(right.dateMs))
    .slice(-Math.max(4, safeInt(limitPoints) || 14));
}

export function buildDailySummaries(rows = [], limitDays = 12) {
  return buildFinanceTrend(rows, limitDays)
    .sort((left, right) => safeSignedInt(right.dateMs) - safeSignedInt(left.dateMs));
}

export function buildBotMix(rows = []) {
  const mix = new Map();
  [0, 1, 2, 3].forEach((botCount) => {
    mix.set(botCount, {
      botCount,
      label: botCount === 0 ? "0 bot" : `${botCount} bot${botCount > 1 ? "s" : ""}`,
      rooms: 0,
      netDoes: 0,
      humanWins: 0,
      botWins: 0,
      collectedDoes: 0,
      payoutDoes: 0,
    });
  });

  rows.forEach((row) => {
    const key = mix.has(row.botCount) ? row.botCount : 3;
    const bucket = mix.get(key);
    bucket.rooms += 1;
    bucket.netDoes += safeSignedInt(row.companyNetDoes);
    bucket.collectedDoes += safeInt(row.companyCollectedDoes);
    bucket.payoutDoes += safeInt(row.companyPayoutDoes);
    if (row.winnerType === "human") bucket.humanWins += 1;
    if (row.winnerType === "bot") bucket.botWins += 1;
  });

  return [...mix.values()];
}

export function getStakeOptions(rows = []) {
  return [...new Set((rows || []).map((row) => safeInt(row.entryCostDoes)).filter((value) => value > 0))]
    .sort((left, right) => left - right);
}

export function getDayOptions(rows = []) {
  const seen = new Map();
  (rows || []).forEach((row) => {
    if (!row.dayKey) return;
    if (!seen.has(row.dayKey)) {
      seen.set(row.dayKey, {
        value: row.dayKey,
        label: formatDateLabel(row.periodMs),
        count: 0,
      });
    }
    seen.get(row.dayKey).count += 1;
  });

  return [...seen.values()].sort((left, right) => String(right.value).localeCompare(String(left.value), "fr"));
}

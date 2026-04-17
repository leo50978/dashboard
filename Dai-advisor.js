import { ensureFinanceDashboardSession } from "./dashboard-admin-auth.js";
import { getAiAdvisorSnapshotSecure } from "./secure-functions.js";

const dom = {
  status: document.getElementById("aiAdvisorStatus"),
  reportType: document.getElementById("aiAdvisorReportType"),
  dateFrom: document.getElementById("aiAdvisorDateFrom"),
  dateTo: document.getElementById("aiAdvisorDateTo"),
  generateBtn: document.getElementById("aiAdvisorGenerateBtn"),
  copyBtn: document.getElementById("aiAdvisorCopyBtn"),
  generatedAt: document.getElementById("aiAdvisorGeneratedAt"),
  healthScore: document.getElementById("aiAdvisorHealthScore"),
  healthLevel: document.getElementById("aiAdvisorHealthLevel"),
  healthCopy: document.getElementById("aiAdvisorHealthCopy"),
  dimensions: document.getElementById("aiAdvisorDimensions"),
  strengths: document.getElementById("aiAdvisorStrengths"),
  alerts: document.getElementById("aiAdvisorAlerts"),
  priorities: document.getElementById("aiAdvisorPriorities"),
  metrics: document.getElementById("aiAdvisorMetrics"),
  promptOutput: document.getElementById("aiAdvisorPromptOutput"),
  promptMeta: document.getElementById("aiAdvisorPromptMeta"),
};

let lastSnapshot = null;

function safeInt(value) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.max(0, Math.trunc(num)) : 0;
}

function safeFloat(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function formatInt(value) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(safeFloat(value));
}

function formatPct(value) {
  return `${safeFloat(value).toFixed(2)}%`;
}

function formatCurrencyHtg(value) {
  return `${formatInt(value)} HTG`;
}

function formatDateTime(ms) {
  const safeMs = safeInt(ms);
  if (!safeMs) return "--";
  return new Date(safeMs).toLocaleString("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function formatDateOnly(ms) {
  const safeMs = safeInt(ms);
  if (!safeMs) return "--";
  return new Date(safeMs).toLocaleDateString("fr-FR", {
    dateStyle: "medium",
  });
}

function reportTypeLabel(reportType = "daily") {
  return String(reportType || "").trim().toLowerCase() === "global"
    ? "Global recent"
    : "Quotidien";
}

function parseInputDateStartMs(rawValue = "") {
  const value = String(rawValue || "").trim();
  if (!value) return 0;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return NaN;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
}

function parseInputDateEndMs(rawValue = "") {
  const value = String(rawValue || "").trim();
  if (!value) return 0;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return NaN;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return new Date(year, month - 1, day, 23, 59, 59, 999).getTime();
}

function resolveRequestedRange() {
  const startRaw = String(dom.dateFrom?.value || "").trim();
  const endRaw = String(dom.dateTo?.value || "").trim();
  if (!startRaw && !endRaw) {
    return { ok: true, hasRange: false, startMs: 0, endMs: 0, label: "" };
  }
  if (!startRaw || !endRaw) {
    return {
      ok: false,
      message: "Choisis une date de debut et une date de fin pour utiliser le filtre de periode.",
    };
  }

  const startMs = parseInputDateStartMs(startRaw);
  const endMs = parseInputDateEndMs(endRaw);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs <= 0 || endMs <= 0) {
    return { ok: false, message: "Les dates saisies sont invalides." };
  }
  if (startMs > endMs) {
    return { ok: false, message: "La date de debut doit etre inferieure ou egale a la date de fin." };
  }

  const maxRangeMs = 180 * 24 * 60 * 60 * 1000;
  if ((endMs - startMs) > maxRangeMs) {
    return { ok: false, message: "La periode est trop large. Choisis maximum 180 jours pour garder un rapport rapide." };
  }

  return {
    ok: true,
    hasRange: true,
    startMs,
    endMs,
    label: `${formatDateOnly(startMs)} -> ${formatDateOnly(endMs)}`,
  };
}

function resolvePeriodLabel(snapshot = {}) {
  const windows = snapshot.windows || {};
  const startMs = safeInt(windows.startMs);
  const endMs = safeInt(windows.endMs);
  if (startMs > 0 && endMs > 0) {
    return `${formatDateOnly(startMs)} -> ${formatDateOnly(endMs)}`;
  }
  return reportTypeLabel(snapshot.reportType || "daily");
}

function setStatus(text, tone = "neutral") {
  if (!dom.status) return;
  dom.status.textContent = String(text || "");
  dom.status.dataset.tone = tone;
}

function renderList(node, items = [], fallback = "Aucun point à afficher.") {
  if (!node) return;
  const values = (Array.isArray(items) ? items : []).filter(Boolean);
  if (values.length <= 0) {
    node.innerHTML = `<li>${fallback}</li>`;
    return;
  }
  node.innerHTML = values.map((item) => `<li>${String(item)}</li>`).join("");
}

function healthToneClass(tone = "") {
  const key = String(tone || "").trim().toLowerCase();
  if (key === "good") return "good";
  if (key === "critical") return "critical";
  if (key === "warning") return "warning";
  return "watch";
}

function healthLevelLabel(level = "") {
  const key = String(level || "").trim().toLowerCase();
  if (key === "malade") return "Malade";
  if (key === "amateur") return "Amateur";
  if (key === "moyen") return "Moyen";
  return "Avance";
}

function renderHealth(snapshot = {}) {
  const health = snapshot.health || {};
  const dimensions = Array.isArray(health.dimensions) ? health.dimensions : [];

  if (dom.healthScore) dom.healthScore.textContent = formatInt(health.overallScore);
  if (dom.healthLevel) {
    dom.healthLevel.className = `level-chip ${healthToneClass(health.tone)}`;
    dom.healthLevel.textContent = healthLevelLabel(health.level);
  }
  if (dom.healthCopy) {
    const weakest = Array.isArray(health.weakestDimensions)
      ? health.weakestDimensions.map((item) => item.label).filter(Boolean).join(", ")
      : "";
    dom.healthCopy.textContent = weakest
      ? `Les zones les plus fragiles actuellement sont: ${weakest}.`
      : "Le score de sante sera calcule a partir des analytics du site.";
  }
  if (dom.generatedAt) {
    dom.generatedAt.textContent = `Dernier rapport: ${formatDateTime(snapshot.generatedAtMs)}`;
  }

  if (!dom.dimensions) return;
  if (dimensions.length <= 0) {
    dom.dimensions.innerHTML = `<div class="empty-state">Les dimensions trafic, engagement, monetisation, retention et operations apparaitront ici.</div>`;
    return;
  }
  dom.dimensions.innerHTML = dimensions.map((item) => {
    const score = Math.max(0, Math.min(100, safeInt(item.score)));
    return `
      <div class="dimension-row">
        <div class="dimension-labels">
          <strong>${String(item.label || "-")}</strong>
          <span>${formatInt(score)}/100</span>
        </div>
        <div class="dimension-track">
          <div class="dimension-fill" style="width:${score}%;"></div>
        </div>
      </div>
    `;
  }).join("");
}

function renderMetrics(snapshot = {}) {
  if (!dom.metrics) return;
  const visits = snapshot.siteVisits?.summary || {};
  const presence = snapshot.presence?.summary || {};
  const games = snapshot.games?.summary || {};
  const acquisition = snapshot.acquisition?.summary || {};
  const deposits = snapshot.deposits?.summary || {};
  const operations = snapshot.operations || {};

  dom.metrics.innerHTML = `
    <article class="metric-card">
      <p class="metric-label">Trafic & presence</p>
      <p class="metric-value">${formatInt(visits.rangeVisits)}</p>
      <p class="metric-note">
        Visites sur la fenetre. Pic visiteurs: ${formatInt(presence.peakVisitors)}.
        Pic joueurs: ${formatInt(presence.peakPlayers)}.
      </p>
    </article>
    <article class="metric-card">
      <p class="metric-label">Jeux</p>
      <p class="metric-value">${formatInt(games.totalMatches)}</p>
      <p class="metric-note">
        Domino ${formatInt(games.classicMatches)} • Duel ${formatInt(games.duelMatches)} • Morpion ${formatInt(games.morpionMatches)} • Pong ${formatInt(games.pongMatches)}.
      </p>
    </article>
    <article class="metric-card">
      <p class="metric-label">Depots approuves</p>
      <p class="metric-value">${formatCurrencyHtg(deposits.approvedHtg)}</p>
      <p class="metric-note">
        ${formatInt(deposits.approvedCount)} depot(s) approuve(s). Taux d'approbation: ${formatPct(deposits.approvedRatePct)}.
      </p>
    </article>
    <article class="metric-card">
      <p class="metric-label">Acquisition</p>
      <p class="metric-value">${formatInt(acquisition.signupsCount)}</p>
      <p class="metric-note">
        Inscriptions sur la fenetre. Conversion inscription → depot: ${formatPct(acquisition.signupToDepositRatePct)}.
      </p>
    </article>
    <article class="metric-card">
      <p class="metric-label">Retention</p>
      <p class="metric-value">${formatPct(acquisition.activeRatePct)}</p>
      <p class="metric-note">
        Taux de comptes actifs sur la base totale. Fidelisation cohortes: ${formatPct(acquisition.signupToFidelizedRatePct)}.
      </p>
    </article>
    <article class="metric-card">
      <p class="metric-label">Operations</p>
      <p class="metric-value">${formatInt(operations.pendingWithdrawalsCount)}</p>
      <p class="metric-note">
        Retraits en attente. Depots en attente: ${formatInt(deposits.pendingCount)}. Revue suppression ouverte: ${formatInt(operations.openDeletionReviewCount)}.
      </p>
    </article>
  `;
}

function buildPromptFacts(snapshot = {}) {
  const visits = snapshot.siteVisits?.summary || {};
  const visitsTrend = snapshot.siteVisits?.trendDigest || {};
  const presence = snapshot.presence?.summary || {};
  const presenceTrend = snapshot.presence?.trendDigest || {};
  const games = snapshot.games?.summary || {};
  const gamesTrend = snapshot.games?.trendDigest || {};
  const acquisition = snapshot.acquisition?.summary || {};
  const acquisitionTrend = snapshot.acquisition?.trendDigest || {};
  const deposits = snapshot.deposits?.summary || {};
  const depositsTrend = snapshot.deposits?.trendDigest || {};
  const operations = snapshot.operations || {};
  const health = snapshot.health || {};

  return {
    reportType: snapshot.reportType,
    reportLabel: snapshot.reportLabel,
    generatedAtMs: snapshot.generatedAtMs,
    period: {
      startMs: safeInt(snapshot.windows?.startMs),
      endMs: safeInt(snapshot.windows?.endMs),
      analyticsWindow: String(snapshot.windows?.analyticsWindow || ""),
      customRangeApplied: snapshot.windows?.customRangeApplied === true,
      label: resolvePeriodLabel(snapshot),
    },
    health: {
      score: safeInt(health.overallScore),
      level: health.level || "",
      tone: health.tone || "",
      dimensions: Array.isArray(health.dimensions)
        ? health.dimensions.map((item) => ({
            key: item.key,
            label: item.label,
            score: safeInt(item.score),
          }))
        : [],
    },
    visits: {
      rangeVisits: safeInt(visits.rangeVisits),
      allTimeVisits: safeInt(visits.allTimeVisits),
      todayVisits: safeInt(visits.todayVisits),
      peakBucketVisits: safeInt(visits.peakBucketVisits),
      avgPerBucket: safeInt(visits.avgPerBucket),
      trendDirection: visitsTrend.direction || "flat",
      trendChangePct: safeFloat(visitsTrend.changePct),
    },
    presence: {
      peakVisitors: safeInt(presence.peakVisitors),
      peakPlayers: safeInt(presence.peakPlayers),
      peakPlayingRooms: safeInt(presence.peakPlayingRooms),
      currentOnlineUsers: safeInt(presence.currentOnlineUsers),
      currentInGameUsers: safeInt(presence.currentInGameUsers),
      avgDailyPeakVisitors: safeInt(presence.avgDailyPeakVisitors),
      trendDirection: presenceTrend.direction || "flat",
      trendChangePct: safeFloat(presenceTrend.changePct),
    },
    games: {
      totalMatches: safeInt(games.totalMatches),
      classicMatches: safeInt(games.classicMatches),
      duelMatches: safeInt(games.duelMatches),
      morpionMatches: safeInt(games.morpionMatches),
      classicWithBots: safeInt(games.classicWithBots),
      duelWithBots: safeInt(games.duelWithBots),
      morpionWithBots: safeInt(games.morpionWithBots),
      avgMatchesPerBucket: safeInt(games.avgMatchesPerBucket),
      trendDirection: gamesTrend.direction || "flat",
      trendChangePct: safeFloat(gamesTrend.changePct),
    },
    acquisition: {
      totalAccounts: safeInt(acquisition.totalAccounts),
      signupsCount: safeInt(acquisition.signupsCount),
      activeAccounts: safeInt(acquisition.activeAccounts),
      realClients: safeInt(acquisition.realClients),
      frozenAccounts: safeInt(acquisition.frozenAccounts),
      activeRatePct: safeFloat(acquisition.activeRatePct),
      realClientRatePct: safeFloat(acquisition.realClientRatePct),
      signupToDepositRatePct: safeFloat(acquisition.signupToDepositRatePct),
      signupToActiveRatePct: safeFloat(acquisition.signupToActiveRatePct),
      signupToFidelizedRatePct: safeFloat(acquisition.signupToFidelizedRatePct),
      trendDirection: acquisitionTrend.direction || "flat",
      trendChangePct: safeFloat(acquisitionTrend.changePct),
    },
    deposits: {
      requestedCount: safeInt(deposits.requestedCount),
      approvedCount: safeInt(deposits.approvedCount),
      rejectedCount: safeInt(deposits.rejectedCount),
      pendingCount: safeInt(deposits.pendingCount),
      requestedHtg: safeInt(deposits.requestedHtg),
      approvedHtg: safeInt(deposits.approvedHtg),
      rejectedHtg: safeInt(deposits.rejectedHtg),
      pendingHtg: safeInt(deposits.pendingHtg),
      approvedRatePct: safeFloat(deposits.approvedRatePct),
      rejectedRatePct: safeFloat(deposits.rejectedRatePct),
      moncashApprovedSharePct: safeFloat(deposits.moncashApprovedSharePct),
      natcashApprovedSharePct: safeFloat(deposits.natcashApprovedSharePct),
      trendDirection: depositsTrend.direction || "flat",
      trendChangePct: safeFloat(depositsTrend.changePct),
    },
    operations: {
      pendingWithdrawalsCount: safeInt(operations.pendingWithdrawalsCount),
      deletionReviewPendingCount: safeInt(operations.deletionReviewPendingCount),
      deletionReviewContactedCount: safeInt(operations.deletionReviewContactedCount),
      openDeletionReviewCount: safeInt(operations.openDeletionReviewCount),
    },
    alerts: Array.isArray(snapshot.narrative?.alerts) ? snapshot.narrative.alerts : [],
    strengths: Array.isArray(snapshot.narrative?.strengths) ? snapshot.narrative.strengths : [],
    priorities: Array.isArray(snapshot.narrative?.priorities) ? snapshot.narrative.priorities : [],
  };
}

function buildPrompt(snapshot = {}) {
  const data = buildPromptFacts(snapshot);
  const isGlobal = data.reportType === "global";
  const horizonText = isGlobal
    ? "les 7 prochains jours et les 30 prochains jours"
    : "les prochaines 24 heures, 72 heures et 7 jours";
  const focusText = isGlobal
    ? "raisonne comme un directeur data, croissance, produit et operations sur une vue recente globale"
    : "raisonne comme un directeur data, produit et operations sur une vue quotidienne";

  return [
    "Tu es un data analyst senior, un conseiller croissance, un conseiller produit et un conseiller operations pour ma plateforme de jeux en ligne.",
    "",
    "Mission:",
    `- Analyse les chiffres ci-dessous de maniere concrete et ${focusText}.`,
    "- Dis-moi quoi ameliorer, quoi ajouter, quoi retirer, quoi tester, quoi surveiller et quoi stopper.",
    `- Fais des predictions et des alertes pour ${horizonText}.`,
    "- Base-toi uniquement sur les chiffres fournis. Si une donnee manque, signale-le clairement.",
    "- Sois direct, utile et decisionnel. Evite les banalites.",
    "",
    "Regles de reponse obligatoires:",
    "- Reponds en francais.",
    "- Commence par un diagnostic executif tres clair en 8 lignes maximum.",
    "- Donne ensuite les 5 risques majeurs, les 5 opportunites majeures, puis les 5 decisions prioritaires.",
    "- Classe les decisions en P1, P2, P3.",
    "- Propose ensuite: ce qu'il faut ameliorer, ajouter, retirer, automatiser, surveiller.",
    "- Termine par un plan d'action sur 7 jours et un plan d'action sur 30 jours.",
    "- Si tu identifies une fuite de conversion, de retention, de confiance ou d'operations, dis-le clairement.",
    "",
    `Type de rapport: ${data.reportLabel}`,
    `Periode analysee: ${data.period.label}`,
    `Date du snapshot: ${formatDateTime(data.generatedAtMs)}`,
    `Sante globale du site: score ${formatInt(data.health.score)}/100 (${healthLevelLabel(data.health.level)})`,
    "",
    "Forces detectees:",
    ...(data.strengths.length > 0 ? data.strengths.map((item) => `- ${item}`) : ["- Aucune force marquee n'a ete remontee."]),
    "",
    "Alertes detectees:",
    ...(data.alerts.length > 0 ? data.alerts.map((item) => `- ${item}`) : ["- Aucune alerte marquee n'a ete remontee."]),
    "",
    "Priorites detectees:",
    ...(data.priorities.length > 0 ? data.priorities.map((item) => `- ${item}`) : ["- Aucune priorite marquee n'a ete remontee."]),
    "",
    "Chiffres structures a analyser:",
    "```json",
    JSON.stringify(data, null, 2),
    "```",
    "",
    "Maintenant donne-moi une vraie lecture de pilotage business + produit + operations, avec des recommandations franches et exploitables."
  ].join("\n");
}

function renderPrompt(snapshot = {}) {
  if (!dom.promptOutput) return;
  const prompt = buildPrompt(snapshot);
  dom.promptOutput.value = prompt;
  if (dom.promptMeta) {
    dom.promptMeta.textContent = `${resolvePeriodLabel(snapshot)} • ${formatDateTime(snapshot.generatedAtMs)}`;
  }
  if (dom.copyBtn) {
    dom.copyBtn.disabled = !prompt.trim();
  }
}

function renderSnapshot(snapshot = {}) {
  lastSnapshot = snapshot;
  renderHealth(snapshot);
  renderMetrics(snapshot);
  renderList(dom.strengths, snapshot.narrative?.strengths, "Aucun point fort remonté.");
  renderList(dom.alerts, snapshot.narrative?.alerts, "Aucune alerte remontée.");
  renderList(dom.priorities, snapshot.narrative?.priorities, "Aucune priorite remontée.");
  renderPrompt(snapshot);
}

async function generateReport() {
  try {
    setStatus("Generation du rapport IA en cours...", "warning");
    if (dom.generateBtn) dom.generateBtn.disabled = true;
    await ensureFinanceDashboardSession({
      title: "Conseiller IA",
      description: "Connecte-toi avec le compte administrateur autorise pour generer un prompt de pilotage du site.",
    });
    const reportType = String(dom.reportType?.value || "daily").trim().toLowerCase() === "global" ? "global" : "daily";
    const period = resolveRequestedRange();
    if (!period.ok) {
      throw new Error(period.message || "Periode invalide.");
    }
    const payload = period.hasRange
      ? { reportType, startMs: period.startMs, endMs: period.endMs }
      : { reportType };
    const result = await getAiAdvisorSnapshotSecure(payload);
    const snapshot = result?.snapshot || null;
    if (!snapshot) {
      throw new Error("Snapshot IA introuvable.");
    }
    renderSnapshot(snapshot);
    setStatus(
      period.hasRange
        ? `Rapport IA genere pour ${period.label}. Tu peux maintenant copier le prompt.`
        : "Rapport IA genere. Tu peux maintenant copier le prompt.",
      "success"
    );
  } catch (error) {
    console.error("[AI_ADVISOR] generate error", error);
    setStatus(error?.message || "Impossible de generer le rapport IA.", "error");
  } finally {
    if (dom.generateBtn) dom.generateBtn.disabled = false;
  }
}

async function copyPrompt() {
  try {
    const text = String(dom.promptOutput?.value || "").trim();
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setStatus("Prompt copie dans le presse-papiers.", "success");
  } catch (error) {
    console.error("[AI_ADVISOR] copy error", error);
    setStatus("Impossible de copier automatiquement. Tu peux encore copier le texte manuellement.", "warning");
  }
}

function bindEvents() {
  dom.generateBtn?.addEventListener("click", () => {
    void generateReport();
  });

  dom.copyBtn?.addEventListener("click", () => {
    void copyPrompt();
  });

  const refreshReadyStatus = () => {
    const nextLabel = reportTypeLabel(dom.reportType?.value || "daily");
    const period = resolveRequestedRange();
    if (!period.ok) {
      setStatus(period.message || "Periode invalide.", "warning");
      return;
    }
    if (period.hasRange) {
      setStatus(`Mode pret: ${nextLabel} • Periode: ${period.label}. Clique sur "Generer le prompt".`, "neutral");
      return;
    }
    setStatus(`Mode pret: ${nextLabel}. Clique sur "Generer le prompt" pour lancer les lectures utiles.`, "neutral");
  };

  dom.reportType?.addEventListener("change", refreshReadyStatus);
  dom.dateFrom?.addEventListener("change", refreshReadyStatus);
  dom.dateTo?.addEventListener("change", refreshReadyStatus);
}

bindEvents();

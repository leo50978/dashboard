import { ensureFinanceDashboardSession } from "./dashboard-admin-auth.js";
import { getRecruitmentAnalyticsSnapshotSecure } from "./secure-functions.js";

const dom = {
  status: document.getElementById("recruitmentStatus"),
  refreshBtn: document.getElementById("recruitmentRefreshBtn"),
  coverage: document.getElementById("recruitmentCoverage"),
  generatedAt: document.getElementById("recruitmentGeneratedAt"),
  visits: document.getElementById("recruitmentVisits"),
  applications: document.getElementById("recruitmentApplications"),
  conversion: document.getElementById("recruitmentConversion"),
  deadline: document.getElementById("recruitmentDeadline"),
  target: document.getElementById("recruitmentTarget"),
  remainingSlots: document.getElementById("recruitmentRemainingSlots"),
  campaignState: document.getElementById("recruitmentCampaignState"),
  campaignNote: document.getElementById("recruitmentCampaignNote"),
  applicationsList: document.getElementById("recruitmentApplicationsList"),
};

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

function formatPercent(value) {
  return `${(safeFloat(value) * 100).toFixed(1)}%`;
}

function formatDateTime(ms) {
  const safeMs = safeInt(ms);
  if (!safeMs) return "-";
  return new Date(safeMs).toLocaleString("fr-FR");
}

function formatRemaining(ms) {
  const safeMs = safeInt(ms);
  if (!safeMs) return "Cloture proche";
  const totalHours = Math.floor(safeMs / (60 * 60 * 1000));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  if (days >= 2) return `${days} jours`;
  if (days === 1) return `1 jour ${hours} h`;
  if (hours >= 1) return `${hours} h`;
  const minutes = Math.max(1, Math.floor(safeMs / (60 * 1000)));
  return `${minutes} min`;
}

function setStatus(text, tone = "neutral") {
  if (!dom.status) return;
  dom.status.textContent = String(text || "");
  dom.status.dataset.tone = tone;
}

function renderSummary(snapshot = {}) {
  const summary = snapshot.summary || {};
  const visits = safeInt(summary.pageVisitCount);
  const applications = safeInt(summary.applicationsCount);
  const target = Math.max(1, safeInt(summary.targetCount));
  const remainingSlots = Math.max(0, target - applications);
  const remainingMs = safeInt(summary.remainingMs);

  if (dom.visits) dom.visits.textContent = formatInt(visits);
  if (dom.applications) dom.applications.textContent = formatInt(applications);
  if (dom.conversion) dom.conversion.textContent = formatPercent(summary.conversionRatePct);
  if (dom.deadline) dom.deadline.textContent = formatRemaining(remainingMs);
  if (dom.target) dom.target.textContent = formatInt(target);
  if (dom.remainingSlots) dom.remainingSlots.textContent = formatInt(remainingSlots);
  if (dom.generatedAt) dom.generatedAt.textContent = formatDateTime(summary.generatedAtMs);
  if (dom.coverage) {
    dom.coverage.textContent = `Visites: ${formatInt(visits)} • Candidatures: ${formatInt(applications)} • Dernier calcul: ${formatDateTime(summary.generatedAtMs)}`;
  }

  if (dom.campaignState) {
    if (remainingSlots <= 10) {
      dom.campaignState.textContent = "Phase finale";
    } else if (applications > 0) {
      dom.campaignState.textContent = "Campagne active";
    } else {
      dom.campaignState.textContent = "Lancement";
    }
  }
  if (dom.campaignNote) {
    dom.campaignNote.textContent = remainingSlots <= 10
      ? "La campagne approche du plein. Les derniers dossiers doivent etre suivis de pres."
      : "Le recrutement reste ouvert, avec une pression qui monte a mesure que les dossiers arrivent.";
  }
}

function renderApplications(snapshot = {}) {
  if (!dom.applicationsList) return;
  const items = Array.isArray(snapshot.recentApplications) ? snapshot.recentApplications : [];
  if (items.length <= 0) {
    dom.applicationsList.innerHTML = `<div class="empty-state">Aucune candidature recue pour le moment.</div>`;
    return;
  }

  dom.applicationsList.innerHTML = items.map((item) => `
    <article class="application-row">
      <div class="application-row__top">
        <div>
          <p class="application-name">${item.fullName || "Sans nom"}</p>
          <p class="application-meta">${item.applicationCode || "-"} • ${formatDateTime(item.createdAtMs)} • ${item.phone || "-"}</p>
        </div>
        <span class="application-badge">${item.status || "pending"}</span>
      </div>
      <div class="application-grid">
        <div>
          <span>Sexe</span>
          <strong>${item.sex || "-"}</strong>
        </div>
        <div>
          <span>Réseau</span>
          <strong>${formatInt(item.networkReach)}</strong>
        </div>
        <div>
          <span>Poste actuel</span>
          <strong>${item.currentPosition || "-"}</strong>
        </div>
      </div>
      <div class="application-grid" style="grid-template-columns: 1fr;">
        <div>
          <span>Adresse</span>
          <strong>${item.fullAddress || "-"}</strong>
        </div>
      </div>
      <p class="application-letter">${item.motivationLetter || "Aucune lettre de motivation."}</p>
    </article>
  `).join("");
}

async function loadRecruitmentDashboard() {
  setStatus("Chargement des candidatures...", "neutral");
  try {
    const response = await getRecruitmentAnalyticsSnapshotSecure({});
    renderSummary(response?.snapshot || {});
    renderApplications(response?.snapshot || {});
    setStatus("Dashboard recrutement à jour.", "success");
  } catch (error) {
    console.error("[DRECRUTEMENT] load failed", error);
    setStatus(String(error?.message || "Impossible de charger le dashboard recrutement."), "error");
    if (dom.applicationsList) {
      dom.applicationsList.innerHTML = `<div class="empty-state">Impossible de charger les candidatures.</div>`;
    }
  }
}

async function bootstrap() {
  await ensureFinanceDashboardSession({ redirectTo: "./index.html" });
  if (dom.refreshBtn) {
    dom.refreshBtn.addEventListener("click", () => {
      void loadRecruitmentDashboard();
    });
  }
  await loadRecruitmentDashboard();
}

bootstrap().catch((error) => {
  console.error("[DRECRUTEMENT] bootstrap failed", error);
  setStatus("Session admin invalide.", "error");
});

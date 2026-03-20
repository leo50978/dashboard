import { ensureFinanceDashboardSession } from "./dashboard-admin-auth.js";
import {
  deleteSurveySecure,
  listSurveysSecure,
  publishSurveySecure,
  upsertSurveySecure,
} from "./secure-functions.js";

const formEl = document.getElementById("surveyForm");
const idEl = document.getElementById("surveyIdInput");
const titleEl = document.getElementById("surveyTitleInput");
const descriptionEl = document.getElementById("surveyDescriptionInput");
const allowChoiceEl = document.getElementById("surveyAllowChoiceInput");
const allowTextEl = document.getElementById("surveyAllowTextInput");
const choicesEl = document.getElementById("surveyChoicesInput");
const statusEl = document.getElementById("surveyStatusInput");
const formStatusEl = document.getElementById("surveyFormStatus");
const listStatusEl = document.getElementById("surveyListStatus");
const listEl = document.getElementById("surveyList");
const formTitleEl = document.getElementById("surveyFormTitle");
const saveBtn = document.getElementById("surveySaveBtn");
const resetBtn = document.getElementById("surveyResetBtn");
const statAllEl = document.getElementById("surveyStatAll");
const statLiveEl = document.getElementById("surveyStatLive");
const statDraftEl = document.getElementById("surveyStatDraft");
const statResponsesEl = document.getElementById("surveyStatResponses");

let surveys = [];
let busy = false;

function safeInt(value) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.max(0, Math.trunc(num)) : 0;
}

function escapeHtml(value = "") {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDateTime(ms = 0) {
  if (!ms) return "-";
  return new Date(ms).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusChip(status = "") {
  const normalized = String(status || "draft").toLowerCase();
  const label = normalized === "live" ? "Publié" : normalized === "closed" ? "Fermé" : "Brouillon";
  return `<span class="chip ${normalized}">${label}</span>`;
}

function setBusy(nextBusy) {
  busy = nextBusy === true;
  if (saveBtn) saveBtn.disabled = busy;
}

function readChoicesInput() {
  return String(choicesEl?.value || "")
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function resetForm() {
  if (formEl) formEl.reset();
  if (idEl) idEl.value = "";
  if (allowChoiceEl) allowChoiceEl.checked = true;
  if (allowTextEl) allowTextEl.checked = false;
  if (statusEl) statusEl.value = "draft";
  if (formTitleEl) formTitleEl.textContent = "Créer un sondage";
  if (saveBtn) saveBtn.textContent = "Enregistrer";
  if (formStatusEl) formStatusEl.textContent = "";
}

function fillForm(survey = {}) {
  if (idEl) idEl.value = survey.id || "";
  if (titleEl) titleEl.value = survey.title || "";
  if (descriptionEl) descriptionEl.value = survey.description || "";
  if (allowChoiceEl) allowChoiceEl.checked = survey.allowChoiceAnswer !== false;
  if (allowTextEl) allowTextEl.checked = survey.allowTextAnswer === true;
  if (choicesEl) choicesEl.value = Array.isArray(survey.choices) ? survey.choices.map((choice) => choice.label || "").join("\n") : "";
  if (statusEl) statusEl.value = survey.status === "closed" ? "closed" : "draft";
  if (formTitleEl) formTitleEl.textContent = `Modifier: ${survey.title || "Sondage"}`;
  if (saveBtn) saveBtn.textContent = "Mettre à jour";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function updateStats() {
  const liveCount = surveys.filter((survey) => survey.status === "live").length;
  const draftCount = surveys.filter((survey) => survey.status === "draft").length;
  const responseCount = surveys.reduce((sum, survey) => sum + safeInt(survey.responseCount), 0);
  if (statAllEl) statAllEl.textContent = String(surveys.length);
  if (statLiveEl) statLiveEl.textContent = String(liveCount);
  if (statDraftEl) statDraftEl.textContent = String(draftCount);
  if (statResponsesEl) statResponsesEl.textContent = String(responseCount);
}

function renderList() {
  updateStats();
  if (!listEl) return;
  if (!surveys.length) {
    listEl.innerHTML = `<div class="empty">Aucun sondage pour le moment.</div>`;
    return;
  }

  listEl.innerHTML = surveys.map((survey) => `
    <article class="survey-card">
      <div class="survey-head">
        <div>
          <h3 class="survey-title">${escapeHtml(survey.title || "Sondage sans titre")}</h3>
          <p class="muted" style="margin:8px 0 0;">${escapeHtml(survey.description || "Aucune description.")}</p>
        </div>
        ${statusChip(survey.status)}
      </div>
      <div class="survey-meta">
        <span class="chip">${safeInt(survey.responseCount)} réponse(s)</span>
        <span class="chip">Choix: ${Array.isArray(survey.choices) ? survey.choices.length : 0}</span>
        <span class="chip">MAJ ${escapeHtml(formatDateTime(survey.updatedAtMs))}</span>
      </div>
      <div class="survey-actions">
        <button class="ghost-btn" type="button" data-action="edit" data-id="${escapeHtml(survey.id)}">Modifier</button>
        <button class="primary-btn" type="button" data-action="publish" data-id="${escapeHtml(survey.id)}">Publier</button>
        <a class="link-btn" href="./reponsesondage.html?surveyId=${encodeURIComponent(survey.id)}">Réponses</a>
        <button class="danger-btn" type="button" data-action="delete" data-id="${escapeHtml(survey.id)}">Supprimer</button>
      </div>
    </article>
  `).join("");
}

async function refreshSurveys() {
  if (listStatusEl) listStatusEl.textContent = "Chargement des sondages...";
  const result = await listSurveysSecure({});
  surveys = Array.isArray(result?.surveys) ? result.surveys : [];
  if (listStatusEl) listStatusEl.textContent = "";
  renderList();
}

async function handleSubmit(event) {
  event.preventDefault();
  if (busy) return;
  setBusy(true);
  if (formStatusEl) formStatusEl.textContent = "";
  try {
    await upsertSurveySecure({
      surveyId: String(idEl?.value || "").trim(),
      title: titleEl?.value || "",
      description: descriptionEl?.value || "",
      allowChoiceAnswer: allowChoiceEl?.checked === true,
      allowTextAnswer: allowTextEl?.checked === true,
      choices: readChoicesInput(),
      status: statusEl?.value || "draft",
    });
    if (formStatusEl) formStatusEl.textContent = "Sondage enregistré.";
    resetForm();
    await refreshSurveys();
  } catch (error) {
    if (formStatusEl) formStatusEl.textContent = error?.message || "Impossible d'enregistrer le sondage.";
  } finally {
    setBusy(false);
  }
}

async function handleListClick(event) {
  const target = event.target instanceof HTMLElement ? event.target.closest("[data-action][data-id]") : null;
  if (!(target instanceof HTMLElement)) return;
  const surveyId = String(target.dataset.id || "").trim();
  const action = String(target.dataset.action || "").trim();
  const survey = surveys.find((item) => item.id === surveyId);
  if (!survey) return;

  if (action === "edit") {
    fillForm(survey);
    return;
  }
  if (action === "publish") {
    target.setAttribute("disabled", "true");
    try {
      await publishSurveySecure({ surveyId });
      await refreshSurveys();
    } catch (error) {
      if (listStatusEl) listStatusEl.textContent = error?.message || "Impossible de publier le sondage.";
    } finally {
      target.removeAttribute("disabled");
    }
    return;
  }
  if (action === "delete") {
    if (!window.confirm(`Supprimer "${survey.title || "ce sondage"}" ?`)) return;
    target.setAttribute("disabled", "true");
    try {
      await deleteSurveySecure({ surveyId });
      if (String(idEl?.value || "") === surveyId) resetForm();
      await refreshSurveys();
    } catch (error) {
      if (listStatusEl) listStatusEl.textContent = error?.message || "Impossible de supprimer le sondage.";
    } finally {
      target.removeAttribute("disabled");
    }
  }
}

async function init() {
  await ensureFinanceDashboardSession({
    title: "Dashboard sondages",
    description: "Connecte-toi avec le compte administrateur autorisé pour créer et publier des sondages globaux.",
  });
  resetForm();
  await refreshSurveys();
}

formEl?.addEventListener("submit", handleSubmit);
resetBtn?.addEventListener("click", resetForm);
listEl?.addEventListener("click", handleListClick);

init().catch((error) => {
  if (listStatusEl) listStatusEl.textContent = error?.message || "Impossible d'ouvrir le dashboard sondages.";
});

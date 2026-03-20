import { ensureFinanceDashboardSession } from "./dashboard-admin-auth.js";
import { getSurveyResponsesSecure, listSurveysSecure } from "./secure-functions.js";

const surveySelectEl = document.getElementById("surveySelect");
const searchInputEl = document.getElementById("responseSearchInput");
const totalCountEl = document.getElementById("responseTotalCount");
const choiceCountEl = document.getElementById("responseChoiceCount");
const textCountEl = document.getElementById("responseTextCount");
const latestAtEl = document.getElementById("responseLatestAt");
const choiceStatusEl = document.getElementById("responseChoiceStatus");
const choiceBreakdownEl = document.getElementById("responseChoiceBreakdown");
const listStatusEl = document.getElementById("responseListStatus");
const listEl = document.getElementById("responseList");

const queryParams = new URLSearchParams(window.location.search);
let surveys = [];
let responses = [];
let currentSurvey = null;

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

function responseSearchValue() {
  return String(searchInputEl?.value || "").trim().toLowerCase();
}

function renderSurveyOptions() {
  if (!surveySelectEl) return;
  surveySelectEl.innerHTML = surveys.map((survey) => `
    <option value="${escapeHtml(survey.id)}">${escapeHtml(survey.title || "Sondage")}</option>
  `).join("");
}

function filteredResponses() {
  const search = responseSearchValue();
  if (!search) return responses;
  return responses.filter((item) => {
    const haystack = [
      item.clientSnapshot?.displayName,
      item.clientSnapshot?.email,
      item.clientSnapshot?.phone,
      item.uid,
      item.choiceLabel,
      item.textAnswer,
    ].join(" ").toLowerCase();
    return haystack.includes(search);
  });
}

function renderStats(items = []) {
  const total = items.length;
  const choiceCount = items.filter((item) => String(item.choiceId || "").trim()).length;
  const textCount = items.filter((item) => String(item.textAnswer || "").trim()).length;
  const latestAt = items.reduce((max, item) => Math.max(max, safeInt(item.answeredAtMs)), 0);
  if (totalCountEl) totalCountEl.textContent = String(total);
  if (choiceCountEl) choiceCountEl.textContent = String(choiceCount);
  if (textCountEl) textCountEl.textContent = String(textCount);
  if (latestAtEl) latestAtEl.textContent = formatDateTime(latestAt);
}

function renderChoiceBreakdown(items = []) {
  if (!choiceBreakdownEl) return;
  const counts = new Map();
  items.forEach((item) => {
    const label = String(item.choiceLabel || "").trim();
    if (!label) return;
    counts.set(label, safeInt(counts.get(label)) + 1);
  });
  const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (choiceStatusEl) {
    choiceStatusEl.textContent = currentSurvey
      ? `${currentSurvey.title || "Sondage"} · ${rows.length} choix ayant reçu au moins une réponse`
      : "";
  }
  if (!rows.length) {
    choiceBreakdownEl.innerHTML = `<div class="empty">Aucune réponse guidée pour le moment.</div>`;
    return;
  }
  choiceBreakdownEl.innerHTML = rows.map(([label, count]) => `
    <div class="choice-row">
      <strong>${escapeHtml(label)}</strong>
      <small>${count} réponse(s)</small>
    </div>
  `).join("");
}

function renderResponseList() {
  const items = filteredResponses();
  renderStats(items);
  renderChoiceBreakdown(items);
  if (!listEl) return;
  if (listStatusEl) {
    listStatusEl.textContent = currentSurvey
      ? `${items.length} réponse(s) affichée(s) pour ${currentSurvey.title || "ce sondage"}`
      : "";
  }
  if (!items.length) {
    listEl.innerHTML = `<div class="empty">Aucune réponse à afficher.</div>`;
    return;
  }
  listEl.innerHTML = items.map((item) => `
    <article class="response-card">
      <div class="response-head">
        <div>
          <strong>${escapeHtml(item.clientSnapshot?.displayName || item.clientSnapshot?.email || item.uid || "Client")}</strong>
          <div class="response-meta">
            <span class="chip">${escapeHtml(item.clientSnapshot?.email || "Sans email")}</span>
            <span class="chip">${escapeHtml(item.clientSnapshot?.phone || "Sans téléphone")}</span>
            <span class="chip">${escapeHtml(item.uid || "-")}</span>
          </div>
        </div>
        <span class="chip">${escapeHtml(formatDateTime(item.answeredAtMs))}</span>
      </div>
      ${item.choiceLabel ? `<p style="margin:12px 0 0;"><strong>Choix:</strong> ${escapeHtml(item.choiceLabel)}</p>` : ""}
      ${item.textAnswer ? `<p style="margin:10px 0 0;line-height:1.65;"><strong>Texte:</strong> ${escapeHtml(item.textAnswer)}</p>` : ""}
    </article>
  `).join("");
}

async function loadResponses(surveyId) {
  if (!surveyId) {
    currentSurvey = null;
    responses = [];
    renderResponseList();
    return;
  }
  if (listStatusEl) listStatusEl.textContent = "Chargement des réponses...";
  const result = await getSurveyResponsesSecure({ surveyId });
  currentSurvey = result?.survey || null;
  responses = Array.isArray(result?.responses) ? result.responses : [];
  renderResponseList();
}

async function init() {
  await ensureFinanceDashboardSession({
    title: "Réponses sondage",
    description: "Connecte-toi avec le compte administrateur autorisé pour lire les retours envoyés par les joueurs.",
  });
  const result = await listSurveysSecure({});
  surveys = Array.isArray(result?.surveys) ? result.surveys : [];
  renderSurveyOptions();
  const preferredId = String(queryParams.get("surveyId") || "").trim();
  const firstId = surveys.find((survey) => survey.id === preferredId)?.id || surveys[0]?.id || "";
  if (surveySelectEl) surveySelectEl.value = firstId;
  await loadResponses(firstId);
}

surveySelectEl?.addEventListener("change", async () => {
  await loadResponses(String(surveySelectEl.value || "").trim());
});

searchInputEl?.addEventListener("input", renderResponseList);

init().catch((error) => {
  if (listStatusEl) listStatusEl.textContent = error?.message || "Impossible de charger les réponses du sondage.";
});

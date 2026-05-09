import { ensureFinanceDashboardSession } from "./dashboard-admin-auth.js";
import {
  db,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "./firebase-init.js";

const WHATSAPP_SETTINGS_DOC = "whatsapp_modal_contacts_v1";

const DEFAULT_CONTACTS = Object.freeze({
  support_default: "50940507232",
  rejected_order: "50940507232",
  agent_deposit: "50940507232",
  withdrawal_assistance: "50940507232",
  welcome_deposit_modal: "50940507232",
  recruitment_modal: "50940507232",
  championnat_mopyon: "50940507232",
});

const FIELD_META = Object.freeze([
  {
    key: "support_default",
    label: "Support par defaut",
    status: "Actif",
    summary: "Accueil, profil et aide generale.",
    locations: [
      "Accueil -> bouton \"Ou gen pwobleme? kontakte on agent la\".",
      "Accueil -> modal aide home et modal depot rejete / compte sispann.",
      "Payment -> assistance generale et verifikasyon sekirite depo.",
      "Profil -> modal aide agent.",
    ],
  },
  {
    key: "agent_deposit",
    label: "Depot via agent",
    status: "Actif",
    summary: "Tous les parcours depot via agent.",
    locations: [
      "Accueil -> modal gros depot 1000 HTG ou plis.",
      "Solde -> modales depot via agent.",
      "Payment -> parcours depot via agent.",
      "Profil -> panel DEPOT AGENT.",
    ],
  },
  {
    key: "withdrawal_assistance",
    label: "Assistance retrait",
    status: "Actif",
    summary: "Aide retrait et blocages associes.",
    locations: [
      "Accueil -> assistance support / oubli mot de passe quand le flux pointe vers l'assistance.",
      "Retrait -> modal regles et confirmation.",
      "Profil -> panel RETRAIT AGENT.",
    ],
  },
  {
    key: "rejected_order",
    label: "Depot rejete",
    status: "Actif",
    summary: "Suivi des commandes rejetees.",
    locations: [
      "Solde -> alerte de commande rejetee.",
      "Solde -> assistance WhatsApp apres rejet de depot.",
    ],
  },
  {
    key: "welcome_deposit_modal",
    label: "Modal depot bienvenue",
    status: "Actif",
    summary: "Flux bonus bienvenue / aide WhatsApp.",
    locations: [
      "Payment -> etape bonus bienvenue avec bouton WhatsApp dedie.",
      "Payment -> erreur de verification du bonus bienvenue.",
    ],
  },
  {
    key: "recruitment_modal",
    label: "Modal recrutement",
    status: "Actif",
    summary: "Recrutement / devenir agent.",
    locations: [
      "Profil -> bouton DEVENIR UN AGENT.",
    ],
  },
  {
    key: "championnat_mopyon",
    label: "Championnat Mopyon",
    status: "Actif",
    summary: "Cle jeu public dediee.",
    locations: [
      "Dame -> numero WhatsApp affiche dans l'etat public expire.",
    ],
  },
]);

const dom = {
  form: document.getElementById("whatsappConfigForm"),
  status: document.getElementById("whatsappStatus"),
  saveBtn: document.getElementById("whatsappSaveBtn"),
  reloadBtn: document.getElementById("whatsappReloadBtn"),
  preview: document.getElementById("whatsappPreview"),
  fields: {
    support_default: document.getElementById("wa_support_default"),
    rejected_order: document.getElementById("wa_rejected_order"),
    agent_deposit: document.getElementById("wa_agent_deposit"),
    withdrawal_assistance: document.getElementById("wa_withdrawal_assistance"),
    welcome_deposit_modal: document.getElementById("wa_welcome_deposit_modal"),
    recruitment_modal: document.getElementById("wa_recruitment_modal"),
    championnat_mopyon: document.getElementById("wa_championnat_mopyon"),
  },
};

let currentAdmin = null;

function sanitizeDigits(value = "", fallback = "") {
  const digits = String(value || "").replace(/\D/g, "").trim();
  if (digits.length >= 8 && digits.length <= 20) return digits;
  return String(fallback || "").replace(/\D/g, "").trim();
}

function setStatus(message = "", tone = "") {
  if (!dom.status) return;
  dom.status.textContent = String(message || "");
  dom.status.classList.remove("error", "success");
  if (tone === "error") dom.status.classList.add("error");
  if (tone === "success") dom.status.classList.add("success");
}

function setLoading(isLoading) {
  if (dom.saveBtn) dom.saveBtn.disabled = isLoading;
  if (dom.reloadBtn) dom.reloadBtn.disabled = isLoading;
}

function applyContacts(contacts = {}) {
  Object.entries(dom.fields).forEach(([key, input]) => {
    if (!input) return;
    input.value = sanitizeDigits(contacts[key], DEFAULT_CONTACTS[key]);
  });
  renderFieldUsage();
  renderPreview();
}

function collectContacts() {
  const out = {};
  Object.entries(dom.fields).forEach(([key, input]) => {
    if (!input) return;
    out[key] = sanitizeDigits(input.value, DEFAULT_CONTACTS[key]);
  });
  return out;
}

function renderPreview() {
  if (!dom.preview) return;
  const contacts = collectContacts();
  dom.preview.innerHTML = FIELD_META.map((item) => {
    const digits = sanitizeDigits(contacts[item.key], DEFAULT_CONTACTS[item.key]) || "-";
    return `
      <div class="preview__item">
        <strong>${item.label}</strong>
        <span>${digits ? `+${digits}` : "-"}</span>
        <small>${item.summary}</small>
      </div>
    `;
  }).join("");
}

function renderFieldUsage() {
  FIELD_META.forEach((item) => {
    const input = dom.fields[item.key];
    const field = input?.closest("[data-whatsapp-field]");
    if (!field) return;

    let usage = field.querySelector("[data-whatsapp-usage]");
    if (!usage) {
      usage = document.createElement("div");
      usage.className = "field__usage";
      usage.setAttribute("data-whatsapp-usage", item.key);
      field.appendChild(usage);
    }

    usage.innerHTML = `
      <div class="field__usage-head">
        <span class="field__badge">${item.status}</span>
        <span class="field__summary">${item.summary}</span>
      </div>
      <div class="field__usage-title">Emplacements actifs</div>
      <ul class="field__locations">
        ${item.locations.map((location) => `<li>${location}</li>`).join("")}
      </ul>
    `;
  });
}

async function loadContacts() {
  setLoading(true);
  setStatus("Chargement des contacts WhatsApp...");
  try {
    const snap = await getDoc(doc(db, "settings", WHATSAPP_SETTINGS_DOC));
    const data = snap.exists() ? (snap.data() || {}) : {};
    const contacts = data.contacts && typeof data.contacts === "object"
      ? data.contacts
      : DEFAULT_CONTACTS;
    applyContacts(contacts);
    setStatus("Configuration WhatsApp chargee.", "success");
  } catch (error) {
    console.error("[DWHATSAPP_V2] load error", error);
    applyContacts(DEFAULT_CONTACTS);
    setStatus(error?.message || "Impossible de charger la configuration.", "error");
  } finally {
    setLoading(false);
  }
}

async function saveContacts() {
  const contacts = collectContacts();
  if (!contacts.support_default) {
    setStatus("Le numero support par defaut est obligatoire.", "error");
    return;
  }

  setLoading(true);
  setStatus("Enregistrement en cours...");
  try {
    await setDoc(doc(db, "settings", WHATSAPP_SETTINGS_DOC), {
      contacts,
      version: "wmc-v1",
      updatedAtMs: Date.now(),
      updatedAt: serverTimestamp(),
      updatedByUid: String(currentAdmin?.uid || ""),
      updatedByEmail: String(currentAdmin?.email || ""),
    }, { merge: true });
    applyContacts(contacts);
    setStatus("Configuration WhatsApp enregistree.", "success");
  } catch (error) {
    console.error("[DWHATSAPP_V2] save error", error);
    setStatus(error?.message || "Impossible d'enregistrer la configuration.", "error");
  } finally {
    setLoading(false);
  }
}

async function boot() {
  try {
    currentAdmin = await ensureFinanceDashboardSession({
      title: "Contacts WhatsApp",
      description: "Connecte-toi avec le compte administrateur autorise pour gerer les numeros WhatsApp du site.",
    });
  } catch (_) {
    return;
  }

  Object.values(dom.fields).forEach((input) => {
    input?.addEventListener("input", renderPreview);
  });

  dom.form?.addEventListener("submit", (event) => {
    event.preventDefault();
    void saveContacts();
  });

  dom.reloadBtn?.addEventListener("click", () => {
    void loadContacts();
  });

  await loadContacts();
}

boot();

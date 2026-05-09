import { ensureFinanceDashboardSession } from "./dashboard-admin-auth.js";
import {
  collection,
  db,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
} from "./firebase-init.js";

const PAYMENT_METHODS_COLLECTION = "paymentMethods";

const elements = {
  form: document.getElementById("paymentMethodForm"),
  formTitle: document.getElementById("formTitle"),
  name: document.getElementById("methodName"),
  accountName: document.getElementById("methodAccountName"),
  phoneNumber: document.getElementById("methodPhone"),
  instructions: document.getElementById("methodInstructions"),
  image: document.getElementById("methodImage"),
  qrCode: document.getElementById("methodQrCode"),
  isActive: document.getElementById("methodActive"),
  status: document.getElementById("paymentMethodStatus"),
  list: document.getElementById("paymentMethodsList"),
  resetBtn: document.getElementById("resetMethodBtn"),
  reloadBtn: document.getElementById("reloadMethodsBtn"),
  saveBtn: document.getElementById("saveMethodBtn"),
  total: document.getElementById("methodsTotalValue"),
  active: document.getElementById("methodsActiveValue"),
  inactive: document.getElementById("methodsInactiveValue"),
};

let currentAdmin = null;
let editingId = "";
let methodsState = [];

function escapeHtml(value = "") {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeText(value = "") {
  return String(value || "").trim();
}

function normalizePhone(value = "") {
  return String(value || "")
    .replace(/[^\d+()\-\s]/g, "")
    .trim()
    .slice(0, 40);
}

function normalizeAssetName(value = "") {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  return trimmed.replace(/[\\/]+/g, "").replace(/\s+/g, "");
}

function buildMethodId(name = "") {
  const base = String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
  return base || `method-${Date.now()}`;
}

function setStatus(message = "", tone = "") {
  elements.status.textContent = String(message || "");
  elements.status.className = `status${tone ? ` ${tone}` : ""}`;
}

function setBusy(isBusy) {
  elements.saveBtn.disabled = isBusy;
  elements.reloadBtn.disabled = isBusy;
  elements.resetBtn.disabled = isBusy;
  elements.saveBtn.textContent = isBusy
    ? (editingId ? "Mizajou..." : "Anrejistreman...")
    : (editingId ? "Mizajou metod la" : "Anrejistre");
}

function resetForm() {
  editingId = "";
  elements.form.reset();
  elements.isActive.checked = true;
  elements.formTitle.textContent = "Ajoute yon metod depo";
  setStatus("");
  setBusy(false);
}

function fillForm(method) {
  if (!method) return;
  editingId = String(method.id || "");
  elements.formTitle.textContent = `Modifye metod la: ${method.name || editingId}`;
  elements.name.value = String(method.name || "");
  elements.accountName.value = String(method.accountName || "");
  elements.phoneNumber.value = String(method.phoneNumber || "");
  elements.instructions.value = String(method.instructions || "");
  elements.image.value = String(method.image || "");
  elements.qrCode.value = String(method.qrCode || "");
  elements.isActive.checked = method.isActive !== false;
  setStatus("");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderStats() {
  const total = methodsState.length;
  const active = methodsState.filter((item) => item.isActive !== false).length;
  elements.total.textContent = String(total);
  elements.active.textContent = String(active);
  elements.inactive.textContent = String(Math.max(0, total - active));
}

function renderList() {
  renderStats();
  if (!methodsState.length) {
    elements.list.innerHTML = `
      <div class="empty">
        Pa gen metod depo toujou. Ajoute premye metod la pou li ka parèt nan Paiement sécurisé.
      </div>
    `;
    return;
  }

  elements.list.innerHTML = methodsState
    .map((method) => {
      const activeClass = method.isActive !== false ? "active" : "inactive";
      const activeLabel = method.isActive !== false ? "Aktif" : "Inaktif";
      const files = [method.image, method.qrCode].filter(Boolean);
      return `
        <article class="method" data-method-id="${escapeHtml(method.id)}">
          <div class="method__top">
            <div>
              <h3 class="method__title">${escapeHtml(method.name || method.id)}</h3>
              <div class="method__meta">
                <span class="pill ${activeClass}">${activeLabel}</span>
                ${files.map((file) => `<span class="pill file">${escapeHtml(file)}</span>`).join("")}
              </div>
            </div>
          </div>

          <div class="method__copy"><strong>Kont:</strong> ${escapeHtml(method.accountName || "Pa defini")}</div>
          <div class="method__copy"><strong>Numero:</strong> ${escapeHtml(method.phoneNumber || "Pa defini")}</div>
          <div class="method__copy"><strong>Eksplikasyon:</strong> ${escapeHtml(method.instructions || "Pa gen eksplikasyon toujou.")}</div>

          <div class="method__actions">
            <button type="button" class="ghost" data-action="edit" data-id="${escapeHtml(method.id)}">Modifye</button>
            <button type="button" class="danger" data-action="delete" data-id="${escapeHtml(method.id)}">Efase</button>
          </div>
        </article>
      `;
    })
    .join("");
}

async function loadMethods() {
  const snap = await getDocs(collection(db, PAYMENT_METHODS_COLLECTION));
  methodsState = snap.docs
    .map((item) => ({ id: item.id, ...(item.data() || {}) }))
    .sort((left, right) => {
      const leftActive = left.isActive !== false ? 1 : 0;
      const rightActive = right.isActive !== false ? 1 : 0;
      if (leftActive !== rightActive) return rightActive - leftActive;
      return String(left.name || left.id || "").localeCompare(String(right.name || right.id || ""), "fr", { sensitivity: "base" });
    });
  renderList();
}

async function saveMethod(event) {
  event.preventDefault();
  setStatus("");

  const payload = {
    name: normalizeText(elements.name.value).slice(0, 80),
    accountName: normalizeText(elements.accountName.value).slice(0, 120),
    phoneNumber: normalizePhone(elements.phoneNumber.value),
    instructions: normalizeText(elements.instructions.value).slice(0, 2000),
    image: normalizeAssetName(elements.image.value),
    qrCode: normalizeAssetName(elements.qrCode.value),
    isActive: elements.isActive.checked,
    updatedAt: serverTimestamp(),
    updatedAtMs: Date.now(),
    updatedByUid: String(currentAdmin?.uid || ""),
    updatedByEmail: String(currentAdmin?.email || ""),
  };

  if (!payload.name) {
    setStatus("Non metod la obligatwa.", "error");
    return;
  }

  const docId = editingId || buildMethodId(payload.name);
  const ref = doc(db, PAYMENT_METHODS_COLLECTION, docId);

  try {
    setBusy(true);
    const existing = methodsState.find((item) => item.id === docId);
    await setDoc(ref, {
      ...payload,
      createdAt: existing ? existing.createdAt || serverTimestamp() : serverTimestamp(),
      createdAtMs: existing ? Number(existing.createdAtMs || Date.now()) : Date.now(),
    }, { merge: true });
    setStatus(
      editingId
        ? "Metod la modifye ak siksè."
        : "Nouvo metod depo a anrejistre.",
      "success"
    );
    resetForm();
    await loadMethods();
  } catch (error) {
    console.error("[DPAYMENT_V2] save failed", error);
    setStatus(error?.message || "Enskripsyon metod la echwe.", "error");
  } finally {
    setBusy(false);
  }
}

async function deleteMethod(id) {
  const method = methodsState.find((item) => item.id === id);
  if (!method) return;
  const confirmed = window.confirm(`Efase metod depo "${method.name || id}" la?`);
  if (!confirmed) return;

  try {
    await deleteDoc(doc(db, PAYMENT_METHODS_COLLECTION, id));
    if (editingId === id) {
      resetForm();
    }
    setStatus("Metod la efase.", "success");
    await loadMethods();
  } catch (error) {
    console.error("[DPAYMENT_V2] delete failed", error);
    setStatus(error?.message || "Efase metod la echwe.", "error");
  }
}

function attachListEvents() {
  elements.list.addEventListener("click", async (event) => {
    const target = event.target instanceof HTMLElement ? event.target.closest("[data-action]") : null;
    if (!target) return;
    const action = String(target.getAttribute("data-action") || "");
    const id = String(target.getAttribute("data-id") || "");
    if (!id) return;

    if (action === "edit") {
      fillForm(methodsState.find((item) => item.id === id));
      return;
    }
    if (action === "delete") {
      await deleteMethod(id);
    }
  });
}

async function init() {
  currentAdmin = await ensureFinanceDashboardSession({
    title: "Paiement",
    description: "Connecte-toi avec le compte administrateur autorise pour gerer les methodes de depot.",
  });
  await loadMethods();
  attachListEvents();

  elements.form.addEventListener("submit", saveMethod);
  elements.resetBtn.addEventListener("click", resetForm);
  elements.reloadBtn.addEventListener("click", async () => {
    setStatus("Rechargement...");
    await loadMethods();
    setStatus("Metod yo rechaje.", "success");
  });
}

init().catch((error) => {
  console.error("[DPAYMENT_V2] init failed", error);
  setStatus(error?.message || "Paj paiement lan pa t ka demare.", "error");
});

import { ensureFinanceDashboardSession } from "./dashboard-admin-auth.js";
import {
  db,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "./firebase-init.js";

const dom = {
  form: document.getElementById("heroConfigForm"),
  list: document.getElementById("heroSlidesList"),
  status: document.getElementById("heroStatus"),
  saveBtn: document.getElementById("heroSaveBtn"),
  reloadBtn: document.getElementById("heroReloadBtn"),
  addBtn: document.getElementById("heroAddBtn"),
  preview: document.getElementById("heroPreview"),
};

const DEFAULT_HERO_SLOTS = [
  { name: "hero.jpg", enabled: true, sortOrder: 10 },
  { name: "hero1.jpg", enabled: false, sortOrder: 20 },
  { name: "hero2.jpg", enabled: false, sortOrder: 30 },
  { name: "hero4.jpg", enabled: false, sortOrder: 40 },
];

function normalizeHeroName(value = "") {
  return String(value || "")
    .trim()
    .replace(/^https?:\/\/[^/]+/i, "")
    .replace(/^\/+/, "");
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
  if (dom.addBtn) dom.addBtn.disabled = isLoading;
}

function buildSlideUrl(name = "") {
  const clean = normalizeHeroName(name);
  return clean ? `/${clean}` : "";
}

function mergeWithDefaultSlots(rawSlides = []) {
  const source = Array.isArray(rawSlides) ? rawSlides : [];
  const byName = new Map();

  source.forEach((slide) => {
    const name = normalizeHeroName(slide?.name || slide?.src || "");
    if (!name) return;
    byName.set(name.toLowerCase(), {
      name,
      enabled: slide?.enabled !== false,
      sortOrder: Number.isFinite(Number(slide?.sortOrder)) ? Number(slide.sortOrder) : 999,
    });
  });

  DEFAULT_HERO_SLOTS.forEach((slot) => {
    const key = slot.name.toLowerCase();
    if (!byName.has(key)) byName.set(key, { ...slot });
  });

  return Array.from(byName.values()).sort((left, right) => left.sortOrder - right.sortOrder);
}

function getSlideRows() {
  return Array.from(dom.list?.querySelectorAll(".slide") || []);
}

function collectSlides() {
  return getSlideRows()
    .map((row, index) => {
      const nameInput = row.querySelector(".slide-name");
      const enabledInput = row.querySelector(".slide-enabled");
      const name = normalizeHeroName(nameInput?.value || "");
      return {
        name,
        enabled: enabledInput?.checked === true,
        sortOrder: (index + 1) * 10,
      };
    })
    .filter((slide) => slide.name);
}

function renderPreview(slides = []) {
  if (!dom.preview) return;
  dom.preview.innerHTML = "";
  const active = slides.filter((slide) => slide.enabled === true && slide.name);
  if (!active.length) {
    dom.preview.innerHTML = '<span class="chip">Aucune image active</span>';
    return;
  }
  active.forEach((slide) => {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = buildSlideUrl(slide.name) || slide.name;
    dom.preview.appendChild(chip);
  });
}

function updatePreviewFromForm() {
  renderPreview(collectSlides());
}

function createSlideRow(slide = {}, index = 0) {
  const row = document.createElement("div");
  row.className = "slide";
  row.dataset.index = String(index);
  const safeName = String(normalizeHeroName(slide.name || slide.src || "")).replaceAll('"', "&quot;");
  row.innerHTML = `
    <div class="slide__top">
      <input
        type="text"
        class="slide-name"
        value="${safeName}"
        placeholder="hero4.jpg"
      />
      <label>
        <input type="checkbox" class="slide-enabled" ${slide.enabled === false ? "" : "checked"} />
        Actif
      </label>
    </div>
    <div class="slide__meta">
      <div class="slide__path slide-preview-path">${String(buildSlideUrl(slide.name || slide.src || ""))}</div>
      <button type="button" class="slide-remove">Supprimer</button>
    </div>
  `;

  const nameInput = row.querySelector(".slide-name");
  const enabledInput = row.querySelector(".slide-enabled");
  const previewPath = row.querySelector(".slide-preview-path");
  const syncPreview = () => {
    if (previewPath) previewPath.textContent = buildSlideUrl(nameInput?.value || "");
    updatePreviewFromForm();
  };

  nameInput?.addEventListener("input", syncPreview);
  enabledInput?.addEventListener("change", updatePreviewFromForm);
  row.querySelector(".slide-remove")?.addEventListener("click", () => {
    row.remove();
    updatePreviewFromForm();
  });

  return row;
}

function renderSlides(slides = []) {
  if (!dom.list) return;
  dom.list.innerHTML = "";
  const source = mergeWithDefaultSlots(slides);
  source.forEach((slide, index) => {
    dom.list.appendChild(createSlideRow(slide, index));
  });
  updatePreviewFromForm();
}

async function loadSlides() {
  setLoading(true);
  setStatus("Chargement des images hero...");
  try {
    const snap = await getDoc(doc(db, "settings", "home_hero_slides_v1"));
    const data = snap.exists() ? (snap.data() || {}) : {};
    renderSlides(data.slides || data.images || data.items || []);
    setStatus("Configuration hero chargee.", "success");
  } catch (error) {
    console.error("[DHERO] load error", error);
    renderSlides(DEFAULT_HERO_SLOTS);
    setStatus(error?.message || "Impossible de charger la configuration.", "error");
  } finally {
    setLoading(false);
  }
}

async function saveSlides() {
  const slides = collectSlides();
  if (!slides.length) {
    setStatus("Ajoute au moins une image.", "error");
    return;
  }
  if (!slides.some((slide) => slide.enabled === true)) {
    setStatus("Garde au moins une image active.", "error");
    return;
  }

  setLoading(true);
  setStatus("Enregistrement en cours...");
  try {
    await setDoc(doc(db, "settings", "home_hero_slides_v1"), {
      slides,
      version: "hhs-v2",
      updatedAtMs: Date.now(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
    renderSlides(slides);
    setStatus("Configuration hero enregistree.", "success");
  } catch (error) {
    console.error("[DHERO] save error", error);
    setStatus(error?.message || "Impossible d enregistrer la configuration.", "error");
  } finally {
    setLoading(false);
  }
}

async function boot() {
  try {
    await ensureFinanceDashboardSession({ fallbackUrl: "./index.html" });
  } catch (_) {
    return;
  }

  if (dom.form) {
    dom.form.addEventListener("submit", (event) => {
      event.preventDefault();
      void saveSlides();
    });
  }

  if (dom.reloadBtn) {
    dom.reloadBtn.addEventListener("click", () => {
      void loadSlides();
    });
  }

  if (dom.addBtn) {
    dom.addBtn.addEventListener("click", () => {
      if (!dom.list) return;
      const row = createSlideRow({ name: "", enabled: true }, getSlideRows().length);
      dom.list.appendChild(row);
      row.querySelector(".slide-name")?.focus();
      updatePreviewFromForm();
    });
  }

  await loadSlides();
}

boot();

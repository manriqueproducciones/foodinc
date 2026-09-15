// Cuaderno Nutricional — lógica de la app.
// Vanilla JS + Firebase (Auth + Firestore) vía CDN. Sin build step: esto
// se sube tal cual a GitHub Pages.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
import {
  getFirestore, doc, setDoc, updateDoc, deleteDoc, getDoc,
  collection, query, where, orderBy, onSnapshot, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";
import { OBJETIVO_KCAL, todasLasOpciones } from "./data/opciones.js";

// ---------- Firebase ----------
const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
const db = getFirestore(fbApp);
const provider = new GoogleAuthProvider();

// ---------- constantes ----------
const MEAL_TYPES = [
  { id: "desayuno", label: "Desayuno", icon: "☀️" },
  { id: "almuerzo", label: "Almuerzo", icon: "🍽️" },
  { id: "merienda", label: "Merienda", icon: "🫖" },
  { id: "cena", label: "Cena", icon: "🌙" },
  { id: "colacion", label: "Colación", icon: "🍏" },
  { id: "extra", label: "Extra", icon: "➕" },
];
const TZ = "America/Argentina/Buenos_Aires";
const GEMINI_MODEL = "gemini-3.1-flash-lite";
const GEMINI_FALLBACK_MODEL = "gemini-2.5-flash"; // segundo intento si el liviano también falla

// ---------- estado ----------
let currentUser = null;
let settings = { targetMin: OBJETIVO_KCAL.min, targetMax: OBJETIVO_KCAL.max, geminiKey: "" };
let selectedDate = todayISO();
let entriesUnsub = null;
let dayDocUnsub = null;
let currentEntries = [];
let currentDayFlags = { water: false, activity: false };
let currentView = "hoy"; // hoy | historial | ajustes
let editingEntryId = null;
let pendingPhoto = null; // { fullBase64, fullMime, thumbBase64 }
let historyUnsub = null;
let historyRangeDays = 90; // 0 = todo

// ---------- helpers de fecha ----------
function todayISO(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
function isoAddDays(iso, delta) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}
function formatLongDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  const s = new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(dt);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------- DOM refs ----------
const $ = (sel) => document.querySelector(sel);
const viewLogin = $("#view-login");
const appShell = $("#app-shell");
const viewHoy = $("#view-hoy");
const viewHistorial = $("#view-historial");
const viewAjustes = $("#view-ajustes");
const dateLabel = $("#date-label");
const summaryKcal = $("#summary-kcal");
const summaryPill = $("#summary-pill");
const gaugeFill = $("#gauge-fill");
const gaugeTarget = $("#gauge-target");
const checklistEl = $("#checklist");
const entriesListEl = $("#entries-list");
const historyListEl = $("#history-list");
const historySummaryEl = $("#history-summary");
const sheetBackdrop = $("#sheet-backdrop");
const toastEl = $("#toast");

// ---------- toast ----------
let toastTimer = null;
function toast(msg, isError = false) {
  toastEl.textContent = msg;
  toastEl.classList.toggle("error", isError);
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 3200);
}

// ---------- auth ----------
$("#google-signin-btn").addEventListener("click", async () => {
  try { await signInWithPopup(auth, provider); }
  catch (e) { toast("No se pudo iniciar sesión: " + e.message, true); }
});
$("#signout-btn").addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  if (user) {
    viewLogin.hidden = true;
    appShell.hidden = false;
    await loadSettings();
    watchDate(selectedDate);
    render();
  } else {
    viewLogin.hidden = false;
    appShell.hidden = true;
    if (entriesUnsub) entriesUnsub();
    if (dayDocUnsub) dayDocUnsub();
    if (historyUnsub) historyUnsub();
  }
});

// ---------- settings ----------
async function loadSettings() {
  const ref = doc(db, "users", currentUser.uid, "settings", "profile");
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const d = snap.data();
    settings = {
      targetMin: d.targetMin ?? OBJETIVO_KCAL.min,
      targetMax: d.targetMax ?? OBJETIVO_KCAL.max,
      geminiKey: d.geminiKey ?? "",
    };
  } else {
    settings = { targetMin: OBJETIVO_KCAL.min, targetMax: OBJETIVO_KCAL.max, geminiKey: "" };
  }
  $("#settings-min").value = settings.targetMin;
  $("#settings-max").value = settings.targetMax;
  $("#settings-gemini-key").value = settings.geminiKey;
}

$("#settings-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const min = Number($("#settings-min").value) || OBJETIVO_KCAL.min;
  const max = Number($("#settings-max").value) || OBJETIVO_KCAL.max;
  const geminiKey = $("#settings-gemini-key").value.trim();
  settings = { targetMin: min, targetMax: max, geminiKey };
  const ref = doc(db, "users", currentUser.uid, "settings", "profile");
  await setDoc(ref, settings, { merge: true });
  toast("Ajustes guardados");
  renderSummary();
});

// ---------- watch entries for selected date ----------
function watchDate(iso) {
  if (entriesUnsub) entriesUnsub();
  if (dayDocUnsub) dayDocUnsub();
  selectedDate = iso;
  dateLabel.innerHTML = `${formatLongDate(iso)}${iso === todayISO() ? "" : "<small>toque ▶ para volver a hoy</small>"}`;

  // Nota: solo filtramos por igualdad de fecha (sin orderBy de otro campo)
  // para no depender de un índice compuesto en Firestore. Ordenamos en el
  // cliente por el campo "ts".
  const entriesRef = collection(db, "users", currentUser.uid, "entries");
  const qEntries = query(entriesRef, where("date", "==", iso));
  entriesUnsub = onSnapshot(qEntries, (snap) => {
    currentEntries = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.ts || 0) - (b.ts || 0));
    if (currentView === "hoy") renderHoy();
  }, (err) => toast("Error leyendo comidas: " + err.message, true));

  const dayRef = doc(db, "users", currentUser.uid, "days", iso);
  dayDocUnsub = onSnapshot(dayRef, (snap) => {
    currentDayFlags = snap.exists() ? { water: !!snap.data().water, activity: !!snap.data().activity } : { water: false, activity: false };
    if (currentView === "hoy") renderChecklist();
  });
}

$("#date-prev").addEventListener("click", () => watchDate(isoAddDays(selectedDate, -1)));
$("#date-next").addEventListener("click", () => watchDate(isoAddDays(selectedDate, 1)));
$("#date-label").addEventListener("click", () => watchDate(todayISO()));

// ---------- bottom nav ----------
document.querySelectorAll("nav.bottom-nav button").forEach((btn) => {
  btn.addEventListener("click", () => {
    currentView = btn.dataset.view;
    render();
  });
});

function render() {
  document.querySelectorAll("nav.bottom-nav button").forEach((b) => b.classList.toggle("active", b.dataset.view === currentView));
  viewHoy.hidden = currentView !== "hoy";
  viewHistorial.hidden = currentView !== "historial";
  viewAjustes.hidden = currentView !== "ajustes";
  if (currentView === "hoy") renderHoy();
  if (currentView === "historial") renderHistorial();
}

// ---------- render: hoy ----------
function renderHoy() {
  renderSummary();
  renderChecklist();
  renderEntries();
}

function statusFor(total) {
  const { targetMin, targetMax } = settings;
  if (total === 0) return { label: "Sin registros todavía", cls: "empty" };
  if (total < targetMin * 0.85) return { label: "Muy por debajo del objetivo", cls: "bad" };
  if (total < targetMin) return { label: "Un poco por debajo", cls: "warn" };
  if (total <= targetMax) return { label: "Dentro del rango", cls: "ok" };
  if (total <= targetMax * 1.15) return { label: "Un poco por encima", cls: "warn" };
  return { label: "Por encima del objetivo", cls: "bad" };
}

function renderSummary() {
  const total = currentEntries.reduce((s, e) => s + (Number(e.kcal) || 0), 0);
  summaryKcal.innerHTML = `${total}<small>/ ${settings.targetMin}–${settings.targetMax} kcal</small>`;
  const st = statusFor(total);
  summaryPill.textContent = st.label;
  summaryPill.className = "status-pill " + st.cls;
  const pct = Math.min(100, (total / settings.targetMax) * 100);
  gaugeFill.style.width = pct + "%";
  gaugeFill.className = "gauge-fill " + (st.cls === "bad" ? "bad" : st.cls === "warn" ? "warn" : "");
  const targetPct = Math.min(100, (settings.targetMin / settings.targetMax) * 100);
  gaugeTarget.style.left = targetPct + "%";
}

function renderChecklist() {
  const byType = (t) => currentEntries.filter((e) => e.mealType === t);
  const mainMeals = ["desayuno", "almuerzo", "merienda", "cena"];
  const doneMeals = mainMeals.filter((t) => byType(t).length > 0).length;
  const veggiesOk = [...byType("almuerzo"), ...byType("cena")].some((e) => e.hasVeggies);
  const proteinLunch = byType("almuerzo").some((e) => e.hasProtein);
  const proteinDinner = byType("cena").some((e) => e.hasProtein);
  const carbCount = currentEntries.filter((e) => e.hasComplexCarb).length;

  const items = [
    { label: `${doneMeals}/4 comidas`, done: doneMeals === 4 },
    { label: "Verduras en almuerzo o cena", done: veggiesOk },
    { label: "Proteína en almuerzo", done: proteinLunch },
    { label: "Proteína en cena", done: proteinDinner },
    { label: carbCount > 1 ? `Carbohidrato x${carbCount} (revisar)` : "Carbohidrato complejo 1x", done: carbCount === 1, warn: carbCount > 1 },
    { label: "2L de agua", done: currentDayFlags.water, toggle: "water" },
    { label: "Actividad física", done: currentDayFlags.activity, toggle: "activity" },
  ];

  checklistEl.innerHTML = items.map((it) => `
    <div class="check-item ${it.done ? "done" : ""} ${it.warn ? "warn-item" : ""}" ${it.toggle ? `data-toggle="${it.toggle}"` : ""}>
      <span class="dot"></span>${it.label}
    </div>
  `).join("");

  checklistEl.querySelectorAll("[data-toggle]").forEach((el) => {
    el.addEventListener("click", async () => {
      const key = el.dataset.toggle;
      const newVal = !currentDayFlags[key];
      const ref = doc(db, "users", currentUser.uid, "days", selectedDate);
      await setDoc(ref, { [key]: newVal, date: selectedDate }, { merge: true });
    });
  });
}

function renderEntries() {
  if (currentEntries.length === 0) {
    entriesListEl.innerHTML = `<div class="empty-state">Todavía no cargaste nada este día.<br>Tocá el botón + para agregar una comida.</div>`;
    return;
  }
  entriesListEl.innerHTML = MEAL_TYPES.map((mt) => {
    const items = currentEntries.filter((e) => e.mealType === mt.id);
    if (items.length === 0) return "";
    return `
      <div class="meal-group">
        <h2>${mt.icon} ${mt.label}</h2>
        ${items.map((e) => entryCardHTML(e)).join("")}
      </div>
    `;
  }).join("");

  entriesListEl.querySelectorAll("[data-edit]").forEach((btn) => btn.addEventListener("click", () => openSheet(currentEntries.find((e) => e.id === btn.dataset.edit))));
  entriesListEl.querySelectorAll("[data-del]").forEach((btn) => btn.addEventListener("click", () => deleteEntry(btn.dataset.del)));
}

function entryCardHTML(e) {
  const tags = [];
  if (e.hasVeggies) tags.push("verduras");
  if (e.hasProtein) tags.push("proteína");
  if (e.hasComplexCarb) tags.push("carbohidrato");
  if (e.kcalSource === "ia") tags.push("estimado por IA");
  const thumb = e.photoThumb
    ? `<img class="thumb" src="${e.photoThumb}" alt="">`
    : `<div class="thumb-placeholder">🍽️</div>`;
  return `
    <div class="entry-card">
      ${thumb}
      <div class="entry-body">
        <div class="desc">${escapeHTML(e.description || "(sin descripción)")}</div>
        <div class="meta">${e.weightGrams ? `~${e.weightGrams} g` : ""}</div>
        ${tags.length ? `<div class="tags">${tags.map((t) => `<span class="tag">${t}</span>`).join("")}</div>` : ""}
      </div>
      <div class="entry-kcal num">${e.kcal ?? "?"}</div>
      <div class="entry-actions">
        <button data-edit="${e.id}" title="Editar">✏️</button>
        <button data-del="${e.id}" title="Borrar">🗑️</button>
      </div>
    </div>
  `;
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function deleteEntry(id) {
  if (!confirm("¿Borrar este registro?")) return;
  await deleteDoc(doc(db, "users", currentUser.uid, "entries", id));
  toast("Borrado");
}

// ---------- historial ----------
const historyRangeSeg = $("#history-range-seg");
historyRangeSeg.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-days]");
  if (!btn) return;
  historyRangeSeg.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b === btn));
  historyRangeDays = Number(btn.dataset.days);
  renderHistorial();
});

function renderHistorial() {
  const entriesRef = collection(db, "users", currentUser.uid, "entries");
  // "Todo" (0) usa una fecha muy vieja como piso en vez de sacar el where,
  // así seguimos ordenando por el mismo campo sin necesitar índice compuesto.
  const start = historyRangeDays > 0 ? isoAddDays(todayISO(), -(historyRangeDays - 1)) : "2000-01-01";
  const qHist = query(entriesRef, where("date", ">=", start), orderBy("date", "desc"));
  if (historyUnsub) historyUnsub();
  historyUnsub = onSnapshot(qHist, (snap) => {
    const byDate = {};
    snap.docs.forEach((d) => {
      const data = d.data();
      byDate[data.date] = byDate[data.date] || [];
      byDate[data.date].push(data);
    });
    const dates = Object.keys(byDate).sort((a, b) => (a < b ? 1 : -1));
    if (dates.length === 0) {
      historySummaryEl.innerHTML = "";
      historyListEl.innerHTML = `<div class="empty-state">Todavía no hay historial en este rango. Empezá a cargar comidas en "Hoy".</div>`;
      return;
    }

    const totals = dates.map((d) => byDate[d].reduce((s, e) => s + (Number(e.kcal) || 0), 0));
    const avg = Math.round(totals.reduce((a, b) => a + b, 0) / totals.length);
    const enRango = totals.filter((t) => statusFor(t).cls === "ok").length;
    historySummaryEl.innerHTML = `
      <div class="summary-card" style="padding:14px 16px;">
        <div class="summary-top" style="align-items:center;">
          <div><div class="summary-kcal num" style="font-size:1.4rem;">${avg}<small>kcal/día prom.</small></div></div>
          <div class="status-pill ${enRango === dates.length ? "ok" : enRango === 0 ? "bad" : "warn"}">${enRango}/${dates.length} días en rango</div>
        </div>
      </div>`;

    historyListEl.innerHTML = dates.map((d) => {
      const total = byDate[d].reduce((s, e) => s + (Number(e.kcal) || 0), 0);
      const st = statusFor(total);
      return `
        <div class="history-item" data-date="${d}">
          <div class="hd"><b>${formatLongDate(d)}</b><span>${byDate[d].length} comidas</span></div>
          <div style="display:flex;align-items:center;gap:10px;">
            <span class="hkcal num">${total} kcal</span>
            <span class="status-pill ${st.cls}">${st.label}</span>
          </div>
        </div>
      `;
    }).join("");
    historyListEl.querySelectorAll("[data-date]").forEach((el) => {
      el.addEventListener("click", () => {
        watchDate(el.dataset.date);
        currentView = "hoy";
        render();
      });
    });
  }, (err) => toast("Error leyendo historial: " + err.message, true));
}

// ---------- sheet: agregar/editar comida ----------
const fabBtn = $("#fab-add");
fabBtn.addEventListener("click", () => openSheet(null));
$("#sheet-close").addEventListener("click", closeSheet);
sheetBackdrop.addEventListener("click", (e) => { if (e.target === sheetBackdrop) closeSheet(); });

function openSheet(entry) {
  editingEntryId = entry ? entry.id : null;
  pendingPhoto = entry?.photoThumb ? { thumbBase64: entry.photoThumb, fullBase64: null, fullMime: null } : null;

  $("#sheet-title").textContent = entry ? "Editar comida" : "Agregar comida";
  setMealType(entry?.mealType || guessMealType());
  $("#entry-desc").value = entry?.description || "";
  $("#entry-weight").value = entry?.weightGrams || "";
  $("#entry-kcal").value = entry?.kcal ?? "";
  $("#entry-notes").value = entry?.notes || "";
  $("#chk-veggies").checked = !!entry?.hasVeggies;
  $("#chk-protein").checked = !!entry?.hasProtein;
  $("#chk-carb").checked = !!entry?.hasComplexCarb;
  if (entry?.kcalSource === "ia") $("#entry-desc").dataset.aiSource = "1";
  else delete $("#entry-desc").dataset.aiSource;
  updatePhotoPreview();
  $("#delete-entry-btn").hidden = !entry;
  sheetBackdrop.hidden = false;
}
function closeSheet() {
  sheetBackdrop.hidden = true;
  editingEntryId = null;
  pendingPhoto = null;
  $("#entry-form").reset();
}
function guessMealType() {
  const h = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }).format(new Date());
  const hour = Number(h);
  if (hour < 11) return "desayuno";
  if (hour < 15) return "almuerzo";
  if (hour < 19) return "merienda";
  if (hour < 23) return "cena";
  return "extra";
}

// tipo de comida (segmented control)
const mealSeg = $("#meal-type-seg");
mealSeg.innerHTML = MEAL_TYPES.map((mt) => `<button type="button" data-meal="${mt.id}">${mt.icon} ${mt.label}</button>`).join("");
function setMealType(id) {
  mealSeg.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.meal === id));
}
mealSeg.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-meal]");
  if (btn) setMealType(btn.dataset.meal);
});

// autocompletado de descripción
const datalist = document.getElementById("opciones-datalist");
datalist.innerHTML = todasLasOpciones().map((o) => `<option value="${escapeHTML(o.texto)}">`).join("");
$("#entry-desc").addEventListener("input", (e) => {
  const match = todasLasOpciones().find((o) => o.texto === e.target.value);
  if (match && !$("#entry-kcal").value) $("#entry-kcal").value = match.kcal;
});

// foto (siempre opcional — se puede guardar y analizar sin ella)
const photoInput = $("#photo-input");
$("#photo-btn").addEventListener("click", () => photoInput.click());
$("#photo-remove-btn").addEventListener("click", () => {
  pendingPhoto = null;
  photoInput.value = "";
  updatePhotoPreview();
});
photoInput.addEventListener("change", async () => {
  const file = photoInput.files[0];
  if (!file) return;
  try {
    const full = await resizeImageToBase64(file, 900, 0.75);
    const thumb = await resizeImageToBase64(file, 260, 0.55);
    pendingPhoto = { fullBase64: full.base64, fullMime: full.mime, thumbBase64: thumb.dataUrl };
    updatePhotoPreview();
  } catch (e) {
    toast("No pude procesar la foto: " + e.message, true);
  }
});
function updatePhotoPreview() {
  const wrap = $("#photo-preview-wrap");
  const rowEmpty = $("#photo-row-empty");
  const rowFilled = $("#photo-row-filled");
  if (pendingPhoto?.thumbBase64) {
    wrap.innerHTML = `<img class="photo-preview" src="${pendingPhoto.thumbBase64}" alt="">`;
    rowEmpty.hidden = true;
    rowFilled.hidden = false;
  } else {
    wrap.innerHTML = "";
    rowEmpty.hidden = false;
    rowFilled.hidden = true;
  }
}

function resizeImageToBase64(file, maxDim, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("no se pudo leer el archivo"));
    reader.onload = () => { img.src = reader.result; };
    img.onload = () => {
      let { width, height } = img;
      if (width > height && width > maxDim) { height = Math.round((height * maxDim) / width); width = maxDim; }
      else if (height > maxDim) { width = Math.round((width * maxDim) / height); height = maxDim; }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      resolve({ dataUrl, base64: dataUrl.split(",")[1], mime: "image/jpeg" });
    };
    img.onerror = () => reject(new Error("imagen inválida"));
    reader.readAsDataURL(file);
  });
}

// análisis con IA
$("#ai-analyze-btn").addEventListener("click", async () => {
  if (!settings.geminiKey) {
    toast("Antes cargá tu API key de Gemini en Ajustes", true);
    return;
  }
  const btn = $("#ai-analyze-btn");
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span> Analizando...`;
  try {
    const result = await analyzePhotoWithAI({
      base64Image: pendingPhoto?.fullBase64 || null,
      mimeType: pendingPhoto?.fullMime || null,
      descripcion: $("#entry-desc").value.trim(),
      pesoAprox: $("#entry-weight").value,
      apiKey: settings.geminiKey,
    });
    if (result.alimentos) $("#entry-desc").value = result.alimentos;
    if (result.peso_aproximado_g) $("#entry-weight").value = Math.round(result.peso_aproximado_g);
    if (result.kcal_estimadas) $("#entry-kcal").value = Math.round(result.kcal_estimadas);
    toast(`IA: ~${Math.round(result.kcal_estimadas)} kcal (confianza ${result.confianza || "media"}). Revisá y ajustá si hace falta.`);
    $("#entry-desc").dataset.aiSource = "1";
  } catch (e) {
    toast("Error de la IA: " + e.message, true);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `🔍 Analizar con IA`;
  }
});

function buildGeminiPrompt(descripcion, pesoAprox, hasPhoto) {
  let ctx = "";
  if (descripcion) ctx += `El usuario describió el plato así: "${descripcion}". `;
  if (pesoAprox) ctx += `Estima que pesa aproximadamente ${pesoAprox} g. `;
  const intro = hasPhoto
    ? "Te paso una foto de un plato de comida."
    : "No tengo foto del plato — estimá solo a partir de la descripción en texto que te paso a continuación, sin asumir que hay una imagen.";
  const consigna = hasPhoto ? "Identificá los alimentos visibles en la foto" : "Identificá los alimentos mencionados en la descripción";
  return `Sos un asistente nutricional para alguien que vive en Argentina. ${intro} ${ctx}
${consigna}, estimá el peso total en gramos y las calorías totales aproximadas (kcal), usando valores nutricionales estándar y, cuando corresponda, equivalencias de productos y porciones típicas argentinas (fetas de fiambre, galletas de arroz, milanesas, etc.).
Respondé EXCLUSIVAMENTE con un JSON con este formato exacto, sin texto adicional, sin markdown, sin comentarios:
{"alimentos": "descripción corta en español, ej: milanesa de pollo con puré y ensalada", "peso_aproximado_g": numero, "kcal_estimadas": numero, "confianza": "alta" o "media" o "baja"}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callGemini(model, parts, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
    }),
  });
  if (!res.ok) {
    let detail = "";
    try { detail = (await res.json())?.error?.message || ""; } catch (_) {}
    const err = new Error(`${res.status} ${detail || "no se pudo contactar a Gemini"}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("respuesta vacía, probá de nuevo");
  try { return JSON.parse(text); }
  catch (_) { throw new Error("no pude interpretar la respuesta de la IA"); }
}

async function analyzePhotoWithAI({ base64Image, mimeType, descripcion, pesoAprox, apiKey }) {
  if (!base64Image && !descripcion) throw new Error("Sacá una foto o escribí una descripción primero.");
  const parts = [{ text: buildGeminiPrompt(descripcion, pesoAprox, !!base64Image) }];
  if (base64Image) parts.push({ inline_data: { mime_type: mimeType, data: base64Image } });

  // Reintentamos solo cuando Gemini responde "saturado" (503): dos intentos
  // con el modelo principal y, si sigue sin responder, uno con un modelo
  // más liviano que suele tener más disponibilidad. Cualquier otro error
  // (API key inválida, sin conexión, etc.) corta al toque, sin reintentar.
  const attempts = [
    { model: GEMINI_MODEL, delay: 0 },
    { model: GEMINI_MODEL, delay: 1800 },
    { model: GEMINI_FALLBACK_MODEL, delay: 0 },
  ];

  for (let i = 0; i < attempts.length; i++) {
    const { model, delay } = attempts[i];
    if (delay) await sleep(delay);
    try {
      return await callGemini(model, parts, apiKey);
    } catch (e) {
      const isLastAttempt = i === attempts.length - 1;
      if (e.status !== 503 || isLastAttempt) {
        if (e.status === 503) throw new Error("Gemini está saturado ahora mismo. Probá de nuevo en un minuto, o cargá la comida a mano.");
        throw e;
      }
    }
  }
}

// guardar / borrar
$("#entry-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const mealType = mealSeg.querySelector("button.active")?.dataset.meal;
  const kcalRaw = $("#entry-kcal").value;
  if (kcalRaw === "") { toast("Poné un valor de kcal (o analizalo con IA)", true); return; }
  const kcal = Number(kcalRaw);

  const payload = {
    date: selectedDate,
    mealType,
    description: $("#entry-desc").value.trim(),
    weightGrams: $("#entry-weight").value ? Number($("#entry-weight").value) : null,
    kcal,
    kcalSource: $("#entry-desc").dataset.aiSource ? "ia" : "manual",
    hasVeggies: $("#chk-veggies").checked,
    hasProtein: $("#chk-protein").checked,
    hasComplexCarb: $("#chk-carb").checked,
    notes: $("#entry-notes").value.trim(),
    photoThumb: pendingPhoto?.thumbBase64 || null,
    updatedAt: serverTimestamp(),
  };

  try {
    if (editingEntryId) {
      await updateDoc(doc(db, "users", currentUser.uid, "entries", editingEntryId), payload);
      toast("Actualizado");
    } else {
      payload.createdAt = serverTimestamp();
      payload.ts = Date.now(); // para ordenar en el cliente sin índice compuesto
      const newRef = doc(collection(db, "users", currentUser.uid, "entries"));
      await setDoc(newRef, payload);
      toast("Guardado");
    }
    closeSheet();
  } catch (err) {
    toast("No se pudo guardar: " + err.message, true);
  }
});

$("#delete-entry-btn").addEventListener("click", async () => {
  if (!editingEntryId) return;
  await deleteEntry(editingEntryId);
  closeSheet();
});

// service worker
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}

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
import { OBJETIVO_KCAL, CATEGORY_BY_MEAL, categoriaParaGuardar, opcionesBaseParaCategoria } from "./data/opciones.js";

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
const GEMINI_MODEL = "gemini-3.5-flash-lite";
const GEMINI_FALLBACK_MODEL = "gemini-3.1-flash-lite"; // segundo intento si el principal se satura
const MAX_PHOTOS = 4;

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
let pendingPhotos = []; // [{ fullBase64, fullMime, thumbBase64 }]
let historyUnsub = null;
let historyRangeDays = 90; // 0 = todo
let historyRangeLabel = "90 días";
let lastHistoryDates = []; // fechas (YYYY-MM-DD) del último snapshot de historial
let lastHistoryByDate = {}; // { fecha: [entries...] } del último snapshot de historial
let customOptions = []; // opciones propias del usuario (Firestore: users/{uid}/menuOptions)
let customOptionsUnsub = null;

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
    watchCustomOptions();
    render();
  } else {
    viewLogin.hidden = false;
    appShell.hidden = true;
    if (entriesUnsub) entriesUnsub();
    if (dayDocUnsub) dayDocUnsub();
    if (historyUnsub) historyUnsub();
    if (customOptionsUnsub) customOptionsUnsub();
    customOptions = [];
  }
});

// ---------- opciones propias (Firestore: users/{uid}/menuOptions) ----------
function watchCustomOptions() {
  if (customOptionsUnsub) customOptionsUnsub();
  const ref = collection(db, "users", currentUser.uid, "menuOptions");
  customOptionsUnsub = onSnapshot(ref, (snap) => {
    customOptions = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderQuickOptions();
  }, (err) => toast("Error leyendo tus opciones: " + err.message, true));
}

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
  const photos = e.photoThumbs?.length ? e.photoThumbs : (e.photoThumb ? [e.photoThumb] : []);
  const thumb = photos.length
    ? `<img class="thumb" src="${photos[0]}" alt="">${photos.length > 1 ? `<span class="thumb-count">+${photos.length - 1}</span>` : ""}`
    : `<div class="thumb-placeholder">🍽️</div>`;
  const metaParts = [];
  if (e.weightGrams) metaParts.push(`~${e.weightGrams} g`);
  if (e.fatGrams != null) metaParts.push(`${e.fatGrams} g grasas`);
  return `
    <div class="entry-card">
      <div class="thumb-wrap">${thumb}</div>
      <div class="entry-body">
        <div class="desc">${escapeHTML(e.description || "(sin descripción)")}</div>
        <div class="meta">${metaParts.join(" · ")}</div>
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
const RANGE_LABELS = { 30: "30 días", 90: "90 días", 365: "1 año", 0: "Todo el historial" };
historyRangeSeg.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-days]");
  if (!btn) return;
  historyRangeSeg.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b === btn));
  historyRangeDays = Number(btn.dataset.days);
  historyRangeLabel = RANGE_LABELS[historyRangeDays] || `${historyRangeDays} días`;
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
    lastHistoryDates = dates;
    lastHistoryByDate = byDate;
    $("#export-row").hidden = dates.length === 0;
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

// ---------- exportar informe (para la nutricionista) ----------
function csvEscape(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

$("#export-print-btn").addEventListener("click", () => {
  if (!lastHistoryDates.length) { toast("No hay datos en este rango para exportar", true); return; }
  const datesAsc = [...lastHistoryDates].sort();
  let rows = "";
  let grandKcal = 0, grandFat = 0, grandDaysWithFat = 0;
  datesAsc.forEach((d) => {
    const items = [...lastHistoryByDate[d]].sort((a, b) => (a.ts || 0) - (b.ts || 0));
    const dayKcal = items.reduce((s, e) => s + (Number(e.kcal) || 0), 0);
    const dayFat = items.reduce((s, e) => s + (Number(e.fatGrams) || 0), 0);
    grandKcal += dayKcal;
    if (items.some((e) => e.fatGrams != null)) { grandFat += dayFat; grandDaysWithFat++; }
    const st = statusFor(dayKcal);
    rows += `<tr class="day-row"><td colspan="5">${formatLongDate(d)} — ${dayKcal} kcal${dayFat ? `, ${Math.round(dayFat)} g grasas` : ""} (${st.label})</td></tr>`;
    items.forEach((e) => {
      const mt = MEAL_TYPES.find((m) => m.id === e.mealType);
      const photos = e.photoThumbs?.length ? e.photoThumbs : (e.photoThumb ? [e.photoThumb] : []);
      const photoCell = photos.length ? `<img class="print-thumb" src="${photos[0]}" alt="">` : "";
      rows += `<tr><td>${photoCell}</td><td>${mt ? mt.label : e.mealType}</td><td>${escapeHTML(e.description || "(sin descripción)")}</td><td>${e.kcal ?? "-"} kcal</td><td>${e.fatGrams ?? "-"} g</td></tr>`;
    });
  });
  const avgKcal = Math.round(grandKcal / datesAsc.length);
  const avgFat = grandDaysWithFat ? Math.round(grandFat / grandDaysWithFat) : null;
  $("#print-report").innerHTML = `
    <h1>Cuaderno Nutricional — Informe</h1>
    <p class="print-meta">Paciente: Jon &nbsp;·&nbsp; Rango: ${historyRangeLabel} (${datesAsc[0]} a ${datesAsc[datesAsc.length - 1]}) &nbsp;·&nbsp; Objetivo: ${settings.targetMin}–${settings.targetMax} kcal/día</p>
    <p class="print-meta">Promedio del período: <b>${avgKcal} kcal/día</b>${avgFat != null ? ` · <b>${avgFat} g grasas/día</b>` : ""} · ${datesAsc.length} día(s) registrados</p>
    <table>
      <thead><tr><th>Foto</th><th>Comida</th><th>Descripción</th><th>Kcal</th><th>Grasas</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="print-footnote">Generado el ${new Date().toLocaleDateString("es-AR")} desde el Cuaderno Nutricional de Jon.</p>
  `;
  setTimeout(() => window.print(), 50);
});

$("#export-csv-btn").addEventListener("click", () => {
  if (!lastHistoryDates.length) { toast("No hay datos en este rango para exportar", true); return; }
  const datesAsc = [...lastHistoryDates].sort();
  const lines = [["fecha", "tipo", "descripcion", "peso_g", "kcal", "grasas_g", "notas"].join(",")];
  datesAsc.forEach((d) => {
    [...lastHistoryByDate[d]].sort((a, b) => (a.ts || 0) - (b.ts || 0)).forEach((e) => {
      const mt = MEAL_TYPES.find((m) => m.id === e.mealType);
      lines.push([d, mt ? mt.label : e.mealType, e.description || "", e.weightGrams ?? "", e.kcal ?? "", e.fatGrams ?? "", e.notes || ""].map(csvEscape).join(","));
    });
  });
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `cuaderno-nutricional-${todayISO()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

// ---------- sheet: agregar/editar comida ----------
const fabBtn = $("#fab-add");
fabBtn.addEventListener("click", () => openSheet(null));
$("#sheet-close").addEventListener("click", closeSheet);
sheetBackdrop.addEventListener("click", (e) => { if (e.target === sheetBackdrop) closeSheet(); });

function openSheet(entry) {
  editingEntryId = entry ? entry.id : null;
  const existingThumbs = entry?.photoThumbs?.length ? entry.photoThumbs : (entry?.photoThumb ? [entry.photoThumb] : []);
  pendingPhotos = existingThumbs.map((t) => ({ thumbBase64: t, fullBase64: null, fullMime: null }));

  $("#sheet-title").textContent = entry ? "Editar comida" : "Agregar comida";
  setMealType(entry?.mealType || guessMealType());
  renderQuickOptions();
  $("#entry-desc").value = entry?.description || "";
  $("#entry-weight").value = entry?.weightGrams || "";
  $("#entry-kcal").value = entry?.kcal ?? "";
  $("#entry-fat").value = entry?.fatGrams ?? "";
  $("#entry-notes").value = entry?.notes || "";
  $("#chk-veggies").checked = !!entry?.hasVeggies;
  $("#chk-protein").checked = !!entry?.hasProtein;
  $("#chk-carb").checked = !!entry?.hasComplexCarb;
  if (entry?.kcalSource === "ia") $("#entry-desc").dataset.aiSource = "1";
  else delete $("#entry-desc").dataset.aiSource;
  renderPhotoPreviews();
  $("#delete-entry-btn").hidden = !entry;
  sheetBackdrop.hidden = false;
}
function closeSheet() {
  sheetBackdrop.hidden = true;
  editingEntryId = null;
  pendingPhotos = [];
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
  if (btn) { setMealType(btn.dataset.meal); renderQuickOptions(); }
});

// ---------- opciones rápidas (chips) ----------
const quickOptionsEl = $("#quick-options");
const qoAddRow = $("#qo-add-row");
const qoAddForm = $("#qo-add-form");
const qoNewTexto = $("#qo-new-texto");
const qoNewKcal = $("#qo-new-kcal");

function currentMealType() {
  return mealSeg.querySelector("button.active")?.dataset.meal;
}

function renderQuickOptions() {
  const mealType = currentMealType();
  const category = CATEGORY_BY_MEAL[mealType] ?? null; // null = "extra": mezcla todo
  const base = opcionesBaseParaCategoria(category).map((o) => ({ texto: o.texto, kcal: o.kcal, custom: false }));
  const propias = customOptions
    .filter((o) => category === null || o.category === category)
    .map((o) => ({ id: o.id, texto: o.texto, kcal: o.kcal, custom: true }));
  const todas = [...base, ...propias];

  if (todas.length === 0) {
    quickOptionsEl.innerHTML = `<span style="color:var(--ink-faint); font-size:0.82rem;">Todavía no hay opciones guardadas para "extra" — agregá la tuya abajo.</span>`;
  } else {
    quickOptionsEl.innerHTML = todas.map((o) => `
      <button type="button" class="qo-chip" data-texto="${escapeHTML(o.texto)}" data-kcal="${o.kcal}">
        ${escapeHTML(o.texto)} <span class="qo-kcal num">${o.kcal}</span>${o.custom ? `<span class="qo-del" data-del-id="${o.id}" title="Borrar de mi lista">✕</span>` : ""}
      </button>
    `).join("");
  }

  quickOptionsEl.querySelectorAll(".qo-chip[data-texto]").forEach((chip) => {
    chip.addEventListener("click", (e) => {
      if (e.target.closest(".qo-del")) return;
      $("#entry-desc").value = chip.dataset.texto;
      $("#entry-kcal").value = chip.dataset.kcal;
      delete $("#entry-desc").dataset.aiSource;
    });
  });
  quickOptionsEl.querySelectorAll(".qo-del").forEach((delBtn) => {
    delBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!confirm("¿Borrar esta opción de tu lista?")) return;
      await deleteDoc(doc(db, "users", currentUser.uid, "menuOptions", delBtn.dataset.delId));
    });
  });
}

qoAddRow.addEventListener("click", (e) => {
  if (!e.target.closest("#qo-add-btn")) return;
  qoAddRow.hidden = true;
  qoAddForm.hidden = false;
  qoNewTexto.focus();
});
$("#qo-cancel-btn").addEventListener("click", () => {
  qoAddForm.hidden = true;
  qoAddRow.hidden = false;
  qoNewTexto.value = "";
  qoNewKcal.value = "";
});
$("#qo-save-btn").addEventListener("click", async () => {
  const texto = qoNewTexto.value.trim();
  const kcal = Number(qoNewKcal.value);
  if (!texto) { toast("Escribí una descripción para guardar", true); return; }
  if (!qoNewKcal.value || Number.isNaN(kcal)) { toast("Poné las kcal aproximadas", true); return; }
  const category = categoriaParaGuardar(currentMealType());
  try {
    const newRef = doc(collection(db, "users", currentUser.uid, "menuOptions"));
    await setDoc(newRef, { texto, kcal, category, createdAt: serverTimestamp() });
    // la usamos de una vez en la comida que se está cargando
    $("#entry-desc").value = texto;
    $("#entry-kcal").value = kcal;
    delete $("#entry-desc").dataset.aiSource;
    qoNewTexto.value = "";
    qoNewKcal.value = "";
    qoAddForm.hidden = true;
    qoAddRow.hidden = false;
    toast("Agregada a tu lista");
  } catch (err) {
    toast("No se pudo guardar: " + err.message, true);
  }
});

// fotos (siempre opcionales, hasta MAX_PHOTOS — se puede guardar y analizar sin ellas)
const photoInput = $("#photo-input");
$("#photo-btn").addEventListener("click", () => photoInput.click());
$("#photo-add-btn").addEventListener("click", () => photoInput.click());
photoInput.addEventListener("change", async () => {
  const files = Array.from(photoInput.files || []);
  photoInput.value = "";
  if (!files.length) return;
  const room = MAX_PHOTOS - pendingPhotos.length;
  if (room <= 0) { toast(`Máximo ${MAX_PHOTOS} fotos por comida`, true); return; }
  const toProcess = files.slice(0, room);
  if (files.length > room) toast(`Solo se agregaron ${room} foto(s) — máximo ${MAX_PHOTOS} por comida`, true);
  for (const file of toProcess) {
    try {
      const full = await resizeImageToBase64(file, 900, 0.75);
      const thumb = await resizeImageToBase64(file, 260, 0.55);
      pendingPhotos.push({ fullBase64: full.base64, fullMime: full.mime, thumbBase64: thumb.dataUrl });
    } catch (e) {
      toast("No pude procesar una foto: " + e.message, true);
    }
  }
  renderPhotoPreviews();
});
function renderPhotoPreviews() {
  const wrap = $("#photo-preview-wrap");
  const rowEmpty = $("#photo-row-empty");
  const rowFilled = $("#photo-row-filled");
  const addBtn = $("#photo-add-btn");
  if (pendingPhotos.length === 0) {
    wrap.innerHTML = "";
    rowEmpty.hidden = false;
    rowFilled.hidden = true;
    return;
  }
  rowEmpty.hidden = true;
  rowFilled.hidden = false;
  addBtn.hidden = pendingPhotos.length >= MAX_PHOTOS;
  wrap.innerHTML = pendingPhotos.map((p, i) => `
    <div class="photo-thumb-wrap">
      <img class="photo-preview" src="${p.thumbBase64}" alt="">
      <button type="button" class="photo-thumb-remove" data-idx="${i}" title="Quitar foto">✕</button>
    </div>
  `).join("");
  wrap.querySelectorAll(".photo-thumb-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      pendingPhotos.splice(Number(btn.dataset.idx), 1);
      renderPhotoPreviews();
    });
  });
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
    const result = await analyzeFoodWithAI({
      images: pendingPhotos.map(toApiImage).filter(Boolean),
      descripcion: $("#entry-desc").value.trim(),
      pesoAprox: $("#entry-weight").value,
      geminiKey: settings.geminiKey,
    });
    if (result.alimentos) $("#entry-desc").value = result.alimentos;
    if (result.peso_aproximado_g) $("#entry-weight").value = Math.round(result.peso_aproximado_g);
    if (result.kcal_estimadas) $("#entry-kcal").value = Math.round(result.kcal_estimadas);
    if (result.grasas_estimadas_g != null) $("#entry-fat").value = Math.round(result.grasas_estimadas_g);
    toast(`IA: ~${Math.round(result.kcal_estimadas)} kcal, ~${Math.round(result.grasas_estimadas_g ?? 0)} g grasas (confianza ${result.confianza || "media"}). Revisá y ajustá si hace falta.`);
    $("#entry-desc").dataset.aiSource = "1";
  } catch (e) {
    toast("Error de la IA: " + e.message, true);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `🔍 Analizar con IA`;
  }
});

// Convierte una foto pendiente en el formato {base64, mime} que esperan las
// llamadas a la IA. Si la foto es de una comida que se está editando y no
// tenemos la versión completa en memoria (solo el thumbnail guardado en
// Firestore), usamos igual el thumbnail — pierde algo de calidad pero sigue
// siendo mejor que no mandar nada.
function toApiImage(p) {
  if (p.fullBase64) return { base64: p.fullBase64, mime: p.fullMime || "image/jpeg" };
  if (p.thumbBase64) {
    const match = /^data:(.*?);base64,(.*)$/.exec(p.thumbBase64);
    if (match) return { base64: match[2], mime: match[1] || "image/jpeg" };
  }
  return null;
}

function buildAnalysisPrompt(descripcion, pesoAprox, photoCount) {
  let ctx = "";
  if (descripcion) ctx += `El usuario describió el plato así: "${descripcion}". `;
  if (pesoAprox) ctx += `Estima que pesa aproximadamente ${pesoAprox} g. `;
  const intro = photoCount > 0
    ? (photoCount > 1
      ? `Te paso ${photoCount} fotos del mismo plato de comida (distintos ángulos o partes del mismo plato).`
      : "Te paso una foto de un plato de comida.")
    : "No tengo foto del plato — estimá solo a partir de la descripción en texto que te paso a continuación, sin asumir que hay una imagen.";
  const consigna = photoCount > 0 ? "Identificá los alimentos visibles en la(s) foto(s)" : "Identificá los alimentos mencionados en la descripción";
  return `Sos un asistente nutricional para alguien que vive en Argentina. ${intro} ${ctx}
${consigna}, estimá el peso total en gramos, las calorías totales aproximadas (kcal) y los gramos totales de grasa aproximados, usando valores nutricionales estándar y, cuando corresponda, equivalencias de productos y porciones típicas argentinas (fetas de fiambre, galletas de arroz, milanesas, etc.).
Respondé EXCLUSIVAMENTE con un JSON con este formato exacto, sin texto adicional, sin markdown, sin comentarios:
{"alimentos": "descripción corta en español, ej: milanesa de pollo con puré y ensalada", "peso_aproximado_g": numero, "kcal_estimadas": numero, "grasas_estimadas_g": numero, "confianza": "alta" o "media" o "baja"}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Extrae el JSON de la respuesta de texto de Gemini. Normalmente ya viene
// limpio (responseMimeType: "application/json"), pero por las dudas si algo
// lo envuelve en texto probamos recortar entre la primera { y la última }.
function extractJSON(text) {
  try { return JSON.parse(text); } catch (_) {}
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch (_) {}
  }
  throw new Error("no pude interpretar la respuesta de la IA");
}

async function callGemini(model, images, promptText, apiKey) {
  const parts = [
    { text: promptText },
    ...images.map((img) => ({ inline_data: { mime_type: img.mime, data: img.base64 } })),
  ];
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
  if (!text) throw new Error("respuesta vacía de Gemini, probá de nuevo");
  return extractJSON(text);
}

async function analyzeFoodWithAI({ images, descripcion, pesoAprox, geminiKey }) {
  if (!images.length && !descripcion) throw new Error("Sacá una foto o escribí una descripción primero.");
  if (!geminiKey) throw new Error("Cargá tu API key de Gemini en Ajustes.");
  const promptText = buildAnalysisPrompt(descripcion, pesoAprox, images.length);

  // Reintentamos solo cuando Gemini responde "saturado" (503): dos intentos
  // con el modelo principal y, si sigue sin responder, uno con un modelo
  // más liviano que suele tener más disponibilidad. Cualquier otro error
  // (API key inválida, sin conexión, etc.) corta al toque, sin reintentar.
  const attempts = [
    { model: GEMINI_MODEL, delay: 0 },
    { model: GEMINI_MODEL, delay: 1800 },
    { model: GEMINI_FALLBACK_MODEL, delay: 0 },
  ];

  let lastErr = null;
  for (let i = 0; i < attempts.length; i++) {
    const { model, delay } = attempts[i];
    if (delay) await sleep(delay);
    try {
      return await callGemini(model, images, promptText, geminiKey);
    } catch (e) {
      lastErr = e;
      const isLastAttempt = i === attempts.length - 1;
      if (e.status !== 503 || isLastAttempt) {
        if (e.status === 503) throw new Error("Gemini está saturado ahora mismo. Probá de nuevo en un minuto, o cargá la comida a mano.");
        throw e;
      }
    }
  }
  throw lastErr || new Error("No se pudo analizar, probá de nuevo.");
}

// guardar / borrar
$("#entry-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const mealType = mealSeg.querySelector("button.active")?.dataset.meal;
  const kcalRaw = $("#entry-kcal").value;
  if (kcalRaw === "") { toast("Poné un valor de kcal (o analizalo con IA)", true); return; }
  const kcal = Number(kcalRaw);

  const fatRaw = $("#entry-fat").value;
  const payload = {
    date: selectedDate,
    mealType,
    description: $("#entry-desc").value.trim(),
    weightGrams: $("#entry-weight").value ? Number($("#entry-weight").value) : null,
    kcal,
    fatGrams: fatRaw !== "" ? Number(fatRaw) : null,
    kcalSource: $("#entry-desc").dataset.aiSource ? "ia" : "manual",
    hasVeggies: $("#chk-veggies").checked,
    hasProtein: $("#chk-protein").checked,
    hasComplexCarb: $("#chk-carb").checked,
    notes: $("#entry-notes").value.trim(),
    photoThumbs: pendingPhotos.length ? pendingPhotos.map((p) => p.thumbBase64) : null,
    photoThumb: null, // campo viejo (foto única); lo dejamos en null para no confundir lecturas anteriores
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

/**
 * SOLARIS — script.js
 * Handles: theme management, sun progress bar, location search, 20-day table
 */

"use strict";

/* ============================================================
   CONSTANTS & STATE
   ============================================================ */

const SUNRISE_API  = "https://api.sunrise-sunset.org/json";
const NOMINATIM    = "https://nominatim.openstreetmap.org/search";
const TIMEZONE_API = "https://timeapi.io/api/TimeZone/coordinate";

const DEFAULT_LAT  = -33.8688;   // Sydney fallback
const DEFAULT_LNG  = 151.2093;
const DEFAULT_TZ   = "Australia/Sydney";

const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

let state = {
  userLat:  null,
  userLng:  null,
  userTZ:   Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TZ,
  searchLat: null,
  searchLng: null,
  searchTZ:  null,
  searchName: null,
  sunriseUTC: null,
  sunsetUTC:  null,
};

/* ============================================================
   UTILITY FUNCTIONS
   ============================================================ */

function formatDateNumeric(date) {
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${d}/${m}`;
}

function formatDOW(date) {
  return DOW[date.getDay()];
}

function formatTime(utcString, timeZone) {
  const d = new Date(utcString);
  if (isNaN(d)) return "—";
  return d.toLocaleTimeString([], {
    hour:     "2-digit",
    minute:   "2-digit",
    hour12:   false,
    timeZone: timeZone,
  });
}

function formatDayLength(seconds) {
  if (!seconds || isNaN(seconds)) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function isoDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function shortTZ(tz) {
  // Shorten "America/New_York" → "New York", etc.
  if (!tz) return "";
  return tz.split("/").pop().replace(/_/g, " ");
}

/* ============================================================
   1. THEME MANAGEMENT
   ============================================================ */

const THEME_MODES = ["Auto", "Day", "Night"];
let themeMode = localStorage.getItem("solarisTheme") || "Auto";

function applyTheme() {
  let effective = themeMode;
  if (themeMode === "Auto") {
    effective = autoThemeFromTime();
  }
  document.body.classList.remove("theme-day", "theme-night");
  if (effective === "Night") {
    document.body.classList.add("theme-night");
  }
  // Day is the default (no class needed)
}

function autoThemeFromTime() {
  // If we have sunrise/sunset for user location, use those
  const now = Date.now();
  if (state.sunriseUTC && state.sunsetUTC) {
    const sr = new Date(state.sunriseUTC).getTime();
    const ss = new Date(state.sunsetUTC).getTime();
    return (now >= sr && now <= ss) ? "Day" : "Night";
  }
  // Fallback: 07:00–19:00 local = Day
  const h = new Date().getHours();
  return (h >= 7 && h < 19) ? "Day" : "Night";
}

function updateThemeButton() {
  const btn = document.getElementById("theme-toggle");
  if (btn) btn.textContent = themeMode;
}

function initTheme() {
  updateThemeButton();
  applyTheme();

  const btn = document.getElementById("theme-toggle");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const idx = THEME_MODES.indexOf(themeMode);
    themeMode = THEME_MODES[(idx + 1) % THEME_MODES.length];
    localStorage.setItem("solarisTheme", themeMode);
    updateThemeButton();
    applyTheme();
  });
}

/* ============================================================
   2. SUN PROGRESS BAR
   ============================================================ */

async function initSunbar() {
  // Try geolocation, fall back to default
  try {
    const pos = await getUserPosition();
    state.userLat = pos.coords.latitude;
    state.userLng = pos.coords.longitude;
  } catch {
    state.userLat = DEFAULT_LAT;
    state.userLng = DEFAULT_LNG;
  }

  try {
    const data = await fetchSunData(state.userLat, state.userLng, "today");
    if (!data || data.status !== "OK") throw new Error("Bad response");

    state.sunriseUTC = data.results.sunrise;
    state.sunsetUTC  = data.results.sunset;

    renderSunbar();
    // Re-apply Auto theme now that we have real sunrise/sunset data
    if (themeMode === "Auto") applyTheme();
  } catch (err) {
    console.warn("Sunbar: could not fetch data", err);
    setElement("sunbar-progress-text", "Sun data unavailable");
  }
}

function getUserPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("No geolocation"));
    navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 6000 });
  });
}

function renderSunbar() {
  const tz = state.userTZ;
  const srTime = formatTime(state.sunriseUTC, tz);
  const ssTime = formatTime(state.sunsetUTC, tz);

  setElement("sunrise-time", srTime);
  setElement("sunset-time",  ssTime);

  const now     = Date.now();
  const sunrise = new Date(state.sunriseUTC).getTime();
  const sunset  = new Date(state.sunsetUTC).getTime();
  const progress = clamp((now - sunrise) / (sunset - sunrise), 0, 1);
  const pct = (progress * 100).toFixed(1);

  const fill = document.getElementById("sunbar-fill");
  const icon = document.getElementById("sun-icon");
  if (fill) fill.style.width = `${pct}%`;

  // Sun icon: keep within track bounds with slight padding
  const iconPct = clamp(progress * 100, 2, 98);
  if (icon) icon.style.left = `${iconPct}%`;

  // Progress text
  let label;
  if (now < sunrise) {
    label = `Before sunrise · ${srTime}`;
  } else if (now > sunset) {
    label = `After sunset · ${ssTime}`;
  } else {
    const remaining = sunset - now;
    const hRem = Math.floor(remaining / 3600000);
    const mRem = Math.floor((remaining % 3600000) / 60000);
    label = `${pct}% through the day · ${hRem}h ${mRem}m until sunset`;
  }

  // Location label: show timezone short name
  setElement("sunbar-location-label", `Your location · ${shortTZ(tz)}`);
}

/* ============================================================
   3. LOCATION SEARCH
   ============================================================ */

function initSearch() {
  const btn   = document.getElementById("search-btn");
  const input = document.getElementById("location-input");
  if (!btn || !input) return;

  btn.addEventListener("click", () => handleSearch());
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleSearch();
  });
}

async function handleSearch() {
  const input = document.getElementById("location-input");
  const query = input ? input.value.trim() : "";
  if (!query) return;

  setSearchError("");
  setSearchLoading(true);
  showLoadingRows();

  try {
    // 1. Geocode
    const geo = await geocode(query);
    if (!geo) throw new Error("Location not found. Try a different city name.");

    state.searchLat  = parseFloat(geo.lat);
    state.searchLng  = parseFloat(geo.lon);
    state.searchName = extractCityName(geo.display_name);

    // 2. Get timezone for that location
    const tz = await getTimezone(state.searchLat, state.searchLng);
    state.searchTZ = tz;

    // 3. Build 20-day table
    await buildTable();

  } catch (err) {
    setSearchError(err.message || "Something went wrong. Please try again.");
    clearTable();
  } finally {
    setSearchLoading(false);
  }
}

async function geocode(query) {
  const url = `${NOMINATIM}?q=${encodeURIComponent(query)}&format=json&limit=1`;
  const res = await fetch(url, {
    headers: { "Accept-Language": "en" }
  });
  if (!res.ok) throw new Error("Geocoding failed.");
  const data = await res.json();
  if (!data || data.length === 0) return null;
  return data[0];
}

function extractCityName(displayName) {
  if (!displayName) return "Unknown";
  // Take the first component (usually city or town)
  return displayName.split(",")[0].trim();
}

async function getTimezone(lat, lng) {
  try {
    const url = `${TIMEZONE_API}?latitude=${lat}&longitude=${lng}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error();
    const data = await res.json();
    if (data && data.timeZone) return data.timeZone;
  } catch {
    // ignore
  }
  // Fallback: rough offset from longitude (±15° per hour)
  const offsetHours = Math.round(lng / 15);
  return `Etc/GMT${offsetHours <= 0 ? "+" + Math.abs(offsetHours) : "-" + offsetHours}`;
}

/* ============================================================
   4. 20-DAY TABLE
   ============================================================ */

async function buildTable() {
  const tbody = document.getElementById("table-body");
  if (!tbody) return;

  // Update subtitle
  setElement("table-subtitle", `${state.searchName} · ${shortTZ(state.searchTZ)}`);

  const today  = new Date();
  const rows   = [];
  const fetches = [];

  for (let i = 0; i < 20; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    fetches.push(
      fetchSunData(state.searchLat, state.searchLng, isoDateString(d))
        .then(data => ({ day: i, date: d, data }))
        .catch(() => ({ day: i, date: d, data: null }))
    );
  }

  const results = await Promise.all(fetches);

  // Sort by day index (Promise.all preserves order but let's be safe)
  results.sort((a, b) => a.day - b.day);

  tbody.innerHTML = "";

  for (const { day, date, data } of results) {
    const tr = document.createElement("tr");
    if (day === 0) tr.classList.add("today-row");

    let srSearched = "—", srUser = "—", ssSearched = "—", ssUser = "—", dayLen = "—";

    if (data && data.status === "OK") {
      srSearched = formatTime(data.results.sunrise, state.searchTZ);
      srUser     = formatTime(data.results.sunrise, state.userTZ);
      ssSearched = formatTime(data.results.sunset,  state.searchTZ);
      ssUser     = formatTime(data.results.sunset,  state.userTZ);
      dayLen     = formatDayLength(data.results.day_length);
    }

    const searchedTZShort = shortTZ(state.searchTZ);
    const userTZShort     = shortTZ(state.userTZ);

    tr.innerHTML = `
      <td>
        <div class="date-col">${formatDateNumeric(date)}</div>
        <span class="date-dow">${formatDOW(date)}</span>
      </td>
      <td>
	<span class="cell-line-1">${escapeHtml(state.searchName)} (${escapeHtml(searchedTZShort)})</span>
	<span class="cell-line-2">Your location (${escapeHtml(userTZShort)})</span>
      </td>
      <td>
        <span class="cell-line-1">${srSearched}</span>
        <span class="cell-line-2">${srUser}</span>
      </td>
      <td>
        <span class="cell-line-1">${ssSearched}</span>
        <span class="cell-line-2">${ssUser}</span>
      </td>
      <td>
        <span class="daylength-col">${dayLen}</span>
      </td>
    `;
    rows.push(tr);
  }

  // Render rows in one shot
  tbody.append(...rows);
}

async function fetchSunData(lat, lng, date) {
  const url = `${SUNRISE_API}?lat=${lat}&lng=${lng}&date=${date}&formatted=0`;
  const res  = await fetch(url);
  if (!res.ok) throw new Error("Sunrise API error");
  return res.json();
}

/* ============================================================
   5. UI HELPERS
   ============================================================ */

function setElement(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setSearchError(msg) {
  const el = document.getElementById("search-error");
  if (!el) return;
  el.textContent = msg;
  el.hidden = !msg;
}

function setSearchLoading(loading) {
  const btn     = document.getElementById("search-btn");
  const spinner = document.getElementById("search-spinner");
  const text    = btn && btn.querySelector(".search-btn-text");
  if (spinner) spinner.hidden = !loading;
  if (text)    text.textContent = loading ? "Searching…" : "Search";
  if (btn)     btn.disabled = loading;
}

function showLoadingRows() {
  const tbody = document.getElementById("table-body");
  if (!tbody) return;
  tbody.innerHTML = "";
  for (let i = 0; i < 8; i++) {
    const tr = document.createElement("tr");
    tr.className = "loading-row";
    tr.innerHTML = `
      <td><div class="loading-shimmer" style="width:40px"></div></td>
      <td><div class="loading-shimmer" style="width:110px"></div></td>
      <td><div class="loading-shimmer" style="width:55px"></div></td>
      <td><div class="loading-shimmer" style="width:55px"></div></td>
      <td><div class="loading-shimmer" style="width:55px"></div></td>
    `;
    tbody.appendChild(tr);
  }
}

function clearTable() {
  const tbody = document.getElementById("table-body");
  if (!tbody) return;
  tbody.innerHTML = `
    <tr class="table-empty-row">
      <td colspan="5">
        <div class="empty-state">
          <div class="empty-icon">◌</div>
          <div>No results — try another city</div>
        </div>
      </td>
    </tr>
  `;
}

function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* ============================================================
   INIT
   ============================================================ */

document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initSearch();

  // Only run sunbar on index.html (has sunbar-track element)
  if (document.getElementById("sunbar-track")) {
    initSunbar();
  }

  // Update sunbar every 60 seconds
  setInterval(() => {
    if (state.sunriseUTC && state.sunsetUTC) renderSunbar();
    if (themeMode === "Auto") applyTheme();
  }, 60_000);
});

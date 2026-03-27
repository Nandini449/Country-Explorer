/* ── Tab switching ───────────────────────────────────────────────────────── */
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach((t) => t.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");

    if (btn.dataset.tab === "favorites") loadFavorites();
    if (btn.dataset.tab === "iss")       initISSTab();
  });
});

/* ── Helpers ─────────────────────────────────────────────────────────────── */
const fmt = (n) => Number(n).toLocaleString();

function show(el)  { el.classList.remove("hidden"); }
function hide(el)  { el.classList.add("hidden"); }

/* ── Country search ──────────────────────────────────────────────────────── */
let currentCountry = null;

async function searchCountry() {
  const name  = document.getElementById("countryInput").value.trim();
  const errEl = document.getElementById("countryError");
  const card  = document.getElementById("countryCard");
  const saveMsg = document.getElementById("saveMsg");

  hide(errEl); hide(card); hide(saveMsg);
  if (!name) { errEl.textContent = "Please enter a country name."; show(errEl); return; }

  try {
    const res  = await fetch(`/api/country/${encodeURIComponent(name)}`);
    const data = await res.json();

    if (!res.ok) { errEl.textContent = data.error || "Country not found."; show(errEl); return; }

    currentCountry = data;

    document.getElementById("flagImg").src        = data.flag_url;
    document.getElementById("flagImg").alt        = data.flag_alt || `${data.name} flag`;
    document.getElementById("countryName").textContent  = data.name;
    document.getElementById("officialName").textContent = data.official;
    document.getElementById("capital").textContent      = data.capital;
    document.getElementById("population").textContent   = fmt(data.population);
    document.getElementById("region").textContent       = data.region;
    document.getElementById("subregion").textContent    = data.subregion;
    document.getElementById("area").textContent         = `${fmt(data.area)} km²`;
    document.getElementById("languages").textContent    = data.languages.join(", ") || "N/A";
    document.getElementById("currencies").textContent   = data.currencies.join(", ") || "N/A";
    document.getElementById("timezones").textContent    = data.timezones.join(", ") || "N/A";

    show(card);
  } catch {
    errEl.textContent = "Network error. Please try again.";
    show(errEl);
  }
}

document.getElementById("searchBtn").addEventListener("click", searchCountry);
document.getElementById("countryInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") searchCountry();
});

/* ── Save favorite ───────────────────────────────────────────────────────── */
document.getElementById("saveBtn").addEventListener("click", async () => {
  if (!currentCountry) return;
  const saveMsg = document.getElementById("saveMsg");
  hide(saveMsg);

  const res  = await fetch("/api/favorites", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name:       currentCountry.name,
      capital:    currentCountry.capital,
      population: currentCountry.population,
      flag_url:   currentCountry.flag_url,
      region:     currentCountry.region,
    }),
  });

  const data = await res.json();
  saveMsg.textContent = data.message || data.error;
  saveMsg.className   = `save-msg ${res.ok ? "ok" : "err"}`;
  show(saveMsg);
});

/* ── Favorites ───────────────────────────────────────────────────────────── */
async function loadFavorites() {
  const list  = document.getElementById("favoritesList");
  const noFav = document.getElementById("noFavs");
  const errEl = document.getElementById("favoritesError");

  list.innerHTML = "";
  hide(errEl);

  try {
    const res  = await fetch("/api/favorites");
    const data = await res.json();

    if (!data.length) { show(noFav); return; }
    hide(noFav);

    data.forEach((fav) => {
      const card = document.createElement("div");
      card.className = "fav-card";
      card.innerHTML = `
        <img src="${fav.flag_url}" alt="${fav.name} flag" loading="lazy" />
        <h3>${fav.name}</h3>
        <p>&#127961; ${fav.capital}</p>
        <p>&#128101; ${fmt(fav.population)}</p>
        <p>&#127758; ${fav.region}</p>
        <button class="del-btn" data-id="${fav.id}">Remove</button>
      `;
      list.appendChild(card);
    });

    list.querySelectorAll(".del-btn").forEach((btn) => {
      btn.addEventListener("click", () => deleteFavorite(btn.dataset.id));
    });
  } catch {
    errEl.textContent = "Could not load favorites.";
    show(errEl);
  }
}

async function deleteFavorite(id) {
  await fetch(`/api/favorites/${id}`, { method: "DELETE" });
  loadFavorites();
}

/* ── ISS tracker ─────────────────────────────────────────────────────────── */
let issMap    = null;
let issMarker = null;
let issTimer  = null;

function initISSTab() {
  if (!issMap) {
    issMap = L.map("issMap").setView([0, 0], 2);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: "© OpenStreetMap contributors",
    }).addTo(issMap);

    const issIcon = L.divIcon({
      html: '<div style="font-size:2rem;line-height:1;">&#128752;</div>',
      className: "",
      iconSize:  [36, 36],
      iconAnchor:[18, 18],
    });
    issMarker = L.marker([0, 0], { icon: issIcon }).addTo(issMap);
  }
  fetchISS();
  if (!issTimer) issTimer = setInterval(fetchISS, 5000);
}

async function fetchISS() {
  try {
    const res  = await fetch("/api/iss");
    const data = await res.json();
    if (!res.ok) return;

    const { latitude: lat, longitude: lon, timestamp } = data;
    document.getElementById("issLat").textContent  = lat.toFixed(4) + "°";
    document.getElementById("issLon").textContent  = lon.toFixed(4) + "°";
    document.getElementById("issTime").textContent =
      new Date(timestamp * 1000).toLocaleTimeString();

    issMarker.setLatLng([lat, lon]);
    issMap.panTo([lat, lon]);
  } catch { /* silent */ }
}

document.getElementById("refreshIss").addEventListener("click", fetchISS);

/* stop auto-refresh when user leaves the ISS tab */
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (btn.dataset.tab !== "iss" && issTimer) {
      clearInterval(issTimer);
      issTimer = null;
    }
  });
});

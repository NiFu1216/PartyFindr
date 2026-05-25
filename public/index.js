/**
 * PartyFindr frontend — vanilla JS hash router + Leaflet map.
 * Pages: #/ , #/login , #/register , #/map , #/host , #/profile
 */

let ageFilter = { min: 16, max: 99 };
let currentUser = null;
let activeMap = null; // Leaflet map instance, destroyed on route change

// ---------- UI helpers ----------
function toast(msg, isError) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = "toast" + (isError ? " error" : "");
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.hidden = true), 3000);
}

function render(templateId) {
  const tpl = document.getElementById(templateId);
  const app = document.getElementById("app");
  app.innerHTML = "";
  app.appendChild(tpl.content.cloneNode(true));
  if (activeMap) { activeMap.remove(); activeMap = null; }
}

function updateNav() {
  document.getElementById("nav-login").hidden = !!currentUser;
  document.getElementById("nav-logout").hidden = !currentUser;
}

// ---------- Router ----------
const routes = {
  "/":         renderHome,
  "/login":    renderLogin,
  "/register": renderRegister,
  "/map":      renderMap,
  "/host":     renderHost,
  "/profile":  renderProfile,
};

async function router() {
  const path = location.hash.replace(/^#/, "") || "/";
  const handler = routes[path] || renderHome;
  await handler();
}
window.addEventListener("hashchange", router);

// Intercept data-link clicks so the hash updates cleanly
document.addEventListener("click", (e) => {
  const a = e.target.closest("a[data-link]");
  if (a) {
    e.preventDefault();
    location.hash = a.getAttribute("href").replace(/^#/, "");
  }
});

document.getElementById("nav-logout").addEventListener("click", () => {
  tokenStore.clear();
  currentUser = null;
  updateNav();
  location.hash = "/";
  toast("Logged out");
  document.getElementById("get-started").style.display = "block";
  document.getElementById("alr-have-acc").style.display = "block";
});

// ---------- Pages ----------
function renderHome() {
  render("tpl-home");
  if(currentUser) {
    document.getElementById("get-started").style.display = "none";
    document.getElementById("alr-have-acc").style.display = "none";
  } else {
    document.getElementById("get-started").style.display = "block";
    document.getElementById("alr-have-acc").style.display = "block";
  }
}

function renderLogin() {
  render("tpl-login");
  document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const { token, user } = await api.login({
        email: fd.get("email"), password: fd.get("password"),
      });
      tokenStore.set(token);
      currentUser = user;
      updateNav();
      toast("Welcome back!");
      location.hash = "/map";
    } catch (err) { toast(err.message, true); }
  });
}

function renderRegister() {
  render("tpl-register");
  document.getElementById("register-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const { token, user } = await api.register({
        email: fd.get("email"),
        password: fd.get("password"),
        dob: fd.get("dob"),
        attested: fd.get("attested") === "on",
      });
      tokenStore.set(token);
      currentUser = user;
      updateNav();
      toast("Account created 🎉");
      location.hash = "/map";
    } catch (err) { toast(err.message, true); }
  });
}

async function renderMap() {
  if (!currentUser) { location.hash = "/login"; return; }
  render("tpl-map");

  // restore current filter values
  document.getElementById("filter-min-age").value = ageFilter.min;
  document.getElementById("filter-max-age").value = ageFilter.max;

  const map = L.map("map").setView([48.2082, 16.3738], 12);
  activeMap = map;
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    { attribution: "© OpenStreetMap" }).addTo(map);

  // Try to center on user location
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => map.setView([pos.coords.latitude, pos.coords.longitude], 13),
      () => {}, { timeout: 5000 }
    );
  }

  let parties = [];
  try { parties = await api.listParties(); }
  catch (err) { toast(err.message, true); return; }

  const visible = parties.filter(p =>
    p.attendeeIds.length < p.capacity &&
    currentUser.age >= p.minAge &&
    currentUser.age <= p.maxAge &&
    p.maxAge >= ageFilter.min &&
    p.minAge <= ageFilter.max
  );

  document.getElementById("map-summary").textContent =
    `Showing ${visible.length} of ${parties.length} parties matched to your age (${currentUser.age}).`;

  const list = document.getElementById("party-list");
  list.innerHTML = "";

  for (const p of visible) {
    const weather = await fetchWeather(p.lat, p.lng);
    const weatherBadge = weather
    ? `<span class="weather">${weatherEmoji(weather.weather_code)} ${Math.round(weather.temperature_2m)}°C</span>`
    : "";
    const marker = L.marker([p.lat, p.lng]).addTo(map);
    marker.bindPopup(popupHtml(p, weatherBadge));
    marker.on("popupopen", () => wireAttendButtons(p));

    const card = document.createElement("div");
    card.className = "party-card";
    card.innerHTML = cardHtml(p, weatherBadge);
    list.appendChild(card);
    card.querySelector("button")?.addEventListener("click", () => attend(p.id));
  }

  document.getElementById("apply-filter").addEventListener("click", () => {
    const min = parseInt(document.getElementById("filter-min-age").value, 10);
    const max = parseInt(document.getElementById("filter-max-age").value, 10);

    ageFilter.min = min;
    ageFilter.max = max;

    renderMap(); // re-render everything
  });
}

function popupHtml(p, weatherBadge) {
  const spots = p.capacity - p.attendeeIds.length;
  const attending = p.attendeeIds.includes(currentUser.id);
  return `<div class="popup-content">
    <strong>${escapeHtml(p.title)}</strong> <span class="weather">${weatherBadge}</span><br/>
    <small>Hosted by ${escapeHtml(p.hostName)}</small>
    <p>${escapeHtml(p.description)}</p>
    <div class="muted">${new Date(p.startsAt).toLocaleString()}</div>
    <div class="muted">${p.attendeeIds.length}/${p.capacity} attending • Ages ${p.minAge}–${p.maxAge}</div>
    ${attending
      ? `<span class="badge">You're attending</span>`
      : `<button class="btn primary" data-attend="${p.id}" ${spots <= 0 ? "disabled" : ""}>Attend party (${spots} left)</button>`}
  </div>`;
}

function cardHtml(p, weatherBadge) {
  const spots = p.capacity - p.attendeeIds.length;
  const attending = p.attendeeIds.includes(currentUser.id);
  return `<h3>${escapeHtml(p.title)} <span class="weather muted">${weatherBadge}</span></h3>
    <div class="meta">${escapeHtml(p.description)}</div>
    <div class="meta">📅 ${new Date(p.startsAt).toLocaleString()}</div>
    <div class="meta">👥 ${p.attendeeIds.length}/${p.capacity} • Ages ${p.minAge}–${p.maxAge}</div>
    ${attending
      ? `<span class="badge">You're attending</span>`
      : `<button class="btn primary" ${spots <= 0 ? "disabled" : ""}>Attend (${spots} left)</button>`}`;
}

function wireAttendButtons(party) {
  document.querySelectorAll("[data-attend]").forEach(btn => {
    btn.addEventListener("click", () => attend(btn.dataset.attend), { once: true });
  });
}

async function attend(id) {
  try {
    await api.attendParty(id);
    toast("You're attending! 🎉");
    renderMap();
  } catch (err) { toast(err.message, true); }
}

async function renderHost() {
  if (!currentUser) { location.hash = "/login"; return; }
  render("tpl-host");

  const map = L.map("host-map").setView([48.2082, 16.3738], 12);
  activeMap = map;
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    { attribution: "© OpenStreetMap" }).addTo(map);
  let pin = null;
  const form = document.getElementById("host-form");

  map.on("click", (e) => {
    if (pin) pin.remove();
    pin = L.marker(e.latlng).addTo(map);
    form.lat.value = e.latlng.lat;
    form.lng.value = e.latlng.lng;
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!form.lat.value) return toast("Click on the map to set the location.", true);
    const fd = new FormData(form);
    try {
      await api.createParty({
        title: fd.get("title"),
        description: fd.get("description"),
        lat: parseFloat(fd.get("lat")),
        lng: parseFloat(fd.get("lng")),
        startsAt: new Date(fd.get("startsAt")).toISOString(),
        capacity: parseInt(fd.get("capacity"), 10),
        minAge: parseInt(fd.get("minAge"), 10),
        maxAge: parseInt(fd.get("maxAge"), 10),
      });
      toast("Party published! 🎉");
      location.hash = "/map";
    } catch (err) { toast(err.message, true); }
  });
}

async function renderProfile() {
  if (!currentUser) { location.hash = "/login"; return; }
  render("tpl-profile");
  document.getElementById("profile-info").innerHTML = `
    <p><strong>${escapeHtml(currentUser.email)}</strong></p>
    <p class="muted">Age: ${currentUser.age} • DOB: ${currentUser.dob}</p>`;

  try {
    const attended = await api.myAttended();
    const list = document.getElementById("attended-list");
    if (!attended.length) {
      list.innerHTML = `<p class="muted">You haven't joined any parties yet.</p>`;
      return;
    }
    list.innerHTML = "";
    for (const p of attended) {
      const card = document.createElement("div");
      card.className = "party-card";
      card.innerHTML = `<h3>${escapeHtml(p.title)}</h3>
        <div class="meta">📅 ${new Date(p.startsAt).toLocaleString()}</div>
        <div class="meta">👥 ${p.attendeeIds.length}/${p.capacity}</div>
        <span class="badge">Attending</span>`;
      list.appendChild(card);
    }
  } catch (err) { toast(err.message, true); }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// ---------- Boot ----------
(async function init() {
  if (tokenStore.get()) {
    try { currentUser = await api.me(); }
    catch { tokenStore.clear(); }
  }
  updateNav();
  router();
})();

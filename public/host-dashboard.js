let dashboardUser = null;

function dashboardToast(msg, isError) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = "toast" + (isError ? " error" : "");
  t.hidden = false;
  clearTimeout(dashboardToast._t);
  dashboardToast._t = setTimeout(() => (t.hidden = true), 3000);
}

function closeNavMenu() {
  document.getElementById("nav-links").classList.remove("open");
  document.getElementById("nav-toggle").setAttribute("aria-expanded", "false");
}

document.getElementById("nav-toggle").addEventListener("click", (e) => {
  e.stopPropagation();
  const nav = document.getElementById("nav-links");
  const isOpen = nav.classList.toggle("open");
  e.currentTarget.setAttribute("aria-expanded", String(isOpen));
});

document.addEventListener("click", (e) => {
  if (!e.target.closest(".navbar")) closeNavMenu();
});

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function toLocalInputValue(value) {
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function formDataToParty(form) {
  const fd = new FormData(form);
  return {
    title: fd.get("title"),
    description: fd.get("description"),
    lat: parseFloat(fd.get("lat")),
    lng: parseFloat(fd.get("lng")),
    startsAt: new Date(fd.get("startsAt")).toISOString(),
    capacity: parseInt(fd.get("capacity"), 10),
    minAge: parseInt(fd.get("minAge"), 10),
    maxAge: parseInt(fd.get("maxAge"), 10),
  };
}

function setDashboardState() {
  document.getElementById("dashboard-login").hidden = !!dashboardUser;
  document.getElementById("dashboard-app").hidden = !dashboardUser;
  document.getElementById("dashboard-logout").hidden = !dashboardUser;
}

async function loadDashboard() {
  setDashboardState();
  if (!dashboardUser) return;

  const summary = document.getElementById("dashboard-summary");
  const list = document.getElementById("dashboard-list");
  summary.textContent = "Loading your hosted parties...";
  list.innerHTML = "";

  let parties = [];
  try {
    parties = await api.listParties();
  } catch (err) {
    dashboardToast(err.message, true);
    return;
  }

  const hosted = parties.filter(p => p.hostId === dashboardUser.id);
  const totalGuests = hosted.reduce((sum, p) => sum + p.attendeeIds.length, 0);
  summary.innerHTML = `<strong>${hosted.length}</strong> hosted parties &middot; <strong>${totalGuests}</strong> total attendees`;

  if (!hosted.length) {
    list.innerHTML = `<p class="muted">You have not hosted any parties yet.</p>`;
    return;
  }

  hosted.forEach(party => {
    const card = document.createElement("article");
    card.className = "party-card dashboard-card";
    card.innerHTML = `
      <h2>${escapeHtml(party.title)}</h2>
      <p class="meta">${escapeHtml(party.description)}</p>
      <p class="meta">${party.attendeeIds.length}/${party.capacity} attending</p>
      <form class="dashboard-form" data-id="${party.id}">
        <label>Title <input name="title" value="${escapeHtml(party.title)}" required></label>
        <label>Starts at <input name="startsAt" type="datetime-local" value="${toLocalInputValue(party.startsAt)}" required></label>
        <label>Description <textarea name="description" rows="3" required>${escapeHtml(party.description)}</textarea></label>
        <label>Latitude <input name="lat" type="number" step="any" value="${party.lat}" required></label>
        <label>Longitude <input name="lng" type="number" step="any" value="${party.lng}" required></label>
        <label>Capacity <input name="capacity" type="number" min="2" max="200" value="${party.capacity}" required></label>
        <label>Min age <input name="minAge" type="number" min="16" max="99" value="${party.minAge}" required></label>
        <label>Max age <input name="maxAge" type="number" min="16" max="99" value="${party.maxAge}" required></label>
        <div class="row dashboard-actions">
          <button class="btn primary" type="submit">Save</button>
          <button class="btn ghost" type="button" data-delete="${party.id}">Delete</button>
        </div>
      </form>`;
    list.appendChild(card);
  });
}

document.getElementById("dashboard-login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    const { token, user } = await api.login({
      email: fd.get("email"),
      password: fd.get("password"),
    });
    tokenStore.set(token);
    dashboardUser = user;
    dashboardToast("Logged in");
    loadDashboard();
  } catch (err) {
    dashboardToast(err.message, true);
  }
});

document.getElementById("dashboard-list").addEventListener("submit", async (e) => {
  const form = e.target.closest(".dashboard-form");
  if (!form) return;
  e.preventDefault();

  try {
    const latest = await api.getParty(form.dataset.id);
    await api.updateParty(latest.id, formDataToParty(form));
    dashboardToast("Party updated");
    loadDashboard();
  } catch (err) {
    dashboardToast(err.message, true);
  }
});

document.getElementById("dashboard-list").addEventListener("click", async (e) => {
  const button = e.target.closest("[data-delete]");
  if (!button) return;

  try {
    await api.deleteParty(button.dataset.delete);
    dashboardToast("Party deleted");
    loadDashboard();
  } catch (err) {
    dashboardToast(err.message, true);
  }
});

document.getElementById("dashboard-logout").addEventListener("click", () => {
  tokenStore.clear();
  dashboardUser = null;
  loadDashboard();
});

(async function initDashboard() {
  if (tokenStore.get()) {
    try {
      dashboardUser = await api.me();
    } catch {
      tokenStore.clear();
    }
  }
  loadDashboard();
})();
